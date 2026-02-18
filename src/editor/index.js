/**
 * リッチテキストエディター（Tiptap）
 * RICH_TEXT_EDITOR_PLAN.md に基づく専用エディターページ用
 * 出力: HTML（description_html / intro_html / body_html と統一）
 * 画像: R2保存 → r2_assets DB登録 → URLをHTMLに埋め込み
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

/** コンテキスト別のプレースホルダー */
const PLACEHOLDERS = {
  product: '栽培方法、味の特徴、保存方法、おすすめレシピなど',
  profile: '自己紹介、栽培のこだわり、土・水・環境への想いなどを自由に記載',
  campaign: 'キャンペーンの詳細を入力してください。見出し・画像・表で構成できます。',
  default: 'テキストを入力... / でメニューを開く'
};

/**
 * エディターを初期化
 * @param {HTMLElement} element - エディターをマウントする要素
 * @param {Object} opts
 * @param {string} opts.initialHtml - 初期HTML
 * @param {string} opts.context - product | profile | campaign
 * @param {Function} opts.onUpdate - 内容更新時のコールバック (html) => void
 */
export function createEditor(element, opts = {}) {
  const { initialHtml = '', context = 'default', onUpdate } = opts;
  const placeholder = PLACEHOLDERS[context] || PLACEHOLDERS.default;

  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] }
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'editor-image' }
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'editor-table' }
      }),
      TableRow,
      TableHeader,
      TableCell
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content',
        'data-placeholder': placeholder
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageDrop(editor, file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) handleImageDrop(editor, file);
              return true;
            }
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (typeof onUpdate === 'function') onUpdate(html);
    }
  });

  return editor;
}

/**
 * 画像ドロップ/ペースト時のアップロード処理
 * /uploads/sign と /uploads/confirm を使用
 */
async function handleImageDrop(editor, file) {
  try {
    const url = await uploadImageToR2(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  } catch (err) {
    console.error('Image upload failed:', err);
    alert('画像のアップロードに失敗しました。');
  }
}

/**
 * R2アップロード（/uploads/sign → 署名付きPUT → /uploads/confirm）
 */
async function uploadImageToR2(file) {
  const csrfEl = document.querySelector('meta[name="csrf-token"]') || document.querySelector('input[name="_csrf"]');
  const token = (csrfEl?.content || csrfEl?.value || '').trim();

  const signRes = await fetch('/uploads/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      mime: file.type,
      ext: (file.name.split('.').pop() || '').toLowerCase() || 'jpg',
      bytes: file.size
    })
  });
  if (!signRes.ok) {
    const data = await signRes.json().catch(() => ({}));
    throw new Error(data.message || '署名の取得に失敗しました');
  }
  const signData = await signRes.json();
  if (signData.exists && signData.image?.url) {
    return signData.image.url;
  }
  const { putUrl, key } = signData;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  });
  if (!putRes.ok) throw new Error('画像のアップロードに失敗しました');
  const confirmRes = await fetch('/uploads/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'same-origin',
    body: JSON.stringify({ key, mime: file.type, bytes: file.size })
  });
  if (!confirmRes.ok) {
    const data = await confirmRes.json().catch(() => ({}));
    throw new Error(data.message || 'アップロードの確認に失敗しました');
  }
  const confirmData = await confirmRes.json();
  return confirmData.image?.url || null;
}
