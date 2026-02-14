#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting deployment..."

# Load env vars
# .env.local overrides .env
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ $key =~ ^# ]] || [[ -z $key ]]; then continue; fi
    # Remove leading/trailing whitespace
    key=$(echo $key | xargs)
    value=$(echo $value | xargs)
    # Remove quotes
    value=${value%\"}
    value=${value#\"}
    value=${value%\'}
    value=${value#\'}
    export "$key=$value"
  done < .env
fi

if [ -f .env.local ]; then
  while IFS='=' read -r key value; do
    if [[ $key =~ ^# ]] || [[ -z $key ]]; then continue; fi
    key=$(echo $key | xargs)
    value=$(echo $value | xargs)
    value=${value%\"}
    value=${value#\"}
    value=${value%\'}
    value=${value#\'}
    export "$key=$value"
  done < .env.local
fi

# Load .env.prod (Production overrides - Highest priority)
if [ -f .env.prod ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ $key =~ ^# ]] || [[ -z $key ]]; then continue; fi
    # Remove leading/trailing whitespace
    key=$(echo $key | xargs)
    value=$(echo $value | xargs)
    # Remove quotes
    value=${value%\"}
    value=${value#\"}
    value=${value%\'}
    value=${value#\'}
    export "$key=$value"
  done < .env.prod
fi

# Check required variables
REQUIRED_VARS=("GOOGLE_CLOUD_PROJECT" "AUTH_SECRET" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_REDIRECT_URI" "GOOGLE_GENAI_API_KEY")
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "❌ Error: $VAR is not set."
    exit 1
  fi
done

echo "📦 Configuration loaded."
echo "   Project: $GOOGLE_CLOUD_PROJECT"
echo "   Region:  us-central1"
echo "   Secrets: GITHUB_TOKEN, GEMINI_MODEL, GITHUB_WEBHOOK_SECRET"

# Deploy
echo "🚢 Deploying to Cloud Run..."

gcloud run deploy claris \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION},FIRESTORE_COLLECTION=${FIRESTORE_COLLECTION},TZ=${TZ},AUTH_SECRET=${AUTH_SECRET},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET},GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI},CLARIS_NAME=${CLARIS_NAME},GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL},GEMINI_LIVE_LOCATION=${GEMINI_LIVE_LOCATION},GEMINI_FLASH_MODEL=${GEMINI_FLASH_MODEL},GEMINI_PRO_MODEL=${GEMINI_PRO_MODEL},GEMINI_GENERATE_LOCATION=${GEMINI_GENERATE_LOCATION},GEMINI_API_VERSION=${GEMINI_API_VERSION},VOICEVOX_GEMINI_MODEL=${VOICEVOX_GEMINI_MODEL},SUMMARY_TIMEOUT_MS=${SUMMARY_TIMEOUT_MS},FIRESTORE_AUTH_COLLECTION=${FIRESTORE_AUTH_COLLECTION},TOKEN_STORE_TYPE=${TOKEN_STORE_TYPE},GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY},VERTEX_SEARCH_DATA_STORE_ID=${VERTEX_SEARCH_DATA_STORE_ID},VERTEX_SEARCH_SERVING_CONFIG=${VERTEX_SEARCH_SERVING_CONFIG},PUBSUB_SUBSCRIPTION=${PUBSUB_SUBSCRIPTION},VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY},VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY},VAPID_SUBJECT=${VAPID_SUBJECT},GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY}" \
  --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest,GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest" \
  --no-cpu-throttling \
  --quiet

echo "✅ Deployment finished successfully!"
