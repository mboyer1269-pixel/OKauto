/** Options page: pair the extension with an OKauto account and org. */
import { testConnection } from './lib/api.js';
import { clearConfig, getConfig, setConfig } from './lib/storage.js';

const apiUrlEl = document.getElementById('apiUrl') as HTMLInputElement;
const orgIdEl = document.getElementById('orgId') as HTMLInputElement;
const tokenEl = document.getElementById('token') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;

function setStatus(text: string, cls = ''): void {
  statusEl.className = `status ${cls}`;
  statusEl.textContent = text;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

saveBtn.addEventListener('click', async () => {
  const apiUrl = normalizeUrl(apiUrlEl.value);
  const organizationId = orgIdEl.value.trim();
  const token = tokenEl.value.trim();
  if (!apiUrl || !organizationId || !token) {
    setStatus('All fields are required.', 'error');
    return;
  }
  saveBtn.disabled = true;
  setStatus('Testing connection…');
  try {
    const result = await testConnection(apiUrl, token);
    await setConfig({ apiUrl, organizationId, token, organizationName: result.user.name });
    setStatus(`Connected as ${result.user.name}. You can close this page.`, 'ok');
  } catch (err) {
    setStatus(`Connection failed: ${String(err)}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', async () => {
  await clearConfig();
  apiUrlEl.value = '';
  orgIdEl.value = '';
  tokenEl.value = '';
  setStatus('Disconnected.', 'warn');
});

async function init(): Promise<void> {
  const config = await getConfig();
  if (config) {
    apiUrlEl.value = config.apiUrl;
    orgIdEl.value = config.organizationId;
    tokenEl.value = config.token;
    setStatus('Currently connected.', 'ok');
  }
}

void init();
