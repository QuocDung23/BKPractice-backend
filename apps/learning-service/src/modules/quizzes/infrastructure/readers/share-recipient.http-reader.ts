import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ShareRecipientReader } from '@/modules/quizzes/application/ports/out';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class ShareRecipientHttpReader extends ShareRecipientReader {
  constructor(private readonly config: ConfigService) {
    super();
  }
  async requireLecturer(id: string): Promise<void> {
    let response: Response;
    try {
      const url = this.config.getOrThrow<string>('IDENTITY_SERVICE_URL');
      response = await fetch(`${url}/internal/users/${encodeURIComponent(id)}/roles`, {
        headers: {
          'x-internal-service-secret': this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET'),
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new QuizError('UNAVAILABLE', 'Identity is unavailable');
    }
    if (response.status === 404)
      throw new QuizError('INVALID', 'Recipient must be an active LECTURER');
    if (!response.ok) throw new QuizError('UNAVAILABLE', 'Identity is unavailable');
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new QuizError('UNAVAILABLE', 'Identity is unavailable');
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('userId' in data) ||
      data.userId !== id ||
      !('roles' in data) ||
      !Array.isArray(data.roles) ||
      !data.roles.includes('LECTURER')
    )
      throw new QuizError('INVALID', 'Recipient must be an active LECTURER');
  }
}
