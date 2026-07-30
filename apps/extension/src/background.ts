chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["apiBase"], (result) => {
    if (!result.apiBase) {
      chrome.storage.local.set({ apiBase: "http://localhost:3000" });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OKAUTO_GET_CONFIG") {
    chrome.storage.local.get(["apiBase", "token"], (cfg) => {
      sendResponse(cfg);
    });
    return true;
  }
  return false;
});
