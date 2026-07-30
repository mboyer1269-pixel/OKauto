import { getConfig, setConfig, api } from './api.js';

const apiUrl = document.getElementById('apiUrl') as HTMLInputElement;
const token = document.getElementById('token') as HTMLInputElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const testBtn = document.getElementById('test') as HTMLButtonElement;

async function init() {
  const cfg = await getConfig();
  apiUrl.value = cfg.apiUrl;
  token.value = cfg.token;
}

saveBtn.addEventListener('click', async () => {
  await setConfig({ apiUrl: apiUrl.value.trim().replace(/\/$/, ''), token: token.value.trim() });
  status.textContent = 'Saved.';
  status.className = 'muted';
});

testBtn.addEventListener('click', async () => {
  await setConfig({ apiUrl: apiUrl.value.trim().replace(/\/$/, ''), token: token.value.trim() });
  try {
    const me = await api<{ user: { email: string } }>('/v1/me');
    status.textContent = `Connected as ${me.user.email}`;
    status.className = 'muted';
    chrome.runtime.sendMessage({ type: 'OKAUTO_REFRESH_BADGE' });
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : 'Connection failed';
    status.className = 'error';
  }
});

void init();
