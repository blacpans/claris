export const statusEl = document.getElementById('status');
export const captionsEl = document.getElementById('captions');
export const inputArea = document.getElementById('input-area');
export const messageInput = document.getElementById('message-input');
export const chatHistory = document.getElementById('chat-history');
export const liveBtn = document.getElementById('live-btn');
export const sendBtn = document.getElementById('send-btn');
export const loginOverlay = document.getElementById('login-overlay');
export const loginButton = document.getElementById('login-button');

let loadingDiv = null;

const ICONS = {
  // Rounded "Call" icon - more polished
  phone:
    '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M19.23 15.26l-2.54-.29c-.61-.07-1.21.14-1.64.57l-1.84 1.84c-2.83-1.44-5.15-3.75-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52c-.12-1.01-.97-1.77-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07.53 8.54 7.36 15.36 15.89 15.89 1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98z"/></svg>',
  loader:
    '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 animate-spin"><path d="M12 4V2.5M12 21.5V20M6 12H4.5M19.5 12H18M7.757 7.757L6.696 6.696M17.304 17.304l-1.061-1.061M7.757 16.243l-1.061 1.061M17.304 6.696l-1.061 1.061"/></svg>',
};

// Configure Marked if available
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true, // Enable line breaks with single newlines
    gfm: true,
  });

  // Custom renderer to escape raw HTML (prevent XSS and layout breakage from pasted HTML)
  const renderer = new marked.Renderer();
  renderer.html = (text) => {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  marked.use({ renderer });
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
  loadingDiv.className =
    'flex gap-1.5 p-4 bg-muted rounded-2xl rounded-tl-none w-fit mb-4 animate-in fade-in slide-in-from-bottom-2 shadow-sm';
  loadingDiv.innerHTML = `
    <div class="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div class="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div class="w-2 h-2 bg-foreground/50 rounded-full animate-bounce"></div>
  `;
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
  // Message styling based on type
  const baseClasses =
    'flex w-full max-w-[85%] flex-col gap-2 rounded-2xl p-4 text-sm shadow-sm animate-in fade-in slide-in-from-bottom-2 backdrop-blur-md border border-white/10';
  const typeClasses =
    type === 'user'
      ? 'ml-auto bg-primary/80 text-primary-foreground rounded-br-none'
      : 'mr-auto bg-background/60 text-foreground rounded-tl-none';

  div.className = `${baseClasses} ${typeClasses}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'prose prose-sm dark:prose-invert break-words';

  if (typeof marked !== 'undefined') {
    contentDiv.innerHTML = marked.parse(text);
  } else {
    contentDiv.textContent = text;
  }

  div.appendChild(contentDiv);

  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

export function setLiveBtnLoading(isLoading) {
  if (isLoading) {
    liveBtn.disabled = true;
    liveBtn.innerHTML = `<span class="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></span>`;
  } else {
    liveBtn.disabled = false;
    // Icon will be reset by updateLiveStatus usually, but safe fallback
  }
}

export function updateLiveStatus(active) {
  // Reset base styles (handled by Tailwind classes in HTML, just modifying state-specifics)
  liveBtn.className =
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-300 shadow-md border border-input';

  if (active) {
    messageInput.placeholder = 'Listening...';

    // Active State: Red/Destructive + Pulse
    liveBtn.classList.remove('bg-secondary', 'text-primary');
    liveBtn.classList.add(
      'bg-destructive',
      'text-destructive-foreground',
      'hover:bg-destructive/90',
      'hover:scale-110',
    );
    liveBtn.innerHTML = ICONS.phone;
  } else {
    messageInput.placeholder = 'Message...';

    // Inactive State: Default (Secondary/Primary)
    liveBtn.classList.remove('bg-destructive', 'text-destructive-foreground');
    liveBtn.classList.add('bg-secondary', 'text-primary', 'hover:bg-secondary/80', 'hover:scale-105');
    liveBtn.innerHTML = ICONS.phone;
  }
}

// Set initial icon
liveBtn.innerHTML = ICONS.phone;

/**
 * トースト通知を表示する（プロアクティブ通知用）
 * @param {string} text - 通知テキスト
 * @param {string} priority - 優先度 ('low' | 'medium' | 'high' | 'critical')
 */
export function showToast(text, priority = 'medium') {
  const toast = document.createElement('div');

  // Priority based styling
  let colorClass = 'bg-accent text-accent-foreground border-border';
  if (priority === 'high') colorClass = 'bg-orange-500 text-white border-orange-600';
  if (priority === 'critical') colorClass = 'bg-destructive text-destructive-foreground border-destructive';
  if (priority === 'low') colorClass = 'bg-muted text-muted-foreground border-border';

  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 max-w-[90%] w-96 p-4 rounded-xl border shadow-2xl z-[100] cursor-pointer transition-all duration-500 transform -translate-y-20 opacity-0 ${colorClass}`;

  // 最初の1行だけをトーストに表示（長文は省略）
  const shortText = text.split('\n')[0].slice(0, 80);
  toast.textContent = shortText;

  // Icon
  const icon = document.createElement('span');
  icon.className = 'mr-2';
  icon.textContent = priority === 'critical' ? '🚨' : priority === 'high' ? '⚠️' : '🔔';
  toast.prepend(icon);

  document.body.appendChild(toast);

  // アニメーション開始
  requestAnimationFrame(() => {
    toast.classList.remove('-translate-y-20', 'opacity-0');
  });

  // 5秒後に自動消去
  setTimeout(() => {
    toast.classList.add('-translate-y-20', 'opacity-0');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 5000);
}
