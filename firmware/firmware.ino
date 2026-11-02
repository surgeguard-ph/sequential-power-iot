// ESP32 firmware: protection + sequential power-on + Firebase RTDB sync.
// Libraries: Firebase ESP Client (mobizt), PZEM004Tv30 (mandulaj), Adafruit SSD1306 + GFX.
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <PZEM004Tv30.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include "secrets.h"

const uint8_t SSR_PIN[3] = {26, 27, 25};     // Outlet 1..3 (active HIGH)
const uint32_t STABLE_MS = 5000;             // supply must be normal this long before sequencing
PZEM004Tv30 pzem(Serial2, 16, 17);           // RX2=16, TX2=17
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
FirebaseData fbdo; FirebaseAuth fbAuth; FirebaseConfig fbCfg;

struct { bool en[3] = {false,false,false}; bool autoMode = true;
         uint16_t delaySec[3] = {3,5,10}; float ovp = 250, uvp = 200, ocp = 16; } ctl;

float V, I, P, E, F, PF;
String cond = "NORMAL", prevCond = "NORMAL";
bool relayOn[3] = {false,false,false};
uint32_t okSince = 0, tRead = 0, tSync = 0, tHist = 0;

void logEvent(const String &msg, bool fault = false) {
  if (!Firebase.ready()) return;
  FirebaseJson j; j.set("msg", msg); j.set("fault", fault); j.set("ts/.sv", "timestamp");
  Firebase.RTDB.pushJSON(&fbdo, "/device/logs", &j);
}

void readSensors() {
  V = pzem.voltage(); I = pzem.current(); P = pzem.power();
  E = pzem.energy();  F = pzem.frequency(); PF = pzem.pf();
  if (isnan(V)) V = 0; if (isnan(I)) I = 0; if (isnan(P)) P = 0;
  if (isnan(E)) E = 0; if (isnan(F)) F = 0; if (isnan(PF)) PF = 0;
}

void protectAndSequence() {
  if (V < 50) cond = "INTERRUPTION";
  else if (V > ctl.ovp) cond = "OVERVOLTAGE";
  else if (V < ctl.uvp) cond = "UNDERVOLTAGE";
  else if (I > ctl.ocp) cond = "OVERLOAD";
  else cond = "NORMAL";

  if (cond != "NORMAL") okSince = 0;
  else if (okSince == 0) okSince = millis();
  uint32_t el = okSince ? millis() - okSince : 0;
  bool supplyOk = okSince && el >= STABLE_MS;
  uint32_t seqSec = supplyOk ? (el - STABLE_MS) / 1000 : 0;

  if (cond != prevCond) {
    logEvent(cond == "NORMAL" ? "Supply normal. Sequential restoration starting." : "Fault detected: " + cond + ". Outlets disconnected.", cond != "NORMAL");
    prevCond = cond;
  }
  for (int k = 0; k < 3; k++) {
    bool want = ctl.en[k] && supplyOk && (!ctl.autoMode || seqSec >= ctl.delaySec[k]);
    if (want != relayOn[k]) {
      relayOn[k] = want; digitalWrite(SSR_PIN[k], want);
      logEvent("Outlet " + String(k + 1) + (want ? " ON" : " OFF"));
    }
  }
}

int waitSec(int k) {
  if (!ctl.en[k] || relayOn[k] || cond != "NORMAL" || !okSince) return 0;
  long left = (long)(STABLE_MS / 1000 + (ctl.autoMode ? ctl.delaySec[k] : 0)) - (long)((millis() - okSince) / 1000);
  return left > 0 ? left : 0;
}

void readControl() {
  if (!Firebase.RTDB.getJSON(&fbdo, "/device/control")) return;
  FirebaseJson &j = fbdo.jsonObject(); FirebaseJsonData d;
  if (j.get(d, "mode")) ctl.autoMode = d.to<String>() != "manual";
  for (int k = 0; k < 3; k++) {
    if (j.get(d, "outlets/o" + String(k + 1))) ctl.en[k] = d.to<bool>();
    if (j.get(d, "delays/d" + String(k + 1)))  ctl.delaySec[k] = d.to<int>();
  }
  if (j.get(d, "thresholds/ovp")) ctl.ovp = d.to<float>();
  if (j.get(d, "thresholds/uvp")) ctl.uvp = d.to<float>();
  if (j.get(d, "thresholds/ocp")) ctl.ocp = d.to<float>();
}

void writeStatus() {
  FirebaseJson s;
  s.set("v", V); s.set("i", I); s.set("p", P); s.set("e", E); s.set("f", F); s.set("pf", PF);
  s.set("cond", cond); s.set("rssi", WiFi.RSSI()); s.set("lastSeen/.sv", "timestamp");
  for (int k = 0; k < 3; k++) {
    String n = "o" + String(k + 1);
    s.set(n + "/on", relayOn[k]); s.set(n + "/wait", waitSec(k));
  }
  Firebase.RTDB.setJSON(&fbdo, "/device/status", &s);
}

void writeHistory() {
  FirebaseJson h; h.set("v", V); h.set("i", I); h.set("p", P); h.set("e", E); h.set("ts/.sv", "timestamp");
  Firebase.RTDB.pushJSON(&fbdo, "/device/history", &h);
}

void drawOled() {
  oled.clearDisplay(); oled.setTextSize(1); oled.setTextColor(WHITE); oled.setCursor(0, 0);
  oled.printf("%.1f V  %.2f A\n%.0f W  %.3f kWh\n%s\n", V, I, P, E, cond.c_str());
  oled.printf("O1:%s O2:%s O3:%s\n", relayOn[0] ? "ON" : "--", relayOn[1] ? "ON" : "--", relayOn[2] ? "ON" : "--");
  oled.printf("WiFi:%s", WiFi.status() == WL_CONNECTED ? "OK" : "none");
  oled.display();
}

void setup() {
  for (int k = 0; k < 3; k++) { pinMode(SSR_PIN[k], OUTPUT); digitalWrite(SSR_PIN[k], LOW); }  // loads start OFF
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  fbCfg.api_key = API_KEY; fbCfg.database_url = DATABASE_URL;
  fbAuth.user.email = USER_EMAIL; fbAuth.user.password = USER_PASSWORD;
  fbCfg.token_status_callback = tokenStatusCallback;
  Firebase.begin(&fbCfg, &fbAuth); Firebase.reconnectWiFi(true);
}

void loop() {
  uint32_t now = millis();
  if (now - tRead >= 500) { tRead = now; readSensors(); protectAndSequence(); drawOled(); }  // protection runs even offline
  if (Firebase.ready() && now - tSync >= 2000) { tSync = now; readControl(); writeStatus(); }
  if (Firebase.ready() && now - tHist >= 10000) { tHist = now; writeHistory(); }
}
