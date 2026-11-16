import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { getTransactionStorage } from '@/infrastructure/persistence';
@Injectable()
export class QuizTransactionContext {
  constructor(private readonly source: DataSource) {}
  getManager(): EntityManager {
    return getTransactionStorage(this.source).getStore() ?? this.source.manager;
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const storage = getTransactionStorage(this.source);
    return storage.getStore()
      ? work()
      : this.source.transaction((manager) => storage.run(manager, work));
  }
  async lock(key: string): Promise<void> {
    await this.getManager().query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  }
}
