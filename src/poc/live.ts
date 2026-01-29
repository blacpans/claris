import '../../src/config/env.js';
import { GoogleGenAI, Modality } from '@google/genai';
import record from 'node-record-lpcm16';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Use Vertex AI configuration from .env.local
const client = new GoogleGenAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'us-central1',
  vertexai: true,
  apiVersion: 'v1beta1',
});

async function testLiveAPI() {
  console.log('🚀 Connecting to Gemini Multimodal Live API...');
  console.log(`📍 Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
  console.log('📍 Location: us-central1');

  const pcmFilePath = path.join(process.cwd(), 'output_response.pcm');
  const pcmStream = fs.createWriteStream(pcmFilePath);
  console.log(`💾 Claris voice will be saved to: ${pcmFilePath}`);

  let audioPlayer: any = null;
  let audioQueue: Buffer[] = [];
  let isPlaying = false;

  function ensureAudioPlayer() {
    if (audioPlayer) return;

    // Use 'mpv' for robust streaming and buffering
    audioPlayer = spawn('mpv', [
      '--no-terminal',
      '--force-window=no',
      '--idle=yes', // Keep player open even if stream pauses
      // Audio format settings for raw PCM
      '--demuxer=rawaudio',
      '--demuxer-rawaudio-rate=24000',
      '--demuxer-rawaudio-channels=1',
      '--demuxer-rawaudio-format=s16le',
      // Buffering settings
      '--cache=yes',
      '--cache-secs=1.0',
      '-'
    ]);

    audioPlayer.stdin?.on('error', (err: any) => {
      // Ignore EPIPE (player stopped)
      if (err.code !== 'EPIPE') {
        console.error('⚠️  Audio player stdin error:', err);
      }
    });

    audioPlayer.on('error', (err: any) => {
      console.error('⚠️  Audio player error:', err);
    });

    audioPlayer.on('exit', () => {
      audioPlayer = null;
      isPlaying = false;
      audioQueue = [];
    });

    console.log('🔈 Audio player (mpv) started.');
  }

  function stopAudioPlayer() {
    if (audioPlayer) {
      audioPlayer.kill('SIGKILL'); // Force kill
      audioPlayer = null;
      console.log('🔇 Audio player stopped/cleared.');
    }
  }

  function processAudioQueue() {
    if (!audioPlayer || !audioPlayer.stdin) return;

    while (audioQueue.length > 0) {
      // If we write too fast, aplay might block or buffer internally (which is fine)
      const chunk = audioQueue.shift();
      if (chunk) {
        audioPlayer.stdin.write(chunk);
      }
    }
  }


  const micFilePath = path.join(process.cwd(), 'input_mic.pcm');
  const micFileStream = fs.createWriteStream(micFilePath);
  console.log(`💾 Your voice will be saved to: ${micFilePath}`);

  try {
    const model = 'gemini-live-2.5-flash-native-audio';

    // Establish Live session
    const session = await client.live.connect({
      model: model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{
            text: `あなたは元気なギャルのAIアシスタント、クラリスだよ！
ユーザーは音声で話しかけてくるから、その音声をしっかり聞いて、友達みたいに楽しく会話してね！
もし音声が途切れてたりしても、聞こえた範囲で何か反応して！無言はNGだよ！
相槌を打ったり、「ん？」「なに？」って聞き返したりして、会話を続けてね！`
          }]
        },
      },
      callbacks: {
        onmessage: (message) => {
          // Log ALL server messages for deep debugging
          console.log('📩 Message from server:', JSON.stringify(message, (key, value) =>
            key === 'data' ? `(binary, len=${value.length})` : value, 2));

          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.text) {
                console.log('🤖 Claris (text):', part.text);
              }
              if (part.inlineData?.data) {
                const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                pcmStream.write(audioBuffer);

                // Manual Jitter Buffer Logic
                ensureAudioPlayer();
                audioQueue.push(audioBuffer);

                // Buffer 5 chunks (~0.5s) before starting to play
                if (!isPlaying && audioQueue.length >= 5) {
                  isPlaying = true;
                  processAudioQueue();
                } else if (isPlaying) {
                  processAudioQueue();
                }
              }
            }
          }

          if (message.serverContent?.turnComplete) {
            console.log('🏁 Turn complete.');
          }

          if (message.serverContent?.interrupted) {
            console.log('🛑 Interrupted by user (maybe noise/echo?)');
            stopAudioPlayer();
          }
        },
        onerror: (err) => {
          console.error('❌ Session error:', err);
        },
        onclose: (event) => {
          console.log('👋 Session closed.', event);
          process.exit(0);
        }
      },
    });

    console.log('✅ Connected to Gemini Live API!');
    console.log('🎤 Starting microphone... Speak now! (Ctrl+C to stop)');

    // Initialize Microphone (24kHz, Mono) to match Native Audio model
    const recorder = record.record({
      sampleRate: 24000, // Changed from 16000 to 24000
      channels: 1,
      recorder: 'arecord', // Use arecord for WSL/Linux
      device: 'default',   // Use the default device
      threshold: 0,        // Force recording even if silent
    });

    const micStream = recorder.stream();

    // Digital Gain (Volume Boost) Multiplier
    const GAIN_MULTIPLIER = 4.0; // Moderate gain to avoid clipping

    // Pipe Mic to Gemini and File
    let chunkCount = 0;
    micStream.on('data', (rawBuffer: Buffer) => {
      chunkCount++;

      // Apply Digital Gain
      const boostedBuffer = Buffer.alloc(rawBuffer.length);
      let clipCount = 0;
      for (let i = 0; i < rawBuffer.length; i += 2) {
        let val = rawBuffer.readInt16LE(i);
        val = val * GAIN_MULTIPLIER;

        if (val > 32767) {
          val = 32767;
          clipCount++;
        } else if (val < -32768) {
          val = -32768;
          clipCount++;
        }

        boostedBuffer.writeInt16LE(val, i);
      }

      if (chunkCount % 50 === 0) {
        console.log(`🎤 Sent ${chunkCount} chunks (x${GAIN_MULTIPLIER}) (len=${boostedBuffer.length}, clips=${clipCount})`);
      }

      // Save locally for debug
      micFileStream.write(boostedBuffer);

      session.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=24000',
          data: boostedBuffer.toString('base64'),
        },
      });
    });

    micStream.on('error', (err: any) => {
      console.error('🎤 Mic error:', err);
    });

    // Manual turn-end trigger (Enter key)
    const rl = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    console.log('💡 Press ENTER to force Claris to respond.');

    rl.on('line', () => {
      console.log('⌨️  Manual turn-end triggered.');
      stopAudioPlayer(); // Clear current audio if Claris was still speaking
      try {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: '。' }] }],
          turnComplete: true,
        });
      } catch (err) {
        console.error('❌ Failed to trigger turn-end:', err);
      }
    });

    // Initial greeting (To verify audio output immediately)
    session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: 'ヤッホー！クラリス、おしゃべりしよ！' }] }],
      turnComplete: true,
    });

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('🛑 Stopping...');
      rl.close();
      recorder.stop();
      session.close();
      pcmStream.end();
      micFileStream.end();
      stopAudioPlayer();
      process.exit(0);
    });

  } catch (error) {
    console.error('💥 Failed to connect:', error);
    process.exit(1);
  }
}

testLiveAPI();
