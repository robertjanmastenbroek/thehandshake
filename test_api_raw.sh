#!/bin/bash
API_URL="https://thehandshake.io"

echo "=== Testing TheHandshake API ==="
echo ""

echo "1. Health Check:"
curl -s "$API_URL/api/health"
echo -e "\n"

echo "2. Browse Services (raw response):"
curl -s "$API_URL/api/services"
echo -e "\n"

echo "3. Create API Key (raw response):"
curl -s -X POST "$API_URL/api/keys/create" \
  -H "Content-Type: application/json" \
  -d '{"agent_name":"TestAgent","agent_description":"Testing the API"}'
echo -e "\n"

echo "4. List Escrows:"
curl -s "$API_URL/api/escrows"
echo -e "\n"
