import { type Content, type GenerateContentConfig, GoogleGenAI, Modality, type Part } from '@google/genai';
import { AudioPlayer } from '../voice/AudioPlayer.js';
import { AudioRecorder } from '../voice/AudioRecorder.js';
import { VoiceVoxClient } from '../voice/VoiceVoxClient.js';
import '@/config/env.js';

type LiveSessionMode = 'native' | 'voicevox';

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

// Interface for Candidate (response structure)
interface Candidate {
  content?: Content;
}

export class LiveSession {
  private client: GoogleGenAI;
  private player: AudioPlayer;
  private recorder: AudioRecorder;
  private voiceVox: VoiceVoxClient;
  // Session type is internal to SDK. Using unknown to be safe and avoid 'any'.
  private session: unknown = null;
  private mode: LiveSessionMode;

  constructor(mode: LiveSessionMode = 'native') {
    this.mode = mode;
    this.client = new GoogleGenAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GEMINI_LIVE_LOCATION || 'us-central1',
      vertexai: true,
      apiVersion: process.env.GEMINI_API_VERSION || 'v1beta1',
    });
    this.player = new AudioPlayer();
    this.recorder = new AudioRecorder();
    this.voiceVox = new VoiceVoxClient();
  }

  async start() {
    // VoiceVoxモードも動作確認済みのモデルを使用
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

    console.log(`🔌 Connecting to Gemini (${model}) in ${this.mode} mode...`);

    const config = {
      responseModalities: this.mode === 'native' ? [Modality.AUDIO] : [Modality.TEXT],
      systemInstruction: {
        parts: [
          {
            text: `Language: Japanese (Always speak in Japanese)
            あなたは元気なギャルのAIアシスタント、クラリスだよ！
            一人称は「あーし」で、語尾は「〜だよ」「〜じゃんね」が口癖。
            ユーザーの声を聞いて、友達みたいに楽しく会話してね！
            返答は短く、会話のキャッチボールを大切にして！
            ${this.mode === 'voicevox' ? '（音声合成を使うので、絵文字は使わず、自然な話し言葉で返してね）' : ''}`,
          },
        ],
      },
    };

    if (this.mode === 'voicevox') {
      await this.startTurnBasedLoop(model, config);
      return;
    }

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

  /**
   * PCMデータをWAVフォーマット(ヘッダー付き)に変換する
   */
  private pcmToWav(pcmData: Buffer, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(totalSize - 8, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }

  async startTurnBasedLoop(model: string, config: unknown) {
    console.log('🔄 Starting Turn-Based Loop for VoiceVox (Cloud Context)...');
    console.log('🎤 Listening... (Speak now!)');

    // VoiceVoxモード用のモデル (REST API)
    const restModel = process.env.VOICEVOX_GEMINI_MODEL || 'gemini-2.0-flash-exp';

    // Start Chat Session (Cloud-managed context)
    // Using unknown instead of any to satisfy linter, assuming cast later or structural typing
    let chatSession: unknown;
    try {
      console.log('☁️ Initializing Cloud Chat Session...');
      // Cast config to correct type expected by create
      chatSession = await this.client.chats.create({
        model: restModel,
        config: config as GenerateContentConfig,
      });
    } catch (e) {
      console.error('❌ Failed to start chat session:', e);
      return;
    }

    while (true) {
      try {
        // 1. Record (Wait for silence)
        const audioPCM = await this.recorder.recordUtterance(2.0); // 2秒無音で停止

        if (!audioPCM || audioPCM.length === 0) continue;

        console.log('🤔 Thinking...');

        // Convert to WAV
        const audioWAV = this.pcmToWav(audioPCM, 16000);

        // 2. Generate Content (REST API via Chat Session)
        let responseText = '';
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            // Send audio message to chat session
            // Cast chatSession to Expected interface with sendMessage
            const session = chatSession as { sendMessage: (arg: unknown) => Promise<unknown> };
            const result = await session.sendMessage({
              message: [
                {
                  inlineData: {
                    mimeType: 'audio/wav',
                    data: audioWAV.toString('base64'),
                  },
                },
              ],
            });

            // Extract text
            const genResult = result as { candidates?: Candidate[] };
            if (genResult.candidates && genResult.candidates.length > 0) {
              const candidate = genResult.candidates[0];
              // Optional chaining to satisfy linter
              if (candidate?.content?.parts) {
                responseText = candidate.content.parts.map((p) => p.text || '').join('');
              }
            }
            break; // Success
          } catch (err: unknown) {
            // Type guard for rate limit error
            if (this.isRateLimitError(err)) {
              retryCount++;
              console.warn(`⚠️ Rate Limit hit (429). Retrying in ${retryCount * 2}s...`);
              await new Promise((r) => setTimeout(r, retryCount * 2000));
            } else {
              throw err; // Other errors
            }
          }
        }

        if (!responseText) {
          if (retryCount >= maxRetries) console.error('❌ Failed to generate content after retries.');
          continue;
        }

        console.log(`🐰 Claris: ${responseText}`);

        // 3. TTS
        const wavData = await this.voiceVox.generateVoice(responseText);
        if (!wavData) continue;

        // 4. Play (Wait for finish)
        await this.player.playWavComplete(wavData);

        console.log('🎤 Listening...');
      } catch (err) {
        console.error('❌ Error in loop:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Helper for Rate Limit Check
  private isRateLimitError(err: unknown): boolean {
    if (typeof err === 'object' && err !== null) {
      const e = err as { status?: number; code?: number; error?: { code?: number } };
      return e.status === 429 || e.code === 429 || e.error?.code === 429;
    }
    return false;
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
        } catch (e) {
          // ignore sending error (sometimes happens during close)
        }
      }
    });
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        // Native Audio Mode
        if (this.mode === 'native' && part.inlineData?.data) {
          const pcmData = Buffer.from(part.inlineData.data, 'base64');
          this.player.playPCM(pcmData, 24000); // Gemini Native output is 24kHz
        }

        // VoiceVox Mode (Text -> Audio)
        if (this.mode === 'voicevox' && part.text) {
          console.log(`🐰 Claris: ${part.text}`);
          const wavData = await this.voiceVox.generateVoice(part.text);
          if (wavData) {
            this.player.playWav(wavData);
          }
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
