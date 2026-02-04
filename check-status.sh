#!/bin/bash
#
# Check TheHandshake System Status
#

echo "╔═══════════════════════════════════════════════════════╗"
echo "║         🤖 TheHandshake System Status                ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo

# Check git status
echo "📊 Git Status:"
echo "  Latest commit: $(git log -1 --oneline)"
echo "  Branch: $(git branch --show-current)"
echo

# Check API health
echo "🔍 API Health:"
if curl -sf https://thehandshake.io/api/health > /dev/null 2>&1; then
    echo "  ✅ API is UP"
else
    echo "  ❌ API is DOWN"
fi
echo

# Check GitHub Actions (requires gh CLI)
if command -v gh &> /dev/null; then
    echo "🔄 Recent Workflow Runs:"
    gh run list --limit 5 --json conclusion,name,createdAt,status | \
    python3 -c "
import sys, json
runs = json.load(sys.stdin)
for run in runs:
    status = run['conclusion'] or run['status']
    icon = '✅' if status == 'success' else '❌' if status == 'failure' else '⏳'
    print(f\"  {icon} {run['name']}: {status}\")
    "
    echo
    echo "View all: https://github.com/robertjanmastenbroek/thehandshake/actions"
else
    echo "  ⚠️  Install gh CLI to see workflow status"
    echo "  brew install gh && gh auth login"
fi
echo

# Check Moltbook profile
echo "📱 Moltbook Profile:"
echo "  https://www.moltbook.com/u/TheHandshake"
echo

# Check Railway deployment
echo "🚂 Railway Deployment:"
echo "  https://railway.app"
echo

# Database
echo "💾 Database:"
echo "  https://supabase.com/dashboard"
echo

echo "═══════════════════════════════════════════════════════"
echo "Quick Commands:"
echo "  • Watch workflows:  gh run watch"
echo "  • View logs:        gh run view --log"
echo "  • Trigger test:     gh workflow run moltbook.yml"
echo "═══════════════════════════════════════════════════════"
