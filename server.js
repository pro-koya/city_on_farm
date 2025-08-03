// 必要なモジュールを読み込む
const express = require('express');
const app = express();

// 環境変数PORTがなければデフォルト3000を使う（RenderではPORTが自動設定される）
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');

// ルートにアクセスがあった時のレスポンス
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.render('index', {title: '新・今日の食卓'});
})

// サーバーの起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});