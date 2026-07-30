import { DEFAULT_API_URL, getSession, login, logout } from "./api.js";

const root = document.getElementById("root")!;

function renderLogin(error = ""): void {
  root.innerHTML = `
    <h1><span class="logo">O</span> OpenLot Lister</h1>
    <form id="form">
      <label for="email">Email</label>
      <input id="email" type="email" required autocomplete="email" />
      <label for="password">Password</label>
      <input id="password" type="password" required autocomplete="current-password" />
      <details>
        <summary>Server settings</summary>
        <label for="apiUrl">API URL</label>
        <input id="apiUrl" type="url" value="${DEFAULT_API_URL}" />
      </details>
      <button type="submit">Sign in</button>
      <div class="error">${error}</div>
    </form>
  `;
  document.getElementById("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email") as HTMLInputElement).value;
    const password = (document.getElementById("password") as HTMLInputElement).value;
    const apiUrl = (document.getElementById("apiUrl") as HTMLInputElement).value.replace(/\/$/, "");
    try {
      await login(apiUrl, email, password);
      await chrome.runtime.sendMessage({ kind: "REFRESH_BADGE" });
      await renderSignedIn();
    } catch (err) {
      renderLogin(err instanceof Error ? err.message : "Sign-in failed");
    }
  });
}

async function renderSignedIn(): Promise<void> {
  const session = await getSession();
  if (!session) return renderLogin();
  root.innerHTML = `
    <h1><span class="logo">O</span> OpenLot Lister</h1>
    <div class="who">Signed in as <strong>${session.user.name}</strong><br/>${session.orgs[0]?.name ?? ""}</div>
    <button id="open-panel">Open inventory panel</button>
    <button id="sign-out" class="secondary">Sign out</button>
  `;
  document.getElementById("open-panel")!.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  });
  document.getElementById("sign-out")!.addEventListener("click", async () => {
    await logout();
    await chrome.action.setBadgeText({ text: "" });
    renderLogin();
  });
}

getSession().then((session) => (session ? renderSignedIn() : renderLogin()));
