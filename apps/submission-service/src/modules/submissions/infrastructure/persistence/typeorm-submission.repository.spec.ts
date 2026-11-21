import type { SubmitVerdictPersistenceInput } from '@submission/modules/submissions/domain/ports/submission-repository.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { SubmissionAcceptedOutbox } from './submission-accepted-outbox.entity';
import { Submission } from './submission.entity';
import { TypeormSubmissionRepository } from './typeorm-submission.repository';

function entity(overrides: Partial<Submission> = {}): Submission {
  return Object.assign(new Submission(), {
    id: '2a05ca28-eaaa-4e92-863e-f71b33db5040',
    publicId: 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5',
    userId: 'a85cb06f-c20a-4400-bae5-c2d3b891d890',
    problemId: null,
    kind: SubmissionKind.Run,
    language: 'python',
    sourceCode: 'print(1)',
    stdin: '',
    status: SubmissionStatus.Queued,
    score: 0,
    passedTests: null,
    totalTests: null,
    runtimeMs: null,
    memoryKb: null,
    acceptedEventId: null,
    progressEventPublishedAt: null,
    createdAt: new Date('2026-10-21T05:00:00.000Z'),
    updatedAt: new Date('2026-10-21T05:00:01.000Z'),
    ...overrides,
  });
}

describe('TypeormSubmissionRepository', () => {
  it('finds detail by public ID first without trying the legacy ID', async () => {
    const submissions = {
      findOne: jest.fn().mockResolvedValue(entity({ result: undefined })),
    } as unknown as jest.Mocked<Repository<Submission>>;
    const repository = new TypeormSubmissionRepository(submissions, {} as DataSource);

    await repository.findByPublicIdAndOwner('candidate-id', 'owner-id');

    expect(submissions.findOne).toHaveBeenCalledTimes(1);
    expect(submissions.findOne).toHaveBeenCalledWith({
      where: { publicId: 'candidate-id', userId: 'owner-id' },
      relations: { result: true },
    });
  });

  it('falls back to the legacy internal ID with the same owner predicate', async () => {
    const submissions = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(entity({ result: undefined })),
    } as unknown as jest.Mocked<Repository<Submission>>;
    const repository = new TypeormSubmissionRepository(submissions, {} as DataSource);

    const found = await repository.findByPublicIdAndOwner('candidate-id', 'owner-id');

    expect(found).not.toBeNull();
    expect(submissions.findOne).toHaveBeenLastCalledWith({
      where: { id: 'candidate-id', userId: 'owner-id' },
      relations: { result: true },
    });
  });

  it('locks a non-terminal Run, saves the result and status in one transaction', async () => {
    const run = entity();
    const manager = {
      findOne: jest.fn().mockResolvedValue(run),
      save: jest
        .fn()
        .mockImplementation(async (_target: unknown, value?: unknown) => value ?? _target),
      create: jest.fn().mockImplementation((_target: unknown, value: unknown) => value),
    } as unknown as jest.Mocked<EntityManager>;
    const dataSource = {
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const repository = new TypeormSubmissionRepository({} as Repository<Submission>, dataSource);

    const applied = await repository.applyRunResultOnce({
      submissionId: run.id,
      status: SubmissionStatus.Executed,
      stdout: '1\n',
      runtimeMs: 4,
    });

    expect(manager.findOne).toHaveBeenCalledWith(
      Submission,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(run.status).toBe(SubmissionStatus.Executed);
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(applied).toMatchObject({ publicId: run.publicId, status: SubmissionStatus.Executed });
  });

  it('does not insert another result for a terminal Run', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(entity({ status: SubmissionStatus.InternalError })),
      save: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;
    const dataSource = {
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const repository = new TypeormSubmissionRepository({} as Repository<Submission>, dataSource);

    await expect(
      repository.applyRunResultOnce({
        submissionId: '2a05ca28-eaaa-4e92-863e-f71b33db5040',
        status: SubmissionStatus.RuntimeError,
      }),
    ).resolves.toBeNull();
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('TypeormSubmissionRepository dispatch and expiry', () => {
  it('queues only a PENDING record, whatever its kind', async () => {
    const submissions = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(entity({ kind: SubmissionKind.Submit })),
    } as unknown as jest.Mocked<Repository<Submission>>;
    const now = new Date('2026-10-27T06:00:00.000Z');

    await new TypeormSubmissionRepository(submissions, {} as DataSource).markQueued('id-1', now);

    expect(submissions.update).toHaveBeenCalledWith(
      { id: 'id-1', status: SubmissionStatus.Pending },
      { status: SubmissionStatus.Queued, updatedAt: now },
    );
  });

  it('returns null when the record already left PENDING', async () => {
    const submissions = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    } as unknown as jest.Mocked<Repository<Submission>>;

    await expect(
      new TypeormSubmissionRepository(submissions, {} as DataSource).markFailedToDispatch(
        'id-1',
        new Date(),
      ),
    ).resolves.toBeNull();
  });

  it('expires PENDING and QUEUED records of both kinds created before the cutoff', async () => {
    const submissions = {
      query: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as jest.Mocked<Repository<Submission>>;
    const cutoff = new Date('2026-10-27T05:50:00.000Z');
    const now = new Date('2026-10-27T06:00:00.000Z');

    await expect(
      new TypeormSubmissionRepository(submissions, {} as DataSource).expireStaleSubmissions(
        cutoff,
        now,
      ),
    ).resolves.toEqual([]);

    const [sql, params] = submissions.query.mock.calls[0]!;
    const whereClause = String(sql).split('WHERE')[1]!.split('RETURNING')[0];
    expect(whereClause).not.toMatch(/"kind"/);
    expect(params).toEqual([
      SubmissionStatus.InternalError,
      now,
      SubmissionStatus.Pending,
      SubmissionStatus.Queued,
      cutoff,
    ]);
  });
});

describe('TypeormSubmissionRepository history', () => {
  const ownerId = 'a85cb06f-c20a-4400-bae5-c2d3b891d890';

  function repositoryWith(rows: unknown[], total = rows.length) {
    const submissions = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ count: total }])
        .mockResolvedValueOnce(rows),
    } as unknown as jest.Mocked<Repository<Submission>>;
    return {
      submissions,
      repository: new TypeormSubmissionRepository(submissions, {} as DataSource),
    };
  }

  it('counts and lists with the owner as the first, mandatory condition', async () => {
    const { submissions, repository } = repositoryWith([]);

    await repository.listByOwner(ownerId, {}, null, 21);

    const [countSql, countParams] = submissions.query.mock.calls[0]!;
    const [listSql, listParams] = submissions.query.mock.calls[1]!;
    expect(countSql).toMatch(/COUNT\(\*\).*WHERE "user_id" = \$1$/s);
    expect(countParams).toEqual([ownerId]);
    expect(listSql).toMatch(
      /WHERE "user_id" = \$1\s+ORDER BY "created_at" DESC, "public_id" DESC\s+LIMIT \$2/,
    );
    expect(listParams).toEqual([ownerId, 21]);
  });

  it('narrows by kind and problem and applies the compound cursor only to the page query', async () => {
    const { submissions, repository } = repositoryWith([]);
    const problemId = '6832170d-de82-41f7-a82c-57b71efbf55c';
    const cursor = {
      createdAt: '2026-10-27T06:00:00.123456Z',
      publicId: 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5',
    };

    await repository.listByOwner(ownerId, { kind: SubmissionKind.Run, problemId }, cursor, 21);

    const [countSql, countParams] = submissions.query.mock.calls[0]!;
    const [listSql, listParams] = submissions.query.mock.calls[1]!;
    expect(countSql).not.toMatch(/created_at/);
    expect(countParams).toEqual([ownerId, SubmissionKind.Run, problemId]);
    expect(listSql).toContain(
      '("created_at" < $4::timestamptz OR ("created_at" = $4::timestamptz AND "public_id" < $5::uuid))',
    );
    expect(listParams).toEqual([
      ownerId,
      SubmissionKind.Run,
      problemId,
      cursor.createdAt,
      cursor.publicId,
      21,
    ]);
  });

  it('selects no source code or raw output and keeps the cursor timestamp as text', async () => {
    const { submissions, repository } = repositoryWith([
      {
        public_id: 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5',
        user_id: ownerId,
        problem_id: null,
        kind: SubmissionKind.Run,
        language: 'python',
        source_code_size: 8,
        status: SubmissionStatus.Executed,
        score: null,
        passed_tests: null,
        total_tests: null,
        runtime_ms: 5,
        memory_kb: 300,
        created_at: '2026-10-27T06:00:00.123Z',
        updated_at: '2026-10-27T06:00:01.000Z',
        cursor_created_at: '2026-10-27T06:00:00.123456Z',
      },
    ]);

    const slice = await repository.listByOwner(ownerId, {}, null, 21);

    const [listSql] = submissions.query.mock.calls[1]!;
    expect(listSql).not.toMatch(/"source_code",|stdout|stderr|submission_results/);
    expect(listSql).toContain('LENGTH("source_code")');
    expect(slice.total).toBe(1);
    expect(slice.items[0]).toMatchObject({
      publicId: 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5',
      sourceCodeSize: 8,
      cursorCreatedAt: '2026-10-27T06:00:00.123456Z',
    });
  });
});

describe('TypeormSubmissionRepository Submit verdicts', () => {
  const now = new Date('2026-10-27T03:00:00.000Z');
  const acceptedEvent = {
    eventId: '3d1c8b0e-7b0e-4a0e-9f4f-6b8c2b9f0a01',
    occurredAt: now,
    submissionId: '2a05ca28-eaaa-4e92-863e-f71b33db5040',
    userId: 'a85cb06f-c20a-4400-bae5-c2d3b891d890',
    problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
    score: 100,
  };
  const input: SubmitVerdictPersistenceInput = {
    submissionId: acceptedEvent.submissionId,
    verdict: {
      status: SubmissionStatus.Accepted,
      score: null,
      passedTests: 2,
      totalTests: 2,
      runtimeMs: 7,
      memoryKb: 900,
    },
    stdout: 'ok',
    acceptedEvent,
    now,
  };
  const updatedRow = {
    id: acceptedEvent.submissionId,
    public_id: 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5',
    user_id: acceptedEvent.userId,
    problem_id: acceptedEvent.problemId,
    kind: SubmissionKind.Submit,
    language: 'python',
    source_code: 'print(1)',
    stdin: null,
    status: SubmissionStatus.Accepted,
    created_at: '2026-10-27T02:59:00.000Z',
    updated_at: now,
  };

  function transactionWith(rows: unknown[]) {
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: rows, affected: rows.length }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      insert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;
    const dataSource = {
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    return {
      builder,
      manager,
      repository: new TypeormSubmissionRepository({} as Repository<Submission>, dataSource),
    };
  }

  it('updates only an open Submit and writes the result and outbox row in the same transaction', async () => {
    const { builder, manager, repository } = transactionWith([updatedRow]);

    const applied = await repository.applySubmitVerdictOnce(input);

    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SubmissionStatus.Accepted,
        score: null,
        acceptedEventId: acceptedEvent.eventId,
      }),
    );
    expect(builder.where).toHaveBeenCalledWith(expect.stringMatching(/status IN/), {
      id: input.submissionId,
      kind: SubmissionKind.Submit,
      openStatuses: [SubmissionStatus.Pending, SubmissionStatus.Queued, SubmissionStatus.Running],
    });
    expect(manager.insert).toHaveBeenCalledTimes(2);
    expect(manager.insert).toHaveBeenLastCalledWith(SubmissionAcceptedOutbox, {
      eventId: acceptedEvent.eventId,
      submissionId: acceptedEvent.submissionId,
      payload: { ...acceptedEvent, occurredAt: '2026-10-27T03:00:00.000Z' },
    });
    expect(applied).toMatchObject({ publicId: updatedRow.public_id, stdin: '' });
  });

  it('writes no result or outbox row when the conditional update matched nothing', async () => {
    const { manager, repository } = transactionWith([]);

    await expect(repository.applySubmitVerdictOnce(input)).resolves.toBeNull();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('writes no outbox row for a verdict that is not officially accepted', async () => {
    const { manager, repository } = transactionWith([updatedRow]);

    await repository.applySubmitVerdictOnce({ ...input, acceptedEvent: null });

    expect(manager.insert).toHaveBeenCalledTimes(1);
  });
});

describe('TypeormSubmissionRepository accepted event relay', () => {
  const pending = Object.assign(new SubmissionAcceptedOutbox(), {
    eventId: '3d1c8b0e-7b0e-4a0e-9f4f-6b8c2b9f0a01',
    submissionId: '2a05ca28-eaaa-4e92-863e-f71b33db5040',
    payload: {
      eventId: '3d1c8b0e-7b0e-4a0e-9f4f-6b8c2b9f0a01',
      occurredAt: '2026-10-27T03:00:00.000Z',
      submissionId: '2a05ca28-eaaa-4e92-863e-f71b33db5040',
      userId: 'a85cb06f-c20a-4400-bae5-c2d3b891d890',
      problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
      score: 100,
    },
    publishedAt: null,
  });

  function relayWith(row: SubmissionAcceptedOutbox | null) {
    const manager = {
      findOne: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;
    const dataSource = {
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    return {
      manager,
      repository: new TypeormSubmissionRepository({} as Repository<Submission>, dataSource),
    };
  }

  it('locks the oldest pending row, publishes it, then marks it published', async () => {
    const { manager, repository } = relayWith(pending);
    const publish = jest.fn().mockResolvedValue(undefined);

    await expect(repository.relayOldestPendingAcceptedEvent(publish)).resolves.toBe(true);

    expect(manager.findOne).toHaveBeenCalledWith(
      SubmissionAcceptedOutbox,
      expect.objectContaining({
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      }),
    );
    expect(publish).toHaveBeenCalledWith({
      ...pending.payload,
      occurredAt: new Date('2026-10-27T03:00:00.000Z'),
    });
    expect(manager.update).toHaveBeenCalledWith(
      SubmissionAcceptedOutbox,
      { eventId: pending.eventId },
      { publishedAt: expect.any(Date) as unknown },
    );
  });

  it('leaves the row pending when the broker does not confirm', async () => {
    const { manager, repository } = relayWith(pending);

    await expect(
      repository.relayOldestPendingAcceptedEvent(jest.fn().mockRejectedValue(new Error('nack'))),
    ).rejects.toThrow('nack');
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('reports an empty outbox', async () => {
    const { repository } = relayWith(null);
    const publish = jest.fn();

    await expect(repository.relayOldestPendingAcceptedEvent(publish)).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});
