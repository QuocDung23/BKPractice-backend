import { HealthModule, RabbitMqModule } from '@app/common';
import { databaseOptions, validateEnvironment } from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoursesModule } from './modules/courses/courses.module';
import { learningEntities } from './modules/learning.entities';
import { ProblemsModule } from './modules/problems/problems.module';
import { ProgressModule } from './modules/progress/progress.module';

import { QuizzesModule } from '@/modules/quizzes/quizzes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment('learning-service') }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(config.getOrThrow<string>('LEARNING_DATABASE_URL'), learningEntities),
    }),
    RabbitMqModule,
    ProblemsModule,
    QuizzesModule,
    CoursesModule,
    ProgressModule,
    HealthModule.forService('learning-service'),
  ],
})
export class LearningServiceModule {}
