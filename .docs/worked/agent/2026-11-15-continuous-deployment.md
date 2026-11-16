# 2026-11-15 — Continuous production deployment

- Author: Codex with repository owner
- Scope: OPS-001 GitHub Actions deployment orchestration and VPS provisioning

## Spec and plan

- Spec: `.docs/specs/00-system/continuous-deployment/spec.md` (OPS-001)
- Plan: `.docs/specs/00-system/continuous-deployment/plan.md`
- Tasks: `.docs/specs/00-system/continuous-deployment/tasks.md`
- Spec status at start: Approved by repository owner on 2026-11-15.

## Questions clarified

| Question                                         | Conclusion                                                                     | Source                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Does a successful image workflow deploy the VPS? | No. The existing workflow only verifies and pushes GHCR images by SHA.         | `.github/workflows/build-images.yml` before OPS-001. |
| Which runtime receives public API traffic?       | Nginx routes `bkpractice.duckdns.org/api/` to the Docker Gateway on port 3100. | VPS Nginx inspection by repository owner.            |
| Can the user's existing SSH key be reused?       | No. A dedicated `bkdeploy` key is used only for this deployment path.          | Owner decision.                                      |
| Should migrations be automatic?                  | No. They remain a separately approved release action.                          | OPS-001 scope.                                       |

## What was done

The image workflow now has a `deploy` job after the complete publish matrix. It connects to the
production VPS only after all images for a `main` commit have been published, then passes that exact
commit SHA to the root-owned `/usr/local/sbin/bkpractice-deploy` script. The VPS script pulls the
matching images, replaces dependent services before the Gateway, waits for Compose health checks and
checks Gateway `/health`.

The production compose configuration was changed on the VPS from a hard-coded image SHA to
`BKP_IMAGE_TAG`, allowing the deploy script to select the published revision without editing Compose
on every release. A stale systemd Gateway service was disabled; Nginx uses the Docker Gateway instead.

## Why these choices

- The SHA from `github.sha` prevents an unreviewed or mutable `latest` image from being deployed.
- Environment-scoped secrets, a dedicated deploy user, pinned host key and a root-owned script keep
  production credentials out of repository files and constrain the SSH pathway.
- GitHub concurrency plus a VPS `flock` prevents overlapping container replacement.
- Migration is intentionally excluded because a database change needs its own approved rollout and
  rollback decision.

## How the feature works

1. A merge pushes a commit to `main`.
2. `verify` runs quality checks and `publish` pushes all container images tagged with that commit SHA.
3. GitHub grants the `deploy` job only the `production` environment secrets.
4. The job validates its SSH configuration, pins the server host key and asks `bkdeploy` to sudo the
   deployment script with the commit SHA.
5. The VPS script locks deployment, pulls image revisions, recreates service containers and checks
   Gateway health.
6. Any SSH, image, Compose or health error returns non-zero and marks the GitHub deployment failed.

## Configuration

- `.github/workflows/build-images.yml`: adds deployment SSH secret references and the `deploy` job.
- VPS `/srv/bkpractice/compose.yml`: image tags use `BKP_IMAGE_TAG` rather than a fixed SHA.
- VPS `/usr/local/sbin/bkpractice-deploy`: root-owned deployment command; no secret values are recorded.
- GitHub Environment `production`: stores SSH host, port, user, private key and pinned known-hosts entry.

## Verification

- `git diff --check`: pass.
- Prettier check for added workflow/spec files: pass.
- VPS manual deployment of SHA `b9523426a3ab33b9a7a8682792b79307b6785dc7`: Compose services and Gateway health passed.
- Not verified: the first GitHub Actions SSH deployment will run after this workflow commit is pushed.

## Remaining

- The first `main` push must be checked in GitHub Actions and the production health endpoint confirmed.
- Automatic migration and automatic rollback are intentionally not implemented.
