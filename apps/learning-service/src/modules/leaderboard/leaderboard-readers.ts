import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { z } from 'zod';

import {
  LeaderboardProfilesUnavailable,
  type LeaderboardProfile,
  type LeaderboardScore,
  type LeaderboardSources,
} from './leaderboard';

const BATCH_SIZE = 100;
const eligibleSchema = z.array(z.object({ userId: z.uuid() })).max(BATCH_SIZE);
const profileSchema = z
  .array(z.object({ userId: z.uuid(), displayName: z.string(), avatar: z.httpUrl().nullable() }))
  .max(BATCH_SIZE);

@Injectable()
export class LeaderboardReaders implements LeaderboardSources {
  constructor(
    private readonly database: DataSource,
    private readonly config: ConfigService,
  ) {}

  listScores(from: Date, to: Date): Promise<LeaderboardScore[]> {
    return this.database.query<LeaderboardScore[]>(
      `SELECT p.user_id AS "userId",
              SUM(p.awarded_xp)::integer AS xp,
              COUNT(*)::integer AS solved,
              MAX(p.solved_at) AS "lastSolvedAt"
       FROM progress p
       JOIN problems problem ON problem.id = p.problem_id
       WHERE p.status = 'SOLVED' AND p.awarded_xp IS NOT NULL
         AND p.solved_at >= $1 AND p.solved_at < $2
         AND problem.publish_status = 'PUBLISHED' AND problem.deleted_at IS NULL
       GROUP BY p.user_id`,
      [from, to],
    );
  }

  async listEligibleIds(userIds: string[]): Promise<Set<string>> {
    const signal = AbortSignal.timeout(5000);
    const eligible = new Set<string>();
    for (let offset = 0; offset < userIds.length; offset += BATCH_SIZE) {
      const batch = userIds.slice(offset, offset + BATCH_SIZE);
      const data = await this.requestProfiles(batch, false, eligibleSchema, signal);
      for (const { userId } of data) eligible.add(userId);
    }
    return eligible;
  }

  async listProfiles(userIds: string[]): Promise<Map<string, LeaderboardProfile>> {
    const profiles = await this.requestProfiles(
      userIds,
      true,
      profileSchema,
      AbortSignal.timeout(5000),
    );
    return new Map(profiles.map((profile) => [profile.userId, profile]));
  }

  private async requestProfiles<T extends { userId: string }>(
    userIds: string[],
    includeProfiles: boolean,
    schema: z.ZodType<T[]>,
    signal: AbortSignal,
  ): Promise<T[]> {
    try {
      const url = new URL(
        '/internal/profiles/leaderboard',
        this.config.getOrThrow<string>('IDENTITY_SERVICE_URL'),
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-service-secret': this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET'),
        },
        body: JSON.stringify({ userIds, includeProfiles }),
        signal,
      });
      if (!response.ok) throw new LeaderboardProfilesUnavailable();
      const result = schema.parse(await response.json());
      const requested = new Set(userIds);
      if (result.some(({ userId }) => !requested.has(userId))) {
        throw new LeaderboardProfilesUnavailable();
      }
      return result;
    } catch {
      throw new LeaderboardProfilesUnavailable();
    }
  }
}
