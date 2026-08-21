<div align="center">

# encrize.vip

**Personal website on Cloudflare Pages.**

<p>
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/Cloudflare-Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white">
  <img alt="Workers KV" src="https://img.shields.io/badge/Workers-KV-2C2C2B?style=for-the-badge">
</p>
<p>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-46A171?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub-Actions-2783DE?style=flat-square&logo=githubactions&logoColor=white">
  <img alt="Device API" src="https://img.shields.io/badge/API-devices-D5803B?style=flat-square">
</p>

</div>

## Layout

| Path | What it is |
| --- | --- |
| `index/` | encrize.vip - main site (Pages) |
| `dec/` | dec.encrize.vip - offline cipher tool (Pages) |
| `notes/` | notes.encrize.vip - redirect (Pages) |
| `worker/` | Devices API - Worker + KV |
| `reporters/` | Battery reporters: Linux, Android, iOS, macOS |
| `scripts/` | GitHub language-stats generator |
| `.github/workflows/` | Daily language-stats refresh |

## Requirements

- Node.js 20+ and npm
- One random 32-byte token per device

## Worker setup

```bash
cd worker
npm ci
npx wrangler login
npx wrangler kv namespace create DEVICES_KV
npx wrangler kv namespace create DEVICES_KV --preview
```

Put both IDs into `[[kv_namespaces]]` in `worker/wrangler.toml`.

### Secrets

Generate a value, then paste it into the interactive prompt.

```bash
openssl rand -hex 32
npx wrangler secret put LINUX_LAPTOP_TOKEN
npx wrangler secret put ANDROID_PHONE_TOKEN
npx wrangler secret put IPHONE_6_TOKEN
```

Local dev:

```bash
cp .dev.vars.example .dev.vars && chmod 600 .dev.vars
```

### Deploy

```bash
npm run check
npm test
npx wrangler deploy --dry-run
npx wrangler deploy
```

Route: `https://encrize.vip/api/*`. The zone must live in the same account and be proxied through Cloudflare. `workers_dev = false`, so nothing is published on `workers.dev`.

The music card uses the public ListenBrainz API. Set `LISTENBRAINZ_USER` in `worker/wrangler.toml` and the matching `LISTENBRAINZ_USER` value near the bottom of `index/script.js` to the profile whose latest listen should appear. The browser falls back to ListenBrainz directly when the Worker route has not been deployed yet and uses the public iTunes Search API to fill missing cover art. ListenBrainz can import scrobbles from Spotify and other players; no API key is exposed to the browser.

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/devices` | none | Public. Returns `{}` until the first report. |
| `GET` | `/api/music` | none | Public. Returns the latest ListenBrainz track, cached in KV. |
| `POST` | `/api/devices/:id` | `Bearer <device token>` | Partial JSON patch, merged into the record. |
| `DELETE` | `/api/devices/:id` | `Bearer <device token>` | Clears the record. |

Device IDs are defined in `worker/src/devices.ts`: `linux-laptop`, `android-phone`, `iphone-6`, `macbook` (optional).

Body fields: `level` (integer 0-100 or `null`), `charging`, `lowPowerMode`, `wifi` (string or `null`), `accessories` (array of strings).

```bash
curl -i https://encrize.vip/api/devices

read -rsp "token: " DEVICE_TOKEN; echo
curl -i -X POST https://encrize.vip/api/devices/linux-laptop \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"level":75,"charging":false}'
unset DEVICE_TOKEN
```

## Language stats

`index/data/language-stats.json` ships empty and the widget falls back to a plain note. After the first push:

1. **Settings - Actions - General - Workflow permissions**: allow read and write.
2. **Actions - Update language stats - Run workflow**.

The workflow runs daily at `03:17 UTC` with the default `GITHUB_TOKEN` and the public GitHub API.

## Reporters

### Linux (systemd user timer)

```bash
mkdir -p ~/.local/bin ~/.config/encrize-devices ~/.config/systemd/user
install -m 700 reporters/linux/report-device.sh ~/.local/bin/encrize-report-device
install -m 600 reporters/linux/linux-laptop.env.example ~/.config/encrize-devices/linux-laptop.env
install -m 644 reporters/linux/encrize-device-reporter.{service,timer} ~/.config/systemd/user/

# put LINUX_LAPTOP_TOKEN into ~/.config/encrize-devices/linux-laptop.env
systemctl --user daemon-reload
systemctl --user enable --now encrize-device-reporter.timer
journalctl --user -u encrize-device-reporter.service -n 30 --no-pager
```

### Android 12

See `reporters/android/README.md`.

### iOS (jailbroken)

Every command below runs **on the iPhone as root**. Requires a jailbreak with OpenSSH installed (Cydia / Sileo / Zebra). The device needs `curl` and `ioreg`; `plutil` and `ipconfig` are optional.

**1. Copy the files to the phone.**

```bash
scp reporters/ios/report-device-ios.sh \
    reporters/ios/iphone-6.env.example \
    reporters/ios/vip.encrize.device-reporter.plist \
    root@iphoneIP:/tmp/
```

**2. Install them.** Open a session with `ssh root@iphoneIP`, then run:

```bash
mkdir -p /var/mobile/.config/encrize-devices /usr/local/bin

cp /tmp/report-device-ios.sh /usr/local/bin/encrize-report-device-ios
chmod 700 /usr/local/bin/encrize-report-device-ios

cp /tmp/iphone-6.env.example /var/mobile/.config/encrize-devices/iphone-6.env
chmod 600 /var/mobile/.config/encrize-devices/iphone-6.env

cp /tmp/vip.encrize.device-reporter.plist /Library/LaunchDaemons/
chown root:wheel /Library/LaunchDaemons/vip.encrize.device-reporter.plist
chmod 644 /Library/LaunchDaemons/vip.encrize.device-reporter.plist

rm /tmp/report-device-ios.sh /tmp/iphone-6.env.example /tmp/vip.encrize.device-reporter.plist
```


**3. Set the token.** Edit `/var/mobile/.config/encrize-devices/iphone-6.env` with `nano` or `vi` and replace `replace_with_iphone_6_secret` with the same value passed to `wrangler secret put IPHONE_6_TOKEN`.

**4. Load the daemon.**

```bash
launchctl unload /Library/LaunchDaemons/vip.encrize.device-reporter.plist 2>/dev/null
launchctl load /Library/LaunchDaemons/vip.encrize.device-reporter.plist
/usr/local/bin/encrize-report-device-ios
```

The last line is a one-off test run and should print the reported JSON. After that the daemon reports every 600 seconds. Verify from any machine with `curl -s https://encrize.vip/api/devices`.

If `level` stays `null`, check `ioreg -l -w 0 | grep -i capacity` and adjust the battery keys in the script for your build. If the daemon never reports, check ownership and `launchctl list | grep encrize`.

**Not jailbroken?** Use the Shortcuts app instead: a personal automation on a time trigger with *Get Contents of URL* - `POST` to `https://encrize.vip/api/devices/iphone-6`, header `Authorization: Bearer <token>`, body `{"level": <Battery Level>}`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `404 /api/devices` | Worker route missing, or the zone is in another account |
| `401` | Device token does not match the Worker secret |
| `GET` returns `{}` | No successful POST yet, or the record was deleted |
| Widget shows `reconnecting` | Check `curl -i https://encrize.vip/api/devices` first |
| GitHub stats unavailable | Run the workflow and check Actions permissions |
