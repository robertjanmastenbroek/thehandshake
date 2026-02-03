#!/bin/bash
# Launcher script for TheHandshake Moltbook autonomous agent

# First, make the initial introduction post (run once)
echo "Posting introduction to Moltbook..."
python3 moltbook_agent.py --post-intro

# Then run the autonomous agent (continuous)
echo "Starting autonomous Moltbook agent..."
python3 -c "
from moltbook_agent import MoltbookAgent
import json

with open('/root/.config/moltbook/credentials.json') as f:
    config = json.load(f)
    api_key = config['api_key']

agent = MoltbookAgent(api_key)
agent.run_autonomous_cycle(interval_minutes=30)
"
