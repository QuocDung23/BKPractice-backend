import type {
  SolvedStatusResult,
  CourseProgressResult,
} from '@/modules/progress/application/results';
import type { SolvedProblemPage } from '@/modules/progress/domain/repositories';
import type {
  CourseProgressResponseDto,
  SolvedProblemPageResponseDto,
  SolvedStatusResponseDto,
} from '@/modules/progress/presentation/http/dto';

export function toSolvedProblemPageResponse(
  result: SolvedProblemPage,
): SolvedProblemPageResponseDto {
  return {
    items: result.items.map((p) => ({
      problemId: p.problemId,
      solvedAt: p.solvedAt.toISOString(),
    })),
    page: result.page,
    limit: result.limit,
    total: result.total,
  };
}
export function toSolvedStatusResponse(
  result: readonly SolvedStatusResult[],
): SolvedStatusResponseDto[] {
  return result.map((p) => ({
    problemId: p.problemId,
    solved: p.solved,
    solvedAt: p.solvedAt?.toISOString() ?? null,
  }));
}
export function toCourseProgressResponse(result: CourseProgressResult): CourseProgressResponseDto {
  return {
    courseId: result.courseId,
    completed: result.completed,
    solved: result.completed,
    total: result.total,
    chapters: result.chapters.map((c) => ({
      chapterId: c.chapterId,
      completed: c.completed,
      solved: c.completed,
      total: c.total,
    })),
    completedItems: result.completedItems.map((item) => ({
      type: item.type,
      itemId: item.itemId,
      completedAt: item.completedAt.toISOString(),
    })),
    solvedProblems: result.completedItems.flatMap((item) =>
      item.type === 'PROBLEM'
        ? [{ problemId: item.itemId, solvedAt: item.completedAt.toISOString() }]
        : [],
    ),
  };
}
