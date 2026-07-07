/**
 * Secret-box re-keying (CH-1 / Master Patch #3) — one-shot re-encryption of every
 * secret-box ciphertext from an OLD KDF seed to a NEW one. Covers BOTH at-rest
 * secret stores:
 *   - workspace_members.calendar_refresh_token  (Google Calendar refresh tokens)
 *   - workspace_credentials.encrypted_key        (BYOK LLM API keys)
 *
 *   SECRETBOX_KEY_OLD=<old> SECRETBOX_KEY_NEW=<new> \
 *     pnpm --filter @boppl/api rekey:secretbox -- --dry-run
 *   SECRETBOX_KEY_OLD=<old> SECRETBOX_KEY_NEW=<new> \
 *     pnpm --filter @boppl/api rekey:secretbox
 *
 * Seed env vars: SECRETBOX_KEY_OLD / SECRETBOX_KEY_NEW. For back-compat with the
 * original Phase-0 invocation these fall back to WORKOS_COOKIE_PASSWORD (old) and
 * SECRETBOX_MASTER_KEY (new) when the new vars are unset. Requires BOTH seeds;
 * exits nonzero if either is missing.
 *
 * Idempotent: a row already stored under the new seed (old-key decrypt fails,
 * new-key decrypt succeeds) is detected and skipped with a notice, not errored.
 * A row that decrypts under neither seed is reported as a FAILURE (nonzero exit).
 *
 * --dry-run decrypt-verifies every row under the old seed and writes nothing.
 *
 * NOTE: this script deliberately does NOT import lib/secret-box.ts — that module
 * is now hard-wired to the new seed only. Here we need BOTH KDFs, so the wire
 * format (scrypt 'mnema-calendar-enc' salt, AES-256-GCM, 12-byte IV,
 * base64url `iv.tag.enc`) is reproduced locally and must stay in lock-step with
 * secret-box.ts.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspaceCredentials, workspaceMembers } from '../db/schema.js';

// New env var names, with a back-compat fallback to the original Phase-0 names.
const OLD_SEED = process.env.SECRETBOX_KEY_OLD ?? process.env.WORKOS_COOKIE_PASSWORD;
const NEW_SEED = process.env.SECRETBOX_KEY_NEW ?? process.env.SECRETBOX_MASTER_KEY;
if (!OLD_SEED || !NEW_SEED) {
  console.error(
    'rekey-secret-box: both SECRETBOX_KEY_OLD (old seed) and SECRETBOX_KEY_NEW (new seed) must be set ' +
      '(legacy WORKOS_COOKIE_PASSWORD / SECRETBOX_MASTER_KEY are accepted as fallbacks).',
  );
  process.exit(1);
}

const OLD_ENC = scryptSync(OLD_SEED, 'mnema-calendar-enc', 32);
const NEW_ENC = scryptSync(NEW_SEED, 'mnema-calendar-enc', 32);

function decryptWith(blob: string, key: Buffer): string {
  const [ivB, tagB, encB] = blob.split('.');
  if (!ivB || !tagB || !encB) throw new Error('malformed ciphertext');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
  d.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(encB, 'base64url')), d.final()]).toString('utf8');
}

function encryptWith(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

const DRY = process.argv.includes('--dry-run');

interface Tally {
  migrated: number;
  skipped: number;
  failed: number;
}

/**
 * Rekey one logical set of ciphertext rows. `label(row)` names a row for logs,
 * `read(row)` extracts its current ciphertext, and `write(row, reblob)` persists
 * the re-encrypted value (skipped entirely in --dry-run). Same idempotency +
 * failure semantics for every store.
 */
async function rekeyRows<Row>(
  store: string,
  rows: Row[],
  label: (r: Row) => string,
  read: (r: Row) => string,
  write: (r: Row, reblob: string) => Promise<void>,
): Promise<Tally> {
  console.log(
    `rekey-secret-box[${store}]: ${rows.length} row(s)${DRY ? '  [DRY RUN — no writes]' : ''}`,
  );

  const tally: Tally = { migrated: 0, skipped: 0, failed: 0 };

  for (const r of rows) {
    const lbl = label(r);
    const blob = read(r);

    let plain: string;
    try {
      plain = decryptWith(blob, OLD_ENC);
    } catch {
      // Old-key decrypt failed — is it already migrated to the new seed?
      try {
        decryptWith(blob, NEW_ENC);
        console.log(`  skip   ${lbl}: already under new seed`);
        tally.skipped += 1;
        continue;
      } catch {
        console.error(`  FAIL   ${lbl}: decrypts under neither old nor new seed`);
        tally.failed += 1;
        continue;
      }
    }

    if (DRY) {
      console.log(`  ok     ${lbl}: readable under old seed (would re-encrypt)`);
      tally.migrated += 1;
      continue;
    }

    const reblob = encryptWith(plain, NEW_ENC);
    await write(r, reblob);
    console.log(`  migr   ${lbl}: re-encrypted under new seed`);
    tally.migrated += 1;
  }

  return tally;
}

async function main(): Promise<void> {
  // ── workspace_members.calendar_refresh_token ──────────────────────────────
  const memberRows = await db
    .select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      tok: workspaceMembers.calendarRefreshToken,
    })
    .from(workspaceMembers)
    .where(isNotNull(workspaceMembers.calendarRefreshToken));

  const memberTally = await rekeyRows(
    'calendar_refresh_token',
    memberRows,
    (r) => `member(ws=${r.workspaceId} user=${r.userId})`,
    (r) => r.tok as string,
    async (r, reblob) => {
      await db.transaction(async (tx) => {
        await tx
          .update(workspaceMembers)
          .set({ calendarRefreshToken: reblob })
          .where(
            and(
              eq(workspaceMembers.workspaceId, r.workspaceId),
              eq(workspaceMembers.userId, r.userId),
            ),
          );
      });
    },
  );

  // ── workspace_credentials.encrypted_key (BYOK LLM keys) ───────────────────
  const credRows = await db
    .select({
      workspaceId: workspaceCredentials.workspaceId,
      provider: workspaceCredentials.provider,
      enc: workspaceCredentials.encryptedKey,
    })
    .from(workspaceCredentials);

  const credTally = await rekeyRows(
    'workspace_credentials',
    credRows,
    (r) => `cred(ws=${r.workspaceId} provider=${r.provider})`,
    (r) => r.enc,
    async (r, reblob) => {
      await db.transaction(async (tx) => {
        await tx
          .update(workspaceCredentials)
          .set({ encryptedKey: reblob, updatedAt: new Date() })
          .where(
            and(
              eq(workspaceCredentials.workspaceId, r.workspaceId),
              eq(workspaceCredentials.provider, r.provider),
            ),
          );
      });
    },
  );

  const migrated = memberTally.migrated + credTally.migrated;
  const skipped = memberTally.skipped + credTally.skipped;
  const failed = memberTally.failed + credTally.failed;

  console.log(
    `rekey-secret-box: done. migrated=${migrated} skipped=${skipped} failed=${failed}${DRY ? ' (dry-run)' : ''}`,
  );
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error('rekey-secret-box: fatal', err);
  process.exit(1);
});
