import { SUPPORTED_LANGUAGES } from '@app/contracts';
import type { SupportedLanguage } from '@app/contracts';
import { UnsupportedLanguageError } from '@judge/modules/judge/application/errors/unsupported-language.error';

import { CRunner } from './c.runner';
import { CppRunner } from './cpp.runner';
import { JavaRunner } from './java.runner';
import { PythonRunner } from './python.runner';
import { RunnerRegistry } from './runner.registry';

const registry = new RunnerRegistry(
  new CRunner(),
  new CppRunner(),
  new JavaRunner(),
  new PythonRunner(),
);

// The approved toolchain contract of JDG-002 (spec table, D-08.1..D-08.3).
const contract: Record<
  SupportedLanguage,
  { image: string; sourceFile: string; compile: string[]; execute: string[] }
> = {
  c: {
    image: 'bkpractice-judge-c:latest',
    sourceFile: 'main.c',
    compile: ['gcc', '-std=c17', '-O2', '-pipe', 'main.c', '-o', 'main'],
    execute: ['./main'],
  },
  cpp: {
    image: 'bkpractice-judge-cpp:latest',
    sourceFile: 'main.cpp',
    compile: ['g++', '-std=c++20', '-O2', '-pipe', 'main.cpp', '-o', 'main'],
    execute: ['./main'],
  },
  java: {
    image: 'bkpractice-judge-java:latest',
    sourceFile: 'Main.java',
    compile: ['javac', '-encoding', 'UTF-8', 'Main.java'],
    execute: ['java', '-Xss16m', 'Main'],
  },
  python: {
    image: 'bkpractice-judge-python:latest',
    sourceFile: 'main.py',
    compile: ['python3', '-m', 'py_compile', 'main.py'],
    execute: ['python3', '-I', 'main.py'],
  },
};

describe('RunnerRegistry', () => {
  it.each(SUPPORTED_LANGUAGES)('maps %s to its approved toolchain plan', (language) => {
    const runner = registry.get(language);
    expect(runner.language).toBe(language);
    expect(runner.image).toBe(contract[language].image);
    expect(runner.sourceFile).toBe(contract[language].sourceFile);
    expect(runner.compileCommand).toEqual(contract[language].compile);
    expect(runner.executeCommand).toEqual(contract[language].execute);
  });

  it.each(['ruby', '', 'cpp; rm -rf /', '__proto__', 'constructor'])(
    'rejects unapproved language %p without echoing it',
    (language) => {
      const act = () => registry.get(language as SupportedLanguage);
      expect(act).toThrow(UnsupportedLanguageError);
      expect(act).toThrow(/^Unsupported language$/);
    },
  );
});
