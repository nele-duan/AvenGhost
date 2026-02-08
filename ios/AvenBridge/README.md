# AvenBridge 🌉

**Apple Watch → AvenGhost 健康数据桥接 App**

将你的 Apple Watch 生理数据同步给 AI 伴侣，让他真正"看到"你的状态。

---

## ✨ 功能特性

### 实时数据同步
| 数据 | 说明 |
|------|------|
| ❤️ **心率** | 实时 + 1小时平均 |
| 💓 **HRV** | 心率变异性（压力指标） |
| 💤 **睡眠状态** | 是否正在睡觉 |
| 🌙 **昨晚睡眠** | 睡眠时长、入睡时间、醒来时间 |
| 📊 **周平均** | 近7天平均睡眠时长 |
| 👣 **步数** | 今日步数统计 |

### Agent 行为触发
- 🤥 **说谎检测**: 说要睡觉但心率活跃 → 吐槽
- 😴 **睡眠关心**: 昨晚睡太少 → 催早休息
- 🌙 **熬夜警告**: 凌晨1点后才睡 → 提醒作息
- 💕 **压力关心**: HRV过低 → 温柔模式

---

## 🚀 安装步骤

### 1. 创建 Xcode 项目

1. 打开 Xcode → **Create New Project**
2. 选择 **iOS → App**
3. 填写信息：
   - Product Name: `AvenBridge`
   - Interface: **SwiftUI**
   - Language: **Swift**

### 2. 添加 HealthKit 能力

1. 选择项目 → **Signing & Capabilities**
2. 点击 **+ Capability**
3. 添加 **HealthKit**
4. 勾选 **Background Delivery**（可选）

### 3. 复制代码文件

把以下文件拖入 Xcode 项目：

```
AvenBridge/
├── AvenBridgeApp.swift   # App 入口
├── ContentView.swift     # 主界面
├── HealthManager.swift   # HealthKit 数据读取
├── APIClient.swift       # 服务器通信
└── Info.plist            # 权限配置
```

### 4. 配置 Info.plist

在 Info.plist 中添加：

```xml
<key>NSHealthShareUsageDescription</key>
<string>AvenBridge 需要读取你的健康数据来同步给 AI 伴侣</string>

<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### 5. 运行 App

1. 连接 iPhone（需要真机，模拟器没有健康数据）
2. 点击 ▶️ 运行
3. 授权 HealthKit 访问
4. 填写服务器 URL: `http://你的服务器IP:3000`
5. 点击 **Sync Now** 测试

---

## 📡 服务器 API

App 推送数据到 `POST /api/health`：

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

## 🔐 安全说明

- 数据直接发送到**你自己的服务器**，无第三方
- 使用 API Key 认证（`X-API-Key` header）
- 建议在生产环境设置强 API Key

---

## ⚙️ 日常使用

1. 打开 App
2. 开启 **Auto Sync**（每60秒自动同步）
3. App 可以放后台

> 💡 开发者账号的 App 可以用 1 年，到期重新 Build 即可

---

## 🔧 常见问题

| 问题 | 解决方案 |
|------|----------|
| HealthKit 数据为 0 | 需要 Apple Watch 配对 |
| Sync 失败 | 检查服务器 URL 和防火墙 |
| App Transport Security 错误 | Info.plist 添加许可任意网络 |
| Untrusted Developer | 设置 → VPN与设备管理 → 信任 |

---

## 📜 License

MIT © [nele-duan](https://github.com/nele-duan)
