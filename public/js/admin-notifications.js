(() => {
  // 一覧のフィルタ：SPでセレクト変更時に自動 submit
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

  // 作成/編集フォーム：ターゲットモードに応じて見た目切り替え
  const targetField = document.querySelector('.target-field');
  if (targetField) {
    const radios = targetField.querySelectorAll('input[name="target_mode"]');
    const rolesBox = targetField.querySelector('.target-roles');

    function refreshTargetUI() {
      const checked = targetField.querySelector('input[name="target_mode"]:checked');
      const mode = checked ? checked.value : 'all';
      if (rolesBox) {
        rolesBox.style.display = (mode === 'roles') ? 'flex' : 'none';
      }
    }

    radios.forEach(r => r.addEventListener('change', refreshTargetUI));
    refreshTargetUI();
  }
})();