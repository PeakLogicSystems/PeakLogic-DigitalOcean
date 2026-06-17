'use strict';

/** @typedef {{ group: string, subgroup: string, vendor: string, variant: string }} AssetClass */

const GROUP = {
  DEMOS: 'Demos',
  PILOT: 'Controls — Pilot lights',
  PUSH: 'Controls — Push buttons',
  SWITCH: 'Controls — Switches',
  GAUGE: 'Gauges & meters',
  CHART: 'Charts & trends',
  NUMERIC: 'Numeric displays',
  PID: 'PID faceplates',
  PROCESS: 'Process equipment',
  PIPING: 'Piping',
  PUMP: 'Pumps',
  VALVE: 'Valves',
  TANK: 'Tanks & vessels',
  ANIM: 'Animations',
  LOGO: 'Products & logos',
  TEXT: 'Text & labels',
  MISC: 'Misc',
};

/** MBLogic HMISVGArt folder → library subgroup */
const MBLOGIC_MAP = {
  Bezels: { group: GROUP.NUMERIC, subgroup: 'bezels' },
  Chart_Strip: { group: GROUP.CHART, subgroup: 'strip-charts' },
  Gauge_Column: { group: GROUP.GAUGE, subgroup: 'column' },
  Gauge_Column_BG: { group: GROUP.GAUGE, subgroup: 'column-backgrounds' },
  Gauge_Dial_BG: { group: GROUP.GAUGE, subgroup: 'dial-backgrounds' },
  Gauge_Dial_Pointer: { group: GROUP.GAUGE, subgroup: 'dial-pointers' },
  Gauge_Tank_Column: { group: GROUP.GAUGE, subgroup: 'tank-column' },
  Gauge_Tanks_BG: { group: GROUP.GAUGE, subgroup: 'tank-backgrounds' },
  Misc: { group: GROUP.MISC, subgroup: 'misc' },
  Numeric_Entry: { group: GROUP.NUMERIC, subgroup: 'entry' },
  PB_Const0: { group: GROUP.PUSH, subgroup: 'constant-0' },
  PB_Const1: { group: GROUP.PUSH, subgroup: 'constant-1' },
  PB_Dec: { group: GROUP.PUSH, subgroup: 'decimal-entry' },
  PB_Float: { group: GROUP.PUSH, subgroup: 'float-entry' },
  PB_Illum_Pulse: { group: GROUP.PUSH, subgroup: 'illuminated-pulse' },
  PB_Illum_Toggle: { group: GROUP.PUSH, subgroup: 'illuminated-toggle' },
  PB_Inc: { group: GROUP.PUSH, subgroup: 'increment' },
  PB_Integer: { group: GROUP.PUSH, subgroup: 'integer-entry' },
  PB_Masks: { group: GROUP.PUSH, subgroup: 'masks' },
  PB_Menu: { group: GROUP.PUSH, subgroup: 'menu' },
  PB_Momentary: { group: GROUP.PUSH, subgroup: 'momentary' },
  PB_Pulse: { group: GROUP.PUSH, subgroup: 'pulse' },
  PB_String: { group: GROUP.PUSH, subgroup: 'string-entry' },
  PB_Toggle1: { group: GROUP.PUSH, subgroup: 'toggle' },
  PB_Toggle2: { group: GROUP.PUSH, subgroup: 'toggle-alt' },
  Pilot_Light: { group: GROUP.PILOT, subgroup: 'simple' },
  Pilot_Light_MultiColour: { group: GROUP.PILOT, subgroup: 'multistate' },
  Pipes: { group: GROUP.PIPING, subgroup: 'pipes' },
  Pump_BG: { group: GROUP.PUMP, subgroup: 'backgrounds' },
  Pump_Rotors: { group: GROUP.PUMP, subgroup: 'rotors' },
  Pump_Rotors_Animated: { group: GROUP.PUMP, subgroup: 'rotors-animated' },
  SSwitch2: { group: GROUP.SWITCH, subgroup: 'selector-2pos' },
  SSwitch2_Labels: { group: GROUP.SWITCH, subgroup: 'selector-2pos-labelled' },
  SSwitch3: { group: GROUP.SWITCH, subgroup: 'selector-3pos' },
  SSwitch3_Labels: { group: GROUP.SWITCH, subgroup: 'selector-3pos-labelled' },
  Text: { group: GROUP.TEXT, subgroup: 'labels' },
  Text_List: { group: GROUP.TEXT, subgroup: 'lists' },
  Text_MsgID: { group: GROUP.TEXT, subgroup: 'message-id' },
  Text_ServerID: { group: GROUP.TEXT, subgroup: 'server-id' },
};

/** Only these pilot lights are exposed in the HMI symbol picker. */
const PILOT_LIGHT_SIMPLE = new Set([
  'pl_round.svg',
  'pl_square.svg',
  'pl_octagonal.svg',
]);
const PILOT_LIGHT_MULTI = new Set([
  'pl_multi_round.svg',
  'pl_multi_square.svg',
  'pl_multi_octagonal.svg',
]);
const PILOT_LIGHT_ALLOWED = new Set([...PILOT_LIGHT_SIMPLE, ...PILOT_LIGHT_MULTI]);

function isAllowedPilotLightAsset(name) {
  return PILOT_LIGHT_ALLOWED.has(String(name || '').toLowerCase());
}

function pilotLightShapeLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('octagonal') || n.includes('_oct')) return 'oct';
  if (n.includes('round')) return 'round';
  if (n.includes('square')) return 'square';
  return n.replace(/^pl_multi_?|^pl_/, '').replace(/\.svg$/i, '');
}

function pilotLightDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  const shape = pilotLightShapeLabel(n);
  if (PILOT_LIGHT_MULTI.has(n)) return `PL multi ${shape}`;
  if (PILOT_LIGHT_SIMPLE.has(n)) return `PL ${shape}`;
  return displayName(name, { group: GROUP.PILOT });
}

function pilotLightSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (PILOT_LIGHT_MULTI.has(n)) return 'multistate';
  if (PILOT_LIGHT_SIMPLE.has(n)) return 'simple';
  return '';
}

function slugPart(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '');
}

function classifyOpto(folder, name) {
  const n = name.toLowerCase();
  const f = folder.toLowerCase();
  if (f === 'logos') return { group: GROUP.LOGO, subgroup: 'logos', vendor: 'opto22', variant: f };
  if (f === 'products') return { group: GROUP.LOGO, subgroup: 'products', vendor: 'opto22', variant: f };
  if (f === 'animations') {
    if (/gauge|roundgauge|ringgauge|face_|needle|rotator|maskindicator/.test(n)) {
      return { group: GROUP.GAUGE, subgroup: 'animated', vendor: 'opto22', variant: f };
    }
    return { group: GROUP.ANIM, subgroup: 'general', vendor: 'opto22', variant: f };
  }
  if (/^light|beacon|indicator|pilot|alarm.*light|statuslight/.test(n)) {
    return { group: GROUP.PILOT, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  if (/roundsymbol|squaresymbol|pushbutton|push_button|_button|button_/.test(n)) {
    return { group: GROUP.PUSH, subgroup: 'symbol', vendor: 'opto22', variant: f };
  }
  if (/switch|toggle|selector/.test(n) && !/pressure/.test(n)) {
    return { group: GROUP.SWITCH, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  if (/gauge|gaugeneedle|bargraph|meter_|roundgauge|scale\d|dialcalipers/.test(n)) {
    return { group: GROUP.GAUGE, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  if (/chart|trend|strip_chart|history/.test(n)) {
    return { group: GROUP.CHART, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  if (/display|bezel|numeric|digitalreadout/.test(n)) {
    return { group: GROUP.NUMERIC, subgroup: 'displays', vendor: 'opto22', variant: f };
  }
  if (/controlvalvewgauge|pid|faceplate|loop_control|controller_face/.test(n)) {
    return { group: GROUP.PID, subgroup: 'components', vendor: 'opto22', variant: f };
  }
  if (/^pump|centrifugal|rotary_pump/.test(n)) return { group: GROUP.PUMP, subgroup: 'standard', vendor: 'opto22', variant: f };
  if (/valve|damper|regulator/.test(n)) return { group: GROUP.VALVE, subgroup: 'standard', vendor: 'opto22', variant: f };
  if (/tank|vessel|drum|silos|hopper|reservoir|container/.test(n)) {
    return { group: GROUP.TANK, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  if (/pipe|piping|duct|conduit|plumbing|elbow|tee|flange/.test(n)) {
    return { group: GROUP.PIPING, subgroup: 'standard', vendor: 'opto22', variant: f };
  }
  return { group: GROUP.PROCESS, subgroup: 'general', vendor: 'opto22', variant: f };
}

/** @param {string} relPath path under hmi/svg using forward slashes */
function classifyAsset(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = norm.split('/');
  const name = parts[parts.length - 1] || '';

  if (parts[0] === 'demos' || /^demo_/.test(name)) {
    return { group: GROUP.DEMOS, subgroup: 'screens', vendor: 'mooreview', variant: 'demo' };
  }
  if (parts[0] === 'library') {
    const top = parts[1] || '';
    const sub = parts[2] || 'general';
    const vendor = parts[3] || 'mixed';
    const variant = parts[4] || '';
    const group = libraryTopToGroup(top, sub);
    return { group, subgroup: sub, vendor, variant };
  }
  if (parts[0] === 'mblogic' && parts.length >= 2) {
    const folder = parts[1];
    const mapped = MBLOGIC_MAP[folder] || { group: GROUP.MISC, subgroup: slugPart(folder) };
    return { group: mapped.group, subgroup: mapped.subgroup, vendor: 'mblogic', variant: folder };
  }
  if (parts[0] === 'opto22' && parts.length >= 2) {
    return classifyOpto(parts[1], name);
  }
  if (/^demo_/.test(name)) {
    return { group: GROUP.DEMOS, subgroup: 'screens', vendor: 'mooreview', variant: 'demo' };
  }
  return { group: GROUP.MISC, subgroup: 'general', vendor: 'unknown', variant: '' };
}

function libraryTopToGroup(top, sub) {
  switch (top) {
    case 'controls':
      if (sub === 'pilot-lights') return GROUP.PILOT;
      if (sub === 'push-buttons') return GROUP.PUSH;
      if (sub === 'selector-switches') return GROUP.SWITCH;
      return GROUP.PUSH;
    case 'gauges-meters': return GROUP.GAUGE;
    case 'charts-trends': return GROUP.CHART;
    case 'numeric-displays': return GROUP.NUMERIC;
    case 'pid-faceplates': return GROUP.PID;
    case 'piping': return GROUP.PIPING;
    case 'pumps': return GROUP.PUMP;
    case 'valves': return GROUP.VALVE;
    case 'tanks-vessels': return GROUP.TANK;
    case 'animations': return GROUP.ANIM;
    case 'products-logos': return GROUP.LOGO;
    case 'text-labels': return GROUP.TEXT;
    case 'process-equipment': return GROUP.PROCESS;
    case 'demos': return GROUP.DEMOS;
    default: return GROUP.MISC;
  }
}

function decodeLibraryGroup(token) {
  const map = {
    demos: GROUP.DEMOS,
    controls: GROUP.PILOT,
    'gauges-meters': GROUP.GAUGE,
    'charts-trends': GROUP.CHART,
    'numeric-displays': GROUP.NUMERIC,
    'pid-faceplates': GROUP.PID,
    'process-equipment': GROUP.PROCESS,
    piping: GROUP.PIPING,
    pumps: GROUP.PUMP,
    valves: GROUP.VALVE,
    'tanks-vessels': GROUP.TANK,
    animations: GROUP.ANIM,
    'products-logos': GROUP.LOGO,
    'text-labels': GROUP.TEXT,
    misc: GROUP.MISC,
  };
  return map[token] || token;
}

function libraryGroupDir(cls) {
  switch (cls.group) {
    case GROUP.DEMOS: return 'demos';
    case GROUP.PILOT: return 'controls/pilot-lights';
    case GROUP.PUSH: return 'controls/push-buttons';
    case GROUP.SWITCH: return 'controls/selector-switches';
    case GROUP.GAUGE: return 'gauges-meters';
    case GROUP.CHART: return 'charts-trends';
    case GROUP.NUMERIC: return 'numeric-displays';
    case GROUP.PID: return 'pid-faceplates';
    case GROUP.PIPING: return 'piping';
    case GROUP.PUMP: return 'pumps';
    case GROUP.VALVE: return 'valves';
    case GROUP.TANK: return 'tanks-vessels';
    case GROUP.ANIM: return 'animations';
    case GROUP.LOGO: return 'products-logos';
    case GROUP.TEXT: return 'text-labels';
    case GROUP.PROCESS: return 'process-equipment';
    default: return 'misc';
  }
}

/** Target path under hmi/svg/library/… */
function targetLibraryRelPath(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/');
  const parts = norm.split('/');
  const name = parts[parts.length - 1];
  const cls = classifyAsset(norm);
  const base = libraryGroupDir(cls);
  const sub = slugPart(cls.subgroup) || 'general';
  const vendor = cls.vendor || 'unknown';
  const variant = slugPart(cls.variant);
  if (cls.group === GROUP.DEMOS) return `demos/${name}`;
  const segs = ['library', base, sub, vendor];
  if (variant && variant !== sub && variant !== vendor) segs.push(variant);
  segs.push(name);
  return segs.join('/');
}

function displayName(name, cls) {
  return name.replace(/\.(svg|gif|png)$/i, '').replace(/[_-]+/g, ' ');
}

function isPidFaceplateCandidate(relPath, cls) {
  const n = relPath.toLowerCase();
  if (cls.group === GROUP.PID) return true;
  return /controlvalvewgauge|bargraph|gaugeneedle|gaugedial|gauge_dial|strip_chart|bezel_digit|displays\.svg|chart\.svg/.test(n);
}

module.exports = {
  GROUP,
  MBLOGIC_MAP,
  PILOT_LIGHT_ALLOWED,
  isAllowedPilotLightAsset,
  pilotLightDisplayLabel,
  pilotLightSubgroup,
  classifyAsset,
  classifyOpto,
  targetLibraryRelPath,
  libraryGroupDir,
  displayName,
  isPidFaceplateCandidate,
  slugPart,
};
