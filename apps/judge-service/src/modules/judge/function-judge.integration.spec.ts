import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { JudgeRequest, SupportedLanguage } from '@app/contracts';
import { ConfigService } from '@nestjs/config';

import { runBoundedProcess } from './infrastructure/sandbox/bounded-process';
import { DockerSandboxAdapter } from './infrastructure/sandbox/docker-sandbox.adapter';
import { JudgeEngine } from './judge.engine';
import { CRunner } from './runners/c.runner';
import { CppRunner } from './runners/cpp.runner';
import { JavaRunner } from './runners/java.runner';
import { PythonRunner } from './runners/python.runner';
import { RunnerRegistry } from './runners/runner.registry';

/**
 * JDG-003 AC evidence against a real Docker daemon and real toolchains. Opt in with
 * JUDGE_DOCKER_IT=1 after `pnpm judge:images:build`.
 */
const describeDocker = process.env.JUDGE_DOCKER_IT === '1' ? describe : describe.skip;

const MARKER = 'HIDDEN_HARNESS_MARKER';

interface Fixture {
  good: string;
  wrong: string;
  brokenLearner: string;
  crashingLearner?: string;
  harness: string;
  brokenHarness: string;
  crashingHarness?: string;
}

const fixtures: Record<SupportedLanguage, Fixture> = {
  c: {
    good: 'int twice(int n) { return n * 2; }',
    wrong: 'int twice(int n) { return n; }',
    brokenLearner: 'int twice(int n) { return n * 2 }',
    harness: `#include <stdio.h>\nint main(void) { int n; /* ${MARKER} */ if (scanf("%d", &n) != 1) return 1; printf("%d", twice(n)); return 0; }`,
    brokenHarness: `int main(void) { return ${MARKER}; }`,
  },
  cpp: {
    good: 'int twice(int n) { return n * 2; }',
    wrong: 'int twice(int n) { return n; }',
    brokenLearner: 'int twice(int n) { return n * 2 }',
    harness: `#include <iostream>\nint main() { int n; /* ${MARKER} */ std::cin >> n; std::cout << twice(n); }`,
    brokenHarness: `int main() { return ${MARKER}; }`,
  },
  java: {
    good: 'class Solution { static int twice(int n) { return n * 2; } }',
    wrong: 'class Solution { static int twice(int n) { return n; } }',
    brokenLearner: 'class Solution { static int twice(int n) { return n * 2 } }',
    crashingLearner: 'class Solution { static int twice(int n) { return n / 0; } }',
    harness: `public class Main { public static void main(String[] a) { /* ${MARKER} */ System.out.print(Solution.twice(new java.util.Scanner(System.in).nextInt())); } }`,
    brokenHarness: `public class Main { public static void main(String[] a) { ${MARKER}(); } }`,
    crashingHarness: `public class Main { public static void main(String[] a) { Solution.twice(1); throw new IllegalStateException("${MARKER}"); } }`,
  },
  python: {
    good: 'def twice(n):\n    return n * 2',
    wrong: 'def twice(n):\n    return n',
    brokenLearner: 'def twice(n:\n    return n * 2',
    crashingLearner: 'def twice(n):\n    return n // 0',
    harness: `print(twice(int(input())))  # ${MARKER}`,
    brokenHarness: `print(twice(int(input()))  # ${MARKER}\nx = (`,
    crashingHarness: `twice(1)\n${MARKER}()`,
  },
};

describeDocker('FUNCTION judge (real Docker)', () => {
  jest.setTimeout(180_000);
  let root: string;
  let engine: JudgeEngine;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-fn-it-'));
    engine = new JudgeEngine(
      new RunnerRegistry(new CRunner(), new CppRunner(), new JavaRunner(), new PythonRunner()),
      new DockerSandboxAdapter(
        new ConfigService({
          JUDGE_WORKSPACE_ROOT: root,
          JUDGE_DOCKER_BINARY: 'docker',
          JUDGE_MAX_OUTPUT_BYTES: 64 * 1024,
        }),
        runBoundedProcess,
      ),
    );
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const judge = async (language: SupportedLanguage, sourceCode: string, hiddenHarness: string) => {
    const result = await engine.judge({
      executionId: `fn-${language}`,
      submissionId: 'sub-fn',
      mode: 'SUBMIT',
      problemType: 'FUNCTION',
      language,
      sourceCode,
      hiddenHarness,
      testCases: [
        { stdin: '21\n', expectedOutput: '42', score: 60 },
        { stdin: '5\n', expectedOutput: '10', score: 40 },
      ],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    } satisfies JudgeRequest);
    // JDG-003-AC-003 holds on every path.
    expect(JSON.stringify(result)).not.toContain(MARKER);
    return result;
  };

  describe.each(Object.keys(fixtures) as SupportedLanguage[])('%s', (language) => {
    const fixture = fixtures[language];

    it('accepts a correct implementation called through the harness', async () => {
      await expect(judge(language, fixture.good, fixture.harness)).resolves.toMatchObject({
        status: 'ACCEPTED',
        passedTests: 2,
        score: 100,
      });
    });

    it('reports a wrong implementation as WRONG_ANSWER', async () => {
      await expect(judge(language, fixture.wrong, fixture.harness)).resolves.toMatchObject({
        status: 'WRONG_ANSWER',
        passedTests: 0,
      });
    });

    it('reports a learner compile error as COMPILE_ERROR', async () => {
      await expect(judge(language, fixture.brokenLearner, fixture.harness)).resolves.toMatchObject({
        status: 'COMPILE_ERROR',
      });
    });

    it('reports a harness compile error as INTERNAL_ERROR', async () => {
      const result = await judge(language, fixture.good, fixture.brokenHarness);
      expect(result).toMatchObject({ status: 'INTERNAL_ERROR', stderr: 'Harness failure' });
      expect(result).not.toHaveProperty('compileOutput');
    });

    if (fixture.crashingLearner && fixture.crashingHarness) {
      it('reports a learner crash as RUNTIME_ERROR', async () => {
        await expect(
          judge(language, fixture.crashingLearner as string, fixture.harness),
        ).resolves.toMatchObject({ status: 'RUNTIME_ERROR' });
      });

      it('reports a harness crash as INTERNAL_ERROR', async () => {
        await expect(
          judge(language, fixture.good, fixture.crashingHarness as string),
        ).resolves.toMatchObject({ status: 'INTERNAL_ERROR', stderr: 'Harness failure' });
      });
    }
  });
});
