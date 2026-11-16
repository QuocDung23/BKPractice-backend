import { Chapter, ChapterProblem, Course } from './courses/entities/course.entity';
import {
  Problem,
  ProblemHarness,
  ProblemLanguage,
  StarterCode,
  Tag,
  TestCase,
  Topic,
} from './problems/entities/problem.entity';
import { ProgressEventReceipt } from './progress/entities/progress-event-receipt.entity';
import { Progress } from './progress/entities/progress.entity';

import { ChapterQuizEntity } from '@/modules/courses/entities';
import {
  BankQuestionEntity,
  BankQuestionRevisionEntity,
  QuestionGrantEntity,
  QuizAnswerEntity,
  QuizAttemptEntity,
  QuizEntity,
  QuizGrantEntity,
  QuizItemEntity,
  QuizRevisionEntity,
} from '@/modules/quizzes/infrastructure/persistence/quiz.entities';

export const learningEntities = [
  ChapterQuizEntity,
  BankQuestionEntity,
  BankQuestionRevisionEntity,
  QuizEntity,
  QuizRevisionEntity,
  QuizItemEntity,
  QuestionGrantEntity,
  QuizGrantEntity,
  QuizAttemptEntity,
  QuizAnswerEntity,
  Problem,
  ProblemHarness,
  TestCase,
  StarterCode,
  ProblemLanguage,
  Topic,
  Tag,
  Course,
  Chapter,
  ChapterProblem,
  Progress,
  ProgressEventReceipt,
];
