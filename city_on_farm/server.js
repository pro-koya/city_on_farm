// 必要なモジュールを読み込む
const express = require('express');
const app = express();

// 環境変数PORTがなければデフォルト3000を使う（RenderではPORTが自動設定される）
const PORT = process.env.PORT || 3000;

// ルートにアクセスがあった時のレスポンス
app.get('/', (req, res) => {
  res.send('Hello from Node.js running on Render!');
});

// サーバーの起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});