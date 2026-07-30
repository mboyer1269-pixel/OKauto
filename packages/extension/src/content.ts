import { buildMarketplaceDescription, buildListingTitle, type CapturePayload } from "@okauto/shared";
import { extractCapturePayload } from "./extractors";

interface FillMarketplaceFieldsMessage {
  type: "FILL_MARKETPLACE_FIELDS";
  payload: CapturePayload;
}

interface CaptureVisibleVehicleMessage {
  type: "CAPTURE_VISIBLE_VEHICLE";
}

type ContentMessage = FillMarketplaceFieldsMessage | CaptureVisibleVehicleMessage;

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findField(labelHints: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
  return (
    controls.find((control) => {
      const attributes = [
        control.name,
        control.id,
        control.placeholder,
        control.getAttribute("aria-label"),
        control.closest("label")?.textContent
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return labelHints.some((hint) => attributes.includes(hint));
    }) ?? null
  );
}

function fillMarketplaceFields(payload: CapturePayload) {
  const title = buildListingTitle(payload.vehicle);
  const description = buildMarketplaceDescription(payload.vehicle);
  const fields = [
    { hints: ["title"], value: title },
    { hints: ["description", "details"], value: description },
    { hints: ["price"], value: payload.vehicle.price?.toString() },
    { hints: ["mileage", "odometer"], value: payload.vehicle.mileage?.toString() },
    { hints: ["vin"], value: payload.vehicle.vin },
    { hints: ["location"], value: payload.vehicle.location }
  ];

  let filled = 0;
  for (const field of fields) {
    if (!field.value) {
      continue;
    }
    const control = findField(field.hints);
    if (control) {
      setInputValue(control, field.value);
      filled += 1;
    }
  }

  return {
    filled,
    message:
      filled > 0
        ? `Prepared ${filled} visible fields. Review all values before posting.`
        : "No supported visible form fields were detected on this page."
  };
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  try {
    if (message.type === "CAPTURE_VISIBLE_VEHICLE") {
      sendResponse({ ok: true, payload: extractCapturePayload(document, window.location.href) });
      return false;
    }

    if (message.type === "FILL_MARKETPLACE_FIELDS") {
      sendResponse({ ok: true, result: fillMarketplaceFields(message.payload) });
      return false;
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to process page."
    });
    return false;
  }

  return false;
});
