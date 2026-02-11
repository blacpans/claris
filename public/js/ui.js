export const statusEl = document.getElementById('status');
export const captionsEl = document.getElementById('captions');
export const inputArea = document.getElementById('input-area');
export const messageInput = document.getElementById('message-input');
export const chatHistory = document.getElementById('chat-history');
export const liveBtn = document.getElementById('live-btn');
export const sendBtn = document.getElementById('send-btn');
export const liveIndicator = document.getElementById('live-indicator');
export const loginOverlay = document.getElementById('login-overlay');
export const loginButton = document.getElementById('login-button');

let loadingDiv = null;

const ICONS = {
  // Rounded "Call" icon - more polished
  phone:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.23 15.26l-2.54-.29c-.61-.07-1.21.14-1.64.57l-1.84 1.84c-2.83-1.44-5.15-3.75-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52c-.12-1.01-.97-1.77-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07.53 8.54 7.36 15.36 15.89 15.89 1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98z"/></svg>',
  loader:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V2.5M12 21.5V20M6 12H4.5M19.5 12H18M7.757 7.757L6.696 6.696M17.304 17.304l-1.061-1.061M7.757 16.243l-1.061 1.061M17.304 6.696l-1.061 1.061"/></svg>',
};

// Configure Marked if available
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true, // Enable line breaks with single newlines
    gfm: true,
  });
}

export function log(msg) {
  console.log(msg);
}

export function updateCaption(text) {
  if (captionsEl) captionsEl.textContent = text;
}

export function showLoading() {
  if (loadingDiv) return;
  loadingDiv = document.createElement('div');
  loadingDiv.className = 'typing-indicator';
  loadingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatHistory.appendChild(loadingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  sendBtn.disabled = true;
}

export function hideLoading() {
  if (loadingDiv) {
    loadingDiv.remove();
    loadingDiv = null;
  }
  sendBtn.disabled = false;
  messageInput.focus();
}

export function appendMessage(text, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;

  if (typeof marked !== 'undefined') {
    div.innerHTML = marked.parse(text);
  } else {
    div.textContent = text;
  }

  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

export function setLiveBtnLoading(isLoading) {
  if (isLoading) {
    liveBtn.classList.add('processing');
    liveBtn.innerHTML = ICONS.loader;
  } else {
    liveBtn.classList.remove('processing');
  }
}

export function updateLiveStatus(active) {
  if (active) {
    liveIndicator.classList.add('visible');
    messageInput.placeholder = 'Listening...';
    liveBtn.classList.add('active');

    liveBtn.innerHTML = ICONS.phone;
    liveBtn.style.transform = 'rotate(135deg)';
    liveBtn.style.background = '#ff4b4b';
    liveBtn.style.borderColor = '#ff4b4b';
  } else {
    liveIndicator.classList.remove('visible');
    messageInput.placeholder = 'Message...';
    liveBtn.classList.remove('active');

    liveBtn.innerHTML = ICONS.phone;
    liveBtn.style.transform = 'rotate(0deg)';
    liveBtn.style.background = '#2a2a2a';
    liveBtn.style.borderColor = '#666';
  }
}

// Set initial icon
liveBtn.innerHTML = ICONS.phone;
