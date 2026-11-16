import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  APPLY_ACCEPTED_SUBMISSION_PORT_IN,
  GET_MY_COURSE_PROGRESS_PORT_IN,
  GET_MY_SOLVED_STATUS_PORT_IN,
  LIST_MY_SOLVED_PROBLEMS_PORT_IN,
} from '@/modules/progress/application/ports/in';
import { GetStudentCourseReportUseCase } from '@/modules/progress/application/reports/get-student-course-report.use-case';
import {
  LOCAL_COURSE_REPORT_READER,
  REMOTE_COURSE_REPORT_READER,
} from '@/modules/progress/application/reports/student-course-report.ports';
import {
  ApplyAcceptedSubmissionUseCase,
  GetMyCourseProgressUseCase,
  GetMySolvedStatusUseCase,
  ListMySolvedProblemsUseCase,
} from '@/modules/progress/application/use-cases';
import { CourseCompletionCalculator } from '@/modules/progress/domain/services';
import { Progress, ProgressEventReceipt } from '@/modules/progress/entities';
import {
  ProgressTransactionContext,
  ProgressTransactionRunner,
  ProgressTypeOrmRepository,
} from '@/modules/progress/infrastructure/persistence';
import {
  CourseStructureTypeOrmReader,
  PublishedProblemTypeOrmFilter,
  QuizCompletionTypeOrmReader,
} from '@/modules/progress/infrastructure/readers';
import { LocalCourseReportReaderAdapter } from '@/modules/progress/infrastructure/reports/local-course-report.reader';
import { RemoteCourseReportReaderAdapter } from '@/modules/progress/infrastructure/reports/remote-course-report.reader';
import { MyProgressController } from '@/modules/progress/presentation/http';
import { ProgressExceptionFilter } from '@/modules/progress/presentation/http/filters';
import { StudentCourseReportController } from '@/modules/progress/presentation/http/student-course-report.controller';
import { ProgressConsumer } from '@/modules/progress/presentation/messaging';
import {
  PROGRESS_REPOSITORY,
  PROGRESS_TRANSACTION_RUNNER,
  COURSE_STRUCTURE_READER,
  PUBLISHED_PROBLEM_FILTER,
  QUIZ_COMPLETION_READER,
} from '@/modules/progress/progress.tokens';
@Module({
  imports: [TypeOrmModule.forFeature([Progress, ProgressEventReceipt])],
  controllers: [MyProgressController, StudentCourseReportController],
  providers: [
    ProgressConsumer,
    ApplyAcceptedSubmissionUseCase,
    ProgressTransactionContext,
    ProgressTransactionRunner,
    ProgressTypeOrmRepository,
    ProgressExceptionFilter,
    CourseCompletionCalculator,
    GetStudentCourseReportUseCase,
    LocalCourseReportReaderAdapter,
    RemoteCourseReportReaderAdapter,
    { provide: LOCAL_COURSE_REPORT_READER, useExisting: LocalCourseReportReaderAdapter },
    { provide: REMOTE_COURSE_REPORT_READER, useExisting: RemoteCourseReportReaderAdapter },
    CourseStructureTypeOrmReader,
    PublishedProblemTypeOrmFilter,
    QuizCompletionTypeOrmReader,
    GetMyCourseProgressUseCase,
    GetMySolvedStatusUseCase,
    ListMySolvedProblemsUseCase,
    { provide: APPLY_ACCEPTED_SUBMISSION_PORT_IN, useExisting: ApplyAcceptedSubmissionUseCase },
    { provide: GET_MY_COURSE_PROGRESS_PORT_IN, useExisting: GetMyCourseProgressUseCase },
    { provide: GET_MY_SOLVED_STATUS_PORT_IN, useExisting: GetMySolvedStatusUseCase },
    { provide: LIST_MY_SOLVED_PROBLEMS_PORT_IN, useExisting: ListMySolvedProblemsUseCase },
    { provide: PROGRESS_REPOSITORY, useExisting: ProgressTypeOrmRepository },
    { provide: PROGRESS_TRANSACTION_RUNNER, useExisting: ProgressTransactionRunner },
    { provide: COURSE_STRUCTURE_READER, useExisting: CourseStructureTypeOrmReader },
    { provide: PUBLISHED_PROBLEM_FILTER, useExisting: PublishedProblemTypeOrmFilter },
    { provide: QUIZ_COMPLETION_READER, useExisting: QuizCompletionTypeOrmReader },
  ],
})
export class ProgressModule {}
