import axios from 'axios';
import '@/config/env.js';

/**
 * VoiceVox Engine と通信するためのクライアント
 */
export class VoiceVoxClient {
  private baseUrl: string;
  private speakerId: number;

  constructor() {
    this.baseUrl = process.env.VOICEVOX_URL || 'http://localhost:50021';
    this.speakerId = Number(process.env.VOICEVOX_SPEAKER_ID) || 8; // 春日部つむぎ
  }

  /**
   * テキストから音声を生成する (AudioQuery -> Synthesis)
   * @param text 読み上げるテキスト
   * @returns WAV形式の音声データ (Buffer)
   */
  async generateVoice(text: string): Promise<Buffer | null> {
    try {
      // 1. Audio Query
      // 音声合成のためのクエリを作成する
      const queryRes = await axios.post(`${this.baseUrl}/audio_query`, null, {
        params: { text, speaker: this.speakerId },
      });

      // 2. Synthesis
      // クエリを元に音声を合成する
      const synthRes = await axios.post(`${this.baseUrl}/synthesis`, queryRes.data, {
        params: { speaker: this.speakerId },
        responseType: 'arraybuffer',
      });

      return Buffer.from(synthRes.data);
    } catch (err) {
      console.error('❌ VoiceVox API Error:', (err as Error).message);
      return null;
    }
  }

  /**
   * VoiceVox Engine が起動しているか確認する
   */
  async checkHealth(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/version`);
      return true;
    } catch (err) {
      return false;
    }
  }
}
