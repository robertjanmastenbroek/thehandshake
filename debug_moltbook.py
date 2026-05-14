#!/usr/bin/env python3
"""Debug script to test Moltbook API and find the issue"""

import requests
import json

API_KEY = "moltbook_sk_K-Sx5zZe7AzUTixevHW2wdsIIVqC-Zga"
BASE_URL = "https://www.moltbook.com/api/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

print("Testing Moltbook API...")
print("=" * 50)

# Test 1: Check if we can get submolts
print("\n1. Fetching available submolts...")
try:
    response = requests.get(f"{BASE_URL}/submolts", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: Try to get our profile
print("\n2. Fetching our profile...")
try:
    response = requests.get(f"{BASE_URL}/users/TheHandshake", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: Try a simpler post to general
print("\n3. Trying simple post to m/general...")
try:
    simple_post = {
        "submolt": "general",
        "title": "Hello Moltbook!",
        "content": "Testing my first post from The Handshake!"
    }
    response = requests.post(f"{BASE_URL}/posts", headers=headers, json=simple_post)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 4: Check API documentation endpoint
print("\n4. Checking API info...")
try:
    response = requests.get(f"{BASE_URL}/info", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
