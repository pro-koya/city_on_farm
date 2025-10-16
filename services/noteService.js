// services/noteService.js
const RSSParser = require('rss-parser');
const sanitizeHtml = require('sanitize-html');
const NodeCache = require('node-cache');

const NOTE_CREATOR = process.env.NOTE_CREATOR || '';
const NOTE_PER_PAGE = Number(process.env.NOTE_PER_PAGE || 12);
const NOTE_CACHE_SECONDS = Number(process.env.NOTE_CACHE_SECONDS || 300);
const NOTE_API_BASE = process.env.NOTE_API_BASE || 'https://note.com';

const cache = new NodeCache({ stdTTL: NOTE_CACHE_SECONDS });
const rssParser = new RSSParser();

function extractNoteId(url = '') {
  const m = url.match(/\/n\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * note の非公式 API（Web クライアントが叩いている JSON）を試す
 * 例: GET https://note.com/api/v2/creators/:creator/contents?kind=note&page=1&per_page=20
 */
async function fetchNotesJson(page = 1, perPage = NOTE_PER_PAGE) {
  const url = `${NOTE_API_BASE}/api/v2/creators/${encodeURIComponent(NOTE_CREATOR)}/contents?kind=note&page=${page}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('note JSON api not ok');
  const data = await res.json();
  // だいたい data.data.contents に配列が入る想定（変化し得るのでガード）
  const items = data?.data?.contents || [];
  const total = data?.data?.total || items.length;

  // 表示用に正規化
  const posts = items.map(x => {
    // note の記事 URL 形式: https://note.com/{creator}/n/{noteId}
    const noteId = x?.key || x?.id || '';
    const title  = x?.name || x?.title || '';
    const createdAt = x?.publishAt || x?.publishedAt || x?.createdAt || x?.created_at;
    const cover = x?.eyecatch || x?.coverImage || x?.thumbnail || x?.image?.url || null;
    const id = x?.id || x?.link || '';
    console.log(noteId);
    console.log(id);

    return {
      id: noteId,
      slug: noteId,
      title: title,
      excerpt: (x?.excerpt || x?.bodySummary || x?.body).replace(/\s+/g, ' ').slice(0, 50) || '',
      publishedAt: createdAt ? new Date(createdAt) : null,
      thumbnail: cover,
      category: (x?.categories?.[0]?.name) || (x?.category?.name) || '記事',
      author: {
        name: x?.user?.name || x?.author?.name || NOTE_CREATOR,
        avatar: x?.user?.userImage || x?.author?.icon || null,
        bio: ''
      },
      url: `${NOTE_API_BASE}/${encodeURIComponent(NOTE_CREATOR)}/n/${noteId}`
    };
  });

  return { posts, total };
}

/**
 * フォールバック: RSS を解析
 * 例: https://note.com/{creator}/rss
 */
async function fetchNotesRSS(page = 1, perPage = NOTE_PER_PAGE) {
  const url = `${NOTE_API_BASE}/${encodeURIComponent(NOTE_CREATOR)}/rss`;
  const feed = await rssParser.parseURL(url);

  // RSS は全件なので手動ページング
  const items = feed.items || [];
  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);

  const posts = slice.map(it => {
    // /n/{id} を抽出
    const noteId = extractNoteId(it.link || it.guid);
    return {
      id: noteId,
      slug: noteId,
      title: it.title || '',
      excerpt: (it.contentSnippet || it.content || '').replace(/\s+/g, ' ').slice(0, 50),
      publishedAt: it.isoDate ? new Date(it.isoDate) : (it.pubDate ? new Date(it.pubDate) : null),
      thumbnail: it.enclosure?.url || null, // RSS の enclosure をサムネ代わり
      category: (it.categories && it.categories[0]) || '記事',
      author: {
        name: NOTE_CREATOR,
        avatar: null,
        bio: ''
      },
      url: it.link
    };
  });

  return { posts, total: items.length };
}

/** 一覧取得（キャッシュ付き・JSON→RSS フォールバック） */
async function getList(page = 1, perPage = NOTE_PER_PAGE) {
  const key = `list:${page}:${perPage}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const data = await fetchNotesJson(page, perPage);
    cache.set(key, data);
    return data;
  } catch {
    const data = await fetchNotesRSS(page, perPage);
    cache.set(key, data);
    return data;
  }
}

/** 記事の詳細 HTML（note 本文）を取得（キャッシュ付き） */
// 置き換え：getDetail(noteId)
async function getDetail(noteId) {
  const key = `detail:${noteId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const creator = NOTE_CREATOR || '';
  // クリエイターの表記ゆれに対応（/creator, /@creator の両方を試す）
  const c1 = creator.startsWith('@') ? creator.slice(1) : creator;
  const tryUrls = [
    `${NOTE_API_BASE}/${encodeURIComponent(c1)}/n/${noteId}`,
    `${NOTE_API_BASE}/@${encodeURIComponent(c1)}/n/${noteId}`
  ];

  // UA と言語を入れて弾かれにくくする
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    'Accept-Language': 'ja,en;q=0.9'
  };

  let lastStatus = 0;
  let html = null;
  let finalUrl = null;

  for (const url of tryUrls) {
    const res = await fetch(url, { headers, redirect: 'follow' });
    lastStatus = res.status;
    if (res.ok) {
      html = await res.text();
      finalUrl = url;
      break;
    }
  }

  if (!html) {
    // 状況がわかるように詳細なエラーを出す
    const err = new Error(`note detail fetch failed: status=${lastStatus}, tried=${tryUrls.join(' | ')}`);
    err.status = lastStatus;
    throw err;
  }

  // ---- ここから本文抽出（簡易版：必要に応じて強化）----
  const safe = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','figure','figcaption','video','source']),
    allowedAttributes: {
      a: ['href','name','target','rel'],
      img: ['src','alt','width','height','loading'],
      video: ['src','controls','poster','width','height'],
      source: ['src','type'],
      '*': ['id','class','style']
    },
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener nofollow' }
      })
    }
  });

  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+note.*$/i, '').trim() : '記事';

  const detail = {
    id: noteId,
    title,
    contentHtml: safe,
    sourceUrl: finalUrl
  };
  cache.set(key, detail);
  return detail;
}

module.exports = {
  getList,
  getDetail,
  perPage: NOTE_PER_PAGE
};