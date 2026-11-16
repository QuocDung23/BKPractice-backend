import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type {
  RemoteCourseReportReader,
  StudentRosterPage,
  SubmissionCount,
} from '@/modules/progress/application/reports/student-course-report.ports';

const rosterSchema = z.object({
  items: z.array(
    z.object({
      userId: z.uuid(),
      studentId: z.string().nullable(),
      displayName: z.string().nullable(),
    }),
  ),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});
const countsSchema = z.object({
  counts: z.array(
    z.object({
      userId: z.uuid(),
      problemId: z.uuid(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export class RemoteReportUnavailableError extends Error {
  constructor() {
    super('Report dependency unavailable');
  }
}

@Injectable()
export class RemoteCourseReportReaderAdapter implements RemoteCourseReportReader {
  constructor(private readonly config: ConfigService) {}

  async loadStudents(page: number, limit: number): Promise<StudentRosterPage> {
    const url = new URL(
      '/internal/users/students',
      this.config.getOrThrow<string>('IDENTITY_SERVICE_URL'),
    );
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    const data = await this.request(url, { method: 'GET' });
    const parsed = rosterSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.page !== page ||
      parsed.data.limit !== limit ||
      parsed.data.items.length > limit
    )
      throw new RemoteReportUnavailableError();
    return parsed.data;
  }

  async loadSubmissionCounts(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<readonly SubmissionCount[]> {
    if (!userIds.length || !problemIds.length) return [];
    const url = new URL(
      '/internal/submissions/counts',
      this.config.getOrThrow<string>('SUBMISSION_SERVICE_URL'),
    );
    const users = new Set(userIds);
    const problems = new Set(problemIds);
    const counts: SubmissionCount[] = [];
    for (let offset = 0; offset < problemIds.length; offset += 500) {
      const batch = problemIds.slice(offset, offset + 500);
      const data = await this.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds, problemIds: batch }),
      });
      const parsed = countsSchema.safeParse(data);
      if (
        !parsed.success ||
        parsed.data.counts.some((row) => !users.has(row.userId) || !problems.has(row.problemId))
      )
        throw new RemoteReportUnavailableError();
      counts.push(...parsed.data.counts);
    }
    return counts;
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          'x-internal-service-secret': this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET'),
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new RemoteReportUnavailableError();
      return (await response.json()) as unknown;
    } catch {
      throw new RemoteReportUnavailableError();
    }
  }
}
