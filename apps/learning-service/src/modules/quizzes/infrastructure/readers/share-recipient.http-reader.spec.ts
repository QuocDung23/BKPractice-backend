import { ConfigService } from '@nestjs/config';

import { ShareRecipientHttpReader } from '@/modules/quizzes/infrastructure/readers/share-recipient.http-reader';

describe('ShareRecipientHttpReader', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const reader = new ShareRecipientHttpReader(
    new ConfigService({
      IDENTITY_SERVICE_URL: 'http://identity.test',
      INTERNAL_SERVICE_SECRET: 'test-only-credential',
    }),
  );
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('accepts only the active lecturer returned by the Identity lookup', async () => {
    const mock = jest.fn().mockResolvedValue(Response.json({ userId: id, roles: ['LECTURER'] }));
    global.fetch = mock;
    await expect(reader.requireLecturer(id)).resolves.toBeUndefined();
    expect(mock).toHaveBeenCalledWith(
      'http://identity.test/internal/users/' + id + '/roles',
      expect.objectContaining({ headers: { 'x-internal-service-secret': 'test-only-credential' } }),
    );
  });
  it.each([404, 401, 503])('handles Identity status %i without granting access', async (status) => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status }));
    await expect(reader.requireLecturer(id)).rejects.toMatchObject({
      code: status === 404 ? 'INVALID' : 'UNAVAILABLE',
    });
  });
  it.each([
    { userId: id, roles: ['STUDENT'] },
    { userId: 'another-user', roles: ['LECTURER'] },
    null,
  ])('rejects an invalid recipient %j', async (body) => {
    global.fetch = jest.fn().mockResolvedValue(Response.json(body));
    await expect(reader.requireLecturer(id)).rejects.toMatchObject({ code: 'INVALID' });
  });
  it('maps malformed JSON and network failures to an unavailable boundary', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('malformed-json'));
    await expect(reader.requireLecturer(id)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    global.fetch = jest.fn().mockRejectedValue(new Error('private network details'));
    await expect(reader.requireLecturer(id)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Identity is unavailable',
    });
  });
});
