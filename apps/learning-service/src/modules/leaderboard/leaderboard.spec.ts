import { getLeaderboard, getLeaderboardPeriod, type LeaderboardScore } from './leaderboard';

const date = (iso: string) => new Date(iso);

describe('Vietnam leaderboard periods', () => {
  it('switches weeks at midnight Monday in Vietnam', () => {
    expect(getLeaderboardPeriod('week', date('2026-11-22T16:59:59Z'))).toEqual({
      from: date('2026-11-15T17:00:00Z'),
      to: date('2026-11-22T17:00:00Z'),
    });
    expect(getLeaderboardPeriod('week', date('2026-11-22T17:00:00Z'))).toEqual({
      from: date('2026-11-22T17:00:00Z'),
      to: date('2026-11-29T17:00:00Z'),
    });
  });

  it('switches months and years at midnight in Vietnam', () => {
    expect(getLeaderboardPeriod('month', date('2026-12-31T17:00:00Z'))).toEqual({
      from: date('2026-12-31T17:00:00Z'),
      to: date('2027-01-31T17:00:00Z'),
    });
  });
});

describe('XP leaderboard', () => {
  function score(userId: string, xp: number, solved: number, time: string): LeaderboardScore {
    return { userId, xp, solved, lastSolvedAt: date(time) };
  }

  const early = '2026-11-25T06:00:00Z';
  const late = '2026-11-26T06:00:00Z';
  const sources = {
    listScores: jest.fn(async () => [
      score('z', 20, 2, early),
      score('d', 20, 2, early),
      score('c', 20, 1, late),
      score('a', 30, 1, late),
      score('viewer', 10, 1, late),
      score('locked', 100, 10, early),
    ]),
    listEligibleIds: jest.fn(
      async (userIds: string[]) => new Set(userIds.filter((id) => id !== 'locked')),
    ),
    listProfiles: jest.fn(
      async (userIds: string[]) =>
        new Map(userIds.map((userId) => [userId, { userId, displayName: userId, avatar: null }])),
    ),
  };

  beforeEach(() => jest.clearAllMocks());

  it('ranks XP before counts, breaks ties, excludes inactive students and finds an off-page viewer', async () => {
    const result = await getLeaderboard({ period: 'week', page: 1, limit: 1 }, 'viewer', sources);
    expect(result.top.map(({ userId, rank }) => [userId, rank])).toEqual([
      ['a', 1],
      ['d', 2],
      ['z', 3],
    ]);
    expect(result.rows).toEqual([expect.objectContaining({ userId: 'c', rank: 4 })]);
    expect(result.me).toMatchObject({ userId: 'viewer', rank: 5, xp: 10, solved: 1 });
    expect(result.totalItems).toBe(2);
    expect(sources.listProfiles).toHaveBeenCalledWith(['viewer', 'a', 'd', 'z', 'c']);
  });

  it('returns an unranked viewer with zero XP and bounds an out-of-range page', async () => {
    const result = await getLeaderboard({ period: 'week', page: 50, limit: 1 }, 'new', sources);
    expect(result).toMatchObject({
      page: 2,
      rows: [expect.objectContaining({ userId: 'viewer', rank: 5 })],
      me: { userId: 'new', rank: null, xp: 0, solved: 0 },
    });
  });

  it('denies an inactive viewer before fetching public profiles', async () => {
    await expect(
      getLeaderboard({ period: 'week', page: 1, limit: 10 }, 'locked', sources),
    ).rejects.toThrow();
    expect(sources.listProfiles).not.toHaveBeenCalled();
  });
});
