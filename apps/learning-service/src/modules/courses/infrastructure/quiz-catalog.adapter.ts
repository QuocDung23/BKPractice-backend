import { Injectable } from '@nestjs/common';

import type { CourseQuizCatalog, CourseQuizSummary } from '@/modules/courses/application/ports/out';
import { QuizReferenceReader } from '@/modules/quizzes/application/ports/out';
@Injectable()
export class QuizCatalogAdapter implements CourseQuizCatalog {
  constructor(private readonly reader: QuizReferenceReader) {}
  findByIds(ids: string[]): Promise<Map<string, CourseQuizSummary>> {
    return this.reader.read(ids);
  }
}
