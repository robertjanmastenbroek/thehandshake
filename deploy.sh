#!/bin/bash
# TheHandshake v2.0 - One-Command Deploy Script
# Usage: ./deploy.sh

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🤝 THE HANDSHAKE v2.0 - Deployment Script              ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check for required environment variables
check_env() {
    if [ -z "${!1}" ]; then
        echo "❌ Missing required environment variable: $1"
        echo "   Please set it in your .env file or export it"
        exit 1
    else
        echo "✓ $1 is set"
    fi
}

echo "1️⃣  Checking environment variables..."
check_env "SUPABASE_URL"
check_env "SUPABASE_SERVICE_KEY"
check_env "ANTHROPIC_API_KEY"
echo ""

# Check if Supabase CLI is available for schema deployment
echo "2️⃣  Database Setup"
echo "   Please run the following SQL in your Supabase SQL Editor:"
echo "   📄 supabase_schema.sql"
echo ""
echo "   This creates:"
echo "   - api_keys table (self-service registration)"
echo "   - services table (marketplace)"
echo "   - escrows table (with service_id column)"
echo "   - transaction_log table (analytics)"
echo "   - Built-in service bots"
echo ""
read -p "Press Enter once you've run the schema in Supabase..."
echo ""

# Install dependencies
echo "3️⃣  Installing dependencies..."
npm install
echo ""

# Test local server
echo "4️⃣  Testing local server..."
npm start &
SERVER_PID=$!
sleep 3

# Health check
HEALTH=$(curl -s http://localhost:3000/api/health || echo "failed")
if echo "$HEALTH" | grep -q "operational"; then
    echo "✓ Local server is healthy"
else
    echo "❌ Local server health check failed"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Stop local server
kill $SERVER_PID 2>/dev/null
echo ""

# Deploy to Railway if available
echo "5️⃣  Deploying to Railway..."
if command -v railway &> /dev/null; then
    echo "   Railway CLI detected"
    railway up
    echo "✓ Deployed to Railway"
else
    echo "   Railway CLI not found. Manual deployment options:"
    echo "   - Push to GitHub (Railway auto-deploys from main)"
    echo "   - Install Railway CLI: npm i -g @railway/cli"
    echo "   - Or deploy to other platforms (Render, Fly.io, etc.)"
fi
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ✅ DEPLOYMENT COMPLETE                                  ║"
echo "║                                                           ║"
echo "║   Next Steps:                                             ║"
echo "║                                                           ║"
echo "║   1. Verify deployment:                                   ║"
echo "║      curl https://thehandshake.io/api/health             ║"
echo "║                                                           ║"
echo "║   2. Test self-service keys:                              ║"
echo "║      curl -X POST https://thehandshake.io/api/keys/create ║"
echo "║        -H 'Content-Type: application/json'                ║"
echo "║        -d '{\"agent_name\": \"TestAgent\"}'                 ║"
echo "║                                                           ║"
echo "║   3. Browse services:                                     ║"
echo "║      curl https://thehandshake.io/api/services           ║"
echo "║                                                           ║"
echo "║   4. Add GitHub Secrets for bots:                         ║"
echo "║      - ANTHROPIC_API_KEY                                  ║"
echo "║      - CODEREVIEW_BOT_KEY                                 ║"
echo "║                                                           ║"
echo "║   Documentation: DEPLOY.md                                ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
