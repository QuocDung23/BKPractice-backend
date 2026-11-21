import { seedIdentity } from './identity/seed';
import { seedLearningDatabase } from './learning/seed';

async function main(): Promise<void> {
  const users = await seedIdentity();
  const learning = await seedLearningDatabase();
  process.stdout.write(
    `Demo seed complete: ${users} accounts, ${learning.courses} courses, ${learning.problems} problems, ${learning.questions} bank questions, ${learning.quizzes} quizzes.\n`,
  );
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      'Demo seed failed. Rerun after resolving the failing service; completed service seeds are safe to rerun.\n',
    );
    process.exitCode = 1;
  });
}
