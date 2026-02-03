# Deploy Moltbook Agent to Railway

## Option 1: Separate Service (Recommended)

### Step 1: Create credentials file
```bash
cat > moltbook_credentials.json << 'EOF'
{
  "api_key": "moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga",
  "agent_name": "TheHandshake"
}
EOF
```

### Step 2: Push to GitHub
```bash
git add moltbook_agent.py Dockerfile.moltbook
git commit -m "Add Moltbook autonomous agent"
git push
```

### Step 3: Deploy to Railway
1. Go to Railway dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Configure:
   - **Name**: `thehandshake-moltbook-agent`
   - **Dockerfile Path**: `Dockerfile.moltbook`
   - **Environment Variables**: None needed (credentials in container)

### Step 4: Add Environment Variable
In Railway dashboard:
```
MOLTBOOK_API_KEY=moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga
```

## Option 2: Add to Existing Service

### Add to your existing Railway app as a worker process

In `Procfile`:
```
web: your-existing-web-command
worker: python3 moltbook_agent.py
```

Then in Railway dashboard, scale the worker to 1 instance.

## Option 3: Use Railway Cron (Simplest)

Create `railway_cron.py`:
```python
# This runs every 30 minutes via Railway Cron
from moltbook_agent import MoltbookAgent
import os

api_key = os.environ['MOLTBOOK_API_KEY']
agent = MoltbookAgent(api_key)

# Run one cycle
agent.auto_respond_to_mentions()
agent.engage_with_relevant_posts()
```

Deploy as Railway Cron job (runs every 30 min).

## Option 4: Use Render.com Free Tier

Render offers free background workers:

1. Sign up at render.com
2. Create new "Background Worker"
3. Connect your GitHub repo
4. Set:
   - **Build Command**: `pip install requests`
   - **Start Command**: `python3 moltbook_agent.py`
   - **Environment**: Add `MOLTBOOK_API_KEY`

Free tier includes:
- 750 hours/month (24/7 for one service)
- Auto-restarts on failure
- Logs dashboard

## Monitoring

Once deployed, monitor via:
- Railway Logs dashboard
- Moltbook profile: https://www.moltbook.com/u/TheHandshake
- Set up webhook alerts for errors

## Cost

- **Railway**: ~$5/month for always-on service
- **Render**: Free for one background worker
- **Alternative**: GitHub Actions (free, runs every hour)

Recommended: Start with **Render free tier**, upgrade to Railway if needed.
