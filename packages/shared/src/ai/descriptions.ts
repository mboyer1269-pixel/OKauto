/**
 * AI-assisted listing description generation with a provider abstraction.
 *
 * - When an external provider (e.g. OpenAI) is configured, it is used.
 * - Otherwise a deterministic, template-based generator produces a solid, compliant
 *   description offline. This keeps the product fully functional in dev/CI/air-gapped
 *   environments and guarantees reproducible tests.
 */
import type { NormalizedVehicle } from '../types.js';
import { formatMileage, formatPrice } from '../normalize.js';
import { lintDescription, type PolicyResult } from '../policy.js';

export type DescriptionTone = 'professional' | 'friendly' | 'concise' | 'enthusiastic';

export interface DescriptionOptions {
  tone?: DescriptionTone;
  dealershipName?: string;
  includePrice?: boolean;
  includeCallToAction?: boolean;
  maxLength?: number;
}

export interface DescriptionResult {
  title: string;
  body: string;
  policy: PolicyResult;
  provider: 'template' | 'openai';
  highlights: string[];
}

export interface DescriptionProvider {
  readonly name: 'template' | 'openai';
  generate(vehicle: NormalizedVehicle, options: DescriptionOptions): Promise<{ body: string }>;
}

const TONE_OPENERS: Record<DescriptionTone, (t: string) => string> = {
  professional: (t) => `Now available: this ${t}.`,
  friendly: (t) => `Say hello to this ${t} — it could be your next ride!`,
  concise: (t) => `${t}.`,
  enthusiastic: (t) => `You do not want to miss this ${t}!`,
};

export function buildHighlights(v: NormalizedVehicle): string[] {
  const highlights: string[] = [];
  if (v.mileage !== null) highlights.push(`${formatMileage(v.mileage)} on the odometer`);
  if (v.transmission) highlights.push(`${toTitle(v.transmission)} transmission`);
  if (v.drivetrain) highlights.push(`${v.drivetrain} drivetrain`);
  if (v.fuelType) highlights.push(`${toTitle(v.fuelType)} engine`);
  if (v.exteriorColor) highlights.push(`${v.exteriorColor} exterior`);
  if (v.interiorColor) highlights.push(`${v.interiorColor} interior`);
  for (const feature of v.features.slice(0, 8)) highlights.push(feature);
  return highlights;
}

function toTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Deterministic, offline template generator — always available. */
export class TemplateDescriptionProvider implements DescriptionProvider {
  readonly name = 'template' as const;

  async generate(
    vehicle: NormalizedVehicle,
    options: DescriptionOptions,
  ): Promise<{ body: string }> {
    const tone = options.tone ?? 'professional';
    const title = vehicle.title || 'vehicle';
    const highlights = buildHighlights(vehicle);

    const lines: string[] = [];
    lines.push(TONE_OPENERS[tone](title));
    if (vehicle.condition) lines.push(`Condition: ${vehicle.condition}.`);

    if (highlights.length > 0) {
      lines.push('');
      lines.push('Highlights:');
      for (const h of highlights) lines.push(`• ${h}`);
    }

    if (options.includePrice !== false && vehicle.priceCents !== null) {
      lines.push('');
      lines.push(`Priced at ${formatPrice(vehicle.priceCents)}.`);
    }

    if (vehicle.stockNumber) lines.push(`Stock #${vehicle.stockNumber}.`);

    if (options.includeCallToAction !== false) {
      lines.push('');
      const dealer = options.dealershipName ? ` at ${options.dealershipName}` : '';
      lines.push(`Message us${dealer} to schedule a test drive or ask questions.`);
    }

    let body = lines.join('\n').trim();
    if (options.maxLength && body.length > options.maxLength) {
      body = `${body.slice(0, options.maxLength - 1).trimEnd()}…`;
    }
    return { body };
  }
}

/**
 * OpenAI-backed provider. Uses fetch so it works in browsers and Node 20+ without SDKs.
 * Falls back to the template provider on any error (handled by generateDescription).
 */
export class OpenAiDescriptionProvider implements DescriptionProvider {
  readonly name = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(
    vehicle: NormalizedVehicle,
    options: DescriptionOptions,
  ): Promise<{ body: string }> {
    const prompt = buildPrompt(vehicle, options);
    const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You write concise, accurate, policy-compliant vehicle marketplace listings. ' +
              'Never invent specs. Never use discriminatory language or unqualified financing guarantees.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const body = json.choices?.[0]?.message?.content?.trim();
    if (!body) throw new Error('OpenAI returned no content');
    return { body };
  }
}

export function buildPrompt(v: NormalizedVehicle, options: DescriptionOptions): string {
  const facts = [
    v.title && `Vehicle: ${v.title}`,
    v.mileage !== null && `Mileage: ${formatMileage(v.mileage)}`,
    v.priceCents !== null && options.includePrice !== false && `Price: ${formatPrice(v.priceCents)}`,
    v.transmission && `Transmission: ${toTitle(v.transmission)}`,
    v.drivetrain && `Drivetrain: ${v.drivetrain}`,
    v.fuelType && `Fuel: ${toTitle(v.fuelType)}`,
    v.exteriorColor && `Exterior: ${v.exteriorColor}`,
    v.interiorColor && `Interior: ${v.interiorColor}`,
    v.condition && `Condition: ${v.condition}`,
    v.features.length > 0 && `Features: ${v.features.join(', ')}`,
    v.stockNumber && `Stock #: ${v.stockNumber}`,
    options.dealershipName && `Dealership: ${options.dealershipName}`,
  ].filter(Boolean);
  return [
    `Write a ${options.tone ?? 'professional'} Facebook Marketplace description using ONLY these facts.`,
    'Do not fabricate details that are not listed.',
    options.includeCallToAction !== false ? 'End with a friendly call to action to message the dealership.' : '',
    '',
    facts.join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
}

export interface GenerateDescriptionDeps {
  provider?: DescriptionProvider;
}

/**
 * Main entry point. Generates a description, lints it for policy compliance, and
 * always falls back to the template provider if the primary provider throws.
 */
export async function generateDescription(
  vehicle: NormalizedVehicle,
  options: DescriptionOptions = {},
  deps: GenerateDescriptionDeps = {},
): Promise<DescriptionResult> {
  const primary = deps.provider ?? new TemplateDescriptionProvider();
  const fallback = new TemplateDescriptionProvider();

  let body: string;
  let provider: 'template' | 'openai' = primary.name;
  try {
    body = (await primary.generate(vehicle, options)).body;
  } catch {
    body = (await fallback.generate(vehicle, options)).body;
    provider = 'template';
  }

  return {
    title: vehicle.title,
    body,
    policy: lintDescription(body),
    provider,
    highlights: buildHighlights(vehicle),
  };
}
