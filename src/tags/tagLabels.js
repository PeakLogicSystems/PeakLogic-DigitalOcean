'use strict';

const EXACT = {
  DI: 'Digital input',
  Q: 'Digital output',
  AI: 'Analog input',
  AO: 'Analog output',
  VPB1: 'VPB permissive',
};

const MOTOR_ROLE = {
  HOA: 'HOA mode',
  STA: 'status',
  START: 'start cmd',
  STOP: 'stop cmd',
  RESET: 'reset cmd',
  OFFLINE: 'offline latch',
  RUN: 'run output',
  HRS: 'run hours',
  STARTS: 'start count',
  CTR: 'start counter',
  CNTR: 'start counter',
};

function defaultLabelForId(id) {
  const s = String(id || '').trim();
  if (!s) return '';

  if (EXACT[s]) return EXACT[s];
  if (EXACT[s.toUpperCase()]) return EXACT[s.toUpperCase()];

  let m = s.match(/^MOTOR(\d+)_(HOA|STA|START|STOP|RESET|OFFLINE|RUN|HRS|STARTS|CNTR|CTR)$/i);
  if (m) {
    const role = MOTOR_ROLE[m[2].toUpperCase()] || m[2];
    return `Motor ${m[1]} ${role}`;
  }

  m = s.match(/^TPO(\d+)_(EN|OUT|GAP|STA|TOD|TOD_STEP|START|END|TMR_ON|TMR_OFF)$/i);
  if (m) {
    const role = {
      EN: 'enable',
      OUT: 'output',
      GAP: 'gap input',
      STA: 'status',
      TOD: 'time of day',
      TOD_STEP: 'clock step',
      START: 'window start',
      END: 'window end',
      TMR_ON: 'ON timer',
      TMR_OFF: 'OFF timer',
    }[m[2].toUpperCase()] || m[2];
    return `TPO-${m[1]} ${role}`;
  }

  m = s.match(/^VPB(\d+)$/i);
  if (m) return `VPB ${m[1]} permissive`;

  m = s.match(/^DI(\d+)$/i);
  if (m) return `Digital input ${m[1]}`;

  m = s.match(/^Q(\d+)$/i);
  if (m) return `Digital output ${m[1]}`;

  m = s.match(/^I(\d+)$/i);
  if (m) return `Input ${m[1]}`;

  m = s.match(/^R(\d+)$/i);
  if (m) return `Relay ${m[1]}`;

  m = s.match(/^AI(\d+)$/i);
  if (m) return `Analog input ${m[1]}`;

  m = s.match(/^AO(\d+)$/i);
  if (m) return `Analog output ${m[1]}`;

  m = s.match(/^H(\d+)$/i);
  if (m) return `Holding ${m[1]}`;

  if (/^PID\d+$/i.test(s)) return s.replace(/^PID/i, 'PID loop ');
  if (/^AVG\d+$/i.test(s)) return s.replace(/^AVG/i, 'Averager ');
  if (/^TMR\d+$/i.test(s)) return s.replace(/^TMR/i, 'Timer ');
  if (/^CTR\d*$/i.test(s)) return s.replace(/^CTR/i, 'Counter ');

  return '';
}

/** Attach default label when meta has no label yet. */
function applyDefaultLabel(meta) {
  if (!meta || !meta.id) return meta;
  const label = String(meta.label || '').trim();
  if (label) return meta;
  const inferred = defaultLabelForId(meta.id);
  if (!inferred) return meta;
  return { ...meta, label: inferred };
}

module.exports = {
  defaultLabelForId,
  applyDefaultLabel,
  MOTOR_TAG_LABELS: {
    MOTOR1_HOA: 'Motor 1 HOA mode',
    MOTOR1_STA: 'Motor 1 status',
    MOTOR1_START: 'Motor 1 start',
    MOTOR1_STOP: 'Motor 1 stop',
    MOTOR1_RESET: 'Motor 1 reset',
    MOTOR1_OFFLINE: 'Motor 1 offline latch',
    MOTOR1_RUN: 'Motor 1 run',
    MOTOR1_HAND: 'Motor 1 hand run latch',
    MOTOR1_HRS: 'Motor 1 run hours',
    MOTOR1_STARTS: 'Motor 1 start count',
    MOTOR1_CNTR: 'Motor 1 start counter',
    VPB1: 'VPB permissive',
  },
};
