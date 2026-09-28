'use strict';

const { QUALITY } = require('../tags/constants');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('./fieldbusPoll');
const {
  normalizeTagAddress,
  parsePresentValue,
  coerceForTag,
  encodeWriteValue,
} = require('./bacnetConstants');
const { BacnetClientWrapper } = require('./bacnetClient');

class BacnetDriver {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.client = new BacnetClientWrapper(cfg);
    this.connected = false;
    this._lastError = '';
  }

  health() {
    return this.client.health();
  }

  async connect(cfg) {
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    this._lastError = '';
    const ok = await this.client.connect(this.cfg);
    this.connected = ok;
    if (!ok) this._lastError = this.client._lastError || 'BACnet bind failed';
    return ok;
  }

  async disconnect() {
    await this.client.disconnect();
    this.connected = false;
  }

  _receiverForTag(addr) {
    if (addr.host) return addr.host;
    if (this.cfg.defaultHost) return this.cfg.defaultHost;
    throw new Error('BACnet tag missing host (set on tag or driver defaultHost)');
  }

  _groupReads(tags) {
    const groups = new Map();
    for (const t of tags) {
      const addr = normalizeTagAddress(t.driverAddress);
      if (addr.objectType == null || addr.objectInstance == null) continue;
      if (!addr.host && !this.cfg.defaultHost) continue;
      const receiver = this._receiverForTag(addr);
      const devInst = addr.deviceInstance ?? Number(this.cfg.deviceInstance);
      const key = `${receiver}|${devInst ?? 'na'}`;
      if (!groups.has(key)) {
        groups.set(key, { receiver, deviceInstance: devInst, items: [] });
      }
      groups.get(key).items.push({ tag: t, addr });
    }
    return [...groups.values()];
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    if (shouldSkipFieldbusPoll(this, this.cfg)) return;

    for (const group of this._groupReads(tags)) {
      const requestArray = group.items.map(({ addr }) => ({
        objectId: { type: addr.objectType, instance: addr.objectInstance },
        properties: [{ id: addr.property }],
      }));

      try {
        let result;
        try {
          result = await this.client.readPropertyMultiple(group.receiver, requestArray);
        } catch {
          result = null;
        }

        if (result?.values?.length) {
          for (let i = 0; i < group.items.length; i += 1) {
            const { tag, addr } = group.items[i];
            const block = result.values[i];
            const propVal = block?.values?.find((v) => v.id === addr.property) || block?.values?.[0];
            const parsed = parsePresentValue({ values: propVal?.value || [] });
            if (parsed.ok) {
              store.setValue(tag.id, coerceForTag(parsed, tag.type), QUALITY.GOOD);
            } else {
              store.setValue(tag.id, store.get(tag.id)?.value ?? 0, QUALITY.BAD);
              this._lastError = parsed.error || 'read failed';
            }
          }
        } else {
          for (const { tag, addr } of group.items) {
            try {
              const res = await this.client.readProperty(
                group.receiver,
                { type: addr.objectType, instance: addr.objectInstance },
                addr.property,
              );
              const parsed = parsePresentValue(res);
              if (parsed.ok) {
                store.setValue(tag.id, coerceForTag(parsed, tag.type), QUALITY.GOOD);
              } else {
                store.setValue(tag.id, store.get(tag.id)?.value ?? 0, QUALITY.BAD);
              }
            } catch (e) {
              this._lastError = e.message;
              store.setValue(tag.id, store.get(tag.id)?.value ?? 0, QUALITY.BAD);
            }
          }
        }
      } catch (e) {
        this._lastError = e.message;
        for (const { tag } of group.items) {
          store.setValue(tag.id, store.get(tag.id)?.value ?? 0, QUALITY.BAD);
        }
      }
    }

    markFieldbusPolled(this);
  }

  async writeBatch(tags, store) {
    if (!this.connected) return;
    if (this.cfg.writeEnabled !== true) {
      this._lastError = 'BACnet writes disabled on driver';
      return;
    }

    for (const t of tags) {
      const addr = normalizeTagAddress(t.driverAddress);
      if (addr.objectType == null || addr.objectInstance == null) continue;
      const receiver = this._receiverForTag(addr);
      const v = store.get(t.id)?.value;
      const values = encodeWriteValue(t.type, v);
      const options = {};
      const priority = addr.priority ?? this.cfg.writePriority;
      if (priority != null && Number.isFinite(Number(priority))) {
        options.priority = Number(priority);
      }
      try {
        await this.client.writeProperty(
          receiver,
          { type: addr.objectType, instance: addr.objectInstance },
          addr.property,
          values,
          options,
        );
      } catch (e) {
        this._lastError = e.message;
      }
    }
  }
}

module.exports = { BacnetDriver };
