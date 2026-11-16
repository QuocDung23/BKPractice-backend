import { CompletionCount } from '@/modules/progress/domain/value-objects';

export interface VisibleCourseStructure {
  readonly courseId: string;
  readonly chapters: readonly {
    readonly chapterId: string;
    readonly items: readonly VisibleLearningItem[];
  }[];
}
export type LearningItemType = 'PROBLEM' | 'QUIZ';
export interface VisibleLearningItem {
  readonly type: LearningItemType;
  readonly itemId: string;
}
export interface CompletedLearningItem extends VisibleLearningItem {
  readonly completedAt: Date;
}
export interface SolvedProblem {
  readonly problemId: string;
  readonly solvedAt: Date;
}
export interface CourseCompletion {
  readonly courseId: string;
  readonly completed: number;
  readonly total: number;
  readonly chapters: readonly {
    readonly chapterId: string;
    readonly completed: number;
    readonly total: number;
  }[];
  readonly completedItems: readonly CompletedLearningItem[];
}

export class CourseCompletionCalculator {
  calculate(
    structure: VisibleCourseStructure,
    completedByItem: ReadonlyMap<string, Date>,
  ): CourseCompletion {
    const completedItems: CompletedLearningItem[] = [];
    const chapters = structure.chapters.map((chapter) => {
      let completed = 0;
      for (const item of chapter.items) {
        const completedAt = completedByItem.get(learningItemKey(item.type, item.itemId));
        if (completedAt) {
          completed++;
          completedItems.push({ ...item, completedAt });
        }
      }
      const count = new CompletionCount(completed, chapter.items.length);
      return { chapterId: chapter.chapterId, completed: count.solved, total: count.total };
    });
    const count = new CompletionCount(
      completedItems.length,
      chapters.reduce((sum, c) => sum + c.total, 0),
    );
    return {
      courseId: structure.courseId,
      completed: count.solved,
      total: count.total,
      chapters,
      completedItems,
    };
  }
}

export function learningItemKey(type: LearningItemType, itemId: string): string {
  return `${type}:${itemId}`;
}
