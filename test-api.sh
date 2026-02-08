#!/bin/bash

API_URL="http://localhost:8787"
COOKIES_FILE="/tmp/foosball-cookies.txt"

echo "🧪 Testing Foosball ELO Tracker API"
echo "===================================="
echo ""

echo "1. Register User 1..."
curl -s -X POST "$API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "password123",
    "name": "Alice",
    "displayName": "Alice"
  }' \
  -c "$COOKIES_FILE" | jq -r '.user.email + " registered"'

echo ""
echo "2. Register User 2..."
curl -s -X POST "$API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@example.com",
    "password": "password123",
    "name": "Bob",
    "displayName": "Bob"
  }' | jq -r '.user.email + " registered"'

echo ""
echo "3. Get leaderboard..."
LEADERBOARD=$(curl -s "$API_URL/api/v1/players")
echo "$LEADERBOARD" | jq -r '.players[] | "\(.rank). \(.displayName) - ELO: \(.currentElo)"'

echo ""
echo "4. Get Alice's player ID..."
ALICE_ID=$(echo "$LEADERBOARD" | jq -r '.players[] | select(.displayName == "Alice") | .id')
BOB_ID=$(echo "$LEADERBOARD" | jq -r '.players[] | select(.displayName == "Bob") | .id')
echo "Alice ID: $ALICE_ID"
echo "Bob ID: $BOB_ID"

echo ""
echo "5. Record a 1v1 match (Alice 11 - Bob 9)..."
MATCH_RESULT=$(curl -s -X POST "$API_URL/api/v1/match/create" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_FILE" \
  -d "{
    \"team1Player1Id\": \"$ALICE_ID\",
    \"team1Player2Id\": null,
    \"team2Player1Id\": \"$BOB_ID\",
    \"team2Player2Id\": null,
    \"team1Score\": 11,
    \"team2Score\": 9
  }")

echo "$MATCH_RESULT" | jq -r '.eloChanges[] | "\(.displayName): \(.oldElo) → \(.newElo) (\(.eloChange))"'

echo ""
echo "6. Get updated leaderboard..."
curl -s "$API_URL/api/v1/players" | jq -r '.players[] | "\(.rank). \(.displayName) - ELO: \(.currentElo) (\(.wins)W-\(.losses)L)"'

echo ""
echo "7. Get Alice's ELO history..."
curl -s "$API_URL/api/v1/players/$ALICE_ID/history" | jq -r '.history[] | "ELO Change: \(.eloBefore) → \(.eloAfter) (\(.eloChange))"'

echo ""
echo "✅ API Tests Complete!"
