'use strict';

const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { parseHostPort } = require('./cameraRegistry');

const MULTICAST_ADDR = '239.255.255.250';
const MULTICAST_PORT = 3702;

/** Enumerate non-internal IPv4 interfaces with their subnet broadcast address. */
function localIpv4Interfaces() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = typeof net.family === 'string' ? net.family : `IPv${net.family}`;
      if (family !== 'IPv4' || net.internal) continue;
      out.push({ name, address: net.address, netmask: net.netmask, broadcast: broadcastForIface(net) });
    }
  }
  return out;
}

/** Compute the subnet-directed broadcast address for an interface. */
function broadcastForIface(net) {
  const ip = String(net?.address || '').split('.').map(Number);
  const mask = String(net?.netmask || '').split('.').map(Number);
  if (ip.length !== 4 || mask.length !== 4 || ip.some(Number.isNaN) || mask.some(Number.isNaN)) return null;
  return ip.map((o, i) => (o & mask[i]) | (~mask[i] & 255)).join('.');
}

function buildProbeMessage() {
  const msgId = crypto.randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${msgId}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
}

function firstTag(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function parseScopes(scopeText) {
  const scopes = String(scopeText || '').split(/\s+/).filter(Boolean);
  const out = { name: '', hardware: '', profiles: [] };
  for (const scope of scopes) {
    if (scope.includes('/name/')) out.name = decodeURIComponent(scope.split('/name/').pop() || '');
    if (scope.includes('/hardware/')) out.hardware = decodeURIComponent(scope.split('/hardware/').pop() || '');
    const prof = scope.match(/\/Profile\/([A-Za-z0-9_-]+)/i);
    if (prof) out.profiles.push(prof[1].toUpperCase());
  }
  return out;
}

function parseProbeMatch(xml, rinfo) {
  const xaddrsRaw = firstTag(xml, 'XAddrs');
  const scopesRaw = firstTag(xml, 'Scopes');
  const endpoint = firstTag(xml, 'Address') || (rinfo ? `uuid:${rinfo.address}` : '');
  const xaddrs = xaddrsRaw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const primary = xaddrs[0] || '';
  const scopeInfo = parseScopes(scopesRaw);
  const { host, port } = parseHostPort(primary || (rinfo?.address || ''));
  const profiles = scopeInfo.profiles;
  const onvifProfile = profiles.includes('T') ? 'T' : (profiles.includes('S') ? 'S' : (profiles[0] || ''));

  let manufacturer = '';
  let model = '';
  if (scopeInfo.hardware) {
    const parts = scopeInfo.hardware.split(/\s+/);
    manufacturer = parts[0] || '';
    model = parts.slice(1).join(' ') || scopeInfo.hardware;
  }

  return {
    endpoint,
    xaddrs,
    onvifUrl: primary,
    host,
    port,
    name: scopeInfo.name || scopeInfo.hardware || host || 'Camera',
    manufacturer,
    model,
    onvifProfile,
    scopes: scopesRaw,
    address: rinfo?.address || host,
  };
}

function dedupeHits(hits) {
  const seen = new Map();
  for (const hit of hits) {
    const key = `${String(hit.host || '').toLowerCase()}|${hit.port || 80}|${String(hit.onvifUrl || '').toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, hit);
  }
  return [...seen.values()];
}

/**
 * ONVIF WS-Discovery probe. Sends from EVERY local IPv4 interface via both
 * multicast (239.255.255.250) and subnet-directed broadcast, so cameras on
 * secondary NICs / Wi-Fi + Ethernet / non-default adapters are still found.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Array<object>>}
 */
function discoverOnvif(opts = {}) {
  const timeoutMs = Math.max(1000, Math.min(15000, Number(opts.timeoutMs) || 4000));
  const probe = Buffer.from(buildProbeMessage(), 'utf8');
  const hits = [];
  const ifaces = localIpv4Interfaces();
  // Always include a wildcard-bound socket as a catch-all.
  const targets = [{ address: '0.0.0.0', broadcast: '255.255.255.255' }, ...ifaces];

  return new Promise((resolve) => {
    const sockets = [];
    let done = false;
    let timer = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      for (const s of sockets) {
        try { s.close(); } catch { /* ignore */ }
      }
      resolve(dedupeHits(hits));
    };

    timer = setTimeout(finish, timeoutMs);

    const onMessage = (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (!/ProbeMatches|XAddrs/i.test(text)) return;
      try {
        hits.push(parseProbeMatch(text, rinfo));
      } catch { /* ignore malformed */ }
    };

    const sendFrom = (iface) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sockets.push(socket);
      socket.on('error', () => { try { socket.close(); } catch { /* ignore */ } });
      socket.on('message', onMessage);
      const bindAddr = iface.address === '0.0.0.0' ? undefined : iface.address;
      socket.bind(0, bindAddr, () => {
        try {
          socket.setBroadcast(true);
          socket.setMulticastTTL(4);
          if (iface.address !== '0.0.0.0') {
            try { socket.setMulticastInterface(iface.address); } catch { /* ignore */ }
            try { socket.addMembership(MULTICAST_ADDR, iface.address); } catch { /* ignore */ }
          } else {
            try { socket.addMembership(MULTICAST_ADDR); } catch { /* ignore */ }
          }
        } catch { /* non-fatal on some hosts */ }
        socket.send(probe, 0, probe.length, MULTICAST_PORT, MULTICAST_ADDR, () => {});
        if (iface.broadcast) {
          socket.send(probe, 0, probe.length, MULTICAST_PORT, iface.broadcast, () => {});
        }
      });
    };

    if (!targets.length) {
      finish();
      return;
    }
    for (const iface of targets) sendFrom(iface);
  });
}

module.exports = {
  discoverOnvif,
  buildProbeMessage,
  parseProbeMatch,
  parseScopes,
  dedupeHits,
  localIpv4Interfaces,
  broadcastForIface,
  MULTICAST_ADDR,
  MULTICAST_PORT,
};
