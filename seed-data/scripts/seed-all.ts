import { planCommunity, seedCommunity } from './community/seed';
import { readDemoUsers, seedIdentity } from './identity/seed';
import { planQuizActivity, seedLearningActivity } from './learning/activity';
import { readLearningFixtures, seedLearningDatabase } from './learning/seed';
import { SeedDataError } from './seed-utils';
import { planSubmissions, seedSubmissions } from './submission/seed';

async function main(): Promise<void> {
  const users = readDemoUsers();
  const students = users.filter((user) => user.role === 'STUDENT');
  const fixtures = readLearningFixtures();
  const now = new Date();
  const submissions = planSubmissions(students, fixtures.problems, now);
  const quiz = planQuizActivity(students, fixtures, now);
  const community = planCommunity(students, fixtures, now);
  const counts = {
    students: students.length,
    lecturers: users.length - students.length,
    courses: fixtures.courses.length,
    chapters: fixtures.courses.reduce((total, course) => total + course.chapters.length, 0),
    problems: fixtures.problems.length,
    questions: fixtures.questions.length,
    quizzes: fixtures.quizzes.length,
    submissions: submissions.length,
    solves: submissions.filter(({ status }) => status === 'ACCEPTED').length,
    runs: submissions.filter(({ status }) => status === 'EXECUTED').length,
    attempts: quiz.attempts.length,
    answers: quiz.answers.length,
    posts: community.posts.length,
    comments: community.replies.length,
    reactions: community.reactions.length,
    bookmarks: community.bookmarks.length,
    reports: community.reports.length,
  };
  const summary = JSON.stringify(counts, null, 2);
  if (process.argv.includes('--dry-run')) {
    process.stdout.write(`Demo seed plan (no database changes)\n${summary}\n`);
    return;
  }

  await seedIdentity(users);
  process.stdout.write('Identity demo accounts ready.\n');
  await seedLearningDatabase(fixtures);
  process.stdout.write('Learning catalog ready.\n');
  const { solves, attempted } = await seedSubmissions(submissions);
  process.stdout.write('Submission history ready.\n');
  await seedLearningActivity(solves, attempted, quiz);
  process.stdout.write('Learning progress and quiz history ready.\n');
  await seedCommunity(community);
  process.stdout.write(`Demo seed complete. Planned records\n${summary}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      error instanceof SeedDataError
        ? `${error.message}\n`
        : 'Demo seed failed. Check migrations and database configuration for the next service in the seed sequence. Completed stages can be rerun.\n',
    );
    process.exitCode = 1;
  });
}
