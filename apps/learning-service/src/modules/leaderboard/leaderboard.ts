export type LeaderboardPeriod = 'week' | 'month';

export interface LeaderboardScore {
  userId: string;
  xp: number;
  solved: number;
  quizzesPassed: number;
  lastAwardedAt: Date;
}

export interface LeaderboardProfile {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface LeaderboardEntry extends LeaderboardProfile {
  rank: number | null;
  xp: number;
  solved: number;
  quizzesPassed: number;
}

export interface LeaderboardQuery {
  period: LeaderboardPeriod;
  page: number;
  limit: number;
}

export class IneligibleLeaderboardViewer extends Error {}
export class LeaderboardProfilesUnavailable extends Error {}

export interface LeaderboardSources {
  listScores(from: Date, to: Date): Promise<LeaderboardScore[]>;
  listEligibleIds(userIds: string[]): Promise<Set<string>>;
  listProfiles(userIds: string[]): Promise<Map<string, LeaderboardProfile>>;
}

export const GET_LEADERBOARD = Symbol('GetLeaderboard');
export type GetLeaderboard = (
  query: LeaderboardQuery,
  viewerId: string,
) => ReturnType<typeof getLeaderboard>;

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const PODIUM_SIZE = 3;

export function getLeaderboardPeriod(period: LeaderboardPeriod, now: Date) {
  const localClock = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const year = localClock.getUTCFullYear();
  const month = localClock.getUTCMonth();

  if (period === 'month') {
    return {
      from: new Date(Date.UTC(year, month, 1) - VIETNAM_OFFSET_MS),
      to: new Date(Date.UTC(year, month + 1, 1) - VIETNAM_OFFSET_MS),
    };
  }
  const monday = localClock.getUTCDate() - ((localClock.getUTCDay() + 6) % 7);
  return {
    from: new Date(Date.UTC(year, month, monday) - VIETNAM_OFFSET_MS),
    to: new Date(Date.UTC(year, month, monday + 7) - VIETNAM_OFFSET_MS),
  };
}

export async function getLeaderboard(
  query: LeaderboardQuery,
  viewerId: string,
  sources: LeaderboardSources,
  now = new Date(),
) {
  const { from, to } = getLeaderboardPeriod(query.period, now);
  const scores = await sources.listScores(from, to);
  const candidateIds = [...new Set([viewerId, ...scores.map(({ userId }) => userId)])];
  const eligibleIds = await sources.listEligibleIds(candidateIds);
  if (!eligibleIds.has(viewerId)) throw new IneligibleLeaderboardViewer();

  const ranked = scores
    .filter(({ userId }) => eligibleIds.has(userId))
    .sort(
      (a, b) =>
        b.xp - a.xp ||
        a.lastAwardedAt.getTime() - b.lastAwardedAt.getTime() ||
        a.userId.localeCompare(b.userId),
    )
    .map((score, index) => ({ ...score, rank: index + 1 }));

  const totalItems = Math.max(0, ranked.length - PODIUM_SIZE);
  const page = Math.min(query.page, Math.max(1, Math.ceil(totalItems / query.limit)));
  const offset = PODIUM_SIZE + (page - 1) * query.limit;
  const top = ranked.slice(0, PODIUM_SIZE);
  const rows = ranked.slice(offset, offset + query.limit);
  const me = ranked.find(({ userId }) => userId === viewerId);
  const profileIds = [...new Set([viewerId, ...top.concat(rows).map(({ userId }) => userId)])];
  const profiles = await sources.listProfiles(profileIds);

  function entry(userId: string, score?: (typeof ranked)[number]): LeaderboardEntry {
    const profile = profiles.get(userId);
    if (!profile) throw new LeaderboardProfilesUnavailable();
    return {
      ...profile,
      rank: score?.rank ?? null,
      xp: score?.xp ?? 0,
      solved: score?.solved ?? 0,
      quizzesPassed: score?.quizzesPassed ?? 0,
    };
  }

  return {
    period: query.period,
    from,
    to,
    generatedAt: now,
    top: top.map((score) => entry(score.userId, score)),
    rows: rows.map((score) => entry(score.userId, score)),
    totalItems,
    page,
    limit: query.limit,
    me: entry(viewerId, me),
  };
}
