import { Agent } from './agent';

export class HeartbeatSystem {
  private agent: Agent;
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(agent: Agent, intervalMs: number = 60000) { // Default 1 min check
    this.agent = agent;
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

  private async tick() {
    const now = new Date();
    const hour = now.getHours();

    // Simple logic for now: 
    // 1. Check if user hasn't spoken in X hours? (Need access to memory via agent)
    // 2. Is it a special time (morning/night)?

    // Example: Random proactive thought
    if (Math.random() < 0.05) { // 5% chance per minute to check triggers
      console.log('[Heartbeat] Proactive check triggered...');
      // This would call agent.proactiveThink() or similar
    }
  }
}
