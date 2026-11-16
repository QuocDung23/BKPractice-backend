import { RoleName, rbacPermissionCatalog, validatePermissionCode } from '@/modules/rbac/domain';

describe('RBAC permission catalog', () => {
  it('contains the approved codes and unique role-permission mappings', () => {
    const codes = rbacPermissionCatalog.map(({ code }) => code);
    expect(new Set(codes).size).toBe(39);
    expect(new Set(rbacPermissionCatalog.map(({ code, role }) => `${role}:${code}`)).size).toBe(
      rbacPermissionCatalog.length,
    );
    expect(codes.every(validatePermissionCode)).toBe(true);
    const learningAdmin = [
      'problem:create',
      'problem:read-managed',
      'problem:update',
      'problem:publish',
      'problem:hold',
      'problem:republish',
      'problem:delete',
      'problem:restore',
      'course:create',
      'course:read-managed',
      'course:update',
      'course:publish',
      'course:hold',
      'course:republish',
      'course:delete',
      'course:restore',
      'question:create',
      'question:read-managed',
      'question:update',
      'question:share',
      'question:clone',
      'question:delete',
      'question:restore',
      'quiz:create',
      'quiz:read-managed',
      'quiz:update',
      'quiz:publish',
      'quiz:hold',
      'quiz:republish',
      'quiz:share',
      'quiz:clone',
      'quiz:delete',
      'quiz:restore',
    ];
    const approved: Record<RoleName, string[]> = {
      [RoleName.Student]: [],
      [RoleName.Lecturer]: [...learningAdmin],
      [RoleName.Admin]: [
        ...learningAdmin,
        'community:moderate',
        'user:import',
        'user:read',
        'user:delete',
        'user:create',
        'user:status',
      ],
    };

    expect(rbacPermissionCatalog).toHaveLength(72);
    for (const role of Object.values(RoleName)) {
      expect(
        rbacPermissionCatalog
          .filter((permission) => permission.role === role)
          .map(({ code }) => code)
          .sort(),
      ).toEqual(approved[role].sort());
    }
  });
});
