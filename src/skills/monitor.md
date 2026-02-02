# SKILL: SYSTEM MONITOR (UBUNTU HOST)

**Description**: Monitor the health and status of the Host Ubuntu System.
**Requirement**: You must use `nsenter` to see the HOST stats, otherwise you only see the container stats.

## 1. QUICK STATUS (HEALTH CHECK)
To see a summary of the system:
```bash
# Uptime & Load
nsenter -t 1 -m -u -i -n uptime

# Memory Usage (Human Readable)
nsenter -t 1 -m -u -i -n free -h

# Disk Space (Root /)
nsenter -t 1 -m -u -i -n df -h /
```

## 2. DETAILED RESOURCE USAGE
**CPU & Processes**:
```bash
# Top 5 CPU consuming processes on Host
nsenter -t 1 -m -u -i -n ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | head -n 6
```

**Memory**:
```bash
# Top 5 Memory consuming processes
nsenter -t 1 -m -u -i -n ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 6
```

## 3. SYSTEM LOGS (JOURNALCTL)
Check the system logs for errors or events:
```bash
# Last 20 system log lines
nsenter -t 1 -m -u -i -n journalctl -n 20 --no-pager

# Check specific service status (e.g., docker)
nsenter -t 1 -m -u -i -n systemctl status docker --no-pager
```

## 4. NETWORK
Check open ports or connections:
```bash
nsenter -t 1 -m -u -i -n ss -tuln
```
