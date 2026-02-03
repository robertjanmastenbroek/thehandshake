# Moltbook Agent Deployment Options

You have 4 options to run the Moltbook agent 24/7 without your laptop:

## 🆓 Option 1: GitHub Actions (FREE)

**Cost**: $0
**Runs**: Every 30 minutes
**Setup time**: 2 minutes

### Setup:
1. Add GitHub Secret:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add secret: `MOLTBOOK_API_KEY` = `moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga`

2. Push the workflow file:
```bash
git add .github/workflows/moltbook_agent.yml moltbook_agent.py
git commit -m "Add Moltbook agent with GitHub Actions"
git push
```

3. Done! Check Actions tab to see it running.

**Pros**:
- ✅ Completely free
- ✅ No credit card needed
- ✅ Integrated with GitHub
- ✅ 2000 free minutes/month (way more than needed)

**Cons**:
- ⚠️ Runs every 30 min (not continuous)
- ⚠️ Slight delay in responses

---

## 🌐 Option 2: Render.com (FREE)

**Cost**: $0
**Runs**: 24/7 continuous
**Setup time**: 5 minutes

### Setup:
1. Sign up at render.com
2. New → Background Worker
3. Connect your GitHub repo
4. Configure:
   - **Build**: `pip install requests`
   - **Start**: `python3 moltbook_agent.py`
   - **Environment**: Add `MOLTBOOK_API_KEY`

**Pros**:
- ✅ Free tier includes 750 hours/month (enough for 24/7)
- ✅ Continuous monitoring
- ✅ Auto-restart on failure
- ✅ Good logs dashboard

**Cons**:
- ⚠️ Free tier sleeps after 15 min inactivity (but wakes up)

---

## 🚂 Option 3: Railway (PAID)

**Cost**: ~$5/month
**Runs**: 24/7 continuous
**Setup time**: 3 minutes

### Setup:
1. Railway dashboard → New Project
2. Deploy from GitHub
3. Add environment variable: `MOLTBOOK_API_KEY`
4. Deploy

**Pros**:
- ✅ Most reliable
- ✅ Great for production
- ✅ You're already using it for main app
- ✅ Easy to manage together

**Cons**:
- 💰 Costs money ($5/mo)

---

## 🏠 Option 4: Raspberry Pi / Home Server (ONE-TIME COST)

**Cost**: $35-50 for Pi, then free
**Runs**: 24/7 continuous
**Setup time**: 15 minutes

### Setup:
```bash
# On your Pi:
git clone your-repo
cd the-handshake
python3 moltbook_agent.py

# Or install as systemd service (see MOLTBOOK_SETUP.md)
```

**Pros**:
- ✅ One-time cost
- ✅ Full control
- ✅ Can run other services

**Cons**:
- ⚠️ Need hardware
- ⚠️ Need stable internet

---

## 🎯 My Recommendation

**For you**: Start with **GitHub Actions** (Option 1)

Why:
1. ✅ **Completely free** - no credit card
2. ✅ **2 minute setup** - just push and done
3. ✅ **Good enough** - 30 min cycle is fine for social media
4. ✅ **No maintenance** - GitHub handles everything

The 30-minute cycle is perfect for social engagement. You don't need instant responses on Moltbook.

Later, if you want faster responses, upgrade to Render free tier or Railway.

---

## Quick Start (GitHub Actions)

Run this from your terminal:

```bash
cd ~/path/to/the-handshake

# Copy the workflow file (already created in .github/workflows/)
git add .github/workflows/moltbook_agent.yml
git add moltbook_agent.py
git commit -m "Add autonomous Moltbook agent"
git push

# Then add the secret on GitHub:
# 1. Go to: https://github.com/robertjanmastenbroek/thehandshake/settings/secrets/actions
# 2. Click "New repository secret"
# 3. Name: MOLTBOOK_API_KEY
# 4. Value: moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga
# 5. Click "Add secret"

# Test it manually:
# Go to Actions tab → Moltbook Autonomous Agent → Run workflow
```

That's it! Your agent will now run every 30 minutes forever, for free.
