document.getElementById('open-side')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null && chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
