# AvenBridge 🌉

**Apple Watch → AvenGhost Health Data Bridge**

Sync your Apple Watch biometric data to your AI companion, giving them real awareness of your physical state.

---

## ✨ Features

### Real-Time Data Sync
| Data | Description |
|------|-------------|
| ❤️ **Heart Rate** | Real-time + 1-hour average |
| 💓 **HRV** | Heart Rate Variability (stress indicator) |
| 💤 **Sleep Status** | Currently sleeping or awake |
| 🌙 **Last Night's Sleep** | Duration, bedtime, wake time |
| 📊 **Weekly Average** | 7-day average sleep duration |
| 👣 **Steps** | Today's step count |

### Agent Behavior Triggers
- 🤥 **Lie Detection**: Claims to be sleeping but heart rate is active → Gets called out
- 😴 **Sleep Concern**: Slept too little last night → Reminds to rest early
- 🌙 **Night Owl Alert**: Went to bed after 1 AM → Warns about sleep schedule
- 💕 **Stress Care**: Low HRV detected → Switches to caring mode

---

## 🚀 Setup Instructions

### 1. Create Xcode Project

1. Open Xcode → **Create New Project**
2. Select **iOS → App**
3. Configure:
   - Product Name: `AvenBridge`
   - Interface: **SwiftUI**
   - Language: **Swift**

### 2. Add HealthKit Capability

1. Select project → **Signing & Capabilities**
2. Click **+ Capability**
3. Add **HealthKit**
4. Enable **Background Delivery** (optional)

### 3. Copy Source Files

Drag these files into your Xcode project:

```
AvenBridge/
├── AvenBridgeApp.swift   # App entry point
├── ContentView.swift     # Main UI
├── HealthManager.swift   # HealthKit data fetching
├── APIClient.swift       # Server communication
└── Info.plist            # Permission configuration
```

### 4. Configure Info.plist

Add to Info.plist:

```xml
<key>NSHealthShareUsageDescription</key>
<string>AvenBridge needs to read your health data to sync with your AI companion.</string>

<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### 5. Run the App

1. Connect iPhone (real device required — simulator has no health data)
2. Click ▶️ to run
3. Grant HealthKit permissions
4. Enter server URL: `http://YOUR_SERVER_IP:3000`
5. Tap **Sync Now** to test

---

## 📡 Server API

The app pushes data to `POST /api/health`:

```json
{
  "timestamp": "2026-02-08T17:00:00+09:00",
  "heartRate": 72,
  "heartRateAvg": 68,
  "hrv": 45,
  "isSleeping": false,
  "steps": 5420,
  "lastNightSleepMinutes": 420,
  "lastNightBedtime": "23:30",
  "lastNightWakeTime": "06:30",
  "weeklyAvgSleepMinutes": 390
}
```

---

## 🔐 Security

- Data is sent directly to **your own server** — no third parties
- Uses API Key authentication (`X-API-Key` header)
- Set a strong `HEALTH_API_KEY` in production

---

## ⚙️ Daily Usage

1. Open the app
2. Enable **Auto Sync** (syncs every 60 seconds)
3. App can run in background

> 💡 Apps built with a paid developer account last 1 year. Just rebuild when expired.

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| HealthKit data shows 0 | Requires paired Apple Watch |
| Sync fails | Check server URL and firewall |
| App Transport Security error | Add NSAllowsArbitraryLoads to Info.plist |
| Untrusted Developer | Settings → VPN & Device Management → Trust |

---

## 📜 License

MIT © [nele-duan](https://github.com/nele-duan)
