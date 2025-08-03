// 必要なモジュールを読み込む
const express = require('express');
const app = express();

// 環境変数PORTがなければデフォルト3000を使う（RenderではPORTが自動設定される）
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');

// 仮の商品データ
const products = [
  {
    name: '朝採れレタス',
    description: 'シャキシャキ食感、農薬不使用で安心！',
    image: '/images/test-image.jpeg'
  },
  {
    name: '完熟トマト',
    description: '糖度たっぷり、サラダにも煮込みにも最適。',
    image: '/images/test-image.jpeg'
  },
  {
    name: '新じゃがいも',
    description: 'ホクホク感が自慢の季節限定品。',
    image: '/images/test-image.jpeg'
  },
  {
    name: 'オーガニックにんじん',
    description: '甘みの強い自然栽培にんじんです。',
    image: '/images/test-image.jpeg'
  },
  {
    name: '鳥飼ナス',
    description: '摂津の伝統野菜、焼いてよし煮てよし。',
    image: '/images/test-image.jpeg'
  }
];

// 仮のブログ記事データ
const blogPosts = [
  {
    title: '旬のレタスが採れました！',
    slug: 'lettuce-harvest',
    excerpt: '今朝収穫したばかりのレタスが出品されています。シャキシャキの食感をぜひ味わってください。'
  },
  {
    title: '鳥飼ナスのおすすめレシピ3選',
    slug: 'torikai-eggplant-recipes',
    excerpt: '摂津の伝統野菜「鳥飼ナス」を使った簡単で美味しいレシピを紹介します。'
  },
  {
    title: '農家さん紹介：にんじん畑の青木さん',
    slug: 'farmer-aoki-carrots',
    excerpt: '甘くてやさしい味わいのにんじんを育てる青木さんのこだわりをご紹介。'
  },
  {
    title: 'トマトの糖度は何で決まる？',
    slug: 'tomato-sweetness-factors',
    excerpt: '完熟トマトが甘くなる理由とは？農家さんの工夫を紹介します。'
  },
  {
    title: '地元野菜と食の安心',
    slug: 'local-vegetables-safety',
    excerpt: '地域で育てた野菜がなぜ安心できるのか、その理由と魅力を伝えます。'
  }
];

// ルートにアクセスがあった時のレスポンス
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('index', {
    title: '新・今日の食卓'
    , products
    , blogPosts
  });
})

// サーバーの起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});