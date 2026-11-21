# UC02 integration checks in CI

The image workflow's verification job now provisions PostgreSQL 17 and passes its mapped port and
isolated test database to the existing Jest test step. UC02 checks the database suffix and applies
its migrations inside a test schema. The variable is scoped to the test step.

The workflow uses the existing suite in `test/uc02-practice-submission.integration.spec.ts`.
Workflow YAML and the database suffix were checked locally. Jest and the PostgreSQL service were
not run locally because dependencies were unavailable and access to the Docker socket was denied.
