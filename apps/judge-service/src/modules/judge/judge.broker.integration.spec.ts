import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RabbitMqService } from '@app/common';
import { RABBIT_EXCHANGES, RABBIT_QUEUES, RABBIT_ROUTING_KEYS } from '@app/contracts';
import type { JudgeRequest, JudgeResult } from '@app/contracts';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';

import { ProcessJudgeRequestUseCase } from './application/process-judge-request.use-case';
import { runBoundedProcess } from './infrastructure/sandbox/bounded-process';
import { DockerSandboxAdapter } from './infrastructure/sandbox/docker-sandbox.adapter';
import { JudgeConsumer } from './judge.consumer';
import { JudgeEngine } from './judge.engine';
import { CRunner } from './runners/c.runner';
import { CppRunner } from './runners/cpp.runner';
import { JavaRunner } from './runners/java.runner';
import { PythonRunner } from './runners/python.runner';
import { RunnerRegistry } from './runners/runner.registry';

/**
 * End-to-end evidence for the Judge worker: a real RabbitMQ broker, the real consumer, use case and
 * engine, and real Docker sandboxes. The "Submission side" here is a second broker connection that
 * publishes `judge.request` and consumes `judge.result`.
 *
 * Opt in with JUDGE_DOCKER_IT=1 and JUDGE_BROKER_IT_URL pointing at a disposable broker; the
 * queues of that broker are purged, so never point it at a shared one.
 */
const BROKER_URL = process.env.JUDGE_BROKER_IT_URL;
const describeBroker = process.env.JUDGE_DOCKER_IT === '1' && BROKER_URL ? describe : describe.skip;

describeBroker('Judge worker over RabbitMQ (real broker, real Docker)', () => {
  jest.setTimeout(180_000);
  const results: JudgeResult[] = [];
  let root: string;
  let judgeBroker: RabbitMqService;
  let submissionBroker: RabbitMqService;
  let admin: amqp.ChannelModel;
  let adminChannel: amqp.Channel;

  const config = () => new ConfigService({ RABBITMQ_URL: BROKER_URL });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-broker-it-'));
    judgeBroker = new RabbitMqService(config());
    submissionBroker = new RabbitMqService(config());
    await submissionBroker.consume<JudgeResult>(RABBIT_QUEUES.submissionResults, (result) => {
      results.push(result);
      return Promise.resolve();
    });
    admin = await amqp.connect(BROKER_URL as string);
    adminChannel = await admin.createChannel();
    for (const queue of Object.values(RABBIT_QUEUES)) await adminChannel.purgeQueue(queue);

    const engine = new JudgeEngine(
      new RunnerRegistry(new CRunner(), new CppRunner(), new JavaRunner(), new PythonRunner()),
      new DockerSandboxAdapter(
        new ConfigService({
          JUDGE_WORKSPACE_ROOT: root,
          JUDGE_DOCKER_BINARY: 'docker',
          JUDGE_MAX_OUTPUT_BYTES: 64 * 1024,
        }),
        runBoundedProcess,
      ),
    );
    await new JudgeConsumer(judgeBroker, new ProcessJudgeRequestUseCase(engine)).onModuleInit();
  });

  afterAll(async () => {
    await adminChannel.close();
    await admin.close();
    await judgeBroker.onApplicationShutdown();
    await submissionBroker.onApplicationShutdown();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    results.length = 0;
  });

  const publishRequest = (payload: object) =>
    submissionBroker.publish(RABBIT_EXCHANGES.judge, RABBIT_ROUTING_KEYS.judgeRequest, payload);

  const waitForResult = async (executionId: string): Promise<JudgeResult> => {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const found = results.find((result) => result.executionId === executionId);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`No judge result for ${executionId}`);
  };

  const queueDepth = async (queue: string) => (await adminChannel.checkQueue(queue)).messageCount;

  const base = {
    submissionId: 'b7f0b7b0-6f4e-4c55-8f0e-4b0f4d1f9a10',
    problemType: 'STANDARD',
    timeLimitMs: 5000,
    memoryLimitMb: 256,
  } as const;

  it('judges a Run request and returns its output to the Submission queue', async () => {
    const request: JudgeRequest = {
      ...base,
      executionId: 'run-python-1',
      mode: 'RUN',
      language: 'python',
      sourceCode: 'print(input()[::-1])',
      testCases: [{ stdin: 'abc\n' }],
    };
    await publishRequest(request);
    await expect(waitForResult('run-python-1')).resolves.toMatchObject({
      submissionId: base.submissionId,
      mode: 'RUN',
      status: 'ACCEPTED',
      stdout: 'cba\n',
    });
  });

  it('judges a Submit request in C++ and reports counts and score', async () => {
    const request: JudgeRequest = {
      ...base,
      executionId: 'submit-cpp-1',
      mode: 'SUBMIT',
      language: 'cpp',
      sourceCode: '#include <iostream>\nint main(){long a,b; std::cin>>a>>b; std::cout<<a+b;}',
      testCases: [
        { stdin: '1 2', expectedOutput: '3', score: 40 },
        { stdin: '10 -4', expectedOutput: '6\n', score: 60 },
      ],
    };
    await publishRequest(request);
    const result = await waitForResult('submit-cpp-1');
    expect(result).toMatchObject({
      mode: 'SUBMIT',
      status: 'ACCEPTED',
      passedTests: 2,
      totalTests: 2,
      score: 100,
    });
    expect(result).not.toHaveProperty('memoryKb');
  });

  it('answers an invalid but correlatable request with INTERNAL_ERROR', async () => {
    await publishRequest({ ...base, executionId: 'invalid-1', mode: 'SUBMIT', language: 'ruby' });
    await expect(waitForResult('invalid-1')).resolves.toMatchObject({
      status: 'INTERNAL_ERROR',
      stderr: 'Invalid judge request',
    });
  });

  it('drops an uncorrelatable message: no result, no retry, nothing dead-lettered', async () => {
    await publishRequest({ sourceCode: 'print(1)' });
    // A later valid request proves the worker moved past the dropped message.
    await publishRequest({
      ...base,
      executionId: 'after-poison-1',
      mode: 'RUN',
      language: 'python',
      sourceCode: 'print(1)',
      testCases: [{ stdin: '' }],
    } satisfies JudgeRequest);
    await waitForResult('after-poison-1');
    expect(results).toHaveLength(1);
    expect(await queueDepth(RABBIT_QUEUES.judgeRequests)).toBe(0);
    expect(await queueDepth(RABBIT_QUEUES.judgeRequestsDead)).toBe(0);
  });
});
