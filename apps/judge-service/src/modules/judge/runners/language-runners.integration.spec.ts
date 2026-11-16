import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SUPPORTED_LANGUAGES } from '@app/contracts';
import type { JudgeRequest, SupportedLanguage } from '@app/contracts';
import { runBoundedProcess } from '@judge/modules/judge/infrastructure/sandbox/bounded-process';
import { DockerSandboxAdapter } from '@judge/modules/judge/infrastructure/sandbox/docker-sandbox.adapter';
import { JudgeEngine } from '@judge/modules/judge/judge.engine';
import { ConfigService } from '@nestjs/config';

import { CRunner } from './c.runner';
import { CppRunner } from './cpp.runner';
import { JavaRunner } from './java.runner';
import { PythonRunner } from './python.runner';
import { RunnerRegistry } from './runner.registry';

/**
 * JDG-002 AC evidence against a real Docker daemon. Opt in with JUDGE_DOCKER_IT=1 after
 * `pnpm judge:images:build`; skipped otherwise so the default test run needs no daemon.
 */
const describeDocker = process.env.JUDGE_DOCKER_IT === '1' ? describe : describe.skip;

const programs: Record<SupportedLanguage, { echo: string; broken: string; crash: string }> = {
  c: {
    echo: '#include <stdio.h>\nint main(void){int n; if(scanf("%d",&n)!=1) return 1; printf("%d\\n",n); return 0;}',
    broken: 'int main(void){ return 0 }',
    crash: 'int main(void){ return 3; }',
  },
  cpp: {
    echo: '#include <iostream>\nint main(){int n; std::cin>>n; std::cout<<n<<"\\n";}',
    broken: 'int main(){ return 0 }',
    crash: '#include <stdexcept>\nint main(){ throw std::runtime_error("boom"); }',
  },
  java: {
    echo: 'import java.util.Scanner;\npublic class Main { public static void main(String[] a){ System.out.println(new Scanner(System.in).nextInt()); } }',
    broken: 'public class Main { public static void main(String[] a){ int x = ; } }',
    crash:
      'public class Main { public static void main(String[] a){ throw new RuntimeException("boom"); } }',
  },
  python: {
    echo: 'print(int(input()))',
    broken: 'def broken(:\n  pass',
    crash: 'raise SystemExit(3)',
  },
};

describeDocker('Language runners (real Docker)', () => {
  jest.setTimeout(120_000);
  let root: string;
  let engine: JudgeEngine;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-lang-it-'));
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

  const judge = (language: SupportedLanguage, sourceCode: string) =>
    engine.judge({
      executionId: `it-${language}`,
      submissionId: 'sub-it',
      mode: 'SUBMIT',
      problemType: 'STANDARD',
      language,
      sourceCode,
      testCases: [{ stdin: '42\n', expectedOutput: '42' }],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    } satisfies JudgeRequest);

  describe.each(SUPPORTED_LANGUAGES)('%s', (language) => {
    it('accepts a valid program that reads stdin and writes stdout', async () => {
      await expect(judge(language, programs[language].echo)).resolves.toMatchObject({
        status: 'ACCEPTED',
        passedTests: 1,
      });
    });

    it('reports a syntax error as COMPILE_ERROR without host paths', async () => {
      const result = await judge(language, programs[language].broken);
      expect(result.status).toBe('COMPILE_ERROR');
      expect(result.compileOutput).toBeTruthy();
      expect(result.compileOutput).not.toContain(root);
    });

    it('reports a failing program as RUNTIME_ERROR', async () => {
      await expect(judge(language, programs[language].crash)).resolves.toMatchObject({
        status: 'RUNTIME_ERROR',
      });
    });
  });
});
