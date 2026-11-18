import { TopicTagTypeOrmReader } from './topic-tag.typeorm-reader';
import type { TypeOrmTransactionContext } from './typeorm-transaction-context';

const TOPIC_SQL = 'SELECT "id" FROM "topics" WHERE "id" = ANY($1::uuid[])';
const TAG_SQL = 'SELECT "id" FROM "tags" WHERE "id" = ANY($1::uuid[])';

describe('TopicTagTypeOrmReader', () => {
  it('returns the missing topic ids using unique input values', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'a' }]);
    const reader = readerWith(query);

    await expect(reader.findMissingTopicIds(['a', 'b', 'b'])).resolves.toEqual(['b']);
    expect(query).toHaveBeenCalledWith(TOPIC_SQL, [['a', 'b']]);
  });

  it('returns the missing tag ids from the tags table', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const reader = readerWith(query);

    await expect(reader.findMissingTagIds(['a'])).resolves.toEqual(['a']);
    expect(query).toHaveBeenCalledWith(TAG_SQL, [['a']]);
  });

  it('skips the query when no ids are provided', async () => {
    const query = jest.fn();
    const reader = readerWith(query);

    await expect(reader.findMissingTopicIds([])).resolves.toEqual([]);
    await expect(reader.findMissingTagIds([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps topic names by id', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 'a', name: 'Arrays' },
      { id: 'b', name: 'Graphs' },
    ]);
    const reader = readerWith(query);

    await expect(reader.findTopicNames(['a', 'b', 'a'])).resolves.toEqual(
      new Map([
        ['a', 'Arrays'],
        ['b', 'Graphs'],
      ]),
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT "id", "name" FROM "topics" WHERE "id" = ANY($1::uuid[])',
      [['a', 'b']],
    );
  });

  it('maps tag names by id and returns an empty map without a query', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'a', name: 'Beginner' }]);
    const reader = readerWith(query);

    await expect(reader.findTagNames(['a'])).resolves.toEqual(new Map([['a', 'Beginner']]));

    const emptyQuery = jest.fn();
    const emptyReader = readerWith(emptyQuery);

    await expect(emptyReader.findTagNames([])).resolves.toEqual(new Map());
    expect(emptyQuery).not.toHaveBeenCalled();
  });

  it('lists the whole topic catalog ordered by name', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 'b', name: 'Sắp xếp' },
      { id: 'a', name: 'Mảng' },
    ]);
    const reader = readerWith(query);

    await expect(reader.listTopics()).resolves.toEqual([
      { id: 'b', name: 'Sắp xếp' },
      { id: 'a', name: 'Mảng' },
    ]);
    expect(query).toHaveBeenCalledWith('SELECT "id", "name" FROM "topics" ORDER BY "name" ASC');
  });

  it('returns an empty catalog without a query when the table is empty', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const reader = readerWith(query);

    await expect(reader.listTopics()).resolves.toEqual([]);
  });
});

function readerWith(query: jest.Mock): TopicTagTypeOrmReader {
  const context = { getManager: () => ({ query }) };

  return new TopicTagTypeOrmReader(context as unknown as TypeOrmTransactionContext);
}
