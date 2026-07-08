/**
 * Seat sync utility (self-host / open-core edition).
 *
 * Called after any workspace membership change that could affect the
 * billable seat count (member added, removed, role changed).
 *
 * The open-core (self-host) edition ships with NO payment/billing layer:
 * there is no active subscription to reconcile, so this is a no-op. It
 * remains an exported function so core callers (routes/members.ts,
 * routes/invitations.ts, routes/_internal/accept-invite-pending.ts) keep
 * their call sites unchanged. Hosted seat-sync lives outside this repo.
 */

/**
 * Re-count writer seats and update the payment provider's subscription
 * quantity when one is active.
 *
 * Self-host: always a no-op (no subscriptions, no payment provider).
 * Safe to call redundantly.
 */
export async function syncSubscriptionSeats(_workspaceId: string): Promise<void> {
  // No billing layer in the open-core edition — nothing to sync.
  return;
}
