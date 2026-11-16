import { randomUUID } from 'node:crypto';

import { toLearnerAttempt } from '@/modules/quizzes/application/results';
import { hashCommand } from '@/modules/quizzes/application/services/command.utils';
import type { QuestionContent, QuestionRevision } from '@/modules/quizzes/domain';
import { Question, Quiz, QuizAttempt, QuizError } from '@/modules/quizzes/domain';
const owner = randomUUID();
function content(): QuestionContent {
  return {
    content: 'Which loop runs at least once?',
    explanation: 'do...while checks the condition after execution.',
    difficulty: 'EASY',
    topicIds: [],
    tagIds: [],
    options: [
      { id: randomUUID(), content: 'while', isCorrect: false },
      { id: randomUUID(), content: 'do...while', isCorrect: true },
    ],
  };
}
function attempt(count = 10): QuizAttempt {
  const questions: QuestionRevision[] = Array.from(
    { length: count },
    () => Question.create(owner, randomUUID(), 'hash', content()).revision,
  );
  return new QuizAttempt(
    {
      id: randomUUID(),
      quizId: randomUUID(),
      quizRevisionId: randomUUID(),
      userId: owner,
      status: 'IN_PROGRESS',
      correctCount: null,
      passed: null,
      totalQuestions: count,
      startedAt: new Date(),
      finishedAt: null,
    },
    questions,
  );
}
describe('Quiz domain and learner disclosure', () => {
  it.each([0, 1, 7])('rejects %i options', (n) => {
    const input = content();
    input.options = Array.from({ length: n }, (_, i) => ({
      id: randomUUID(),
      content: 'choice',
      isCorrect: i === 0,
    }));
    expect(() => Question.create(owner, randomUUID(), 'hash', input)).toThrow(QuizError);
  });
  it.each([0, 2])('requires exactly one correct option: got %i', (n) => {
    const input = content();
    input.options.forEach((o, i) => (o.isCorrect = i < n));
    expect(() => Question.create(owner, randomUUID(), 'hash', input)).toThrow(QuizError);
  });
  it('rejects duplicate ids, empty explanations and executable markup', () => {
    for (const patch of [
      { explanation: '' },
      { content: '<script>alert(1)</script>' },
      {
        options: [
          { ...content().options[0]!, id: owner },
          { ...content().options[1]!, id: owner },
        ],
      },
    ])
      expect(() =>
        Question.create(owner, randomUUID(), 'hash', { ...content(), ...patch }),
      ).toThrow(QuizError);
  });
  it('retains the original immutable revision when revising a question', () => {
    const q = Question.create(owner, randomUUID(), 'hash', content());
    const previous = structuredClone(q.revision);
    q.revise({ ...content(), content: 'new question' });
    expect(q.revision.id).not.toBe(previous.id);
    expect(previous.content).toBe('Which loop runs at least once?');
    expect(q.revision.revision).toBe(2);
  });
  it('requires questions for publish and rejects duplicate roots through different versions', () => {
    const q = Quiz.create(owner, randomUUID(), 'hash', 'Quiz', null);
    expect(() => q.publish()).toThrow();
    expect(() =>
      q.replace([
        { questionId: owner, questionRevisionId: randomUUID() },
        { questionId: owner, questionRevisionId: randomUUID() },
      ]),
    ).toThrow();
  });
  it('forks a new draft instead of changing an already published definition', () => {
    const q = Quiz.create(owner, randomUUID(), 'hash', 'Quiz', null);
    q.replace([{ questionId: owner, questionRevisionId: randomUUID() }]);
    q.publish();
    const published = q.published!;
    q.replace([]);
    expect(q.draft!.id).not.toBe(published.id);
    expect(published.items).toHaveLength(1);
    expect(q.draft!.revision).toBe(2);
  });
  it('enforces lifecycle state before editing or republishing', () => {
    const q = Quiz.create(owner, randomUUID(), 'hash', 'Quiz', null);
    expect(() => q.hold()).toThrow();
    q.replace([{ questionId: owner, questionRevisionId: randomUUID() }]);
    q.publish();
    q.hold();
    expect(() => q.openDraft()).toThrow();
    q.republish();
    q.softDelete();
    expect(() => q.openDraft()).toThrow();
    q.restore();
    expect(q.state.status).toBe('PUBLISHED');
  });
  it('returns first answer feedback and only reveals answered questions', () => {
    const a = attempt(2);
    const first = a.questions[0]!;
    const wrong = first.options.find((o) => !o.isCorrect)!;
    const result = a.answer(first.questionId, wrong.id);
    expect(result.isCorrect).toBe(false);
    expect(a.answer(first.questionId, wrong.id)).toBe(result);
    expect(() => a.answer(first.questionId, first.options.find((o) => o.isCorrect)!.id)).toThrow();
    const view = toLearnerAttempt(a);
    expect(view.questions[0]!.feedback?.explanation).toBe(first.explanation);
    expect(view.questions[1]!.feedback).toBeNull();
    expect(JSON.stringify(view.questions[1])).not.toContain('isCorrect');
    expect(JSON.stringify(view.questions[1])).not.toContain('explanation');
  });
  it('rejects a foreign question/option and incomplete finish', () => {
    const a = attempt(2);
    expect(() => a.answer(randomUUID(), randomUUID())).toThrow();
    expect(() => a.answer(a.questions[0]!.questionId, randomUUID())).toThrow();
    expect(() => a.finish()).toThrow();
    expect(a.answers).toHaveLength(0);
  });
  it.each([
    [10, 8, false],
    [10, 9, true],
    [15, 13, false],
    [15, 14, true],
    [5, 4, false],
    [5, 5, true],
    [20, 17, false],
    [20, 18, true],
  ])('grades %i questions, %i correct, passed=%s without rounding', (n, correct, passed) => {
    const a = attempt(n);
    a.questions.forEach((q, i) =>
      a.answer(q.questionId, q.options.find((o) => o.isCorrect === i < correct)!.id),
    );
    a.finish();
    expect(a.state.passed).toBe(passed);
    expect(a.state.correctCount).toBe(correct);
    const finishedAt = a.state.finishedAt;
    a.finish();
    expect(a.state.finishedAt).toBe(finishedAt);
    const q = a.questions[0]!;
    expect(() => a.answer(q.questionId, a.answers[0]!.selectedOptionId)).not.toThrow();
  });
  it('hashes semantically identical key ordering for creation retries', () => {
    expect(hashCommand({ a: 1, b: { c: 2, d: 3 } })).toBe(hashCommand({ b: { d: 3, c: 2 }, a: 1 }));
  });
});
