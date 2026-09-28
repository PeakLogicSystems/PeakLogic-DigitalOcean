#!/usr/bin/env python3
"""Tail Mosquitto broker log on mv-mqtt and POST raw lines to PeakLogic SaaS ingest API."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_LOG = "/var/log/mosquitto/mosquitto.log"
DEFAULT_BATCH_SEC = 2.0
DEFAULT_MAX_LINES = 100


DEFAULT_ENV = "/etc/peaklogic/mqtt-log-shipper.env"


def load_env_file(path: str = DEFAULT_ENV) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if key:
                os.environ.setdefault(key, val)


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def post_lines(api_url: str, token: str, host: str, lines: list[str]) -> dict:
    payload = json.dumps({"host": host, "lines": lines}).encode("utf-8")
    req = urllib.request.Request(
        api_url.rstrip("/") + "/api/mqtt-broker-log/ingest",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    load_env_file()
    log_path = env("PEAKLOGIC_MOSQUITTO_LOG_PATH", DEFAULT_LOG)
    api_url = env("PEAKLOGIC_MQTT_LOG_INGEST_URL") or env("PUBLIC_API_URL", "https://peaklogic.io")
    token = env("PEAKLOGIC_MQTT_LOG_INGEST_TOKEN")
    host = env("PEAKLOGIC_MOSQUITTO_LOG_HOST", os.uname().nodename)
    batch_sec = float(env("PEAKLOGIC_MQTT_LOG_BATCH_SEC", str(DEFAULT_BATCH_SEC)) or DEFAULT_BATCH_SEC)
    max_lines = int(env("PEAKLOGIC_MQTT_LOG_BATCH_LINES", str(DEFAULT_MAX_LINES)) or DEFAULT_MAX_LINES)

    if not token:
        print("PEAKLOGIC_MQTT_LOG_INGEST_TOKEN is required", file=sys.stderr)
        return 2

    print(
        f"[mqtt-log-shipper] tailing {log_path} → {api_url.rstrip('/')}/api/mqtt-broker-log/ingest",
        file=sys.stderr,
        flush=True,
    )

    offset = 0
    if os.path.exists(log_path):
        offset = os.path.getsize(log_path)
    else:
        print(f"waiting for log file: {log_path}", file=sys.stderr)

    pending: list[str] = []
    last_flush = time.time()

    while True:
        try:
            if not os.path.exists(log_path):
                time.sleep(1.0)
                continue
            size = os.path.getsize(log_path)
            if size < offset:
                offset = 0
            if size > offset:
                with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
                    fh.seek(offset)
                    chunk = fh.read(size - offset)
                    offset = size
                for line in chunk.splitlines():
                    line = line.strip()
                    if line:
                        pending.append(line)
            now = time.time()
            if pending and (now - last_flush >= batch_sec or len(pending) >= max_lines):
                batch = pending[:max_lines]
                del pending[:max_lines]
                try:
                    result = post_lines(api_url, token, host, batch)
                    ingested = int(result.get("ingested", 0) or 0)
                    skipped = int(result.get("skipped", 0) or 0)
                    print(f"posted {len(batch)} line(s) → ingested {ingested}, skipped {skipped}", flush=True)
                except urllib.error.HTTPError as err:
                    body = err.read().decode("utf-8", errors="replace")
                    print(f"ingest HTTP {err.code}: {body}", file=sys.stderr)
                except Exception as err:  # noqa: BLE001
                    print(f"ingest failed: {err}", file=sys.stderr)
                last_flush = now
            time.sleep(0.5)
        except KeyboardInterrupt:
            return 0
        except Exception as err:  # noqa: BLE001
            print(f"tail error: {err}", file=sys.stderr)
            time.sleep(2.0)


if __name__ == "__main__":
    raise SystemExit(main())
