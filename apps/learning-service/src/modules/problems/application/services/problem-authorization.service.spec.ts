import { ForbiddenError } from '@learning/modules/problems/application/errors/forbidden.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';

import {
  ProblemAuthorizationService,
  type ManagedProblemAction,
} from './problem-authorization.service';

const owner = '00000000-0000-4000-8000-000000000040';
const other = '00000000-0000-4000-8000-000000000041';
const permissions: Record<ManagedProblemAction, string> = {
  'read-managed': 'problem:read-managed',
  update: 'problem:update',
  publish: 'problem:publish',
  hold: 'problem:hold',
  republish: 'problem:republish',
  delete: 'problem:delete',
  restore: 'problem:restore',
};
const principal = (role: string, userId: string, permission: string): Principal => ({
  userId,
  roles: [role],
  permissions: [permission],
});

describe('ProblemAuthorizationService', () => {
  const service = new ProblemAuthorizationService();

  it.each(Object.entries(permissions) as [ManagedProblemAction, string][])(
    'allows owner lecturer and any admin to %s, but rejects another lecturer',
    (action, permission) => {
      expect(() =>
        service.requireManaged(principal('LECTURER', owner, permission), action, owner),
      ).not.toThrow();
      expect(() =>
        service.requireManaged(principal('ADMIN', other, permission), action, owner),
      ).not.toThrow();
      expect(() =>
        service.requireManaged(principal('LECTURER', other, permission), action, owner),
      ).toThrow(ForbiddenError);
    },
  );

  it('requires a content role and exact permission for create and managed list', () => {
    for (const permission of ['problem:create', 'problem:read-managed']) {
      const student = principal('STUDENT', owner, permission);
      expect(() =>
        permission === 'problem:create'
          ? service.requireCreate(student)
          : service.requireManagedList(student),
      ).toThrow(ForbiddenError);
    }
    expect(() =>
      service.requireCreate(principal('LECTURER', owner, 'problem:create')),
    ).not.toThrow();
    expect(() =>
      service.requireManagedList(principal('LECTURER', owner, 'problem:read-managed')),
    ).not.toThrow();
    expect(() =>
      service.requireManaged(principal('ADMIN', owner, 'PROBLEM:UPDATE'), 'update', owner),
    ).toThrow(ForbiddenError);
  });
});
