import type { TopicCatalogEntry } from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';

export interface IListTopicsPortIn {
  execute(catalog?: 'topics' | 'tags'): Promise<readonly TopicCatalogEntry[]>;
}

export const LIST_TOPICS_PORT_IN = Symbol('LIST_TOPICS_PORT_IN');
