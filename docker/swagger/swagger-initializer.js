window.onload = function () {
  const csrfCookieName = '__Host-bk_csrf';
  const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  window.ui = SwaggerUIBundle({
    urls: [
      { name: 'Identity', url: '/docs/identity.json' },
      { name: 'Learning', url: '/docs/learning.json' },
      { name: 'Submission', url: '/docs/submission.json' },
    ],
    'urls.primaryName': 'Identity',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout',
    withCredentials: true,
    persistAuthorization: false,
    requestInterceptor(request) {
      if (!request.url) return request;
      const url = new URL(request.url, window.location.origin);
      const method = request.method?.toUpperCase();
      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith('/api/') ||
        !unsafeMethods.has(method)
      ) {
        return request;
      }

      const csrfCookie = document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${csrfCookieName}=`));
      const csrfToken = csrfCookie?.slice(csrfCookieName.length + 1);
      if (csrfToken) {
        request.headers = request.headers || {};
        request.headers['X-CSRF-Token'] = csrfToken;
      }
      return request;
    },
  });
};
