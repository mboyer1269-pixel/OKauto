import type { FillableField, SelectorStrategy } from "@okauto/shared";

/**
 * Default Marketplace vehicle-form strategies. Ordered most-robust first
 * (accessible semantics) to most fragile (raw CSS). Telemetry reports which
 * strategy matched so config can be re-tuned WITHOUT a code deploy — see
 * REQUIREMENTS.md §9 (assumption 6). These selectors are clean-room best
 * guesses against a third-party, unstable DOM and are expected to evolve.
 */
export const DEFAULT_ADAPTER_CONFIG: Record<FillableField, SelectorStrategy[]> = {
  title: [
    { kind: "ariaRole", role: "textbox", name: /title/i },
    { kind: "label", text: /title/i },
    { kind: "placeholder", text: /title/i },
    { kind: "css", selector: "input[aria-label*='itle']" },
  ],
  price: [
    { kind: "label", text: /price/i },
    { kind: "ariaRole", role: "textbox", name: /price/i },
    { kind: "placeholder", text: /price|\$/i },
    { kind: "css", selector: "input[inputmode='decimal'], input[inputmode='numeric']" },
  ],
  description: [
    { kind: "label", text: /description/i },
    { kind: "ariaRole", role: "textbox", name: /description/i },
    { kind: "placeholder", text: /description/i },
    { kind: "css", selector: "textarea" },
  ],
  year: [
    { kind: "label", text: /year/i },
    { kind: "ariaRole", role: "combobox", name: /year/i },
    { kind: "placeholder", text: /year/i },
  ],
  make: [
    { kind: "label", text: /make/i },
    { kind: "ariaRole", role: "combobox", name: /make/i },
    { kind: "placeholder", text: /make/i },
  ],
  model: [
    { kind: "label", text: /model/i },
    { kind: "ariaRole", role: "textbox", name: /model/i },
    { kind: "placeholder", text: /model/i },
  ],
  mileage: [
    { kind: "label", text: /mileage/i },
    { kind: "ariaRole", role: "textbox", name: /mileage/i },
    { kind: "placeholder", text: /mileage/i },
  ],
  bodyStyle: [
    { kind: "label", text: /body style|body type/i },
    { kind: "ariaRole", role: "combobox", name: /body style|body type/i },
  ],
  fuelType: [
    { kind: "label", text: /fuel type|fuel/i },
    { kind: "ariaRole", role: "combobox", name: /fuel/i },
  ],
  transmission: [
    { kind: "label", text: /transmission/i },
    { kind: "ariaRole", role: "combobox", name: /transmission/i },
  ],
  condition: [
    { kind: "label", text: /condition/i },
    { kind: "ariaRole", role: "combobox", name: /condition/i },
  ],
  photos: [{ kind: "css", selector: "input[type='file'][accept*='image']" }],
};
