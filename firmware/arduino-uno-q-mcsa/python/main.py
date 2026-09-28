"""UNO Q Linux MPU entry — pull CT windows from the MCU, cook true FFT MCSA, uplink Parc MQTT."""
from __future__ import annotations

import base64
import json
import os
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from mcsa_edge import adc_to_amps, classify_channel, cook_channel, rms, synthesize_current
from parc_mqtt import ParcMqtt, build_telemetry, load_config

try:
    from arduino.app_utils import App, Bridge
except ImportError:
    App = None
    Bridge = None

HERE = Path(__file__).resolve().parent
CFG = load_config(str(HERE / "config.json"))
SIM = os.environ.get("MV_SIM", "0") == "1" or Bridge is None

_last: dict = {"ok": False, "at": None, "label": None, "body": None}
_start_ms: dict[int, float] = {}
_sim_cycle = 0
_sim_modes = ("healthy", "seal_leak", "clog_ragging", "bearing_wear", "eccentricity", "impeller_worn")


def _decode_window(b64: str) -> list[int]:
    raw = base64.b64decode(b64 or b"")
    n = len(raw) // 2
    return list(struct.unpack("<" + "h" * n, raw[: n * 2]))


def _bridge_call(name: str, *args):
    if Bridge is None:
        return None
    try:
        return Bridge.call(name, *args) if args else Bridge.call(name)
    except Exception as exc:  # noqa: BLE001
        print(f"bridge {name} failed: {exc}")
        return None


def _pull_hardware() -> tuple[list[list[float]], dict | None] | None:
    ready = _bridge_call("window_ready")
    if not ready:
        return None
    n_ch = int(_bridge_call("get_n_ch") or CFG.get("channels") or 2)
    windows: list[list[float]] = []
    for ch in range(n_ch):
        b64 = _bridge_call("get_window", ch) or ""
        i16 = _decode_window(str(b64))
        windows.append(
            adc_to_amps(
                i16,
                adc_max=float(CFG.get("adcMax", 4095)),
                vref=float(CFG.get("adcVref", 3.3)),
                v_per_amp=float(CFG.get("ctVoltsPerAmp", 0.033)),
            )
        )
    evt_raw = _bridge_call("get_start_event") or "{}"
    try:
        evt = json.loads(evt_raw) if isinstance(evt_raw, str) else (evt_raw or {})
    except json.JSONDecodeError:
        evt = {}
    _bridge_call("ack_window")
    return windows, evt if evt.get("startMs") else None


def _sim_windows() -> tuple[list[list[float]], dict | None]:
    global _sim_cycle
    n = int(CFG.get("fftSize") or 2048)
    fs = float(CFG.get("sampleRateHz") or 2048)
    fund = float(CFG.get("fundHz") or 60)
    n_ch = int(CFG.get("channels") or 6)
    mode = _sim_modes[(_sim_cycle // 8) % len(_sim_modes)]
    _sim_cycle += 1
    windows = []
    for ch in range(n_ch):
        run = 8.2 if ch < 3 else 0.05
        windows.append(synthesize_current(n, fs, fund_hz=fund, run_amps=run, mode=mode if ch < 3 else "healthy"))
    start = None
    if _sim_cycle % 8 == 1:
        start_ms = 2100 if mode == "healthy" else 2900 if mode == "seal_leak" else 4000 if mode == "clog_ragging" else 5200 if mode == "impeller_worn" else 1800
        start = {"pump": 0, "startMs": start_ms, "peakA": 24.0, "runA": 8.2}
    return windows, start


def _pump_of_ch(ch: int, n_ch: int) -> int:
    if n_ch >= 6:
        return 0 if ch < 3 else 1
    return ch


def _process(windows: list[list[float]], start_evt: dict | None) -> dict:
    fs = float(CFG.get("sampleRateHz") or 2048)
    fund = float(CFG.get("fundHz") or 60)
    idle = float(CFG.get("idleAmps", 1.0))
    n_ch = len(windows)
    n_pump = 2 if n_ch >= 6 else max(n_ch, 1)
    mcsa = []
    rms_list = []
    edge_ai = []
    pump_rms = [0.0] * n_pump
    pump_ch = [[] for _ in range(n_pump)]
    for ch, amps in enumerate(windows):
        cooked = cook_channel(amps, ch=ch, sample_rate=fs, fund_hz=fund)
        mcsa.append(cooked)
        r = rms(amps)
        rms_list.append(r)
        p = _pump_of_ch(ch, n_ch)
        if p < n_pump:
            pump_rms[p] = max(pump_rms[p], r)
            pump_ch[p].append(cooked)
    running = [r > idle for r in pump_rms]
    fault = [False] * n_pump
    for p in range(n_pump):
        start_ms = None
        run_a = pump_rms[p]
        if start_evt and int(start_evt.get("pump", -1)) == p:
            start_ms = float(start_evt["startMs"])
            run_a = float(start_evt.get("runA") or run_a)
            _start_ms[p + 1] = start_ms
        channels = pump_ch[p] or [{"fund": [fund, 0], "rotor": [], "bearing": [], "ecc": [], "pump": []}]
        clf = classify_channel(channels[0], start_ms=start_ms, run_amps=run_a)
        for extra in channels[1:]:
            other = classify_channel(extra, start_ms=start_ms, run_amps=run_a)
            if other["score"] > clf["score"]:
                clf = other
        is_fault = clf["label"] != "healthy" and pump_rms[p] > idle
        fault[p] = is_fault
        if start_ms is not None or is_fault:
            feat = clf.get("features") or {}
            edge_ai.append({
                "modelId": CFG.get("modelId", "lift-submersible-v3"),
                "assetId": f"pump-{p + 1}",
                "pumpIndex": p + 1,
                "type": "classification",
                "label": clf["label"],
                "score": clf["score"],
                "confidence": clf["confidence"],
                "features": {
                    "startMs": start_ms,
                    "runA": round(run_a, 4),
                    "peakA": start_evt.get("peakA") if start_evt and int(start_evt.get("pump", -1)) == p else None,
                    "ratioSide": round(float(feat.get("ratioSide") or 0), 5),
                    "ratioBearing": round(float(feat.get("ratioBearing") or 0), 5),
                    "trueFft": True,
                },
            })
    body = build_telemetry(
        CFG,
        mcsa,
        rms=rms_list,
        edge_ai=edge_ai or None,
        start_ms=_start_ms,
        running=running,
        fault=fault,
    )
    _last.update({"ok": True, "at": time.time(), "label": (edge_ai[0]["label"] if edge_ai else "healthy"), "body": body})
    if Bridge is not None:
        try:
            Bridge.call("set_fault_led", any(fault))
        except Exception:
            pass
    return body


class _Status(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):  # noqa: N802
        payload = json.dumps(_last.get("body") or {"ok": False, "hint": "waiting for first window"}, indent=2)
        data = payload.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _serve_status():
    port = int(CFG.get("statusPort") or 8088)
    try:
        httpd = HTTPServer(("0.0.0.0", port), _Status)
        httpd.serve_forever()
    except OSError as exc:
        print(f"status http disabled: {exc}")


mqtt = ParcMqtt(CFG)
threading.Thread(target=_serve_status, daemon=True).start()
print(f"UNO Q MCSA deviceId={CFG['deviceId']} sim={SIM} broker={CFG['broker']}")


def loop():
    got = _sim_windows() if SIM else _pull_hardware()
    if not got:
        time.sleep(0.05)
        return
    windows, start_evt = got
    body = _process(windows, start_evt)
    mqtt.publish(body)
    time.sleep(max(0.05, float(CFG.get("reportIntervalSec") or 1) * 0.25))


if App is not None and not SIM:
    App.run(user_loop=loop)
else:
    try:
        while True:
            loop()
    except KeyboardInterrupt:
        mqtt.close()
