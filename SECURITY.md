# Security

OKauto is designed for dealership workflows with explicit human control over Marketplace posting.

## Controls

- Passwords hashed with Argon2id
- Short-lived JWT access tokens + rotating refresh tokens
- Revocable extension API tokens (hashed at rest)
- Zod validation on all API inputs
- Helmet, CORS allowlist, rate limiting
- Audit logs for privileged actions
- No secrets in the repository (`.env.example` only)

## Platform policy

- Does not bypass CAPTCHA, anti-bot systems, authentication, or rate limits
- Extension only assists field fill; users must review and submit
- Inventory fetch only for configured public URLs / uploaded feeds

## Reporting

Report vulnerabilities to the repository maintainers. Do not file public issues with exploit details.
