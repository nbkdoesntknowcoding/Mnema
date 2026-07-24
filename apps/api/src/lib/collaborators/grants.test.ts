/**
 * Collaborator grant validation (resource sharing — RFC #190, phase 1).
 *
 * These lock the wire contract for sharing a folder/project: the permission
 * vocabulary must stay identical to `doc_acl` (so nothing here can invent a
 * permission the precedence function doesn't understand), and "permanent" must
 * keep meaning NULL rather than an epoch date.
 */
import { describe, expect, it } from 'vitest';
import { GRANTABLE_PERMISSIONS, grantSchema, patchSchema, toExpiryDate } from './grants.js';

const USER = '11111111-2222-3333-4444-555555555555';

describe('GRANTABLE_PERMISSIONS', () => {
  it('matches the doc_acl vocabulary exactly', () => {
    expect([...GRANTABLE_PERMISSIONS]).toEqual(['read', 'write', 'admin', 'none']);
  });

  it('keeps the explicit deny grantable — it is not the same as revoking', () => {
    expect(grantSchema.safeParse({ user_id: USER, permission: 'none' }).success).toBe(true);
  });
});

describe('grantSchema', () => {
  it('accepts a permanent grant (no expiry)', () => {
    const r = grantSchema.safeParse({ user_id: USER, permission: 'write' });
    expect(r.success).toBe(true);
  });

  it('accepts an expiring grant', () => {
    const r = grantSchema.safeParse({
      user_id: USER, permission: 'read', expires_at: '2030-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a permission outside the doc_acl vocabulary', () => {
    // 'comment' is RFC phase 6 — it must not silently pass before the
    // precedence function understands it.
    expect(grantSchema.safeParse({ user_id: USER, permission: 'comment' }).success).toBe(false);
    expect(grantSchema.safeParse({ user_id: USER, permission: 'owner' }).success).toBe(false);
  });

  it('rejects a non-uuid principal', () => {
    expect(grantSchema.safeParse({ user_id: 'someone@example.com', permission: 'read' }).success).toBe(false);
  });

  it('rejects a non-ISO expiry', () => {
    expect(grantSchema.safeParse({ user_id: USER, permission: 'read', expires_at: 'tomorrow' }).success).toBe(false);
  });
});

describe('patchSchema', () => {
  it('allows changing just the permission', () => {
    expect(patchSchema.safeParse({ permission: 'admin' }).success).toBe(true);
  });

  it('allows clearing the expiry (null = permanent)', () => {
    expect(patchSchema.safeParse({ expires_at: null }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(patchSchema.safeParse({}).success).toBe(false);
  });
});

describe('toExpiryDate', () => {
  it('treats null/undefined as permanent', () => {
    expect(toExpiryDate(null)).toBeNull();
    expect(toExpiryDate(undefined)).toBeNull();
  });

  it('parses an ISO string to the same instant', () => {
    const iso = '2030-06-01T12:30:00.000Z';
    expect(toExpiryDate(iso)?.toISOString()).toBe(iso);
  });
});
