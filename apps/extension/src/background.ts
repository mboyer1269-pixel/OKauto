import { api, getConfig } from './api.js';

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

async function refreshBadge() {
  try {
    const cfg = await getConfig();
    if (!cfg.token) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const res = await api<{ total: number }>('/v1/notifications?unreadOnly=true&pageSize=1');
    const text = res.total > 0 ? String(Math.min(res.total, 99)) : '';
    await chrome.action.setBadgeBackgroundColor({ color: '#3ecf8e' });
    await chrome.action.setBadgeText({ text });
  } catch {
    // ignore network errors
  }
}

setInterval(() => void refreshBadge(), 5 * 60 * 1000);
void refreshBadge();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OKAUTO_REFRESH_BADGE') {
    void refreshBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
