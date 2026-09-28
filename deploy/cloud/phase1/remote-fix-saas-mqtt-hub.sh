#!/usr/bin/env bash
# Fix cloud SaaS MQTT hub — point mqttParc at mv-mqtt and add broker credentials to saas.env.
# Run on mv-saas as root. Pass MOSQUITTO_USER/PASS via env or as args.
set -euo pipefail

MOSQUITTO_USER="${MOSQUITTO_USER:-${1:-}}"
MOSQUITTO_PASS="${MOSQUITTO_PASS:-${2:-}}"
SAAS_ENV=/etc/peaklogic/saas.env

read_env_file() {
  node <<NODE
const fs = require('fs');
const out = {};
for (const raw of fs.readFileSync('$1', 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i <= 0) continue;
  out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
console.log(JSON.stringify(out));
NODE
}

saas="$(read_env_file "$SAAS_ENV")"
broker="$(node -e "const s=JSON.parse(process.argv[1]); console.log(s.PEAKLOGIC_MQTT_BROKER||'')" "$saas")"
user="${MOSQUITTO_USER:-$(node -e "const s=JSON.parse(process.argv[1]); console.log(s.MOSQUITTO_USER||'')" "$saas")}"
pass="${MOSQUITTO_PASS:-$(node -e "const s=JSON.parse(process.argv[1]); console.log(s.MOSQUITTO_PASS||'')" "$saas")}"

[[ -n "$broker" ]] || { echo 'PEAKLOGIC_MQTT_BROKER missing in saas.env'; exit 1; }
[[ -n "$user" && -n "$pass" ]] || { echo 'MOSQUITTO_USER/PASS required (env or args)'; exit 1; }

set_env_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$SAAS_ENV" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$SAAS_ENV"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$SAAS_ENV"
  fi
}

set_env_kv MOSQUITTO_USER "$user"
set_env_kv MOSQUITTO_PASS "$pass"
sed -i 's/\r$//' "$SAAS_ENV"

cd /home/peaklogic
node <<NODE
const fs = require('fs');
require('./src/loadEnv');
const configStore = require('./src/configStore');
const persistence = require('./src/persistence');
const { applyCloudMqttParcEnv, defaultMqttParcSettings } = require('./src/parc/mqttParcBootstrap');

function readEnv(path) {
  const out = {};
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

(async () => {
  const env = readEnv('/etc/peaklogic/saas.env');
  process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
  process.env.PEAKLOGIC_MQTT_BROKER = env.PEAKLOGIC_MQTT_BROKER;
  process.env.MOSQUITTO_USER = env.MOSQUITTO_USER;
  process.env.MOSQUITTO_PASS = env.MOSQUITTO_PASS;
  await configStore.init();
  let settings = persistence.readJson('settings.json', {});
  let patched = applyCloudMqttParcEnv(settings);
  if (!patched.changed) {
    const mp = patched.settings.mqttParc || defaultMqttParcSettings({});
    patched.settings.mqttParc = {
      ...mp,
      enabled: mp.enabled !== false,
      brokerUrl: env.PEAKLOGIC_MQTT_BROKER,
      username: env.MOSQUITTO_USER || mp.username || '',
      password: env.MOSQUITTO_PASS || mp.password || '',
      cloudTenantIngest: true,
    };
  }
  persistence.writeJson('settings.json', patched.settings);
  await configStore.shutdown();
  console.log('mqttParc broker:', patched.settings.mqttParc?.brokerUrl);
  console.log('mqttParc user:', patched.settings.mqttParc?.username || '(none)');
})();
NODE

systemctl restart peaklogic-saas
sleep 6
journalctl -u peaklogic-saas -n 12 --no-pager | grep -E 'mqtt-parc|MQTT|central hub' || true
