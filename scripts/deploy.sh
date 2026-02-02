#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting deployment..."

# Load env vars
# .env.local overrides .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Check required variables
REQUIRED_VARS=("GOOGLE_CLOUD_PROJECT" "AUTH_SECRET" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_REDIRECT_URI")
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
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION},FIRESTORE_COLLECTION=${FIRESTORE_COLLECTION},TZ=${TZ},AUTH_SECRET=${AUTH_SECRET},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET},GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI}" \
  --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest,GEMINI_MODEL=GEMINI_MODEL:latest,GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest" \
  --no-cpu-throttling \
  --quiet

echo "✅ Deployment finished successfully!"
