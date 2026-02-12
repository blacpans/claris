import * as Audio from './audio.js';
import * as UI from './ui.js';
import { AudioVisualizer } from './visualizer.js';

/** @type {WebSocket | null} */
let ws = null;
let isConnected = false;
let shouldReconnect = false;
let currentUserId = null;
let currentSessionId = null;
let config = { version: 'v0.19.2', wsPath: '/ws/live' };

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${config.wsPath}`;
}

// Start visualizer loop or similar logic
let isSpeaking = false;

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        currentUserId = data.userId;
        if (UI.loginOverlay.open) UI.loginOverlay.close();
        console.log(`🌸 Logged in as: ${currentUserId}`);
        return true;
      }
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }

  // Not authenticated
  if (!UI.loginOverlay.open) UI.loginOverlay.showModal();
  return false;
}

// Bind Login Button
if (UI.loginButton) {
  UI.loginButton.addEventListener('click', () => {
    window.location.href = '/api/auth/login';
  });
}

// Initial Setup
async function init() {
  // Fetch Config
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      config = await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch config, using defaults:', err);
  }

  // Display Version
  const versionEl = document.getElementById('version-display');
  if (versionEl) versionEl.textContent = config.version;
  console.log(`🌸 Claris Client ${config.version}`);

  // Auth Check
  const isAuthenticated = await checkAuth();

  // Service Worker & Web Push 登録
  if (isAuthenticated && 'serviceWorker' in navigator) {
    await setupPushNotifications();
  }
}

/**
 * Service Worker を登録し、Web Push 通知の購読を設定する
 */
async function setupPushNotifications() {
  try {
    // Service Worker 登録
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('📲 Service Worker registered:', registration.scope);

    // 通知権限を要求
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('📲 Notification permission denied');
      return;
    }

    // VAPID 公開鍵を取得
    const vapidRes = await fetch('/api/push/vapid-key');
    if (!vapidRes.ok) {
      console.warn('📲 VAPID key not available');
      return;
    }
    const { publicKey } = await vapidRes.json();

    // 既存のサブスクリプションを確認
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 新しいサブスクリプションを作成
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      console.log('📲 Push subscription created');
    }

    // サーバーにサブスクリプション情報を送信
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        subscription: subscription.toJSON(),
      }),
    });
    console.log('📲 Push subscription sent to server');
  } catch (err) {
    console.error('📲 Push setup failed:', err);
  }
}

/**
 * Base64 URL エンコードされた文字列を Uint8Array に変換する
 * (VAPID 公開鍵の変換に必要)
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

init();

// Textarea Auto-resize
if (UI.messageInput) {
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
      if (UI.inputArea instanceof HTMLFormElement) {
        UI.inputArea.requestSubmit();
      }
    }
  });
}

// Handle Text Chat
if (UI.inputArea) {
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
          userId: currentUserId || 'anonymous',
          sessionId: currentSessionId,
          message: text,
        }),
      });

      const data = await res.json();
      UI.hideLoading();

      if (data.error) {
        UI.appendMessage(`Error: ${data.error}`, 'ai');
      } else {
        if (data.sessionId) {
          currentSessionId = data.sessionId;
        }
        UI.appendMessage(data.response, 'ai');
      }
    } catch (err) {
      console.error(err);
      UI.hideLoading();
      UI.appendMessage('Error: Failed to send message.', 'ai');
    }
  });
}

// Live Button Handler
if (UI.liveBtn) {
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
}

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

/**
 * Starts the WebSocket connection and initializes audio/visualizer.
 * @returns {Promise<void>}
 */
async function startConnection() {
  if (UI.statusEl) UI.statusEl.textContent = 'Connecting...';
  UI.updateCaption('');

  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await Audio.initAudioContext();

        const wsUrl = getWebSocketUrl();
        const socketUrl = new URL(wsUrl);
        if (currentUserId) {
          socketUrl.searchParams.set('userId', currentUserId);
        }
        ws = new WebSocket(socketUrl.toString());
        ws.binaryType = 'arraybuffer';

        ws.onopen = async () => {
          UI.log('WebSocket Connected');
          if (UI.statusEl) UI.statusEl.textContent = 'Connected (Listening)';
          isConnected = true;

          // @ts-expect-error
          try {
            await Audio.startMicrophone((data) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(data);
              }
            }, selectedMicId);

            // Start Visualizer
            const analyser = Audio.getAnalyser();
            if (analyser) {
              visualizer.setAnalyser(analyser);
              visualizer.start();
            }

            // Show Overlay
            if (callOverlay) {
              if (typeof callOverlay.showModal === 'function') {
                // @ts-expect-error
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
              } else if (msg.type === 'proactive_message') {
                // 自律型通知: Claris が自発的に話しかけてきた！
                UI.appendMessage(msg.text, 'ai');
                UI.showToast(msg.text, msg.priority);
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

/**
 * Stops the WebSocket connection and resets UI state.
 */
function stopConnection() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  Audio.stopAudio();
  if (visualizer) visualizer.stop();

  if (callOverlay) {
    if (typeof callOverlay.close === 'function') {
      // @ts-expect-error
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

/**
 * Loop to check playback state and update UI accordingly.
 */
function loopPlaybackState() {
  Audio.checkPlaybackState(isConnected, (isSpeakingNow) => {
    if (isSpeaking !== isSpeakingNow) {
      isSpeaking = isSpeakingNow;
      if (isSpeaking) {
        if (UI.liveBtn) UI.liveBtn.style.boxShadow = '0 0 20px #ffeb3b';
        if (UI.statusEl) UI.statusEl.textContent = 'Claris Speaking... (Mic Muted)';
      } else {
        if (UI.liveBtn) UI.liveBtn.style.boxShadow = '0 4px 15px rgba(255, 75, 75, 0.5)'; // Reset to active red shadow
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
    if (UI.liveBtn) UI.liveBtn.style.boxShadow = 'none'; // Clear on disconnect
  }
}

// ==========================================
// Microphone Selection Logic
// ==========================================
let selectedMicId = localStorage.getItem('claris-mic-id') || '';
const micSelector = document.getElementById('mic-selector');
const micSelectorOverlay = document.getElementById('mic-selector-overlay');

/**
 * Populates microphone selectors with available audio input devices.
 */
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

/**
 * Handles microphone selection change.
 * @param {Event} e - The change event
 */
function handleMicChange(e) {
  // @ts-expect-error
  selectedMicId = e.target.value;
  localStorage.setItem('claris-mic-id', selectedMicId);
  UI.log(`🎤 Mic changed to: ${selectedMicId.slice(0, 8)}...`);

  // Sync other selectors
  // @ts-expect-error
  if (micSelector) micSelector.value = selectedMicId;
  // @ts-expect-error
  if (micSelectorOverlay) micSelectorOverlay.value = selectedMicId;

  // If currently connected, restart mic
  if (isConnected && ws) {
    Audio.startMicrophone((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }, selectedMicId).catch((err) => UI.log(`Failed to switch mic: ${err}`));
  }
}

if (micSelector) micSelector.addEventListener('change', handleMicChange);
if (micSelectorOverlay) micSelectorOverlay.addEventListener('change', handleMicChange);
