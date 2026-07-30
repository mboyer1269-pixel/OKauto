# Marketplace selector adapters

Versioned selector strategies live in `content.js` (`SELECTOR_ADAPTERS`).
When Facebook DOM changes, add a new adapter with a higher-priority `match()`
and updated field selectors. Never auto-click Publish or CAPTCHA widgets.
