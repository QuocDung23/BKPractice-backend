# Frontend integration with BKPractice production API

## Entry point and current availability

Production origin: `https://103.232.121.56:8443`.

The web frontend will be served from this same origin. Use relative URLs such
as `/api/auth/login`, `/api/courses`, and `/socket.io`. Do not call the Docker
service ports or the Tailscale address from the browser. Mobile clients and
Postman can use the absolute origin above.

The interactive API reference is
[`/docs/`](https://103.232.121.56:8443/docs/). Select Identity, Learning, or
Submission in the dropdown. “Try it out” sends requests to **production** and
can change real data. Community is currently disabled. The Judge service is an
internal worker and has no browser-facing API. The frontend and its
`/auth/callback` route have not been deployed, so Microsoft web login is not yet
ready for end-to-end use.

## Web authentication sequence

1. Call `POST /api/auth/login` with JSON
   `{"identifier":"<student ID or school email>","password":"<password>"}`.
   The response body contains `userId`. The browser receives secure, HttpOnly
   access and refresh cookies plus a readable CSRF cookie.
2. Send cookies on later requests. Use `credentials: 'include'` with `fetch`, or
   `withCredentials: true` with Axios. `GET /api/auth/me` returns the current
   user. A protected route without a valid session returns `401`.
3. Before a state-changing request authenticated by cookies, call
   `GET /api/auth/csrf` and place its `csrfToken` in the `X-CSRF-Token` header.
   This includes `POST /api/auth/refresh`. A missing or incorrect token can
   return `403`. The browser must use the production origin for these calls.
4. Use `POST /api/auth/refresh` to renew the session when needed. Use
   `POST /api/auth/logout` to end the session. Keep credentials and CSRF headers
   on these requests. After logout, treat any `401` as signed out.

Example using the same origin:

```ts
const api = async (path: string, init: RequestInit = {}) =>
  fetch(`/api${path}`, { ...init, credentials: 'include' });

const login = await api('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier, password }),
});

const courses = await api('/courses');

const csrfResponse = await api('/auth/csrf');
const { csrfToken } = await csrfResponse.json();
const refresh = await api('/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
  body: '{}',
});
```

Check `response.ok` and handle error bodies in the frontend. The example shows
the request sequence; it does not implement retry or session state management.
Do not store access or refresh tokens in browser storage for the web flow.

## API and realtime calls

- Authentication and account routes start with `/api/auth`, `/api/users`,
  `/api/profile`, or `/api/roles` and are handled by Identity.
- Learning routes include `/api/problems`, `/api/courses`, and `/api/progress`.
  `GET /api/courses` requires a logged-in user and may return an empty `items`
  array when no course is published.
- Submission routes include `/api/submissions` and `/api/run`. Submission
  results arrive asynchronously.

For live submission results, connect Socket.IO to namespace `/submissions` on
the same origin, using the default transport path `/socket.io`. Listen for
`submission.result`. The browser session cookie authenticates the connection.

```ts
import { io } from 'socket.io-client';

const socket = io(`${window.location.origin}/submissions`, {
  path: '/socket.io',
  withCredentials: true,
});

socket.on('submission.result', (result) => {
  // Update the matching submission in the UI.
});
```

Use the Swagger schemas for each route's request and response fields. The
Gateway strips caller-supplied identity headers, verifies the session, and
forwards requests to the owning service. A `401` means authentication is needed;
a `403` means the request was rejected by permission, origin, or CSRF checks.

## Using the public Swagger page

Open `/docs/` and select the service. Use Identity's login endpoint first; the
page sends and receives browser cookies. Its “Try it out” requests use the same
public origin. The page adds the CSRF header for state-changing `/api` requests
when the CSRF cookie is present. Normal backend authorization still applies.

The OpenAPI documents contain no `servers` override, so the default server is
`/` on the public origin. If a request needs a role or permission, use an
account with that permission. The Swagger page is a reference to the deployed
release; code and environment configuration remain the source of runtime
behavior.
