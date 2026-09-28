'use strict';

const programStore = require('../programs/programStore');
const { ensureMotorTags, isMotorProgramPath } = require('../programs/motorTags');
const { ensureTpoTags, isTpoProgramPath } = require('../programs/tpoTags');
const persistence = require('../persistence');
const { normalizePens, penTagIds, pensFromEnabledTags } = require('../graph/graphPens');
const mongoTagLogger = require('../logger/mongoTagLogger');
const { isGraphableTag } = require('../tags/graphableTags');
const { parseProgram, validateProgram } = require('../engine/parser');
const { assessStProgramLines } = require('../programs/stProgramLimits');
const { execute, createContext, collectExpressionTrace } = require('../engine/executor');
const {
  updateTimers, updateCounters, updatePids, updateAverages, updateAlternators, updateFlowMeters,
  updateReversingMotors,
} = require('../engine/functionBlocks');

class ScanEngine {
  constructor(tagStore, driverManager, graphHistory) {
    this.tagStore = tagStore;
    this.driverManager = driverManager;
    this.graphHistory = graphHistory;
    this.running = false;
    this.paused = false;
    this.timer = null;
    this.scanMs = 100;
    this.lastCycleMs = 0;
    this.errors = [];
    this.ast = null;
    this._lastTick = Date.now();
    this.stats = { cycles: 0, overruns: 0 };
    this.remoteExecution = false;
    this._tickBusy = false;
    this._oneShotFired = new Set();
    this._programTrace = [];
    this._starting = null;
  }

  loadSettings() {
    const s = persistence.readJson('settings.json', {});
    this.scanMs = s.scanMs || 100;
    this.remoteExecution = s.remoteExecution === true;
    if (this.graphHistory && s.graphMaxPoints) this.graphHistory.setMaxPoints(s.graphMaxPoints);
    const tagList = this.tagStore.list();
    this._graphPens = normalizePens(s.graphPens, tagList);
    this._graphPenIds = penTagIds(this._graphPens);
    return s;
  }

  _findRemoteDriver() {
    if (!this.remoteExecution) return null;
    const candidates = this.driverManager.configs.filter(
      (cfg) => cfg.enabled && (cfg.type === 'opta_remote' || cfg.type === 'mqtt_parc'),
    );
    if (!candidates.length) return null;
    if (candidates.length === 1) {
      return this.driverManager.instances.get(candidates[0].id);
    }
    const { resolveParcRegistry } = require('../parc/deviceRegistry');
    const registry = resolveParcRegistry();
    const scoreDriver = (cfg) => {
      let score = 0;
      const deviceId = String(cfg.deviceId || cfg.id || '').trim();
      const dev = deviceId ? registry.getDevice(deviceId) : null;
      if (dev && !dev.stale && (dev.ageSec == null || dev.ageSec <= 120)) score += 20;
      else if (dev) score += 5;
      if (this.tagStore.list().some((t) => t.driverId === cfg.id)) score += 4;
      if (cfg.ateccSerial) score += 3;
      if (this.driverManager.instances.get(cfg.id)?.connected) score += 2;
      if (deviceId === 'opta_st_01' || cfg.id === 'opta_st_01') score -= 3;
      return score;
    };
    const ranked = [...candidates].sort((a, b) => scoreDriver(b) - scoreDriver(a));
    return this.driverManager.instances.get(ranked[0].id);
  }

  loadProgram() {
    if (isMotorProgramPath(programStore.activeRel())) {
      ensureMotorTags(this.tagStore);
    }
    if (isTpoProgramPath(programStore.activeRel())) {
      ensureTpoTags(this.tagStore);
    }
    const src = programStore.readActive();
    if (!src || !String(src).trim()) {
      this.ast = { type: 'program', body: [] };
      this.errors = [];
      return { ok: true, errors: [] };
    }
    const { ensureProgramTags } = require('../programs/ensureProgramTags');
    ensureProgramTags(this.tagStore, src);
    const { ast, errors: parseErrs } = parseProgram(src);
    if (parseErrs.length) {
      this.ast = null;
      this.errors = parseErrs;
      return { ok: false, errors: parseErrs };
    }
    const errs = validateProgram(ast, this.tagStore.list().map((t) => t.id));
    if (errs.length) {
      this.ast = null;
      this.errors = errs;
      return { ok: false, errors: errs };
    }
    this.ast = ast;
    this.errors = [];
    return { ok: true, errors: [] };
  }

  validate(source) {
    const lineCheck = assessStProgramLines(source, { forParc: false });
    const { ast, errors: parseErrs } = parseProgram(source);
    if (parseErrs.length) return { ok: false, errors: parseErrs, ast: null };
    const errors = validateProgram(ast, this.tagStore.list().map((t) => t.id));
    return { ok: errors.length === 0, errors, ast, lineCount: lineCheck };
  }

  async start() {
    if (this._starting) return this._starting;
    if (this.running) {
      if (this.paused) this.resume();
      return;
    }
    this._starting = this._startInner();
    try {
      await this._starting;
    } finally {
      this._starting = null;
    }
  }

  _hasRemoteDriverConfigured() {
    return this.driverManager.configs.some(
      (cfg) => cfg.enabled && (cfg.type === 'opta_remote' || cfg.type === 'mqtt_parc'),
    );
  }

  async _startLocalProgram() {
    const r = this.loadProgram();
    if (!r.ok) throw Object.assign(new Error('Program invalid'), { errors: r.errors });
    await this.driverManager.rebuild({ connectDeferred: false });
  }

  async _tryStartRemoteExecution() {
    let remote = this._findRemoteDriver();
    if (!remote?.connected && !this.driverManager.hasConnectedRtu()) {
      await this.driverManager.rebuild();
      remote = this._findRemoteDriver();
    }
    if (!remote) {
      console.warn('[runtime] Remote is on but mqtt_parc driver is unavailable — running ST on PC');
      return false;
    }
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected) {
      console.warn(`[runtime] Remote start skipped (${hubReady.error || 'MQTT Parc hub not connected'}) — running ST on PC`);
      return false;
    }
    if (!(await remote.ensureConnected?.())) {
      const hint = remote._lastError || 'Cannot reach Opta via MQTT Parc';
      console.warn(`[runtime] Remote start skipped (${hint}) — running ST on PC`);
      return false;
    }
    const driverCfg = remote.cfg || {};
    const { resolveParcDeviceId } = require('../parc/optaSerial');
    const deviceId = resolveParcDeviceId(driverCfg);
    const { waitForParcDeviceTelemetry, waitForParcCmdHealth } = require('../parc/waitForParcDevice');
    const cmdHealth = await waitForParcCmdHealth(driverCfg, {
      attempts: 5,
      timeoutMs: 12000,
      retryDelayMs: 2000,
    });
    if (!cmdHealth.ok) {
      console.warn(`[runtime] Remote start skipped (${cmdHealth.error}) — running ST on PC`);
      return false;
    }
    const seen = await waitForParcDeviceTelemetry(driverCfg, { timeoutMs: 8000, maxAgeSec: 120 });
    if (!seen.ok) {
      console.warn(`[parc-deploy] ${seen.error} — continuing (MQTT cmd link OK)`);
    }
    const activeRel = programStore.ensureActiveProgram();
    const src = programStore.readActive();
    const rel = activeRel || programStore.activeRel() || '(program)';
    if (!src || !String(src).trim()) {
      throw Object.assign(
        new Error(
          `No ST program to deploy (activeProgram=${rel || 'unset'}) — open and save ${rel || 'logic/24_motor_tpo_combined.st'} or fix workspace activeProgram`,
        ),
        { errors: [`activeProgram empty or missing file: ${rel || 'unset'}`] },
      );
    }
    console.log(`[parc-deploy] ${rel} → device ${deviceId}`);
    const { buildOptaProgramBody } = require('../parc/mqttOptaProgram');
    const { resolveParcRegistry } = require('../parc/deviceRegistry');
    const registry = resolveParcRegistry();
    const built = buildOptaProgramBody(src, this.tagStore, remote.cfg?.id);
    if (!built.ok) {
      throw Object.assign(new Error(built.errors?.join('; ') || 'Program invalid'), {
        errors: built.errors || [],
      });
    }
    let deploySkipped = false;
    if (remote.shouldSkipNvDeploy?.(built, deviceId)) {
      deploySkipped = true;
      console.log('[parc-deploy] skipped — Opta NV program CRC matches PC bytecode');
    } else {
      const deploy = await remote.deployProgram(src, this.tagStore);
      if (!deploy.ok) {
        console.warn(`[runtime] Remote deploy failed (${(deploy.errors || []).join('; ') || 'deploy failed'}) — running ST on PC`);
        return false;
      }
    }
    const devAfter = registry.getDevice(deviceId);
    const alreadyRunning = devAfter?.runtime?.running === true;
    if (deploySkipped && alreadyRunning) {
      console.log('[parc-deploy] Opta already running ST from NV auto-run');
    } else {
      console.log('[parc-deploy] OK — starting runtime on device');
      await remote.startRuntime();
    }
    this.ast = { type: 'program', body: [], remote: true };
    this.errors = [];
    this._programTrace = [];
    return true;
  }

  async _startInner() {
    this.loadSettings();
    let startedRemote = false;
    if (this.remoteExecution) {
      if (this._hasRemoteDriverConfigured()) {
        try {
          startedRemote = await this._tryStartRemoteExecution();
        } catch (e) {
          if (e.errors?.some((x) => /activeProgram empty/i.test(String(x)))) throw e;
          console.warn(`[runtime] Remote start failed (${e.message || e}) — running ST on PC`);
          startedRemote = false;
        }
      } else {
        console.warn(
          '[runtime] Remote is on but no mqtt_parc driver — running ST on PC (Drivers → Apply Opta template for device deploy)',
        );
      }
    }
    if (!startedRemote) {
      await this._startLocalProgram();
    }
    this._oneShotFired = new Set();
    this.running = true;
    this.paused = false;
    this._lastTick = Date.now();
    this._schedule();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._lastTick = Date.now();
    this._schedule();
  }

  async stop(opts = {}) {
    this.running = false;
    this.paused = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (opts.keepRemote) return;
    const remote = this._findRemoteDriver();
    if (remote) {
      try { await remote.stopRuntime(); } catch { /* ignore */ }
    }
  }

  _schedule() {
    if (!this.running || this.paused) return;
    this.timer = setTimeout(() => this._tick(), this.scanMs);
  }

  async _tick() {
    if (this._tickBusy) {
      this.stats.overruns++;
      this._schedule();
      return;
    }
    this._tickBusy = true;
    const t0 = Date.now();
    const dt = t0 - this._lastTick;
    this._lastTick = t0;
    try {
      const remote = this._findRemoteDriver();
      if (remote && this.ast?.remote) {
        await remote.runScanCycle(this.tagStore);
        await this.driverManager.readFieldbus();
        await this.driverManager.readHostApi();
        this.tagStore.applyForcesAfterRead();
        // ST logic runs on the Opta, but memory/output forces set on the PC (local
        // tags not pushed to the Opta) must still be held so forcing tags to test
        // HMI indications works in remote mode — mirror the local branch.
        this.tagStore.applyForcesAfterLogic();
        await this.driverManager.writeFieldbus();
      } else {
        await this.driverManager.readAll();
        this.tagStore.applyForcesAfterRead();
        if (this.ast && !this.ast.remote) {
          const trace = [];
          const ctx = createContext(this.tagStore, this._oneShotFired);
          execute(this.ast, ctx, trace);
          this._programTrace = trace;
        }
        updateTimers(this.tagStore.list(), dt);
        updateCounters(this.tagStore.list());
        updateFlowMeters(this.tagStore.list());
        updateAlternators(this.tagStore.list());
        updateReversingMotors(this.tagStore.list(), dt);
        updatePids(this.tagStore.list(), dt);
        for (const t of this.tagStore.list()) {
          if (t.type === 'PID' && t.alarmsEnabled) this.tagStore._refreshAlarmLevel(t);
        }
        updateAverages(this.tagStore.list());
        this.tagStore.applyForcesAfterLogic();
        try {
          const { resolveParcRegistry } = require('../parc/deviceRegistry');
          const { getMqttCentralHub } = require('../parc/mqttCentralHub');
          const hub = getMqttCentralHub(resolveParcRegistry());
          if (hub.isLive() && hub.resolveGlobalSiteKey()) {
            hub.publishDirtyGlobalTags(this.tagStore);
          }
        } catch { /* global publish optional */ }
        await this.driverManager.writeAll();
      }
      const archiveTags = this.tagStore.list().filter(
        (t) => t.graphEnabled !== false && isGraphableTag(t),
      );
      if (this.graphHistory && archiveTags.length) {
        this.graphHistory.record(archiveTags);
      }
      if (this.running && !this.paused && archiveTags.length) {
        const archivePens = pensFromEnabledTags(this.tagStore.list(), this._graphPens);
        mongoTagLogger.logPenSamples({
          pens: archivePens,
          tags: this.tagStore.list(),
          runtime: { running: true, projectName: this.status().projectName },
        }).catch(() => {});
      }
    } catch (e) {
      if (!Array.isArray(this.errors)) this.errors = [];
      this.errors.push(`${new Date().toISOString()} ${e.message}`);
      if (this.errors.length > 50) this.errors.shift();
    } finally {
      this.lastCycleMs = Date.now() - t0;
      this.stats.cycles++;
      if (this.lastCycleMs > this.scanMs) this.stats.overruns++;
      this._tickBusy = false;
      this._schedule();
    }
  }

  buildProgramTrace() {
    if (this.ast?.remote) {
      if (this.running && !this.paused) {
        const remote = this._findRemoteDriver();
        return remote?.getProgramTrace?.() || [];
      }
      return [];
    }
    if (!this.ast) return [];
    if (this.running && !this.paused) return this._programTrace || [];
    const ctx = createContext(this.tagStore, new Set());
    return collectExpressionTrace(this.ast, ctx);
  }

  status() {
    const settings = persistence.readJson('settings.json', {}) || {};
    const remoteDrv = this._findRemoteDriver();
    let remoteDriverId = null;
    let remoteConnected = false;
    for (const cfg of this.driverManager.configs) {
      if (cfg.enabled && (cfg.type === 'opta_remote' || cfg.type === 'mqtt_parc')) {
        remoteDriverId = cfg.id;
        remoteConnected = !!this.driverManager.instances.get(cfg.id)?.connected;
        break;
      }
    }
    return {
      running: this.running,
      paused: this.paused,
      scanMs: this.scanMs,
      lastCycleMs: this.lastCycleMs,
      stats: this.stats,
      errors: this.errors.slice(-10),
      programOk: !!this.ast,
      remoteExecution: this.remoteExecution,
      remoteDriverId,
      remoteConnected,
      remoteScanOnDevice: !!(remoteDrv && this.ast?.remote),
      localStExecution: !!(this.running && this.ast && !this.ast.remote),
      remoteTracePending: !!(
        remoteDrv
        && this.ast?.remote
        && this.running
        && !this.paused
        && remoteDrv.isTracePending?.()
      ),
      projectName: settings?.project?.name || settings?.projectName || undefined,
      programTrace: this.buildProgramTrace(),
    };
  }
}

function shouldAutoStartRuntime(settings) {
  if (settings?.autoStartRuntime === false) return false;
  return settings?.autoStartRuntime === true;
}

module.exports = { ScanEngine, shouldAutoStartRuntime };
