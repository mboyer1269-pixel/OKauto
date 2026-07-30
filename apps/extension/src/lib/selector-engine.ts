import type { SelectorStrategy } from "@okauto/shared";

export interface ResolveOutcome {
  el: Element | null;
  strategyIndex: number | null;
  strategyKind: string | null;
  attempts: number;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function matchesPattern(actual: string, expected: string | RegExp, fuzzy = true): boolean {
  const normalizedActual = normalizeText(actual);
  if (expected instanceof RegExp) return expected.test(actual) || expected.test(normalizedActual);
  const normalizedExpected = normalizeText(expected);
  return fuzzy ? normalizedActual.includes(normalizedExpected) : normalizedActual === normalizedExpected;
}

function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim()) return text;
  }
  return el.textContent ?? "";
}

function controlForLabel(root: ParentNode, label: HTMLLabelElement): Element | null {
  if (label.htmlFor) {
    const doc = (root instanceof Document ? root : root.ownerDocument) ?? document;
    const byId = doc.getElementById(label.htmlFor);
    if (byId) return byId;
  }
  return label.querySelector("input, textarea, select, [contenteditable='true']");
}

function resolveOne(root: ParentNode, strategy: SelectorStrategy): Element | null {
  switch (strategy.kind) {
    case "css":
      return root.querySelector(strategy.selector);
    case "testId":
      return root.querySelector(`[data-testid="${strategy.id}"]`);
    case "placeholder": {
      for (const el of root.querySelectorAll("[placeholder]")) {
        if (matchesPattern(el.getAttribute("placeholder") ?? "", strategy.text)) return el;
      }
      return null;
    }
    case "label": {
      for (const label of root.querySelectorAll("label")) {
        if (matchesPattern(label.textContent ?? "", strategy.text)) {
          const control = controlForLabel(root, label);
          if (control) return control;
        }
      }
      return null;
    }
    case "ariaRole": {
      for (const el of root.querySelectorAll(`[role="${strategy.role}"]`)) {
        if (matchesPattern(accessibleName(el), strategy.name)) return el;
      }
      return null;
    }
  }
}

/**
 * Ordered-strategy resolution with telemetry: tries each strategy in order and
 * reports which one matched (or why nothing did). Strategies are data, so the
 * adapter can be re-tuned without code changes.
 */
export function resolveField(root: ParentNode, strategies: SelectorStrategy[]): ResolveOutcome {
  for (const [index, strategy] of strategies.entries()) {
    try {
      const el = resolveOne(root, strategy);
      if (el) return { el, strategyIndex: index, strategyKind: strategy.kind, attempts: index + 1 };
    } catch {
      // A malformed strategy never aborts resolution — fall through to the next one.
    }
  }
  return { el: null, strategyIndex: null, strategyKind: null, attempts: strategies.length };
}

export async function waitForElement(
  root: ParentNode,
  strategies: SelectorStrategy[],
  timeoutMs: number,
  intervalMs = 250,
): Promise<ResolveOutcome> {
  const started = Date.now();
  let outcome = resolveField(root, strategies);
  while (!outcome.el && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    outcome = resolveField(root, strategies);
  }
  return outcome;
}
