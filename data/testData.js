// data/testData.js
// 開発用テストデータ（本文リッチ、関連記事テストOK）

const products = [
  // 葉物
  { id: 'p001', slug: 'lettuce-morning', name: '朝採れレタス', producer: '青木農園', category: '葉物', price: 280, unit: '1玉', image: '/images/test-image.jpeg', createdAt: '2025-06-24', popularity: 88, stock: 34, organic: true, seasonal: true, bundle: false },
  { id: 'p002', slug: 'spinach-organic', name: '有機ほうれん草', producer: '山田ファーム', category: '葉物', price: 220, unit: '1束', image: '/images/test-image.jpeg', createdAt: '2025-06-21', popularity: 71, stock: 8,  organic: true, seasonal: false, bundle: true },
  { id: 'p003', slug: 'mizuna-fresh', name: '水菜', producer: '川岸菜園', category: '葉物', price: 190, unit: '1束', image: '/images/test-image.jpeg', createdAt: '2025-06-18', popularity: 45, stock: 0,  organic: false, seasonal: true, bundle: false },

  // 根菜
  { id: 'p010', slug: 'carrot-sweet', name: '甘いにんじん', producer: '丘の上農園', category: '根菜', price: 260, unit: '500g', image: '/images/test-image.jpeg', createdAt: '2025-06-25', popularity: 92, stock: 12, organic: true, seasonal: true, bundle: true },
  { id: 'p011', slug: 'potato-new', name: '新じゃがいも', producer: '北の畑', category: '根菜', price: 240, unit: '800g', image: '/images/test-image.jpeg', createdAt: '2025-06-10', popularity: 68, stock: 57, organic: false, seasonal: true, bundle: true },
  { id: 'p012', slug: 'radish-crisp', name: 'みずみずしい大根', producer: '浜辺ファーム', category: '根菜', price: 300, unit: '1本', image: '/images/test-image.jpeg', createdAt: '2025-05-30', popularity: 31, stock: 6,  organic: false, seasonal: false, bundle: false },

  // 果菜
  { id: 'p020', slug: 'tomato-premium', name: '完熟トマト', producer: '陽だまり農園', category: '果菜', price: 380, unit: '500g', image: '/images/test-image.jpeg', createdAt: '2025-06-26', popularity: 120, stock: 22, organic: false, seasonal: true, bundle: true },
  { id: 'p021', slug: 'eggplant-torikai', name: '鳥飼ナス', producer: '摂津の畑', category: '果菜', price: 420, unit: '2本', image: '/images/test-image.jpeg', createdAt: '2025-06-19', popularity: 77, stock: 9,  organic: false, seasonal: true, bundle: false },
  { id: 'p022', slug: 'cucumber-morning', name: '朝どれきゅうり', producer: '川辺農園', category: '果菜', price: 200, unit: '3本', image: '/images/test-image.jpeg', createdAt: '2025-06-17', popularity: 54, stock: 0,  organic: false, seasonal: true, bundle: true },

  // きのこ
  { id: 'p030', slug: 'shiitake-thick', name: '肉厚しいたけ', producer: '森のきのこ舎', category: 'きのこ', price: 320, unit: '150g', image: '/images/test-image.jpeg', createdAt: '2025-06-16', popularity: 63, stock: 18, organic: false, seasonal: false, bundle: true },
  { id: 'p031', slug: 'bunashimeji', name: 'ぶなしめじ', producer: '森のきのこ舎', category: 'きのこ', price: 180, unit: '150g', image: '/images/test-image.jpeg', createdAt: '2025-06-14', popularity: 35, stock: 41, organic: false, seasonal: false, bundle: true },

  // ハーブ
  { id: 'p040', slug: 'basil-fresh', name: 'フレッシュバジル', producer: '丘の上農園', category: 'ハーブ', price: 180, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-26', popularity: 58, stock: 5,  organic: true, seasonal: true, bundle: false },
  { id: 'p041', slug: 'mint', name: 'ミント', producer: 'リバーサイド菜園', category: 'ハーブ', price: 160, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-20', popularity: 22, stock: 25, organic: true, seasonal: true, bundle: false },

  // くだもの
  { id: 'p050', slug: 'strawberry', name: '朝摘みいちご', producer: '高原果樹園', category: 'くだもの', price: 480, unit: '1パック', image: '/images/test-image.jpeg', createdAt: '2025-06-12', popularity: 140, stock: 7,  organic: false, seasonal: true, bundle: false },
  { id: 'p051', slug: 'blueberry', name: 'ブルーベリー', producer: '高原果樹園', category: 'くだもの', price: 520, unit: '1パック', image: '/images/test-image.jpeg', createdAt: '2025-06-23', popularity: 86, stock: 0,  organic: false, seasonal: true, bundle: false },

  // 加工品
  { id: 'p060', slug: 'jam-strawberry', name: '手作りいちごジャム', producer: '高原果樹園', category: '加工品', price: 650, unit: '200g', image: '/images/test-image.jpeg', createdAt: '2025-05-18', popularity: 55, stock: 38, organic: false, seasonal: false, bundle: false },
  { id: 'p061', slug: 'pickles-mix', name: '季節のピクルス', producer: '丘の上キッチン', category: '加工品', price: 540, unit: '200g', image: '/images/test-image.jpeg', createdAt: '2025-06-08', popularity: 48, stock: 10, organic: false, seasonal: true, bundle: false },

  // 穀類
  { id: 'p070', slug: 'rice-koshihikari', name: 'コシヒカリ（精米）', producer: '山里ファーム', category: '穀類', price: 1280, unit: '2kg', image: '/images/test-image.jpeg', createdAt: '2025-04-22', popularity: 61, stock: 50, organic: false, seasonal: false, bundle: true },
  { id: 'p071', slug: 'brownrice', name: '玄米', producer: '山里ファーム', category: '穀類', price: 1180, unit: '2kg', image: '/images/test-image.jpeg', createdAt: '2025-04-28', popularity: 39, stock: 26, organic: true, seasonal: false, bundle: true },

  // 飲食店向け（まとめ買い）
  { id: 'p080', slug: 'carrot-bulk', name: 'にんじん（業務用）', producer: '丘の上農園', category: '業務用', price: 1980, unit: '5kg', image: '/images/test-image.jpeg', createdAt: '2025-06-05', popularity: 24, stock: 13, organic: false, seasonal: false, bundle: true },
  { id: 'p081', slug: 'tomato-bulk', name: 'トマト（業務用）', producer: '陽だまり農園', category: '業務用', price: 2480, unit: '5kg', image: '/images/test-image.jpeg', createdAt: '2025-06-22', popularity: 30, stock: 4,  organic: false, seasonal: true, bundle: true },

  // 他（数合わせ：30件になるよう追加）
  { id: 'p082', slug: 'onion', name: '新玉ねぎ', producer: '丘の上農園', category: '根菜', price: 200, unit: '2玉', image: '/images/test-image.jpeg', createdAt: '2025-06-09', popularity: 52, stock: 44, organic: false, seasonal: true, bundle: true },
  { id: 'p083', slug: 'cabbage', name: '春キャベツ', producer: '山田ファーム', category: '葉物', price: 260, unit: '1玉', image: '/images/test-image.jpeg', createdAt: '2025-05-29', popularity: 47, stock: 2,  organic: false, seasonal: true, bundle: false },
  { id: 'p084', slug: 'bellpepper', name: 'カラーピーマン', producer: '陽だまり農園', category: '果菜', price: 260, unit: '3個', image: '/images/test-image.jpeg', createdAt: '2025-06-13', popularity: 28, stock: 19, organic: false, seasonal: true, bundle: false },
  { id: 'p085', slug: 'zucchini', name: 'ズッキーニ', producer: '川岸菜園', category: '果菜', price: 240, unit: '2本', image: '/images/test-image.jpeg', createdAt: '2025-06-07', popularity: 25, stock: 14, organic: false, seasonal: true, bundle: false },
  { id: 'p086', slug: 'corn-sweet', name: 'スイートコーン', producer: '北の畑', category: '果菜', price: 320, unit: '2本', image: '/images/test-image.jpeg', createdAt: '2025-06-27', popularity: 83, stock: 11, organic: false, seasonal: true, bundle: false },
  { id: 'p087', slug: 'edamame', name: '枝豆', producer: '北の畑', category: '豆類', price: 280, unit: '300g', image: '/images/test-image.jpeg', createdAt: '2025-06-26', popularity: 76, stock: 0,  organic: false, seasonal: true, bundle: false },
  { id: 'p088', slug: 'garlic', name: 'にんにく', producer: '山里ファーム', category: '香味', price: 300, unit: '2玉', image: '/images/test-image.jpeg', createdAt: '2025-06-03', popularity: 20, stock: 33, organic: false, seasonal: false, bundle: false },
  { id: 'p089', slug: 'ginger', name: '生姜', producer: '山里ファーム', category: '香味', price: 220, unit: '200g', image: '/images/test-image.jpeg', createdAt: '2025-06-15', popularity: 19, stock: 27, organic: false, seasonal: true, bundle: false },
  { id: 'p090', slug: 'parsley', name: 'パセリ', producer: 'リバーサイド菜園', category: 'ハーブ', price: 150, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-11', popularity: 12, stock: 21, organic: true, seasonal: true, bundle: false },
  { id: 'p091', slug: 'kale', name: 'ケール', producer: '青木農園', category: '葉物', price: 260, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-04', popularity: 17, stock: 15, organic: true, seasonal: false, bundle: false },
  { id: 'p092', slug: 'pumpkin', name: 'かぼちゃ', producer: '陽だまり農園', category: '果菜', price: 480, unit: '1/2個', image: '/images/test-image.jpeg', createdAt: '2025-06-01', popularity: 21, stock: 9,  organic: false, seasonal: false, bundle: false },
  { id: 'p093', slug: 'leek', name: '長ねぎ', producer: '川辺農園', category: '香味', price: 200, unit: '2本', image: '/images/test-image.jpeg', createdAt: '2025-05-26', popularity: 14, stock: 36, organic: false, seasonal: false, bundle: true },
  { id: 'p094', slug: 'okra', name: 'オクラ', producer: '川岸菜園', category: '果菜', price: 180, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-24', popularity: 38, stock: 17, organic: false, seasonal: true, bundle: false },
  { id: 'p095', slug: 'coriander', name: 'コリアンダー', producer: 'リバーサイド菜園', category: 'ハーブ', price: 220, unit: '1袋', image: '/images/test-image.jpeg', createdAt: '2025-06-18', popularity: 16, stock: 12, organic: true, seasonal: true, bundle: false }
];

// 特集・コレクション（横スクロール）
const collections = [
  { slug: 'season-now',   title: 'いま旬の野菜', image: '/images/test-image.jpeg' },
  { slug: 'for-chefs',    title: '飲食店向けまとめ買い', image: '/images/test-image.jpeg' },
  { slug: 'herb-fresh',   title: '香りのいいハーブ', image: '/images/test-image.jpeg' }
];

// 共通の著者
const authorA = {
  name: 'City on Farm 編集部',
  avatar: '/images/icon-note.png',
  bio: '地域の“食”と“農”をつなぐ編集チーム。産地の声と台所の感動をお届けします。'
};

// 各記事の本文はHTML（サニタイズ済み想定）
const blogPosts = [
  {
    title: '旬のレタスが採れました！—みずみずしさを保つコツ',
    slug: 'lettuce-harvest',
    excerpt: '今朝収穫したばかりのレタスが入荷。みずみずしさを保つ保存術と、5分でできるレシピを紹介します。',
    category: '旬',
    tags: ['レタス', '保存方法', 'レシピ'],
    popularity: 128,
    publishedAt: '2025-04-22',
    readTime: 5,
    thumbnail: '/images/test-image.jpeg',
    cover: '/images/test-image.jpeg',
    toc: [
      { id: 'about', text: 'いまが“旬”の理由' },
      { id: 'keep-fresh', text: 'みずみずしさを保つ保存術' },
      { id: 'recipe', text: '5分で作る塩レモンサラダ' }
    ],
    author: authorA,
    contentHtml: `
      <h2 id="about">いまが“旬”の理由</h2>
      <p>朝の低温帯で収穫し、30分以内に予冷することで<strong>食感と香り</strong>が際立ちます。
      収穫〜出荷のリードタイム短縮は、地産地消ならでは。</p>

      <figure>
        <img src="slide1.jpg" alt="レタスの圃場">
        <figcaption>霧が晴れる前の収穫は水分ストレスを抑えます。</figcaption>
      </figure>

      <h2 id="keep-fresh">みずみずしさを保つ保存術</h2>
      <ul>
        <li>芯を少し切り落として湿らせたキッチンペーパーを当てる</li>
        <li>軽く空気を含ませた保存袋に入れ、<em>野菜室</em>へ</li>
        <li>外葉は別保存で炒め物へ回すとロス減</li>
      </ul>

      <blockquote>ポイント：水に浸けすぎると細胞が壊れて食感ダウン。霧吹きが◎。</blockquote>

      <h2 id="recipe">5分で作る塩レモンサラダ</h2>
      <pre><code>材料: レタス1/2玉, レモン汁小さじ2, オリーブ油大さじ1, 塩ひとつまみ, 黒胡椒
手順:
1) ちぎったレタスを冷水でサッと洗い、水気を切る
2) レモン汁・油・塩を混ぜて和える
3) 黒胡椒を挽いて完成</code></pre>
    `
  },
  {
    title: '鳥飼ナスのおすすめレシピ3選',
    slug: 'torikai-eggplant-recipes',
    excerpt: '皮薄くトロける“鳥飼ナス”。焼き浸し、揚げ出し、味噌田楽の3レシピを厳選。',
    category: '伝統野菜',
    tags: ['鳥飼ナス', 'レシピ', '伝統野菜'],
    popularity: 256,
    publishedAt: '2025-05-21',
    readTime: 7,
    thumbnail: '/images/test-image.jpeg',
    cover: '/images/test-image.jpeg',
    toc: [
      { id: 'why', text: '鳥飼ナスの個性' },
      { id: 'recipe1', text: '焼き浸し' },
      { id: 'recipe2', text: '揚げ出し' },
      { id: 'recipe3', text: '味噌田楽' }
    ],
    author: authorA,
    contentHtml: `
      <h2 id="why">鳥飼ナスの個性</h2>
      <p>果肉が緻密で油を含みやすく、<strong>とろける食感</strong>が最大の魅力。
      低温長時間の焼きで甘みが際立ちます。</p>

      <h3 id="recipe1">焼き浸し</h3>
      <p>表面に切れ目を入れてグリル→出汁にジュっと。翌日が食べ頃。</p>

      <h3 id="recipe2">揚げ出し</h3>
      <p>高温短時間で衣サクっと、中はトロっと。</p>

      <h3 id="recipe3">味噌田楽</h3>
      <p>田楽味噌に柚子皮少々。香りで“ごちそう”へ。</p>
    `
  },
  {
    title: '農家さん紹介：にんじん畑の青木さん',
    slug: 'farmer-aoki-carrots',
    excerpt: '土づくり10年。冬甘にんじんの畑から学ぶ“おいしさの土台”。',
    category: '農家さん',
    tags: ['生産者', 'にんじん', '土づくり'],
    popularity: 98,
    publishedAt: '2025-06-20',
    readTime: 6,
    thumbnail: '/images/test-image.jpeg',
    cover: '/images/test-image.jpeg',
    toc: [
      { id: 'profile', text: 'プロフィール' },
      { id: 'soil', text: '土づくりの哲学' },
      { id: 'harvest', text: '収穫と選別' }
    ],
    author: authorA,
    contentHtml: `
      <h2 id="profile">プロフィール</h2>
      <p>青木さんは三代目の若手就農者。化学肥料に頼らず、有機物循環で
      <strong>ふかふかの土</strong>を育てています。</p>

      <h2 id="soil">土づくりの哲学</h2>
      <p>自家製堆肥＋緑肥ローテーションで微生物多様性を確保。
      EC管理で“やりすぎない肥培管理”。</p>

      <h2 id="harvest">収穫と選別</h2>
      <p>裂根・曲がりは加工向けにしロス最小化。フードロス対策の好例です。</p>
    `
  },
  {
    title: 'トマトの糖度は何で決まる？—光合成と水管理',
    slug: 'tomato-sweetness-factors',
    excerpt: '糖度は品種だけじゃない。光・水・温度の“バランス設計”で甘さは作れる。',
    category: '野菜のこと',
    tags: ['トマト', '糖度', '栽培'],
    popularity: 301,
    publishedAt: '2025-04-22',
    readTime: 8,
    thumbnail: '/images/test-image.jpeg',
    cover: '/images/test-image.jpeg',
    toc: [
      { id: 'photosynthesis', text: '光合成と糖蓄積' },
      { id: 'water', text: '水ストレス管理' },
      { id: 'variety', text: '品種と環境の相性' }
    ],
    author: authorA,
    contentHtml: `
      <h2 id="photosynthesis">光合成と糖蓄積</h2>
      <p>葉面積指数と受光量がカギ。余分なわき芽は適度に整理。</p>

      <h2 id="water">水ストレス管理</h2>
      <p>過度な給水は糖度を下げます。<em>朝潅水・夕観察</em>で葉色と果実硬度を確認。</p>

      <h2 id="variety">品種と環境の相性</h2>
      <table>
        <thead><tr><th>品種</th><th>特徴</th><th>向く環境</th></tr></thead>
        <tbody>
          <tr><td>麗紅</td><td>果色◎・高糖</td><td>昼夜較差が大きい地域</td></tr>
          <tr><td>ミニA</td><td>裂果に強い</td><td>多雨地域</td></tr>
        </tbody>
      </table>
    `
  },
  {
    title: '地元野菜と食の安心—トレーサビリティの実装',
    slug: 'local-vegetables-safety',
    excerpt: '“だれが・どこで・どう作ったか”を可視化。地域で支える食の信頼。',
    category: '地産地消',
    tags: ['トレーサビリティ', '地産地消', '安心安全'],
    popularity: 210,
    publishedAt: '2025-04-22',
    readTime: 7,
    thumbnail: '/images/test-image.jpeg',
    cover: '/images/test-image.jpeg',
    toc: [
      { id: 'trace', text: 'トレーサビリティの基本' },
      { id: 'platform', text: 'プラットフォーム設計' },
      { id: 'future', text: 'これからの地産地消' }
    ],
    author: authorA,
    contentHtml: `
      <h2 id="trace">トレーサビリティの基本</h2>
      <p>生産者・圃場・栽培履歴・収穫日・流通経路を紐付けて記録。
      QRコードで消費者が確認できます。</p>

      <h2 id="platform">プラットフォーム設計</h2>
      <p>小規模農家の“少量多品目”に最適化。<strong>一括集約→分配</strong>の効率化がポイント。</p>

      <h2 id="future">これからの地産地消</h2>
      <p>学校給食や飲食店と連携し、地域で循環する“食の経済圏”へ。</p>
    `
  },
  {
    title: '直売所巡りで見つけた旬の味覚',
    slug: 'local-market-seasonal',
    excerpt: '地域の直売所で見つけた旬の野菜や果物を紹介します。',
    category: '地産地消',
    popularity: 3,
    publishedAt: '2025-06-05',
    thumbnail: '/images/test-image.jpeg',
    contentHtml: `<p>休日に地元の直売所を巡ると、その季節ならではの野菜や果物に出会えます。農家さんの話も魅力のひとつです。</p>`
  },
  {
    title: '農家と消費者をつなぐマルシェの魅力',
    slug: 'farmers-market-connection',
    excerpt: '地元マルシェの役割と、農家と消費者をつなぐ場としての魅力を解説します。',
    category: '地産地消',
    popularity: 2,
    publishedAt: '2025-06-15',
    thumbnail: '/images/test-image.jpeg',
    contentHtml: `<p>マルシェは生産者と直接話せる貴重な機会です。新鮮な食材を購入できるだけでなく、料理方法も学べます。</p>`
  }
];

module.exports = { products, collections, blogPosts };