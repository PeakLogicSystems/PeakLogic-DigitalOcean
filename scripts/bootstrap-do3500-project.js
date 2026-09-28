#!/usr/bin/env node
'use strict';

/**
 * Generate data/projects/icon-do3500.est.json from the icon_do3500 device template.
 * Usage: node scripts/bootstrap-do3500-project.js
 */

const fs = require('fs');
const path = require('path');
const { buildFromPreset } = require('../src/devices/devicePresets');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'projects', 'icon-do3500.est.json');

function estTagShape(tag) {
  const type = tag.type || 'INT';
  return {
    id: tag.id,
    label: tag.comment || tag.id.replace(/_/g, ' '),
    type,
    role: tag.role || 'input',
    driverId: tag.driverId,
    driverAddress: tag.driverAddress,
    default: tag.value ?? (type === 'BOOL' ? false : 0),
    scale: tag.scale ?? 1,
    offset: tag.offset ?? 0,
    alarmsEnabled: false,
    alarmOuterLow: null,
    alarmInnerLow: null,
    alarmInnerHigh: null,
    alarmOuterHigh: null,
    alarmCondition: null,
    readonly: tag.role === 'input',
    preset: 0,
    mode: 'TON',
    arrayLen: 1,
    value: tag.value ?? (type === 'BOOL' ? false : 0),
    quality: 'GOOD',
    wordWidth: tag.wordWidth ?? (type === 'REAL' ? 32 : 16),
    signed: tag.signed !== false,
    forceInput: false,
    forceOutput: false,
    graphEnabled: tag.graphEnabled !== false && (type === 'REAL' || type === 'INT'),
    dirty: false,
    alarmLevel: null,
    fb: {},
  };
}

const built = buildFromPreset('icon_do3500', { serialPort: 'COM3', slaveId: 1 });
const tags = built.tags.map(estTagShape);

const doc = {
  format: 'peaklogic-est',
  version: 1,
  savedAt: new Date().toISOString(),
  project: { name: 'icon-do3500' },
  tags,
  drivers: [built.driver],
  program: '(* Icon ProCon DO3500 — Modbus RTU dissolved oxygen probe\n   Apply device template or edit COM port / slave ID under Drivers.\n   HMI: @composite/icon_do3500 faceplate on screen_1.\n*)\n',
  activeProgram: '',
  settings: {
    project: { name: 'icon-do3500' },
    scanMs: 1000,
    graphMaxPoints: 600,
    graphPens: ['DO3500_DO', 'DO3500_TEMP_C', 'DO3500_MAIN_V'],
    hmi: {
      activeScreen: 'screen_1',
      testMode: false,
      layout: {
        gridCols: 8,
        gridRows: 6,
        cellWidth: 128,
        cellHeight: 100,
        gridSize: 8,
        width: 1024,
        height: 600,
        displayMaxWidth: 1024,
        displayMaxHeight: 600,
        fit: 'contain',
        showGridChrome: false,
        showLiveStatus: true,
      },
      screens: [
        {
          id: 'screen_1',
          number: 1,
          isHome: true,
          name: 'DO3500 Probe',
          svg: null,
          tiles: [
            {
              col: 1,
              row: 0,
              colSpan: 4,
              rowSpan: 4,
              compositeId: 'icon_do3500',
              layers: [
                {
                  kind: 'staticImage',
                  z: 0,
                  svg: '/hmi/svg/library/sensor-faceplates/peaklogic/icon_do3500.svg',
                },
              ],
              svg: '/hmi/svg/library/sensor-faceplates/peaklogic/icon_do3500.svg',
            },
          ],
          gridCols: 8,
          gridRows: 6,
          cellWidth: 128,
          cellHeight: 100,
          gridSize: 8,
          width: 1024,
          height: 600,
          displayMaxWidth: 1024,
          displayMaxHeight: 600,
          fit: 'contain',
          scale: 100,
          background: '#f1f5f9',
          offsetX: 0,
          offsetY: 0,
          naturalWidth: null,
          naturalHeight: null,
        },
      ],
      bindings: [],
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT} (${tags.length} tags, driver ${built.driver.id})`);
