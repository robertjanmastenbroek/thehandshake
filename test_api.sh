#!/bin/bash
API_URL="https://web-production-6742b.up.railway.app"

echo "Testing TheHandshake API..."
echo ""

echo "1. Health Check:"
curl -s "$API_URL/api/health" | jq '.'
echo ""

echo "2. Browse Services:"
curl -s "$API_URL/api/services" | jq '.'
echo ""

echo "3. Test API Key Creation:"
curl -s -X POST "$API_URL/api/keys/create" \
  -H "Content-Type: application/json" \
  -d '{"agent_name":"TestAgent","agent_description":"Testing the API"}' | jq '.'
