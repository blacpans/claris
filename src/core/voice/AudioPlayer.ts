import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import Speaker from 'speaker';

/**
 * 音声を再生するためのクラス
 * `speaker` ライブラリのラッパー
 * 再生状態を管理する
 */
export class AudioPlayer extends EventEmitter {
  private speaker: Speaker | null = null;
  public isPlaying = false;

  private audioQueue: Buffer[] = [];
  private isProcessing = false;
  private debounceTimer: NodeJS.Timeout | null = null; // This can be removed if not used elsewhere
  private speakerEndTimer: NodeJS.Timeout | null = null;

  /**
   * PCM音声データを再生キューに追加する
   * @param pcmData PCM音声データ (Buffer)
   * @param sampleRate サンプリングレート (デフォルト: 24000)
   */
  playPCM(pcmData: Buffer, sampleRate = 24000) {
    // 再生開始状態にする
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.emit('start'); // マイクミュート開始
    }

    // フラッシュタイマー（再生終了待ち）があればキャンセルして延命
    if (this.speakerEndTimer) {
      clearTimeout(this.speakerEndTimer);
      this.speakerEndTimer = null;
    }

    // Debounceタイマー（マイク復帰待ち）があればキャンセル
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.audioQueue.push(pcmData);
    this.processQueue(sampleRate);
  }

  private async processQueue(sampleRate: number) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Speaker作成（存在しない、または閉じかけている場合）
    if (!this.speaker) {
      // 最初のチャンクが来た直後、少しだけバッファリングする（ネットワークジッター対策）
      // これにより「プツプツ」を軽減する
      if (this.audioQueue.length < 5) {
        // 5チャンクくらい溜まるまで待つか、最大300ms待つ
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // @ts-ignore
      this.speaker = new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: sampleRate,
      });

      // Speakerが物理的に再生を終えたら呼ばれる
      this.speaker.on('close', () => {
        this.speaker = null;

        // 物理再生終了後、さらに少し待ってからマイクをオンにする（部屋の反響対策）
        if (this.isPlaying) {
          this.debounceTimer = setTimeout(() => {
            this.isPlaying = false;
            this.emit('end'); // マイクミュート解除
            this.debounceTimer = null;
          }, 1000); // 反響考慮で長めに (1000ms)
        }
      });
    }

    try {
      while (this.audioQueue.length > 0) {
        if (!this.speaker) break;

        const chunk = this.audioQueue.shift();
        if (chunk) {
          // writeはバッファがいっぱいだとfalseを返す
          const result = this.speaker.write(chunk);

          if (!result) {
            // Backpressure: OSバッファが空くまで待つ（これで実時間と同期する）
            await new Promise((resolve) => {
              this.speaker?.once('drain', resolve);
            });
          }
        }
      }
    } catch (e) {
      console.error('Audio processing error:', e);
    }

    this.isProcessing = false;

    // キューが空になったら、少し待ってからストリームを閉じる
    // （Geminiからのストリーミングが途切れただけかもしれないので即切りしない）
    if (this.audioQueue.length === 0 && this.speaker) {
      this.speakerEndTimer = setTimeout(() => {
        if (this.audioQueue.length === 0 && this.speaker) {
          this.speaker.end(); // これが呼ばれると、残りのバッファを再生しきってから 'close' が発火する
        }
      }, 500); // 500ms データが来なければ一旦切る
    }
  }

  private forceClose() {
    if (this.speaker) {
      // 強制終了
      this.speaker.removeAllListeners('close');
      this.speaker.destroy(); // end() ではなく destroy() で即切る
      this.speaker = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
    this.emit('end');

    if (this.speakerEndTimer) clearTimeout(this.speakerEndTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  /**
   * WAV音声データを再生し、完了まで待機する (Turn-Based用)
   */
  playWavComplete(wavData: Buffer): Promise<void> {
    return new Promise((resolve) => {
      this.once('end', resolve);
      this.playWav(wavData);
    });
  }

  /**
   * WAV音声データを再生する (VoiceVox用)
   * RIFFヘッダーを解析してdataチャンクを探し、PCMデータを取り出して再生する。
   *
   * VoiceVox Default: 24kHz, 16bit, Mono (話者による)
   */
  playWav(wavData: Buffer) {
    let offset = 12; // Skip RIFF header (12 bytes)

    while (offset < wavData.length) {
      const chunkId = wavData.toString('ascii', offset, offset + 4);
      const chunkSize = wavData.readUInt32LE(offset + 4);

      if (chunkId === 'data') {
        const pcmData = wavData.subarray(offset + 8, offset + 8 + chunkSize);
        this.playPCM(pcmData, 24000); // TODO: fmtチャンクからサンプリングレートを取得するのがベスト
        return;
      }

      offset += 8 + chunkSize;
    }

    console.warn('⚠️ Invalid WAV data: data chunk not found');
  }

  /**
   * 再生を停止する
   */
  stop() {
    this.forceClose();
  }
}
