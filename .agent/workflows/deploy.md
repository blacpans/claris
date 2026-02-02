---
description: Cloud Run へのデプロイを実行する
---

# Deploy Workflow 🚀

## Production デプロイ

1. ビルドを実行する
```bash
npm run build
```

2. (任意) Webhook Secret を更新する
// turbo
```bash
echo -n "${GITHUB_WEBHOOK_SECRET}" | gcloud secrets versions add GITHUB_WEBHOOK_SECRET --data-file=-
```

3. 本番環境にデプロイする
// turbo
```bash
./scripts/deploy.sh
```

## Staging デプロイ

1. ビルドを実行する
```bash
npm run build
```

2. 検証環境にデプロイする
// turbo
```bash
gcloud run deploy claris-staging \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION},GEMINI_MODEL=${GEMINI_MODEL},FIRESTORE_COLLECTION=${STAGING_FIRESTORE_COLLECTION},GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET},TZ=${TZ},AUTH_SECRET=${STAGING_AUTH_SECRET}" \
  --no-cpu-throttling \
  --quiet
```
