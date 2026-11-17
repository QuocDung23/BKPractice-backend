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
 * JDG-004 AC evidence against a real Docker daemon and real toolchains. Opt in with
 * JUDGE_DOCKER_IT=1 after `pnpm judge:images:build`.
 *
 * The OOP contract here is a `Counter` with `inc()` and `get()`. Each test's stdin is an operation
 * sequence such as `inc inc get`; the harness interprets it and prints what `get` returns. A static
 * `created` count shows whether process state survives from one test case to the next.
 */
const describeDocker = process.env.JUDGE_DOCKER_IT === '1' ? describe : describe.skip;

const MARKER = 'HIDDEN_OOP_MARKER';

type OopLanguage = Exclude<SupportedLanguage, 'c'>;

interface Fixture {
  good: string;
  wrong: string;
  brokenLearner: string;
  missingMethod: string;
  crashingLearner?: string;
  harness: string;
  brokenHarness: string;
}

const fixtures: Record<OopLanguage, Fixture> = {
  cpp: {
    good: 'class Counter { int n = 0; public: static int created; Counter() { ++created; } void inc() { ++n; } int get() const { return n * 10 + created; } };\nint Counter::created = 0;',
    wrong:
      'class Counter { int n = 0; public: static int created; Counter() { ++created; } void inc() { n += 2; } int get() const { return n * 10 + created; } };\nint Counter::created = 0;',
    brokenLearner: 'class Counter { int n = 0 public: void inc() { ++n; } };',
    missingMethod:
      'class Counter { int n = 0; public: static int created; Counter() { ++created; } int get() const { return n; } };\nint Counter::created = 0;',
    harness: `#include <iostream>\n#include <string>\nint main() { /* ${MARKER} */ Counter c; std::string op; while (std::cin >> op) { if (op == "inc") c.inc(); else std::cout << c.get(); } }`,
    brokenHarness: `int main() { Counter c; return ${MARKER}; }`,
  },
  java: {
    good: 'class Counter { static int created = 0; private int n = 0; Counter() { created++; } void inc() { n++; } int get() { return n * 10 + created; } }',
    wrong:
      'class Counter { static int created = 0; private int n = 0; Counter() { created++; } void inc() { n += 2; } int get() { return n * 10 + created; } }',
    brokenLearner: 'class Counter { private int n = 0 void inc() { n++; } }',
    missingMethod:
      'class Counter { static int created = 0; private int n = 0; Counter() { created++; } int get() { return n; } }',
    crashingLearner:
      'class Counter { static int created = 0; Counter() { created++; } void inc() { throw new IllegalStateException("learner"); } int get() { return 0; } }',
    harness: `public class Main { public static void main(String[] a) { /* ${MARKER} */ Counter c = new Counter(); java.util.Scanner in = new java.util.Scanner(System.in); while (in.hasNext()) { if (in.next().equals("inc")) c.inc(); else System.out.print(c.get()); } } }`,
    brokenHarness: `public class Main { public static void main(String[] a) { new Counter(); ${MARKER}(); } }`,
  },
  python: {
    good: 'class Counter:\n    created = 0\n    def __init__(self):\n        self.n = 0\n        Counter.created += 1\n    def inc(self):\n        self.n += 1\n    def get(self):\n        return self.n * 10 + Counter.created',
    wrong:
      'class Counter:\n    created = 0\n    def __init__(self):\n        self.n = 0\n        Counter.created += 1\n    def inc(self):\n        self.n += 2\n    def get(self):\n        return self.n * 10 + Counter.created',
    brokenLearner: 'class Counter:\n    def inc(self:\n        pass',
    missingMethod:
      'class Counter:\n    created = 0\n    def __init__(self):\n        self.n = 0\n        Counter.created += 1\n    def get(self):\n        return self.n',
    crashingLearner:
      'class Counter:\n    def inc(self):\n        raise ValueError("learner")\n    def get(self):\n        return 0',
    harness: `import sys  # ${MARKER}\nc = Counter()\nfor op in sys.stdin.read().split():\n    if op == "inc":\n        c.inc()\n    else:\n        print(c.get(), end="")`,
    brokenHarness: `c = Counter(  # ${MARKER}\nx = [`,
  },
};

describeDocker('OOP judge (real Docker)', () => {
  jest.setTimeout(180_000);
  let root: string;
  let engine: JudgeEngine;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-oop-it-'));
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

  const judge = async (language: OopLanguage, sourceCode: string, hiddenHarness: string) => {
    const result = await engine.judge({
      executionId: `oop-${language}`,
      submissionId: 'sub-oop',
      mode: 'SUBMIT',
      problemType: 'OOP',
      language,
      sourceCode,
      hiddenHarness,
      // `get` prints n * 10 + created. A fresh process per test keeps `created` at 1.
      testCases: [
        { stdin: 'inc inc get', expectedOutput: '21', score: 50 },
        { stdin: 'inc get', expectedOutput: '11', score: 50 },
      ],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    } satisfies JudgeRequest);
    // JDG-004-AC-003 holds on every path.
    expect(JSON.stringify(result)).not.toContain(MARKER);
    return result;
  };

  describe.each(Object.keys(fixtures) as OopLanguage[])('%s', (language) => {
    const fixture = fixtures[language];

    it('accepts a correct class and keeps no process state between test cases (D-10.3)', async () => {
      await expect(judge(language, fixture.good, fixture.harness)).resolves.toMatchObject({
        status: 'ACCEPTED',
        passedTests: 2,
        score: 100,
      });
    });

    it('reports wrong stateful behaviour as WRONG_ANSWER', async () => {
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

    // The harness is the code that calls the missing method, so the failure is reported on a
    // harness line and the literal rule of D-10.4 yields INTERNAL_ERROR. Flagged to the spec owner.
    it('attributes a missing contract method to the harness region (D-10.4 as written)', async () => {
      await expect(judge(language, fixture.missingMethod, fixture.harness)).resolves.toMatchObject({
        status: 'INTERNAL_ERROR',
      });
    });

    if (fixture.crashingLearner) {
      it('reports an exception thrown by a learner method as RUNTIME_ERROR', async () => {
        await expect(
          judge(language, fixture.crashingLearner as string, fixture.harness),
        ).resolves.toMatchObject({ status: 'RUNTIME_ERROR' });
      });
    }
  });
});
