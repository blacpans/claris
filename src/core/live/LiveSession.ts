import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { AudioPlayer } from '../voice/AudioPlayer.js';
import { AudioRecorder } from '../voice/AudioRecorder.js';
import '@/config/env.js';

// Define minimal interfaces for Live API messages since SDK types might be complex or internal
interface LiveServerMessage {
  serverContent?: {
    modelTurn?: {
      parts?: Part[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

export class LiveSession {
  private client: GoogleGenAI;
  private player: AudioPlayer;
  private recorder: AudioRecorder;
  // Session type is internal to SDK. Using unknown to be safe and avoid 'any'.
  private session: unknown = null;

  constructor() {
    this.client = new GoogleGenAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
      vertexai: true,
      apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
    });
    this.player = new AudioPlayer();
    this.recorder = new AudioRecorder();
  }

  async start() {
    // VoiceVoxモードも動作確認済みのモデルを使用
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

    console.log(`🔌 Connecting to Gemini (${model}) in native audio mode...`);

    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [
          {
            text: `Language: Japanese (Always speak in Japanese)
            あなたは元気なギャルのAIアシスタント、クラリスだよ！
            一人称は「あーし」で、語尾は「〜だよ」「〜じゃんね」が口癖。
            ユーザーの声を聞いて、友達みたいに楽しく会話してね！
            返答は短く、会話のキャッチボールを大切にして！`,
          },
        ],
      },
    };

    try {
      this.session = await this.client.live.connect({
        model: model,
        config: config,
        callbacks: {
          onmessage: async (message: unknown) => {
            // SDK might pass object, cast to our interface
            await this.handleMessage(message as LiveServerMessage);
          },
          onerror: (err: unknown) => {
            console.error('❌ Session Error:', JSON.stringify(err, null, 2));
          },
          onclose: (event: unknown) => {
            console.log('🔌 Session Closed', event);
          },
        },
      });

      console.log('✨ Connected! Start talking...');

      this.player.on('start', () => console.log('🔊 Playing audio... (Mic muted)'));
      this.player.on('end', () => console.log('🎤 Finished playing. (Mic active)'));

      this.startAudioStream();
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      process.exit(1);
    }
  }

  private startAudioStream() {
    const stream = this.recorder.start(16000); // 16kHz for Gemini Input

    stream.on('data', async (chunk: Buffer) => {
      // 再生中はマイク入力を送信しない (エコーキャンセル/割り込み防止)
      if (this.player.isPlaying) {
        return;
      }

      // 16kHz PCM -> Base64
      if (this.session) {
        try {
          // Explicitly cast session to expected interface structure
          await (
            this.session as { sendRealtimeInput: (arg: { media: { mimeType: string; data: string } }) => Promise<void> }
          ).sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: chunk.toString('base64'),
            },
          });
        } catch {
          // ignore sending error (sometimes happens during close)
        }
      }
    });
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        // Native Audio Mode
        // Received Audio from Gemini -> Play
        if (part.inlineData?.data) {
          const pcmData = Buffer.from(part.inlineData.data, 'base64');
          this.player.playPCM(pcmData, 24000); // Gemini Native output is 24kHz
        }
      }
    }

    if (message.serverContent?.interrupted) {
      console.log('🛑 Interrupted');
      this.player.stop();
    }
  }

  stop() {
    if (this.session) {
      // this.session.close();
      this.session = null;
    }
    this.recorder.stop();
    this.player.stop();
  }
}
