import {
  AssignRoleToUser,
  EvaluateAuthorization,
  GetUserRoles,
  RevokeRoleFromUser,
  type RbacRepository,
  type TransactionRunner,
} from '@/modules/rbac/application';
import { RoleName, type AuthorizationPrincipal, evaluatePermission } from '@/modules/rbac/domain';

const admin: AuthorizationPrincipal = { userId: 'admin', roles: [RoleName.Admin], permissions: [] };
const reason = 'Account administration';
const createRepository = (): jest.Mocked<RbacRepository> => ({
  findUserRoles: jest.fn().mockResolvedValue({ userId: 'target', roles: [RoleName.Student] }),
  lockUser: jest.fn().mockResolvedValue(undefined),
  assignRole: jest.fn().mockResolvedValue(undefined),
  revokeRole: jest.fn().mockResolvedValue(undefined),
  lockAdminRole: jest.fn().mockResolvedValue(undefined),
  countAdmins: jest.fn().mockResolvedValue(2),
  recordRoleAudit: jest.fn().mockResolvedValue(undefined),
});

describe('RBAC administration', () => {
  let repository: jest.Mocked<RbacRepository>;
  let transactions: TransactionRunner;
  beforeEach(() => {
    repository = createRepository();
    transactions = { run: (operation) => operation(repository) };
  });

  it.each([RoleName.Student, RoleName.Lecturer])('rejects role management by %s', (role) => {
    const caller = { userId: 'target', roles: [role], permissions: [] };
    expect(() => new GetUserRoles(repository).execute(caller, 'target')).toThrow('forbidden');
    expect(() =>
      new AssignRoleToUser(transactions).execute(caller, 'target', RoleName.Lecturer, reason),
    ).toThrow('forbidden');
    expect(() =>
      new RevokeRoleFromUser(transactions).execute(caller, 'target', RoleName.Student, reason),
    ).toThrow('forbidden');
  });

  it('allows a different Admin to grant ADMIN and records the changed roles', async () => {
    repository.findUserRoles
      .mockResolvedValueOnce({ userId: 'target', roles: [RoleName.Student] })
      .mockResolvedValueOnce({ userId: 'target', roles: [RoleName.Admin, RoleName.Student] });
    const result = await new AssignRoleToUser(transactions).execute(
      admin,
      'target',
      RoleName.Admin,
      reason,
    );
    expect(result.roles).toContain(RoleName.Admin);
    expect(repository.lockAdminRole).toHaveBeenCalled();
    expect(repository.lockUser).toHaveBeenCalledWith('target');
    expect(repository.recordRoleAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin',
        targetId: 'target',
        action: 'ASSIGN_ROLE',
        reason,
      }),
    );
  });

  it('forbids self ADMIN grant/revoke and protects the last active Admin', async () => {
    expect(() =>
      new AssignRoleToUser(transactions).execute(admin, 'admin', RoleName.Admin, reason),
    ).toThrow('forbidden');
    expect(() =>
      new RevokeRoleFromUser(transactions).execute(admin, 'admin', RoleName.Admin, reason),
    ).toThrow('forbidden');
    repository.findUserRoles.mockResolvedValue({ userId: 'target', roles: [RoleName.Admin] });
    repository.countAdmins.mockResolvedValue(1);
    await expect(
      new RevokeRoleFromUser(transactions).execute(admin, 'target', RoleName.Admin, reason),
    ).rejects.toThrow('last_admin');
    expect(repository.revokeRole).not.toHaveBeenCalled();
  });

  it('leaves idempotent changes out of audit', async () => {
    await new RevokeRoleFromUser(transactions).execute(admin, 'target', RoleName.Lecturer, reason);
    expect(repository.revokeRole).not.toHaveBeenCalled();
    expect(repository.recordRoleAudit).not.toHaveBeenCalled();
  });

  it('rejects missing targets and empty reasons', async () => {
    repository.findUserRoles.mockResolvedValue(null);
    await expect(
      new AssignRoleToUser(transactions).execute(admin, 'missing', RoleName.Lecturer, reason),
    ).rejects.toThrow('user_not_found');
    expect(() =>
      new AssignRoleToUser(transactions).execute(admin, 'target', RoleName.Lecturer, ' '),
    ).toThrow();
  });

  it('uses the verified permission snapshot', () => {
    const newPrincipal = { ...admin, permissions: ['problem:create'] };
    expect(evaluatePermission(admin, 'problem:create').allowed).toBe(false);
    expect(new EvaluateAuthorization().execute(newPrincipal, 'problem:create', true).allowed).toBe(
      true,
    );
  });
});
