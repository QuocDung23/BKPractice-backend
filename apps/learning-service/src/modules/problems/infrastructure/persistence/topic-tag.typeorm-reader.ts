import type {
  TopicCatalogEntry,
  TopicTagReader,
} from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';
import { Injectable } from '@nestjs/common';

import { TypeOrmTransactionContext } from './typeorm-transaction-context';

interface IdRow {
  id: string;
}

interface NameRow extends IdRow {
  name: string;
}

@Injectable()
export class TopicTagTypeOrmReader implements TopicTagReader {
  constructor(private readonly transactionContext: TypeOrmTransactionContext) {}

  async findMissingTopicIds(ids: readonly string[]): Promise<readonly string[]> {
    return this.findMissing('topics', ids);
  }

  async findMissingTagIds(ids: readonly string[]): Promise<readonly string[]> {
    return this.findMissing('tags', ids);
  }

  async findTopicNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.findNames('topics', ids);
  }

  async findTagNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.findNames('tags', ids);
  }

  async listTopics(): Promise<readonly TopicCatalogEntry[]> {
    return this.listCatalog('topics');
  }

  async listTags(): Promise<readonly TopicCatalogEntry[]> {
    return this.listCatalog('tags');
  }

  private async listCatalog(table: 'topics' | 'tags'): Promise<readonly TopicCatalogEntry[]> {
    const rows: NameRow[] = await this.transactionContext
      .getManager()
      .query(`SELECT "id", "name" FROM "${table}" ORDER BY "name" ASC`);

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  private async findMissing(
    table: 'topics' | 'tags',
    ids: readonly string[],
  ): Promise<readonly string[]> {
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length === 0) {
      return [];
    }

    const rows: IdRow[] = await this.transactionContext
      .getManager()
      .query(`SELECT "id" FROM "${table}" WHERE "id" = ANY($1::uuid[])`, [uniqueIds]);
    const existing = new Set(rows.map((row) => row.id));

    return uniqueIds.filter((id) => !existing.has(id));
  }

  private async findNames(
    table: 'topics' | 'tags',
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const rows: NameRow[] = await this.transactionContext
      .getManager()
      .query(`SELECT "id", "name" FROM "${table}" WHERE "id" = ANY($1::uuid[])`, [uniqueIds]);

    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
