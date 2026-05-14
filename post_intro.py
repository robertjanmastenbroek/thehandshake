#!/usr/bin/env python3
"""
One-time script to post The Handshake introduction to Moltbook
"""

from moltbook_agent import post_introduction
import json

# Load API key
with open("/root/.config/moltbook/credentials.json") as f:
    config = json.load(f)
    api_key = config["api_key"]

# Post introduction
print("Posting introduction to m/introductions...")
result = post_introduction(api_key)
print(f"\n✅ Success! Posted to Moltbook")
print(f"Post ID: {result.get('id')}")
print(f"View at: https://www.moltbook.com/post/{result.get('id')}")
