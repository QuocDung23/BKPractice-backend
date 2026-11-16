import { createHash, randomUUID } from 'node:crypto';

import type { QuestionInput } from '@/modules/quizzes/application/commands';
import type { QuestionContent } from '@/modules/quizzes/domain';
export function hashCommand(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}
export function toQuestionContent(input: QuestionInput): QuestionContent {
  return {
    content: input.content,
    explanation: input.explanation,
    options: input.options.map((o) => ({
      id: o.id ?? randomUUID(),
      content: o.content,
      isCorrect: o.isCorrect,
    })),
    difficulty: input.difficulty,
    topicIds: input.topicIds,
    tagIds: input.tagIds,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}
