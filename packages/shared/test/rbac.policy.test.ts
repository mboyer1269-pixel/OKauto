import { describe, expect, it } from 'vitest';
import { can, canAct, rolesThatCan } from '../src/rbac.js';
import { lintDescription } from '../src/policy.js';

describe('rbac', () => {
  it('grants owners broad permissions', () => {
    expect(can('OWNER', 'org:delete')).toBe(true);
    expect(can('OWNER', 'vehicle:import')).toBe(true);
  });

  it('restricts salespeople to their own resources', () => {
    expect(can('SALESPERSON', 'listing:read:any')).toBe(false);
    expect(can('SALESPERSON', 'listing:read:own')).toBe(true);
    expect(can('SALESPERSON', 'vehicle:delete')).toBe(false);
  });

  it('resolves ownership-scoped actions', () => {
    expect(canAct('SALESPERSON', 'listing:update', true)).toBe(true);
    expect(canAct('SALESPERSON', 'listing:update', false)).toBe(false);
    expect(canAct('MANAGER', 'listing:update', false)).toBe(true);
  });

  it('viewers are read-only', () => {
    expect(can('VIEWER', 'vehicle:read')).toBe(true);
    expect(can('VIEWER', 'vehicle:create')).toBe(false);
    expect(can('VIEWER', 'listing:create')).toBe(false);
  });

  it('lists roles that can perform an action', () => {
    const roles = rolesThatCan('vehicle:import');
    expect(roles).toContain('OWNER');
    expect(roles).toContain('MANAGER');
    expect(roles).not.toContain('SALESPERSON');
  });
});

describe('policy linter', () => {
  it('accepts a normal description', () => {
    const result = lintDescription(
      'Clean 2020 Ford F-150 XLT with 45,000 miles. Backup camera, Apple CarPlay. Message us to schedule a test drive.',
    );
    expect(result.ok).toBe(true);
  });

  it('flags discriminatory phrasing as an error', () => {
    const result = lintDescription('Great home, no kids allowed. Message us today.');
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'discrimination.protected_class')).toBe(true);
  });

  it('flags unqualified financing guarantees', () => {
    const result = lintDescription('Guaranteed approval, no credit check needed at all here.');
    expect(result.ok).toBe(false);
  });

  it('warns on very short content', () => {
    const result = lintDescription('Nice car');
    expect(result.issues.some((i) => i.code === 'quality.too_short')).toBe(true);
  });
});
