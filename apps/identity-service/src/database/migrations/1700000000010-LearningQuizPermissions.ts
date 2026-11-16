import type { MigrationInterface, QueryRunner } from 'typeorm';
const codes = [
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

export class LearningQuizPermissions1700000000010 implements MigrationInterface {
  name = 'LearningQuizPermissions1700000000010';
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      'CREATE TABLE lrn009_added_role_permissions(role_id uuid NOT NULL,permission_id uuid NOT NULL,PRIMARY KEY(role_id,permission_id))',
    );
    await r.query(
      'INSERT INTO permissions(code) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING',
      [codes],
    );
    await r.query(
      `WITH added AS (INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('LECTURER','ADMIN') AND p.code=ANY($1::text[]) ON CONFLICT DO NOTHING RETURNING role_id,permission_id) INSERT INTO lrn009_added_role_permissions SELECT * FROM added`,
      [codes],
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(
      'DELETE FROM role_permissions rp USING lrn009_added_role_permissions a WHERE rp.role_id=a.role_id AND rp.permission_id=a.permission_id',
    );
    await r.query('DROP TABLE lrn009_added_role_permissions');
    // Keep catalog rows and pre-existing assignments; rollback must not revoke unrelated grants.
  }
}
