/**
 * Resource collaborators — per-folder / per-project sharing (RFC #190, phase 1).
 *
 *   GET    /api/{folders|projects}/:id/collaborators          list explicit grants
 *   POST   /api/{folders|projects}/:id/collaborators          grant / re-grant
 *   PATCH  /api/{folders|projects}/:id/collaborators/:userId  change permission / expiry
 *   DELETE /api/{folders|projects}/:id/collaborators/:userId  revoke
 *
 * Purely additive: it writes the SAME `doc_acl` rows the org access-matrix already
 * writes (routes/org.ts), for resource types `doc_acl` has always modelled. No
 * schema change, no change to how permissions resolve — `app_effective_permission`
 * + `canAccess` (lib/iam.ts) already handle precedence and the folder/project →
 * doc inheritance, so a grant here automatically covers everything inside.
 *
 * Scope of phase 1 (deliberate): the grantee must ALREADY be a member of the
 * workspace. Inviting an outside email (which needs a pending grant that
 * materialises on signup, plus the guest-visibility work) is phase 2/3 of the RFC.
 */
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { docAcl, folders, iamAuditLog, projects, users, workspaceMembers } from '../db/schema.js';
import { withTenant } from '../db/with-tenant.js';
import { canAccess } from '../lib/iam.js';
import { grantSchema, patchSchema, toExpiryDate } from '../lib/collaborators/grants.js';

type ResourceType = 'folder' | 'project';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function audit(
  workspaceId: string,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  payload: unknown,
): Promise<void> {
  await db.insert(iamAuditLog).values({
    workspaceId, actorUserId, action, resourceType, resourceId, payload: payload as object,
  });
}

/** Resource exists in the caller's workspace? Read through RLS so a caller can't
 *  probe for ids in other tenants — an unknown id and a foreign id both 404. */
async function resourceExists(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<boolean> {
  return await withTenant(tenantId, async (tx) => {
    if (resourceType === 'folder') {
      const [row] = await tx.select({ id: folders.id }).from(folders)
        .where(eq(folders.id, resourceId)).limit(1);
      return Boolean(row);
    }
    const [row] = await tx.select({ id: projects.id }).from(projects)
      .where(eq(projects.id, resourceId)).limit(1);
    return Boolean(row);
  });
}

/**
 * Shared guard: valid id → resource visible in this tenant → caller holds `admin`
 * on it. `canAccess` falls through to the workspace role, so workspace owners and
 * admins manage sharing without needing an explicit grant on every resource.
 * Returns the tenant/actor on success, or null after replying with the error.
 */
async function requireResourceAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  resourceType: ResourceType,
  resourceId: string,
): Promise<{ tenantId: string; actorId: string } | null> {
  if (!req.auth) { await reply.code(401).send({ error: 'unauthorized' }); return null; }
  if (!UUID_RE.test(resourceId)) { await reply.code(400).send({ error: 'bad_id' }); return null; }

  const { tenant_id: tenantId, sub: actorId } = req.auth;
  if (!(await resourceExists(tenantId, resourceType, resourceId))) {
    await reply.code(404).send({ error: `${resourceType}_not_found` });
    return null;
  }
  if (!(await canAccess(db, actorId, tenantId, resourceType, resourceId, 'admin'))) {
    await reply.code(403).send({ error: 'requires_admin_on_resource' });
    return null;
  }
  return { tenantId, actorId };
}

/** Explicit user grants on one resource, joined to the person they belong to. */
async function listGrants(tenantId: string, resourceType: ResourceType, resourceId: string) {
  return await db
    .select({
      user_id: docAcl.principalId,
      permission: docAcl.permission,
      expires_at: docAcl.expiresAt,
      created_at: docAcl.createdAt,
      updated_at: docAcl.updatedAt,
      email: users.email,
      display_name: users.displayName,
    })
    .from(docAcl)
    .leftJoin(users, eq(users.id, docAcl.principalId))
    .where(and(
      eq(docAcl.workspaceId, tenantId),
      eq(docAcl.resourceType, resourceType),
      eq(docAcl.resourceId, resourceId),
      eq(docAcl.principalType, 'user'),
    ));
}

function registerFor(app: Parameters<FastifyPluginAsync>[0], resourceType: ResourceType): void {
  const base = resourceType === 'folder' ? '/api/folders' : '/api/projects';

  // ── List collaborators ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(`${base}/:id/collaborators`, async (req, reply) => {
    const ctx = await requireResourceAdmin(req, reply, resourceType, req.params.id);
    if (!ctx) return;
    return reply.send({ collaborators: await listGrants(ctx.tenantId, resourceType, req.params.id) });
  });

  // ── Grant / re-grant ────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(`${base}/:id/collaborators`, async (req, reply) => {
    const ctx = await requireResourceAdmin(req, reply, resourceType, req.params.id);
    if (!ctx) return;

    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const { user_id: userId, permission, expires_at: expiresAt } = parsed.data;

    // Phase 1 shares with existing members only — an outside email needs the
    // pending-grant + guest flow (RFC #190 phases 2/3).
    const [member] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, ctx.tenantId),
        eq(workspaceMembers.userId, userId),
      ))
      .limit(1);
    if (!member) {
      return reply.code(400).send({
        error: 'not_a_workspace_member',
        message: 'Invite this person to the workspace first — sharing with an outside email is not available yet.',
      });
    }

    await db.insert(docAcl).values({
      workspaceId: ctx.tenantId,
      resourceType,
      resourceId: req.params.id,
      principalType: 'user',
      principalId: userId,
      permission,
      createdBy: ctx.actorId,
      expiresAt: toExpiryDate(expiresAt),
    }).onConflictDoUpdate({
      target: [docAcl.resourceType, docAcl.resourceId, docAcl.principalType, docAcl.principalId],
      set: { permission, expiresAt: toExpiryDate(expiresAt), updatedAt: new Date() },
    });

    await audit(ctx.tenantId, ctx.actorId, 'collaborator.granted', resourceType, req.params.id,
      { principalType: 'user', principalId: userId, permission, expiresAt: expiresAt ?? null });

    return reply.send({ collaborators: await listGrants(ctx.tenantId, resourceType, req.params.id) });
  });

  // ── Change permission / expiry ──────────────────────────────────────────────
  app.patch<{ Params: { id: string; userId: string } }>(
    `${base}/:id/collaborators/:userId`,
    async (req, reply) => {
      const ctx = await requireResourceAdmin(req, reply, resourceType, req.params.id);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.userId)) return reply.code(400).send({ error: 'bad_user_id' });

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation', issues: parsed.error.issues });
      }

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.permission !== undefined) set.permission = parsed.data.permission;
      if (parsed.data.expires_at !== undefined) {
        set.expiresAt = toExpiryDate(parsed.data.expires_at);
      }

      const updated = await db.update(docAcl).set(set).where(and(
        eq(docAcl.workspaceId, ctx.tenantId),
        eq(docAcl.resourceType, resourceType),
        eq(docAcl.resourceId, req.params.id),
        eq(docAcl.principalType, 'user'),
        eq(docAcl.principalId, req.params.userId),
      )).returning({ id: docAcl.id });
      if (updated.length === 0) return reply.code(404).send({ error: 'grant_not_found' });

      await audit(ctx.tenantId, ctx.actorId, 'collaborator.updated', resourceType, req.params.id,
        { principalType: 'user', principalId: req.params.userId, ...parsed.data });

      return reply.send({ collaborators: await listGrants(ctx.tenantId, resourceType, req.params.id) });
    },
  );

  // ── Revoke ──────────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    `${base}/:id/collaborators/:userId`,
    async (req, reply) => {
      const ctx = await requireResourceAdmin(req, reply, resourceType, req.params.id);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.userId)) return reply.code(400).send({ error: 'bad_user_id' });

      const removed = await db.delete(docAcl).where(and(
        eq(docAcl.workspaceId, ctx.tenantId),
        eq(docAcl.resourceType, resourceType),
        eq(docAcl.resourceId, req.params.id),
        eq(docAcl.principalType, 'user'),
        eq(docAcl.principalId, req.params.userId),
      )).returning({ id: docAcl.id });
      if (removed.length === 0) return reply.code(404).send({ error: 'grant_not_found' });

      await audit(ctx.tenantId, ctx.actorId, 'collaborator.revoked', resourceType, req.params.id,
        { principalType: 'user', principalId: req.params.userId });

      return reply.send({ removed: true });
    },
  );
}

export const collaboratorsRoutes: FastifyPluginAsync = async (app) => {
  registerFor(app, 'folder');
  registerFor(app, 'project');
};
