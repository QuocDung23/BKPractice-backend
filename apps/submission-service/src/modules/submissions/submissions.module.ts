import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';

import { ApplyRunJudgeResultUseCase } from './application/apply-run-judge-result.use-case';
import { ApplySubmitJudgeResultUseCase } from './application/apply-submit-judge-result.use-case';
import {
  CountCourseSubmissionsUseCase,
  SUBMISSION_COUNT_READER,
} from './application/count-course-submissions.use-case';
import { ExpireStaleSubmissionsUseCase } from './application/expire-stale-submissions.use-case';
import { GetSubmissionDetailUseCase } from './application/get-submission-detail.use-case';
import { ListSubmissionHistoryUseCase } from './application/list-submission-history.use-case';
import { RelayAcceptedEventsUseCase } from './application/relay-accepted-events.use-case';
import { SubmitCodeUseCase } from './application/submit-code.use-case';
import { ACCEPTED_EVENT_OUTBOX_PORT } from './domain/ports/accepted-event-outbox.port';
import type { AcceptedEventOutboxPort } from './domain/ports/accepted-event-outbox.port';
import { ACCEPTED_EVENT_PORT } from './domain/ports/accepted-event.port';
import type { AcceptedEventPort } from './domain/ports/accepted-event.port';
import { JUDGE_JOB_PORT } from './domain/ports/judge-job.port';
import type { JudgeJobPort } from './domain/ports/judge-job.port';
import { LEARNING_JUDGE_PACKAGE_PORT } from './domain/ports/learning-judge-package.port';
import type { LearningJudgePackagePort } from './domain/ports/learning-judge-package.port';
import { REALTIME_PORT } from './domain/ports/realtime.port';
import type { RealtimePort } from './domain/ports/realtime.port';
import { SUBMISSION_REPOSITORY_PORT } from './domain/ports/submission-repository.port';
import type { SubmissionRepositoryPort } from './domain/ports/submission-repository.port';
import { HttpLearningJudgePackageAdapter } from './infrastructure/http/http-learning-judge-package.adapter';
import { RabbitAcceptedEventAdapter } from './infrastructure/messaging/rabbit-accepted-event.adapter';
import { RabbitJudgeJobAdapter } from './infrastructure/messaging/rabbit-judge-job.adapter';
import { SubmissionAcceptedOutbox } from './infrastructure/persistence/submission-accepted-outbox.entity';
import { Submission, SubmissionResult } from './infrastructure/persistence/submission.entity';
import { TypeormSubmissionCountReader } from './infrastructure/persistence/typeorm-submission-count.reader';
import { TypeormSubmissionRepository } from './infrastructure/persistence/typeorm-submission.repository';
import { RedisRealtimeAdapter } from './infrastructure/realtime/redis-realtime.adapter';
import { AcceptedEventRelay } from './infrastructure/scheduling/accepted-event-relay';
import { SubmissionWatchdog } from './infrastructure/scheduling/submission-watchdog';
import { InternalSubmissionCountsController } from './presentation/internal-submission-counts.controller';
import { JudgeResultConsumer } from './presentation/judge-result.consumer';
import { SubmissionsController } from './presentation/submissions.controller';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Submission, SubmissionResult, SubmissionAcceptedOutbox]),
  ],
  controllers: [SubmissionsController, InternalSubmissionCountsController],
  providers: [
    JudgeResultConsumer,
    TypeormSubmissionRepository,
    TypeormSubmissionCountReader,
    CountCourseSubmissionsUseCase,
    { provide: SUBMISSION_COUNT_READER, useExisting: TypeormSubmissionCountReader },
    { provide: SUBMISSION_REPOSITORY_PORT, useExisting: TypeormSubmissionRepository },
    { provide: ACCEPTED_EVENT_OUTBOX_PORT, useExisting: TypeormSubmissionRepository },
    { provide: LEARNING_JUDGE_PACKAGE_PORT, useClass: HttpLearningJudgePackageAdapter },
    { provide: JUDGE_JOB_PORT, useClass: RabbitJudgeJobAdapter },
    { provide: ACCEPTED_EVENT_PORT, useClass: RabbitAcceptedEventAdapter },
    {
      provide: REALTIME_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new RedisRealtimeAdapter(
          new Redis(config.getOrThrow<string>('REDIS_URL'), { lazyConnect: true }),
          new Logger(RedisRealtimeAdapter.name),
        ),
    },
    {
      provide: ApplyRunJudgeResultUseCase,
      inject: [SUBMISSION_REPOSITORY_PORT, REALTIME_PORT],
      useFactory: (repository: SubmissionRepositoryPort, realtime: RealtimePort) =>
        new ApplyRunJudgeResultUseCase(repository, realtime),
    },
    {
      provide: SubmitCodeUseCase,
      inject: [LEARNING_JUDGE_PACKAGE_PORT, SUBMISSION_REPOSITORY_PORT, JUDGE_JOB_PORT],
      useFactory: (
        learning: LearningJudgePackagePort,
        repository: SubmissionRepositoryPort,
        judge: JudgeJobPort,
      ) => new SubmitCodeUseCase(learning, repository, judge),
    },
    {
      provide: ApplySubmitJudgeResultUseCase,
      inject: [SUBMISSION_REPOSITORY_PORT, REALTIME_PORT],
      useFactory: (repository: SubmissionRepositoryPort, realtime: RealtimePort) =>
        new ApplySubmitJudgeResultUseCase(repository, realtime),
    },
    {
      provide: RelayAcceptedEventsUseCase,
      inject: [ACCEPTED_EVENT_OUTBOX_PORT, ACCEPTED_EVENT_PORT],
      useFactory: (outbox: AcceptedEventOutboxPort, events: AcceptedEventPort) =>
        new RelayAcceptedEventsUseCase(outbox, events),
    },
    {
      provide: AcceptedEventRelay,
      inject: [RelayAcceptedEventsUseCase],
      useFactory: (relayAcceptedEvents: RelayAcceptedEventsUseCase) =>
        new AcceptedEventRelay(relayAcceptedEvents),
    },
    {
      provide: ListSubmissionHistoryUseCase,
      inject: [SUBMISSION_REPOSITORY_PORT],
      useFactory: (repository: SubmissionRepositoryPort) =>
        new ListSubmissionHistoryUseCase(repository),
    },
    {
      provide: GetSubmissionDetailUseCase,
      inject: [SUBMISSION_REPOSITORY_PORT],
      useFactory: (repository: SubmissionRepositoryPort) =>
        new GetSubmissionDetailUseCase(repository),
    },
    {
      provide: ExpireStaleSubmissionsUseCase,
      inject: [SUBMISSION_REPOSITORY_PORT, REALTIME_PORT],
      useFactory: (repository: SubmissionRepositoryPort, realtime: RealtimePort) =>
        new ExpireStaleSubmissionsUseCase(repository, realtime),
    },
    {
      provide: SubmissionWatchdog,
      inject: [ExpireStaleSubmissionsUseCase],
      useFactory: (expireStaleSubmissions: ExpireStaleSubmissionsUseCase) =>
        new SubmissionWatchdog(expireStaleSubmissions),
    },
  ],
  // Run (modules/run-code) shares the aggregate through these two ports only; the Learning
  // judge-package port is deliberately not exported (SUB-001-FR-004).
  exports: [SUBMISSION_REPOSITORY_PORT, JUDGE_JOB_PORT],
})
export class SubmissionsModule {}
