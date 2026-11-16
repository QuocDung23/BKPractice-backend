import { RabbitMqService } from '@app/common';
import { RABBIT_EXCHANGES, RABBIT_QUEUES, RABBIT_ROUTING_KEYS } from '@app/contracts';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ProcessJudgeRequestUseCase } from './application/process-judge-request.use-case';

@Injectable()
export class JudgeConsumer implements OnModuleInit {
  private readonly logger = new Logger(JudgeConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly processJudgeRequest: ProcessJudgeRequestUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume<unknown>(RABBIT_QUEUES.judgeRequests, async (payload) => {
      const result = await this.processJudgeRequest.execute(payload);
      if (!result) {
        // JDG-001-FR-024/FR-025: returning acknowledges the message; the payload is never logged.
        this.logger.warn('Dropped a judge request that cannot be correlated');
        return;
      }
      // A publish failure rejects here, so the request is not acknowledged (JDG-001-FR-023).
      await this.rabbit.publish(
        RABBIT_EXCHANGES.submission,
        RABBIT_ROUTING_KEYS.judgeResult,
        result,
        { messageId: result.executionId },
      );
    });
  }
}
