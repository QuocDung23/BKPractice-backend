export const COURSE_QUIZ_CATALOG = Symbol('CourseQuizCatalog');
export interface CourseQuizSummary {
  id: string;
  title: string;
  status: string;
  deletedAt: Date | null;
  createdBy: string;
  sharedWith: string[];
}
export interface CourseQuizCatalog {
  findByIds(ids: string[]): Promise<Map<string, CourseQuizSummary>>;
}
