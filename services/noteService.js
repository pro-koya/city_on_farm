// services/noteService.js
const NodeCache = require('node-cache');
const sanitizeHtml = require('sanitize-html');

const NOTE_CREATOR = process.env.NOTE_CREATOR || '';          // ex) "koyablog1104" or "@koyablog1104"
const NOTE_PER_PAGE = Number(process.env.NOTE_PER_PAGE || 20); // note 側の1ページ取得サイズ（内部用）
const NOTE_CACHE_SECONDS = Number(process.env.NOTE_CACHE_SECONDS || 300);
const NOTE_API_BASE = process.env.NOTE_API_BASE || 'https://note.com';

const cache = new NodeCache({ stdTTL: NOTE_CACHE_SECONDS });

/** 記事ID抽出（RSSフォールバック用） */
function extractNoteId(url = '') {
  const m = url.match(/\/n\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function firstString(...candidates) {
  for (const v of candidates) {
    if (!v && v !== 0) continue;
    if (typeof v === 'string') return v;
    // オブジェクトや配列から URL らしき文字列を拾う
    if (typeof v === 'object') {
      // よくあるパターン
      if (typeof v.url === 'string') return v.url;
      if (typeof v.image === 'string') return v.image;
      if (typeof v.originalUrl === 'string') return v.originalUrl;
      if (Array.isArray(v) && v.length) {
        const s = v.find(x => typeof x === 'string');
        if (s) return s;
        const u = v.find(x => x && typeof x.url === 'string');
        if (u) return u.url;
      }
      // 1階層だけ総当たり（過剰に重くしない）
      for (const k of Object.keys(v)) {
        const val = v[k];
        if (typeof val === 'string' && /^https?:\/\//.test(val)) return val;
        if (val && typeof val === 'object' && typeof val.url === 'string') return val.url;
      }
    }
  }
  return null;
}

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, '$&\n') // ブロック閉じで改行
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- 追加：RSS フォールバック（全件） ---
async function fetchAllPostsRSS() {
  const creator = (process.env.NOTE_CREATOR || '').replace(/^@/, '');
  const url = `${NOTE_API_BASE}/${encodeURIComponent(creator)}/rss`;
  const RSSParser = require('rss-parser');
  const rssParser = new RSSParser();
  const feed = await rssParser.parseURL(url);

  const items = feed.items || [];
  return items.map(it => {
    const noteId = extractNoteId(it.link || it.guid);
    const ex = stripHtml(firstString(it.contentSnippet, it.content)) || '';
    return {
      id: noteId,
      slug: noteId,
      title: it.title || '',
      excerpt: ex.slice(0, 120),
      publishedAt: it.isoDate ? new Date(it.isoDate) : (it.pubDate ? new Date(it.pubDate) : null),
      updatedAt: it.isoDate ? new Date(it.isoDate) : null,
      thumbnail: firstString(it.enclosure?.url), // なければ null
      category: (it.categories && it.categories[0]) || '記事',
      popularity: 0,
      author: { name: creator, avatar: null, bio: '' },
      url: it.link
    };
  });
}

async function fetchNotesJsonPage(page = 1, perPage = NOTE_PER_PAGE) {
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

    return {
      id: noteId,
      slug: noteId,
      title: title,
      excerpt: (x?.excerpt || x?.bodySummary || x?.body).replace(/\s+/g, ' ').slice(0, 50) || '',
      publishedAt: createdAt ? new Date(createdAt) : null,
      thumbnail: cover,
      popularity: x?.likeCount || 0,
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

/** 全件取得（必要ページを一括でフェッチ）＋キャッシュ */
async function fetchAllPosts() {
  const key = 'allPosts';
  const hit = cache.get(key);
  if (hit) return hit;

  const MAX_PAGES = 50; // 安全弁（約 1000 件想定）
  const seen = new Set();
  const allItems = [];

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { posts, total } = await fetchNotesJsonPage(page, NOTE_PER_PAGE);

      // 終端：件数ゼロ
      if (!posts.length) break;

      for (const post of posts) {
        allItems.push(post);
      }
    }
    const posts = allItems;
    cache.set(key, posts);
    return posts;
  } catch (e) {
    console.log(e);
    // 失敗時は RSS 全件でフォールバック
    const posts = await fetchAllPostsRSS();
    cache.set(key, posts);
    return posts;
  }
}

/** フィルタ＆ソート＆ページング */
function filterSortPaginate(all, { q='', category='all', sort='published_desc', page=1, perPage=12 }) {
  let list = all;

  // 検索（タイトル・抜粋）
  if (q) {
    const s = q.trim().toLowerCase();
    list = list.filter(p =>
      (p.title || '').toLowerCase().includes(s) ||
      (p.excerpt || '').toLowerCase().includes(s)
    );
  }

  // カテゴリ
  if (category && category !== 'all') {
    list = list.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
  }

  // 並び替え
  const cmp = {
    'published_desc': (a,b) => (b.publishedAt?.getTime()||0) - (a.publishedAt?.getTime()||0),
    'published_asc' : (a,b) => (a.publishedAt?.getTime()||0) - (b.publishedAt?.getTime()||0),
    'updated_desc'  : (a,b) => (b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0),
    'updated_asc'   : (a,b) => (a.updatedAt?.getTime()||0) - (b.updatedAt?.getTime()||0),
    'popular_desc'  : (a,b) => (b.popularity||0) - (a.popularity||0),
    'popular_asc'   : (a,b) => (a.popularity||0) - (b.popularity||0),
  }[sort] || ((a,b) => (b.publishedAt?.getTime()||0) - (a.publishedAt?.getTime()||0));
  list = list.slice().sort(cmp);

  // カテゴリ一覧（UI用）
  const categories = Array.from(
    list.reduce((m, p) => m.set(p.category || '記事', (m.get(p.category || '記事') || 0) + 1), new Map())
  ).map(([name, count]) => ({ name, count }))
   .sort((a,b)=> a.name.localeCompare(b.name, 'ja'));

  // ページング
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(Math.max(1, page), pageCount);
  const start = (cur - 1) * perPage;
  const posts = list.slice(start, start + perPage);

  return { posts, total, page: cur, pageCount, categories };
}

/** 公開API：一覧（フィルタ・ソート・ページング） */
async function getListFiltered({ q='', category='all', sort='published_desc', page=1, perPage=12 } = {}) {
  const all = await fetchAllPosts();
  return filterSortPaginate(all, { q, category, sort, page, perPage });
}

/** 記事詳細（HTMLそのままサニタイズして返す） */
async function getDetail(noteId) {
  const key = `detail:${noteId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const creator = NOTE_CREATOR.replace(/^@/, '');
  const tryUrls = [
    `${NOTE_API_BASE}/${encodeURIComponent(creator)}/n/${noteId}`,
    `${NOTE_API_BASE}/@${encodeURIComponent(creator)}/n/${noteId}`
  ];
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    'Accept-Language': 'ja,en;q=0.9'
  };

  let html = null, finalUrl = null, lastStatus = 0;
  for (const url of tryUrls) {
    const res = await fetch(url, { headers, redirect: 'follow' });
    lastStatus = res.status;
    if (res.ok) { html = await res.text(); finalUrl = url; break; }
  }
  if (!html) {
    const err = new Error(`note detail fetch failed: status=${lastStatus}, tried=${tryUrls.join(' | ')}`);
    err.status = lastStatus;
    throw err;
  }

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

  const detail = { id: noteId, title, contentHtml: safe, sourceUrl: finalUrl };
  cache.set(key, detail);
  return detail;
}

module.exports = {
  getListFiltered,
  getDetail,
};