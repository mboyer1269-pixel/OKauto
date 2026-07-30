// OKauto background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('OKauto Listing Assistant installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['apiKey', 'apiUrl'], (result) => {
      sendResponse(result);
    });
    return true;
  }
  return false;
});
