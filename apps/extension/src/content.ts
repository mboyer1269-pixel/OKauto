import { fillMarketplaceForm, type AssistPayload } from "./adapters/facebookMarketplace";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OKAUTO_ASSIST_FILL") {
    const payload = message.payload as AssistPayload;
    const result = fillMarketplaceForm(payload);
    sendResponse(result);
    return true;
  }
  if (message?.type === "OKAUTO_PING") {
    sendResponse({ ok: true, href: location.href });
    return true;
  }
  return false;
});

const bannerId = "okauto-assist-banner";
if (!document.getElementById(bannerId)) {
  const banner = document.createElement("div");
  banner.id = bannerId;
  banner.textContent =
    "OKauto assistive mode active — form fill only. Complete Facebook challenges yourself and publish manually.";
  Object.assign(banner.style, {
    position: "fixed",
    zIndex: "2147483646",
    left: "12px",
    bottom: "12px",
    maxWidth: "360px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(15,20,25,0.92)",
    color: "#f1f5f9",
    font: "600 12px/1.4 IBM Plex Sans, system-ui, sans-serif",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    border: "1px solid rgba(20,184,166,0.45)",
  });
  document.documentElement.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}
