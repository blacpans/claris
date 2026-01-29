# Gemini API リファレンスメモ

Claris の Sensory Interface (目・耳・口) 実装で使用する Gemini API の重要情報をまとめたドキュメント。

---

## 📚 公式ドキュメントリンク

| カテゴリ | リンク |
|---------|--------|
| API 概要 | [ai.google.dev/api](https://ai.google.dev/api?hl=ja) |
| モデル一覧 | [Models](https://ai.google.dev/gemini-api/docs/models?hl=ja) |
| Live API (Proactive Audio) | [Vertex AI Live API](https://cloud.google.com/vertex-ai/generative-ai/docs/live-api/proactive-audio?hl=ja) |
| 音声理解 | [Audio Understanding](https://ai.google.dev/gemini-api/docs/audio?hl=ja) |
| 音声生成 (TTS) | [Speech Generation](https://ai.google.dev/gemini-api/docs/speech-generation?hl=ja) |
| テキスト生成 | [Text Generation](https://ai.google.dev/gemini-api/docs/text-generation?hl=ja) |
| ロングコンテキスト | [Long Context](https://ai.google.dev/gemini-api/docs/long-context?hl=ja) |
| 対話型 | [Interactions](https://ai.google.dev/gemini-api/docs/interactions?hl=ja) |

---

## 🎤 Live API 用モデル (Claris で使用中)

### Gemini 2.5 Flash Live (Native Audio)

| 項目 | 値 |
|------|-----|
| **モデル名** | `gemini-2.5-flash-native-audio-preview-12-2025` |
| **入力** | 音声、動画、テキスト |
| **出力** | 音声、テキスト |
| **入力トークン上限** | 131,072 |
| **出力トークン上限** | 8,192 |
| **Live API** | ✅ サポート |
| **関数呼び出し** | ✅ サポート |
| **思考モード** | ✅ サポート |

**Vertex AI モデル名:**
- `gemini-live-2.5-flash-preview-native-audio-09-2025`
- `gemini-live-2.5-flash-preview-native-audio`

---

## 🔊 音声仕様

### 入力音声 (Live API)
- **フォーマット**: PCM 16-bit, Little Endian
- **サンプルレート**: 16kHz (推奨)
- **チャンネル**: モノラル

### 出力音声 (Live API)
- **フォーマット**: PCM 16-bit
- **サンプルレート**: 24kHz

### 音声理解 (STT/分析)

**サポート形式:**
- WAV (`audio/wav`)
- MP3 (`audio/mp3`)
- AIFF (`audio/aiff`)
- AAC (`audio/aac`)
- OGG Vorbis (`audio/ogg`)
- FLAC (`audio/flac`)

**技術仕様:**
- 1秒 = 32トークン (1分 = 1,920トークン)
- 最大入力長: 9.5時間
- ダウンサンプリング: 16Kbps
- マルチチャンネル → モノラル結合

---

## 🗣️ TTS (テキスト読み上げ)

### サポートモデル
- `gemini-2.5-flash-preview-tts`
- `gemini-2.5-pro-preview-tts`

### サポート言語 (24言語)
```
ja-JP, en-US, de-DE, fr-FR, es-US, ko-KR, zh-CN, it-IT, pt-BR, ru-RU,
nl-NL, pl-PL, th-TH, tr-TR, vi-VN, ro-RO, uk-UA, ar-EG, hi-IN, id-ID,
bn-BD, en-IN, mr-IN, ta-IN, te-IN
```

### 音声オプション
- 30種類のボイス
- [AI Studio で試聴可能](https://aistudio.google.com/generate-speech?hl=ja)

### 制限事項
- テキスト入力のみ → 音声出力
- コンテキストウィンドウ: 32,000 トークン

---

## 🚀 Proactive Audio (コンテキスト応答機能)

デバイスに向けられた発話のみに応答する機能。

### 有効化
```typescript
config: {
  proactivity: {
    proactive_audio: true
  }
}
```

### サポートモデル
- `gemini-live-2.5-flash-preview-native-audio-09-2025`
- `gemini-live-2.5-flash-preview-native-audio`

---

## 📝 現在の Claris 設定

```typescript
// src/poc/relay/server.ts
const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

const client = new GoogleGenAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
  vertexai: true,
  apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
});
```

---

## 🔄 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-29 | 初版作成 |
