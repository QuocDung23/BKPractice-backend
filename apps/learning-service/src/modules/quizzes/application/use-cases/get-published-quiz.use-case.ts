import { Injectable } from '@nestjs/common';

import type { IGetPublishedQuizPortIn } from '@/modules/quizzes/application/ports/in/get-published-quiz.port.in';
import { QuizCourseAccessReader, QuizRepository } from '@/modules/quizzes/application/ports/out';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetPublishedQuizUseCase implements IGetPublishedQuizPortIn {
  constructor(
    private readonly quizzes: QuizRepository,
    private readonly access: QuizCourseAccessReader,
  ) {}
  async execute(
    _p: Principal,
    id: string,
  ): Promise<{ id: string; title: string; description: string | null; questionCount: number }> {
    if (!(await this.access.isVisible(id))) throw new QuizError('NOT_FOUND', 'Quiz not available');
    const q = await this.quizzes.find(id);
    if (!q?.published) throw new QuizError('NOT_FOUND', 'Quiz not available');
    return {
      id: q.state.id,
      title: q.published.title,
      description: q.published.description,
      questionCount: q.published.items.length,
    };
  }
}
