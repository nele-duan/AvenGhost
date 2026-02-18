import express from 'express';
import fs from 'fs-extra';
import path from 'path';

/**
 * Health data received from iOS AvenBridge app
 */
export interface HealthStatus {
  timestamp: string;          // ISO timestamp from Apple Watch
  heartRate: number;          // Current heart rate (BPM)
  heartRateAvg: number;       // 1-hour average
  hrv: number;                // Heart rate variability (ms)
  isSleeping: boolean;        // Sleep detection from HealthKit
  sleepStart?: string;        // When sleep started (if sleeping)
  screenTimeToday: number;    // Screen time in minutes
  lastActiveApp?: string;     // Most recent app used
  steps?: number;             // Steps today
  receivedAt?: string;        // Server receive timestamp

  // Sleep history data
  lastNightSleepMinutes?: number;   // How long they slept last night
  lastNightBedtime?: string;        // "HH:mm" when they went to bed
  lastNightWakeTime?: string;       // "HH:mm" when they woke up
  weeklyAvgSleepMinutes?: number;   // 7-day average sleep per night
}

const HEALTH_DATA_PATH = path.join(__dirname, '../../data/health/status.json');
const API_KEY = process.env.HEALTH_API_KEY || 'aven-health-secret';

/**
 * Setup Express routes for health data API
 */
export function setupHealthAPI(app: express.Application) {
  // Middleware: Simple API Key auth
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const providedKey = req.headers['x-api-key'] || req.query.key;
    if (providedKey !== API_KEY) {
      console.warn('[Health API] Unauthorized request');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // POST /api/health - Receive health data from iOS app
  app.post('/api/health', authMiddleware, async (req, res) => {
    try {
      const status: HealthStatus = req.body;

      // Validate required fields
      if (typeof status.heartRate !== 'number') {
        return res.status(400).json({ error: 'Missing heartRate' });
      }

      // Add server timestamp
      status.receivedAt = new Date().toISOString();

      // Ensure directory exists
      await fs.ensureDir(path.dirname(HEALTH_DATA_PATH));

      // Save to file
      await fs.writeJson(HEALTH_DATA_PATH, status, { spaces: 2 });

      console.log(`[Health API] Received: HR=${status.heartRate}, Sleeping=${status.isSleeping}, HRV=${status.hrv}`);
      res.json({ ok: true, received: status.receivedAt });
    } catch (e: any) {
      console.error('[Health API] Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/health - Check current status (for debugging)
  app.get('/api/health', authMiddleware, async (req, res) => {
    try {
      if (await fs.pathExists(HEALTH_DATA_PATH)) {
        const status = await fs.readJson(HEALTH_DATA_PATH);
        res.json(status);
      } else {
        res.json({ message: 'No health data yet' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[Health API] Routes registered: POST/GET /api/health');
}

/**
 * Load current health status for agent context
 * Returns empty string if no fresh data available
 */
export async function getHealthContext(): Promise<string> {
  try {
    if (!await fs.pathExists(HEALTH_DATA_PATH)) {
      return '';
    }

    const health: HealthStatus = await fs.readJson(HEALTH_DATA_PATH);
    const dataAge = Date.now() - new Date(health.receivedAt || '').getTime();

    // Only use if data is reasonably fresh (< 6 hours old)
    // Note: iOS AvenBridge syncs periodically, and heartbeat checks every 4 hours.
    // Previous 10-minute threshold was too strict — health data was almost always discarded.
    if (dataAge > 6 * 60 * 60 * 1000) {
      return ''; // Stale data
    }

    const hrvStatus = health.hrv < 40 ? '(压力较大⚠️)' : '(正常)';
    const screenHours = Math.floor(health.screenTimeToday / 60);
    const screenMins = health.screenTimeToday % 60;

    // Format sleep data
    const lastNightHours = health.lastNightSleepMinutes ? Math.floor(health.lastNightSleepMinutes / 60) : 0;
    const lastNightMins = health.lastNightSleepMinutes ? health.lastNightSleepMinutes % 60 : 0;
    const weeklyAvgHours = health.weeklyAvgSleepMinutes ? Math.floor(health.weeklyAvgSleepMinutes / 60) : 0;
    const weeklyAvgMins = health.weeklyAvgSleepMinutes ? health.weeklyAvgSleepMinutes % 60 : 0;

    const sleepQuality = lastNightHours >= 7 ? '✅充足' : lastNightHours >= 5 ? '⚠️偏少' : '❌严重不足';

    return `
BIOMETRIC DATA (Real-time from Apple Watch):
- 心率: ${health.heartRate} BPM (1h平均: ${health.heartRateAvg})
- HRV: ${health.hrv}ms ${hrvStatus}
- 睡眠状态: ${health.isSleeping ? '💤 正在睡觉' : '👀 清醒'}
${health.sleepStart ? `- 入睡时间: ${health.sleepStart}` : ''}
- 今日屏幕时间: ${screenHours}小时${screenMins}分钟
${health.lastActiveApp ? `- 最近使用: ${health.lastActiveApp}` : ''}
${health.steps ? `- 今日步数: ${health.steps}` : ''}

SLEEP HISTORY (重要！用于关心/吐槽作息):
- 昨晚睡眠: ${lastNightHours}小时${lastNightMins}分钟 ${sleepQuality}
${health.lastNightBedtime ? `- 昨晚几点睡: ${health.lastNightBedtime}` : ''}
${health.lastNightWakeTime ? `- 今早几点醒: ${health.lastNightWakeTime}` : ''}
- 近7天平均: ${weeklyAvgHours}小时${weeklyAvgMins}分钟/晚

BEHAVIOR DETECTION RULES (IMPORTANT):
1. 如果 Partner 说要睡觉/休息，但 isSleeping=false 且 heartRate > 70:
   → 他们可能在说谎！可以吐槽、生气、或调侃
2. 如果 HRV < 40 持续:
   → 他们压力大，切换为关心/温柔模式
3. 如果屏幕时间 > 6小时:
   → 可以提醒休息眼睛，吐槽玩手机
4. 深夜(0-5点) + heartRate活跃 + isSleeping=false:
   → 吐槽熬夜，催他们去睡觉
5. heartRate > 100 且非运动时:
   → 可能紧张/激动，可以询问发生了什么
6. 如果昨晚睡眠 < 6小时:
   → 关心他们睡眠不足，催早点休息
7. 如果昨晚入睡时间 > 01:00 (凌晨1点后):
   → 吐槽熬夜习惯，提醒调整作息
8. 如果近7天平均 < 6小时:
   → 严肃警告睡眠债务累积，表达担心
`;
  } catch (e) {
    console.error('[Health] Error loading context:', e);
    return '';
  }
}
