# AvenBridge iOS App

A bridge app that reads Apple Watch health data and syncs it to your AvenGhost server.

## Features

- ❤️ Heart Rate (real-time + 1-hour average)
- 📊 Heart Rate Variability (HRV)
- 💤 Sleep Detection
- 👣 Step Count
- ⏱️ Screen Time (coming soon)

## Setup

### 1. Create Xcode Project

1. Open Xcode and create a new iOS App project
2. Name it: `AvenBridge`
3. Interface: SwiftUI
4. Language: Swift

### 2. Add HealthKit Capability

1. Select your project in the Navigator
2. Go to "Signing & Capabilities"
3. Click "+ Capability"
4. Add "HealthKit"
5. Check "Clinical Health Records" if needed

### 3. Copy Source Files

Copy the following files from this directory to your Xcode project:

- `AvenBridgeApp.swift` (replace the generated one)
- `ContentView.swift` (replace the generated one)
- `HealthManager.swift`
- `APIClient.swift`

### 4. Update Info.plist

Add the contents from `Info.plist` to your project's Info.plist, or merge them in the target's Info tab.

### 5. Configure Server

When you run the app:

1. Enter your AvenGhost server URL (e.g., `https://your-server.com:3000`)
2. Enter your API key (default: `aven-health-secret`)
3. Enable Auto Sync

## Server API

The app pushes data to `POST /api/health` with this payload:

```json
{
  "timestamp": "2026-02-08T16:00:00+09:00",
  "heartRate": 72,
  "heartRateAvg": 68,
  "hrv": 45,
  "isSleeping": false,
  "sleepStart": null,
  "screenTimeToday": 185,
  "lastActiveApp": "Twitter",
  "steps": 5420
}
```

## Background Sync (TODO)

For production use, you'll want to enable background refresh:

1. Add "Background fetch" capability
2. Implement `BGTaskScheduler` for periodic updates
3. Use WorkManager or similar for reliable background execution

## Privacy

All health data is sent directly to YOUR server. No third-party services involved.
