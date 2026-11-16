import { RoleName } from '@/modules/rbac/domain/role-name';

const learningContentPermissionCodes = [
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

const adminPermissionCodes = [
  ...learningContentPermissionCodes,
  'community:moderate',
  'user:import',
  'user:read',
  'user:delete',
  'user:create',
  'user:status',
];

export const rbacPermissionCatalog = [
  ...learningContentPermissionCodes.map((code) => ({ code, role: RoleName.Lecturer })),
  ...adminPermissionCodes.map((code) => ({ code, role: RoleName.Admin })),
];
