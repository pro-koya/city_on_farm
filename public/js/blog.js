(function(){
  const list = document.getElementById('blog-list');
  const cards = Array.from(list.querySelectorAll('.post-card'));
  const selCat = document.getElementById('category');
  const selSort = document.getElementById('sort');

  function apply(){
    const cat = selCat.value;           // 'all' or category
    const sort = selSort.value;         // 'newest' | 'oldest' | 'popular'

    // Filter
    const visible = cards.filter(card => {
      const c = card.dataset.category || '';
      return cat === 'all' ? true : c === cat;
    });

    // Sort
    visible.sort((a,b)=>{
      if (sort === 'popular'){
        return (+b.dataset.popularity || 0) - (+a.dataset.popularity || 0);
      }
      const ad = Date.parse(a.dataset.date);
      const bd = Date.parse(b.dataset.date);
      return sort === 'newest' ? (bd - ad) : (ad - bd);
    });

    // Render
    list.innerHTML = '';
    visible.forEach(card => list.appendChild(card));
  }

  selCat.addEventListener('change', apply);
  selSort.addEventListener('change', apply);

  // 初回
  apply();

  // URLクエリ ?category=xxx&sort=popular を反映（任意）
  const params = new URLSearchParams(location.search);
  if (params.get('category')){
    selCat.value = params.get('category');
  }
  if (params.get('sort')){
    selSort.value = params.get('sort');
  }
  apply();
})();