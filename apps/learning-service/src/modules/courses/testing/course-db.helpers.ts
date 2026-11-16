import { InitialLearningSchema1700000003000 } from '@learning/database/migrations/1700000003000-InitialLearningSchema';
import { Lrn001ProblemManagement1700000004000 } from '@learning/database/migrations/1700000004000-Lrn001ProblemManagement';
import { Lrn004ClassEnrollment1700000004000 } from '@learning/database/migrations/1700000004000-Lrn004ClassEnrollment';
import { Lrn006Progress1700000005000 } from '@learning/database/migrations/1700000005000-Lrn006Progress';
import { Lrn007RecommendationIndexes1700000006000 } from '@learning/database/migrations/1700000006000-Lrn007RecommendationIndexes';
import { Lrn002TestCaseManagement1700000007000 } from '@learning/database/migrations/1700000007000-Lrn002TestCaseManagement';
import { Lrn003CourseManagement1700000008000 } from '@learning/database/migrations/1700000008000-Lrn003CourseManagement';
import { Lrn003CourseConstraints1700000009000 } from '@learning/database/migrations/1700000009000-Lrn003CourseConstraints';
import { Lrn008SelfStudy1700000010000 } from '@learning/database/migrations/1700000010000-Lrn008SelfStudy';
import { Lrn009CourseProblemHistory1700000011000 } from '@learning/database/migrations/1700000011000-Lrn009CourseProblemHistory';
import { Lrn009QuizQuestionBank1700000011000 } from '@learning/database/migrations/1700000011000-Lrn009QuizQuestionBank';
import { learningEntities } from '@learning/modules/learning.entities';
import type { DataSource, DataSourceOptions } from 'typeorm';

export const ALL_LEARNING_MIGRATIONS = [
  InitialLearningSchema1700000003000,
  Lrn004ClassEnrollment1700000004000,
  Lrn001ProblemManagement1700000004000,
  Lrn006Progress1700000005000,
  Lrn007RecommendationIndexes1700000006000,
  Lrn002TestCaseManagement1700000007000,
  Lrn003CourseManagement1700000008000,
  Lrn003CourseConstraints1700000009000,
  Lrn008SelfStudy1700000010000,
  Lrn009CourseProblemHistory1700000011000,
  Lrn009QuizQuestionBank1700000011000,
];

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Chỉ cho chạy trên DB test (tên kết thúc `_test` hoặc `_lrn001`) để không đụng DB dev. */
export function assertTestDatabase(): void {
  if (!TEST_DATABASE_URL) return;
  const name = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.replace(/^\//, ''));
  if (!/(_test|_lrn001)$/.test(name)) {
    throw new Error(
      'TEST_DATABASE_URL must point to a database whose name ends with _test or _lrn001',
    );
  }
}

export function learningDataSourceOptions(
  extra: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url: TEST_DATABASE_URL,
    entities: learningEntities,
    migrations: ALL_LEARNING_MIGRATIONS,
    synchronize: false,
    ...extra,
  } as DataSourceOptions;
}

export interface TestProblemRow {
  readonly id: string;
  readonly slug?: string;
  readonly title?: string;
  readonly publishStatus?: 'DRAFT' | 'PUBLISHED' | 'ON_HOLD';
  readonly deleted?: boolean;
  readonly createdBy?: string;
}

const DEFAULT_CREATOR = '00000000-0000-4000-8000-0000000000a1';

/** Chèn (hoặc ghi đè) một dòng `problems` tối thiểu để thoả FK `chapter_problems.problem_id`. */
export async function upsertProblem(dataSource: DataSource, row: TestProblemRow): Promise<void> {
  await dataSource.query(
    `INSERT INTO "problems"
       ("id", "title", "slug", "description", "problem_type", "difficulty", "publish_status", "created_by", "deleted_at")
     VALUES ($1, $2, $3, 'desc', 'STANDARD', 'EASY', $4, $5, $6)
     ON CONFLICT ("id") DO UPDATE SET
       "title" = EXCLUDED."title", "slug" = EXCLUDED."slug",
       "publish_status" = EXCLUDED."publish_status",
       "created_by" = EXCLUDED."created_by", "deleted_at" = EXCLUDED."deleted_at"`,
    [
      row.id,
      row.title ?? `Problem ${row.id.slice(-4)}`,
      row.slug ?? `it-problem-${row.id.slice(-12)}`,
      row.publishStatus ?? 'PUBLISHED',
      row.createdBy ?? DEFAULT_CREATOR,
      row.deleted ? new Date() : null,
    ],
  );
}
