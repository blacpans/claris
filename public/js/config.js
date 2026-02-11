export const CONFIG = {
  CLIENT_VERSION: 'v0.19.2',
  WS_PATH: '/ws/live',
};

/**
 * Helper to get the full WebSocket URL based on current protocol
 * @returns {string} The full WebSocket URL
 */
export function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${CONFIG.WS_PATH}`;
}
