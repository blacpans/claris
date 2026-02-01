import type { Readable } from 'node:stream';
import { endianness } from 'node:os';
import record from 'node-record-lpcm16';

interface AudioRecordProcess {
  stream(): Readable;
  stop(): void;
}

const IS_LITTLE_ENDIAN = endianness() === 'LE';

/**
 * マイク入力を制御するクラス
 * `node-record-lpcm16` のラッパー
 */
export class AudioRecorder {
  private recording: AudioRecordProcess | null = null;
  private stream: Readable | null = null;

  /**
   * 録音を開始し、音声ストリームを返す
   * @param sampleRate サンプリングレート (デフォルト: 16000)
   * @returns 音声データストリーム (PCM 16bit Little Endian)
   */
  start(sampleRate = 16000): Readable {
    if (this.recording) {
      this.stop();
    }

    try {
      this.recording = record.record({
        sampleRate: sampleRate,
        threshold: 0, // 無音カットなし
        verbose: false,
        recordProgram: 'rec', // 'sox' or 'rec'
        silence: '10.0', // 長時間の無音でのみ停止（ストリーミング用）
      }) as unknown as AudioRecordProcess;

      this.stream = this.recording.stream();
      return this.stream as Readable;
    } catch (err) {
      console.error('❌ Microphone Error:', err);
      throw err;
    }
  }

  /**
   * 発話区間を録音する（Turn-Based用）
   * Node.js側で音量(RMS)を計算し、無音検出を行う
   */
  async recordUtterance(silenceSeconds = 2.0, sampleRate = 16000): Promise<Buffer> {
    if (this.recording) this.stop();

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      // RMS閾値 (16bit integer range: -32768 to 32767)
      // 500だと感度が良すぎるので 1500 に上げる
      const THRESHOLD = 1500;

      let isSpeaking = false;
      let silenceStart = 0;
      const silenceDurationMs = silenceSeconds * 1000;
      const recordingStart = Date.now();

      console.log(`🎤 Recording started (Manual VAD)... Threshold: ${THRESHOLD}`);

      try {
        this.recording = record.record({
          sampleRate: sampleRate,
          threshold: 0,
          verbose: false,
          recordProgram: 'rec',
        }) as unknown as AudioRecordProcess;

        const stream = this.recording.stream() as Readable;

        const checkSilence = (chunk: Buffer) => {
          let sumSquares = 0;
          const len = Math.floor(chunk.length / 2);

          // Fast path: System is Little Endian AND buffer is aligned
          if (IS_LITTLE_ENDIAN && chunk.byteOffset % 2 === 0) {
            const int16Data = new Int16Array(chunk.buffer, chunk.byteOffset, len);
            for (let i = 0; i < int16Data.length; i++) {
              const int = int16Data[i]!;
              sumSquares += int * int;
            }
          } else {
            // Slow(er) path: Use DataView (Handles Unaligned & Endianness)
            const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.length);
            for (let i = 0; i < len; i++) {
              const int = dataView.getInt16(i * 2, true); // true = Little Endian
              sumSquares += int * int;
            }
          }

          const rms = Math.sqrt(sumSquares / len);
          return rms;
        };

        stream.on('data', (chunk: Buffer) => {
          const rms = checkSilence(chunk);

          // ノイズデバッグ用（たまに出力）
          // if (Math.random() < 0.05) console.log(`🎤 RMS: ${rms.toFixed(0)}`);

          // 録音開始直後(500ms)のポップノイズ判定を無視する
          if (Date.now() - recordingStart < 500) {
            return;
          }

          if (rms > THRESHOLD) {
            if (!isSpeaking) {
              console.log(`🎤 Speech detected! (RMS: ${rms.toFixed(0)})`);
              isSpeaking = true;
            }
            silenceStart = 0; // Reset silence timer
          } else {
            if (isSpeaking) {
              if (silenceStart === 0) silenceStart = Date.now();

              const silenceElapsed = Date.now() - silenceStart;
              if (silenceElapsed > silenceDurationMs) {
                console.log('🎤 Silence detected. Stopping...');
                this.stop(); // This triggers 'end'
              }
            }
          }
          if (isSpeaking) {
            chunks.push(chunk);
          }
        });

        stream.on('error', (err: unknown) => {
          console.error('🎤 Recording Error:', err);
          reject(err);
        });

        stream.on('end', () => {
          console.log(`🎤 Recording ended. Sent ${chunks.length} chunks.`);
          this.recording = null;
          resolve(Buffer.concat(chunks));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 録音を停止する
   */
  stop() {
    if (this.recording) {
      this.recording.stop();
      this.recording = null;
      this.stream = null;
    }
  }
}
