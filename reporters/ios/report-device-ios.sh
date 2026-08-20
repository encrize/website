#!/bin/sh
set -eu

CONFIG_FILE="${DEVICE_CONFIG_FILE:-/var/mobile/.config/encrize-devices/iphone-6.env}"
if [ ! -r "$CONFIG_FILE" ]; then
  echo "Missing config: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$CONFIG_FILE"
: "${DEVICE_TOKEN:?DEVICE_TOKEN is required}"
API_URL="${API_URL:-https://encrize.vip/api/devices/iphone-6}"
ACCESSORIES_JSON="${ACCESSORIES_JSON:-[]}"

IOREG_BIN="${IOREG_BIN:-$(command -v ioreg 2>/dev/null || true)}"
RAW=""
if [ -n "$IOREG_BIN" ]; then
  RAW="$($IOREG_BIN -l -w 0 2>/dev/null || true)"
fi

extract_number() {
  printf '%s\n' "$RAW" | sed -n "s/.*\"$1\" = \([0-9][0-9]*\).*/\1/p" | head -n1
}

# Battery key names vary between jailbreak builds; try the direct key first.
LEVEL="$(extract_number BatteryCurrentCapacity)"
if [ -z "$LEVEL" ]; then
  CURRENT="$(extract_number CurrentCapacity)"
  MAXIMUM="$(extract_number MaxCapacity)"
  if [ -n "$CURRENT" ] && [ -n "$MAXIMUM" ] && [ "$MAXIMUM" -gt 0 ]; then
    LEVEL=$((CURRENT * 100 / MAXIMUM))
  elif [ -n "$CURRENT" ] && [ "$CURRENT" -le 100 ]; then
    LEVEL="$CURRENT"
  else
    LEVEL=""
  fi
fi
[ -n "$LEVEL" ] && [ "$LEVEL" -gt 100 ] && LEVEL=100

CHARGING=false
printf '%s\n' "$RAW" | grep -Eq '"IsCharging" = (Yes|true|1)' && CHARGING=true

LOW_POWER=false
POWER_PLIST=/var/mobile/Library/Preferences/com.apple.powersettings.plist
if command -v plutil >/dev/null 2>&1 && [ -r "$POWER_PLIST" ]; then
  plutil -p "$POWER_PLIST" 2>/dev/null | grep -Eq '"LowPowerMode"[^0-9]*(1|true)' && LOW_POWER=true
fi

WIFI=""
IPCONFIG_BIN="$(command -v ipconfig 2>/dev/null || true)"
if [ -n "$IPCONFIG_BIN" ]; then
  WIFI="$($IPCONFIG_BIN getsummary en0 2>/dev/null | sed -n 's/^[[:space:]]*SSID : //p' | head -n1 || true)"
fi

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}
if [ -n "$WIFI" ]; then WIFI_JSON="\"$(json_escape "$WIFI")\""; else WIFI_JSON=null; fi
if [ -n "$LEVEL" ]; then LEVEL_JSON="$LEVEL"; else LEVEL_JSON=null; fi

PAYLOAD=$(printf '{"level":%s,"charging":%s,"lowPowerMode":%s,"wifi":%s,"accessories":%s}' \
  "$LEVEL_JSON" "$CHARGING" "$LOW_POWER" "$WIFI_JSON" "$ACCESSORIES_JSON")

curl --silent --show-error --fail \
  --max-time 20 \
  --request POST "$API_URL" \
  --header "Authorization: Bearer $DEVICE_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$PAYLOAD"
