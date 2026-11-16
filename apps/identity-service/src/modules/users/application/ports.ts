import type {
  CreateManagedUser,
  UserAdminProjection,
  UserListFilters,
} from '@/modules/users/domain';

export const USER_MANAGEMENT_REPOSITORY = Symbol('UserManagementRepository');

export interface UserManagementRepository {
  list(
    page: number,
    limit: number,
    includeDeleted: boolean,
    filters: UserListFilters,
  ): Promise<{
    items: UserAdminProjection[];
    hasMore: boolean;
  }>;
  find(userId: string): Promise<UserAdminProjection | null>;
  create(
    actorId: string,
    input: Omit<CreateManagedUser, 'password'> & { passwordHash: string },
  ): Promise<UserAdminProjection>;
  setStatus(
    actorId: string,
    userId: string,
    status: 'ACTIVE' | 'LOCKED',
    reason: string,
  ): Promise<UserAdminProjection>;
  softDelete(actorId: string, userId: string, reason: string): Promise<void>;
  listStudents(
    page: number,
    limit: number,
  ): Promise<{
    items: Array<{ userId: string; studentId: string | null; displayName: string | null }>;
    hasMore: boolean;
  }>;
}
