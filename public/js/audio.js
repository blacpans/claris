import { log } from './ui.js';

let audioContext;
let processor;
let inputSource;
let activeSources = [];
let nextStartTime = 0;
let analyser;

export function getAnalyser() {
  return analyser;
}

// Configs
const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

export function getAudioContext() {
  return audioContext;
}

export async function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  nextStartTime = audioContext.currentTime;
}

export function stopAudio() {
  if (processor) processor.disconnect();
  if (inputSource) inputSource.disconnect();
  if (audioContext) audioContext.close();

  interruptPlayback();

  nextStartTime = 0;
  audioContext = null;
  analyser = null;
}

export async function getAudioDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    log('⚠️ enumerateDevices() not supported.');
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  return audioInputs;
}

export async function startMicrophone(ws, deviceId = null) {
  try {
    if (inputSource) {
      inputSource.disconnect();
      if (processor) processor.disconnect();
    }

    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    if (deviceId) {
      constraints.audio.deviceId = { exact: deviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    inputSource = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    if (analyser) {
      inputSource.connect(analyser);
    }

    inputSource.connect(processor);
    processor.connect(audioContext.destination);

    // Debug: Log Active Mic Details
    const tracks = stream.getAudioTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      // const settings = track.getSettings();
      log(`🎤 Active Mic: ${track.label || 'Hidden Label (Check Permissions)'}`);
      // log(`🎤 Mic Settings: ${JSON.stringify(settings)}`);
    } else {
      log('⚠️ No Audio Tracks Found on Stream!');
    }

    processor.onaudioprocess = (e) => {
      // Software Mute if AI is speaking (plus 600ms tail)
      if (audioContext && nextStartTime && audioContext.currentTime < nextStartTime + 0.6) {
        return;
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);

        // Debug Input Level (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        if (Math.random() < 0.05) {
          // Log occasionally (approx every 1-2 sec)
          // Only log level if it's NOT zero, or very occasionally if it is zero
          if (rms > 0.0001 || Math.random() < 0.1) {
            log(`🎤 Mic Level: ${rms.toFixed(4)}`);
          }
        }

        const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, SAMPLE_RATE_IN);
        ws.send(convertFloat32ToInt16(downsampled));
      }
    };

    log('Microphone Active');
  } catch (err) {
    log(`Mic Error: ${err.message}`);
    throw err;
  }
}

export function queueAudioChunk(arrayBuffer) {
  if (!audioContext) return;

  // Convert Int16 PCM to Float32
  const pcm16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }

  // Create AudioBuffer
  const buffer = audioContext.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
  buffer.getChannelData(0).set(float32);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  // Connect to Analyser and Destination
  if (analyser) {
    source.connect(analyser);
  }
  source.connect(audioContext.destination);

  // Scheduling
  if (nextStartTime < audioContext.currentTime) {
    nextStartTime = audioContext.currentTime + 0.05;
  }

  source.start(nextStartTime);
  nextStartTime += buffer.duration;

  activeSources.push(source);
  source.onended = () => {
    const idx = activeSources.indexOf(source);
    if (idx > -1) activeSources.splice(idx, 1);
  };
}

export function interruptPlayback() {
  activeSources.forEach((s) => {
    try {
      s.stop();
    } catch (_e) {}
  });
  activeSources = [];
  if (audioContext) nextStartTime = audioContext.currentTime;
}

export function checkPlaybackState(isConnected, onSpeakingStateChange) {
  if (!isConnected || !audioContext) return;

  const isPlayingTime = audioContext.currentTime < nextStartTime;
  const isPlaying = isPlayingTime || activeSources.length > 0;

  onSpeakingStateChange(isPlaying);
}

// Helpers
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const decimal = originalPos - index;

    const y0 = buffer[index] || 0;
    const y1 = buffer[index + 1] || y0;

    result[i] = y0 + (y1 - y0) * decimal;
  }
  return result;
}

function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf.buffer;
}
