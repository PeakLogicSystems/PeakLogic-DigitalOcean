"""PeakLogic Parc v1 MQTT publisher for UNO Q edge MCSA."""
from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urlparse

try:
    import paho.mqtt.client as mqtt
except ImportError:  # allow PC unit tests without paho
    mqtt = None


def load_config(path: str | None = None) -> dict[str, Any]:
    cfg = {
        "deviceId": os.environ.get("MV_DEVICE_ID", "unoq_mcsa_01"),
        "name": os.environ.get("MV_DEVICE_NAME", "UNO Q edge motor fault"),
        "broker": os.environ.get("MV_BROKER", "mqtt://127.0.0.1:1883"),
        "topicPrefix": os.environ.get("MV_TOPIC_PREFIX", "peaklogic/v1"),
        "username": os.environ.get("MV_MQTT_USER", ""),
        "password": os.environ.get("MV_MQTT_PASS", ""),
        "fundHz": float(os.environ.get("MV_FUND_HZ", "60")),
        "sampleRateHz": int(os.environ.get("MV_FS", "2048")),
        "fftSize": int(os.environ.get("MV_FFT_N", "2048")),
        "channels": int(os.environ.get("MV_N_CH", "6")),
        "ctVoltsPerAmp": float(os.environ.get("MV_CT_V_PER_A", "0.033")),
        "adcVref": 3.3,
        "adcMax": 4095,
        "idleAmps": 1.0,
        "startDetectAmps": 2.0,
        "reportIntervalSec": float(os.environ.get("MV_REPORT_SEC", "1")),
        "statusPort": int(os.environ.get("MV_STATUS_PORT", "8088")),
        "modelId": os.environ.get("MV_MODEL_ID", "lift-submersible-v3"),
        "optaSiteKey": os.environ.get("MV_OPTA_SITE_KEY", ""),
        "optaPush": os.environ.get("MV_OPTA_PUSH", "1") != "0",
    }
    if path and os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            file_cfg = json.load(f)
        if isinstance(file_cfg, dict):
            cfg.update(file_cfg)
    return cfg


def telemetry_topic(cfg: dict[str, Any]) -> str:
    return f"{cfg['topicPrefix'].rstrip('/')}/{cfg['deviceId']}/telemetry"


def build_telemetry(
    cfg: dict[str, Any],
    mcsa: list[dict],
    *,
    rms: list[float],
    edge_ai: list[dict] | None = None,
    start_ms: dict[int, float] | None = None,
    running: list[bool] | None = None,
    fault: list[bool] | None = None,
) -> dict[str, Any]:
    n = max(len(mcsa), len(rms), 1)
    n_pump = 2 if n >= 6 else max(n, 1)
    running = running or [r > cfg.get("idleAmps", 1.0) for r in rms]
    fault = fault or [False] * n_pump
    start_ms = start_ms or {}
    tags: list[dict[str, Any]] = []
    for i in range(n):
        amp = rms[i] if i < len(rms) else 0.0
        tags.append({"id": f"AI{i + 1}", "type": "REAL", "role": "input", "value": round(amp, 4), "quality": "GOOD"})
    for p in range(n_pump):
        tags.append({
            "id": f"P{p + 1}_RUN_FB",
            "type": "BOOL",
            "role": "memory",
            "value": bool(running[p]) if p < len(running) else False,
            "quality": "GOOD",
        })
        tags.append({
            "id": f"MOTOR{p + 1}_FAULT",
            "type": "BOOL",
            "role": "memory",
            "value": bool(fault[p]) if p < len(fault) else False,
            "quality": "GOOD",
        })
        if p + 1 in start_ms:
            tags.append({
                "id": f"MOTOR{p + 1}_START_MS",
                "type": "REAL",
                "role": "memory",
                "value": float(start_ms[p + 1]),
                "quality": "GOOD",
            })
    body: dict[str, Any] = {
        "deviceId": cfg["deviceId"],
        "name": cfg.get("name") or cfg["deviceId"],
        "platform": "arduino-uno-q-mcsa",
        "reportIntervalSec": cfg.get("reportIntervalSec", 1),
        "runtime": {
            "running": True,
            "firmware": "uno-q-mcsa",
            "trueFft": True,
            "sampleRateHz": cfg.get("sampleRateHz", 4096),
            "fftSize": cfg.get("fftSize", 2048),
            "mcsaChannels": n,
        },
        "mcsa": mcsa,
        "tags": tags,
    }
    if edge_ai:
        body["edgeAi"] = edge_ai
    return body


class ParcMqtt:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg
        self.topic = telemetry_topic(cfg)
        self.client = None
        if mqtt is None:
            return
        parsed = urlparse(cfg["broker"] if "://" in cfg["broker"] else f"mqtt://{cfg['broker']}")
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 1883
        cid = f"mv-{cfg['deviceId']}"
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=cid)
        except (AttributeError, TypeError):
            self.client = mqtt.Client(client_id=cid)
        if cfg.get("username"):
            self.client.username_pw_set(cfg["username"], cfg.get("password") or None)
        try:
            self.client.connect(host, port, keepalive=30)
            self.client.loop_start()
        except Exception as exc:  # noqa: BLE001 — stay up and retry on publish
            print(f"mqtt connect failed: {exc}")
            self.client = None

    def publish_opta_globals(self, body: dict[str, Any]) -> None:
        """Push cooked RMS / faults onto Opta P2P global tags over the shared MQTT broker (Wi-Fi)."""
        if not self.cfg.get("optaPush", True):
            return
        key = str(self.cfg.get("optaSiteKey") or "").strip().lower()
        if not key:
            return
        if len(key) <= 4 and key.isdigit():
            key = key.zfill(4)
        prefix = self.cfg.get("topicPrefix", "peaklogic/v1").rstrip("/")
        tags = body.get("tags") or []
        want = {f"AI{i}" for i in range(1, 7)}
        want.update({"MOTOR1_FAULT", "MOTOR2_FAULT", "P1_RUN_FB", "P2_RUN_FB", "MOTOR1_START_MS", "MOTOR2_START_MS"})
        for row in tags:
            tid = str(row.get("id") or "")
            if tid not in want:
                continue
            topic = f"{prefix}/g/{key}/UQ_{tid}"
            payload = json.dumps({"v": row.get("value"), "t": row.get("type") or "REAL"}, separators=(",", ":"))
            if self.client is None:
                print(f"{topic} {payload}")
                continue
            try:
                self.client.publish(topic, payload, qos=1, retain=True)
            except Exception as exc:  # noqa: BLE001
                print(f"opta global publish failed {topic}: {exc}")

    def publish(self, body: dict[str, Any]) -> bool:
        payload = json.dumps(body, separators=(",", ":"))
        if self.client is None:
            print(payload)
            self.publish_opta_globals(body)
            return False
        try:
            self.client.publish(self.topic, payload, qos=0)
            self.publish_opta_globals(body)
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"mqtt publish failed: {exc}")
            return False

    def close(self) -> None:
        if self.client is None:
            return
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass
