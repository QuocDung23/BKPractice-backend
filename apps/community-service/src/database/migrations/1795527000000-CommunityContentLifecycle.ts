import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityContentLifecycle1795527000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['posts', 'comments']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "edited_at" timestamptz NULL, ADD "deleted_at" timestamptz NULL`,
      );
    }
    await queryRunner.query(
      'CREATE INDEX "IDX_posts_visible_feed" ON posts (created_at DESC, id DESC) WHERE deleted_at IS NULL AND is_hidden = false',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_comments_visible_parent" ON comments (post_id, parent_comment_id, created_at, id) WHERE deleted_at IS NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_comments_visible_parent"');
    await queryRunner.query('DROP INDEX "IDX_posts_visible_feed"');
    for (const table of ['comments', 'posts']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "deleted_at", DROP COLUMN "edited_at"`,
      );
    }
  }
}
