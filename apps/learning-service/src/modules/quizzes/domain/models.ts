import { randomUUID } from 'node:crypto';

export interface Principal {
  userId: string;
  roles: readonly string[];
  permissions: readonly string[];
}
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ON_HOLD';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export interface QuestionOption {
  id: string;
  content: string;
  isCorrect: boolean;
}
export interface QuestionContent {
  content: string;
  explanation: string;
  options: QuestionOption[];
  difficulty: Difficulty;
  topicIds: string[];
  tagIds: string[];
}
export interface QuestionRevision extends QuestionContent {
  id: string;
  questionId: string;
  revision: number;
  createdAt: Date;
}
export interface ContentRoot {
  id: string;
  createdBy: string;
  deletedAt: Date | null;
  clientRequestId: string;
  requestHash: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface QuestionState extends ContentRoot {
  currentRevisionId: string;
  isPrivate: boolean;
}
export interface QuizState extends ContentRoot {
  status: QuizStatus;
  publishedRevisionId: string | null;
}
export interface QuizItem {
  questionId: string;
  questionRevisionId: string;
}
export interface QuizRevision {
  id: string;
  quizId: string;
  revision: number;
  title: string;
  description: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  items: QuizItem[];
}
export interface AttemptState {
  id: string;
  userId: string;
  quizId: string;
  quizRevisionId: string;
  status: 'IN_PROGRESS' | 'FINISHED';
  totalQuestions: number;
  correctCount: number | null;
  passed: boolean | null;
  startedAt: Date;
  finishedAt: Date | null;
}
export interface Answer {
  attemptId: string;
  questionId: string;
  questionRevisionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  answeredAt: Date;
}
export interface PageQuery {
  page: number;
  limit: number;
  q?: string;
  difficulty?: Difficulty;
  topicId?: string;
  tagId?: string;
  quizId?: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export class QuizError extends Error {
  constructor(
    readonly code: 'INVALID' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
  }
}
export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new QuizError('INVALID', message);
}
export function validateText(
  value: string,
  max: number,
  field: string,
  allowEmpty = false,
): string {
  requireValue(
    typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0),
    `Invalid ${field}`,
  );
  requireValue(
    !/<\s*\/?\s*(?:script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:|data\s*:\s*text\s*\/\s*html/i.test(
      value,
    ),
    `Unsafe ${field}`,
  );
  return value;
}
export function validateQuestion(input: QuestionContent): void {
  validateText(input.content, 20000, 'content');
  validateText(input.explanation, 20000, 'explanation');
  requireValue(['EASY', 'MEDIUM', 'HARD'].includes(input.difficulty), 'Invalid difficulty');
  requireValue(
    input.options.length >= 2 && input.options.length <= 6,
    'A question requires 2–6 options',
  );
  requireValue(
    new Set(input.options.map((o) => o.id)).size === input.options.length,
    'Duplicate option ids',
  );
  requireValue(
    input.options.filter((o) => o.isCorrect).length === 1,
    'Exactly one correct option is required',
  );
  input.options.forEach((o) => validateText(o.content, 5000, 'option'));
  for (const ids of [input.topicIds, input.tagIds])
    requireValue(ids.length <= 50 && new Set(ids).size === ids.length, 'Invalid taxonomy ids');
}
export class Question {
  constructor(
    readonly state: QuestionState,
    public revision: QuestionRevision,
    readonly sharedWith: string[] = [],
  ) {}
  static create(
    owner: string,
    requestId: string,
    hash: string,
    input: QuestionContent,
    isPrivate = false,
  ): Question {
    validateQuestion(input);
    const id = randomUUID();
    const now = new Date();
    const rev = { ...input, id: randomUUID(), questionId: id, revision: 1, createdAt: now };
    return new Question(
      {
        id,
        createdBy: owner,
        currentRevisionId: rev.id,
        isPrivate,
        deletedAt: null,
        clientRequestId: requestId,
        requestHash: hash,
        createdAt: now,
        updatedAt: now,
      },
      rev,
    );
  }
  softDelete(): void {
    this.state.deletedAt ??= new Date();
    this.state.updatedAt = new Date();
  }
  restore(): void {
    if (!this.state.deletedAt) throw new QuizError('CONFLICT', 'Question is not deleted');
    this.state.deletedAt = null;
    this.state.updatedAt = new Date();
  }
  setPrivate(isPrivate: boolean): void {
    this.state.isPrivate = isPrivate;
    this.state.updatedAt = new Date();
  }
  revise(input: QuestionContent): void {
    validateQuestion(input);
    this.revision = {
      ...input,
      id: randomUUID(),
      questionId: this.state.id,
      revision: this.revision.revision + 1,
      createdAt: new Date(),
    };
    this.state.currentRevisionId = this.revision.id;
    this.state.updatedAt = new Date();
  }
}
export class Quiz {
  constructor(
    readonly state: QuizState,
    public draft: QuizRevision | null,
    public published: QuizRevision | null,
    readonly sharedWith: string[] = [],
  ) {}
  static create(
    owner: string,
    requestId: string,
    hash: string,
    title: string,
    description: string | null,
  ): Quiz {
    validateText(title, 200, 'title');
    if (description !== null) validateText(description, 20000, 'description', true);
    const id = randomUUID();
    const now = new Date();
    return new Quiz(
      {
        id,
        createdBy: owner,
        deletedAt: null,
        clientRequestId: requestId,
        requestHash: hash,
        createdAt: now,
        updatedAt: now,
        status: 'DRAFT',
        publishedRevisionId: null,
      },
      {
        id: randomUUID(),
        quizId: id,
        revision: 1,
        title,
        description,
        publishedAt: null,
        createdAt: now,
        items: [],
      },
      null,
    );
  }
  hold(): void {
    if (this.state.status !== 'PUBLISHED' || this.state.deletedAt)
      throw new QuizError('CONFLICT', 'Quiz is not published');
    this.state.status = 'ON_HOLD';
    this.state.updatedAt = new Date();
  }
  republish(): void {
    if (this.state.status !== 'ON_HOLD' || this.state.deletedAt)
      throw new QuizError('CONFLICT', 'Quiz is not on hold');
    this.state.status = 'PUBLISHED';
    this.state.updatedAt = new Date();
  }
  softDelete(): void {
    this.state.deletedAt ??= new Date();
    this.state.updatedAt = new Date();
  }
  restore(): void {
    if (!this.state.deletedAt) throw new QuizError('CONFLICT', 'Quiz is not deleted');
    this.state.deletedAt = null;
    this.state.updatedAt = new Date();
  }
  openDraft(): QuizRevision {
    if (this.state.deletedAt || this.state.status === 'ON_HOLD')
      throw new QuizError('CONFLICT', 'Quiz is not editable');
    if (!this.draft || this.draft.publishedAt) {
      const source = this.draft ?? this.published;
      requireValue(source, 'Missing published revision');
      this.draft = {
        ...source,
        id: randomUUID(),
        revision: source.revision + 1,
        publishedAt: null,
        createdAt: new Date(),
        items: source.items.map((x) => ({ ...x })),
      };
    }
    return this.draft;
  }
  replace(items: QuizItem[]): void {
    requireValue(
      items.length <= 50 && new Set(items.map((x) => x.questionId)).size === items.length,
      'Duplicate questions or too many questions',
    );
    this.openDraft().items = items;
    this.state.updatedAt = new Date();
  }
  publish(): void {
    if (
      this.state.deletedAt ||
      this.state.status === 'ON_HOLD' ||
      !this.draft ||
      this.draft.publishedAt
    )
      throw new QuizError('CONFLICT', 'No editable draft');
    const draft = this.draft;
    requireValue(draft.items.length > 0, 'At least one question is required');
    draft.publishedAt = new Date();
    this.published = draft;
    this.draft = null;
    this.state.publishedRevisionId = draft.id;
    this.state.status = 'PUBLISHED';
    this.state.updatedAt = new Date();
  }
}
export class QuizAttempt {
  constructor(
    readonly state: AttemptState,
    readonly questions: QuestionRevision[],
    readonly answers: Answer[] = [],
  ) {
    requireValue(
      questions.length > 0 &&
        questions.length <= 50 &&
        state.totalQuestions === questions.length &&
        new Set(questions.map((q) => q.questionId)).size === questions.length,
      'Invalid attempt definition',
    );
  }
  answer(questionId: string, optionId: string): Answer {
    const old = this.answers.find((a) => a.questionId === questionId);
    if (old) {
      if (old.selectedOptionId !== optionId)
        throw new QuizError('CONFLICT', 'Answer is already locked');
      return old;
    }
    if (this.state.status !== 'IN_PROGRESS') throw new QuizError('CONFLICT', 'Attempt is finished');
    const question = this.questions.find((q) => q.questionId === questionId);
    const option = question?.options.find((o) => o.id === optionId);
    requireValue(question && option, 'Question or option does not belong to this attempt');
    const answer = {
      attemptId: this.state.id,
      questionId,
      questionRevisionId: question.id,
      selectedOptionId: optionId,
      isCorrect: option.isCorrect,
      answeredAt: new Date(),
    };
    this.answers.push(answer);
    return answer;
  }
  finish(): void {
    if (this.state.status === 'FINISHED') return;
    if (this.answers.length !== this.state.totalQuestions)
      throw new QuizError('CONFLICT', 'Answer every question before finishing');
    this.state.correctCount = this.answers.filter((a) => a.isCorrect).length;
    this.state.passed = this.state.correctCount * 100 >= this.state.totalQuestions * 90;
    this.state.status = 'FINISHED';
    this.state.finishedAt = new Date();
  }
}
