// Service worker — session keepalive + messaging hub
chrome.runtime.onInstalled.addListener(() => {
  console.info("OKauto extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OKAUTO_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  return false;
});
