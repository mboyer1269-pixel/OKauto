import {
  DEFAULT_COMPLIANCE_FOOTER,
  renderDescription,
  scrubBannedPhrases,
  type DescriptionVehicle,
} from "@okauto/shared";
import type { AppConfig } from "../config.js";

export interface GenerateRequest {
  vehicle: DescriptionVehicle;
  template: string | null;
  dealerName: string | null;
  dealerContact: string | null;
  footer: string | null;
  tone: "professional" | "friendly" | "concise";
  highlights: string[];
}

export interface GenerateResult {
  text: string;
  removedPhrases: string[];
  provider: string;
}

export interface DescriptionProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/** Deterministic compliance-safe template engine. Default provider. */
export class TemplateDescriptionProvider implements DescriptionProvider {
  readonly name = "template";

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    let template = req.template;
    if (req.tone === "concise" && template) {
      template = `{{year}} {{make}} {{model}}{{#trim}} {{trim}}{{/trim}}\n\n{{specLines}}\n\n{{dealerLine}}\n\n{{footer}}`;
    }
    const { text, removedPhrases } = renderDescription({
      vehicle: req.vehicle,
      template,
      dealerName: req.dealerName,
      dealerContact: req.dealerContact,
      footer: req.footer ?? DEFAULT_COMPLIANCE_FOOTER,
      highlights: req.highlights,
    });
    return { text, removedPhrases, provider: this.name };
  }
}

/**
 * Optional OpenAI-compatible provider. Output is ALWAYS passed through the
 * banned-phrase scrubber and the compliance footer is appended deterministically,
 * so compliance guarantees don't depend on model behavior.
 */
export class OpenAiDescriptionProvider implements DescriptionProvider {
  readonly name = "openai";
  private readonly fallback = new TemplateDescriptionProvider();

  constructor(private readonly config: AppConfig) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.config.OPENAI_API_KEY) return this.fallback.generate(req);
    try {
      const facts = JSON.stringify(
        {
          year: req.vehicle.year,
          make: req.vehicle.make,
          model: req.vehicle.model,
          trim: req.vehicle.trim,
          mileage: req.vehicle.mileage,
          bodyStyle: req.vehicle.bodyStyle,
          fuelType: req.vehicle.fuelType,
          transmission: req.vehicle.transmission,
          drivetrain: req.vehicle.drivetrain,
          exteriorColor: req.vehicle.exteriorColor,
          condition: req.vehicle.condition,
          highlights: req.highlights,
        },
        null,
        2,
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${this.config.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.config.OPENAI_MODEL,
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "You write truthful, marketplace-compliant used-vehicle listings. Only use the provided facts. " +
                "No urgency claims, no guarantees, no financing promises, no unverifiable superlatives. " +
                "Tone: " + req.tone + ". Max 120 words.",
            },
            { role: "user", content: `Vehicle facts (JSON):\n${facts}` },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) return this.fallback.generate(req);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) return this.fallback.generate(req);
      const dealerLine = req.dealerName
        ? `\n\nOffered by ${req.dealerName}${req.dealerContact ? ` — ${req.dealerContact}` : ""}.`
        : "";
      const withFooter = `${content}${dealerLine}\n\n${req.footer ?? DEFAULT_COMPLIANCE_FOOTER}`;
      const scrubbed = scrubBannedPhrases(withFooter);
      return { text: scrubbed.text, removedPhrases: scrubbed.removed, provider: this.name };
    } catch {
      return this.fallback.generate(req);
    }
  }
}

export function createDescriptionProvider(config: AppConfig): DescriptionProvider {
  return config.DESCRIPTION_PROVIDER === "openai" && config.OPENAI_API_KEY
    ? new OpenAiDescriptionProvider(config)
    : new TemplateDescriptionProvider();
}
