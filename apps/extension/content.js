/**
 * OKauto Marketplace content script
 * Human-in-the-loop form assist with resilient selectors.
 * NEVER clicks Publish, NEVER interacts with CAPTCHA widgets.
 */

const SELECTOR_ADAPTERS = [
  {
    id: "marketplace-create-v1",
    match: () => /marketplace\/create/i.test(location.pathname + location.href),
    fields: {
      title: [
        'input[aria-label*="Title" i]',
        'textarea[aria-label*="Title" i]',
        'input[placeholder*="Title" i]',
      ],
      price: [
        'input[aria-label*="Price" i]',
        'input[placeholder*="Price" i]',
        'input[inputmode="decimal"]',
      ],
      description: [
        'textarea[aria-label*="Description" i]',
        'textarea[placeholder*="Description" i]',
        'div[aria-label*="Description" i][contenteditable="true"]',
      ],
      year: ['input[aria-label*="Year" i]', 'label:has-text("Year")'],
      mileage: ['input[aria-label*="Mileage" i]', 'input[aria-label*="Odometer" i]'],
    },
  },
  {
    id: "marketplace-generic-v1",
    match: () => /marketplace/i.test(location.href),
    fields: {
      title: ['input[aria-label*="Title" i]', 'input[type="text"]'],
      price: ['input[aria-label*="Price" i]'],
      description: ['textarea', 'div[contenteditable="true"]'],
    },
  },
];

function queryFirst(selectors) {
  for (const sel of selectors) {
    if (sel.includes(":has-text")) continue; // not valid CSS; skip
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      // invalid selector — try next
    }
  }
  return null;
}

function setNativeValue(el, value) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "div" && el.isContentEditable) {
    el.focus();
    el.textContent = String(value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
  }
  const proto =
    tag === "textarea"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function pickAdapter() {
  return SELECTOR_ADAPTERS.find((a) => a.match()) || SELECTOR_ADAPTERS[SELECTOR_ADAPTERS.length - 1];
}

function showToast(message) {
  const existing = document.getElementById("okauto-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "okauto-toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "2147483647",
    right: "16px",
    bottom: "16px",
    maxWidth: "320px",
    background: "#134836",
    color: "white",
    padding: "12px 14px",
    font: "13px/1.4 system-ui, sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  });
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function fillMarketplace(payload) {
  if (payload?.policy?.captchaBypassForbidden !== false) {
    // Explicitly refuse CAPTCHA interaction
    const captcha = document.querySelector(
      '[aria-label*="captcha" i], iframe[src*="captcha" i], #captcha, .g-recaptcha',
    );
    if (captcha) {
      showToast("CAPTCHA detected — complete it yourself. OKauto will not interact with it.");
    }
  }

  const adapter = pickAdapter();
  const results = {};
  const map = {
    title: payload.title,
    price: payload.price,
    description: payload.description,
    year: payload.year,
    mileage: payload.mileage,
  };

  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === "") continue;
    const selectors = adapter.fields[key];
    if (!selectors) continue;
    const el = queryFirst(selectors);
    results[key] = setNativeValue(el, value);
  }

  // Photo guidance only — do not auto-upload remotely without user gesture
  if (payload.photoUrls?.length) {
    showToast(
      `Filled fields via ${adapter.id}. ${payload.photoUrls.length} photo URL(s) ready — attach photos manually, review, then Publish.`,
    );
  } else {
    showToast(`Filled fields via ${adapter.id}. Review carefully, then Publish yourself.`);
  }

  return { adapter: adapter.id, results, photos: payload.photoUrls || [] };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OKAUTO_FILL") {
    try {
      const result = fillMarketplace(message.payload);
      sendResponse({ ok: true, result });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }
  return false;
});

console.info("[OKauto] Marketplace assist ready (human-in-the-loop).");
