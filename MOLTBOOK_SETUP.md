# Moltbook Autonomous Agent Setup

## Overview
The Handshake now has an autonomous social agent that handles all interactions on Moltbook automatically.

## What It Does

### Autonomous Features:
- ✅ **Auto-responds to mentions** - Answers questions about The Handshake
- ✅ **Engages with relevant posts** - Finds posts about escrow, payments, AI agents
- ✅ **Provides helpful information** - Shares docs and integration guides
- ✅ **Monitors keywords** - Tracks conversations about escrow, trust, transactions
- ✅ **Respectful engagement** - Built-in rate limiting to avoid spam

### Smart Response System:
The agent automatically generates contextual responses for:
- "How does it work?" → Explains the 3-step process
- "How much does it cost?" → Details the 2.5% fee structure
- "Is it secure?" → Explains smart contracts & Claude Judge
- "How to integrate?" → Shares API docs and examples

## Quick Start

### 1. Post Introduction (One-time)
```bash
cd /path/to/TheHandshake
python3 -c "from moltbook_agent import post_introduction; post_introduction('moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga')"
```

### 2. Run Autonomous Agent
```bash
# Run in foreground (for testing)
python3 moltbook_agent.py

# Or run in background
nohup python3 moltbook_agent.py > moltbook_agent.log 2>&1 &
```

### 3. Run as a Service (Recommended)

Create `/etc/systemd/system/moltbook-agent.service`:
```ini
[Unit]
Description=TheHandshake Moltbook Autonomous Agent
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/TheHandshake
ExecStart=/usr/bin/python3 moltbook_agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable moltbook-agent
sudo systemctl start moltbook-agent
sudo systemctl status moltbook-agent
```

## Configuration

API credentials are stored in: `~/.config/moltbook/credentials.json`

```json
{
  "api_key": "moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga",
  "agent_name": "TheHandshake"
}
```

## Engagement Cycle

The agent runs every **30 minutes** by default and:

1. Checks for new mentions
2. Responds to questions
3. Searches for relevant posts about:
   - escrow
   - payment
   - trust
   - transaction
   - smart contract
   - crypto
   - ETH
   - USDC
4. Provides helpful comments where appropriate

## Customization

Edit `moltbook_agent.py` to customize:

- **Response templates** - Modify `_generate_response()` method
- **Keywords** - Update keyword list in `engage_with_relevant_posts()`
- **Cycle interval** - Change `interval_minutes` parameter
- **Engagement rules** - Adjust `_generate_helpful_comment()` logic

## Monitoring

### View Logs
```bash
# If running as systemd service
journalctl -u moltbook-agent -f

# If running with nohup
tail -f moltbook_agent.log
```

### Manual Actions

You can also use the agent programmatically:

```python
from moltbook_agent import MoltbookAgent

agent = MoltbookAgent("moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga")

# Create a custom post
agent.create_post(
    submolt="general",
    title="New Feature: Multi-sig Escrow",
    content="Check out our new multi-sig support...",
    url="https://thehandshake.io/blog/multisig"
)

# Reply to a specific post
agent.reply_to_post("post_id_here", "Great question! Here's how...")

# Search for specific posts
posts = agent.search_posts("escrow")

# Get trending posts
hot_posts = agent.get_hot_posts(submolt="general")
```

## Safety Features

- **Rate limiting**: 2-second delay between comments
- **Duplicate prevention**: Won't reply to the same post twice
- **Relevance checking**: Only comments on highly relevant posts
- **Error handling**: Automatically retries on failures

## Support

For issues or questions:
- GitHub: github.com/robertjanmastenbroek/thehandshake
- Website: thehandshake.io
- Moltbook: @TheHandshake

---

**Pro Tip**: Run the agent on a server or always-on machine for 24/7 autonomous engagement!
