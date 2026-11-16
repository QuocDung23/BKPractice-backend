import type { MigrationInterface, QueryRunner } from 'typeorm';

const contentPermissions = [
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
];

export class SrsV3Administration1700000000010 implements MigrationInterface {
  name = 'SrsV3Administration1700000000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE admin_audit_events (
      id uuid PRIMARY KEY,
      actor_id uuid NOT NULL REFERENCES users(id),
      target_id uuid NOT NULL REFERENCES users(id),
      action varchar(40) NOT NULL,
      reason varchar(500) NOT NULL,
      before_state jsonb,
      after_state jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX admin_audit_target_time_idx ON admin_audit_events (target_id, occurred_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX admin_audit_actor_time_idx ON admin_audit_events (actor_id, occurred_at DESC)',
    );
    await queryRunner.query(
      "INSERT INTO permissions (code) VALUES ('user:create'), ('user:status') ON CONFLICT (code) DO NOTHING",
    );
    await queryRunner.query(`INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.name = 'ADMIN' AND p.code IN ('user:create', 'user:status')
      ON CONFLICT DO NOTHING`);
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.name = 'LECTURER' AND p.code = ANY($1::text[])
      ON CONFLICT DO NOTHING`,
      [contentPermissions],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions rp USING roles r, permissions p
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
      AND r.name = 'LECTURER' AND p.code = ANY($1::text[])`,
      [contentPermissions],
    );
    await queryRunner.query(`DELETE FROM role_permissions rp USING permissions p
      WHERE rp.permission_id = p.id AND p.code IN ('user:create', 'user:status')`);
    await queryRunner.query("DELETE FROM permissions WHERE code IN ('user:create', 'user:status')");
    await queryRunner.query('DROP TABLE admin_audit_events');
  }
}
