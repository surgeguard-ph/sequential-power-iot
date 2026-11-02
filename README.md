# Sequential Power-On Panel (ESP32 + Firebase + GitHub Pages)

Folder layout: `index.html`, `style.css`, `app.js`, `firebase-config.js` (dashboard, hosted on GitHub Pages),
`database.rules.json` (Firebase rules), `firmware/` (ESP32 code).

## 1. Firebase setup
1. console.firebase.google.com > **Add project**.
2. **Build > Realtime Database > Create database** (start in locked mode).
3. **Build > Authentication > Sign-in method > Email/Password > Enable.**
4. **Authentication > Users > Add user** twice: one for you (dashboard) and one for the ESP32 (`device@...`).
5. **Realtime Database > Rules**: paste `database.rules.json` and Publish.
6. **Project settings > Your apps > Web (</>)**: register an app, copy the config into `firebase-config.js`.
7. **Authentication > Settings > Authorized domains**: add `YOUR-USERNAME.github.io`.

## 2. GitHub Pages
```bash
cd sequential-power-iot
git init && git add . && git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sequential-power-iot.git
git push -u origin main
```
On GitHub: **Settings > Pages > Source: Deploy from a branch > main / (root)**.
The dashboard appears at `https://YOUR-USERNAME.github.io/sequential-power-iot/`. Every `git push` updates it.

## 3. ESP32 firmware
1. Arduino IDE > Library Manager: install **Firebase ESP Client** (Mobizt), **PZEM004Tv30**, **Adafruit SSD1306**, **Adafruit GFX**.
2. Copy `firmware/secrets.example.h` to `firmware/secrets.h` and fill in Wi-Fi, API key, database URL, device user. (`secrets.h` is git-ignored.)
3. Board: ESP32 Dev Module. Upload.

Pins: SSR 1/2/3 = GPIO 26/27/25, PZEM RX/TX = GPIO 16/17, OLED SDA/SCL = GPIO 21/22.

## 4. Database structure
```
device/status    v,i,p,e,f,pf, cond, o1..o3 {on,wait}, rssi, lastSeen   (ESP32 writes every 2 s)
device/control   mode, outlets{o1..o3}, delays{d1..d3}, thresholds{ovp,uvp,ocp}   (dashboard writes)
device/logs      push list {msg, fault, ts}
device/history   push list {v,i,p,e,ts}  (every 10 s, used for the chart and CSV export)
```

## 5. Behavior
- Fault (over/undervoltage, overload, interruption): all SSRs open immediately, event logged.
- After the supply is normal for 5 s, outlets energize in order using the delays (default 3 s, 5 s, 10 s counted from the end of the 5 s stability wait). "Immediate" mode skips the delays but keeps fault protection.
- Protection runs on the ESP32 itself, so it still works if Wi-Fi or Firebase is down. Loads stay off at boot until the supply is verified.

## Notes
- The Firebase web config is not a secret, but access is controlled by the rules. For stricter access, replace `auth != null` with your two UIDs.
- Clear `device/history` occasionally to keep the database small.
- Mains wiring (230 V) must be done by a qualified person with proper enclosure, fusing and isolation.
