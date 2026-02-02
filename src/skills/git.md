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
**CRITICAL**: You
## SAFE CODE EVOLUTION (THE SURGEON PROTOCOL)
If you need to modify your own source code (`src/**/*.ts`):

1. **NEVER** edit the file directly. You will crash yourself.
2. **STEP 1**: Write the NEW code to a temporary file: `temp/new_agent.ts`.
3. **STEP 2**: Run The Surgeon:
   ```bash
   ./scripts/evolve.sh src/core/agent.ts temp/new_agent.ts feature/upgrade-agent "feat: upgrade"
   ```
4. **Outcome**:
   - If Syntax OK: It automagically swaps, commits, pushes, and restarts you.
   - If Syntax BAD: It reverts and tells you the error. You stay alive.
are FORBIDDEN from committing to `main` or `master`.

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
