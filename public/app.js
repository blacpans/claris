const micBtn = document.getElementById('mic-btn');
const statusEl = document.getElementById('status');
const _logsEl = document.getElementById('logs');
const captionsEl = document.getElementById('captions');

let ws;
let audioContext;
let processor;
let inputSource;
let isConnected = false;

// Audio Queue & State
let nextStartTime = 0;
let isPlaying = false;
const _audioQueue = [];

// Configs
const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

function log(msg) {
  console.log(msg);
}

function updateCaption(text) {
  captionsEl.textContent = text;
}

micBtn.addEventListener('click', async () => {
  if (!isConnected) {
    await startConnection();
  } else {
    stopConnection();
  }
});

async function startConnection() {
  micBtn.classList.add('connecting');
  statusEl.textContent = 'Connecting...';
  captionsEl.textContent = '';

  try {
    // 1. Initialize Audio Context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    nextStartTime = audioContext.currentTime;

    // 2. Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = async () => {
      log('WebSocket Connected');
      micBtn.classList.remove('connecting');
      micBtn.classList.add('active');
      statusEl.textContent = 'Connected (Listening)';
      isConnected = true;

      // Start Microphone
      await startMicrophone();

      // Start monitoring playback state
      requestAnimationFrame(checkPlaybackState);
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Audio received from server (24kHz PCM)
        queueAudioChunk(event.data);
      } else {
        // Text message
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'interrupted') {
            log('🛑 Interrupted by Server');
            interruptPlayback();
            captionsEl.textContent = ''; // Clear caption on interrupt
          } else if (msg.type === 'text') {
            updateCaption(msg.text); // Show caption
          } else {
            log(`Server: ${event.data}`);
          }
        } catch (_e) {
          log(`Server: ${event.data}`);
        }
      }
    };

    ws.onclose = () => {
      log('WebSocket Closed');
      stopConnection();
    };

    ws.onerror = (error) => {
      log('WebSocket Error');
      console.error(error);
      stopConnection();
    };
  } catch (err) {
    log(`Error: ${err.message}`);
    stopConnection();
  }
}

function stopConnection() {
  if (ws) ws.close();
  if (processor) processor.disconnect();
  if (inputSource) inputSource.disconnect();
  if (audioContext) audioContext.close();

  micBtn.classList.remove('active');
  micBtn.classList.remove('connecting');
  statusEl.textContent = 'Tap to Connect';
  isConnected = false;
  isPlaying = false;
}

async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    inputSource = audioContext.createMediaStreamSource(stream);

    // Buffer size 4096 is a good balance for script processor
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    inputSource.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      // Software Mute: Do not send audio if AI is speaking (plus 600ms echo tail)
      if (audioContext && nextStartTime && audioContext.currentTime < nextStartTime + 0.6) {
        return;
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample to 16kHz and send
        const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, SAMPLE_RATE_IN);
        ws.send(convertFloat32ToInt16(downsampled));
      }
    };

    log('Microphone Active');
  } catch (err) {
    log(`Mic Error: ${err.message}`);
    stopConnection();
  }
}

function queueAudioChunk(arrayBuffer) {
  // Convert Int16 PCM to Float32
  const pcm16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768; // Normalize to -1.0 to 1.0
  }

  // Create AudioBuffer
  const buffer = audioContext.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
  buffer.getChannelData(0).set(float32);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  // Scheduling
  // If nextStartTime is in the past, reset it to now (plus small buffer)
  if (nextStartTime < audioContext.currentTime) {
    nextStartTime = audioContext.currentTime + 0.05; // 50ms buffer
  }

  source.start(nextStartTime);
  nextStartTime += buffer.duration;

  // Track this source for potential cancellation?
  activeSources.push(source);
  source.onended = () => {
    const idx = activeSources.indexOf(source);
    if (idx > -1) activeSources.splice(idx, 1);
  };
}

let activeSources = [];

function interruptPlayback() {
  // Stop all currently playing sources
  activeSources.forEach((s) => {
    try {
      s.stop();
    } catch (_e) {}
  });
  activeSources = [];

  // Reset time
  nextStartTime = audioContext.currentTime;
}

function checkPlaybackState() {
  if (!isConnected) return;

  // Determine if playing based on time
  const isPlayingTime = audioContext.currentTime < nextStartTime;
  // If we are technically "playing" but no sources are active (e.g. stopped manually), logic might drift.
  // But generally, nextStartTime advances.

  // Also check if sources are actually in the array (redundancy)
  // Or simply:
  const wasPlaying = isPlaying;
  isPlaying = isPlayingTime || activeSources.length > 0;

  if (isPlaying !== wasPlaying) {
    if (isPlaying) {
      micBtn.style.border = '4px solid #ff69b4'; // Visual cue for AI speaking
      statusEl.textContent = 'Clarils Speaking... (Mic Muted)';
    } else {
      micBtn.style.border = 'none';
      statusEl.textContent = 'Listening...';
    }
  }

  requestAnimationFrame(checkPlaybackState);
}

// --- Helpers ---

function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) {
    return buffer;
  }
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const decimal = originalPos - index;

    // Linear Interpolation: y = y0 + (y1 - y0) * d
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
    // Clamp to -1 to 1
    const s = Math.max(-1, Math.min(1, buffer[l]));
    // Convert to PCM16
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf.buffer;
}
