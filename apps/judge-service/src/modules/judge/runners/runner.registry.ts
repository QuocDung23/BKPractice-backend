import type { SupportedLanguage } from '@app/contracts';
import { UnsupportedLanguageError } from '@judge/modules/judge/application/errors/unsupported-language.error';
import { Injectable } from '@nestjs/common';

import { CRunner } from './c.runner';
import { CppRunner } from './cpp.runner';
import { JavaRunner } from './java.runner';
import type { LanguageRunner } from './language-runner';
import { PythonRunner } from './python.runner';

@Injectable()
export class RunnerRegistry {
  private readonly runners: Map<SupportedLanguage, LanguageRunner>;

  constructor(c: CRunner, cpp: CppRunner, java: JavaRunner, python: PythonRunner) {
    this.runners = new Map([c, cpp, java, python].map((runner) => [runner.language, runner]));
  }

  get(language: SupportedLanguage): LanguageRunner {
    const runner = this.runners.get(language);
    if (!runner) throw new UnsupportedLanguageError();
    return runner;
  }
}
