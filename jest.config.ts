import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts', '!**/main.ts', '!**/migrations/**'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/modules/quizzes/(.*)$': '<rootDir>/apps/learning-service/src/modules/quizzes/$1',
    '^@/modules/progress/(.*)$': '<rootDir>/apps/learning-service/src/modules/progress/$1',
    '^@/modules/problems/(.*)$': '<rootDir>/apps/learning-service/src/modules/problems/$1',
    '^@/infrastructure/persistence$':
      '<rootDir>/apps/learning-service/src/infrastructure/persistence',
    '^@/modules/courses/(.*)$': '<rootDir>/apps/learning-service/src/modules/courses/$1',
    '^@/infrastructure/redis$': '<rootDir>/apps/api-gateway/src/infrastructure/redis',
    '^@/application/realtime$': '<rootDir>/apps/api-gateway/src/application/realtime',
    '^@/application/proxy/(.*)$': '<rootDir>/apps/api-gateway/src/application/proxy/$1',
    '^@/(.*)$': '<rootDir>/apps/identity-service/src/$1',
    '^@app/common(.*)$': '<rootDir>/libs/common/src$1',
    '^@app/config(.*)$': '<rootDir>/libs/config/src$1',
    '^@app/contracts(.*)$': '<rootDir>/libs/contracts/src$1',
    '^@app/shared(.*)$': '<rootDir>/libs/shared/src$1',
    '^@gateway(.*)$': '<rootDir>/apps/api-gateway/src$1',
    '^@identity(.*)$': '<rootDir>/apps/identity-service/src$1',
    '^@learning(.*)$': '<rootDir>/apps/learning-service/src$1',
    '^@submission(.*)$': '<rootDir>/apps/submission-service/src$1',
    '^@judge(.*)$': '<rootDir>/apps/judge-service/src$1',
    '^@community(.*)$': '<rootDir>/apps/community-service/src$1',
  },
};

export default config;
