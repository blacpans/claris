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

export async function startMicrophone(onAudioData, deviceId = null) {
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

    // Load AudioWorklet Processor
    try {
      await audioContext.audioWorklet.addModule('./js/audio-processor.js');
    } catch (e) {
      throw new Error(`Failed to load audio processor: ${e.message}`);
    }

    processor = new AudioWorkletNode(audioContext, 'audio-processor');

    if (analyser) {
      inputSource.connect(analyser);
    }

    inputSource.connect(processor);
    processor.connect(audioContext.destination);

    // Debug: Log Active Mic Details
    const tracks = stream.getAudioTracks();
    if (tracks.length > 0) {
      const track = tracks[0];
      log(`🎤 Active Mic: ${track.label || 'Hidden Label (Check Permissions)'}`);
    } else {
      log('⚠️ No Audio Tracks Found on Stream!');
    }

    processor.port.onmessage = (e) => {
      // Software Mute if AI is speaking (plus 600ms tail)
      if (audioContext && nextStartTime && audioContext.currentTime < nextStartTime + 0.6) {
        return;
      }

      if (e.data.type === 'audio') {
        if (onAudioData) {
          onAudioData(e.data.data);
        }

        const rms = e.data.rms;
        if (Math.random() < 0.05) {
          if (rms > 0.0001 || Math.random() < 0.1) {
            log(`🎤 Mic Level: ${rms.toFixed(4)}`);
          }
        }
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
