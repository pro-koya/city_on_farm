// services/blogService.js
// ブログの検索・前後・関連記事などのロジックを集約

function findPost(slug, posts) {
  return posts.find(p => p.slug === slug) || null;
}

function getPrev(currentPost, posts) {
  const index = posts.findIndex(p => p.slug === currentPost.slug);
  return index > 0 ? posts[index - 1] : null;
}

function getNext(currentPost, posts) {
  const index = posts.findIndex(p => p.slug === currentPost.slug);
  return index >= 0 && index < posts.length - 1 ? posts[index + 1] : null;
}

function getRelated(currentPost, posts, limit = 3) {
  return posts
    .filter(p => p.category === currentPost.category && p.slug !== currentPost.slug)
    .slice(0, limit);
}

function getCategories(posts) {
  return [...new Set(posts.map(p => p.category))];
}

module.exports = { findPost, getPrev, getNext, getRelated, getCategories };