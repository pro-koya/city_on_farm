/**
 * リッチテキストエディター専用ページ
 * RICH_TEXT_EDITOR_PLAN.md に基づく
 */
const sanitizeHtml = require('sanitize-html');

const DEFAULT_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  'h1', 'h2', 'h3', 'h4', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
]);
const DEFAULT_ATTRS = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'class'],
  '*': ['id', 'class', 'style']
};

function sanitize(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: DEFAULT_TAGS,
    allowedAttributes: DEFAULT_ATTRS,
    allowedSchemes: ['http', 'https', 'data', 'mailto']
  }).trim();
}

const CONTEXT_TITLES = {
  product: '商品説明を編集',
  profile: '出品者ストーリーを編集',
  campaign: 'キャンペーン詳細を編集',
  default: 'リッチテキストを編集'
};

function registerEditorRoutes(app, requireAuth) {
  // GET /editor - エディターページ（クエリで context, return, sessionKey, subjectName）
  app.get('/editor', requireAuth, (req, res) => {
    const context = (req.query.context || 'default').trim();
    const returnUrl = (req.query.return || req.query.returnUrl || '/').trim();
    const sessionKey = (req.query.sessionKey || '').trim();
    let subjectName = (req.query.subjectName || '').trim();

    let initialHtml = '';
    if (sessionKey && req.session?.editorDraft?.[sessionKey]) {
      initialHtml = req.session.editorDraft[sessionKey];
      const meta = req.session.editorDraftMeta?.[sessionKey];
      if (meta?.subjectName && !subjectName) subjectName = meta.subjectName;
      delete req.session.editorDraft[sessionKey];
      delete req.session.editorDraftMeta?.[sessionKey];
    }
    // </script> が含まれるとインライン script が壊れるため、JSON をエスケープ
    const initialHtmlSafeJson = JSON.stringify(initialHtml || '')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/<\/script/gi, '\\u003c/script');

    res.set('Cache-Control', 'no-store');
    res.render('editor/index', {
      pageTitle: CONTEXT_TITLES[context] || CONTEXT_TITLES.default,
      returnUrl,
      context,
      subjectName,
      initialHtmlSafeJson,
      csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null
    });
  });

  // POST /editor - エディターを開く（フォームから html を渡す）
  app.post('/editor', requireAuth, (req, res) => {
    const html = sanitize(req.body.html || '');
    const context = (req.body.context || 'default').trim();
    const returnUrl = (req.body.returnUrl || req.body.return || '/').trim();
    const subjectName = String(req.body.subjectName || '').trim();

    const sessionKey = `k_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    req.session.editorDraft = req.session.editorDraft || {};
    req.session.editorDraft[sessionKey] = html;
    req.session.editorDraftMeta = req.session.editorDraftMeta || {};
    req.session.editorDraftMeta[sessionKey] = { subjectName };

    let url = `/editor?context=${encodeURIComponent(context)}&return=${encodeURIComponent(returnUrl)}&sessionKey=${encodeURIComponent(sessionKey)}`;
    if (subjectName) url += `&subjectName=${encodeURIComponent(subjectName)}`;
    res.redirect(url);
  });

  // POST /api/editor/draft - 保存して戻る
  app.post('/api/editor/draft', requireAuth, (req, res) => {
    const html = sanitize(req.body.html || '');
    const returnUrl = (req.body.returnUrl || req.body.return || '/').trim();
    const context = (req.body.context || 'default').trim();

    req.session.editorDraftResult = { html, context, returnUrl };
    res.redirect(returnUrl || '/');
  });
}

module.exports = { registerEditorRoutes, sanitize };
