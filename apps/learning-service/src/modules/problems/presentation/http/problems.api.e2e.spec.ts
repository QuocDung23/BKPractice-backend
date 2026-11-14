import {
  createProblemPayload,
  createProblemsTestApp,
  ADMIN_A_ID,
  ADMIN_B_ID,
  adminHeaders,
  studentHeaders,
  type ProblemsTestApp,
} from './testing/problems-e2e.harness';

interface ApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function asArray(value: unknown): readonly unknown[] {
  return value as readonly unknown[];
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected a string, received ${typeof value}`);
  }

  return value;
}

describe('Problems API end-to-end contract', () => {
  let harness: ProblemsTestApp;

  beforeAll(async () => {
    harness = await createProblemsTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    harness.problems.clear();
    harness.testCases.clear();
  });

  async function send(path: string, init: RequestInit): Promise<ApiResponse> {
    const response = await fetch(`${harness.baseUrl}${path}`, init);
    const body = asObject(await response.json());

    return { status: response.status, body };
  }

  function post(path: string, body: unknown, headers = adminHeaders()): Promise<ApiResponse> {
    return send(path, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  function patch(path: string, body: unknown, headers = adminHeaders()): Promise<ApiResponse> {
    return send(path, { method: 'PATCH', headers, body: JSON.stringify(body) });
  }

  async function createDraft(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await post('/api/problems', createProblemPayload(overrides));
    expect(response.status).toBe(201);

    return text(response.body.id);
  }

  it('creates a draft owned by the trusted principal', async () => {
    const response = await post('/api/problems', createProblemPayload());

    expect(response.status).toBe(201);
    expect(response.body.publishStatus).toBe('DRAFT');
    expect(response.body.slug).toBe('two-sum');

    const snapshot = harness.problems.storedSnapshot(text(response.body.id));
    expect(snapshot?.createdBy.value).toBe(ADMIN_A_ID);
    expect(snapshot?.publishStatus).toBe('DRAFT');
  });

  it('rejects a student creating a problem', async () => {
    const response = await post('/api/problems', createProblemPayload(), studentHeaders());

    expect(response.status).toBe(403);
  });

  it('lets a Lecturer create and manage only own Problems while Admin can manage all', async () => {
    const lecturerA = { ...adminHeaders(ADMIN_A_ID), 'x-auth-roles': 'LECTURER' };
    const lecturerB = { ...adminHeaders(ADMIN_B_ID), 'x-auth-roles': 'LECTURER' };
    const created = await post('/api/problems', createProblemPayload(), lecturerA);
    expect(created.status).toBe(201);
    const id = text(created.body.id);
    const ownList = await send('/api/problems/managed', { headers: lecturerA });
    const otherList = await send('/api/problems/managed', { headers: lecturerB });
    expect(ownList.body.total).toBe(1);
    expect(otherList.body.total).toBe(0);
    expect((await send(`/api/problems/managed/${id}`, { headers: lecturerB })).status).toBe(403);
    expect((await patch(`/api/problems/${id}`, { title: 'Wrong edit' }, lecturerB)).status).toBe(
      403,
    );
    expect(
      (await patch(`/api/problems/${id}`, { title: 'Admin edit' }, adminHeaders(ADMIN_B_ID)))
        .status,
    ).toBe(200);
  });

  it('keeps drafts out of public surfaces while the owner can manage them', async () => {
    const id = await createDraft();

    const publicList = await send('/api/problems', { headers: studentHeaders() });
    expect(publicList.status).toBe(200);
    expect(publicList.body.total).toBe(0);

    const publicDetail = await send(`/api/problems/${id}`, { headers: studentHeaders() });
    expect(publicDetail.status).toBe(404);

    const publicBySlug = await send('/api/problems/two-sum', { headers: studentHeaders() });
    expect(publicBySlug.status).toBe(404);

    const managedList = await send('/api/problems/managed', { headers: adminHeaders() });
    expect(managedList.status).toBe(200);
    expect(managedList.body.total).toBe(1);

    const managedDetail = await send(`/api/problems/managed/${id}`, {
      headers: adminHeaders(),
    });
    expect(managedDetail.status).toBe(200);
    expect(managedDetail.body.publishStatus).toBe('DRAFT');
  });

  it('publishes a ready draft and exposes it by id and slug', async () => {
    const id = await createDraft();

    const published = await post(`/api/problems/${id}/publish`, {});
    expect(published.status).toBe(200);
    expect(published.body.publishStatus).toBe('PUBLISHED');

    const byId = await send(`/api/problems/${id}`, { headers: studentHeaders() });
    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(id);

    const bySlug = await send('/api/problems/two-sum', { headers: studentHeaders() });
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.slug).toBe('two-sum');

    const list = await send('/api/problems', { headers: studentHeaders() });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
  });

  it('rejects publishing an unready draft without persisting a status change', async () => {
    const id = await createDraft({ enabledLanguages: [] });

    const published = await post(`/api/problems/${id}/publish`, {});
    expect(published.status).toBe(400);

    expect(published.body.code).toBe('PROBLEM_NOT_READY_TO_PUBLISH');
    expect(typeof published.body.requestId).toBe('string');
    const issues = asArray(published.body.details).map((issue) => asObject(issue).code);
    expect(issues).toContain('ENABLED_LANGUAGE_REQUIRED');

    const managed = await send(`/api/problems/managed/${id}`, { headers: adminHeaders() });
    expect(managed.body.publishStatus).toBe('DRAFT');
    expect(harness.problems.storedSnapshot(id)?.publishStatus).toBe('DRAFT');
  });

  it('lets another ADMIN update a problem', async () => {
    const id = await createDraft();

    const crossAdmin = await patch(
      `/api/problems/${id}`,
      { title: 'Hijacked title' },
      adminHeaders(ADMIN_B_ID),
    );
    expect(crossAdmin.status).toBe(200);
    expect(harness.problems.storedSnapshot(id)?.title.value).toBe('Hijacked title');

    const updated = await patch(`/api/problems/${id}`, { title: 'Updated title' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Updated title');
    expect(harness.problems.storedSnapshot(id)?.title.value).toBe('Updated title');
  });

  it('holds and republishes a published problem', async () => {
    const id = await createDraft();
    expect((await post(`/api/problems/${id}/publish`, {})).status).toBe(200);

    const held = await post(`/api/problems/${id}/hold`, {});
    expect(held.status).toBe(200);
    expect(held.body.publishStatus).toBe('ON_HOLD');

    expect((await send(`/api/problems/${id}`, { headers: studentHeaders() })).status).toBe(404);

    const republished = await post(`/api/problems/${id}/republish`, {});
    expect(republished.status).toBe(200);
    expect(republished.body.publishStatus).toBe('PUBLISHED');

    expect((await send(`/api/problems/${id}`, { headers: studentHeaders() })).status).toBe(200);
  });

  it('soft deletes and restores while preserving the publish status', async () => {
    const id = await createDraft();
    expect((await post(`/api/problems/${id}/publish`, {})).status).toBe(200);

    const deleted = await send(`/api/problems/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.publishStatus).toBe('PUBLISHED');
    expect(typeof deleted.body.deletedAt).toBe('string');

    expect((await send(`/api/problems/${id}`, { headers: studentHeaders() })).status).toBe(404);
    expect((await send(`/api/problems/managed/${id}`, { headers: adminHeaders() })).status).toBe(
      404,
    );

    const withDeleted = await send(`/api/problems/managed/${id}?includeDeleted=true`, {
      headers: adminHeaders(),
    });
    expect(withDeleted.status).toBe(200);
    expect(withDeleted.body.deletedAt).not.toBeNull();
    expect(withDeleted.body.publishStatus).toBe('PUBLISHED');

    const restored = await post(`/api/problems/${id}/restore`, {});
    expect(restored.status).toBe(200);
    expect(restored.body.publishStatus).toBe('PUBLISHED');

    expect((await send(`/api/problems/${id}`, { headers: studentHeaders() })).status).toBe(200);
  });

  it('hides soft-deleted problems from the managed list unless includeDeleted=true', async () => {
    const id = await createDraft();
    expect((await post(`/api/problems/${id}/publish`, {})).status).toBe(200);
    expect(
      (
        await send(`/api/problems/${id}`, {
          method: 'DELETE',
          headers: adminHeaders(),
        })
      ).status,
    ).toBe(200);

    const active = await send('/api/problems/managed', { headers: adminHeaders() });
    expect(active.body.total).toBe(0);

    const withDeleted = await send('/api/problems/managed?includeDeleted=true', {
      headers: adminHeaders(),
    });
    expect(withDeleted.body.total).toBe(1);
  });

  it('previews a draft without publishing it', async () => {
    const id = await createDraft();

    const preview = await post(`/api/problems/${id}/preview`, {});
    expect(preview.status).toBe(200);
    expect(preview.body.publishStatus).toBe('DRAFT');

    expect((await send(`/api/problems/${id}`, { headers: studentHeaders() })).status).toBe(404);
    expect(harness.problems.storedSnapshot(id)?.publishStatus).toBe('DRAFT');
  });

  it('returns an empty page when no problem is published', async () => {
    const response = await send('/api/problems', { headers: studentHeaders() });

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it('only lists published problems in the public list', async () => {
    const publishedId = await createDraft();
    expect((await post(`/api/problems/${publishedId}/publish`, {})).status).toBe(200);
    await createDraft({ slug: 'draft-only', title: 'Draft only' });

    const response = await send('/api/problems', { headers: studentHeaders() });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(asObject(asArray(response.body.items)[0]).id).toBe(publishedId);
  });
});
