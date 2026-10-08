const fs = require('fs');
const { db } = require('../server/db');
const L = require('../server/lib');

const courseDetail = JSON.parse(fs.readFileSync('.tmp/api-course-detail.json', 'utf8'));
const publicPosts = JSON.parse(fs.readFileSync('.tmp/api-posts.json', 'utf8'))
  .filter((post) => post.id === 2 || post.id === 3);

const run = db.transaction(() => {
  let course = db.prepare("SELECT * FROM courses WHERE title = ? OR title LIKE '[DEMO]%' ORDER BY id LIMIT 1")
    .get(courseDetail.title);

  if (!course) {
    const info = db.prepare(`INSERT INTO courses
      (title, description, price, thumbnail, level, duration, format, published, sort_order)
      VALUES (?, ?, ?, ?, ?, '', ?, 1, 1)`)
      .run(courseDetail.title, courseDetail.shortDescription, Number(courseDetail.price),
        'assets/photos/workshop-drive-03.jpg', 'Cơ bản', 'Video online');
    course = { id: Number(info.lastInsertRowid) };
  } else {
    db.prepare(`UPDATE courses SET title = ?, description = ?, price = ?, thumbnail = ?,
      level = ?, duration = '', format = ?, published = 1, sort_order = 1, updated_at = datetime('now')
      WHERE id = ?`)
      .run(courseDetail.title, courseDetail.shortDescription, Number(courseDetail.price),
        'assets/photos/workshop-drive-03.jpg', 'Cơ bản', 'Video online', course.id);
  }

  const lesson = courseDetail.lessons.find((item) => item.isPreview) || courseDetail.lessons[0];
  let video = db.prepare('SELECT * FROM videos WHERE course_id = ? ORDER BY id LIMIT 1').get(course.id);
  if (video) {
    db.prepare(`UPDATE videos SET title = ?, description = ?, source_type = 'file', file_name = ?,
      mime = 'video/mp4', embed_url = NULL, sort_order = 1, published = 1 WHERE id = ?`)
      .run(lesson.title, lesson.description, 'course-edit-video-basic-lesson-1.mp4', video.id);
    db.prepare('DELETE FROM videos WHERE course_id = ? AND id <> ?').run(course.id, video.id);
  } else {
    db.prepare(`INSERT INTO videos
      (course_id, title, description, source_type, file_name, mime, sort_order, published)
      VALUES (?, ?, ?, 'file', ?, 'video/mp4', 1, 1)`)
      .run(course.id, lesson.title, lesson.description, 'course-edit-video-basic-lesson-1.mp4');
  }

  db.prepare("DELETE FROM courses WHERE title LIKE '[DEMO]%' AND id <> ?").run(course.id);

  const demoPosts = db.prepare("SELECT id FROM posts WHERE title LIKE '[DEMO]%' ORDER BY id").all();
  const upsertPost = db.prepare(`INSERT INTO posts
    (title, slug, excerpt, content_md, content_html, cover, category, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, datetime('now'), datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt,
      content_md = excluded.content_md, content_html = excluded.content_html, cover = excluded.cover,
      category = excluded.category, status = 'published', published_at = excluded.published_at,
      updated_at = datetime('now')`);

  publicPosts.forEach((post, index) => {
    const cover = post.id === 2
      ? 'assets/photos/workshop-drive-03.jpg'
      : 'assets/photos/growth-solutions.jpg';
    upsertPost.run(post.title, post.slug, post.summary || '', post.content,
      L.renderMarkdown(post.content), cover, post.serviceTitle || 'Kiến thức', post.publishedAt);
    if (demoPosts[index]) db.prepare('DELETE FROM posts WHERE id = ?').run(demoPosts[index].id);
  });
  for (let i = publicPosts.length; i < demoPosts.length; i += 1) {
    db.prepare('DELETE FROM posts WHERE id = ?').run(demoPosts[i].id);
  }
});

run();
console.log('Imported verified Hinton course, preview lesson, and public posts.');
