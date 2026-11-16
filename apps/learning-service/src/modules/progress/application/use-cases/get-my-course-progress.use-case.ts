import { Inject, Injectable } from '@nestjs/common';

import { CourseProgressNotFoundError } from '@/modules/progress/application/errors';
import type { Principal } from '@/modules/progress/application/models';
import type { IGetMyCourseProgressPortIn } from '@/modules/progress/application/ports/in';
import type {
  CourseStructureReader,
  QuizCompletionReader,
} from '@/modules/progress/application/ports/out';
import type { CourseProgressResult } from '@/modules/progress/application/results';
import type { ProgressRepository } from '@/modules/progress/domain/repositories';
import { CourseCompletionCalculator, learningItemKey } from '@/modules/progress/domain/services';
import {
  COURSE_STRUCTURE_READER,
  PROGRESS_REPOSITORY,
  QUIZ_COMPLETION_READER,
} from '@/modules/progress/progress.tokens';
@Injectable()
export class GetMyCourseProgressUseCase implements IGetMyCourseProgressPortIn {
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly repository: ProgressRepository,
    @Inject(COURSE_STRUCTURE_READER) private readonly courses: CourseStructureReader,
    @Inject(QUIZ_COMPLETION_READER) private readonly quizzes: QuizCompletionReader,
    private readonly calculator: CourseCompletionCalculator,
  ) {}
  async execute(principal: Principal, courseId: string): Promise<CourseProgressResult> {
    const structure = await this.courses.loadVisibleStructure(courseId);
    if (!structure) throw new CourseProgressNotFoundError();
    const items = structure.chapters.flatMap((chapter) => chapter.items);
    const problemIds = items.filter((item) => item.type === 'PROBLEM').map((item) => item.itemId);
    const quizIds = items.filter((item) => item.type === 'QUIZ').map((item) => item.itemId);
    const [solvedProblems, completedQuizzes] = await Promise.all([
      this.repository.findSolved(principal.userId, problemIds),
      this.quizzes.findCompleted(principal.userId, quizIds),
    ]);
    const completed = new Map<string, Date>();
    for (const [id, at] of solvedProblems) completed.set(learningItemKey('PROBLEM', id), at);
    for (const [id, at] of completedQuizzes) completed.set(learningItemKey('QUIZ', id), at);
    return this.calculator.calculate(structure, completed);
  }
}
