import type { IListTopicsPortIn } from '@learning/modules/problems/application/ports/in/list-topics.port.in';
import type {
  TopicCatalogEntry,
  TopicTagReader,
} from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';
import { TOPIC_TAG_READER } from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListTopicsUseCase implements IListTopicsPortIn {
  constructor(
    @Inject(TOPIC_TAG_READER)
    private readonly topicTagReader: TopicTagReader,
  ) {}

  async execute(): Promise<readonly TopicCatalogEntry[]> {
    return this.topicTagReader.listTopics();
  }
}
