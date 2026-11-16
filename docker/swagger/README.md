# Public Swagger UI for the production backend

The public page is `https://103.232.121.56:8443/docs/`. It shows the Identity,
Learning, and Submission OpenAPI documents. Community is currently disabled, and
Judge is an internal worker. Swagger UI sends requests to the existing public
`/api` routes through the API Gateway.

This directory is an overlay for the production Compose file on the VPS. It does
not contain production secrets. The existing production Compose file remains the
first file in every command below.

## Apply on the VPS

First make these repository files available in the cloned repository on the VPS.
Run the following commands from the repository root there:

```bash
sudo install -d -m 755 /srv/bkpractice/swagger /etc/nginx/snippets
sudo install -m 644 docker/swagger/compose.swagger.yml /srv/bkpractice/swagger/compose.swagger.yml
sudo install -m 644 docker/swagger/swagger-initializer.js /srv/bkpractice/swagger/swagger-initializer.js
sudo install -m 755 docker/swagger/99-install-initializer.sh /srv/bkpractice/swagger/99-install-initializer.sh
sudo install -m 644 docker/swagger/nginx-locations.conf /etc/nginx/snippets/bkpractice-swagger.conf

docker compose --env-file /srv/bkpractice/production.env \
  -f /srv/bkpractice/compose.yml \
  -f /srv/bkpractice/swagger/compose.swagger.yml config -q

docker compose --env-file /srv/bkpractice/production.env \
  -f /srv/bkpractice/compose.yml \
  -f /srv/bkpractice/swagger/compose.swagger.yml up -d --no-deps \
  identity-service learning-service submission-service swagger-ui
```

The three API services are recreated once to add loopback-only port bindings.
Their public API traffic continues through the Gateway. Swagger UI also binds to
loopback only; the existing Nginx HTTPS site is the public entry point.

In `/etc/nginx/sites-available/bkpractice-ip`, find the HTTPS `server` block
listening on `8443`. Remove its existing `location = /docs` block if present,
then add this line **inside that HTTPS server block**:

```nginx
include /etc/nginx/snippets/bkpractice-swagger.conf;
```

Apply and inspect:

```bash
sudo nginx -t && sudo systemctl reload nginx

docker compose --env-file /srv/bkpractice/production.env \
  -f /srv/bkpractice/compose.yml \
  -f /srv/bkpractice/swagger/compose.swagger.yml ps

sudo ss -ltnp '( sport = :3101 or sport = :3102 or sport = :3103 or sport = :3105 )'
```

Ports `3101`, `3102`, `3103`, and `3105` must listen on `127.0.0.1` only. No
new public firewall rule is needed; visitors use the existing HTTPS port `8443`.

## Check the page

From a device outside the VPS, open
`https://103.232.121.56:8443/docs/`. The selector should show Identity,
Learning, and Submission. The three JSON sources are:

- `https://103.232.121.56:8443/docs/identity.json`
- `https://103.232.121.56:8443/docs/learning.json`
- `https://103.232.121.56:8443/docs/submission.json`

The page is public and “Try it out” calls the live production API. A web login
sets secure cookies; the custom initializer sends those cookies and copies the
readable CSRF cookie to `X-CSRF-Token` on state-changing `/api` requests. It never
copies the CSRF value to another origin. The backend still enforces its normal
authentication, authorization, origin, and CSRF checks.

For an updated release, use both Compose files in subsequent `up`, `ps`, and
other Compose commands so the loopback bindings and Swagger UI remain part of
the deployed project. Keep the versioned Swagger UI image and update it
deliberately when needed.
