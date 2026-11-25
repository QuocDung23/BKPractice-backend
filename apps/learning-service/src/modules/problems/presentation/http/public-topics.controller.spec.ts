import { createValidationPipe } from '@app/common';
import type { TopicCatalogEntry } from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';

import { ListTopicsQueryDto } from './dto/list-topics-query.dto';
import { PublicTopicsController } from './public-topics.controller';

const catalog: TopicCatalogEntry[] = [
  { id: 'topic-1', name: 'Mảng' },
  { id: 'topic-2', name: 'Sắp xếp' },
];

describe('PublicTopicsController', () => {
  it('returns the topic catalog as items', async () => {
    const listTopics = { execute: jest.fn().mockResolvedValue(catalog) };
    const controller = createController({ listTopics });

    await expect(controller.list(new ListTopicsQueryDto())).resolves.toEqual({ items: catalog });
    expect(listTopics.execute).toHaveBeenCalledTimes(1);
  });

  it('returns an empty items array when the catalog is empty', async () => {
    const listTopics = { execute: jest.fn().mockResolvedValue([]) };
    const controller = createController({ listTopics });

    await expect(controller.list(new ListTopicsQueryDto())).resolves.toEqual({ items: [] });
  });

  it('returns the tag catalog when asked for tags', async () => {
    const tags = [{ id: 'tag-1', name: 'Cơ bản' }];
    const listTopics = { execute: jest.fn().mockResolvedValue(tags) };
    const controller = createController({ listTopics });

    await expect(controller.listTags(new ListTopicsQueryDto())).resolves.toEqual({ items: tags });
    expect(listTopics.execute).toHaveBeenCalledWith('tags');
  });

  it('rejects query parameters through the global validation pipe', async () => {
    const listTopics = { execute: jest.fn() };
    createController({ listTopics });
    const pipe = createValidationPipe();

    await expect(
      pipe.transform(
        { unsupported: '1' },
        { type: 'query', metatype: ListTopicsQueryDto, data: undefined },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(listTopics.execute).not.toHaveBeenCalled();
  });

  it('accepts an empty query object', async () => {
    const pipe = createValidationPipe();

    await expect(
      pipe.transform({}, { type: 'query', metatype: ListTopicsQueryDto, data: undefined }),
    ).resolves.toBeInstanceOf(ListTopicsQueryDto);
  });
});

function createController(dependencies: {
  listTopics?: { execute: jest.Mock };
}): PublicTopicsController {
  const { listTopics = { execute: jest.fn() } } = dependencies;

  return new PublicTopicsController(listTopics);
}
