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
  MOTOR: 'Motor control',
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

/** HMISVGArt folder → library subgroup (MV symbol library) */
const MV_SYMBOL_MAP = {
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
const PILOT_LIGHT_CANONICAL = new Set([
  'pilot_light_round.svg',
  'pilot_light_square.svg',
  'pilot_light_octagonal.svg',
]);
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
const PILOT_LIGHT_ALLOWED = new Set([
  ...PILOT_LIGHT_CANONICAL,
]);

/** Only these push buttons are exposed in the HMI symbol picker (shape via panel; mode momentary/latched). */
const PUSH_BUTTON_CANONICAL = new Set([
  'push_button_round.svg',
  'push_button_square.svg',
  'push_button_rectangle.svg',
  'push_button_oblong.svg',
]);
const PUSH_BUTTON_ALLOWED = new Set([
  ...PUSH_BUTTON_CANONICAL,
]);

/** Only this strip chart is exposed in the HMI symbol picker (pen count via panel). */
const STRIP_CHART_CANONICAL = new Set([
  'strip_chart.svg',
]);
const STRIP_CHART_ALLOWED = new Set([
  ...STRIP_CHART_CANONICAL,
]);

/** Only this gauge column is exposed in the HMI symbol picker (column count via panel). */
const GAUGE_COLUMN_CANONICAL = new Set([
  'gauge_column.svg',
]);
const GAUGE_COLUMN_ALLOWED = new Set([
  ...GAUGE_COLUMN_CANONICAL,
]);

/** Only these dial backgrounds are exposed in the HMI symbol picker. */
const GAUGE_DIAL_BG_CANONICAL = new Set([
  'gauge_dialbg.svg',
]);
const GAUGE_DIAL_BG_ALLOWED = new Set([
  ...GAUGE_DIAL_BG_CANONICAL,
]);

/** Only these dial pointers are exposed in the HMI symbol picker. */
const GAUGE_DIAL_POINTER_CANONICAL = new Set([
  'gauge_dialpointer.svg',
]);
const GAUGE_DIAL_POINTER_ALLOWED = new Set([
  ...GAUGE_DIAL_POINTER_CANONICAL,
]);

/** Column gauge background exposed in the HMI symbol picker. */
const GAUGE_COLUMN_BG_CANONICAL = new Set([
  'gauge_columnbg.svg',
]);
const GAUGE_COLUMN_BG_ALLOWED = new Set([
  ...GAUGE_COLUMN_BG_CANONICAL,
]);

/** Tank column gauge exposed in the HMI symbol picker. */
const TANK_COLUMN_CANONICAL = new Set([
  'tank_column.svg',
]);
const TANK_COLUMN_ALLOWED = new Set([
  ...TANK_COLUMN_CANONICAL,
]);

/** Tank gauge background exposed in the HMI symbol picker. */
const TANK_GAUGE_BG_CANONICAL = new Set([
  'tank_gauge_bg.svg',
]);
const TANK_GAUGE_BG_ALLOWED = new Set([
  ...TANK_GAUGE_BG_CANONICAL,
]);

/** Standard gauge symbols exposed in the HMI symbol picker. */
const STANDARD_GAUGE_CANONICAL = new Set([
  'bargraph.svg',
  'flowmeter.svg',
  'bulb_thermometer.svg',
  'dial_calipers.svg',
  'gauge.svg',
  'gauge_cover.svg',
  'gauge_needle.svg',
  'gauge_dial_3d.svg',
  'meter_3d.svg',
  'scale2.svg',
]);
const STANDARD_GAUGE_ALLOWED = new Set([
  ...STANDARD_GAUGE_CANONICAL,
]);

/** Text label shapes exposed in the HMI symbol picker (color via label text / bindings). */
const TEXT_LABEL_CANONICAL = new Set([
  'text_label_left.svg',
  'text_label_centred.svg',
  'text_digits_int.svg',
  'text_digits_float.svg',
]);
const TEXT_LABEL_ALLOWED = new Set([
  ...TEXT_LABEL_CANONICAL,
]);

/** Message ID text exposed in the HMI symbol picker. */
const TEXT_MSGID_CANONICAL = new Set([
  'text_msgid.svg',
]);
const TEXT_MSGID_ALLOWED = new Set([
  ...TEXT_MSGID_CANONICAL,
]);

/** Server ID text exposed in the HMI symbol picker. */
const TEXT_SERVERID_CANONICAL = new Set([
  'text_serverid_left.svg',
  'text_serverid_centred.svg',
]);
const TEXT_SERVERID_ALLOWED = new Set([
  ...TEXT_SERVERID_CANONICAL,
]);

/** Text list labels exposed in the HMI symbol picker. */
const TEXT_LIST_CANONICAL = new Set([
  'text_list_left.svg',
  'text_list_centred.svg',
]);
const TEXT_LIST_ALLOWED = new Set([
  ...TEXT_LIST_CANONICAL,
]);

/** Numeric readout bezels exposed in the HMI symbol picker. */
const NUMERIC_BEZEL_CANONICAL = new Set([
  'numeric_display.svg',
  'numeric_bezel_simple.svg',
]);
const NUMERIC_BEZEL_ALLOWED = new Set([
  ...NUMERIC_BEZEL_CANONICAL,
]);

/** Numeric entry keypad exposed in the HMI symbol picker. */
const NUMERIC_ENTRY_CANONICAL = new Set([
  'numeric_keypad.svg',
]);
const NUMERIC_ENTRY_ALLOWED = new Set([
  ...NUMERIC_ENTRY_CANONICAL,
]);

function isCanonicalPushButtonAssetName(name) {
  return PUSH_BUTTON_CANONICAL.has(String(name || '').toLowerCase());
}

function isAllowedPushButtonAsset(name) {
  return PUSH_BUTTON_ALLOWED.has(String(name || '').toLowerCase());
}

function pushButtonShapeLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('oblong')) return 'oblong';
  if (n.includes('rectangle') || n.includes('rectangular')) return 'rect';
  if (n.includes('round')) return 'round';
  if (n.includes('square')) return 'square';
  return n.replace(/^push_button_/, '').replace(/\.svg$/i, '');
}

function pushButtonDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (PUSH_BUTTON_CANONICAL.has(n)) return `PB ${pushButtonShapeLabel(n)}`;
  return displayName(name, { group: GROUP.PUSH });
}

function pushButtonSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (PUSH_BUTTON_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isCanonicalPilotLightAsset(name) {
  return PILOT_LIGHT_CANONICAL.has(String(name || '').toLowerCase());
}

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
  if (PILOT_LIGHT_CANONICAL.has(n)) return `PL ${shape}`;
  if (PILOT_LIGHT_MULTI.has(n)) return `PL multi ${shape}`;
  if (PILOT_LIGHT_SIMPLE.has(n)) return `PL ${shape}`;
  return displayName(name, { group: GROUP.PILOT });
}

function pilotLightSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (PILOT_LIGHT_CANONICAL.has(n)) return 'canonical';
  if (PILOT_LIGHT_MULTI.has(n)) return 'multistate';
  if (PILOT_LIGHT_SIMPLE.has(n)) return 'simple';
  return '';
}

function isStripChartAssetName(name) {
  return /strip_chart/i.test(String(name || ''));
}

function isAllowedStripChartAsset(name) {
  return STRIP_CHART_ALLOWED.has(String(name || '').toLowerCase());
}

function stripChartDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (STRIP_CHART_CANONICAL.has(n)) return 'Strip chart';
  return displayName(name, { group: GROUP.CHART });
}

function stripChartSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (STRIP_CHART_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isGaugeColumnAssetName(name) {
  const n = String(name || '').toLowerCase();
  return /gauge_column/i.test(n) && !/gauge_columnbg/i.test(n);
}

function isAllowedGaugeColumnAsset(name) {
  return GAUGE_COLUMN_ALLOWED.has(String(name || '').toLowerCase());
}

function gaugeColumnDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_COLUMN_CANONICAL.has(n)) return 'Gauge column';
  return displayName(name, { group: GROUP.GAUGE });
}

function gaugeColumnSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_COLUMN_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isGaugeDialBgAssetName(name) {
  return /gauge_dialbg/i.test(String(name || ''));
}

function isAllowedGaugeDialBgAsset(name) {
  return GAUGE_DIAL_BG_ALLOWED.has(String(name || '').toLowerCase());
}

function gaugeDialBgDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_DIAL_BG_CANONICAL.has(n)) return 'Dial background';
  return displayName(name, { group: GROUP.GAUGE });
}

function gaugeDialBgSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_DIAL_BG_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isGaugeDialPointerAssetName(name) {
  return /gauge_dialpointer/i.test(String(name || ''));
}

function isAllowedGaugeDialPointerAsset(name) {
  return GAUGE_DIAL_POINTER_ALLOWED.has(String(name || '').toLowerCase());
}

function gaugeDialPointerDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_DIAL_POINTER_CANONICAL.has(n)) return 'Dial pointer';
  return displayName(name, { group: GROUP.GAUGE });
}

function gaugeDialPointerSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_DIAL_POINTER_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isGaugeColumnBgCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^gauge_columnbg_/.test(n) || GAUGE_COLUMN_BG_CANONICAL.has(n);
}

function isAllowedGaugeColumnBgAsset(name) {
  return GAUGE_COLUMN_BG_ALLOWED.has(String(name || '').toLowerCase());
}

function gaugeColumnBgDisplayLabel() {
  return 'Column background';
}

function gaugeColumnBgSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (GAUGE_COLUMN_BG_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTankColumnCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^tank_column_/.test(n) || TANK_COLUMN_CANONICAL.has(n);
}

function isAllowedTankColumnAsset(name) {
  return TANK_COLUMN_ALLOWED.has(String(name || '').toLowerCase());
}

function tankColumnDisplayLabel() {
  return 'Tank column';
}

function tankColumnSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TANK_COLUMN_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTankGaugeBgCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^tank1_bg_/.test(n) || TANK_GAUGE_BG_CANONICAL.has(n);
}

function isAllowedTankGaugeBgAsset(name) {
  return TANK_GAUGE_BG_ALLOWED.has(String(name || '').toLowerCase());
}

function tankGaugeBgDisplayLabel() {
  return 'Tank gauge background';
}

function tankGaugeBgSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TANK_GAUGE_BG_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isStandardGaugeCatalogAsset() {
  return true;
}

function isAllowedStandardGaugeAsset(name) {
  return STANDARD_GAUGE_ALLOWED.has(String(name || '').toLowerCase());
}

function standardGaugeDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  const labels = {
    'bargraph.svg': 'Bar graph',
    'flowmeter.svg': 'Flow meter',
    'bulb_thermometer.svg': 'Bulb thermometer',
    'dial_calipers.svg': 'Dial calipers',
    'gauge.svg': 'Gauge',
    'gauge_cover.svg': 'Gauge cover',
    'gauge_needle.svg': 'Gauge needle',
    'gauge_dial_3d.svg': '3D dial gauge',
    'meter_3d.svg': '3D meter',
    'scale2.svg': 'Scale',
  };
  if (labels[n]) return labels[n];
  return displayName(name, { group: GROUP.GAUGE });
}

function standardGaugeSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (STANDARD_GAUGE_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTextLabelCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^(text_left|text_centred|digits_int|digits_float)_/.test(n)
    || TEXT_LABEL_CANONICAL.has(n);
}

function isAllowedTextLabelAsset(name) {
  return TEXT_LABEL_ALLOWED.has(String(name || '').toLowerCase());
}

function textLabelDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'text_label_left.svg') return 'Label (left)';
  if (n === 'text_label_centred.svg') return 'Label (centred)';
  if (n === 'text_digits_int.svg') return 'Digits INT';
  if (n === 'text_digits_float.svg') return 'Digits REAL';
  return displayName(name, { group: GROUP.TEXT });
}

function textLabelSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TEXT_LABEL_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTextMsgIdCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^digits_msgid_/.test(n) || TEXT_MSGID_CANONICAL.has(n);
}

function isAllowedTextMsgIdAsset(name) {
  return TEXT_MSGID_ALLOWED.has(String(name || '').toLowerCase());
}

function textMsgIdDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'text_msgid.svg') return 'Message ID';
  return displayName(name, { group: GROUP.TEXT });
}

function textMsgIdSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TEXT_MSGID_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTextServerIdCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^(textleft|textcentre)_serverid_/.test(n) || TEXT_SERVERID_CANONICAL.has(n);
}

function isAllowedTextServerIdAsset(name) {
  return TEXT_SERVERID_ALLOWED.has(String(name || '').toLowerCase());
}

function textServerIdDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'text_serverid_left.svg') return 'Server ID (left)';
  if (n === 'text_serverid_centred.svg') return 'Server ID (centred)';
  return displayName(name, { group: GROUP.TEXT });
}

function textServerIdSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TEXT_SERVERID_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isTextListCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^textlist_(left|centred)_/.test(n) || TEXT_LIST_CANONICAL.has(n);
}

function isAllowedTextListAsset(name) {
  return TEXT_LIST_ALLOWED.has(String(name || '').toLowerCase());
}

function textListDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'text_list_left.svg') return 'Text list (left)';
  if (n === 'text_list_centred.svg') return 'Text list (centred)';
  return displayName(name, { group: GROUP.TEXT });
}

function textListSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (TEXT_LIST_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isNumericBezelCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^bezel_/.test(n) || NUMERIC_BEZEL_CANONICAL.has(n);
}

function isAllowedNumericBezelAsset(name) {
  return NUMERIC_BEZEL_ALLOWED.has(String(name || '').toLowerCase());
}

function numericBezelDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'numeric_display.svg') return 'Numeric display';
  if (n === 'numeric_bezel_simple.svg') return 'Numeric bezel (simple)';
  return displayName(name, { group: GROUP.NUMERIC });
}

function numericBezelSubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (NUMERIC_BEZEL_CANONICAL.has(n)) return 'canonical';
  return '';
}

function isNumericEntryCatalogAsset(name) {
  const n = String(name || '').toLowerCase();
  return /^numeric_pad|^pb_numeric_/.test(n) || NUMERIC_ENTRY_CANONICAL.has(n);
}

function isAllowedNumericEntryAsset(name) {
  return NUMERIC_ENTRY_ALLOWED.has(String(name || '').toLowerCase());
}

function numericEntryDisplayLabel(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'numeric_keypad.svg') return 'Numeric keypad';
  return displayName(name, { group: GROUP.NUMERIC });
}

function numericEntrySubgroup(name) {
  const n = String(name || '').toLowerCase();
  if (NUMERIC_ENTRY_CANONICAL.has(n)) return 'canonical';
  return '';
}

/** @returns {boolean} true when asset should be omitted from listHmiFileAssets */
function shouldSkipHmiCatalogAsset(cls, name, webRel = '') {
  if (cls.group === GROUP.PILOT && !isAllowedPilotLightAsset(name)) return true;
  if (cls.group === GROUP.PUSH && !isAllowedPushButtonAsset(name)) return true;
  if (cls.group === GROUP.CHART && cls.subgroup === 'strip-charts'
    && isStripChartAssetName(name) && !isAllowedStripChartAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'column'
    && isGaugeColumnAssetName(name) && !isAllowedGaugeColumnAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'dial-backgrounds'
    && isGaugeDialBgAssetName(name) && !isAllowedGaugeDialBgAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'dial-pointers'
    && isGaugeDialPointerAssetName(name) && !isAllowedGaugeDialPointerAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'column-backgrounds'
    && isGaugeColumnBgCatalogAsset(name) && !isAllowedGaugeColumnBgAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'tank-column'
    && isTankColumnCatalogAsset(name) && !isAllowedTankColumnAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'tank-backgrounds'
    && isTankGaugeBgCatalogAsset(name) && !isAllowedTankGaugeBgAsset(name)) return true;
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'standard') {
    if (!/\/gm-canonical\//i.test(String(webRel || ''))) return true;
    if (!isAllowedStandardGaugeAsset(name)) return true;
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'animated') return true;
  if (cls.group === GROUP.TEXT && cls.subgroup === 'labels'
    && isTextLabelCatalogAsset(name) && !isAllowedTextLabelAsset(name)) return true;
  if (cls.group === GROUP.TEXT && cls.subgroup === 'message-id'
    && isTextMsgIdCatalogAsset(name) && !isAllowedTextMsgIdAsset(name)) return true;
  if (cls.group === GROUP.TEXT && cls.subgroup === 'server-id'
    && isTextServerIdCatalogAsset(name) && !isAllowedTextServerIdAsset(name)) return true;
  if (cls.group === GROUP.TEXT && cls.subgroup === 'lists'
    && isTextListCatalogAsset(name) && !isAllowedTextListAsset(name)) return true;
  if (cls.group === GROUP.NUMERIC && cls.subgroup === 'bezels'
    && isNumericBezelCatalogAsset(name) && !isAllowedNumericBezelAsset(name)) return true;
  if (cls.group === GROUP.NUMERIC && cls.subgroup === 'entry'
    && isNumericEntryCatalogAsset(name) && !isAllowedNumericEntryAsset(name)) return true;
  return false;
}

/** @returns {{ subgroup: string, label: string }} */
function hmiCatalogPresentation(cls, name) {
  if (cls.group === GROUP.PILOT) {
    const sg = pilotLightSubgroup(name);
    return { subgroup: sg || cls.subgroup, label: pilotLightDisplayLabel(name) };
  }
  if (cls.group === GROUP.PUSH) {
    const sg = pushButtonSubgroup(name);
    return { subgroup: sg || cls.subgroup, label: pushButtonDisplayLabel(name) };
  }
  if (cls.group === GROUP.CHART && cls.subgroup === 'strip-charts' && isAllowedStripChartAsset(name)) {
    return { subgroup: stripChartSubgroup(name) || cls.subgroup, label: stripChartDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'column' && isAllowedGaugeColumnAsset(name)) {
    return { subgroup: gaugeColumnSubgroup(name) || cls.subgroup, label: gaugeColumnDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'dial-backgrounds' && isAllowedGaugeDialBgAsset(name)) {
    return { subgroup: gaugeDialBgSubgroup(name) || cls.subgroup, label: gaugeDialBgDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'dial-pointers' && isAllowedGaugeDialPointerAsset(name)) {
    return { subgroup: gaugeDialPointerSubgroup(name) || cls.subgroup, label: gaugeDialPointerDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'column-backgrounds' && isAllowedGaugeColumnBgAsset(name)) {
    return { subgroup: gaugeColumnBgSubgroup(name) || cls.subgroup, label: gaugeColumnBgDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'tank-column' && isAllowedTankColumnAsset(name)) {
    return { subgroup: tankColumnSubgroup(name) || cls.subgroup, label: tankColumnDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'tank-backgrounds' && isAllowedTankGaugeBgAsset(name)) {
    return { subgroup: tankGaugeBgSubgroup(name) || cls.subgroup, label: tankGaugeBgDisplayLabel(name) };
  }
  if (cls.group === GROUP.GAUGE && cls.subgroup === 'standard' && isAllowedStandardGaugeAsset(name)) {
    return { subgroup: standardGaugeSubgroup(name) || cls.subgroup, label: standardGaugeDisplayLabel(name) };
  }
  if (cls.group === GROUP.TEXT && cls.subgroup === 'labels' && isAllowedTextLabelAsset(name)) {
    return { subgroup: textLabelSubgroup(name) || cls.subgroup, label: textLabelDisplayLabel(name) };
  }
  if (cls.group === GROUP.TEXT && cls.subgroup === 'message-id' && isAllowedTextMsgIdAsset(name)) {
    return { subgroup: textMsgIdSubgroup(name) || cls.subgroup, label: textMsgIdDisplayLabel(name) };
  }
  if (cls.group === GROUP.TEXT && cls.subgroup === 'server-id' && isAllowedTextServerIdAsset(name)) {
    return { subgroup: textServerIdSubgroup(name) || cls.subgroup, label: textServerIdDisplayLabel(name) };
  }
  if (cls.group === GROUP.TEXT && cls.subgroup === 'lists' && isAllowedTextListAsset(name)) {
    return { subgroup: textListSubgroup(name) || cls.subgroup, label: textListDisplayLabel(name) };
  }
  if (cls.group === GROUP.NUMERIC && cls.subgroup === 'bezels' && isAllowedNumericBezelAsset(name)) {
    return { subgroup: numericBezelSubgroup(name) || cls.subgroup, label: numericBezelDisplayLabel(name) };
  }
  if (cls.group === GROUP.NUMERIC && cls.subgroup === 'entry' && isAllowedNumericEntryAsset(name)) {
    return { subgroup: numericEntrySubgroup(name) || cls.subgroup, label: numericEntryDisplayLabel(name) };
  }
  return { subgroup: cls.subgroup, label: displayName(name, cls) };
}

function slugPart(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '');
}

function classifyMvAsset(folder, name) {
  const n = name.toLowerCase();
  const f = folder.toLowerCase();
  if (f === 'logos') return { group: GROUP.LOGO, subgroup: 'logos', vendor: 'mv', variant: f };
  if (f === 'products') return { group: GROUP.LOGO, subgroup: 'products', vendor: 'mv', variant: f };
  if (f === 'animations') {
    if (/gauge|roundgauge|ringgauge|face_|needle|rotator|maskindicator/.test(n)) {
      return { group: GROUP.GAUGE, subgroup: 'animated', vendor: 'mv', variant: f };
    }
    return { group: GROUP.ANIM, subgroup: 'general', vendor: 'mv', variant: f };
  }
  if (/^light|beacon|indicator|pilot|alarm.*light|statuslight/.test(n)) {
    return { group: GROUP.PILOT, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  if (/roundsymbol|squaresymbol|pushbutton|push_button|_button|button_/.test(n)) {
    return { group: GROUP.PUSH, subgroup: 'symbol', vendor: 'mv', variant: f };
  }
  if (/switch|toggle|selector/.test(n) && !/pressure/.test(n)) {
    return { group: GROUP.SWITCH, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  if (/gauge|gaugeneedle|bargraph|meter_|roundgauge|scale\d|dialcalipers/.test(n)) {
    return { group: GROUP.GAUGE, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  if (/chart|trend|strip_chart|history/.test(n)) {
    return { group: GROUP.CHART, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  if (/display|bezel|numeric|digitalreadout/.test(n)) {
    return { group: GROUP.NUMERIC, subgroup: 'displays', vendor: 'mv', variant: f };
  }
  if (/controlvalvewgauge|pid|faceplate|loop_control|controller_face/.test(n)) {
    return { group: GROUP.PID, subgroup: 'components', vendor: 'mv', variant: f };
  }
  if (/^pump|centrifugal|rotary_pump/.test(n)) return { group: GROUP.PUMP, subgroup: 'standard', vendor: 'mv', variant: f };
  if (/valve|damper|regulator/.test(n)) return { group: GROUP.VALVE, subgroup: 'standard', vendor: 'mv', variant: f };
  if (/tank|vessel|drum|silos|hopper|reservoir|container/.test(n)) {
    return { group: GROUP.TANK, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  if (/pipe|piping|duct|conduit|plumbing|elbow|tee|flange/.test(n)) {
    return { group: GROUP.PIPING, subgroup: 'standard', vendor: 'mv', variant: f };
  }
  return { group: GROUP.PROCESS, subgroup: 'general', vendor: 'mv', variant: f };
}

/** @param {string} relPath path under hmi/svg using forward slashes */
function classifyAsset(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = norm.split('/');
  const name = parts[parts.length - 1] || '';

  if (parts[0] === 'demos' || /^demo_/.test(name)) {
    return { group: GROUP.DEMOS, subgroup: 'screens', vendor: 'peaklogic', variant: 'demo' };
  }
  if (parts[0] === 'library') {
    const top = parts[1] || '';
    const sub = parts[2] || 'general';
    const vendor = parts[3] || 'mixed';
    const variant = parts[4] || '';
    const group = libraryTopToGroup(top, sub);
    return { group, subgroup: sub, vendor, variant };
  }
  if (parts[0] === 'mv-import' && parts.length >= 2) {
    return classifyMvAsset(parts[1], name);
  }
  if (parts[0] === 'mblogic' && parts.length >= 2) {
    const folder = parts[1];
    const mapped = MV_SYMBOL_MAP[folder] || { group: GROUP.MISC, subgroup: slugPart(folder) };
    return { group: mapped.group, subgroup: mapped.subgroup, vendor: 'mv', variant: folder };
  }
  if (parts[0] === 'opto22' && parts.length >= 2) {
    return classifyMvAsset(parts[1], name);
  }
  if (/^demo_/.test(name)) {
    return { group: GROUP.DEMOS, subgroup: 'screens', vendor: 'peaklogic', variant: 'demo' };
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
    case 'motor-faceplates': return GROUP.MOTOR;
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
    'motor-faceplates': GROUP.MOTOR,
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
    case GROUP.MOTOR: return 'motor-faceplates';
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
  MV_SYMBOL_MAP,
  MBLOGIC_MAP: MV_SYMBOL_MAP,
  PILOT_LIGHT_ALLOWED,
  PUSH_BUTTON_ALLOWED,
  STRIP_CHART_ALLOWED,
  GAUGE_COLUMN_ALLOWED,
  GAUGE_DIAL_BG_ALLOWED,
  GAUGE_DIAL_POINTER_ALLOWED,
  GAUGE_COLUMN_BG_ALLOWED,
  TANK_COLUMN_ALLOWED,
  TANK_GAUGE_BG_ALLOWED,
  STANDARD_GAUGE_ALLOWED,
  TEXT_LABEL_ALLOWED,
  TEXT_MSGID_ALLOWED,
  TEXT_SERVERID_ALLOWED,
  TEXT_LIST_ALLOWED,
  NUMERIC_BEZEL_ALLOWED,
  NUMERIC_ENTRY_ALLOWED,
  isAllowedTextLabelAsset,
  textLabelDisplayLabel,
  textLabelSubgroup,
  isTextLabelCatalogAsset,
  isTextMsgIdCatalogAsset,
  isAllowedTextMsgIdAsset,
  textMsgIdDisplayLabel,
  textMsgIdSubgroup,
  isTextServerIdCatalogAsset,
  isAllowedTextServerIdAsset,
  textServerIdDisplayLabel,
  textServerIdSubgroup,
  isTextListCatalogAsset,
  isAllowedTextListAsset,
  textListDisplayLabel,
  textListSubgroup,
  isNumericBezelCatalogAsset,
  isAllowedNumericBezelAsset,
  numericBezelDisplayLabel,
  numericBezelSubgroup,
  isNumericEntryCatalogAsset,
  isAllowedNumericEntryAsset,
  numericEntryDisplayLabel,
  numericEntrySubgroup,
  shouldSkipHmiCatalogAsset,
  hmiCatalogPresentation,
  isAllowedPushButtonAsset,
  pushButtonDisplayLabel,
  pushButtonSubgroup,
  isAllowedPilotLightAsset,
  pilotLightDisplayLabel,
  pilotLightSubgroup,
  isStripChartAssetName,
  isAllowedStripChartAsset,
  stripChartDisplayLabel,
  stripChartSubgroup,
  isGaugeColumnAssetName,
  isAllowedGaugeColumnAsset,
  gaugeColumnDisplayLabel,
  gaugeColumnSubgroup,
  isGaugeDialBgAssetName,
  isAllowedGaugeDialBgAsset,
  gaugeDialBgDisplayLabel,
  gaugeDialBgSubgroup,
  isGaugeDialPointerAssetName,
  isAllowedGaugeDialPointerAsset,
  gaugeDialPointerDisplayLabel,
  gaugeDialPointerSubgroup,
  isGaugeColumnBgCatalogAsset,
  isAllowedGaugeColumnBgAsset,
  gaugeColumnBgDisplayLabel,
  gaugeColumnBgSubgroup,
  isTankColumnCatalogAsset,
  isAllowedTankColumnAsset,
  tankColumnDisplayLabel,
  tankColumnSubgroup,
  isTankGaugeBgCatalogAsset,
  isAllowedTankGaugeBgAsset,
  tankGaugeBgDisplayLabel,
  tankGaugeBgSubgroup,
  isStandardGaugeCatalogAsset,
  isAllowedStandardGaugeAsset,
  standardGaugeDisplayLabel,
  standardGaugeSubgroup,
  classifyAsset,
  classifyMvAsset,
  classifyOpto: classifyMvAsset,
  targetLibraryRelPath,
  libraryGroupDir,
  displayName,
  isPidFaceplateCandidate,
  slugPart,
};
