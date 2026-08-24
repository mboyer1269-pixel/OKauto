import { describe, it, expect } from 'vitest';
import { extractD2cDetailPhotos, parseSyncFeed } from '../index';

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

  it('d2c adapter extracts a complete dealer inventory card', () => {
    const html = `
      <ul>
        <li class="carBoxWrapper" data-carid="123">
          <script type="application/ld+json">
          {
            "@type": "Vehicle",
            "vehicleIdentificationNumber": "1GCUKREC0JF123456",
            "sku": "B24001",
            "brand": { "name": "Chevrolet" },
            "image": "https://cdn.example.com/silverado.jpg",
            "offers": {
              "price": "48995",
              "availability": "https://schema.org/InStock",
              "url": "https://www.buckinghamgm.com/occasion/Chevrolet-Silverado-1500-2018.html"
            }
          }
          </script>
          <input name="vehicledata" data-vin="1GCUKREC0JF123456"
            data-stock-number="B24001" data-year="2018" data-make="Chevrolet"
            data-model="Silverado 1500" data-condition="USED">
          <span class="divTrim">LT</span>
          <span class="s-km">87 321 km</span>
          <span class="s-desc">Cabine double</span>
          <div class="box-lc"><span>Moteur:</span><span>5.3 L</span></div>
          <div class="box-lc"><span>Cylindres:</span><span>8</span></div>
          <div class="box-lc"><span>Transmission:</span><span>Automatique</span></div>
          <div class="box-lc"><span>Motricité:</span><span>4 roues motrices</span></div>
          <div class="box-lc"><span>Carburant:</span><span>Essence</span></div>
          <div class="box-lc"><span>Catégorie:</span><span>Camion</span></div>
          <div class="box-lc"><span>Couleur extérieure:</span><span>Noir</span></div>
          <div class="box-lc"><span>Portes:</span><span>4</span></div>
        </li>
      </ul>
    `;

    const vehicles = parseSyncFeed('d2c', html, 'text/html');

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      vin: '1GCUKREC0JF123456',
      stockNumber: 'B24001',
      make: 'Chevrolet',
      model: 'Silverado 1500',
      trim: 'LT',
      mileage: 87321,
      price: 48995,
      engine: '5.3 L',
      cylinders: 8,
      doors: 4,
      condition: 'Used',
      sourceUrl: 'https://www.buckinghamgm.com/occasion/Chevrolet-Silverado-1500-2018.html',
      status: 'AVAILABLE',
    });
    expect(vehicles[0].photos).toEqual(['https://cdn.example.com/silverado.jpg']);
  });

  it('skips items without valid VIN', () => {
    const body = JSON.stringify([{ make: 'Honda', model: 'Civic' }]);
    const vehicles = parseSyncFeed('generic', body);
    expect(vehicles).toHaveLength(0);
  });

  it('extracts, deduplicates and orders full-size D2C gallery photos', () => {
    const sourceUrl = 'https://www.buckinghamgm.com/occasion/Volkswagen-Golf_R-2025-id14132487.html';
    const html = `
      <img src="https://imagescdn.d2cmedia.ca/s86abc/1964/14132487/1/Volkswagen-Golf_R-2025.jpg">
      <a href="https://imagescdn.d2cmedia.ca/cb6abc/1964/14132487/10/Volkswagen-Golf_R-2025.jpg"></a>
      <script>{"image":"https:\\/\\/imagescdn.d2cmedia.ca\\/cb6abc\\/1964\\/14132487\\/2\\/Volkswagen-Golf_R-2025.jpg"}</script>
      <a href="https://imagescdn.d2cmedia.ca/cb6abc/1964/14132487/1/Volkswagen-Golf_R-2025.jpg"></a>
      <a href="https://imagescdn.d2cmedia.ca/cb6abc/1964/99999999/1/Other.jpg"></a>
    `;

    expect(extractD2cDetailPhotos(html, sourceUrl)).toEqual([
      'https://imagescdn.d2cmedia.ca/cb6abc/1964/14132487/1/Volkswagen-Golf_R-2025.jpg',
      'https://imagescdn.d2cmedia.ca/cb6abc/1964/14132487/2/Volkswagen-Golf_R-2025.jpg',
      'https://imagescdn.d2cmedia.ca/cb6abc/1964/14132487/10/Volkswagen-Golf_R-2025.jpg',
    ]);
  });
});
