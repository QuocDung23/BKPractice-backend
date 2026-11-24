import {
  createProblemsTestApp,
  studentHeaders,
  type ProblemsTestApp,
} from './testing/problems-e2e.harness';

interface ApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

describe('Topic catalog API', () => {
  let harness: ProblemsTestApp;

  beforeAll(async () => {
    harness = await createProblemsTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function get(path: string, headers?: Record<string, string>): Promise<ApiResponse> {
    const response = await fetch(`${harness.baseUrl}${path}`, { method: 'GET', headers });

    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('rejects a request without a trusted principal', async () => {
    const response = await get('/api/topics');

    expect(response.status).toBe(401);
    expect(response.body.items).toBeUndefined();
  });

  it('returns the catalog for an authenticated user', async () => {
    harness.topics.setCatalog([{ id: 'topic-arrays', name: 'Mảng' }]);

    const response = await get('/api/topics', studentHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: 'topic-arrays', name: 'Mảng' }] });
  });

  it('returns the tag catalog separately and requires authentication', async () => {
    expect((await get('/api/tags')).status).toBe(401);
    expect(await get('/api/tags', studentHeaders())).toEqual({
      status: 200,
      body: { items: [{ id: 'tag-beginner', name: 'Cơ bản' }] },
    });
  });

  it('returns an empty catalog without an error', async () => {
    harness.topics.setCatalog([]);

    const response = await get('/api/topics', studentHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('rejects unsupported query parameters', async () => {
    const response = await get('/api/topics?unsupported=1', studentHeaders());

    expect(response.status).toBe(400);
    expect(response.body.items).toBeUndefined();
  });

  it('does not expose a write method', async () => {
    const response = await fetch(`${harness.baseUrl}/api/topics`, {
      method: 'POST',
      headers: studentHeaders(),
    });

    expect(response.status).toBe(404);
  });
});
