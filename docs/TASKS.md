# 📋 Project Tasks Status (2026-02-01)

## ✅ Completed Tasks (完了済み)
直近で達成したマイルストーンじゃんね！✨

### 🎤 Voice & Multimodal (Roadmap Lv.3.1)
- [x] **Multimodal Live API Integration**: CLI (`claris live`) での音声対話モード
- [x] **VoiceVox Integration**: Geminiのテキスト応答をVoiceVoxで読み上げ
- [x] **Cloud Context**: コンテキスト管理をSDK (`client.chats.create`) に移行
- [x] **Optimizations**:
    - [x] Audio RMS Calculation (Int16Array高速化)
    - [x] WAV Sample Rate Parsing (fmtチャンク対応)

### 🛠️ Infrastructure & Refactoring
- [x] **No Any Policy**: `biome.json` で `noExplicitAny` を有効化し、`LiveSession.ts` 等を完全型定義
- [x] **Cleanup**: 不要なPoCコード (`src/poc`) の削除

---

## 🚀 Future Tasks (これからやること)
ネットナビへの進化に必要な次の一手ダヨ！💎

### 📱 Interface Expansion
- [ ] **Mobile App (Flutter/PWA)**:
    - WebSocketでCloud Runに接続し、スマホから音声対話。
    - CLIのロジックを流用。

### 📅 Agent Capabilities (Google Integration)
- [ ] **Calendar Integration**: "明日の予定教えて" に答えられるようにする。
- [ ] **Gmail Integration**: 未読メールのチェックと要約。

### 👀 Vision Capabilities
- [ ] **Image Recognition**:
    - ターミナルに画像をドロップして "これ何？" と聞けるようにする。
    - `claris live` モードでの画像入力対応。

### 🔔 Active Notification
- [ ] **Push Notification (FCM)**:
    - AIから "PRのレビュー終わったよ！" とスマホに通知を送る。
