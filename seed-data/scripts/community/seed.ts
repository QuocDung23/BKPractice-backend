import communityDataSource from '@community/database/data-source';

import type { LearningFixtures } from '../learning/seed';
import { insertRows, stableUuid } from '../seed-utils';

const topics = [
  [
    'Kiểm tra trường hợp biên',
    'Mình thử dãy chỉ có một phần tử và dãy toàn số âm trước khi chạy bộ kiểm thử. Mọi người còn ca biên nào hay gặp không?',
  ],
  [
    'Tách bước đọc dữ liệu',
    'Tách phần đọc input và phần xử lý giúp mình chạy thử với nhiều bộ dữ liệu dễ hơn. Mình đang so sánh cách đọc bằng dòng và bằng token.',
  ],
  [
    'So sánh hai cách giải',
    'Mình viết bản giải đơn giản trước để làm chuẩn, sau đó mới tối ưu thời gian. Cách này giúp kiểm tra kết quả trên nhiều dữ liệu nhỏ.',
  ],
  [
    'Ghi chú khi ôn tập',
    'Mình ghi lại giả thiết của đề bài và vài ví dụ tự tính tay trước khi bắt đầu viết mã. Đây là cách mình dùng để hạn chế hiểu nhầm định dạng.',
  ],
  [
    'Chọn cấu trúc dữ liệu phù hợp',
    'Mình đang cân nhắc giữa lưu toàn bộ dữ liệu và xử lý từng phần tử khi đọc. Có thể tiết kiệm bộ nhớ nếu chỉ cần giữ một vài biến tổng hợp.',
  ],
  [
    'Đọc lại lời giải sau khi Accepted',
    'Sau khi bài chạy đúng, mình đọc lại để rõ hơn cách đặt tên, độ phức tạp và những trường hợp có thể tái sử dụng ý tưởng.',
  ],
] as const;
const comments = [
  'Mình bổ sung ca có các giá trị trùng nhau để kiểm tra cách xử lý.',
  'Có thể chạy thử từng bước trên ví dụ nhỏ trước khi kiểm tra dữ liệu lớn.',
  'Mình đã so sánh bằng một bản vét cạn và thấy cách này dễ kiểm tra hơn.',
  'Nhớ đối chiếu cả định dạng xuống dòng và thứ tự kết quả của đề.',
  'Cách này dễ theo dõi. Mình sẽ thử thêm ca với số âm và số không.',
  'Mình thường viết xuống điều kiện cần giữ sau mỗi vòng lặp để dễ tìm lỗi.',
] as const;

export function planCommunity(lecturerIds: string[], fixtures: LearningFixtures, now: Date) {
  const posts: unknown[][] = [];
  const replies: unknown[][] = [];
  const reactions: unknown[][] = [];
  const bookmarks: unknown[][] = [];
  const reports: unknown[][] = [];
  for (const [index, authorId] of lecturerIds.entries()) {
    for (let postIndex = 0; postIndex < 30; postIndex++) {
      const order = index * 30 + postIndex;
      const scope = (['GLOBAL', 'PROBLEM', 'COURSE'] as const)[order % 3]!;
      const problem =
        scope === 'PROBLEM'
          ? fixtures.problems[(order * 13) % fixtures.problems.length]
          : undefined;
      const course =
        scope === 'COURSE' ? fixtures.courses[(order * 7) % fixtures.courses.length] : undefined;
      const [title, body] = topics[(index + postIndex * 3) % topics.length]!;
      const subject = problem?.title ?? course?.title;
      const postId = stableUuid(`ui-seed:post:${authorId}:${postIndex}`);
      const postedAt = new Date(now.getTime() - (8 + ((order * 23) % 1_080)) * 3_600_000);
      posts.push([
        postId,
        authorId,
        scope,
        `## ${title}${subject ? ` — ${subject}` : ''}\n\n${body}`,
        problem?.id ?? null,
        course?.id ?? null,
        false,
        order % 61 === 17,
        postedAt,
        postedAt,
      ]);

      const participantCount = Math.min(lecturerIds.length - 1, 6 + (order % 21));
      for (let offset = 1; offset <= participantCount; offset++) {
        const participantId = lecturerIds[(index + postIndex * 29 + offset) % lecturerIds.length]!;
        if (participantId === authorId) continue;
        const activityAt = new Date(postedAt.getTime() + offset * 90_000);
        reactions.push([
          stableUuid(`ui-seed:reaction:${postId}:${participantId}`),
          postId,
          participantId,
          'LIKE',
          activityAt,
        ]);
        if (offset % 3 === 0)
          bookmarks.push([
            stableUuid(`ui-seed:bookmark:${postId}:${participantId}`),
            postId,
            participantId,
            activityAt,
          ]);
        if (offset <= 2 + (order % 5)) {
          const commentId = stableUuid(`ui-seed:comment:${postId}:${participantId}`);
          replies.push([
            commentId,
            postId,
            participantId,
            null,
            comments[(order + offset) % comments.length],
            false,
            activityAt,
            activityAt,
          ]);
          if (offset === 1 && order % 3 === 0) {
            const replyAt = new Date(activityAt.getTime() + 60_000);
            replies.push([
              stableUuid(`ui-seed:reply:${commentId}`),
              postId,
              authorId,
              commentId,
              'Cảm ơn bạn. Mình đã bổ sung ca kiểm thử này vào ghi chú.',
              false,
              replyAt,
              replyAt,
            ]);
          }
        }
        if (offset === 1 && order % 21 === 0) {
          reports.push([
            stableUuid(`ui-seed:report:${postId}:${participantId}`),
            postId,
            participantId,
            'Báo cáo mô phỏng để kiểm tra màn kiểm duyệt.',
            'OPEN',
            activityAt,
          ]);
        }
      }
    }
  }
  return { posts, replies, reactions, bookmarks, reports };
}

export async function seedCommunity(content: ReturnType<typeof planCommunity>): Promise<void> {
  await communityDataSource.initialize();
  try {
    await communityDataSource.transaction(async (manager) => {
      await insertRows(
        manager,
        'posts',
        [
          'id',
          'author_id',
          'scope',
          'content',
          'problem_id',
          'course_id',
          'is_pinned',
          'is_hidden',
          'created_at',
          'updated_at',
        ],
        content.posts,
      );
      await insertRows(
        manager,
        'comments',
        [
          'id',
          'post_id',
          'author_id',
          'parent_comment_id',
          'content',
          'is_hidden',
          'created_at',
          'updated_at',
        ],
        content.replies,
      );
      await insertRows(
        manager,
        'reactions',
        ['id', 'post_id', 'user_id', 'type', 'created_at'],
        content.reactions,
        '(post_id, user_id)',
      );
      await insertRows(
        manager,
        'bookmarks',
        ['id', 'post_id', 'user_id', 'created_at'],
        content.bookmarks,
        '(post_id, user_id)',
      );
      await insertRows(
        manager,
        'reports',
        ['id', 'post_id', 'reporter_id', 'reason', 'status', 'created_at'],
        content.reports,
      );
    });
  } finally {
    await communityDataSource.destroy();
  }
}
