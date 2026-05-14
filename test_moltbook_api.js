/**
 * Test Moltbook API directly to diagnose posting issues
 */

require('dotenv').config({ path: '/sessions/funny-stoic-cannon/mnt/TheHandshake/the-handshake/.env' });

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY;

async function testMoltbookAPI() {
  console.log('\n=== MOLTBOOK API DIAGNOSTIC ===\n');

  if (!API_KEY) {
    console.error('❌ MOLTBOOK_API_KEY not found in .env');
    return;
  }

  console.log(`✓ API Key found: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-4)}`);

  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  };

  // Test 1: Get hot posts (should work without auth)
  console.log('\n--- Test 1: GET /posts (hot) ---');
  try {
    const response = await fetch(`${MOLTBOOK_API}/posts?sort=hot&limit=5`, {
      headers
    });
    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log(`Response type: ${Array.isArray(data) ? 'Array' : 'Object'}`);
    console.log(`Posts found: ${Array.isArray(data) ? data.length : data.posts?.length || 0}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }

  // Test 2: Get user profile
  console.log('\n--- Test 2: GET /users/me ---');
  try {
    const response = await fetch(`${MOLTBOOK_API}/users/me`, {
      headers
    });
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Authenticated as: ${data.username || data.name || 'Unknown'}`);
      console.log(`User data:`, data);
    } else {
      const text = await response.text();
      console.log(`❌ Auth failed. Response: ${text.slice(0, 200)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }

  // Test 3: Create a test post
  console.log('\n--- Test 3: POST /posts (create test post) ---');
  try {
    const testPost = {
      submolt: 'general',
      title: 'API Test - Please Ignore',
      content: `Testing TheHandshake Moltbook integration. If you see this, the API is working! 🤖\n\nTimestamp: ${new Date().toISOString()}`
    };

    console.log('Sending:', JSON.stringify(testPost, null, 2));

    const response = await fetch(`${MOLTBOOK_API}/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPost)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    const responseText = await response.text();

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log(`✓ Post created successfully!`);
        console.log(`Post ID: ${data.id}`);
        console.log(`URL: https://www.moltbook.com/p/${data.id}`);
        return data.id; // Return for cleanup
      } catch (e) {
        console.log(`✓ Post likely created (status 200) but response parsing failed`);
        console.log(`Response: ${responseText.slice(0, 500)}`);
      }
    } else {
      console.log(`❌ Post creation failed`);
      console.log(`Response: ${responseText.slice(0, 500)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }

  // Test 4: Check notifications endpoint
  console.log('\n--- Test 4: GET /notifications ---');
  try {
    const response = await fetch(`${MOLTBOOK_API}/notifications`, {
      headers
    });
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Notifications endpoint works`);
      console.log(`Notifications:`, data);
    } else {
      console.log(`⚠️  Notifications endpoint not available (this is okay)`);
    }
  } catch (error) {
    console.log(`⚠️  Notifications endpoint error: ${error.message}`);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===\n');
}

testMoltbookAPI().catch(console.error);
