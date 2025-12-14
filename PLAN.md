0. 目的
	•	注文に対して「納品書」をPDFで発行できるようにする
	•	飲食店向け運用が多いため、1ページに収まるようコンパクトに（明細が多い場合はページ分割）
	•	価格を載せる版 / 載せない版を切り替えられるように（初期は載せないでもOK。将来拡張しやすく）

⸻

1. 仕様（納品書の要件）

1-1. 基本
	•	URL例：
	•	GET /orders/:id/delivery-note（ログイン必須、本人の注文のみ）
	•	管理/出品者側も発行するなら別途 GET /admin/orders/:id/delivery-note など
	•	PDFファイル名：
	•	delivery-note-<order_number>.pdf（order_numberがなければ order.id）
	•	表示内容（納品書に必要な情報）
	•	タイトル「納品書」
	•	納品日（基本は 発送日/引渡日。無ければ created_at を暫定利用し、将来 shipment_at 等へ拡張できる設計に）
	•	注文番号
	•	出品者情報（seller_name、住所、電話、メールなど取得できる範囲）
	•	お届け先（shippingAddress：氏名/郵便番号/住所/電話）
	•	明細（商品名、数量、単位）
	•	備考欄（注文のnoteがあれば表示）
	•	金額は基本非表示（納品書）
	•	ただし将来のため ?showPrice=1 で単価・金額・合計も表示できるように実装（デフォルトは0）

1-2. ページ構成
	•	注文商品数が少ない場合（目安 5件程度）は 1ページに収める
	•	多い場合は明細表を2ページ目以降へ（領収書でやったページ分割のロジックを流用）
	•	PDFレイアウトは楽天の納品書に近い「見出し大きすぎない」「余白小さめ」「表はコンパクト」

⸻

2. 実装方針（既存領収書実装を流用）

2-1. 既存の領収書実装を調査して踏襲
	•	どのライブラリでPDF生成しているか確認（例：pdfkit / puppeteer / playwright / html-pdf 等）
	•	既存と同じ方式で納品書も実装する
	•	例：HTML(EJS) → headless browserでPDF化 なら、納品書も views/pdf/delivery-note.ejs を作る
	•	例：pdfkit直書きなら、同様に描画関数を追加する

2-2. コード構成（推奨）
	•	ルート：
	•	routes/orders.js などに GET /orders/:id/delivery-note
	•	サービス層：
	•	services/pdfService.js に renderDeliveryNotePdf(orderId, options) を追加
	•	テンプレート：
	•	views/pdf/delivery-note.ejs
	•	CSS：
	•	public/styles/pdf-delivery-note.css（領収書CSSと共通化できるなら共通CSS＋差分でもOK）

⸻

3. DB/取得データ要件

納品書発行に必要な情報を既存SQLから取得して組み立てること。

3-1. 注文本体

orders から：
	•	id, order_number, created_at, note, ship_method, ship_to(あれば), seller_id, seller_name
	•	可能なら shipment_status / delivery_status / shipped_at 相当（無ければ created_at で代替）

3-2. 明細

order_items JOIN products で：
	•	商品名(title), quantity, unit（products.unit）, product_id
	•	価格は showPrice=1 の時だけ（oi.price）利用

3-3. お届け先

order_addresses から shipping を取得（なければ orders.ship_to をフォールバック）
	•	full_name, phone, postal_code, prefecture, city, address_line1, address_line2

3-4. 出品者情報

既存で seller 情報を取る関数があるはず（領収書の出品者表示に使っているロジックを流用）
	•	seller_name, 住所, 電話, メールなど
	•	なければ最低限 seller_name だけでも表示（将来拡張OK）

⸻

4. UI/UX（画面側）
	•	注文完了ページ or 注文詳細ページに「納品書を発行」ボタンを追加
	•	/orders/:id/delivery-note へ遷移（別タブ推奨）
	•	未ログイン/権限なしの場合は 403 or ログインへ誘導

⸻

5. セキュリティ要件（重要）
	•	buyer が自分の注文しか出力できないこと（buyer_idで照合）
	•	管理者/出品者発行の場合も権限チェック（seller_id一致 or admin）
	•	PDF生成時にテンプレへ渡す値は必ずサニタイズ（EJSエスケープ利用）

⸻

6. 実装タスク（やることリスト）
	1.	既存領収書PDF生成方式を確認し、それと同じ方式で納品書PDF生成を追加
	2.	納品書テンプレ delivery-note.ejs を作成し、コンパクトなレイアウトを実装
	3.	明細行数が多い時にページ分割（ヘッダは毎ページ繰り返し）
	4.	ルート GET /orders/:id/delivery-note を実装（buyer本人限定）
	5.	注文詳細 or 完了画面にリンク追加（ボタン）
	6.	?showPrice=1 で価格列をONできるように（デフォルトOFF）
	7.	テスト：
	•	5件以下→1ページ
	•	10件→2ページ
	•	ship_method=pickup（配送先が無い）→「受取情報」形式に切替 or 配送先欄を非表示

⸻

7. 仕上げ（期待する成果物）
	•	追加/修正されるファイルを明示し、差分を提示してください：
	•	ルート追加
	•	SQL/取得処理追加
	•	EJSテンプレ追加
	•	PDF用CSS追加
	•	注文詳細/完了画面へのボタン追加
実装後は、PDFの見た目が「見出し過大」「余白過多」にならないようにレイアウトの確認をして下さい。