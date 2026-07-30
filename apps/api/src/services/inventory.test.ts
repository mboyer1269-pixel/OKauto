import { describe, expect, it } from 'vitest';
import { parseCsvInventory, parseXmlInventory } from './inventory.js';
import { decodeVinLocal, isValidVinFormat } from './vin.js';
import { templateDescription, buildVehicleTitle } from '@okauto/shared';

describe('CSV inventory parse', () => {
  it('parses standard columns', () => {
    const csv = `vin,stock,year,make,model,price,mileage,photos
1HGCM82633A004352,H1,2021,Honda,Accord,24990,28000,https://example.com/a.jpg|https://example.com/b.jpg`;
    const items = parseCsvInventory(csv);
    expect(items).toHaveLength(1);
    expect(items[0].vin).toBe('1HGCM82633A004352');
    expect(items[0].price).toBe(24990);
    expect(items[0].photoUrls).toHaveLength(2);
  });
});

describe('XML inventory parse', () => {
  it('parses vehicle nodes', () => {
    const xml = `<?xml version="1.0"?><vehicles><vehicle><vin>4T1BF1FK5HU648221</vin><year>2019</year><make>Toyota</make><model>Camry</model><price>21000</price></vehicle></vehicles>`;
    const items = parseXmlInventory(xml);
    expect(items[0].make).toBe('Toyota');
    expect(items[0].year).toBe(2019);
  });
});

describe('VIN decode', () => {
  it('validates format', () => {
    expect(isValidVinFormat('1HGCM82633A004352')).toBe(true);
    expect(isValidVinFormat('SHORT')).toBe(false);
  });

  it('decodes year and WMI make', () => {
    const d = decodeVinLocal('1HGCM82633A004352');
    expect(d.validFormat).toBe(true);
    expect(d.make).toBe('Honda');
    expect(d.year).toBe(2003);
  });
});

describe('shared templates', () => {
  it('builds titles', () => {
    expect(buildVehicleTitle({ year: 2020, make: 'Ford', model: 'F-150' })).toBe('2020 Ford F-150');
    expect(templateDescription({ year: 2020, make: 'Ford', model: 'F-150', price: 30000 })).toContain(
      '$30,000',
    );
  });
});
