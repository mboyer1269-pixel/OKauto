import type { AssistReport } from "@okauto/shared";

const PANEL_ID = "okauto-assist-overlay";

const CSS = `
  :host { all: initial; }
  .panel {
    position: fixed; top: 12px; right: 12px; z-index: 2147483647;
    width: 320px; max-height: 70vh; overflow-y: auto;
    background: #0f172a; color: #e2e8f0; border-radius: 12px;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 10px 40px rgba(0,0,0,.45); padding: 14px;
  }
  h2 { font-size: 14px; margin: 0 0 8px; color: #5eead4; }
  ul { margin: 8px 0; padding: 0; list-style: none; }
  li { display: flex; gap: 8px; align-items: center; padding: 3px 0; }
  .ok { color: #4ade80; } .bad { color: #f87171; } .pending { color: #facc15; }
  .note { background: #134e4a; border-radius: 8px; padding: 8px; margin-top: 10px; color: #99f6e4; }
  button {
    width: 100%; margin-top: 8px; padding: 8px; border: 0; border-radius: 8px;
    font-weight: 600; cursor: pointer;
  }
  .abort { background: #7f1d1d; color: #fecaca; }
  .done { background: #0d9488; color: #f0fdfa; }
  .small { color: #94a3b8; font-size: 11px; margin-top: 6px; }
`;

export interface OverlayCallbacks {
  onAbort: (reason: string) => void;
  onManualDone: () => void;
}

export class AssistOverlay {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly list: HTMLUListElement;
  private readonly status: HTMLDivElement;

  constructor(private readonly callbacks: OverlayCallbacks) {
    this.host = document.createElement("div");
    this.host.id = PANEL_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <h2>OKauto Listing Assistant</h2>
      <div class="status">Preparing…</div>
      <ul aria-label="Field checklist"></ul>
      <div class="note">Human-in-the-loop: we fill the form, <strong>you</strong> review and publish.
      We never submit forms or bypass protections on your behalf.</div>
      <button class="done" type="button">I've published — report outcome</button>
      <button class="abort" type="button">Abort &amp; report issue</button>
      <div class="small">Disable this panel from the extension popup.</div>
    `;
    this.root.append(style, panel);
    this.list = panel.querySelector("ul")!;
    this.status = panel.querySelector(".status")!;
    panel.querySelector<HTMLButtonElement>(".abort")!.addEventListener("click", () => {
      const reason = window.prompt("What went wrong? (sent to your dashboard)", "Form layout changed");
      if (reason !== null) this.callbacks.onAbort(reason || "Aborted by user");
    });
    panel.querySelector<HTMLButtonElement>(".done")!.addEventListener("click", () => this.callbacks.onManualDone());
  }

  mount(): void {
    if (!document.getElementById(PANEL_ID)) document.documentElement.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  renderChecklist(report: AssistReport): void {
    this.list.innerHTML = "";
    for (const field of report.fieldResults) {
      const li = document.createElement("li");
      const icon = field.ok ? "✓" : field.strategyIndex === null && field.attempts === 0 ? "…" : "✗";
      const cls = field.ok ? "ok" : icon === "…" ? "pending" : "bad";
      li.innerHTML = `<span class="${cls}" aria-hidden="true">${icon}</span><span>${field.field}${
        field.ok && field.strategyKind ? ` <span class="small">via ${field.strategyKind}</span>` : ""
      }${field.error ? ` <span class="small">(${field.error})</span>` : ""}</span>`;
      this.list.appendChild(li);
    }
    if (report.photosStaged > 0) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ok" aria-hidden="true">✓</span><span>${report.photosStaged} photo(s) staged</span>`;
      this.list.appendChild(li);
    }
  }
}
