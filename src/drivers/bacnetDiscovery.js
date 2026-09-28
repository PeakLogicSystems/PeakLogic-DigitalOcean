'use strict';

const {
  Bacnet,
  resolvePropertyId,
  objectTypeLabel,
  propertyLabel,
  parsePresentValue,
  senderHost,
  suggestTagType,
} = require('./bacnetConstants');
const { BacnetClientWrapper } = require('./bacnetClient');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function discoverDevices(cfg = {}) {
  if (!Bacnet) throw new Error('node-bacnet not installed');
  const client = new BacnetClientWrapper(cfg);
  const ok = await client.connect(cfg);
  if (!ok) throw new Error(client._lastError || 'BACnet bind failed');

  const timeoutMs = Math.min(Math.max(Number(cfg.discoverTimeoutMs) || 5000, 1000), 30000);
  const devices = [];
  const seen = new Set();

  const onIAm = (msg) => {
    const deviceId = msg?.payload?.deviceId;
    if (deviceId == null || seen.has(deviceId)) return;
    seen.add(deviceId);
    const sender = msg?.header?.sender;
    devices.push({
      deviceInstance: deviceId,
      host: senderHost(sender),
      sender,
      maxApdu: msg?.payload?.maxApdu,
      vendorId: msg?.payload?.vendorId,
    });
  };

  client.onIAm(onIAm);
  try {
    client.whoIs(cfg.lowLimit, cfg.highLimit);
    await sleep(timeoutMs);
  } finally {
    client.offIAm(onIAm);
    await client.disconnect();
  }

  const enriched = [];
  for (const dev of devices) {
    let objectName = '';
    let vendorName = '';
    const probe = new BacnetClientWrapper(cfg);
    try {
      await probe.connect(cfg);
      const receiver = dev.sender || dev.host;
      const nameRes = await probe.readProperty(
        receiver,
        { type: Bacnet.enum.ObjectType.DEVICE, instance: dev.deviceInstance },
        Bacnet.enum.PropertyIdentifier.OBJECT_NAME,
      );
      const parsed = parsePresentValue(nameRes);
      if (parsed.ok) objectName = String(parsed.value || '');
      try {
        const vendorRes = await probe.readProperty(
          receiver,
          { type: Bacnet.enum.ObjectType.DEVICE, instance: dev.deviceInstance },
          Bacnet.enum.PropertyIdentifier.VENDOR_NAME,
        );
        const vp = parsePresentValue(vendorRes);
        if (vp.ok) vendorName = String(vp.value || '');
      } catch { /* optional */ }
    } catch {
      /* name optional */
    } finally {
      await probe.disconnect();
    }
    enriched.push({ ...dev, objectName, vendorName, sender: undefined });
  }

  return { devices: enriched, count: enriched.length };
}

async function browseDeviceObjects(cfg = {}) {
  if (!Bacnet) throw new Error('node-bacnet not installed');
  const host = String(cfg.host || '').trim();
  const deviceInstance = Number(cfg.deviceInstance);
  if (!host) throw new Error('host required');
  if (!Number.isFinite(deviceInstance)) throw new Error('deviceInstance required');

  const client = new BacnetClientWrapper(cfg);
  const ok = await client.connect(cfg);
  if (!ok) throw new Error(client._lastError || 'BACnet bind failed');

  const deviceObject = { type: Bacnet.enum.ObjectType.DEVICE, instance: deviceInstance };
  const objectListProp = Bacnet.enum.PropertyIdentifier.OBJECT_LIST;

  try {
    const listRes = await client.readProperty(host, deviceObject, objectListProp);
    const objects = [];
    const entries = listRes?.values || [];
    for (const entry of entries) {
      const oid = entry?.value?.value || entry?.value;
      if (!oid || oid.type == null || oid.instance == null) continue;
      objects.push({ objectType: oid.type, objectInstance: oid.instance });
    }

    const includePresentValue = cfg.includePresentValue !== false;
    const maxObjects = Math.min(Math.max(Number(cfg.maxObjects) || 200, 1), 500);
    const slice = objects.slice(0, maxObjects);
    const points = [];

    for (const obj of slice) {
      let objectName = '';
      let presentValue = null;
      let units = '';
      try {
        const nameRes = await client.readProperty(host, obj, Bacnet.enum.PropertyIdentifier.OBJECT_NAME);
        const np = parsePresentValue(nameRes);
        if (np.ok) objectName = String(np.value || '');
      } catch { /* ignore */ }

      if (includePresentValue) {
        try {
          const pvRes = await client.readProperty(host, obj, Bacnet.enum.PropertyIdentifier.PRESENT_VALUE);
          const pv = parsePresentValue(pvRes);
          if (pv.ok) presentValue = pv.value;
        } catch { /* ignore */ }
        try {
          const uRes = await client.readProperty(host, obj, Bacnet.enum.PropertyIdentifier.UNITS);
          const up = parsePresentValue(uRes);
          if (up.ok) units = propertyLabel(up.value);
        } catch { /* ignore */ }
      }

      points.push({
        deviceInstance,
        host,
        objectType: obj.objectType,
        objectTypeLabel: objectTypeLabel(obj.objectType),
        objectInstance: obj.objectInstance,
        objectName,
        property: resolvePropertyId('presentValue'),
        propertyLabel: 'PRESENT_VALUE',
        presentValue,
        units,
        suggestedTagType: suggestTagType(obj.objectType),
      });
    }

    return {
      host,
      deviceInstance,
      objectCount: objects.length,
      points,
      truncated: objects.length > slice.length,
    };
  } finally {
    await client.disconnect();
  }
}

module.exports = { discoverDevices, browseDeviceObjects };
