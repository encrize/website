#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${DEVICE_CONFIG_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/encrize-devices/linux-laptop.env}"
if [[ ! -r "$CONFIG_FILE" ]]; then
  echo "Missing config: $CONFIG_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${DEVICE_TOKEN:?DEVICE_TOKEN is required}"
API_URL="${API_URL:-https://encrize.vip/api/devices/linux-laptop}"

# Auto-detect the first battery unless overridden.
BATTERY_PATH="${BATTERY_PATH:-}"
if [[ -z "$BATTERY_PATH" ]]; then
  for candidate in /sys/class/power_supply/BAT*; do
    [[ -d "$candidate" ]] && BATTERY_PATH="$candidate" && break
  done
fi

LEVEL=""
CHARGING=false
if [[ -n "$BATTERY_PATH" && -r "$BATTERY_PATH/capacity" ]]; then
  LEVEL="$(tr -dc '0-9' < "$BATTERY_PATH/capacity")"
  [[ -n "$LEVEL" && "$LEVEL" -gt 100 ]] && LEVEL=100
  STATUS="$(cat "$BATTERY_PATH/status" 2>/dev/null || true)"
  case "$STATUS" in Charging|Full) CHARGING=true ;; esac
fi

LOW_POWER=false
if command -v powerprofilesctl >/dev/null 2>&1; then
  [[ "$(powerprofilesctl get 2>/dev/null || true)" == "power-saver" ]] && LOW_POWER=true
fi

if [[ -n "$LEVEL" ]]; then LEVEL_JSON="$LEVEL"; else LEVEL_JSON=null; fi

# Hardcode wifi and accessories to keep them hidden
WIFI_JSON=null
ACCESSORIES_JSON="[]"

PAYLOAD="$(printf '{"level":%s,"charging":%s,"lowPowerMode":%s,"wifi":%s,"accessories":%s}' \
  "$LEVEL_JSON" "$CHARGING" "$LOW_POWER" "$WIFI_JSON" "$ACCESSORIES_JSON")"

curl --silent --show-error --fail \
  --retry 2 --max-time 15 \
  --request POST "$API_URL" \
  --header "Authorization: Bearer $DEVICE_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$PAYLOAD"
