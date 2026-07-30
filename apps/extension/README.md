# OKauto Marketplace Listing Assistant (Chrome MV3)

A human-in-the-loop Chrome extension that pre-fills the Facebook Marketplace **vehicle**
composer from your OKauto inventory. **It never submits the form, attaches photos
automatically, or bypasses any Facebook control** — a person reviews and posts.

## Build

```bash
pnpm --filter @okauto/extension build   # outputs apps/extension/dist
```

## Load in Chrome

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select `apps/extension/dist`.
3. Click the OKauto icon → **Settings** and pair the device:
   - **API URL** — your OKauto web app origin (e.g. `http://localhost:3000`).
   - **Organization ID** — from the dashboard **Settings** page.
   - **Device token** — created on the dashboard **Settings** page (shown once).

## Use

1. Open the popup and pick a vehicle → **Prepare**. The extension records a `PENDING`
   listing and opens the Marketplace vehicle composer.
2. On the composer, the OKauto panel appears. Click **Pre-fill form fields** to populate
   supported fields (year, make, model, mileage, price, description, …). Fields backed by
   custom dropdowns are scrolled into view for you to select manually.
3. Add photos yourself, review everything, and click Facebook's **Post** button.
4. Click **Mark as posted** in the panel to move the listing to `ACTIVE` in OKauto.

## Design notes

- **Resilient adapters:** field location uses an ordered list of strategies
  (aria-label → label text → placeholder → …) served by the backend, so UI drift can be
  fixed centrally without re-publishing the extension.
- **Policy compliance:** assistive only. No automated submission, CAPTCHA solving,
  anti-bot evasion, or rate-limit circumvention.
- **Security:** the device token is stored in `chrome.storage.local` and sent as a bearer
  token; it is revocable from the dashboard.
