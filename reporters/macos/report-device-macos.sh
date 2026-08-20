#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${DEVICE_CONFIG_FILE:-$HOME/.config/encrize-devices/macbook.env}"
if [[ ! -r "$CONFIG_FILE" ]]; then
  echo "Missing config: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${DEVICE_TOKEN:?DEVICE_TOKEN is required}"
API_URL="${API_URL:-https://encrize.vip/api/devices/macbook}"

BATTERY_INFO="$(/usr/bin/pmset -g batt)"
LEVEL="$(printf '%s\n' "$BATTERY_INFO" | grep -Eo '[0-9]+%' | head -n1 | tr -d '%')"
CHARGING=false
printf '%s\n' "$BATTERY_INFO" | grep -q "AC Power" && CHARGING=true
LOW_POWER=false
/usr/bin/pmset -g | grep -Eq 'lowpowermode[[:space:]]+1' && LOW_POWER=true

WIFI_DEVICE="$(/usr/sbin/networksetup -listallhardwareports | awk '/Hardware Port: (Wi-Fi|AirPort)/ {getline; sub("Device: ", ""); print; exit}')"
WIFI=""
if [[ -n "$WIFI_DEVICE" ]]; then
  WIFI_LINE="$(/usr/sbin/networksetup -getairportnetwork "$WIFI_DEVICE" 2>/dev/null || true)"
  [[ "$WIFI_LINE" == Current\ Wi-Fi\ Network:* ]] && WIFI="${WIFI_LINE#*: }"
fi

PAYLOAD="$(/usr/bin/osascript -l JavaScript - "$LEVEL" "$CHARGING" "$LOW_POWER" "$WIFI" "${ACCESSORIES:-}" <<'JXA'
function run(args) {
  const rawLevel = args[0];
  const level = rawLevel === "" ? null : Number(rawLevel);
  return JSON.stringify({
    level: Number.isInteger(level) ? level : null,
    charging: args[1] === "true",
    lowPowerMode: args[2] === "true",
    wifi: args[3] || null,
    accessories: args[4].split(",").map(s => s.trim()).filter(Boolean)
  });
}
JXA
)"

/usr/bin/curl --silent --show-error --fail-with-body \
  --retry 2 --max-time 15 \
  --request POST "$API_URL" \
  --header "Authorization: Bearer $DEVICE_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$PAYLOAD"
