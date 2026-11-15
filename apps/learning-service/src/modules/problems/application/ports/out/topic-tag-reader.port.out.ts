export interface TopicCatalogEntry {
  readonly id: string;
  readonly name: string;
}

export interface TopicTagReader {
  findMissingTopicIds(ids: readonly string[]): Promise<readonly string[]>;
  findMissingTagIds(ids: readonly string[]): Promise<readonly string[]>;
  findTopicNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  findTagNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  listTopics(): Promise<readonly TopicCatalogEntry[]>;
}
