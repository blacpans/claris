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


