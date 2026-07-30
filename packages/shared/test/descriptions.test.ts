import { describe, expect, it, vi } from 'vitest';
import {
  OpenAiDescriptionProvider,
  TemplateDescriptionProvider,
  buildHighlights,
  generateDescription,
} from '../src/ai/descriptions.js';
import { normalizeVehicle } from '../src/normalize.js';

const vehicle = normalizeVehicle({
  year: 2020,
  make: 'Ford',
  model: 'F-150',
  trim: 'XLT',
  mileage: 45000,
  price: 32995,
  transmission: 'automatic',
  fuelType: 'gas',
  exteriorColor: 'blue',
  features: 'Backup Camera, Apple CarPlay',
  condition: 'excellent',
  stockNumber: 'F150-22',
});

describe('descriptions', () => {
  it('builds highlights from specs and features', () => {
    const highlights = buildHighlights(vehicle);
    expect(highlights).toContain('45,000 mi on the odometer');
    expect(highlights).toContain('Backup Camera');
  });

  it('template provider produces a compliant, deterministic description', async () => {
    const result = await generateDescription(vehicle, {
      dealershipName: 'OKauto Motors',
      tone: 'professional',
    });
    expect(result.provider).toBe('template');
    expect(result.body).toContain('2020 Ford F-150 XLT');
    expect(result.body).toContain('$32,995');
    expect(result.body).toContain('OKauto Motors');
    expect(result.policy.ok).toBe(true);
  });

  it('respects maxLength', async () => {
    const provider = new TemplateDescriptionProvider();
    const { body } = await provider.generate(vehicle, { maxLength: 50 });
    expect(body.length).toBeLessThanOrEqual(50);
  });

  it('uses the OpenAI provider when it succeeds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'AI generated body.' } }] }),
    });
    const provider = new OpenAiDescriptionProvider('sk-test', 'gpt-4o-mini', fakeFetch as never);
    const result = await generateDescription(vehicle, {}, { provider });
    expect(result.provider).toBe('openai');
    expect(result.body).toBe('AI generated body.');
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it('falls back to the template when the provider throws', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const provider = new OpenAiDescriptionProvider('sk-test', 'gpt-4o-mini', fakeFetch as never);
    const result = await generateDescription(vehicle, {}, { provider });
    expect(result.provider).toBe('template');
    expect(result.body).toContain('Ford F-150');
  });
});
