// 既存
async function renderDescHtml(raw = '') {
  const { marked } = await import('marked');
  const sanitizeHtml = require('sanitize-html');

  let md = String(raw || '').replace(/\r\n/g, '\n').trim();
  md = md.replace(/\n{3,}/g, '\n\n');

  const html = marked.parse(md, { breaks: true });
  const safe = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1','h2','img','table','thead','tbody','tr','th','td']),
    allowedAttributes: {
      a: ['href','name','target','rel'],
      img: ['src','alt','title','width','height'],
      '*': ['id','class','style']
    },
    allowedSchemes: ['http','https','data','mailto'],
  }).trim();

  return safe;
}

// 追加：HTML → Markdown（フォーム表示用に戻す）
function htmlToRaw(html = '') {
  const TurndownService = require('turndown');
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });
  // br → 改行、p → 段落、といったシンプルなMarkdownへ
  return td.turndown(String(html || '').trim());
}

module.exports = { renderDescHtml, htmlToRaw };