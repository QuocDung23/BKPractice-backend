import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { Lrn009QuizQuestionBank1700000011000 } from '@learning/database/migrations/1700000011000-Lrn009QuizQuestionBank';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { ManagedCourseResult } from '@/modules/courses/application/results';
import { CoursesModule } from '@/modules/courses/courses.module';
import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
  upsertProblem,
} from '@/modules/courses/testing';
import { ShareRecipientReader } from '@/modules/quizzes/application/ports/out';
import type {
  toFeedback,
  toLearnerAttempt,
  toManagedQuestion,
  toManagedQuiz,
  toSummary,
} from '@/modules/quizzes/application/results';
import { AnswerQuizQuestionUseCase } from '@/modules/quizzes/application/use-cases/answer-quiz-question.use-case';
import { QuizError } from '@/modules/quizzes/domain';
import { AttemptTypeOrmRepository } from '@/modules/quizzes/infrastructure/persistence';
import { QuizTransactionContext } from '@/modules/quizzes/infrastructure/persistence/quiz-transaction.context';

type QuestionView = ReturnType<typeof toManagedQuestion>;
type QuizView = ReturnType<typeof toManagedQuiz>;
type AttemptView = ReturnType<typeof toLearnerAttempt>;
const owner = randomUUID(),
  other = randomUUID(),
  problemId = randomUUID();
const permissions = [
  ...['question', 'quiz'].flatMap((k) =>
    [
      'create',
      'read-managed',
      'update',
      'share',
      'clone',
      'delete',
      'restore',
      'publish',
      'hold',
      'republish',
    ].map((a) => `${k}:${a}`),
  ),
  ...['create', 'read-managed', 'update', 'publish', 'hold', 'republish', 'delete', 'restore'].map(
    (a) => `course:${a}`,
  ),
];
function headers(id: string = owner, role = 'LECTURER'): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-auth-user-id': id,
    'x-auth-roles': role,
    'x-auth-permissions': role === 'STUDENT' ? '' : permissions.join(','),
  };
}
function idempotencyHeaders(id: string = owner, role = 'LECTURER', key = randomUUID()) {
  return { ...headers(id, role), 'idempotency-key': key };
}
function input() {
  return {
    content: 'Which loop runs at least once?',
    explanation: 'do...while checks the condition after execution.',
    difficulty: 'EASY',
    options: [
      { content: 'while', isCorrect: false },
      { content: 'do...while', isCorrect: true },
    ],
    topicIds: [],
    tagIds: [],
  };
}
assertTestDatabase();
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;
describeIntegration('LRN-009 full flow and persistence (isolated PostgreSQL)', () => {
  let app: NestExpressApplication;
  let source: DataSource;
  let base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({ INTERNAL_SERVICE_SECRET: 'test-only-internal-credential-32-characters' }),
          ],
        }),
        TypeOrmModule.forRoot({
          ...learningDataSourceOptions(),
          migrationsRun: true,
          extra: { max: 1 },
        }),
        CoursesModule,
      ],
    })
      .overrideProvider(ShareRecipientReader)
      .useValue({
        requireLecturer: async (id: string) => {
          if (!(owner === id || other === id))
            throw new QuizError('INVALID', 'Recipient must be a LECTURER');
        },
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    source = app.get(DataSource);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await upsertProblem(source, {
      id: problemId,
      slug: `quiz-fixture-${problemId}`,
      createdBy: owner,
    });
  }, 30000);
  afterAll(async () => {
    await app?.close();
  });
  async function call<T = unknown>(method: string, path: string, body?: unknown, auth = headers()) {
    const res = await fetch(base + path, {
      method,
      headers: auth,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    return { status: res.status, body: parsed as T };
  }
  async function createQuestion() {
    const r = await call<QuestionView>(
      'POST',
      '/api/question-bank/questions',
      { ...input(), isPrivate: true },
      idempotencyHeaders(),
    );
    expect(r.status).toBe(201);
    return r.body;
  }
  async function createQuiz(questions: QuestionView[]) {
    let r = await call<QuizView>('POST', '/api/quizzes', { title: 'Loops' }, idempotencyHeaders());
    expect(r.status).toBe(201);
    r = await call<QuizView>('PUT', `/api/quizzes/${r.body.id}/draft/questions`, {
      items: questions.map((q) => ({ questionId: q.id, revisionId: q.revision.id })),
    });
    expect(r.status).toBe(200);
    const published = await call<QuizView>('POST', `/api/quizzes/${r.body.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.draft).toBeNull();
    expect(published.body.published?.items).toHaveLength(questions.length);
    expect((await call('POST', `/api/quizzes/${r.body.id}/publish`)).status).toBe(409);
    return published.body;
  }
  async function attachCourse(quiz: QuizView, id = owner) {
    const c = await call<ManagedCourseResult>(
      'POST',
      '/api/courses',
      { title: 'Quiz course', slug: `quiz-${randomUUID()}` },
      headers(id),
    );
    expect(c.status).toBe(201);
    const ch = await call<ManagedCourseResult>(
      'POST',
      `/api/courses/${c.body.id}/chapters`,
      { title: 'Loops' },
      headers(id),
    );
    expect(ch.status).toBe(201);
    const chapterId = ch.body.chapters[0]!.id;
    expect(
      (
        await call(
          'POST',
          `/api/courses/${c.body.id}/chapters/${chapterId}/problems`,
          { problemId },
          headers(id),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          'POST',
          `/api/courses/${c.body.id}/chapters/${chapterId}/quizzes`,
          { quizId: quiz.id },
          headers(id),
        )
      ).status,
    ).toBe(201);
    expect(
      (await call('POST', `/api/courses/${c.body.id}/publish`, undefined, headers(id))).status,
    ).toBe(200);
    return { courseId: c.body.id, chapterId };
  }
  async function fixture() {
    const questions = await Promise.all([createQuestion(), createQuestion()]);
    const quiz = await createQuiz(questions);
    const course = await attachCourse(quiz);
    return { questions, quiz, ...course };
  }
  async function start(quizId: string, user = randomUUID()) {
    const auth = headers(user, 'STUDENT');
    const a = await call<AttemptView>('POST', `/api/quizzes/${quizId}/attempts`, undefined, auth);
    expect(a.status).toBe(201);
    expect(
      (await call('POST', `/api/quiz-attempts/${a.body.id}/finish`, { score: 100 }, auth)).status,
    ).toBe(400);
    return { attempt: a.body, auth, user };
  }
  it('protects draft/private resources and scopes management to owner or ADMIN', async () => {
    const q = await createQuestion();
    expect(
      (await call('GET', `/api/question-bank/questions/${q.id}`, undefined, headers(other))).status,
    ).toBe(404);
    expect(
      (
        await call(
          'GET',
          `/api/question-bank/questions/${q.id}`,
          undefined,
          headers(randomUUID(), 'STUDENT'),
        )
      ).status,
    ).toBe(403);
    const { content, explanation, difficulty, options, topicIds, tagIds } = input();
    const questionContent = { content, explanation, difficulty, options, topicIds, tagIds };
    expect(
      (
        await call(
          'POST',
          `/api/question-bank/questions/${q.id}/revisions`,
          questionContent,
          headers(other),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/api/question-bank/questions/${q.id}/revisions`,
          questionContent,
          headers(other, 'ADMIN'),
        )
      ).status,
    ).toBe(201);
    const privateQuiz = await call<QuizView>(
      'POST',
      '/api/quizzes',
      { title: 'Private' },
      idempotencyHeaders(),
    );
    expect(
      (
        await call(
          'GET',
          `/api/quizzes/${privateQuiz.body.id}`,
          undefined,
          headers(randomUUID(), 'STUDENT'),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call('GET', '/api/question-bank/questions', undefined, {
          'content-type': 'application/json',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          'POST',
          '/api/question-bank/questions',
          { ...input(), createdBy: other },
          idempotencyHeaders(),
        )
      ).status,
    ).toBe(400);
  });
  it('replays creates and rejects another payload with the same request id', async () => {
    const command = input();
    const key = randomUUID();
    const requestHeaders = idempotencyHeaders(owner, 'LECTURER', key);
    const first = await call<QuestionView>(
      'POST',
      '/api/question-bank/questions',
      command,
      requestHeaders,
    );
    const replay = await call<QuestionView>(
      'POST',
      '/api/question-bank/questions',
      { ...command },
      requestHeaders,
    );
    expect(replay.body.id).toBe(first.body.id);
    expect(
      (
        await call(
          'POST',
          '/api/question-bank/questions',
          { ...command, content: 'different' },
          requestHeaders,
        )
      ).status,
    ).toBe(409);
    const rows = await source.query<{ count: string }[]>(
      'SELECT count(*) FROM quiz_bank_questions WHERE client_request_id=$1',
      [key],
    );
    expect(rows[0]!.count).toBe('1');
  });
  it('shares for use/clone without editing and revokes new use without changing copies', async () => {
    const q = await createQuestion();
    expect(
      (
        await call('PUT', `/api/question-bank/questions/${q.id}/shares`, {
          userId: other,
          enabled: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('GET', `/api/question-bank/questions/${q.id}`, undefined, headers(other))).status,
    ).toBe(200);
    expect(
      (await call<QuestionView>('GET', `/api/question-bank/questions/${q.id}`)).body.sharedWith,
    ).toContain(other);
    expect(
      (
        await call<QuestionView>(
          'GET',
          `/api/question-bank/questions/${q.id}`,
          undefined,
          headers(other),
        )
      ).body.sharedWith,
    ).toBeNull();
    const cloned = await call<QuestionView>(
      'POST',
      `/api/question-bank/questions/${q.id}/clone`,
      undefined,
      idempotencyHeaders(other),
    );
    expect(cloned.status).toBe(201);
    expect(cloned.body.createdBy).toBe(other);
    expect(cloned.body.id).not.toBe(q.id);
    const draft = await call<QuizView>(
      'POST',
      '/api/quizzes',
      { title: 'Shared draft' },
      idempotencyHeaders(other),
    );
    expect(
      (
        await call(
          'PUT',
          `/api/quizzes/${draft.body.id}/draft/questions`,
          { items: [{ questionId: q.id, revisionId: q.revision.id }] },
          headers(other),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call('PUT', `/api/question-bank/questions/${q.id}/shares`, {
          userId: other,
          enabled: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('POST', `/api/quizzes/${draft.body.id}/publish`, undefined, headers(other)))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          `/api/question-bank/questions/${q.id}/clone`,
          undefined,
          idempotencyHeaders(other),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          'GET',
          `/api/question-bank/questions/${cloned.body.id}`,
          undefined,
          headers(other),
        )
      ).status,
    ).toBe(200);
  });
  it('allows one shared Quiz in multiple Courses and deep clones its selected question revisions', async () => {
    const f = await fixture();
    expect(
      (await call('PUT', `/api/quizzes/${f.quiz.id}/shares`, { userId: other, enabled: true }))
        .status,
    ).toBe(200);
    const second = await attachCourse(f.quiz, other);
    const view = await call<ManagedCourseResult>(
      'GET',
      `/api/courses/${second.courseId}`,
      undefined,
      headers(randomUUID(), 'STUDENT'),
    );
    expect(view.body.chapters[0]!.quizzes).toEqual([{ id: f.quiz.id, title: 'Loops' }]);
    const copy = await call<QuizView>(
      'POST',
      `/api/quizzes/${f.quiz.id}/clone`,
      undefined,
      idempotencyHeaders(other),
    );
    expect(copy.status).toBe(201);
    expect(copy.body.createdBy).toBe(other);
    expect(
      copy.body.draft!.items.every((item) => !f.questions.some((q) => q.id === item.questionId)),
    ).toBe(true);
    expect(
      (await call('PUT', `/api/quizzes/${f.quiz.id}/shares`, { userId: other, enabled: false }))
        .status,
    ).toBe(200);
    expect(
      (await call('POST', `/api/quizzes/${f.quiz.id}/clone`, undefined, idempotencyHeaders(other)))
        .status,
    ).toBe(404);
    expect(
      (await call('GET', `/api/quizzes/managed/${copy.body.id}`, undefined, headers(other))).status,
    ).toBe(200);
    expect(
      (
        await call(
          'DELETE',
          `/api/courses/${second.courseId}/chapters/${second.chapterId}/quizzes/${f.quiz.id}`,
          undefined,
          headers(other),
        )
      ).status,
    ).toBe(204);
    expect(
      (await call('GET', `/api/quizzes/${f.quiz.id}`, undefined, headers(randomUUID(), 'STUDENT')))
        .status,
    ).toBe(200);
  });
  it('reveals only the submitted question, locks first answers and finalizes idempotently', async () => {
    const f = await fixture();
    const { attempt: a, auth, user } = await start(f.quiz.id);
    const replay = await call<AttemptView>(
      'POST',
      `/api/quizzes/${f.quiz.id}/attempts`,
      undefined,
      auth,
    );
    expect(replay.body.id).toBe(a.id);
    expect(JSON.stringify(a)).not.toContain('isCorrect');
    expect(JSON.stringify(a)).not.toContain('explanation');
    expect(
      (await call('GET', `/api/quiz-attempts/${a.id}`, undefined, headers(owner, 'ADMIN'))).status,
    ).toBe(404);
    expect((await call('POST', `/api/quiz-attempts/${a.id}/finish`, undefined, auth)).status).toBe(
      409,
    );
    const q = f.questions[0];
    const option = q.revision.options.find((o) => o.isCorrect)!.id;
    const feedback = await call<ReturnType<typeof toFeedback>>(
      'PUT',
      `/api/quiz-attempts/${a.id}/answers/${q.id}`,
      { selectedOptionId: option },
      auth,
    );
    expect(feedback.status).toBe(200);
    expect(feedback.body.isCorrect).toBe(true);
    expect(feedback.body.explanation).toBe(q.revision.explanation);
    const resumed = await call<AttemptView>('GET', `/api/quiz-attempts/${a.id}`, undefined, auth);
    expect(resumed.body.questions[0]!.feedback).not.toBeNull();
    expect(resumed.body.questions[1]!.feedback).toBeNull();
    const opposite = q.revision.options.find((o) => !o.isCorrect)!.id;
    expect(
      (
        await call(
          'PUT',
          `/api/quiz-attempts/${a.id}/answers/${q.id}`,
          { selectedOptionId: opposite },
          auth,
        )
      ).status,
    ).toBe(409);
    const next = f.questions[1];
    await call(
      'PUT',
      `/api/quiz-attempts/${a.id}/answers/${next.id}`,
      { selectedOptionId: next.revision.options.find((o) => o.isCorrect)!.id },
      auth,
    );
    const finished = await call<ReturnType<typeof toSummary>>(
      'POST',
      `/api/quiz-attempts/${a.id}/finish`,
      undefined,
      auth,
    );
    expect(finished.body.passed).toBe(true);
    expect(finished.body.percentage).toBe(100);
    expect((await call('POST', `/api/quiz-attempts/${a.id}/finish`, undefined, auth)).body).toEqual(
      finished.body,
    );
    expect(
      (
        await call(
          'PUT',
          `/api/quiz-attempts/${a.id}/answers/${q.id}`,
          { selectedOptionId: option },
          auth,
        )
      ).body,
    ).toEqual(feedback.body);
    const completion = await call<{ completed: boolean }>(
      'GET',
      `/api/quizzes/${f.quiz.id}/completion/me`,
      undefined,
      headers(user, 'STUDENT'),
    );
    expect(completion.body.completed).toBe(true);
  });
  it('pins old definitions across edits and permits old attempts after hiding Quiz', async () => {
    const f = await fixture();
    const old = await start(f.quiz.id);
    const original = f.questions[0];
    const { content, explanation, difficulty, options, topicIds, tagIds } = input();
    const changed = { content, explanation, difficulty, options, topicIds, tagIds };
    changed.content = 'Updated question';
    const revision = await call<QuestionView>(
      'POST',
      `/api/question-bank/questions/${original.id}/revisions`,
      changed,
    );
    expect(revision.status).toBe(201);
    await call('PATCH', `/api/quizzes/${f.quiz.id}/draft`, { title: 'New version' });
    await call('PUT', `/api/quizzes/${f.quiz.id}/draft/questions`, {
      items: [{ questionId: original.id, revisionId: revision.body.revision.id }],
    });
    expect((await call('POST', `/api/quizzes/${f.quiz.id}/publish`)).status).toBe(200);
    const resumed = await call<AttemptView>(
      'GET',
      `/api/quiz-attempts/${old.attempt.id}`,
      undefined,
      old.auth,
    );
    expect(resumed.body.questions[0]!.content).toBe(original.revision.content);
    expect(resumed.body.totalQuestions).toBe(2);
    await call('POST', `/api/quizzes/${f.quiz.id}/hold`);
    expect(
      (
        await call(
          'POST',
          `/api/quizzes/${f.quiz.id}/attempts`,
          undefined,
          headers(randomUUID(), 'STUDENT'),
        )
      ).status,
    ).toBe(404);
    for (const q of f.questions)
      expect(
        (
          await call(
            'PUT',
            `/api/quiz-attempts/${old.attempt.id}/answers/${q.id}`,
            { selectedOptionId: q.revision.options.find((o) => o.isCorrect)!.id },
            old.auth,
          )
        ).status,
      ).toBe(200);
    expect(
      (
        await call<{ passed: boolean }>(
          'POST',
          `/api/quiz-attempts/${old.attempt.id}/finish`,
          undefined,
          old.auth,
        )
      ).body.passed,
    ).toBe(true);
  });
  it('serializes concurrent answers/finish and rolls back data before failed feedback', async () => {
    const f = await fixture();
    const { attempt: a, auth } = await start(f.quiz.id);
    const q = f.questions[0];
    const body = { selectedOptionId: q.revision.options.find((o) => o.isCorrect)!.id };
    const answers = await Promise.all([
      call('PUT', `/api/quiz-attempts/${a.id}/answers/${q.id}`, body, auth),
      call('PUT', `/api/quiz-attempts/${a.id}/answers/${q.id}`, body, auth),
    ]);
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    expect(
      (
        await source.query<{ count: string }[]>(
          'SELECT count(*) FROM quiz_attempt_answers WHERE attempt_id=$1 AND question_id=$2',
          [a.id, q.id],
        )
      )[0]!.count,
    ).toBe('1');
    const repo = app.get(AttemptTypeOrmRepository);
    const save = repo.save.bind(repo);
    const failure = jest.spyOn(repo, 'save').mockImplementationOnce(async (attempt) => {
      await save(attempt);
      throw new Error('private-sentinel-answer');
    });
    const next = f.questions[1];
    const nextBody = { selectedOptionId: next.revision.options.find((o) => o.isCorrect)!.id };
    const failed = await call(
      'PUT',
      `/api/quiz-attempts/${a.id}/answers/${next.id}`,
      nextBody,
      auth,
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain('private-sentinel');
    failure.mockRestore();
    expect(
      (
        await source.query<{ count: string }[]>(
          'SELECT count(*) FROM quiz_attempt_answers WHERE attempt_id=$1 AND question_id=$2',
          [a.id, next.id],
        )
      )[0]!.count,
    ).toBe('0');
    const race = await Promise.all([
      call('PUT', `/api/quiz-attempts/${a.id}/answers/${next.id}`, nextBody, auth),
      call('POST', `/api/quiz-attempts/${a.id}/finish`, undefined, auth),
    ]);
    expect(race[0].status).toBe(200);
    expect([200, 409]).toContain(race[1].status);
    const result = await call<{ passed: boolean }>(
      'POST',
      `/api/quiz-attempts/${a.id}/finish`,
      undefined,
      auth,
    );
    expect(result.body.passed).toBe(true);
  });
  it('reports source updates without upgrading pinned versions and hides revoked draft content', async () => {
    const q = await createQuestion();
    await call('PUT', `/api/question-bank/questions/${q.id}/shares`, {
      userId: other,
      enabled: true,
    });
    const draft = await call<QuizView>(
      'POST',
      '/api/quizzes',
      { title: 'Preview updates' },
      idempotencyHeaders(other),
    );
    await call(
      'PUT',
      `/api/quizzes/${draft.body.id}/draft/questions`,
      { items: [{ questionId: q.id, revisionId: q.revision.id }] },
      headers(other),
    );
    const revised = await call<QuestionView>(
      'POST',
      `/api/question-bank/questions/${q.id}/revisions`,
      {
        content: 'New text',
        explanation: 'New explanation',
        difficulty: 'EASY',
        options: input().options,
      },
    );
    const preview = await call<{
      questions: QuestionView['revision'][];
      questionUpdates: { selectedRevisionId: string; currentRevisionId: string | null }[];
      readiness: { ready: boolean };
    }>('POST', `/api/quizzes/${draft.body.id}/preview`, undefined, headers(other));
    expect(preview.body.questionUpdates[0]).toMatchObject({
      selectedRevisionId: q.revision.id,
      currentRevisionId: revised.body.revision.id,
    });
    expect(preview.body.questions[0]!.id).toBe(q.revision.id);
    await call('PUT', `/api/question-bank/questions/${q.id}/shares`, {
      userId: other,
      enabled: false,
    });
    const denied = await call<typeof preview.body>(
      'POST',
      `/api/quizzes/${draft.body.id}/preview`,
      undefined,
      headers(other),
    );
    expect(denied.body.readiness.ready).toBe(false);
    expect(denied.body.questions).toEqual([]);
    expect(denied.body.questionUpdates[0]!.currentRevisionId).toBeNull();
  });
  it('scopes and filters before pagination and reads Quiz/attempt lists in full', async () => {
    const marker = randomUUID();
    const q = await call<QuestionView>(
      'POST',
      '/api/question-bank/questions',
      { ...input(), content: marker },
      idempotencyHeaders(),
    );
    const path = '/api/question-bank/questions?q=' + marker + '&limit=1';
    const empty = await call<{ total: number; items: unknown[] }>(
      'GET',
      path,
      undefined,
      headers(other),
    );
    expect(empty.body).toMatchObject({ total: 0, items: [] });
    const own = await call<typeof empty.body>('GET', path + '&difficulty=EASY');
    expect(own.body.total).toBe(1);
    expect(own.body.items).toHaveLength(1);
    expect((await call('GET', path + '&limit=101')).status).toBe(400);
    await call('PUT', `/api/question-bank/questions/${q.body.id}/shares`, {
      userId: other,
      enabled: true,
    });
    expect((await call<typeof empty.body>('GET', path, undefined, headers(other))).body.total).toBe(
      1,
    );
    const quiz = await createQuiz([q.body]);
    await attachCourse(quiz);
    const { attempt, auth } = await start(quiz.id);
    const managed = await call<{ items: QuizView[] }>('GET', '/api/quizzes/managed');
    expect(managed.body.items.find((i) => i.id === quiz.id)?.published?.items).toHaveLength(1);
    const history = await call<{ total: number; items: AttemptView[] }>(
      'GET',
      '/api/quiz-attempts/me?quizId=' + quiz.id,
      undefined,
      auth,
    );
    expect(history.body.total).toBe(1);
    expect(history.body.items[0]!.id).toBe(attempt.id);
    expect(history.body.items[0]!.questions[0]!.feedback).toBeNull();
  });
  it('preserves ordered Quiz links when Course Problem content is saved', async () => {
    const f = await fixture();
    const next = await createQuiz([f.questions[0]]);
    const path = `/api/courses/${f.courseId}/chapters/${f.chapterId}/quizzes`;
    expect((await call('POST', path, { quizId: next.id })).status).toBe(201);
    expect((await call('POST', path, { quizId: next.id })).status).toBe(400);
    expect((await call('PUT', path + '/order', { ids: [f.quiz.id] })).status).toBe(400);
    expect((await call('PUT', path + '/order', { ids: [next.id, f.quiz.id] })).status).toBe(200);
    await call('PATCH', `/api/courses/${f.courseId}`, { title: 'New Course title' });
    const read = await call<ManagedCourseResult>('GET', `/api/courses/managed/${f.courseId}`);
    expect(read.body.chapters[0]!.quizzes?.map((q) => q.id)).toEqual([next.id, f.quiz.id]);
    expect(read.body.chapters[0]!.problems).toHaveLength(1);
    expect((await call('POST', path, { quizId: next.id }, headers(other))).status).toBe(403);
    await call('POST', `/api/quizzes/${next.id}/hold`);
    const learner = await call<ManagedCourseResult>('GET', `/api/courses/${f.courseId}`);
    expect(learner.body.chapters[0]!.quizzes?.map((q) => q.id)).toEqual([f.quiz.id]);
  });
  it('documents management projections separately from unanswered learner questions', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Quiz contract').build(),
    );
    const schemas = document.components?.schemas ?? {};
    expect(schemas.ManagedQuestionDto).toBeDefined();
    expect(schemas.QuizPreviewDto).toBeDefined();
    expect(JSON.stringify(schemas.LearnerOptionDto)).not.toContain('isCorrect');
    expect(JSON.stringify(schemas.LearnerQuestionDto)).not.toContain('explanation');
    expect(JSON.stringify(schemas.ManagedOptionDto)).toContain('isCorrect');
    expect(JSON.stringify(schemas.CreateQuestionDto)).not.toContain('clientRequestId');
    expect(document.paths['/api/question-bank/questions']?.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
      ]),
    );
    expect(JSON.stringify(schemas.CreateQuizDto)).not.toContain('clientRequestId');
    expect(document.paths['/api/quizzes']?.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
      ]),
    );
    expect(document.paths['/api/quizzes/{id}/publish']?.post?.responses['200']).toBeDefined();
  });
  it('waits on an actual PostgreSQL root lock and permits only one competing first choice', async () => {
    const f = await fixture();
    const a = await start(f.quiz.id);
    const parallel = await new DataSource(
      learningDataSourceOptions({ extra: { max: 2, application_name: 'lrn009-lock-test' } }),
    ).initialize();
    const blocker = parallel.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let competing: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query('SELECT id FROM quiz_attempts WHERE id=$1 FOR UPDATE', [a.attempt.id]);
      const context = new QuizTransactionContext(parallel);
      const answer = new AnswerQuizQuestionUseCase(new AttemptTypeOrmRepository(context), context);
      const q = f.questions[0];
      const principal = { userId: a.user, roles: ['STUDENT'], permissions: [] };
      competing = Promise.allSettled(
        q.revision.options.map((option) =>
          answer.execute(principal, a.attempt.id, q.id, option.id),
        ),
      );
      let waiting = false;
      for (let poll = 0; poll < 100; poll++) {
        const rows = await source.query<{ waiting: boolean }[]>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='lrn009-lock-test' AND wait_event_type='Lock') AS waiting",
        );
        if (rows[0]?.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.commitTransaction();
      const results = await competing;
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected && 'reason' in rejected ? (rejected.reason as unknown) : null).toMatchObject({
        code: 'CONFLICT',
      });
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await competing;
      await parallel.destroy();
    }
  });
  it('enforces composite revision ownership and restricts deletion of retained content in PostgreSQL', async () => {
    const f = await fixture();
    await expect(
      source.query(
        'INSERT INTO quiz_revision_questions(id,quiz_revision_id,question_id,question_revision_id,display_order) VALUES($1,$2,$3,$4,10)',
        [randomUUID(), f.quiz.published!.id, f.questions[0].id, f.questions[1].revision.id],
      ),
    ).rejects.toThrow();
    await expect(
      source.query('DELETE FROM quiz_bank_questions WHERE id=$1', [f.questions[0].id]),
    ).rejects.toThrow();
    expect(
      (await call<QuestionView>('GET', `/api/question-bank/questions/${f.questions[0].id}`)).body
        .revision.id,
    ).toBe(f.questions[0].revision.id);
  });
  it('verifies Learning migration down/up transactionally without losing existing fixtures', async () => {
    const runner = source.createQueryRunner();
    const query = <T>(sql: string, params?: unknown[]): Promise<T> =>
      runner.query(sql, params) as Promise<T>;
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new Lrn009QuizQuestionBank1700000011000();
      await migration.down(runner);
      await migration.up(runner);
      expect(
        (await query<{ count: string }[]>('SELECT count(*) FROM quiz_attempts'))[0]!.count,
      ).toBe('0');
      expect(
        (await query<{ id: string }[]>('SELECT id FROM problems WHERE id=$1', [problemId]))[0]!.id,
      ).toBe(problemId);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
