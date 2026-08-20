# Android 12 reporter (Tasker / MacroDroid)

Endpoint: `https://encrize.vip/api/devices/android-phone`

Create a task triggered every 15 minutes (and optionally on battery-level changes):

1. Read the current battery percentage, charging state and Wi-Fi SSID into app variables.
2. Add an **HTTP Request** action:
   - Method: `POST`
   - URL: `https://encrize.vip/api/devices/android-phone`
   - Headers:
     - `Authorization: Bearer YOUR_ANDROID_PHONE_TOKEN`
     - `Content-Type: application/json`
   - Body (replace placeholders with Tasker variables or MacroDroid magic text):

```json
{
  "level": BATTERY_PERCENT_NUMBER,
  "charging": CHARGING_BOOLEAN,
  "lowPowerMode": POWER_SAVE_BOOLEAN,
  "wifi": "WIFI_SSID",
  "accessories": []
}
```

The three JSON booleans/numbers must not be quoted. If the automation app cannot determine Wi-Fi or power-save state, omit that field; the Worker merges partial updates. Keep the token in a private/global secret variable and exclude exported task backups from public repositories.

A 15-minute periodic trigger is more reliable than reacting only to battery changes. Android may defer background work under Doze; that is fine for this status widget.
