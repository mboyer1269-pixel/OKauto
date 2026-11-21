import { listingsFromAnchors } from "@okauto/shared";

function itemUrl(node: Element) {
  const raw = node.getAttribute("href") || node.getAttribute("data-href");
  const explicit = node.getAttribute("data-listing-id");
  if (explicit && /^\d+$/.test(explicit)) return "/marketplace/item/" + explicit;
  if (!raw) return;
  const url = new URL(raw, location.href);
  if (!/(^|\.)facebook\.com$/.test(url.hostname)) return;
  if (/^\/marketplace\/item\/\d+\/?$/.test(url.pathname)) return url.href;
  if (!/^\/marketplace\/(edit|you\/selling)\/?$/.test(url.pathname)) return;
  const id = url.searchParams.get("listing_id") || url.searchParams.get("item_id");
  if (id && /^\d+$/.test(id)) return "/marketplace/item/" + id;
}

function visibleCardText(root: Element, title: string) {
  const labels = Array.from(root.querySelectorAll<HTMLElement>("span,[role=link],strong,h3"))
    .filter(node => node.childElementCount === 0 && node.innerText.trim() === title);
  if (labels.length !== 1) return title;
  let card = labels[0];
  while (card.parentElement && card.parentElement !== root) {
    const text = card.parentElement.innerText;
    if ((text.match(/^(?:19|20)\d{2}\s+.+/gm) ?? []).length !== 1) break;
    card = card.parentElement;
    if (/publié|listed|mis en vente|just now|seconds ago/i.test(text)) break;
  }
  return card.innerText;
}

export function sellerListings() {
  const root = document.querySelector('[role="main"],main') ?? document.body;
  const hints: Array<{ href: string; title: string; text: string }> = [];
  for (const node of Array.from(root.querySelectorAll("[href],[data-href],[data-listing-id]"))) {
    let href: string | undefined;
    try { href = itemUrl(node); } catch { continue; }
    if (!href || node.closest("#okauto-assist-banner,nav,aside")) continue;
    let card = node;
    for (let i = 0; i < 6 && card.parentElement && card.parentElement !== root; i++) {
      const content = card.textContent || "";
      if (/\b(?:19|20)\d{2}\s+\S+/.test(content) && /publié|listed|mis en vente|marquer comme vendu|mark as sold|just now/i.test(content)) break;
      const parent = card.parentElement;
      const titles = (parent.innerText ?? "").match(/^(?:19|20)\d{2}\s+.+/gm);
      if ((titles?.length ?? 0) > 1) break;
      if (parent.querySelector("h1,h2") || parent.querySelectorAll('[role="article"],[role="listitem"]').length > 1) break;
      card = parent;
    }
    const text = (card as HTMLElement).innerText || card.textContent || "";
    const title = text.split("\n").find(line => /^(?:19|20)\d{2}\s/.test(line.trim())) || node.getAttribute("aria-label") || text;
    hints.push({ href, title, text });
  }
  // Some seller cards open a dialog and have no href. Resolve only records
  // whose Marketplace title is also rendered on this seller page.
  const visible = (root as HTMLElement).innerText?.split("\n").map(line => line.trim()) ?? [];
  const titles = new Set(visible.filter(line => /^(?:19|20)\d{2}\s/.test(line)));
  if (titles.size) {
    for (const script of Array.from(document.querySelectorAll('script[type="application/json"]'))) {
      const raw = script.textContent || "";
      if (!raw.includes("marketplace_listing_title")) continue;
      let data: unknown;
      try { data = JSON.parse(raw); } catch { continue; }
      const stack = [data];
      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;
        const record = current as Record<string, unknown>;
        const title = record.marketplace_listing_title ?? record.base_marketplace_listing_title;
        if (typeof title === "string" && titles.has(title) && typeof record.id === "string" && /^\d+$/.test(record.id)) {
          hints.push({ href: "/marketplace/item/" + record.id, title, text: visibleCardText(root, title) });
        }
        for (const child of Object.values(record)) if (child && typeof child === "object") stack.push(child);
      }
    }
  }
  return listingsFromAnchors(hints);
}
