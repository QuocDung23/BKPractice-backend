import { randomUUID } from 'node:crypto';

import type { EntityManager } from 'typeorm';

export interface AdminAuditEvent {
  actorId: string;
  targetId: string;
  action: 'CREATE' | 'IMPORT' | 'LOCK' | 'UNLOCK' | 'DELETE' | 'ASSIGN_ROLE' | 'REVOKE_ROLE';
  reason: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}

export async function writeAdminAudit(
  manager: EntityManager,
  event: AdminAuditEvent,
): Promise<void> {
  await manager.query(
    `INSERT INTO admin_audit_events
      (id, actor_id, target_id, action, reason, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      randomUUID(),
      event.actorId,
      event.targetId,
      event.action,
      event.reason,
      event.beforeState ? JSON.stringify(event.beforeState) : null,
      event.afterState ? JSON.stringify(event.afterState) : null,
    ],
  );
}
