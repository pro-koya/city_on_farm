(() => {
  // ===== 一覧のフィルタ：SPでセレクト変更時に自動 submit =====
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) {
    const typeSel  = document.getElementById('sType');
    const scopeSel = document.getElementById('sScope');
    const isMobile = () => window.matchMedia('(max-width: 840px)').matches;

    function autoSubmitOnMobile() {
      if (isMobile() && toolbar.requestSubmit) {
        toolbar.requestSubmit();
      }
    }

    typeSel  && typeSel.addEventListener('change', autoSubmitOnMobile);
    scopeSel && scopeSel.addEventListener('change', autoSubmitOnMobile);
  }

  // ===== 作成/編集フォーム：ターゲットモードに応じて見た目切り替え =====
  const targetField = document.querySelector('.target-field');
  function refreshTargetUI() {
    if (!targetField) return;
    const rolesBox = targetField.querySelector('.target-roles');
    const checked = targetField.querySelector('input[name="target_mode"]:checked');
    const mode = checked ? checked.value : 'all';
    if (rolesBox) {
      rolesBox.style.display = (mode === 'roles') ? 'flex' : 'none';
    }
  }
  if (targetField) {
    const radios = targetField.querySelectorAll('input[name="target_mode"]');
    radios.forEach(r => r.addEventListener('change', refreshTargetUI));
    refreshTargetUI();
  }

  // ===== お知らせ編集画面：閲覧モード ⇔ 編集モード 切替 =====
  const form = document.querySelector('.notify-form__body');
  if (!form) return;

  const isNew   = form.dataset.isNew === '1';
  const readOnlyStart = form.dataset.readonly === '1';

  const editBtn = document.getElementById('notifyEditBtn');
  const saveBtn = document.getElementById('notifySaveBtn');
  const wrapper = document.querySelector('.notify-form');

  function setReadOnly(isReadonly) {
    if (isNew) return; // 新規作成は常に編集可能

    // 見た目用クラス
    if (wrapper) {
      wrapper.classList.toggle('notify-form--readonly', isReadonly);
    }

    // hidden/_csrf 以外の入力を制御
    const controls = form.querySelectorAll('input, select, textarea');
    controls.forEach(el => {
      // CSRF と hidden は常に送信させたいので除外
      if (el.type === 'hidden' || el.name === '_csrf') return;

      if (isReadonly) {
        el.setAttribute('disabled', 'disabled');
      } else {
        el.removeAttribute('disabled');
      }
    });

    // ボタンの表示切り替え
    if (editBtn) editBtn.style.display = isReadonly ? '' : 'none';
    if (saveBtn) saveBtn.style.display = isReadonly ? 'none' : '';
  }

  // 初期状態：既存 + エラーなし → 閲覧モード
  if (!isNew && readOnlyStart) {
    setReadOnly(true);
  }

  // 「編集する」クリックで編集モードへ
  editBtn && editBtn.addEventListener('click', () => {
    setReadOnly(false);
  });
})();