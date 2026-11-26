import { describe, expect, it } from 'vitest';
import { parseSyncFeed } from '../index';

function card(priceHtml: string, structuredPrice?: unknown) {
  return `<li class="carBoxWrapper" data-carid="123">
    <input name="vehicledata" data-carid="123" data-vin="TESTPRICE12345678" data-stock-number="TEST-1">
    ${structuredPrice === undefined ? '' : `<script type="application/ld+json">${JSON.stringify({ '@type': 'Vehicle', offers: { price: structuredPrice } })}</script>`}
    <div class="carPrice">${priceHtml}</div>
    <span class="monthly-payment">399 $ / mois</span>
  </li>`;
}

describe('D2C advertised inventory prices', () => {
  it.each([
    ['51 995', 51995], ['51&nbsp;995', 51995], ['51\u202f995 $', 51995],
    ['51 995,50 $', 51995.5], ['$51,995.50', 51995.5], ['51995', 51995],
  ])('reads the displayed price %s without legacy Vehicle JSON-LD', (text, expected) => {
    expect(parseSyncFeed('d2c', card(`<span class="dollarsigned p-base format-price">${text}</span>`))[0].price).toBe(expected);
  });

  it('uses the discounted selling price, not the crossed-out old price or payment', () => {
    const html = card(`<span class="p-base">37 565</span><span class="p-final ttStrike">41 065</span>`, 41065);
    expect(parseSyncFeed('d2c', html)[0].price).toBe(37565);
  });

  it('keeps legacy structured offers as a fallback', () => {
    expect(parseSyncFeed('d2c', card('', '51 995,00'))[0].price).toBe(51995);
  });

  it.each(['', '0', '-1', 'NaN', 'Infinity', 'Appelez pour un prix', '399 $ / mois'])('does not invent a price from %s', value => {
    expect(parseSyncFeed('d2c', card(`<span class="p-base">${value}</span>`, value))[0].price).toBeNull();
  });

  it('does not read another card or unrelated p-base amounts', () => {
    const html = card('<span class="p-msg">Appelez pour un prix</span>') +
      card('<span class="p-base">25 000</span>').replace('TESTPRICE12345678', 'TESTPRICE87654321') +
      '<footer><span class="p-base">99 999</span></footer>';
    expect(parseSyncFeed('d2c', html).map(vehicle => vehicle.price)).toEqual([null, 25000]);
  });
});
