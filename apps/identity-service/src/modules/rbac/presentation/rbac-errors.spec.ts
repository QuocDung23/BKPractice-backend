import { RbacFailure } from '@/modules/rbac/domain';
import { describeRbacFailure } from '@/modules/rbac/presentation/rbac-errors';

describe('describeRbacFailure (ERR-001 FR-009)', () => {
  it.each([
    ['forbidden', 'not_admin', 403, 'RBAC_ADMIN_REQUIRED'],
    ['forbidden', 'self_admin', 403, 'RBAC_SELF_ADMIN_CHANGE_FORBIDDEN'],
    ['forbidden', undefined, 403, 'RBAC_FORBIDDEN'],
    ['invalid_role', 'role_unknown', 400, 'RBAC_ROLE_INVALID'],
    ['invalid_role', 'reason_invalid', 400, 'RBAC_REASON_INVALID'],
    ['user_not_found', undefined, 404, 'RBAC_USER_NOT_FOUND'],
    ['last_admin', undefined, 409, 'RBAC_LAST_ADMIN'],
  ] as const)('%s/%s trả %i %s', (code, reason, status, expected) => {
    const result = describeRbacFailure(new RbacFailure(code, reason));
    expect(result.status).toBe(status);
    expect(result.code).toBe(expected);
    expect(result.message.length).toBeGreaterThan(10);
  });
});
