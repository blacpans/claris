import * as Audio from './js/audio.js';
import * as UI from './js/ui.js';
import { AudioVisualizer } from './js/visualizer.js';

let ws;
let isConnected = false;
let shouldReconnect = false;

// Start visualizer loop or similar logic
let isSpeaking = false;

// Generate a random User ID for this session
const userId = `web-${Math.random().toString(36).substring(2, 11)}`;

const CLIENT_VERSION = 'v0.19.2';
console.log(`🌸 Claris Client ${CLIENT_VERSION}`);

// Display Version
const versionEl = document.getElementById('client-version');
if (versionEl) versionEl.textContent = CLIENT_VERSION;

// Textarea Auto-resize
UI.messageInput.addEventListener('input', function () {
  this.style.height = 'auto'; // Reset to calculate scrollHeight
  const newHeight = Math.min(this.scrollHeight, 150); // Max height 150px
  this.style.height = `${newHeight}px`;
});

// Handle Enter to Send
UI.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (UI.sendBtn.disabled) return;
    UI.inputArea.requestSubmit();
  }
});

// Handle Text Chat
UI.inputArea.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = UI.messageInput.value.trim();
  if (!text) return;

  UI.appendMessage(text, 'user');
  UI.messageInput.value = '';
  UI.messageInput.style.height = '50px';

  UI.showLoading();

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        message: text,
      }),
    });

    const data = await res.json();
    UI.hideLoading();

    if (data.error) {
      UI.appendMessage(`Error: ${data.error}`, 'ai');
    } else {
      UI.appendMessage(data.response, 'ai');
    }
  } catch (err) {
    console.error(err);
    UI.hideLoading();
    UI.appendMessage('Error: Failed to send message.', 'ai');
  }
});

// Live Button Handler
UI.liveBtn.addEventListener('click', async () => {
  UI.setLiveBtnLoading(true);

  try {
    if (!isConnected) {
      shouldReconnect = true;
      await startConnection();
    } else {
      shouldReconnect = false;
      stopConnection();
    }
  } catch (err) {
    console.error('Toggle connection failed:', err);
  } finally {
    UI.setLiveBtnLoading(false);
    UI.updateLiveStatus(isConnected);
  }
});

// Initialize Visualizer (Ensure AudioVisualizer is imported or available)
const visualizer = new AudioVisualizer('waveform');
const callOverlay = document.getElementById('call-overlay');
const closeBtn = document.getElementById('end-call-btn');

// Close btn handler
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    stopConnection();
  });
}

async function startConnection() {
  if (UI.statusEl) UI.statusEl.textContent = 'Connecting...';
  UI.updateCaption('');

  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await Audio.initAudioContext();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/live`;

        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = async () => {
          UI.log('WebSocket Connected');
          if (UI.statusEl) UI.statusEl.textContent = 'Connected (Listening)';
          isConnected = true;

          try {
            await Audio.startMicrophone(ws, selectedMicId);

            // Start Visualizer
            const analyser = Audio.getAnalyser();
            if (analyser) {
              visualizer.setAnalyser(analyser);
              visualizer.start();
            }

            // Show Overlay
            if (callOverlay) {
              if (typeof callOverlay.showModal === 'function') {
                callOverlay.showModal();
              } else {
                callOverlay.style.display = 'flex';
              }
              document.body.classList.add('call-active');

              // Resize visualizer after modal is shown and layout is computed
              setTimeout(() => {
                visualizer.resize();
              }, 50);
            }

            requestAnimationFrame(loopPlaybackState);
            resolve();
          } catch (err) {
            reject(err);
          }
        };

        ws.onmessage = async (event) => {
          if (event.data instanceof ArrayBuffer) {
            Audio.queueAudioChunk(event.data);
          } else {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'interrupted') {
                UI.log('🛑 Interrupted by Server');
                Audio.interruptPlayback();
                UI.updateCaption('');
              } else if (msg.type === 'text') {
                UI.updateCaption(msg.text);
              } else {
                UI.log(`Server: ${event.data}`);
              }
            } catch (_e) {
              UI.log(`Server: ${event.data}`);
            }
          }
        };

        ws.onclose = () => {
          UI.log('WebSocket Closed');
          stopConnection();

          if (shouldReconnect) {
            UI.log('🔄 Reconnecting in 3s...');
            if (UI.statusEl) UI.statusEl.textContent = 'Reconnecting...';
            setTimeout(() => {
              if (shouldReconnect) startConnection();
            }, 3000);
          }
        };

        ws.onerror = (error) => {
          UI.log('WebSocket Error');
          console.error(error);
          reject(error);
        };
      } catch (err) {
        UI.log(`Error: ${err.message}`);
        stopConnection();
        reject(err);
      }
    })();
  });
}

function stopConnection() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }

  Audio.stopAudio();
  if (visualizer) visualizer.stop();

  if (callOverlay) {
    if (typeof callOverlay.close === 'function') {
      callOverlay.close();
    } else {
      callOverlay.style.display = 'none';
    }
    document.body.classList.remove('call-active');
  }

  if (UI.statusEl) UI.statusEl.textContent = 'Tap to Connect';

  UI.updateLiveStatus(false);
  isConnected = false;
}

function loopPlaybackState() {
  Audio.checkPlaybackState(isConnected, (isSpeakingNow) => {
    if (isSpeaking !== isSpeakingNow) {
      isSpeaking = isSpeakingNow;
      if (isSpeaking) {
        UI.liveBtn.style.boxShadow = '0 0 20px #ffeb3b';
        if (UI.statusEl) UI.statusEl.textContent = 'Claris Speaking... (Mic Muted)';
      } else {
        UI.liveBtn.style.boxShadow = '0 4px 15px rgba(255, 75, 75, 0.5)'; // Reset to active red shadow
        // Note: UI.updateLiveStatus(true) sets it to red,
        // but manual override in checkPlaybackState needs careful reset.
        // Actually updateLiveStatus manages base state.
        // Here we just add/remove glow.
        if (UI.statusEl) UI.statusEl.textContent = 'Listening...';
      }
    }
  });

  if (isConnected) {
    requestAnimationFrame(loopPlaybackState);
  } else {
    UI.liveBtn.style.boxShadow = 'none'; // Clear on disconnect
  }
}

// ==========================================
// Microphone Selection Logic
// ==========================================
let selectedMicId = localStorage.getItem('claris-mic-id');
const micSelector = document.getElementById('mic-selector');
const micSelectorOverlay = document.getElementById('mic-selector-overlay');

async function populateMicSelectors() {
  // Request permission first to get labels (if not already granted)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => {
      t.stop();
    });
  } catch (e) {
    console.warn('Mic permission check failed:', e);
  }

  const devices = await Audio.getAudioDevices();
  const optionsHTML =
    '<option value="" disabled>Select Microphone...</option>' +
    devices
      .map((d) => {
        const selected = d.deviceId === selectedMicId ? 'selected' : '';
        return `<option value="${d.deviceId}" ${selected}>${d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}</option>`;
      })
      .join('');

  if (micSelector) micSelector.innerHTML = optionsHTML;
  if (micSelectorOverlay) micSelectorOverlay.innerHTML = optionsHTML;

  if (!selectedMicId && devices.length > 0) {
    selectedMicId = devices[0].deviceId;
  }
}

// Initial population
populateMicSelectors();

function handleMicChange(e) {
  selectedMicId = e.target.value;
  localStorage.setItem('claris-mic-id', selectedMicId);
  UI.log(`🎤 Mic changed to: ${selectedMicId.slice(0, 8)}...`);

  // Sync other selectors
  if (micSelector) micSelector.value = selectedMicId;
  if (micSelectorOverlay) micSelectorOverlay.value = selectedMicId;

  // If currently connected, restart mic
  if (isConnected && ws) {
    Audio.startMicrophone(ws, selectedMicId).catch((err) => UI.log(`Failed to switch mic: ${err}`));
  }
}

if (micSelector) micSelector.addEventListener('change', handleMicChange);
if (micSelectorOverlay) micSelectorOverlay.addEventListener('change', handleMicChange);
