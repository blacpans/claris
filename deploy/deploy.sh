#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="claris"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Check required environment
if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ GOOGLE_CLOUD_PROJECT is required"
  exit 1
fi

echo "🚀 Deploying Claris to Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Region:  $REGION"

# Build and push container
echo "📦 Building container..."
gcloud builds submit --tag "$IMAGE_NAME" --project "$PROJECT_ID"

# Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION" \
  --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest,GEMINI_MODEL=GEMINI_MODEL:latest" \
  --memory 512Mi \
  --timeout 300 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 10

echo "✨ Deployment complete!"
echo ""
echo "📌 Next steps:"
echo "   1. Get the service URL from the output above"
echo "   2. Configure GitHub webhook to point to: <SERVICE_URL>/webhook"
echo "   3. Set content type to application/json"
echo "   4. Select 'Pull requests' events"
