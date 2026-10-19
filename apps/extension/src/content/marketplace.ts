import {
  chromeRuntimeErrorFr,
  generateMarketplaceTitle,
  generateTemplateDescription,
} from "@okauto/shared";
import {
  createPendingPublication,
  isMarketplaceCreateUrl,
  isMarketplaceItemUrl,
  isPendingPublicationFresh,
  PENDING_PUBLICATION_KEY,
  type PendingPublication,
} from "../publication-tracking";
import {
  buildFillTelemetry,
  exceptionIssue,
  formatFatalBanner,
  formatPreparationStatus,
  missingFieldIssue,
  missingOptionIssue,
  toLegacyErrorLabels,
  type FillReport,
} from "../marketplace-fill-report";

export interface VehiclePayload {
  id: string;
  vin?: string;
  stockNumber?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price?: number;
  title?: string;
  description?: string;
  contactName?: string;
  dealershipName?: string;
  phone?: string;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
  condition?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  engine?: string;
  features?: string[];
  sourceUrl?: string | null;
  includeCarfaxSourceUrl?: boolean;
  photos?: string[];
}

/**
 * Versioned selector config for Facebook Marketplace create form.
 * Update selectors here when Facebook changes their DOM — no code deploy needed
 * beyond extension update.
 */
const SELECTORS = {
  v1: {
    vehicleType: [
      '[role="combobox"][aria-label*="Type de véhicule" i]',
      '[role="combobox"][aria-label*="Vehicle type" i]',
    ],
    year: [
      '[role="combobox"][aria-label="Année" i]',
      '[role="combobox"][aria-label="Year" i]',
    ],
    make: [
      '[role="combobox"][aria-label="Marque" i]',
      '[role="combobox"][aria-label="Make" i]',
    ],
    model: [
      'input[aria-label="Modèle" i]',
      'input[aria-label="Model" i]',
      'input[placeholder="Modèle" i]',
      'input[placeholder="Model" i]',
    ],
    mileage: [
      'input[aria-label*="Kilométrage" i]',
      'input[aria-label*="Mileage" i]',
      'input[placeholder*="Kilométrage" i]',
      'input[placeholder*="Mileage" i]',
    ],
    title: [
      'input[aria-label*="itle"]',
      'input[placeholder*="itle"]',
      'input[aria-label*="titre" i]',
      'input[placeholder*="titre" i]',
      '[data-testid="marketplace-composer-title-input"]',
    ],
    price: [
      'input[aria-label*="rice"]',
      'input[placeholder*="rice"]',
      'input[aria-label*="prix" i]',
      'input[placeholder*="prix" i]',
      '[data-testid="marketplace-composer-price-input"]',
    ],
    description: [
      'textarea[aria-label*="escription"]',
      'textarea[placeholder*="escription"]',
      'textarea[aria-label*="description" i]',
      'textarea[placeholder*="description" i]',
      '[data-testid="marketplace-composer-description-input"]',
    ],
    bodyStyle: [
      '[role="combobox"][aria-label*="Style de carrosserie" i]',
      '[role="combobox"][aria-label*="Body style" i]',
    ],
    exteriorColor: [
      '[role="combobox"][aria-label*="Couleur extérieure" i]',
      '[role="combobox"][aria-label*="Exterior color" i]',
    ],
    fuelType: [
      '[role="combobox"][aria-label*="Type de carburant" i]',
      '[role="combobox"][aria-label*="Fuel type" i]',
    ],
    transmission: [
      '[role="combobox"][aria-label*="Boîte de vitesse" i]',
      '[role="combobox"][aria-label*="Transmission" i]',
    ],
    photo: [
      'input[type="file"][accept*="image"]',
      'input[type="file"][multiple]',
      'input[type="file"]',
    ],
  },
};

function findElement(
  selectors: string[],
  labels: string[] = [],
): HTMLElement | null {
  const normalizedLabels = labels.map(normalizeOptionText);
  if (normalizedLabels.length > 0) {
    for (const label of Array.from(
      document.querySelectorAll<HTMLElement>("label"),
    )) {
      const labelText = normalizeOptionText(label.textContent ?? "");
      if (
        !normalizedLabels.some((candidate) => labelText.startsWith(candidate))
      )
        continue;

      if (label.matches('input, textarea, [role="combobox"]')) return label;
      const control = label.querySelector<HTMLElement>(
        'input, textarea, [role="combobox"]',
      );
      if (control) return control;
    }
  }

  for (const selector of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      // Invalid selector, skip
    }
  }
  return null;
}

async function waitForElement(
  selectors: string[],
  labels: string[] = [],
  timeoutMs = 3500,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = findElement(selectors, labels);
    if (element) return element;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function setInputValue(el: HTMLElement, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    el.blur();
  }
}

function sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chromeRuntimeErrorFr(chrome.runtime.lastError.message)));
        return;
      }
      resolve(response as T);
    });
  });
}

interface PhotoResponse {
  success: boolean;
  error?: string;
  base64?: string;
  contentType?: string;
  filename?: string;
}

function photoResponseToFile(response: PhotoResponse, fallbackName: string) {
  if (!response.success || !response.base64) return null;

  const binary = atob(response.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], response.filename ?? fallbackName, {
    type: response.contentType ?? "image/jpeg",
  });
}

async function attachVehiclePhotos(
  vehicle: VehiclePayload,
  selectors: string[],
) {
  const input = await waitForElement(selectors);
  if (!(input instanceof HTMLInputElement))
    return { attached: 0, requested: 0, inputFound: false };

  const requested = Math.min(vehicle.photos?.length ?? 0, 20);
  const responses: PhotoResponse[] = Array.from({ length: requested });
  let nextPhoto = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, requested) }, async () => {
      while (nextPhoto < requested) {
        const index = nextPhoto;
        nextPhoto += 1;
        responses[index] = await sendRuntimeMessage<PhotoResponse>({
          type: "GET_VEHICLE_PHOTO",
          vehicleId: vehicle.id,
          index,
        }).catch(() => ({ success: false }));
      }
    }),
  );
  const files = responses
    .map((response, index) =>
      photoResponseToFile(
        response,
        `${vehicle.stockNumber ?? vehicle.id}-photo-${index + 1}.jpg`,
      ),
    )
    .filter((file): file is File => file != null);
  if (files.length === 0) return { attached: 0, requested, inputFound: true };

  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { attached: files.length, requested, inputFound: true };
}

function normalizeOptionText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-CA");
}

async function selectComboboxOption(
  selectors: string[],
  fieldLabels: string[],
  optionLabels: string[],
): Promise<"ok" | "missing_field" | "missing_option"> {
  const combobox = await waitForElement(selectors, fieldLabels);
  if (!combobox) return "missing_field";

  combobox.click();
  let options: HTMLElement[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    options = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    if (options.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const normalizedLabels = optionLabels.map(normalizeOptionText);
  const option = options.find((candidate) =>
    normalizedLabels.includes(normalizeOptionText(candidate.textContent ?? "")),
  );
  if (!option) {
    // Facebook keeps its React portal open when a click lands outside the menu.
    // Escape closes only the combobox we just opened and prevents later fields
    // from reading options from a stale menu.
    combobox.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    combobox.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    combobox.blur();
    return "missing_option";
  }

  option.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  return "ok";
}

function bodyStyleLabels(value?: string) {
  const normalized = normalizeOptionText(value ?? "");
  if (/suv|utilitaire/.test(normalized)) return ["SUV"];
  if (/truck|camion|pickup/.test(normalized)) return ["Camion"];
  if (/sedan|berline/.test(normalized)) return ["Berline"];
  if (/hatch|hayon/.test(normalized)) return ["Hayon"];
  if (/coupe|coupé/.test(normalized)) return ["Coupé"];
  if (/convertible|cabriolet/.test(normalized)) return ["Cabriolet"];
  if (/wagon|estate/.test(normalized)) return ["Estate"];
  if (/van|monospace/.test(normalized)) return ["Monospace"];
  return [];
}

function exteriorColorLabels(value?: string) {
  const normalized = normalizeOptionText(value ?? "");
  const colorMap: Array<[RegExp, string[]]> = [
    [/blue|bleu/, ["Bleu", "Blue"]],
    [/black|noir/, ["Noir", "Black"]],
    [/white|blanc/, ["Blanc", "White"]],
    [/grey|gray|gris/, ["Gris", "Gray", "Grey"]],
    [/silver|argent/, ["Argent", "Silver"]],
    [/red|rouge/, ["Rouge", "Red"]],
    [/green|vert/, ["Vert", "Green"]],
    [/orange/, ["Orange"]],
    [/yellow|jaune/, ["Jaune", "Yellow"]],
    [/brown|marron/, ["Marron", "Brown"]],
    [/beige/, ["Beige"]],
    [/purple|violet/, ["Violet", "Purple"]],
  ];
  return colorMap.find(([pattern]) => pattern.test(normalized))?.[1] ?? [];
}

function fuelLabels(value?: string) {
  const normalized = normalizeOptionText(value ?? "");
  if (/plug|phev|rechargeable/.test(normalized))
    return ["Hybride rechargeable", "Plug-in hybrid"];
  if (/hybrid|hybride/.test(normalized)) return ["Hybride", "Hybrid"];
  if (/electric|électrique/.test(normalized)) return ["Électrique", "Electric"];
  if (/diesel/.test(normalized)) return ["Diesel"];
  if (/gas|essence/.test(normalized)) return ["Essence", "Gasoline"];
  return [];
}

function transmissionLabels(value?: string) {
  const normalized = normalizeOptionText(value ?? "");
  if (/manual|manuelle|manuel/.test(normalized))
    return ["Transmission manuelle", "Manuelle", "Manual"];
  if (/auto|dsg|cvt/.test(normalized))
    return ["Transmission automatique", "Automatique", "Automatic"];
  return [];
}

function recordCombobox(
  report: FillReport,
  field: string,
  filledLabel: string,
  result: "ok" | "missing_field" | "missing_option",
  optionLabel: string,
) {
  if (result === "ok") {
    report.filled.push(filledLabel);
    return;
  }
  report.issues.push(
    result === "missing_field"
      ? missingFieldIssue(field)
      : missingOptionIssue(field, optionLabel),
  );
}

async function fillForm(vehicle: VehiclePayload): Promise<FillReport> {
  const report: FillReport = { filled: [], issues: [] };
  const selectors = SELECTORS.v1;
  let currentField = "vehicleType";
  let currentStep = "select_vehicleType";

  const title =
    vehicle.title?.trim() ||
    generateMarketplaceTitle({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
    });

  try {
    currentField = "vehicleType";
    currentStep = "select_vehicleType";
    recordCombobox(
      report,
      "vehicleType",
      "type de véhicule",
      await selectComboboxOption(
        selectors.vehicleType,
        ["Type de véhicule", "Vehicle type"],
        ["Voiture/Camion", "Car/Truck"],
      ),
      "Voiture/Camion",
    );

    currentField = "year";
    currentStep = "select_year";
    recordCombobox(
      report,
      "year",
      "année",
      await selectComboboxOption(
        selectors.year,
        ["Année", "Year"],
        [String(vehicle.year)],
      ),
      String(vehicle.year),
    );

    currentField = "make";
    currentStep = "select_make";
    recordCombobox(
      report,
      "make",
      "marque",
      await selectComboboxOption(
        selectors.make,
        ["Marque", "Make"],
        [vehicle.make],
      ),
      vehicle.make,
    );

    currentField = "model";
    currentStep = "fill_model";
    const modelEl = await waitForElement(selectors.model, ["Modèle", "Model"]);
    if (modelEl) {
      setInputValue(
        modelEl,
        [vehicle.model, vehicle.trim].filter(Boolean).join(" "),
      );
      report.filled.push("modèle");
    } else {
      report.issues.push(missingFieldIssue("model", "fill_model"));
    }

    if (vehicle.mileage != null) {
      currentField = "mileage";
      currentStep = "fill_mileage";
      const mileageEl = await waitForElement(selectors.mileage, [
        "Kilométrage",
        "Mileage",
      ]);
      if (mileageEl) {
        setInputValue(mileageEl, String(Math.round(vehicle.mileage)));
        report.filled.push("kilométrage");
      } else {
        report.issues.push(missingFieldIssue("mileage", "fill_mileage"));
      }
    }

    currentField = "title";
    currentStep = "fill_title";
    const titleEl = await waitForElement(
      selectors.title,
      ["Titre", "Title"],
      500,
    );
    if (titleEl) {
      setInputValue(titleEl, title);
      report.filled.push("titre");
    }

    if (vehicle.price) {
      currentField = "price";
      currentStep = "fill_price";
      const priceEl = await waitForElement(selectors.price, ["Prix", "Price"]);
      if (priceEl) {
        setInputValue(priceEl, String(Math.round(vehicle.price)));
        report.filled.push("prix");
      } else {
        report.issues.push(missingFieldIssue("price", "fill_price"));
      }
    }

    // Prefer the package reviewed in Suivia Auto, which includes the dealership's
    // contact details. Keep a local fallback for extension-only usage.
    const description =
      vehicle.description?.trim() ||
      generateTemplateDescription({
        ...vehicle,
        dealershipName: vehicle.dealershipName || "Votre concession",
        contactName: vehicle.contactName || "Votre conseiller",
        phone: vehicle.phone,
      });
    if (description) {
      currentField = "description";
      currentStep = "fill_description";
      const descEl = await waitForElement(selectors.description, [
        "Description",
      ]);
      if (descEl) {
        setInputValue(descEl, description);
        report.filled.push("description");
      } else {
        report.issues.push(missingFieldIssue("description", "fill_description"));
      }
    }

    const bodyLabels = bodyStyleLabels(vehicle.bodyStyle);
    if (bodyLabels.length > 0) {
      currentField = "bodyStyle";
      currentStep = "select_bodyStyle";
      const result = await selectComboboxOption(
        selectors.bodyStyle,
        ["Style de carrosserie", "Body style"],
        bodyLabels,
      );
      if (result === "ok") report.filled.push("style de carrosserie");
    }

    const mappedExteriorColorLabels = exteriorColorLabels(vehicle.exteriorColor);
    if (mappedExteriorColorLabels.length > 0) {
      currentField = "exteriorColor";
      currentStep = "select_exteriorColor";
      const result = await selectComboboxOption(
        selectors.exteriorColor,
        ["Couleur extérieure", "Exterior color"],
        mappedExteriorColorLabels,
      );
      if (result === "ok") report.filled.push("couleur extérieure");
    }

    const mappedFuelLabels = fuelLabels(vehicle.fuelType);
    if (mappedFuelLabels.length > 0) {
      currentField = "fuelType";
      currentStep = "select_fuelType";
      const result = await selectComboboxOption(
        selectors.fuelType,
        ["Type de carburant", "Fuel type"],
        mappedFuelLabels,
      );
      if (result === "ok") report.filled.push("carburant");
    }

    const mappedTransmissionLabels = transmissionLabels(vehicle.transmission);
    if (mappedTransmissionLabels.length > 0) {
      currentField = "transmission";
      currentStep = "select_transmission";
      const result = await selectComboboxOption(
        selectors.transmission,
        ["Boîte de vitesse", "Transmission"],
        mappedTransmissionLabels,
      );
      if (result === "ok") report.filled.push("transmission");
    }

    currentField = "photos";
    currentStep = "attach_photos";
    if (vehicle.photos?.length) {
      try {
        const photoResult = await attachVehiclePhotos(vehicle, selectors.photo);
        if (!photoResult.inputFound) {
          report.issues.push(missingFieldIssue("photos", "find_photo_input"));
        } else if (photoResult.attached > 0) {
          report.filled.push(
            `${photoResult.attached} photo${photoResult.attached > 1 ? "s" : ""}`,
          );
          if (photoResult.attached < photoResult.requested) {
            report.issues.push({
              field: "photos",
              step: "attach_photos",
              reason: "partial",
              message: `${photoResult.requested - photoResult.attached} photo(s) à ajouter manuellement (étape attach_photos).`,
            });
          }
        } else {
          report.issues.push({
            field: "photos",
            step: "attach_photos",
            reason: "partial",
            message:
              "Champ Photos trouvé, mais aucune photo n’a pu être jointe (étape attach_photos).",
          });
        }
      } catch (error) {
        report.issues.push(
          exceptionIssue(
            "photos",
            "attach_photos",
            error instanceof Error ? error.message : "erreur inconnue",
          ),
        );
      }
    } else {
      report.issues.push({
        field: "photos",
        step: "attach_photos",
        reason: "partial",
        message: "Aucune photo sur la fiche véhicule (étape attach_photos).",
      });
    }
  } catch (error) {
    report.issues.push(
      exceptionIssue(
        currentField,
        currentStep,
        error instanceof Error ? error.message : "erreur inconnue",
      ),
    );
  }

  return report;
}

interface BannerOptions {
  actionLabel?: string;
  onAction?: () => void;
  tone?: "blue" | "green" | "red";
}

function mountAssistBanner(
  vehicle: VehiclePayload,
  statusText: string,
  options: BannerOptions = {},
) {
  const existing = document.getElementById("okauto-assist-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "okauto-assist-banner";
  const background =
    options.tone === "green"
      ? "#047857"
      : options.tone === "red"
        ? "#b91c1c"
        : "#1e40af";
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    background: ${background}; color: white; padding: 12px 20px;
    font-family: system-ui, sans-serif; font-size: 14px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;

  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Assistant Suivia Auto";
  copy.append(
    title,
    document.createTextNode(
      ` — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    ),
  );

  const status = document.createElement("div");
  status.id = "okauto-banner-status";
  status.style.cssText = "font-size:12px;opacity:0.95;margin-top:2px";
  status.textContent = statusText;
  copy.append(status);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px";

  let actionButton: HTMLButtonElement | null = null;
  if (options.actionLabel && options.onAction) {
    actionButton = document.createElement("button");
    actionButton.id = "okauto-banner-action";
    actionButton.textContent = options.actionLabel;
    actionButton.style.cssText =
      "background:#22c55e;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600";
    actionButton.addEventListener("click", options.onAction);
    actions.append(actionButton);
  }

  const dismissButton = document.createElement("button");
  dismissButton.id = "okauto-dismiss-banner";
  dismissButton.textContent = "Fermer";
  dismissButton.style.cssText =
    "background:transparent;color:white;border:1px solid white;padding:6px 12px;border-radius:6px;cursor:pointer";
  actions.append(dismissButton);

  banner.append(copy, actions);

  document.body.prepend(banner);
  document.body.style.marginTop = "60px";

  dismissButton.addEventListener("click", () => {
    banner.remove();
    document.body.style.marginTop = "";
  });

  return { banner, status, actionButton };
}

function showPreparationBanner(vehicle: VehiclePayload, report: FillReport) {
  const tone = report.issues.length > 0 ? "red" : "blue";
  mountAssistBanner(
    vehicle,
    `${formatPreparationStatus(report)} Vérifiez, puis publiez dans Facebook; Suivia Auto enregistrera automatiquement l’annonce finale.`,
    { tone },
  );
}

function reportFillTelemetry(vehicleId: string, report: FillReport) {
  const payload = buildFillTelemetry(vehicleId, report, window.location.href);
  void sendRuntimeMessage({
    type: "REPORT_EXTENSION_EVENT",
    ...payload,
  }).catch(() => {
    // Telemetry must never block publishing.
  });
}

let confirmationUrl: string | null = null;

function confirmPublishedListing(vehicle: VehiclePayload) {
  const externalUrl = window.location.href;
  if (!isMarketplaceItemUrl(externalUrl) || confirmationUrl === externalUrl)
    return;
  confirmationUrl = externalUrl;

  const retry = () => {
    confirmationUrl = null;
    confirmPublishedListing(vehicle);
  };
  const { banner, status, actionButton } = mountAssistBanner(
    vehicle,
    "Publication Facebook détectée. Enregistrement dans Suivia Auto…",
    { actionLabel: "Réessayer", onAction: retry },
  );
  if (actionButton) actionButton.style.display = "none";

  chrome.runtime.sendMessage(
    {
      type: "LISTING_CONFIRMED",
      vehicleId: vehicle.id,
      externalUrl,
    },
    (response) => {
      if (!response?.success) {
        confirmationUrl = null;
        banner.style.background = "#b91c1c";
        status.textContent =
          response?.error ?? "La publication n’a pas pu être enregistrée.";
        if (actionButton) actionButton.style.display = "";
        return;
      }

      banner.style.background = "#047857";
      status.textContent = response.alreadyExists
        ? "Cette publication était déjà enregistrée dans Suivia Auto."
        : "Publication enregistrée dans Suivia Auto. Le véhicule apparaît maintenant dans « Publiées ».";
    },
  );
}

function watchForPublishedListing(vehicle: VehiclePayload, startedAt: number) {
  const timer = window.setInterval(() => {
    const pending = {
      vehicle,
      startedAt,
    } satisfies PendingPublication<VehiclePayload>;
    if (!isPendingPublicationFresh(pending)) {
      window.clearInterval(timer);
      chrome.storage.local.remove([
        PENDING_PUBLICATION_KEY,
        "pendingVehicle",
        "pendingStartedAt",
      ]);
      return;
    }

    if (isMarketplaceItemUrl(window.location.href)) {
      window.clearInterval(timer);
      confirmPublishedListing(vehicle);
    }
  }, 750);
}

async function prepareMarketplaceForm(
  vehicle: VehiclePayload,
  startedAt: number,
) {
  mountAssistBanner(
    vehicle,
    `Préparation de l’annonce et des ${Math.min(vehicle.photos?.length ?? 0, 20)} photo(s)…`,
  );
  const fillResult = await fillForm(vehicle);
  showPreparationBanner(vehicle, fillResult);
  reportFillTelemetry(vehicle.id, fillResult);
  watchForPublishedListing(vehicle, startedAt);
  return fillResult;
}

function beginPendingFlow(pending: PendingPublication<VehiclePayload>) {
  if (!isPendingPublicationFresh(pending)) {
    chrome.storage.local.remove([
      PENDING_PUBLICATION_KEY,
      "pendingVehicle",
      "pendingStartedAt",
    ]);
    return;
  }

  if (isMarketplaceItemUrl(window.location.href)) {
    confirmPublishedListing(pending.vehicle);
    return;
  }

  if (isMarketplaceCreateUrl(window.location.href)) {
    window.setTimeout(() => {
      prepareMarketplaceForm(pending.vehicle, pending.startedAt).catch(
        (error) => {
          const fallback =
            error instanceof Error
              ? error.message
              : "Le formulaire n’a pas pu être préparé. Rechargez la page ou recommencez depuis Suivia Auto.";
          const report: FillReport = {
            filled: [],
            issues: [
              exceptionIssue(
                "vehicleType",
                "prepare_form",
                fallback,
              ),
            ],
          };
          mountAssistBanner(
            pending.vehicle,
            formatFatalBanner(report, fallback),
            { tone: "red" },
          );
          reportFillTelemetry(pending.vehicle.id, report);
        },
      );
    }, 1200);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FILL_MARKETPLACE_FORM") {
    const vehicle = message.vehicle as VehiclePayload;
    const pending = createPendingPublication(vehicle);
    chrome.storage.local.set({ [PENDING_PUBLICATION_KEY]: pending });
    prepareMarketplaceForm(vehicle, pending.startedAt)
      .then((result) =>
        sendResponse({
          success: true,
          filled: result.filled,
          errors: toLegacyErrorLabels(result),
          issues: result.issues,
        }),
      )
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Remplissage impossible";
        const report: FillReport = {
          filled: [],
          issues: [exceptionIssue("vehicleType", "prepare_form", message)],
        };
        mountAssistBanner(vehicle, formatFatalBanner(report, message), {
          tone: "red",
        });
        reportFillTelemetry(vehicle.id, report);
        sendResponse({
          success: false,
          filled: [],
          errors: toLegacyErrorLabels(report),
          issues: report.issues,
        });
      });
    return true;
  }
  return false;
});

// Keep the vehicle pending across Facebook navigation. When Facebook reaches
// the final /marketplace/item/... URL, the listing is recorded automatically.
chrome.storage.local.get(
  [PENDING_PUBLICATION_KEY, "pendingVehicle", "pendingStartedAt"],
  (result) => {
    let pending = result[PENDING_PUBLICATION_KEY] as
      PendingPublication<VehiclePayload> | undefined;
    if (!pending && result.pendingVehicle) {
      pending = createPendingPublication(
        result.pendingVehicle as VehiclePayload,
        Number(result.pendingStartedAt) || Date.now(),
      );
      chrome.storage.local.set({ [PENDING_PUBLICATION_KEY]: pending });
      chrome.storage.local.remove(["pendingVehicle", "pendingStartedAt"]);
    }

    if (pending) beginPendingFlow(pending);
  },
);
