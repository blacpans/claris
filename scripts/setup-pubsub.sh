#!/bin/bash
PROJECT_ID="upheld-beach-482910-e6"
TOPIC="claris-events"
SUB="claris-local-sub"
SERVICE_ACCOUNT="gmail-api-push@system.gserviceaccount.com"

echo "🚀 Setting up Pub/Sub for Project: $PROJECT_ID"

# Enable Pub/Sub API
echo "🔌 Enabling Pub/Sub API..."
gcloud services enable pubsub.googleapis.com --project "$PROJECT_ID"

# Create Topic
if ! gcloud pubsub topics describe "$TOPIC" --project "$PROJECT_ID" > /dev/null 2>&1; then
  gcloud pubsub topics create "$TOPIC" --project "$PROJECT_ID"
  echo "✅ Topic '$TOPIC' created."
else
  echo "ℹ️ Topic '$TOPIC' already exists."
fi

# Add IAM Binding
echo "🔐 Adding IAM policy binding for Gmail..."
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:$SERVICE_ACCOUNT" \
  --role "roles/pubsub.publisher" > /dev/null
echo "✅ Added Publisher role to $SERVICE_ACCOUNT"

# Create Subscription
if ! gcloud pubsub subscriptions describe "$SUB" --project "$PROJECT_ID" > /dev/null 2>&1; then
  gcloud pubsub subscriptions create "$SUB" --topic "$TOPIC" --project "$PROJECT_ID"
  echo "✅ Subscription '$SUB' created."
else
  echo "ℹ️ Subscription '$SUB' already exists."
fi

echo ""
echo "🎉 Setup Complete!"
echo "Please add the following to your .env file:"
echo "----------------------------------------"
echo "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
echo "PUBSUB_SUBSCRIPTION=$SUB"
echo "----------------------------------------"
