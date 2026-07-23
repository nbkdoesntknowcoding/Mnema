/**
 * Collaborator grant validation (resource sharing — RFC #190, phase 1).
 *
 * Kept in lib/ rather than the route so it is importable (and unit-testable)
 * without pulling in the db/config graph — same split as lib/community/handle.ts.
 *
 * These mirror `doc_acl` exactly: the permission vocabulary is the storage
 * vocabulary, so nothing here re-interprets what a grant means. Precedence
 * (deny-first, best-positive) stays entirely in app_effective_permission().
 */
import { z } from 'zod';

/**
 * Storage-level permissions, unchanged from `doc_acl`.
 *
 * `none` is an explicit DENY that beats every positive grant, which is why it is
 * grantable here and not filtered out — revoking a row and denying are different
 * intents (a deny also overrides an inherited folder/project grant).
 *
 * The RFC's `comment` tier is phase 6; adding it here + to the precedence
 * function is the only change needed, so this list is the single source of truth.
 */
export const GRANTABLE_PERMISSIONS = ['read', 'write', 'admin', 'none'] as const;

export type GrantablePermission = (typeof GRANTABLE_PERMISSIONS)[number];

/** Body for POST …/collaborators — create or re-grant for one user. */
export const grantSchema = z.object({
  user_id: z.string().uuid(),
  permission: z.enum(GRANTABLE_PERMISSIONS),
  // null / omitted = permanent, matching doc_acl.expires_at semantics.
  expires_at: z.string().datetime().nullable().optional(),
});

/** Body for PATCH …/collaborators/:userId — partial update of an existing grant. */
export const patchSchema = z
  .object({
    permission: z.enum(GRANTABLE_PERMISSIONS).optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => v.permission !== undefined || v.expires_at !== undefined, {
    message: 'Provide at least one of permission or expires_at',
  });

/** `expires_at` string → Date, treating null/undefined as "permanent". */
export function toExpiryDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
