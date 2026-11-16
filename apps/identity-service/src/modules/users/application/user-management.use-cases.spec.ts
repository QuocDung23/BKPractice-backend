import type { PasswordHasher } from '@/modules/auth/application';
import { RoleName, type AuthorizationPrincipal } from '@/modules/rbac/domain';
import { UserManagementUseCases, type UserManagementRepository } from '@/modules/users/application';

const admin: AuthorizationPrincipal = {
  userId: 'admin-id',
  roles: [RoleName.Admin],
  permissions: ['user:read', 'user:create', 'user:status', 'user:delete'],
};
const user = {
  userId: 'user-id',
  studentId: '123',
  email: 'student@example.test',
  displayName: 'Dũng',
  status: 'ACTIVE' as const,
  roles: [RoleName.Student],
  createdAt: new Date('2026-01-01'),
  deletedAt: null,
};
const hasher: PasswordHasher = {
  hash: jest.fn().mockResolvedValue('hashed'),
  verify: jest.fn(),
  verifyDummy: jest.fn(),
};

describe('UserManagementUseCases', () => {
  let repository: jest.Mocked<UserManagementRepository>;
  let cases: UserManagementUseCases;
  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue({ items: [user], hasMore: true }),
      find: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      setStatus: jest.fn().mockResolvedValue(user),
      softDelete: jest.fn().mockResolvedValue(undefined),
      listStudents: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    };
    cases = new UserManagementUseCases(repository, hasher);
  });

  it('requires ADMIN and the matching permission for every mutation', async () => {
    const student = { ...admin, roles: [RoleName.Student] };
    await expect(cases.listUsers(student, 1, 20, false)).rejects.toThrow('forbidden');
    await expect(cases.setStatus(student, user.userId, 'LOCKED', 'Violation')).rejects.toThrow(
      'forbidden',
    );
    await expect(cases.deleteUser(student, user.userId, 'Violation')).rejects.toThrow('forbidden');
    await expect(
      cases.deleteUser({ ...admin, permissions: ['user:read'] }, user.userId, 'Violation'),
    ).rejects.toThrow('forbidden');
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('pages and filters users, retrieves details, and delegates deletion with actor and reason', async () => {
    expect(await cases.listUsers(admin, 2, 5, true, { q: 'Dũng' })).toEqual({
      items: [user],
      page: 2,
      limit: 5,
      hasMore: true,
    });
    expect(repository.list).toHaveBeenCalledWith(2, 5, true, { q: 'Dũng' });
    expect(await cases.getUser(admin, user.userId)).toEqual(user);
    await cases.deleteUser(admin, user.userId, 'Policy violation');
    expect(repository.softDelete).toHaveBeenCalledWith('admin-id', user.userId, 'Policy violation');
  });

  it('hashes the supplied password and never sends plaintext to persistence', async () => {
    await cases.createUser(admin, {
      studentId: '102345',
      displayName: 'An',
      email: 'an@sv1.dut.udn.vn',
      password: 'secret123',
      role: RoleName.Student,
      reason: 'Enrollment',
    });
    expect(hasher.hash).toHaveBeenCalledWith('secret123');
    expect(repository.create).toHaveBeenCalledWith(
      'admin-id',
      expect.objectContaining({ passwordHash: 'hashed' }),
    );
    expect(repository.create.mock.calls[0]?.[1]).not.toHaveProperty('password');
  });

  it('validates pagination and missing users', async () => {
    for (const [page, limit] of [
      [0, 20],
      [1, 0],
      [1, 51],
      [1.5, 20],
      [Number.MAX_SAFE_INTEGER, 50],
    ] as Array<[number, number]>) {
      await expect(cases.listUsers(admin, page, limit, false)).rejects.toThrow('invalid');
    }
    repository.find.mockResolvedValueOnce(null);
    await expect(cases.getUser(admin, 'missing')).rejects.toThrow('not_found');
  });
});
