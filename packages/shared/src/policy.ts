/**
 * Listing-content policy linter. Enforces basic marketplace compliance before a
 * description is saved or posted: no discriminatory phrasing, no contact-info spam,
 * no prohibited claims. This is an independent, conservative ruleset — extend per legal
 * guidance. It never *rewrites* content silently; it reports issues for human review.
 */

export type PolicySeverity = 'error' | 'warning';

export interface PolicyIssue {
  severity: PolicySeverity;
  code: string;
  message: string;
  match?: string;
}

export interface PolicyResult {
  ok: boolean;
  issues: PolicyIssue[];
}

// Discriminatory / protected-class steering language is not allowed in listings.
const DISCRIMINATORY_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'discrimination.protected_class',
    pattern: /\b(no|not for)\s+(kids|children|families|disabled|elderly|immigrants)\b/i,
    message: 'Avoid excluding protected classes or family status.',
  },
  {
    code: 'discrimination.preference',
    pattern: /\b(whites?|blacks?|christian|muslim|jewish)\s+only\b/i,
    message: 'Avoid stating preferences for protected classes.',
  },
];

const CONTACT_SPAM_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'contact.phone_repeat',
    // 3+ phone numbers is spammy.
    pattern: /(\+?\d[\d\s().-]{7,}\d)/g,
    message: 'Excessive phone numbers can trigger spam filters.',
  },
  {
    code: 'contact.external_link',
    pattern: /\b(https?:\/\/|www\.)\S+/gi,
    message: 'External links may be down-ranked or blocked; keep them minimal.',
  },
];

const PROHIBITED_CLAIMS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'claim.guarantee',
    pattern: /\b(guaranteed|100%\s+approval|no\s+credit\s+check)\b/i,
    message: 'Avoid unqualified financing/approval guarantees.',
  },
  {
    code: 'claim.title_status',
    pattern: /\b(clean\s+title\s+guaranteed)\b/i,
    message: 'Do not guarantee title status; state the actual documented status.',
  },
];

export function lintDescription(text: string): PolicyResult {
  const issues: PolicyIssue[] = [];
  const value = text ?? '';

  for (const rule of DISCRIMINATORY_PATTERNS) {
    const m = value.match(rule.pattern);
    if (m) issues.push({ severity: 'error', code: rule.code, message: rule.message, match: m[0] });
  }
  for (const rule of PROHIBITED_CLAIMS) {
    const m = value.match(rule.pattern);
    if (m) issues.push({ severity: 'error', code: rule.code, message: rule.message, match: m[0] });
  }

  const phoneMatches = value.match(CONTACT_SPAM_PATTERNS[0]!.pattern) ?? [];
  if (phoneMatches.length >= 3) {
    issues.push({
      severity: 'warning',
      code: CONTACT_SPAM_PATTERNS[0]!.code,
      message: CONTACT_SPAM_PATTERNS[0]!.message,
    });
  }
  const linkMatches = value.match(CONTACT_SPAM_PATTERNS[1]!.pattern) ?? [];
  if (linkMatches.length >= 2) {
    issues.push({
      severity: 'warning',
      code: CONTACT_SPAM_PATTERNS[1]!.code,
      message: CONTACT_SPAM_PATTERNS[1]!.message,
    });
  }

  if (value.trim().length < 40) {
    issues.push({
      severity: 'warning',
      code: 'quality.too_short',
      message: 'Description is very short; add specs and condition details.',
    });
  }

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}
