# Auto Test-Fix-Deploy System 🤖

Never manually check logs and fix bugs again. This system automatically:
1. ✅ Commits and pushes your code
2. ✅ Triggers GitHub Actions tests
3. ✅ Fetches and analyzes logs
4. ✅ Uses Claude AI to fix any errors
5. ✅ Commits fixes and retests
6. ✅ Loops until all tests pass

## Quick Start

### One Command
```bash
./test-fix-deploy
```

That's it! The script will:
- Commit your current changes
- Push to GitHub
- Trigger Moltbook agent
- Wait for completion
- Analyze logs with Claude AI
- Auto-fix any errors
- Repeat until successful

## How It Works

### 1. Initial Setup (One-time)

Install GitHub CLI:
```bash
brew install gh
gh auth login
```

Install Python dependencies:
```bash
pip3 install anthropic --break-system-packages
```

### 2. The Auto-Fix Loop

```
┌─────────────────────────────────────────┐
│  1. Commit & Push Code                  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  2. Trigger GitHub Actions              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  3. Wait for Workflow Completion        │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  4. Fetch Logs                          │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  5. Claude AI Analyzes Logs             │
│     • Identifies errors                 │
│     • Finds root causes                 │
│     • Determines affected files         │
└────────────┬────────────────────────────┘
             │
             ▼
        ┌────────┐
        │ Errors?│
        └───┬────┘
            │
    ┌───────┴───────┐
    │               │
   YES             NO
    │               │
    ▼               ▼
┌────────┐    ┌─────────┐
│Generate│    │ SUCCESS!│
│  Fix   │    └─────────┘
└───┬────┘
    │
    ▼
┌────────┐
│ Apply  │
│  Fix   │
└───┬────┘
    │
    ▼
┌────────┐
│Commit &│
│  Push  │
└───┬────┘
    │
    └──────► (Loop back to step 2)
```

### 3. What Gets Fixed Automatically

The system can fix:
- ✅ **Syntax errors** - Missing semicolons, brackets, etc.
- ✅ **Type errors** - Wrong function signatures, undefined methods
- ✅ **API errors** - Invalid endpoints, auth issues, malformed requests
- ✅ **Logic errors** - Incorrect conditionals, wrong variable usage
- ✅ **Import errors** - Missing modules, wrong paths
- ✅ **Configuration errors** - Invalid settings, wrong environment vars

**What requires manual intervention:**
- ❌ Missing API keys (you need to add them)
- ❌ Infrastructure issues (Railway, Supabase down)
- ❌ Architectural changes (need human decision)

## Example Session

```bash
$ ./test-fix-deploy

🤖 TheHandshake Auto Test-Fix-Deploy

╔══════════════════════════════════════════════════════════╗
║         🤖 AUTO-FIX LOOP v1.0                           ║
╚══════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════
   ITERATION 1 / 3
═══════════════════════════════════════════════════════

📥 Fetching latest GitHub Actions logs...
📊 Latest run: 12345678 (failure)

🤖 Analyzing logs with Claude...

⚠️  Found 2 error(s):

1. TypeError: this.supabase.rpc(...).catch is not a function
   File: agents/agent_core.js
   Fix needed: Use async/await instead of .catch()

2. 404 Not Found: Submolt 'm/discussions' not found
   File: agents/moltbook_agent.js
   Fix needed: Change submolt to 'general'

🤖 Auto-fix these issues? (y/n): y

🔧 Generating fix for agents/agent_core.js...
✓ Applied fix to agents/agent_core.js

🔧 Generating fix for agents/moltbook_agent.js...
✓ Applied fix to agents/moltbook_agent.js

📝 Committing fixes...
🚀 Pushing to GitHub...
✓ Pushed successfully

⏳ Waiting 30s for workflow to start...

═══════════════════════════════════════════════════════
   ITERATION 2 / 3
═══════════════════════════════════════════════════════

📥 Fetching latest GitHub Actions logs...
📊 Latest run: 12345679 (success)

🤖 Analyzing logs with Claude...

╔═══════════════════════════════════════════════════════╗
║           🎉 NO ERRORS FOUND! 🎉                      ║
╚═══════════════════════════════════════════════════════╝

All tests passed! Moltbook agent successfully created posts.

Check your profile: https://www.moltbook.com/u/TheHandshake
```

## Manual Commands

If you want more control:

### Just push changes:
```bash
cd the-handshake
git add -A
git commit -m "your message"
git push
```

### Trigger workflow manually:
```bash
gh workflow run moltbook.yml
```

### Watch workflow live:
```bash
gh run watch
```

### View latest logs:
```bash
gh run view --log
```

### Analyze logs with Claude:
```bash
python3 scripts/auto_fix.py
```

## Configuration

### Environment Variables
```bash
# Required
export ANTHROPIC_API_KEY=sk-ant-...

# Optional
export AUTO_FIX_MAX_ITERATIONS=3  # Default: 3
export AUTO_FIX_WAIT_TIME=30      # Seconds to wait between iterations
```

### Workflow Settings

Edit `.github/workflows/moltbook.yml` to change:
- Trigger schedule
- Node version
- Environment variables

## Tips & Tricks

### 1. **Run on every push**
Add this to your `.git/hooks/post-commit`:
```bash
#!/bin/bash
git push && ./test-fix-deploy
```

### 2. **Watch logs in real-time**
```bash
gh run watch --exit-status
```

### 3. **Test locally first**
```bash
node agents/moltbook_agent.js
```

### 4. **Rollback if needed**
```bash
git revert HEAD
git push
```

## Troubleshooting

### "gh: command not found"
```bash
brew install gh
gh auth login
```

### "Module 'anthropic' not found"
```bash
pip3 install anthropic --break-system-packages
```

### "Authentication failed"
```bash
gh auth login
# Select: GitHub.com
# Protocol: HTTPS
# Authenticate: Login with a web browser
```

### "Max iterations reached"
The auto-fixer tried 3 times but couldn't resolve all issues. This usually means:
- API key missing or invalid
- External service down (Moltbook, Supabase)
- Complex architectural issue

**Solution:** Check the logs manually:
```bash
gh run view --log | grep "❌"
```

## Advanced Usage

### Custom Analysis

Create custom analyzers for specific error patterns:

```python
# scripts/custom_analyzer.py
from auto_fix import AutoFixer

class CustomFixer(AutoFixer):
    def analyze_logs_with_claude(self, logs):
        # Your custom analysis logic
        pass

fixer = CustomFixer()
fixer.auto_fix_loop()
```

### Slack Notifications

Get notified when auto-fix completes:

```bash
# Add to test-fix-deploy
if python3 scripts/auto_fix.py; then
    curl -X POST $SLACK_WEBHOOK \
         -d '{"text":"✅ Auto-fix successful!"}'
else
    curl -X POST $SLACK_WEBHOOK \
         -d '{"text":"❌ Auto-fix failed - check logs"}'
fi
```

## Cost Estimation

**GitHub Actions:**
- Free tier: 2,000 minutes/month
- Each Moltbook run: ~2 minutes
- Capacity: ~1,000 runs/month free

**Claude API:**
- ~500 tokens per analysis
- ~2,000 tokens per fix
- Cost: ~$0.01 per fix iteration
- Monthly (if fixing daily): ~$0.30

**Total monthly cost:** ~$0-5 (effectively free)

## Roadmap

Future improvements:
- [ ] Support for all agents (not just Moltbook)
- [ ] Parallel testing (test multiple agents at once)
- [ ] ML-based error prediction (prevent issues before they happen)
- [ ] Automatic PR creation for complex fixes
- [ ] Integration with Linear/Jira for ticket creation
- [ ] Performance regression detection
- [ ] Cost tracking and optimization

## Why This Matters

**Before Auto-Fix:**
1. Make code changes (5 min)
2. Commit and push (1 min)
3. Wait for workflow (3 min)
4. Check logs manually (2 min)
5. Copy logs to Claude (1 min)
6. Wait for Claude analysis (1 min)
7. Implement fixes (5 min)
8. Repeat steps 2-7 until working (15 min)

**Total: ~33 minutes per deployment cycle**

**With Auto-Fix:**
1. Run `./test-fix-deploy` (1 min)
2. Wait for completion (10 min, automated)

**Total: ~11 minutes per deployment cycle**

**Time saved: 22 minutes (67% faster)**

Over a month (20 deployments): **~7 hours saved**

---

## Support

Issues? Questions?
- Check logs: `gh run view --log`
- View latest run: `gh run list --limit=1`
- Manual trigger: `gh workflow run moltbook.yml`

---

**Built with ❤️ by TheHandshake**
*Making AI agent development autonomous since 2025*
