# 2026-11-12 — Fix public Swagger showing the Petstore sample

- Author: Claude Code, on request of the repository owner.
- Scope: Fix `docker/swagger/99-install-initializer.sh` so browsers receive the
  BKPractice Swagger initializer. No backend source, migration, dependency or
  Nginx configuration changed.

## Spec and plan

- Spec: No feature spec. This fixes the deployment templates from
  [2026-11-11 — Public Swagger setup](./2026-11-11-public-swagger-frontend-guide.md).
- Plan: Conversation plan approved by the owner: rebuild the compressed
  initializer, add this entry, and push on a new branch.
- Tasks: No tasks file for this operations fix.
- Spec status at start: N/A.

## Questions clarified

| Question                                                   | Conclusion                                                                                            | Source                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Why did `https://103.232.121.56:8443/docs/` show Petstore? | Browsers received a stale `swagger-initializer.js.gz` that still held the stock Petstore initializer. | `curl` with and without `Accept-Encoding: gzip` |
| Was the container serving the wrong file?                  | No. The plain `.js` inside the running container was the BKPractice initializer.                      | `docker exec ... head -3` run by the owner      |
| How should it be fixed?                                    | Rebuild the `.gz` from the installed initializer in the same startup script.                          | Owner's choice                                  |

## What was done

`99-install-initializer.sh` now copies the BKPractice initializer and then
rebuilds `swagger-initializer.js.gz` from it. Browsers that request gzip and
clients that request the plain file now get the same initializer: the
Identity, Learning and Submission selector, cookies, and the CSRF header for
same-origin `/api` writes. Before the fix, every browser saw the Petstore
sample, while `curl` without compression saw the correct file.

## Why these choices

- The Swagger UI image's `/docker-entrypoint.d/40-swagger-ui.sh` (line 52)
  pre-compresses every `.html`, `.js` and `.css` file to `.gz`, and its
  Nginx serves those files to clients that accept gzip. Replacing only the
  `.js` left the stale `.gz` in place.
- Rebuilding the `.gz` with `gzip < file > file.gz` uses the same command and
  tool as the image, so no extra package or Nginx setting is needed and
  compression stays on.
- The fix stays in the startup script, so it runs again on every container
  start and on every recreation during later deploys.

## How the feature works

This is not a product feature; the change is in the Swagger UI container's
startup:

1. The container starts and the image's `40-swagger-ui.sh` writes the stock
   initializer and pre-compresses all `.js` files, including
   `swagger-initializer.js.gz`.
2. `99-install-initializer.sh` copies the mounted BKPractice initializer over
   `swagger-initializer.js` and rebuilds `swagger-initializer.js.gz` from it.
3. A browser loads `/docs/` through host Nginx; the page requests
   `/docs/swagger-initializer.js` with `Accept-Encoding: gzip`.
4. The container's Nginx returns the rebuilt `.gz`, so the browser runs the
   BKPractice initializer and shows the three-service selector.
5. If the copy or compression fails, `set -eu` stops the entrypoint and the
   container does not start, instead of silently serving Petstore.

The local check in the 2026-11-11 entry missed this because its test Nginx
proxied with the default HTTP/1.0, and the container's Nginx does not serve
precompressed files to HTTP/1.0 requests. The production site sets
`proxy_http_version 1.1`, which exposed the stale `.gz`.

## Configuration

- `docker/swagger/99-install-initializer.sh`: also writes
  `/usr/share/nginx/html/swagger-initializer.js.gz` inside the container.
- No configuration key or secret changed.

## Verification

- Production before the fix, from outside the VPS: the initializer returned
  the BKPractice file without compression and the Petstore file with
  `Accept-Encoding: gzip` (`Content-Encoding: gzip`).
- Local, `swaggerapi/swagger-ui:v5.34.1` with the old script: plain response
  contained the BKPractice initializer, gzip response contained Petstore.
  With the new script both responses contained the BKPractice initializer,
  also after `docker restart`.
- `sh -n docker/swagger/99-install-initializer.sh` passed.
- Not verified yet: the production result after the owner installs the new
  script and recreates `swagger-ui`.

## Remaining

- Not done: on the VPS, install the new script to
  `/srv/bkpractice/swagger/99-install-initializer.sh` and recreate
  `swagger-ui` with `--force-recreate`. A plain restart keeps the old file,
  because a single-file bind mount keeps the file that existed when the
  container was created.
- Risks: none beyond those in the 2026-11-11 entry.
