import type { TopicTagReader } from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';

import { ListTopicsUseCase } from './list-topics.use-case';

function createReader(overrides: Partial<TopicTagReader> = {}): TopicTagReader {
  return {
    findMissingTopicIds: jest.fn(),
    findMissingTagIds: jest.fn(),
    findTopicNames: jest.fn(),
    findTagNames: jest.fn(),
    listTopics: jest.fn(),
    ...overrides,
  };
}

describe('ListTopicsUseCase', () => {
  it('returns the whole catalog from the reader', async () => {
    const catalog = [
      { id: 'topic-1', name: 'Mảng' },
      { id: 'topic-2', name: 'Sắp xếp' },
    ];
    const listTopics = jest.fn().mockResolvedValue(catalog);
    const useCase = new ListTopicsUseCase(createReader({ listTopics }));

    await expect(useCase.execute()).resolves.toBe(catalog);
    expect(listTopics).toHaveBeenCalledTimes(1);
  });

  it('returns an empty catalog without inventing entries', async () => {
    const listTopics = jest.fn().mockResolvedValue([]);
    const useCase = new ListTopicsUseCase(createReader({ listTopics }));

    await expect(useCase.execute()).resolves.toEqual([]);
  });

  it('propagates a reader failure instead of returning a partial catalog', async () => {
    const failure = new Error('database unavailable');
    const listTopics = jest.fn().mockRejectedValue(failure);
    const useCase = new ListTopicsUseCase(createReader({ listTopics }));

    await expect(useCase.execute()).rejects.toBe(failure);
  });
});
