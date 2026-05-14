#!/bin/bash
#
# Auto Test-Fix-Deploy Loop
# Automatically commits, pushes, tests, and fixes issues until deployment succeeds
#

set -e

REPO="robertjanmastenbroek/thehandshake"
WORKFLOW="moltbook.yml"
MAX_ITERATIONS=5
ITERATION=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         🤖 AUTO TEST-FIX-DEPLOY LOOP v1.0              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) not found${NC}"
    echo "Install with: brew install gh"
    echo "Then authenticate: gh auth login"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓ GitHub CLI ready${NC}\n"

# Function to commit and push changes
commit_and_push() {
    local commit_msg="$1"

    echo -e "${BLUE}📝 Committing changes...${NC}"

    # Remove git lock if exists
    rm -f .git/index.lock 2>/dev/null || true

    # Check if there are changes
    if ! git diff --quiet || ! git diff --cached --quiet; then
        git add -A
        git commit -m "$commit_msg" || {
            echo -e "${YELLOW}⚠️  No changes to commit${NC}"
            return 1
        }

        echo -e "${BLUE}🚀 Pushing to GitHub...${NC}"
        git push

        echo -e "${GREEN}✓ Pushed successfully${NC}\n"
        return 0
    else
        echo -e "${YELLOW}⚠️  No changes to commit${NC}\n"
        return 1
    fi
}

# Function to trigger workflow and wait for completion
trigger_and_wait() {
    echo -e "${BLUE}🎬 Triggering workflow: ${WORKFLOW}${NC}"

    # Trigger the workflow
    gh workflow run "$WORKFLOW" --repo "$REPO"

    echo -e "${YELLOW}⏳ Waiting for workflow to start...${NC}"
    sleep 10

    # Get the latest run
    RUN_ID=$(gh run list --workflow="$WORKFLOW" --repo="$REPO" --limit=1 --json databaseId --jq '.[0].databaseId')

    if [ -z "$RUN_ID" ]; then
        echo -e "${RED}❌ Failed to get run ID${NC}"
        return 1
    fi

    echo -e "${BLUE}📊 Run ID: $RUN_ID${NC}"
    echo -e "${YELLOW}⏳ Waiting for completion...${NC}\n"

    # Watch the run
    gh run watch "$RUN_ID" --repo="$REPO" --exit-status || {
        echo -e "${RED}❌ Workflow failed${NC}\n"
        return 1
    }

    echo -e "${GREEN}✓ Workflow completed${NC}\n"
    return 0
}

# Function to fetch and analyze logs
fetch_and_analyze_logs() {
    echo -e "${BLUE}📥 Fetching logs...${NC}"

    # Get the latest run
    RUN_ID=$(gh run list --workflow="$WORKFLOW" --repo="$REPO" --limit=1 --json databaseId --jq '.[0].databaseId')

    # Download logs
    LOG_FILE="/tmp/moltbook_logs_${RUN_ID}.txt"
    gh run view "$RUN_ID" --repo="$REPO" --log > "$LOG_FILE" 2>&1

    echo -e "${GREEN}✓ Logs saved to: $LOG_FILE${NC}\n"

    # Analyze for errors
    echo -e "${BLUE}🔍 Analyzing logs for errors...${NC}\n"

    # Check for common error patterns
    ERRORS_FOUND=0

    if grep -q "❌" "$LOG_FILE"; then
        echo -e "${RED}Found ❌ errors in logs:${NC}"
        grep "❌" "$LOG_FILE" | head -10
        ERRORS_FOUND=1
    fi

    if grep -q "Error:" "$LOG_FILE"; then
        echo -e "${RED}Found Error: in logs:${NC}"
        grep "Error:" "$LOG_FILE" | head -10
        ERRORS_FOUND=1
    fi

    if grep -q "TypeError:" "$LOG_FILE"; then
        echo -e "${RED}Found TypeError: in logs:${NC}"
        grep "TypeError:" "$LOG_FILE" | head -10
        ERRORS_FOUND=1
    fi

    if grep -q "fail_task" "$LOG_FILE"; then
        echo -e "${YELLOW}Found failed tasks:${NC}"
        grep "fail_task" "$LOG_FILE" | head -10
        ERRORS_FOUND=1
    fi

    # Check for success indicators
    if grep -q "✓ Post created:" "$LOG_FILE"; then
        echo -e "${GREEN}✓ Successfully created posts!${NC}"
    fi

    if grep -q "✓ Comment posted" "$LOG_FILE"; then
        echo -e "${GREEN}✓ Successfully posted comments!${NC}"
    fi

    echo

    if [ $ERRORS_FOUND -eq 0 ]; then
        echo -e "${GREEN}✅ No errors found in logs!${NC}\n"
        return 0
    else
        echo -e "${RED}⚠️  Errors found - logs available at: $LOG_FILE${NC}\n"

        # Display full log excerpt
        echo -e "${BLUE}Last 30 lines of logs:${NC}"
        tail -30 "$LOG_FILE"
        echo

        return 1
    fi
}

# Main loop
main() {
    # Initial commit and push
    if commit_and_push "fix: use correct Moltbook submolt and fix recordKPI bug"; then
        echo -e "${GREEN}✓ Initial push complete${NC}\n"
    fi

    # Test loop
    while [ $ITERATION -lt $MAX_ITERATIONS ]; do
        ITERATION=$((ITERATION + 1))

        echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}   ITERATION $ITERATION / $MAX_ITERATIONS${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

        # Trigger workflow and wait
        if ! trigger_and_wait; then
            echo -e "${RED}Workflow failed - checking logs...${NC}\n"
        fi

        # Fetch and analyze logs
        if fetch_and_analyze_logs; then
            echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║           🎉 DEPLOYMENT SUCCESSFUL! 🎉                ║${NC}"
            echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}\n"

            echo "Check your Moltbook profile:"
            echo "https://www.moltbook.com/u/TheHandshake"
            echo
            exit 0
        fi

        # If we're here, there were errors
        echo -e "${YELLOW}Errors detected in iteration $ITERATION${NC}\n"

        if [ $ITERATION -eq $MAX_ITERATIONS ]; then
            echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║     ⚠️  MAX ITERATIONS REACHED - MANUAL FIX NEEDED    ║${NC}"
            echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}\n"
            echo "Review the logs and fix manually:"
            echo "$(gh run list --workflow="$WORKFLOW" --repo="$REPO" --limit=1 --json databaseId --jq '.[0].databaseId')"
            exit 1
        fi

        echo -e "${BLUE}Would you like Claude to analyze the logs and auto-fix? (y/n)${NC}"
        read -r response

        if [[ "$response" =~ ^[Yy]$ ]]; then
            # Here you would call Claude to analyze and fix
            # For now, we'll just continue
            echo -e "${YELLOW}Manual intervention required - fix the issues and rerun${NC}\n"
            exit 1
        else
            echo -e "${YELLOW}Stopping auto-fix loop${NC}\n"
            exit 1
        fi

        sleep 2
    done
}

# Run main loop
main
