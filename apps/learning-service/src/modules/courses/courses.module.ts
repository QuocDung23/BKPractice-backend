import { ProblemsModule } from '@learning/modules/problems/problems.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ADD_CHAPTER_PORT_IN,
  ATTACH_PROBLEM_PORT_IN,
  CREATE_COURSE_PORT_IN,
  DELETE_COURSE_PORT_IN,
  DETACH_PROBLEM_PORT_IN,
  GET_MANAGED_COURSE_PORT_IN,
  GET_PUBLISHED_COURSE_PORT_IN,
  HOLD_COURSE_PORT_IN,
  LIST_MANAGED_COURSES_PORT_IN,
  LIST_PUBLISHED_COURSES_PORT_IN,
  PUBLISH_COURSE_PORT_IN,
  REMOVE_CHAPTER_PORT_IN,
  REORDER_CHAPTER_PROBLEMS_PORT_IN,
  REORDER_CHAPTERS_PORT_IN,
  REPUBLISH_COURSE_PORT_IN,
  RESTORE_COURSE_PORT_IN,
  UPDATE_CHAPTER_PORT_IN,
  UPDATE_COURSE_PORT_IN,
} from '@/modules/courses/application/ports/in';
import { ATTACH_QUIZ_PORT_IN } from '@/modules/courses/application/ports/in/attach-quiz.port.in';
import { DETACH_QUIZ_PORT_IN } from '@/modules/courses/application/ports/in/detach-quiz.port.in';
import { REORDER_CHAPTER_QUIZZES_PORT_IN } from '@/modules/courses/application/ports/in/reorder-chapter-quizzes.port.in';
import { COURSE_QUIZ_CATALOG } from '@/modules/courses/application/ports/out';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import {
  AddChapterUseCase,
  AttachProblemUseCase,
  CreateCourseUseCase,
  DeleteCourseUseCase,
  DetachProblemUseCase,
  GetManagedCourseUseCase,
  GetPublishedCourseUseCase,
  HoldCourseUseCase,
  ListManagedCoursesUseCase,
  ListPublishedCoursesUseCase,
  PublishCourseUseCase,
  RemoveChapterUseCase,
  ReorderChapterProblemsUseCase,
  ReorderChaptersUseCase,
  RepublishCourseUseCase,
  RestoreCourseUseCase,
  UpdateChapterUseCase,
  UpdateCourseUseCase,
} from '@/modules/courses/application/use-cases';
import { AttachQuizUseCase } from '@/modules/courses/application/use-cases/attach-quiz.use-case';
import { DetachQuizUseCase } from '@/modules/courses/application/use-cases/detach-quiz.use-case';
import { ReorderChapterQuizzesUseCase } from '@/modules/courses/application/use-cases/reorder-chapter-quizzes.use-case';
import {
  COURSE_PROBLEM_CATALOG,
  COURSE_REPOSITORY,
  COURSE_TRANSACTION_RUNNER,
} from '@/modules/courses/course.tokens';
import { CourseReadiness } from '@/modules/courses/domain/services';
import {
  ChapterEntity as Chapter,
  ChapterProblemEntity as ChapterProblem,
  ChapterQuizEntity,
  CourseEntity as Course,
} from '@/modules/courses/entities';
import {
  CourseTypeOrmRepository,
  CourseTypeOrmTransactionContext,
  CourseTypeOrmTransactionRunner,
} from '@/modules/courses/infrastructure/persistence';
import { ProblemReferenceCatalogAdapter } from '@/modules/courses/infrastructure/problems';
import { QuizCatalogAdapter } from '@/modules/courses/infrastructure/quiz-catalog.adapter';
import {
  ManagedChaptersController,
  ManagedCoursesController,
  PublicCoursesController,
} from '@/modules/courses/presentation/http';
import { ChapterQuizzesController } from '@/modules/courses/presentation/http/chapter-quizzes.controller';
import { CourseExceptionFilter } from '@/modules/courses/presentation/http/filters';
import { QuizzesModule } from '@/modules/quizzes/quizzes.module';

@Module({
  // ProblemsModule chỉ để lấy PROBLEM_REFERENCE_READER (API đọc duy nhất courses dùng).
  imports: [
    TypeOrmModule.forFeature([Course, Chapter, ChapterProblem, ChapterQuizEntity]),
    QuizzesModule,
    ProblemsModule,
  ],
  controllers: [
    ChapterQuizzesController,
    ManagedCoursesController,
    ManagedChaptersController,
    PublicCoursesController,
  ],
  providers: [
    QuizCatalogAdapter,
    { provide: COURSE_QUIZ_CATALOG, useExisting: QuizCatalogAdapter },
    AttachQuizUseCase,
    { provide: ATTACH_QUIZ_PORT_IN, useExisting: AttachQuizUseCase },
    DetachQuizUseCase,
    { provide: DETACH_QUIZ_PORT_IN, useExisting: DetachQuizUseCase },
    ReorderChapterQuizzesUseCase,
    { provide: REORDER_CHAPTER_QUIZZES_PORT_IN, useExisting: ReorderChapterQuizzesUseCase },
    CourseExceptionFilter,
    CourseAuthorizationService,
    CourseReadiness,
    CoursePublishReadinessService,
    CourseViewAssembler,

    CreateCourseUseCase,
    UpdateCourseUseCase,
    PublishCourseUseCase,
    HoldCourseUseCase,
    RepublishCourseUseCase,
    DeleteCourseUseCase,
    RestoreCourseUseCase,
    AddChapterUseCase,
    UpdateChapterUseCase,
    RemoveChapterUseCase,
    ReorderChaptersUseCase,
    AttachProblemUseCase,
    DetachProblemUseCase,
    ReorderChapterProblemsUseCase,
    GetManagedCourseUseCase,
    ListManagedCoursesUseCase,
    GetPublishedCourseUseCase,
    ListPublishedCoursesUseCase,
    CourseTypeOrmRepository,
    CourseTypeOrmTransactionContext,
    CourseTypeOrmTransactionRunner,
    ProblemReferenceCatalogAdapter,
    { provide: COURSE_REPOSITORY, useExisting: CourseTypeOrmRepository },
    { provide: COURSE_PROBLEM_CATALOG, useExisting: ProblemReferenceCatalogAdapter },
    { provide: COURSE_TRANSACTION_RUNNER, useExisting: CourseTypeOrmTransactionRunner },
    { provide: CREATE_COURSE_PORT_IN, useExisting: CreateCourseUseCase },
    { provide: UPDATE_COURSE_PORT_IN, useExisting: UpdateCourseUseCase },
    { provide: PUBLISH_COURSE_PORT_IN, useExisting: PublishCourseUseCase },
    { provide: HOLD_COURSE_PORT_IN, useExisting: HoldCourseUseCase },
    { provide: REPUBLISH_COURSE_PORT_IN, useExisting: RepublishCourseUseCase },
    { provide: DELETE_COURSE_PORT_IN, useExisting: DeleteCourseUseCase },
    { provide: RESTORE_COURSE_PORT_IN, useExisting: RestoreCourseUseCase },
    { provide: ADD_CHAPTER_PORT_IN, useExisting: AddChapterUseCase },
    { provide: UPDATE_CHAPTER_PORT_IN, useExisting: UpdateChapterUseCase },
    { provide: REMOVE_CHAPTER_PORT_IN, useExisting: RemoveChapterUseCase },
    { provide: REORDER_CHAPTERS_PORT_IN, useExisting: ReorderChaptersUseCase },
    { provide: ATTACH_PROBLEM_PORT_IN, useExisting: AttachProblemUseCase },
    { provide: DETACH_PROBLEM_PORT_IN, useExisting: DetachProblemUseCase },
    { provide: REORDER_CHAPTER_PROBLEMS_PORT_IN, useExisting: ReorderChapterProblemsUseCase },
    { provide: GET_MANAGED_COURSE_PORT_IN, useExisting: GetManagedCourseUseCase },
    { provide: LIST_MANAGED_COURSES_PORT_IN, useExisting: ListManagedCoursesUseCase },
    { provide: GET_PUBLISHED_COURSE_PORT_IN, useExisting: GetPublishedCourseUseCase },
    { provide: LIST_PUBLISHED_COURSES_PORT_IN, useExisting: ListPublishedCoursesUseCase },
  ],
})
export class CoursesModule {}
