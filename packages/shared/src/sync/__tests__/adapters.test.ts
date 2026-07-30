import { describe, it, expect } from 'vitest';
import { parseSyncFeed } from '../index';

describe('sync adapters', () => {
  it('generic adapter parses JSON array', () => {
    const body = JSON.stringify([
      { vin: '1HGBH41JXMN109186', year: 2021, make: 'Honda', model: 'Civic', price: 22000 },
    ]);
    const vehicles = parseSyncFeed('generic', body);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].vin).toBe('1HGBH41JXMN109186');
    expect(vehicles[0].make).toBe('Honda');
  });

  it('generic adapter parses nested vehicles key', () => {
    const body = JSON.stringify({
      vehicles: [{ vin: '1HGBH41JXMN109187', make: 'Toyota', model: 'Camry' }],
    });
    const vehicles = parseSyncFeed('generic', body);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].model).toBe('Camry');
  });

  it('dealer-json adapter parses inventory feed', () => {
    const body = JSON.stringify({
      inventory: [
        {
          vin: '1HGBH41JXMN109188',
          make: 'Ford',
          model: 'F-150',
          year: 2022,
          price: 45000,
          images: [{ url: 'https://example.com/photo1.jpg' }],
          status: 'available',
        },
      ],
    });
    const vehicles = parseSyncFeed('dealer-json', body);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].photos).toEqual(['https://example.com/photo1.jpg']);
    expect(vehicles[0].status).toBe('AVAILABLE');
  });

  it('json-ld adapter extracts vehicles from HTML', () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
        {
          "@type": "Car",
          "vehicleIdentificationNumber": "1HGBH41JXMN109189",
          "name": "2023 BMW X5",
          "brand": { "name": "BMW" },
          "model": "X5",
          "vehicleModelDate": 2023,
          "offers": { "price": 65000 },
          "image": "https://example.com/bmw.jpg"
        }
        </script>
      </body></html>
    `;
    const vehicles = parseSyncFeed('json-ld', html, 'text/html');
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].vin).toBe('1HGBH41JXMN109189');
    expect(vehicles[0].price).toBe(65000);
    expect(vehicles[0].photos).toEqual(['https://example.com/bmw.jpg']);
  });

  it('skips items without valid VIN', () => {
    const body = JSON.stringify([{ make: 'Honda', model: 'Civic' }]);
    const vehicles = parseSyncFeed('generic', body);
    expect(vehicles).toHaveLength(0);
  });
});
