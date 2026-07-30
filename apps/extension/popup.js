const DEFAULT_API = "http://localhost:4000";

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(obj) {
  return chrome.storage.local.set(obj);
}

async function api(path, { method = "GET", token, body, apiUrl } = {}) {
  const base = apiUrl || (await storageGet(["apiUrl"])).apiUrl || DEFAULT_API;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function $(id) {
  return document.getElementById(id);
}

let selectedVehicle = null;
let session = null;

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function showApp(loggedIn) {
  $("login-view").hidden = loggedIn;
  $("app-view").hidden = !loggedIn;
}

async function bootstrap() {
  const stored = await storageGet([
    "accessToken",
    "refreshToken",
    "user",
    "organizationId",
    "organizationName",
    "apiUrl",
  ]);
  if (stored.apiUrl) $("apiUrl").value = stored.apiUrl;
  if (stored.accessToken && stored.organizationId) {
    session = stored;
    $("userLabel").textContent = `${stored.user?.name || "User"} · ${stored.organizationName || ""}`;
    showApp(true);
    await loadVehicles();
  } else {
    showApp(false);
  }
}

async function login() {
  $("loginError").hidden = true;
  try {
    const apiUrl = $("apiUrl").value.trim() || DEFAULT_API;
    const data = await api("/v1/auth/login", {
      method: "POST",
      apiUrl,
      body: {
        email: $("email").value.trim(),
        password: $("password").value,
      },
    });
    const membership = data.memberships?.[0];
    if (!membership) throw new Error("No organization membership");
    session = {
      apiUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
    };
    await storageSet(session);
    $("userLabel").textContent = `${data.user.name} · ${membership.organization.name}`;
    showApp(true);
    await loadVehicles();
  } catch (err) {
    $("loginError").hidden = false;
    $("loginError").textContent = err.message;
  }
}

async function logout() {
  await chrome.storage.local.clear();
  session = null;
  selectedVehicle = null;
  showApp(false);
}

async function loadVehicles() {
  if (!session) return;
  const q = $("search").value.trim();
  const res = await api(
    `/v1/orgs/${session.organizationId}/vehicles?status=available&take=40&search=${encodeURIComponent(q)}`,
    { token: session.accessToken, apiUrl: session.apiUrl },
  );
  const list = $("vehicleList");
  list.innerHTML = "";
  for (const v of res.items || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vehicle";
    btn.setAttribute("role", "option");
    btn.textContent = `${v.year} ${v.make} ${v.model} ${v.trim || ""} — $${(v.priceCents / 100).toLocaleString()}`;
    btn.addEventListener("click", () => {
      selectedVehicle = v;
      [...list.children].forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      $("prepareBtn").disabled = false;
      $("fillBtn").disabled = false;
      setStatus(`Selected ${v.year} ${v.make} ${v.model}`);
    });
    list.appendChild(btn);
  }
  if (!(res.items || []).length) {
    list.innerHTML = `<div style="padding:8px;color:#466055">No vehicles found.</div>`;
  }
}

async function prepareListing() {
  if (!session || !selectedVehicle) return;
  setStatus("Creating listing draft…");
  try {
    // Ensure description exists
    if (!selectedVehicle.description) {
      const described = await api(
        `/v1/orgs/${session.organizationId}/vehicles/${selectedVehicle.id}/describe`,
        {
          method: "POST",
          token: session.accessToken,
          apiUrl: session.apiUrl,
          body: { tone: "professional" },
        },
      );
      selectedVehicle = described.vehicle;
    }
    const listing = await api(`/v1/orgs/${session.organizationId}/listings`, {
      method: "POST",
      token: session.accessToken,
      apiUrl: session.apiUrl,
      body: {
        vehicleId: selectedVehicle.id,
        channel: "marketplace",
        title: `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`,
        description: selectedVehicle.description,
        priceCents: selectedVehicle.priceCents,
      },
    });
    await storageSet({ activeListing: listing.listing, activeVehicle: selectedVehicle });
    setStatus("Draft ready. Open Marketplace create listing, then Fill form.");
  } catch (err) {
    setStatus(err.message);
  }
}

async function fillForm() {
  if (!selectedVehicle) return;
  const payload = {
    title: `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.trim || ""}`.trim(),
    price: Math.round(selectedVehicle.priceCents / 100),
    description: selectedVehicle.description || "",
    year: selectedVehicle.year,
    make: selectedVehicle.make,
    model: selectedVehicle.model,
    mileage: selectedVehicle.mileage,
    photoUrls: selectedVehicle.photoUrls || [],
    vin: selectedVehicle.vin,
    policy: {
      humanInTheLoop: true,
      captchaBypassForbidden: true,
    },
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab.");
    return;
  }
  if (!tab.url || !tab.url.includes("facebook.com")) {
    setStatus("Open a Facebook Marketplace create-listing page first.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "OKAUTO_FILL", payload });
    setStatus("Filled available fields. Review and click Publish yourself.");
  } catch {
    // Inject content script if needed
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "OKAUTO_FILL", payload });
    setStatus("Filled available fields. Review and click Publish yourself.");
  }
}

$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", logout);
$("search").addEventListener("input", () => {
  loadVehicles().catch((e) => setStatus(e.message));
});
$("prepareBtn").addEventListener("click", prepareListing);
$("fillBtn").addEventListener("click", fillForm);

bootstrap();
