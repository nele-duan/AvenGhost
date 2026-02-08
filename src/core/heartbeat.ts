import { Agent } from './agent';
import { getHealthContext } from './health';

export class HeartbeatSystem {
  private agent: Agent;
  private sendMessage: (chatId: string, text: string) => Promise<any>;
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private lastSpeaker: string = "system";

  constructor(
    agent: Agent,
    sendMessage: (chatId: string, text: string) => Promise<any>,
    intervalMs: number = 60000
  ) { // Default 1 min check
    this.agent = agent;
    this.sendMessage = sendMessage;
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.intervalId) return;
    console.log('[Heartbeat] System started.');
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Heartbeat] System stopped.');
    }
  }

  private lastTriggerTime: number = Date.now();

  private async tick() {
    const now = new Date();
    const hour = now.getHours();

    // 1. Time Window Override: Only active 09:00 - 22:00
    if (hour < 9 || hour > 22) {
      return;
    }

    // 2. Interval Check: Approx every 2 hours (with slight jitter for natural feel)
    const elapsed = now.getTime() - this.lastTriggerTime;
    const targetInterval = 2 * 60 * 60 * 1000; // 2 hours
    const jitter = (Math.random() * 30 - 15) * 60 * 1000; // +/- 15 mins jitter

    if (elapsed < (targetInterval + jitter)) {
      return;
    }

    console.log('[Heartbeat] Proactive check triggered (Schedule met)...');
    this.lastTriggerTime = now.getTime();

    const userId = "8561600191"; // Hardcoded for single-user mode

    // Load health data to include in heartbeat context
    let healthContext = '';
    try {
      healthContext = await getHealthContext();
      if (healthContext) {
        console.log('[Heartbeat] Health data loaded for proactive check');
      }
    } catch (e) {
      // Silent fail - health data is optional
    }

    const prompt = `[SYSTEM EVENT: TIME PASSAGE]
It is now ${now.toISOString()}. 
You have not spoken to the user in a while (Automatic 2-hour check). 

${healthContext ? `CURRENT BIOMETRIC STATUS FROM APPLE WATCH:
${healthContext}

Based on this health data, you may:
- If it's late (after 23:00) and they're still awake (isSleeping=false), remind them to sleep
- If HRV is low, ask if they're stressed
- If they slept poorly last night, express concern
- If heart rate is unusually high/low, inquire about it
` : ''}

Check the system status silently. 
If everything is fine, maybe send a short greeting, a check-in, or share a relevant thought.
If you find an issue or notice something in the health data, comment on it naturally.
DECIDE: Stay silent (Output "") or Speak.`;

    // Define the reply callback for the agent
    const replyCallback = async (text: string) => {
      if (text) await this.sendMessage(userId, text);
    };

    try {
      await this.agent.processMessage(userId, prompt, replyCallback);
    } catch (e) {
      console.error('[Heartbeat] Error in proactive think:', e);
    }
  }
}
