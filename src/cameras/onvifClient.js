'use strict';

const {
  soapRequest,
  firstTag,
  allTags,
  tagAttr,
  xaddr,
  requestWithDigest,
} = require('./onvifHttp');

const DEVICE_NS = 'http://www.onvif.org/ver10/device/wsdl';
const MEDIA_NS = 'http://www.onvif.org/ver10/media/wsdl';
const DEVICE_ACTION = `${DEVICE_NS}/GetDeviceInformation`;
const CAPS_ACTION = `${DEVICE_NS}/GetCapabilities`;
const PROFILES_ACTION = `${MEDIA_NS}/GetProfiles`;
const STREAM_URI_ACTION = `${MEDIA_NS}/GetStreamUri`;
const SNAPSHOT_URI_ACTION = `${MEDIA_NS}/GetSnapshotUri`;

function mediaProfiles(xml) {
  const blocks = String(xml || '').match(/<(?:[\w-]+:)?Profiles[\s\S]*?<\/(?:[\w-]+:)?Profiles>/gi) || [];
  const fromBlocks = blocks.map((block) => ({
    token: tagAttr(block, 'Profiles', 'token') || tagAttr(block, 'Profile', 'token'),
    name: firstTag(block, 'Name'),
  })).filter((p) => p.token);

  if (fromBlocks.length) return fromBlocks;

  const tokens = [];
  const re = /<(?:[\w-]+:)?Profile[^>]*token=["']([^"']+)["'][^>]*>[\s\S]*?<(?:[\w-]+:)?Name>([^<]*)</gi;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    tokens.push({ token: m[1], name: (m[2] || '').trim() });
  }
  return tokens;
}

function pickProfile(profiles, preferSubstream = true) {
  if (!profiles.length) return null;
  if (preferSubstream) {
    const sub = profiles.find((p) => /sub|secondary|low/i.test(`${p.name} ${p.token}`));
    if (sub) return sub;
  }
  const main = profiles.find((p) => /main|primary|high/i.test(`${p.name} ${p.token}`));
  return main || profiles[0];
}

async function getCapabilities(deviceUrl, creds = {}) {
  const body = `<GetCapabilities xmlns="${DEVICE_NS}"><Category>All</Category></GetCapabilities>`;
  const xml = await soapRequest(deviceUrl, body, CAPS_ACTION, creds);
  return {
    deviceUrl: xaddr(xml, 'Device') || deviceUrl,
    mediaUrl: xaddr(xml, 'Media'),
    ptzUrl: xaddr(xml, 'PTZ'),
    eventsUrl: xaddr(xml, 'Events'),
    imagingUrl: xaddr(xml, 'Imaging'),
    raw: xml,
  };
}

async function getDeviceInformation(deviceUrl, creds = {}) {
  const body = `<GetDeviceInformation xmlns="${DEVICE_NS}"/>`;
  const xml = await soapRequest(deviceUrl, body, DEVICE_ACTION, creds);
  return {
    manufacturer: firstTag(xml, 'Manufacturer'),
    model: firstTag(xml, 'Model'),
    firmware: firstTag(xml, 'FirmwareVersion'),
    serial: firstTag(xml, 'SerialNumber'),
    hardwareId: firstTag(xml, 'HardwareId'),
  };
}

async function getProfiles(mediaUrl, creds = {}) {
  const body = `<GetProfiles xmlns="${MEDIA_NS}"/>`;
  const xml = await soapRequest(mediaUrl, body, PROFILES_ACTION, creds);
  return mediaProfiles(xml);
}

async function getStreamUri(mediaUrl, profileToken, creds = {}) {
  const body = `<GetStreamUri xmlns="${MEDIA_NS}">
  <StreamSetup>
    <Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream>
    <Transport xmlns="http://www.onvif.org/ver10/schema"><Protocol>RTSP</Protocol></Transport>
  </StreamSetup>
  <ProfileToken>${profileToken}</ProfileToken>
</GetStreamUri>`;
  const xml = await soapRequest(mediaUrl, body, STREAM_URI_ACTION, creds);
  return firstTag(xml, 'Uri');
}

async function getSnapshotUri(mediaUrl, profileToken, creds = {}) {
  const body = `<GetSnapshotUri xmlns="${MEDIA_NS}"><ProfileToken>${profileToken}</ProfileToken></GetSnapshotUri>`;
  const xml = await soapRequest(mediaUrl, body, SNAPSHOT_URI_ACTION, creds);
  return firstTag(xml, 'Uri');
}

async function fetchSnapshot(snapshotUrl, creds = {}) {
  const res = await requestWithDigest(snapshotUrl, {
    method: 'GET',
    username: creds.username || '',
    password: creds.password || '',
    timeoutMs: creds.timeoutMs || 8000,
  });
  if (res.status >= 400) {
    const err = new Error(`Snapshot HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const ctype = String(res.headers['content-type'] || 'image/jpeg');
  return { buffer: res.bodyBuffer, contentType: ctype.split(';')[0].trim() };
}

async function probeOnvifDevice(deviceUrl, creds = {}, opts = {}) {
  const preferSubstream = opts.preferSubstream !== false;
  const caps = await getCapabilities(deviceUrl, creds);
  const info = await getDeviceInformation(caps.deviceUrl || deviceUrl, creds);
  const mediaUrl = caps.mediaUrl;
  if (!mediaUrl) {
    return {
      ok: true,
      deviceUrl: caps.deviceUrl || deviceUrl,
      mediaUrl: '',
      ...info,
      profiles: [],
      profileToken: '',
      rtspUrl: '',
      snapshotUrl: '',
    };
  }
  const profiles = await getProfiles(mediaUrl, creds);
  const profile = pickProfile(profiles, preferSubstream);
  const profileToken = profile?.token || '';
  let rtspUrl = '';
  let snapshotUrl = '';
  if (profileToken) {
    rtspUrl = await getStreamUri(mediaUrl, profileToken, creds).catch(() => '');
    snapshotUrl = await getSnapshotUri(mediaUrl, profileToken, creds).catch(() => '');
  }
  return {
    ok: true,
    deviceUrl: caps.deviceUrl || deviceUrl,
    mediaUrl,
    ptzUrl: caps.ptzUrl || '',
    eventsUrl: caps.eventsUrl || '',
    ...info,
    profiles,
    profileToken,
    rtspUrl,
    snapshotUrl,
  };
}

module.exports = {
  getCapabilities,
  getDeviceInformation,
  getProfiles,
  getStreamUri,
  getSnapshotUri,
  fetchSnapshot,
  probeOnvifDevice,
  pickProfile,
  mediaProfiles,
};
