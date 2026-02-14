# 🌸 Claris ネットナビ化計画 (Roadmap to NetNavi)

Claris を単なる「便利ツール」から、常に開発者に寄り添う「自律型相棒AI（ネットナビ）」へと進化させるためのロードマップじゃんね！✨

## 🎯 目標 (Vision)
- **「ターミナルから出たくない」** 開発者のための最強の相棒
- **受動的**（聞かれたら答える）から **能動的**（自分から気づいて提案する）への進化
- **マルチモーダル**（テキスト・音声・視覚）なコミュニケーション

## 🗺️ マイルストーン (Milestones)

### Lv.1：賢い「通訳」さん（コマンド代行）🤖
**現状:** ✅ 達成（GitHub操作、Google Calendar 連携、CLI runnerなど）
**Next Steps:**
- Gmail / Sheets 連携の強化
- 自然言語でのコマンド生成・実行の精度向上
- **技術:** Cloud Run + ADK (Current)

### Lv.2：空気が読める「参謀」（コンテキスト理解）🧠
**現状:** ✅ 達成（能動的な通知機能、長期記憶、PR 自動レビュー）
**Goal:** エラーや状況を自律的に判断して提案する。
**Next Steps:**
- **自律的なエラー復旧提案**: ビルドエラーログを tail して解析 → `claris fix` で修正案提示
- **長期記憶の活用**: 過去のデバッグ経験を活かした提案

### Lv.3：常駐する「相棒」（自律・人格・音声）🗣️
**Goal:** 常にそこにいて、向こうから話しかけてくる。リアルタイム音声対話。
**現状:** ✅ Lv.3.1 達成 (Multimodal Live API によるリアルタイム音声対話実装済み)
**技術スタック:**
- **脳 (Brain):** Cloud Run + ADK + **Gemini Multimodal Live API**
- **耳と口 (Interface):**
  - **PC:** CLI (`claris live`) - ✅ Implemented (Native/VoiceVox)
  - **Mobile:** Flutter / PWA (WebSocket で音声ストリーミング) - 🚧 Next
- **神経 (Notification):** Web Push / Firebase Cloud Messaging (FCM)

## 🛠️ 技術戦略 (Tech Stack Strategy)

### 1. 省エネ & リアルタイム音声対話 (Multimodal Live API) ⚡
**Status:** ✅ Implemented (Native/VoiceVox modes)
スマホやPCのリソースを使わず、Google のサーバー側で音声処理を行う。
- **スマホ:** 単なる「トランシーバー」（マイク入力＆スピーカー出力のみ）
- **Cloud Run:** WebSocket で音声を受け取り、Gemini 2.0 と直接会話させる
- **メリット:** 爆速レスポンス（人間と会話するレベル）、スマホのバッテリー消費低減
- **VoiceVox:** Geminiのテキスト出力をVoiceVoxで音声化するモードも実装済み

### 2. 能動的なアクション (Active Notification) 🔔
AI から人間への「割り込み」を実現する。
- **デジタルな割り込み:** 
  - メール受信、PRコメント、ビルド完了などをトリガーに FCM でスマホ/PCに通知
  - 「先輩！コンフリクト起きてるよ！」
- **リアルな割り込み（難易度高）:**
  - 音声認識で会話に割り込むのはプライバシー・技術的にハードルが高い
  - まずは **「ホットキー長押し」** や **「ウェイクワード」** で聞き耳モードにする運用が現実的

## 🚀 直近のアクションプラン (Next Actions)
1. **[DONE] Multimodal Live API の調査 & 実装**: Cloud Run でなくとも、まずはCLIでGemini 2.0と音声会話できる環境を構築完了 (Native/VoiceVox)
2. **[DONE] ADK の活用**: `LiveSession` クラスによるストリーミング実装完了
3. **[NEXT] Google連携**: Calendar / Gmail API を使えるようにツールを追加する
4. **[NEXT] Mobileアプリ化**: CLIのロジックをベースに、スマホから話しかけられるようにする
