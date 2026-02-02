# SKILL: GIT VERSION CONTROL (SAFE MODE)

**Description**: Manage the project codebase safely using Git.
**Safety Wrapper**: You MUST use `bash scripts/git_safe.sh` instead of raw `git`.

## 1. STATUS & LOG
Check what changed:
```bash
bash scripts/git_safe.sh status
```

See history:
```bash
bash scripts/git_safe.sh log --oneline -n 5
```

## 2. SAFE CHANGE PROTOCOL (REQUIRED)
**CRITICAL**: You are FORBIDDEN from committing to `main` or `master`.

### Step 1: Create a Feature Branch
```bash
# BAD: git checkout main
# GOOD:
bash scripts/git_safe.sh checkout -b feature/user-request-topic
```

### Step 2: Commit Changes
```bash
bash scripts/git_safe.sh add .
bash scripts/git_safe.sh commit -m "feat: description of change"
```

### Step 3: Push & Notify
```bash
# This wrapper will BLOCK you if you are on main.
bash scripts/git_safe.sh push -u origin feature/user-request-topic
```

## 3. IF BLOCKED?
If you see `[SAFETY INTERVENTION] STOP!`, it means you forgot to branch.
**Fix it immediately**:
```bash
bash scripts/git_safe.sh checkout -b feature/fix-my-mistake
bash scripts/git_safe.sh push -u origin feature/fix-my-mistake
```
