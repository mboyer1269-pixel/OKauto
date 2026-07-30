import { describe, it, expect } from 'vitest';
import { hasMinRole } from '@okauto/shared';

describe('RBAC', () => {
  it('owner has manager permissions', () => {
    expect(hasMinRole('OWNER', 'MANAGER')).toBe(true);
  });

  it('salesperson does not have admin permissions', () => {
    expect(hasMinRole('SALESPERSON', 'ADMIN')).toBe(false);
  });

  it('manager has salesperson permissions', () => {
    expect(hasMinRole('MANAGER', 'SALESPERSON')).toBe(true);
  });
});
