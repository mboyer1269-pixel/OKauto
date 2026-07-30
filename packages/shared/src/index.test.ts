import { describe, expect, it } from 'vitest';
import { buildVehicleTitle, hasMinRole, templateDescription } from './index.js';

describe('buildVehicleTitle', () => {
  it('joins year make model trim', () => {
    expect(buildVehicleTitle({ year: 2021, make: 'Toyota', model: 'Camry', trim: 'SE' })).toBe(
      '2021 Toyota Camry SE',
    );
  });

  it('falls back when empty', () => {
    expect(buildVehicleTitle({})).toBe('Vehicle');
  });
});

describe('templateDescription', () => {
  it('includes mileage and price', () => {
    const text = templateDescription({
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      mileage: 42000,
      price: 18900,
    });
    expect(text).toContain('42,000');
    expect(text).toContain('$18,900');
  });
});

describe('hasMinRole', () => {
  it('compares ranks', () => {
    expect(hasMinRole('admin', 'manager')).toBe(true);
    expect(hasMinRole('salesperson', 'manager')).toBe(false);
  });
});
