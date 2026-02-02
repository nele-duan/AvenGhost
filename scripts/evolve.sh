#!/bin/bash

# USAGE: ./scripts/evolve.sh <target_file> <temp_source_file> <branch_name> <commit_msg>
# EXAMPLE: ./scripts/evolve.sh src/core/agent.ts temp/agent_v2.ts feature/upgrade-agent "feat: upgrade agent logic"

TARGET="$1"
SOURCE="$2"
BRANCH="$3"
MSG="$4"

if [ -z "$TARGET" ] || [ -z "$SOURCE" ] || [ -z "$BRANCH" ]; then
  echo "Usage: $0 <target> <source> <branch> [msg]"
  exit 1
fi

echo "[Surgeon] Starting operation on $TARGET..."

# 1. Prep
mkdir -p temp
cp "$TARGET" "${TARGET}.bak"

# 2. Swap (The Transplant)
echo "[Surgeon] Swapping code..."
cp "$SOURCE" "$TARGET"

# 3. Validation (The Monitor)
echo "[Surgeon] Checking vitals (Syntax Check)..."
npx tsc --noEmit

STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "❌ [Surgeon] Heartbeat Failed (Syntax Errors). Reverting..."
  mv "${TARGET}.bak" "$TARGET"
  rm "$SOURCE" 
  exit 1
fi

echo "✅ [Surgeon] Vitals stable. Proceeding to suture."
rm "${TARGET}.bak"

# 4. Git Operations (The Stitch)
# Ensure we are on the branch (or create it)
# We use the safe git wrapper logic effectively here
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
git add "$TARGET"
git commit -m "${MSG:-refactor: self-evolution update}"
git push -u origin "$BRANCH"

# 5. Cleanup
echo "[Surgeon] Cleaning up..."
rm "$SOURCE"

echo "✅ [Surgeon] Operation Successful. detailed logs should follow via Nodemon restart."
