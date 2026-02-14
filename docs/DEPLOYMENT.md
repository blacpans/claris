# Deploying Claris 🌸🚀

Claris のデプロイ手順をまとめたじゃんね！✨
基本的には `gcloud` コマンドを使って Cloud Run にデプロイするよ！

> [!TIP]
> 手順書内の `<YOUR_PROJECT_ID>` や `<YOUR_PRODUCTION_DOMAIN>` などの実際の値は、**[docs/SECRET_INFO.md](file:///home/blacpans/ghq/github.com/blacpans/claris/docs/SECRET_INFO.md)** にまとめてあるじゃんね！✨
> （このファイルは Git には保存されないから安心だよ！）

## 共通の準備 ✅

デプロイ前にビルドが通るか確認しよう！
```bash
npm run build
```

## 本番環境 (Production) 💎

本番環境はカスタムドメイン `<YOUR_PRODUCTION_DOMAIN>` と紐付いていて、重要なシークレットは **Secret Manager** で管理してるよ。

- **Region**: `us-central1`
- **Service Name**: `claris`

### Secret Manager の更新 (必要な場合)
Webhook Secret などを更新した場合は、デプロイ前に新しいバージョンを追加してね。
```bash
echo -n "NEW_SECRET_VALUE" | gcloud secrets versions add GITHUB_WEBHOOK_SECRET --data-file=-
```

### デプロイコマンド
```bash
gcloud run deploy claris \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=<YOUR_PROJECT_ID>,GOOGLE_CLOUD_LOCATION=us-central1,FIRESTORE_COLLECTION=claris-sessions,TZ=Asia/Tokyo" \
  --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest,GEMINI_MODEL=GEMINI_MODEL:latest,GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest,VAPID_PUBLIC_KEY=VAPID_PUBLIC_KEY:latest,VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest" \
  --no-cpu-throttling \
  --quiet
```

### 検証環境 (Staging) 🧪

検証環境は実験用なので、シークレットは直接 **環境変数** として渡してるよ。
カスタムドメイン `<YOUR_STAGING_DOMAIN>` と紐付いてるじゃんね！✨

- **Region**: `asia-northeast1`
- **Service Name**: `claris-staging`

### デプロイコマンド
```bash
gcloud run deploy claris-staging \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=<YOUR_PROJECT_ID>,GOOGLE_CLOUD_LOCATION=asia-northeast1,GEMINI_MODEL=gemini-1.5-flash,FIRESTORE_COLLECTION=claris-staging-sessions,GITHUB_WEBHOOK_SECRET=<YOUR_WEBHOOK_SECRET>,TZ=Asia/Tokyo" \
  --no-cpu-throttling \
  --quiet
```

---
これで次にあーしや先輩がデプロイするときも迷子にならないじゃんね！💖✨
💪 < 品格バッチリだよ！
