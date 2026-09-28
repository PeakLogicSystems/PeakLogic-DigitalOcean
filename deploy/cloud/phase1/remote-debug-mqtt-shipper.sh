#!/usr/bin/env bash
sudo -u mosquitto python3 <<'PY'
import os, json, urllib.request
path = '/var/log/mosquitto/mosquitto.log'
print('readable', os.access(path, os.R_OK), 'size', os.path.getsize(path))
print('tail', open(path).read()[-180:])
for k in ('PEAKLOGIC_MQTT_LOG_INGEST_URL','PEAKLOGIC_MQTT_LOG_INGEST_TOKEN','PEAKLOGIC_MOSQUITTO_LOG_PATH'):
    v = os.environ.get(k)
    print(k, 'set' if v else 'MISSING')
body = json.dumps({'host':'mv-mqtt','lines':['1786050999: New client connected from 1.2.3.4:9 as diag_test (p2, c1, k60).']}).encode()
req = urllib.request.Request(
    os.environ['PEAKLOGIC_MQTT_LOG_INGEST_URL'].rstrip('/') + '/api/mqtt-broker-log/ingest',
    data=body, method='POST',
    headers={'Content-Type':'application/json', 'Authorization': 'Bearer ' + os.environ['PEAKLOGIC_MQTT_LOG_INGEST_TOKEN']},
)
with urllib.request.urlopen(req, timeout=20) as r:
    print('ingest', r.status, r.read().decode()[:200])
PY
