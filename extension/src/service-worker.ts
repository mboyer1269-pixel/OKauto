chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; urls?: string[]; label?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { downloaded: number; failed: number }) => void,
  ) => {
    if (message.type !== "DRIVEFLOW_DOWNLOAD_PHOTOS" || !Array.isArray(message.urls)) return false;
    const safeUrls = message.urls
      .slice(0, 50)
      .filter((url) => {
        try {
          return new URL(url).protocol === "https:";
        } catch {
          return false;
        }
      });
    void Promise.allSettled(
      safeUrls.map((url, index) =>
        chrome.downloads.download({
          url,
          filename: `DriveFlow/${(message.label ?? "vehicle").replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${String(index + 1).padStart(2, "0")}.jpg`,
          conflictAction: "uniquify",
          saveAs: false,
        }),
      ),
    ).then((results) => {
      sendResponse({
        downloaded: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      });
    });
    return true;
  },
);
