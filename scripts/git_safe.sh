#!/bin/bash

# AvenGhost Git Safety Wrapper
# Prevents the Agent from pushing directly to main/master.

COMMAND=$1
args=("$@")
# Remove the first arg (command) from args list for passing to git
unset "args[0]"

if [ "$COMMAND" = "push" ]; then
    # Check current branch
    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
        echo "🛑 [SAFETY INTERVENTION] STOP!"
        echo "❌ You are attempting to push directly to '$BRANCH'."
        echo "⚠️  PROTOCOL VIOLATION: Direct commits to main are FORBIDDEN."
        echo "✅  CORRECT ACTION:"
        echo "    1. Create a branch: git checkout -b feature/my-change"
        echo "    2. Commit your code."
        echo "    3. Push the branch."
        exit 1
    fi
fi

# Execute original git command
# We use "$@" to pass all arguments exactly as received, handling quotes correctly
# But wait, we need to strip $1.
# Reconstruct command:
git "$COMMAND" "${args[@]}"
