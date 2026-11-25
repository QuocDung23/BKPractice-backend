import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const container = process.env.COMMUNITY_TEST_POSTGRES_CONTAINER;
const bootstrapUser = process.env.COMMUNITY_TEST_POSTGRES_USER ?? 'bkpractice';
if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container))
  throw new Error('Invalid PostgreSQL test container identifier');
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bootstrapUser))
  throw new Error('Invalid PostgreSQL test bootstrap role');

const suffix = randomBytes(6).toString('hex');
const database = `bkpractice_community_test_${suffix}`;
const role = `community_test_${suffix}`;
const password = randomBytes(32).toString('hex');
if (
  !/^bkpractice_community_test_[a-f0-9]{12}$/.test(database) ||
  !/^community_test_[a-f0-9]{12}$/.test(role)
) {
  throw new Error('Invalid isolated test identifiers');
}
function runDocker(args, input) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker command failed');
  return result.stdout.trim();
}
function runSql(sql) {
  const exec = container ? ['exec', '-i', container] : ['compose', 'exec', '-T', 'postgres'];
  return runDocker(
    [...exec, 'psql', '-U', bootstrapUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    sql,
  );
}
let roleCreated = false;
let databaseCreated = false;
try {
  const binding = runDocker(
    container ? ['port', container, '5432/tcp'] : ['compose', 'port', 'postgres', '5432'],
  ).split('\n')[0];
  const port = /:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error('Cannot resolve the Docker PostgreSQL host port');
  runSql(`CREATE ROLE "${role}" LOGIN NOINHERIT PASSWORD '${password}';`);
  roleCreated = true;
  runSql(`CREATE DATABASE "${database}" OWNER "${role}";`);
  databaseCreated = true;
  console.log(`Created isolated PostgreSQL database: ${database}`);
  const jestCli = createRequire(import.meta.url).resolve('jest/bin/jest');
  const result = spawnSync(
    process.execPath,
    [
      jestCli,
      '--runInBand',
      '--runTestsByPath',
      'apps/community-service/src/modules/posts/posts.postgres.integration.spec.ts',
      '--silent',
    ],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        COMMUNITY_TEST_DATABASE_URL: `postgresql://${role}:${password}@127.0.0.1:${port}/${database}`,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (databaseCreated) {
    runSql(`DROP DATABASE "${database}" WITH (FORCE);`);
    console.log(`Removed isolated test database: ${database}`);
  }
  if (roleCreated) {
    runSql(`DROP ROLE "${role}";`);
    console.log('Removed temporary test role.');
  }
}
