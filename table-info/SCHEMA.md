# Database Schema (generated)

> Generated at: 2025-11-24T18:36:18.272Z

---

## Schema: `public`

### `public.addresses`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `scope` | `text` | NO |  |  |
| 3 | `user_id` | `uuid` | YES |  |  |
| 4 | `order_id` | `uuid` | YES |  |  |
| 5 | `address_type` | `text` | NO | 'shipping'::text |  |
| 6 | `full_name` | `text` | NO |  |  |
| 7 | `company` | `text` | YES |  |  |
| 8 | `phone` | `text` | YES |  |  |
| 9 | `postal_code` | `text` | NO |  |  |
| 10 | `prefecture` | `text` | NO |  |  |
| 11 | `city` | `text` | NO |  |  |
| 12 | `address_line1` | `text` | NO |  |  |
| 13 | `address_line2` | `text` | YES |  |  |
| 14 | `country` | `text` | NO | 'JP'::text |  |
| 15 | `is_default` | `boolean` | NO | false |  |
| 16 | `note` | `text` | YES |  |  |
| 17 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 18 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16681_10_not_null`, `2200_16681_11_not_null`, `2200_16681_12_not_null`, `2200_16681_14_not_null`, `2200_16681_15_not_null`, `2200_16681_17_not_null`, `2200_16681_18_not_null`, `2200_16681_1_not_null`, `2200_16681_2_not_null`, `2200_16681_5_not_null`, `2200_16681_6_not_null`, `2200_16681_9_not_null`, `addresses_address_type_check`, `addresses_check`, `addresses_scope_check`
- **FOREIGN KEY**: `addresses_order_id_fkey`, `addresses_user_id_fkey`
- **PRIMARY KEY**: `addresses_pkey`

**Indexes**

- `addresses_pkey`
  
  ```sql
  CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id)
  ```
- `ix_addresses_order_scope`
  
  ```sql
  CREATE INDEX ix_addresses_order_scope ON public.addresses USING btree (order_id, scope, address_type)
  ```
- `ix_addresses_user_scope`
  
  ```sql
  CREATE INDEX ix_addresses_user_scope ON public.addresses USING btree (user_id, scope, address_type)
  ```
- `ux_user_default_address`
  
  ```sql
  CREATE UNIQUE INDEX ux_user_default_address ON public.addresses USING btree (user_id, address_type) WHERE ((scope = 'user'::text) AND (is_default = true))
  ```

---

### `public.cart_items`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `cart_id` | `uuid` | NO |  |  |
| 3 | `product_id` | `uuid` | NO |  |  |
| 4 | `quantity` | `integer` | NO |  |  |
| 5 | `saved_for_later` | `boolean` | NO | false |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `user_id` | `uuid` | YES |  |  |
| 9 | `seller_id` | `uuid` | YES |  |  |
| 10 | `seller_name` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `2200_16695_1_not_null`, `2200_16695_2_not_null`, `2200_16695_3_not_null`, `2200_16695_4_not_null`, `2200_16695_5_not_null`, `2200_16695_6_not_null`, `2200_16695_7_not_null`, `cart_items_quantity_check`
- **FOREIGN KEY**: `cart_items_cart_id_fkey`, `cart_items_product_id_fkey`, `cart_items_user_id_fkey`
- **PRIMARY KEY**: `cart_items_pkey`
- **UNIQUE**: `cart_items_cart_id_product_id_key`

**Indexes**

- `cart_items_cart_id_product_id_key`
  
  ```sql
  CREATE UNIQUE INDEX cart_items_cart_id_product_id_key ON public.cart_items USING btree (cart_id, product_id)
  ```
- `cart_items_pkey`
  
  ```sql
  CREATE UNIQUE INDEX cart_items_pkey ON public.cart_items USING btree (id)
  ```
- `idx_cart_items_cart`
  
  ```sql
  CREATE INDEX idx_cart_items_cart ON public.cart_items USING btree (cart_id)
  ```
- `idx_cart_items_product`
  
  ```sql
  CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id)
  ```
- `idx_cart_items_seller`
  
  ```sql
  CREATE INDEX idx_cart_items_seller ON public.cart_items USING btree (seller_id)
  ```
- `idx_cart_items_user`
  
  ```sql
  CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id)
  ```

---

### `public.carts`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `coupon_code` | `text` | YES |  |  |
| 4 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16705_1_not_null`, `2200_16705_2_not_null`, `2200_16705_4_not_null`, `2200_16705_5_not_null`
- **FOREIGN KEY**: `carts_user_id_fkey`
- **PRIMARY KEY**: `carts_pkey`
- **UNIQUE**: `carts_user_id_key`

**Indexes**

- `carts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX carts_pkey ON public.carts USING btree (id)
  ```
- `carts_user_id_key`
  
  ```sql
  CREATE UNIQUE INDEX carts_user_id_key ON public.carts USING btree (user_id)
  ```

---

### `public.categories`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('categories_id_seq'::regclass) |  |
| 2 | `slug` | `text` | NO |  |  |
| 3 | `name` | `text` | NO |  |  |
| 4 | `sort_order` | `integer` | NO | 100 |  |
| 5 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 6 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16713_1_not_null`, `2200_16713_2_not_null`, `2200_16713_3_not_null`, `2200_16713_4_not_null`, `2200_16713_5_not_null`, `2200_16713_6_not_null`
- **PRIMARY KEY**: `categories_pkey`
- **UNIQUE**: `categories_name_key`, `categories_slug_key`

**Indexes**

- `categories_name_key`
  
  ```sql
  CREATE UNIQUE INDEX categories_name_key ON public.categories USING btree (name)
  ```
- `categories_pkey`
  
  ```sql
  CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id)
  ```
- `categories_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug)
  ```

---

### `public.contact_messages`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `contact_id` | `uuid` | NO |  |  |
| 3 | `sender_id` | `uuid` | YES |  |  |
| 4 | `sender_type` | `text` | NO |  |  |
| 5 | `body` | `text` | NO |  |  |
| 6 | `is_internal` | `boolean` | NO | false |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_17319_1_not_null`, `2200_17319_2_not_null`, `2200_17319_4_not_null`, `2200_17319_5_not_null`, `2200_17319_6_not_null`, `2200_17319_7_not_null`, `2200_17319_8_not_null`
- **FOREIGN KEY**: `contact_messages_contact_id_fkey`, `contact_messages_sender_id_fkey`
- **PRIMARY KEY**: `contact_messages_pkey`

**Indexes**

- `contact_messages_pkey`
  
  ```sql
  CREATE UNIQUE INDEX contact_messages_pkey ON public.contact_messages USING btree (id)
  ```
- `idx_contact_messages_contact_id`
  
  ```sql
  CREATE INDEX idx_contact_messages_contact_id ON public.contact_messages USING btree (contact_id, created_at)
  ```
- `idx_contact_messages_sender`
  
  ```sql
  CREATE INDEX idx_contact_messages_sender ON public.contact_messages USING btree (sender_type, sender_id)
  ```

---

### `public.contacts`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `email` | `text` | NO |  |  |
| 4 | `type` | `text` | NO |  |  |
| 5 | `message` | `text` | NO |  |  |
| 6 | `status` | `text` | NO | 'open'::text |  |
| 7 | `handled_by` | `uuid` | YES |  |  |
| 8 | `handled_at` | `timestamp with time zone` | YES |  |  |
| 9 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 11 | `subject` | `text` | YES |  |  |
| 12 | `category` | `contact_category_enum` *(enum)* | YES | 'other'::contact_category_enum |  |
| 13 | `user_id` | `uuid` | YES |  |  |

> **Enum `contact_category_enum` values**: `listing_registration`, `ordering_trading`, `site_bug`, `site_request`, `press_partnership`, `other`

**Constraints**

- **CHECK**: `2200_16722_10_not_null`, `2200_16722_1_not_null`, `2200_16722_2_not_null`, `2200_16722_3_not_null`, `2200_16722_4_not_null`, `2200_16722_5_not_null`, `2200_16722_6_not_null`, `2200_16722_9_not_null`, `contacts_status_check`
- **FOREIGN KEY**: `contacts_handled_by_fkey`, `contacts_user_id_fkey`
- **PRIMARY KEY**: `contacts_pkey`

**Indexes**

- `contacts_pkey`
  
  ```sql
  CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id)
  ```
- `idx_contacts_category`
  
  ```sql
  CREATE INDEX idx_contacts_category ON public.contacts USING btree (category)
  ```
- `idx_contacts_created_at`
  
  ```sql
  CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC)
  ```
- `idx_contacts_email`
  
  ```sql
  CREATE INDEX idx_contacts_email ON public.contacts USING btree (email)
  ```
- `idx_contacts_status`
  
  ```sql
  CREATE INDEX idx_contacts_status ON public.contacts USING btree (status)
  ```
- `idx_contacts_subject_body_trgm`
  
  ```sql
  CREATE INDEX idx_contacts_subject_body_trgm ON public.contacts USING gin ((((COALESCE(subject, ''::text) || ' '::text) || COALESCE(message, ''::text))) gin_trgm_ops)
  ```
- `idx_contacts_subject_trgm`
  
  ```sql
  CREATE INDEX idx_contacts_subject_trgm ON public.contacts USING gin (subject gin_trgm_ops)
  ```
- `idx_contacts_type`
  
  ```sql
  CREATE INDEX idx_contacts_type ON public.contacts USING btree (type)
  ```
- `idx_contacts_user_id`
  
  ```sql
  CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id)
  ```

---

### `public.coupons`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `code` | `text` | NO |  |  |
| 3 | `name` | `text` | YES |  |  |
| 4 | `description` | `text` | YES |  |  |
| 5 | `discount_type` | `text` | NO |  |  |
| 6 | `discount_value` | `integer` | NO |  |  |
| 7 | `min_subtotal` | `integer` | NO | 0 |  |
| 8 | `max_discount` | `integer` | YES |  |  |
| 9 | `applies_to` | `text` | NO | 'order'::text |  |
| 10 | `global_limit` | `integer` | YES |  |  |
| 11 | `per_user_limit` | `integer` | YES |  |  |
| 12 | `starts_at` | `timestamp with time zone` | YES |  |  |
| 13 | `ends_at` | `timestamp with time zone` | YES |  |  |
| 14 | `is_active` | `boolean` | NO | true |  |
| 15 | `metadata` | `jsonb` | YES |  |  |
| 16 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 17 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16733_14_not_null`, `2200_16733_16_not_null`, `2200_16733_17_not_null`, `2200_16733_1_not_null`, `2200_16733_2_not_null`, `2200_16733_5_not_null`, `2200_16733_6_not_null`, `2200_16733_7_not_null`, `2200_16733_9_not_null`, `coupons_applies_to_check`, `coupons_check`, `coupons_discount_type_check`, `coupons_discount_value_check`, `coupons_max_discount_check`, `coupons_min_subtotal_check`
- **PRIMARY KEY**: `coupons_pkey`
- **UNIQUE**: `coupons_code_key`

**Indexes**

- `coupons_code_key`
  
  ```sql
  CREATE UNIQUE INDEX coupons_code_key ON public.coupons USING btree (code)
  ```
- `coupons_pkey`
  
  ```sql
  CREATE UNIQUE INDEX coupons_pkey ON public.coupons USING btree (id)
  ```
- `ix_coupons_active_window`
  
  ```sql
  CREATE INDEX ix_coupons_active_window ON public.coupons USING btree (is_active, starts_at, ends_at, code)
  ```

---

### `public.global_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `method` | `payment_method` *(enum)* | NO |  |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `2200_16750_1_not_null`
- **PRIMARY KEY**: `global_allowed_payment_methods_pkey`

**Indexes**

- `global_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX global_allowed_payment_methods_pkey ON public.global_allowed_payment_methods USING btree (method)
  ```

---

### `public.gmail_tokens`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `smallint` | NO | 1 |  |
| 2 | `token_json` | `jsonb` | NO |  |  |
| 3 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_17270_1_not_null`, `2200_17270_2_not_null`, `2200_17270_3_not_null`
- **PRIMARY KEY**: `gmail_tokens_pkey`

**Indexes**

- `gmail_tokens_pkey`
  
  ```sql
  CREATE UNIQUE INDEX gmail_tokens_pkey ON public.gmail_tokens USING btree (id)
  ```

---

### `public.notification_reads`

ユーザーごとの通知既読状態

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `bigint` | NO | nextval('notification_reads_id_seq'::regclass) |  |
| 2 | `notification_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | NO |  |  |
| 4 | `read_at` | `timestamp with time zone` | NO | now() | 既読にした日時 |

**Constraints**

- **CHECK**: `2200_17386_1_not_null`, `2200_17386_2_not_null`, `2200_17386_3_not_null`, `2200_17386_4_not_null`
- **FOREIGN KEY**: `notification_reads_notification_id_fkey`, `notification_reads_user_id_fkey`
- **PRIMARY KEY**: `notification_reads_pkey`
- **UNIQUE**: `notification_reads_uniq`

**Indexes**

- `idx_notification_reads_notification`
  
  ```sql
  CREATE INDEX idx_notification_reads_notification ON public.notification_reads USING btree (notification_id)
  ```
- `idx_notification_reads_user`
  
  ```sql
  CREATE INDEX idx_notification_reads_user ON public.notification_reads USING btree (user_id, read_at DESC)
  ```
- `notification_reads_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notification_reads_pkey ON public.notification_reads USING btree (id)
  ```
- `notification_reads_uniq`
  
  ```sql
  CREATE UNIQUE INDEX notification_reads_uniq ON public.notification_reads USING btree (notification_id, user_id)
  ```

---

### `public.notification_targets`

通知の配信対象（ユーザー単位 / ロール単位 / 全体）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `bigint` | NO | nextval('notification_targets_id_seq'::regclass) |  |
| 2 | `notification_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | YES |  | 個別ユーザー向けの通知対象 |
| 4 | `role` | `text` | YES |  | ロール向け通知（buyer, seller など） |
| 5 | `audience` | `text` | YES |  | 全体・特定セグメント向け識別子（all など） |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_17361_1_not_null`, `2200_17361_2_not_null`, `2200_17361_6_not_null`, `notification_targets_one_dimension_chk`
- **FOREIGN KEY**: `notification_targets_notification_id_fkey`, `notification_targets_user_id_fkey`
- **PRIMARY KEY**: `notification_targets_pkey`

**Indexes**

- `idx_notification_targets_audience`
  
  ```sql
  CREATE INDEX idx_notification_targets_audience ON public.notification_targets USING btree (audience)
  ```
- `idx_notification_targets_notification_id`
  
  ```sql
  CREATE INDEX idx_notification_targets_notification_id ON public.notification_targets USING btree (notification_id)
  ```
- `idx_notification_targets_role`
  
  ```sql
  CREATE INDEX idx_notification_targets_role ON public.notification_targets USING btree (role)
  ```
- `idx_notification_targets_user_id`
  
  ```sql
  CREATE INDEX idx_notification_targets_user_id ON public.notification_targets USING btree (user_id)
  ```
- `notification_targets_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notification_targets_pkey ON public.notification_targets USING btree (id)
  ```

---

### `public.notifications`

お知らせ（全体・ロール別・個別ユーザー向け）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `type` | `text` | NO |  | 通知種別（system, contact_reply, campaign など） |
| 3 | `title` | `text` | NO |  | お知らせタイトル |
| 4 | `body` | `text` | NO |  | お知らせ本文（テキスト or markdown） |
| 5 | `link_url` | `text` | YES |  | 詳細ページなどへのリンクURL（任意） |
| 6 | `visible_from` | `timestamp with time zone` | YES |  | 掲載開始日時（null の場合、常に表示対象） |
| 7 | `visible_to` | `timestamp with time zone` | YES |  | 掲載終了日時（null の場合、無期限） |
| 8 | `created_by` | `uuid` | YES |  | 作成した管理ユーザーID |
| 9 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_17342_10_not_null`, `2200_17342_1_not_null`, `2200_17342_2_not_null`, `2200_17342_3_not_null`, `2200_17342_4_not_null`, `2200_17342_9_not_null`
- **FOREIGN KEY**: `notifications_created_by_fkey`
- **PRIMARY KEY**: `notifications_pkey`

**Indexes**

- `idx_notifications_created_at`
  
  ```sql
  CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC)
  ```
- `idx_notifications_type`
  
  ```sql
  CREATE INDEX idx_notifications_type ON public.notifications USING btree (type)
  ```
- `idx_notifications_visible_window`
  
  ```sql
  CREATE INDEX idx_notifications_visible_window ON public.notifications USING btree (visible_from, visible_to)
  ```
- `notifications_pkey`
  
  ```sql
  CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)
  ```

---

### `public.option_labels`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `category` | `text` | NO |  |  |
| 2 | `value` | `text` | NO |  |  |
| 3 | `label_ja` | `text` | NO |  |  |
| 4 | `label_en` | `text` | NO |  |  |
| 5 | `sort` | `integer` | NO | 0 |  |
| 6 | `active` | `boolean` | NO | true |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16753_1_not_null`, `2200_16753_2_not_null`, `2200_16753_3_not_null`, `2200_16753_4_not_null`, `2200_16753_5_not_null`, `2200_16753_6_not_null`, `2200_16753_7_not_null`, `2200_16753_8_not_null`
- **PRIMARY KEY**: `option_labels_pkey`
- **UNIQUE**: `option_labels_unique`

**Indexes**

- `option_labels_pkey`
  
  ```sql
  CREATE UNIQUE INDEX option_labels_pkey ON public.option_labels USING btree (category, value)
  ```
- `option_labels_unique`
  
  ```sql
  CREATE UNIQUE INDEX option_labels_unique ON public.option_labels USING btree (category, value)
  ```
- `ux_option_labels_category_value`
  
  ```sql
  CREATE UNIQUE INDEX ux_option_labels_category_value ON public.option_labels USING btree (category, value)
  ```

---

### `public.order_addresses`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `address_type` | `order_address_type` *(enum)* | NO |  |  |
| 4 | `full_name` | `text` | NO |  |  |
| 5 | `phone` | `text` | NO |  |  |
| 6 | `postal_code` | `text` | NO |  |  |
| 7 | `prefecture` | `text` | NO |  |  |
| 8 | `city` | `text` | NO |  |  |
| 9 | `address_line1` | `text` | NO |  |  |
| 10 | `address_line2` | `text` | YES |  |  |
| 11 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 12 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 13 | `country` | `text` | NO | 'JP'::text |  |
| 14 | `company` | `text` | YES |  |  |

> **Enum `order_address_type` values**: `shipping`, `billing`

**Constraints**

- **CHECK**: `2200_16762_11_not_null`, `2200_16762_12_not_null`, `2200_16762_13_not_null`, `2200_16762_1_not_null`, `2200_16762_2_not_null`, `2200_16762_3_not_null`, `2200_16762_4_not_null`, `2200_16762_5_not_null`, `2200_16762_6_not_null`, `2200_16762_7_not_null`, `2200_16762_8_not_null`, `2200_16762_9_not_null`
- **FOREIGN KEY**: `order_addresses_order_id_fkey`
- **PRIMARY KEY**: `order_addresses_pkey`

**Indexes**

- `idx_order_addresses_order`
  
  ```sql
  CREATE INDEX idx_order_addresses_order ON public.order_addresses USING btree (order_id)
  ```
- `idx_order_addresses_type`
  
  ```sql
  CREATE INDEX idx_order_addresses_type ON public.order_addresses USING btree (address_type)
  ```
- `ix_order_addresses_order_id`
  
  ```sql
  CREATE INDEX ix_order_addresses_order_id ON public.order_addresses USING btree (order_id)
  ```
- `ix_order_addresses_type`
  
  ```sql
  CREATE INDEX ix_order_addresses_type ON public.order_addresses USING btree (address_type)
  ```
- `order_addresses_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_addresses_pkey ON public.order_addresses USING btree (id)
  ```

---

### `public.order_groups`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `group_number` | `text` | YES |  |  |
| 4 | `total_amount` | `integer` | NO | 0 |  |
| 5 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 6 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16771_1_not_null`, `2200_16771_2_not_null`, `2200_16771_4_not_null`, `2200_16771_5_not_null`, `2200_16771_6_not_null`
- **FOREIGN KEY**: `order_groups_user_id_fkey`
- **PRIMARY KEY**: `order_groups_pkey`
- **UNIQUE**: `order_groups_group_number_key`

**Indexes**

- `idx_order_groups_user_created`
  
  ```sql
  CREATE INDEX idx_order_groups_user_created ON public.order_groups USING btree (user_id, created_at DESC)
  ```
- `order_groups_group_number_key`
  
  ```sql
  CREATE UNIQUE INDEX order_groups_group_number_key ON public.order_groups USING btree (group_number)
  ```
- `order_groups_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_groups_pkey ON public.order_groups USING btree (id)
  ```

---

### `public.order_items`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('order_items_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `product_id` | `uuid` | NO |  |  |
| 4 | `price` | `integer` | NO |  |  |
| 5 | `quantity` | `integer` | NO |  |  |
| 6 | `seller_id` | `uuid` | YES |  |  |
| 7 | `product_title` | `text` | YES |  |  |
| 8 | `unit` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `2200_16780_1_not_null`, `2200_16780_2_not_null`, `2200_16780_3_not_null`, `2200_16780_4_not_null`, `2200_16780_5_not_null`, `order_items_price_check`, `order_items_quantity_check`
- **FOREIGN KEY**: `order_items_order_id_fkey`, `order_items_product_id_fkey`, `order_items_seller_id_fkey`
- **PRIMARY KEY**: `order_items_pkey`

**Indexes**

- `idx_order_items_order`
  
  ```sql
  CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id)
  ```
- `idx_order_items_product`
  
  ```sql
  CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id)
  ```
- `order_items_pkey`
  
  ```sql
  CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)
  ```

---

### `public.orders`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `buyer_id` | `uuid` | NO |  |  |
| 3 | `status` | `order_status` *(enum)* | NO | 'pending'::order_status |  |
| 4 | `subtotal` | `integer` | NO | 0 |  |
| 5 | `discount` | `integer` | NO | 0 |  |
| 6 | `shipping_fee` | `integer` | NO | 0 |  |
| 7 | `total` | `integer` | NO |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 10 | `order_number` | `text` | YES |  |  |
| 11 | `eta_at` | `timestamp with time zone` | YES |  |  |
| 12 | `note` | `text` | YES |  |  |
| 13 | `reviewed` | `boolean` | YES | false |  |
| 14 | `payment_method` | `payment_method` *(enum)* | YES | 'cod'::payment_method |  |
| 15 | `payment_status` | `payment_status` *(enum)* | NO | 'unpaid'::payment_status |  |
| 16 | `payment_txid` | `text` | YES |  |  |
| 17 | `ship_method` | `ship_method` *(enum)* | YES |  |  |
| 18 | `ship_days` | `text` | YES |  |  |
| 19 | `ship_tracking_no` | `text` | YES |  |  |
| 20 | `shipment_status` | `text` | NO | 'unshipped'::text |  |
| 21 | `tax` | `integer` | NO | 0 |  |
| 22 | `coupon_code` | `text` | YES |  |  |
| 23 | `coupon_discount` | `integer` | NO | 0 |  |
| 24 | `bill_same` | `boolean` | NO | true |  |
| 25 | `group_id` | `uuid` | YES |  |  |
| 26 | `seller_id` | `uuid` | YES |  |  |
| 27 | `seller_name` | `text` | YES |  |  |
| 28 | `delivery_status` | `shipment_status` *(enum)* | YES |  |  |
| 29 | `ship_to` | `jsonb` | YES | '{}'::jsonb |  |
| 30 | `payment_provider` | `text` | YES |  |  |
| 31 | `payment_external_id` | `text` | YES |  |  |

> **Enum `order_status` values**: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
> **Enum `payment_status` values**: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
> **Enum `ship_method` values**: `pickup`, `delivery`
> **Enum `shipment_status` values**: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

**Constraints**

- **CHECK**: `2200_16788_15_not_null`, `2200_16788_1_not_null`, `2200_16788_20_not_null`, `2200_16788_21_not_null`, `2200_16788_23_not_null`, `2200_16788_24_not_null`, `2200_16788_2_not_null`, `2200_16788_3_not_null`, `2200_16788_4_not_null`, `2200_16788_5_not_null`, `2200_16788_6_not_null`, `2200_16788_7_not_null`, `2200_16788_8_not_null`, `2200_16788_9_not_null`, `orders_amounts_check`
- **FOREIGN KEY**: `orders_buyer_id_fkey`, `orders_group_id_fkey`, `orders_seller_id_fkey`
- **PRIMARY KEY**: `orders_pkey`
- **UNIQUE**: `orders_order_number_key`, `uq_orders_order_number`

**Indexes**

- `idx_orders_buyer`
  
  ```sql
  CREATE INDEX idx_orders_buyer ON public.orders USING btree (buyer_id)
  ```
- `idx_orders_buyer_created_at`
  
  ```sql
  CREATE INDEX idx_orders_buyer_created_at ON public.orders USING btree (buyer_id, created_at DESC)
  ```
- `idx_orders_created`
  
  ```sql
  CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC)
  ```
- `idx_orders_group`
  
  ```sql
  CREATE INDEX idx_orders_group ON public.orders USING btree (group_id)
  ```
- `idx_orders_order_number`
  
  ```sql
  CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number)
  ```
- `idx_orders_payment_status`
  
  ```sql
  CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status)
  ```
- `idx_orders_seller_created`
  
  ```sql
  CREATE INDEX idx_orders_seller_created ON public.orders USING btree (seller_id, created_at DESC)
  ```
- `idx_orders_shipment_status`
  
  ```sql
  CREATE INDEX idx_orders_shipment_status ON public.orders USING btree (shipment_status)
  ```
- `idx_orders_status`
  
  ```sql
  CREATE INDEX idx_orders_status ON public.orders USING btree (status)
  ```
- `idx_orders_status_updated_at`
  
  ```sql
  CREATE INDEX idx_orders_status_updated_at ON public.orders USING btree (status, updated_at DESC)
  ```
- `orders_order_number_key`
  
  ```sql
  CREATE UNIQUE INDEX orders_order_number_key ON public.orders USING btree (order_number)
  ```
- `orders_pkey`
  
  ```sql
  CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)
  ```
- `uq_orders_order_number`
  
  ```sql
  CREATE UNIQUE INDEX uq_orders_order_number ON public.orders USING btree (order_number)
  ```

---

### `public.orders_with_legacy_address`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | YES |  |  |
| 2 | `buyer_id` | `uuid` | YES |  |  |
| 3 | `status` | `order_status` *(enum)* | YES |  |  |
| 4 | `subtotal` | `integer` | YES |  |  |
| 5 | `discount` | `integer` | YES |  |  |
| 6 | `shipping_fee` | `integer` | YES |  |  |
| 7 | `total` | `integer` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | YES |  |  |
| 9 | `updated_at` | `timestamp with time zone` | YES |  |  |
| 10 | `order_number` | `text` | YES |  |  |
| 11 | `eta_at` | `timestamp with time zone` | YES |  |  |
| 12 | `note` | `text` | YES |  |  |
| 13 | `reviewed` | `boolean` | YES |  |  |
| 14 | `payment_method` | `text` | YES |  |  |
| 15 | `payment_status` | `text` | YES |  |  |
| 16 | `payment_txid` | `text` | YES |  |  |
| 17 | `ship_method` | `text` | YES |  |  |
| 18 | `ship_days` | `text` | YES |  |  |
| 19 | `ship_tracking_no` | `text` | YES |  |  |
| 20 | `shipment_status` | `text` | YES |  |  |
| 21 | `tax` | `integer` | YES |  |  |
| 22 | `coupon_code` | `text` | YES |  |  |
| 23 | `coupon_discount` | `integer` | YES |  |  |
| 24 | `bill_same` | `boolean` | YES |  |  |
| 25 | `shipping_name` | `text` | YES |  |  |
| 26 | `shipping_email` | `text` | YES |  |  |
| 27 | `shipping_phone` | `text` | YES |  |  |
| 28 | `shipping_postal_code` | `text` | YES |  |  |
| 29 | `shipping_prefecture` | `text` | YES |  |  |
| 30 | `shipping_city` | `text` | YES |  |  |
| 31 | `shipping_address1` | `text` | YES |  |  |
| 32 | `shipping_address2` | `text` | YES |  |  |
| 33 | `billing_name` | `text` | YES |  |  |
| 34 | `billing_email` | `text` | YES |  |  |
| 35 | `billing_phone` | `text` | YES |  |  |
| 36 | `billing_postal_code` | `text` | YES |  |  |
| 37 | `billing_prefecture` | `text` | YES |  |  |
| 38 | `billing_city` | `text` | YES |  |  |
| 39 | `billing_address1` | `text` | YES |  |  |
| 40 | `billing_address2` | `text` | YES |  |  |

> **Enum `order_status` values**: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`

**Constraints**

_No constraints_

**Indexes**

_No indexes_

---

### `public.partner_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `partner_id` | `uuid` | NO |  |  |
| 2 | `method` | `payment_method` *(enum)* | NO |  |  |
| 3 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 4 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `2200_16814_1_not_null`, `2200_16814_2_not_null`, `2200_16814_3_not_null`, `2200_16814_4_not_null`
- **FOREIGN KEY**: `partner_allowed_payment_methods_partner_id_fkey`
- **PRIMARY KEY**: `partner_allowed_payment_methods_pkey`

**Indexes**

- `idx_papm_partner`
  
  ```sql
  CREATE INDEX idx_papm_partner ON public.partner_allowed_payment_methods USING btree (partner_id)
  ```
- `partner_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_allowed_payment_methods_pkey ON public.partner_allowed_payment_methods USING btree (partner_id, method)
  ```

---

### `public.partner_date_availabilities`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `kind` | `ship_method` *(enum)* | NO |  |  |
| 4 | `date` | `date` | NO |  |  |
| 5 | `start_time` | `time without time zone` | NO | '00:00:00'::time without time zone |  |
| 6 | `end_time` | `time without time zone` | NO | '23:59:00'::time without time zone |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `ship_method` values**: `pickup`, `delivery`

**Constraints**

- **CHECK**: `2200_17475_1_not_null`, `2200_17475_2_not_null`, `2200_17475_3_not_null`, `2200_17475_4_not_null`, `2200_17475_5_not_null`, `2200_17475_6_not_null`, `2200_17475_7_not_null`, `2200_17475_8_not_null`
- **FOREIGN KEY**: `partner_date_availabilities_partner_id_fkey`
- **PRIMARY KEY**: `partner_date_availabilities_pkey`
- **UNIQUE**: `uq_partner_date`

**Indexes**

- `idx_partner_date_availabilities_partner`
  
  ```sql
  CREATE INDEX idx_partner_date_availabilities_partner ON public.partner_date_availabilities USING btree (partner_id, kind, date)
  ```
- `partner_date_availabilities_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_date_availabilities_pkey ON public.partner_date_availabilities USING btree (id)
  ```
- `uq_partner_date`
  
  ```sql
  CREATE UNIQUE INDEX uq_partner_date ON public.partner_date_availabilities USING btree (partner_id, kind, date, start_time, end_time)
  ```

---

### `public.partner_weekday_availabilities`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `partner_id` | `uuid` | NO |  |  |
| 3 | `kind` | `ship_method` *(enum)* | NO |  |  |
| 4 | `weekday` | `integer` | NO |  |  |
| 5 | `start_time` | `time without time zone` | NO | '00:00:00'::time without time zone |  |
| 6 | `end_time` | `time without time zone` | NO | '23:59:00'::time without time zone |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `ship_method` values**: `pickup`, `delivery`

**Constraints**

- **CHECK**: `2200_17456_1_not_null`, `2200_17456_2_not_null`, `2200_17456_3_not_null`, `2200_17456_4_not_null`, `2200_17456_5_not_null`, `2200_17456_6_not_null`, `2200_17456_7_not_null`, `2200_17456_8_not_null`, `partner_weekday_availabilities_weekday_check`
- **FOREIGN KEY**: `partner_weekday_availabilities_partner_id_fkey`
- **PRIMARY KEY**: `partner_weekday_availabilities_pkey`
- **UNIQUE**: `uq_partner_weekday`

**Indexes**

- `idx_partner_weekday_availabilities_partner`
  
  ```sql
  CREATE INDEX idx_partner_weekday_availabilities_partner ON public.partner_weekday_availabilities USING btree (partner_id, kind, weekday)
  ```
- `partner_weekday_availabilities_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partner_weekday_availabilities_pkey ON public.partner_weekday_availabilities USING btree (id)
  ```
- `uq_partner_weekday`
  
  ```sql
  CREATE UNIQUE INDEX uq_partner_weekday ON public.partner_weekday_availabilities USING btree (partner_id, kind, weekday, start_time, end_time)
  ```

---

### `public.partners`

取引先（主に飲食店などの法人・団体・個人事業主）

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `kana` | `text` | YES |  |  |
| 4 | `type` | `partner_type` *(enum)* | NO | 'restaurant'::partner_type | 取引先の区分（restaurant 等） |
| 5 | `status` | `partner_status` *(enum)* | NO | 'active'::partner_status | 稼働状態（active/inactive/prospect/suspended） |
| 6 | `email` | `text` | YES |  |  |
| 7 | `phone` | `text` | YES |  |  |
| 8 | `website` | `text` | YES |  |  |
| 9 | `billing_email` | `text` | YES |  |  |
| 10 | `billing_terms` | `text` | YES |  |  |
| 11 | `tax_id` | `text` | YES |  |  |
| 12 | `postal_code` | `text` | YES |  |  |
| 13 | `prefecture` | `text` | YES |  |  |
| 14 | `city` | `text` | YES |  |  |
| 15 | `address1` | `text` | YES |  |  |
| 16 | `address2` | `text` | YES |  |  |
| 17 | `note` | `text` | YES |  |  |
| 18 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 19 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 20 | `name_key` | `text` | YES |  |  |
| 21 | `postal_norm` | `text` | YES |  | 郵便番号（数字のみ7桁など） |
| 22 | `phone_norm` | `text` | YES |  | 電話番号（数字のみ） |
| 23 | `partner_key` | `text` | YES |  |  |
| 24 | `payment_methods` | `ARRAY` | NO | ARRAY['card'::payment_method] |  |
| 25 | `min_order_amount` | `integer` | NO | 0 |  |
| 26 | `shipping_policy` | `jsonb` | NO | '{}'::jsonb |  |

> **Enum `partner_type` values**: `restaurant`, `retailer`, `wholesale`, `corporate`, `individual`, `other`
> **Enum `partner_status` values**: `active`, `inactive`, `prospect`, `suspended`

**Constraints**

- **CHECK**: `2200_16819_18_not_null`, `2200_16819_19_not_null`, `2200_16819_1_not_null`, `2200_16819_24_not_null`, `2200_16819_25_not_null`, `2200_16819_26_not_null`, `2200_16819_2_not_null`, `2200_16819_4_not_null`, `2200_16819_5_not_null`
- **PRIMARY KEY**: `partners_pkey`
- **UNIQUE**: `ux_partners_partner_key`

**Indexes**

- `idx_partners_city_trgm`
  
  ```sql
  CREATE INDEX idx_partners_city_trgm ON public.partners USING gin (city gin_trgm_ops)
  ```
- `idx_partners_name`
  
  ```sql
  CREATE INDEX idx_partners_name ON public.partners USING btree (name)
  ```
- `idx_partners_postal_norm`
  
  ```sql
  CREATE INDEX idx_partners_postal_norm ON public.partners USING btree (postal_norm)
  ```
- `idx_partners_prefecture_city`
  
  ```sql
  CREATE INDEX idx_partners_prefecture_city ON public.partners USING btree (prefecture, city)
  ```
- `idx_partners_status`
  
  ```sql
  CREATE INDEX idx_partners_status ON public.partners USING btree (status)
  ```
- `idx_partners_status_type`
  
  ```sql
  CREATE INDEX idx_partners_status_type ON public.partners USING btree (status, type)
  ```
- `idx_partners_type`
  
  ```sql
  CREATE INDEX idx_partners_type ON public.partners USING btree (type)
  ```
- `partners_pkey`
  
  ```sql
  CREATE UNIQUE INDEX partners_pkey ON public.partners USING btree (id)
  ```
- `ux_partners_partner_key`
  
  ```sql
  CREATE UNIQUE INDEX ux_partners_partner_key ON public.partners USING btree (partner_key)
  ```

---

### `public.password_reset_tokens`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `token_hash` | `text` | NO |  |  |
| 4 | `expires_at` | `timestamp with time zone` | NO |  |  |
| 5 | `used` | `boolean` | NO | false |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_17279_1_not_null`, `2200_17279_2_not_null`, `2200_17279_3_not_null`, `2200_17279_4_not_null`, `2200_17279_5_not_null`, `2200_17279_6_not_null`
- **FOREIGN KEY**: `password_reset_tokens_user_id_fkey`
- **PRIMARY KEY**: `password_reset_tokens_pkey`

**Indexes**

- `idx_prt_exp_used`
  
  ```sql
  CREATE INDEX idx_prt_exp_used ON public.password_reset_tokens USING btree (expires_at, used)
  ```
- `idx_prt_user`
  
  ```sql
  CREATE INDEX idx_prt_user ON public.password_reset_tokens USING btree (user_id)
  ```
- `idx_prt_user_token`
  
  ```sql
  CREATE INDEX idx_prt_user_token ON public.password_reset_tokens USING btree (user_id, token_hash)
  ```
- `password_reset_tokens_pkey`
  
  ```sql
  CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)
  ```

---

### `public.payments`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('payments_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `amount` | `integer` | NO |  |  |
| 4 | `method` | `payment_method` *(enum)* | NO |  |  |
| 5 | `status` | `payment_status` *(enum)* | NO | 'pending'::payment_status |  |
| 6 | `transaction_id` | `text` | YES |  |  |
| 7 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
> **Enum `payment_status` values**: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`

**Constraints**

- **CHECK**: `2200_16836_1_not_null`, `2200_16836_2_not_null`, `2200_16836_3_not_null`, `2200_16836_4_not_null`, `2200_16836_5_not_null`, `2200_16836_7_not_null`, `2200_16836_8_not_null`, `payments_amount_check`
- **FOREIGN KEY**: `payments_order_id_fkey`
- **PRIMARY KEY**: `payments_pkey`
- **UNIQUE**: `payments_transaction_id_key`

**Indexes**

- `idx_payments_created`
  
  ```sql
  CREATE INDEX idx_payments_created ON public.payments USING btree (created_at DESC)
  ```
- `idx_payments_order`
  
  ```sql
  CREATE INDEX idx_payments_order ON public.payments USING btree (order_id)
  ```
- `idx_payments_order_updated`
  
  ```sql
  CREATE INDEX idx_payments_order_updated ON public.payments USING btree (order_id, updated_at DESC)
  ```
- `idx_payments_status`
  
  ```sql
  CREATE INDEX idx_payments_status ON public.payments USING btree (status)
  ```
- `payments_pkey`
  
  ```sql
  CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)
  ```
- `payments_transaction_id_key`
  
  ```sql
  CREATE UNIQUE INDEX payments_transaction_id_key ON public.payments USING btree (transaction_id)
  ```

---

### `public.product_images`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `url` | `text` | NO |  |  |
| 4 | `alt` | `text` | YES |  |  |
| 5 | `position` | `integer` | NO | 0 |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `r2_key` | `text` | YES |  |  |
| 8 | `mime` | `text` | YES |  |  |
| 9 | `bytes` | `integer` | YES |  |  |
| 10 | `width` | `integer` | YES |  |  |
| 11 | `height` | `integer` | YES |  |  |
| 12 | `checksum` | `text` | YES |  |  |

**Constraints**

- **CHECK**: `2200_16846_1_not_null`, `2200_16846_2_not_null`, `2200_16846_3_not_null`, `2200_16846_5_not_null`, `2200_16846_6_not_null`
- **FOREIGN KEY**: `product_images_product_id_fkey`
- **PRIMARY KEY**: `product_images_pkey`
- **UNIQUE**: `product_images_r2_key_key`

**Indexes**

- `idx_product_images_position`
  
  ```sql
  CREATE INDEX idx_product_images_position ON public.product_images USING btree (product_id, "position")
  ```
- `idx_product_images_product`
  
  ```sql
  CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id)
  ```
- `ix_product_images_position`
  
  ```sql
  CREATE INDEX ix_product_images_position ON public.product_images USING btree ("position")
  ```
- `ix_product_images_product_id`
  
  ```sql
  CREATE INDEX ix_product_images_product_id ON public.product_images USING btree (product_id)
  ```
- `product_images_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id)
  ```
- `product_images_r2_key_key`
  
  ```sql
  CREATE UNIQUE INDEX product_images_r2_key_key ON public.product_images USING btree (r2_key)
  ```

---

### `public.product_rating_stats`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `product_id` | `uuid` | YES |  |  |
| 2 | `review_count` | `integer` | YES |  |  |
| 3 | `rating_avg` | `numeric` | YES |  |  |

**Constraints**

_No constraints_

**Indexes**

_No indexes_

---

### `public.product_reviews`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | gen_random_uuid() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `user_id` | `uuid` | NO |  |  |
| 4 | `rating` | `integer` | NO |  |  |
| 5 | `title` | `text` | YES |  |  |
| 6 | `body` | `text` | NO |  |  |
| 7 | `status` | `review_status` *(enum)* | NO | 'published'::review_status |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `review_status` values**: `published`, `pending`, `hidden`

**Constraints**

- **CHECK**: `2200_16854_1_not_null`, `2200_16854_2_not_null`, `2200_16854_3_not_null`, `2200_16854_4_not_null`, `2200_16854_6_not_null`, `2200_16854_7_not_null`, `2200_16854_8_not_null`, `2200_16854_9_not_null`, `product_reviews_rating_check`
- **FOREIGN KEY**: `product_reviews_product_id_fkey`, `product_reviews_user_id_fkey`
- **PRIMARY KEY**: `product_reviews_pkey`
- **UNIQUE**: `uq_product_reviews_user`

**Indexes**

- `idx_product_reviews_product_created`
  
  ```sql
  CREATE INDEX idx_product_reviews_product_created ON public.product_reviews USING btree (product_id, created_at DESC)
  ```
- `idx_product_reviews_status`
  
  ```sql
  CREATE INDEX idx_product_reviews_status ON public.product_reviews USING btree (status)
  ```
- `product_reviews_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_reviews_pkey ON public.product_reviews USING btree (id)
  ```
- `uq_product_reviews_user`
  
  ```sql
  CREATE UNIQUE INDEX uq_product_reviews_user ON public.product_reviews USING btree (product_id, user_id)
  ```

---

### `public.product_specs`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `label` | `text` | NO |  |  |
| 4 | `value` | `text` | NO |  |  |
| 5 | `position` | `integer` | NO | 0 |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16868_1_not_null`, `2200_16868_2_not_null`, `2200_16868_3_not_null`, `2200_16868_4_not_null`, `2200_16868_5_not_null`, `2200_16868_6_not_null`
- **FOREIGN KEY**: `product_specs_product_id_fkey`
- **PRIMARY KEY**: `product_specs_pkey`

**Indexes**

- `idx_product_specs_pos`
  
  ```sql
  CREATE INDEX idx_product_specs_pos ON public.product_specs USING btree (product_id, "position")
  ```
- `idx_product_specs_product`
  
  ```sql
  CREATE INDEX idx_product_specs_product ON public.product_specs USING btree (product_id)
  ```
- `product_specs_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_specs_pkey ON public.product_specs USING btree (id)
  ```

---

### `public.product_tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `product_id` | `uuid` | NO |  |  |
| 2 | `tag_id` | `integer` | NO |  |  |

**Constraints**

- **CHECK**: `2200_16876_1_not_null`, `2200_16876_2_not_null`
- **FOREIGN KEY**: `product_tags_product_id_fkey`, `product_tags_tag_id_fkey`
- **PRIMARY KEY**: `product_tags_pkey`

**Indexes**

- `product_tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX product_tags_pkey ON public.product_tags USING btree (product_id, tag_id)
  ```

---

### `public.products`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `seller_id` | `uuid` | NO |  |  |
| 3 | `category_id` | `integer` | YES |  |  |
| 4 | `slug` | `text` | NO |  |  |
| 5 | `title` | `text` | NO |  |  |
| 6 | `description_md` | `text` | YES |  |  |
| 7 | `description_html` | `text` | YES |  |  |
| 8 | `price` | `integer` | NO |  |  |
| 9 | `unit` | `text` | NO |  |  |
| 10 | `stock` | `integer` | NO | 0 |  |
| 11 | `is_organic` | `boolean` | NO | false |  |
| 12 | `is_seasonal` | `boolean` | NO | false |  |
| 13 | `ship_method` | `text` | NO |  |  |
| 14 | `ship_days` | `text` | NO |  |  |
| 15 | `status` | `product_status` *(enum)* | NO | 'public'::product_status |  |
| 16 | `published_at` | `timestamp with time zone` | YES |  |  |
| 17 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 18 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 19 | `description_raw` | `text` | YES |  |  |

> **Enum `product_status` values**: `draft`, `private`, `public`

**Constraints**

- **CHECK**: `2200_16879_10_not_null`, `2200_16879_11_not_null`, `2200_16879_12_not_null`, `2200_16879_13_not_null`, `2200_16879_14_not_null`, `2200_16879_15_not_null`, `2200_16879_17_not_null`, `2200_16879_18_not_null`, `2200_16879_1_not_null`, `2200_16879_2_not_null`, `2200_16879_4_not_null`, `2200_16879_5_not_null`, `2200_16879_8_not_null`, `2200_16879_9_not_null`, `products_price_check`, `products_ship_days_check`, `products_ship_method_check`, `products_stock_check`
- **FOREIGN KEY**: `products_category_id_fkey`, `products_seller_id_fkey`
- **PRIMARY KEY**: `products_pkey`
- **UNIQUE**: `products_slug_key`

**Indexes**

- `idx_products_category`
  
  ```sql
  CREATE INDEX idx_products_category ON public.products USING btree (category_id)
  ```
- `idx_products_price`
  
  ```sql
  CREATE INDEX idx_products_price ON public.products USING btree (price)
  ```
- `idx_products_published_at`
  
  ```sql
  CREATE INDEX idx_products_published_at ON public.products USING btree (published_at DESC)
  ```
- `idx_products_status`
  
  ```sql
  CREATE INDEX idx_products_status ON public.products USING btree (status)
  ```
- `idx_products_stock`
  
  ```sql
  CREATE INDEX idx_products_stock ON public.products USING btree (stock)
  ```
- `idx_products_trgm`
  
  ```sql
  CREATE INDEX idx_products_trgm ON public.products USING gin ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(description_md, ''::text))) gin_trgm_ops)
  ```
- `products_pkey`
  
  ```sql
  CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)
  ```
- `products_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX products_slug_key ON public.products USING btree (slug)
  ```

---

### `public.r2_assets`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `key` | `text` | NO |  |  |
| 2 | `sha256` | `text` | YES |  |  |
| 3 | `mime` | `text` | YES |  |  |
| 4 | `bytes` | `integer` | YES |  |  |
| 5 | `width` | `integer` | YES |  |  |
| 6 | `height` | `integer` | YES |  |  |
| 7 | `seller_id` | `uuid` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16895_1_not_null`, `2200_16895_8_not_null`
- **PRIMARY KEY**: `r2_assets_pkey`

**Indexes**

- `r2_assets_key_uidx`
  
  ```sql
  CREATE UNIQUE INDEX r2_assets_key_uidx ON public.r2_assets USING btree (key)
  ```
- `r2_assets_pkey`
  
  ```sql
  CREATE UNIQUE INDEX r2_assets_pkey ON public.r2_assets USING btree (key)
  ```
- `r2_assets_seller_idx`
  
  ```sql
  CREATE INDEX r2_assets_seller_idx ON public.r2_assets USING btree (seller_id)
  ```
- `r2_assets_sha256_idx`
  
  ```sql
  CREATE INDEX r2_assets_sha256_idx ON public.r2_assets USING btree (sha256)
  ```

---

### `public.seller_profile_values`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `seller_profile_id` | `uuid` | NO |  |  |
| 2 | `value_code` | `text` | NO |  |  |

**Constraints**

- **CHECK**: `2200_17431_1_not_null`, `2200_17431_2_not_null`
- **FOREIGN KEY**: `seller_profile_values_seller_profile_id_fkey`, `seller_profile_values_value_code_fkey`
- **PRIMARY KEY**: `seller_profile_values_pkey`

**Indexes**

- `seller_profile_values_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_profile_values_pkey ON public.seller_profile_values USING btree (seller_profile_id, value_code)
  ```

---

### `public.seller_profiles`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `last_updated_by_user_id` | `uuid` | NO |  |  |
| 3 | `title` | `text` | YES |  |  |
| 4 | `body_html` | `text` | YES |  |  |
| 5 | `hero_image` | `text` | YES |  |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `partner_id` | `uuid` | NO |  |  |
| 9 | `headline` | `text` | YES |  |  |
| 10 | `summary` | `text` | YES |  |  |
| 11 | `intro_html` | `text` | YES |  |  |
| 12 | `hero_image_url` | `text` | YES |  |  |
| 13 | `hashtags` | `ARRAY` | YES |  |  |

**Constraints**

- **CHECK**: `2200_17407_1_not_null`, `2200_17407_2_not_null`, `2200_17407_6_not_null`, `2200_17407_7_not_null`, `2200_17407_8_not_null`
- **FOREIGN KEY**: `fk_seller_profiles_partner`, `seller_profiles_user_id_fkey`
- **PRIMARY KEY**: `seller_profiles_pkey`
- **UNIQUE**: `ux_seller_profiles_partner`

**Indexes**

- `idx_seller_profiles_partner_id`
  
  ```sql
  CREATE INDEX idx_seller_profiles_partner_id ON public.seller_profiles USING btree (partner_id)
  ```
- `seller_profiles_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_profiles_pkey ON public.seller_profiles USING btree (id)
  ```
- `seller_profiles_user_id_idx`
  
  ```sql
  CREATE UNIQUE INDEX seller_profiles_user_id_idx ON public.seller_profiles USING btree (last_updated_by_user_id)
  ```
- `ux_seller_profiles_partner`
  
  ```sql
  CREATE UNIQUE INDEX ux_seller_profiles_partner ON public.seller_profiles USING btree (partner_id)
  ```

---

### `public.seller_value_tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `code` | `text` | NO |  |  |
| 2 | `label_ja` | `text` | NO |  |  |
| 3 | `sort_order` | `integer` | NO | 100 |  |

**Constraints**

- **CHECK**: `2200_17423_1_not_null`, `2200_17423_2_not_null`, `2200_17423_3_not_null`
- **PRIMARY KEY**: `seller_value_tags_pkey`

**Indexes**

- `seller_value_tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX seller_value_tags_pkey ON public.seller_value_tags USING btree (code)
  ```

---

### `public.shipments`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('shipments_id_seq'::regclass) |  |
| 2 | `order_id` | `uuid` | NO |  |  |
| 3 | `status` | `shipment_status` *(enum)* | NO | 'pending'::shipment_status |  |
| 4 | `tracking_number` | `text` | YES |  |  |
| 5 | `carrier` | `text` | YES |  |  |
| 6 | `shipped_at` | `timestamp with time zone` | YES |  |  |
| 7 | `delivered_at` | `timestamp with time zone` | YES |  |  |
| 8 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 9 | `updated_at` | `timestamp with time zone` | NO | now() |  |

> **Enum `shipment_status` values**: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

**Constraints**

- **CHECK**: `2200_16901_1_not_null`, `2200_16901_2_not_null`, `2200_16901_3_not_null`, `2200_16901_8_not_null`, `2200_16901_9_not_null`
- **FOREIGN KEY**: `shipments_order_id_fkey`
- **PRIMARY KEY**: `shipments_pkey`
- **UNIQUE**: `shipments_tracking_number_key`

**Indexes**

- `idx_shipments_created`
  
  ```sql
  CREATE INDEX idx_shipments_created ON public.shipments USING btree (created_at DESC)
  ```
- `idx_shipments_order`
  
  ```sql
  CREATE INDEX idx_shipments_order ON public.shipments USING btree (order_id)
  ```
- `idx_shipments_order_updated`
  
  ```sql
  CREATE INDEX idx_shipments_order_updated ON public.shipments USING btree (order_id, updated_at DESC)
  ```
- `idx_shipments_status`
  
  ```sql
  CREATE INDEX idx_shipments_status ON public.shipments USING btree (status)
  ```
- `ix_shipments_order`
  
  ```sql
  CREATE INDEX ix_shipments_order ON public.shipments USING btree (order_id)
  ```
- `ix_shipments_status`
  
  ```sql
  CREATE INDEX ix_shipments_status ON public.shipments USING btree (status)
  ```
- `shipments_pkey`
  
  ```sql
  CREATE UNIQUE INDEX shipments_pkey ON public.shipments USING btree (id)
  ```
- `shipments_tracking_number_key`
  
  ```sql
  CREATE UNIQUE INDEX shipments_tracking_number_key ON public.shipments USING btree (tracking_number)
  ```

---

### `public.tags`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `integer` | NO | nextval('tags_id_seq'::regclass) |  |
| 2 | `slug` | `text` | NO |  |  |
| 3 | `name` | `text` | NO |  |  |
| 4 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `updated_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16910_1_not_null`, `2200_16910_2_not_null`, `2200_16910_3_not_null`, `2200_16910_4_not_null`, `2200_16910_5_not_null`
- **PRIMARY KEY**: `tags_pkey`
- **UNIQUE**: `tags_name_key`, `tags_slug_key`

**Indexes**

- `idx_tags_name`
  
  ```sql
  CREATE INDEX idx_tags_name ON public.tags USING btree (name)
  ```
- `tags_name_key`
  
  ```sql
  CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name)
  ```
- `tags_pkey`
  
  ```sql
  CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id)
  ```
- `tags_slug_key`
  
  ```sql
  CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug)
  ```

---

### `public.user_allowed_payment_methods`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `user_id` | `uuid` | NO |  |  |
| 2 | `method` | `payment_method` *(enum)* | NO |  |  |
| 3 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 4 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 5 | `synced_from_partner` | `boolean` | NO | true |  |

> **Enum `payment_method` values**: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`

**Constraints**

- **CHECK**: `2200_16918_1_not_null`, `2200_16918_2_not_null`, `2200_16918_3_not_null`, `2200_16918_4_not_null`, `2200_16918_5_not_null`
- **FOREIGN KEY**: `user_allowed_payment_methods_user_id_fkey`
- **PRIMARY KEY**: `user_allowed_payment_methods_pkey`

**Indexes**

- `idx_uapm_user`
  
  ```sql
  CREATE INDEX idx_uapm_user ON public.user_allowed_payment_methods USING btree (user_id)
  ```
- `user_allowed_payment_methods_pkey`
  
  ```sql
  CREATE UNIQUE INDEX user_allowed_payment_methods_pkey ON public.user_allowed_payment_methods USING btree (user_id, method)
  ```

---

### `public.user_recent_products`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `user_id` | `uuid` | NO |  |  |
| 2 | `product_id` | `uuid` | NO |  |  |
| 3 | `viewed_at` | `timestamp with time zone` | NO | now() |  |

**Constraints**

- **CHECK**: `2200_16924_1_not_null`, `2200_16924_2_not_null`, `2200_16924_3_not_null`
- **FOREIGN KEY**: `user_recent_products_product_id_fkey`, `user_recent_products_user_id_fkey`
- **PRIMARY KEY**: `user_recent_products_pkey`

**Indexes**

- `idx_user_recent_products_user_time`
  
  ```sql
  CREATE INDEX idx_user_recent_products_user_time ON public.user_recent_products USING btree (user_id, viewed_at DESC)
  ```
- `user_recent_products_pkey`
  
  ```sql
  CREATE UNIQUE INDEX user_recent_products_pkey ON public.user_recent_products USING btree (user_id, product_id)
  ```

---

### `public.users`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `id` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `name` | `text` | NO |  |  |
| 3 | `email` | `text` | NO |  |  |
| 4 | `password_hash` | `text` | NO |  |  |
| 5 | `roles` | `ARRAY` | NO | ARRAY['buyer'::text] |  |
| 6 | `created_at` | `timestamp with time zone` | NO | now() |  |
| 7 | `updated_at` | `timestamp with time zone` | NO | now() |  |
| 8 | `partner_id` | `uuid` | YES |  | 所属取引先への外部キー（partners.id） |
| 9 | `postal_code` | `text` | YES |  | 郵便番号（ハイフン付き可） |
| 10 | `prefecture` | `text` | YES |  | 都道府県 |
| 11 | `city` | `text` | YES |  | 市区町村 |
| 12 | `address1` | `text` | YES |  | 番地・丁目まで |
| 13 | `address2` | `text` | YES |  | 建物名・部屋番号など任意 |
| 14 | `postal_norm` | `text` | YES |  | 郵便番号（数字のみ7桁など） |
| 15 | `phone` | `text` | YES |  | 電話番号（ハイフン付き可） |
| 16 | `phone_norm` | `text` | YES |  | 電話番号（数字のみ） |
| 17 | `seller_intro_summary` | `text` | YES |  | 商品ページなどに表示する出品者紹介の概要テキスト |

**Constraints**

- **CHECK**: `2200_16928_1_not_null`, `2200_16928_2_not_null`, `2200_16928_3_not_null`, `2200_16928_4_not_null`, `2200_16928_5_not_null`, `2200_16928_6_not_null`, `2200_16928_7_not_null`
- **FOREIGN KEY**: `users_partner_id_fkey`
- **PRIMARY KEY**: `users_pkey`
- **UNIQUE**: `users_email_key`

**Indexes**

- `idx_users_city_trgm`
  
  ```sql
  CREATE INDEX idx_users_city_trgm ON public.users USING gin (city gin_trgm_ops)
  ```
- `idx_users_partner`
  
  ```sql
  CREATE INDEX idx_users_partner ON public.users USING btree (partner_id)
  ```
- `idx_users_postal_norm`
  
  ```sql
  CREATE INDEX idx_users_postal_norm ON public.users USING btree (postal_norm)
  ```
- `idx_users_prefecture_city`
  
  ```sql
  CREATE INDEX idx_users_prefecture_city ON public.users USING btree (prefecture, city)
  ```
- `users_email_key`
  
  ```sql
  CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
  ```
- `users_pkey`
  
  ```sql
  CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
  ```

---

## ENUM Types (global)

- `public.contact_category_enum`: `listing_registration`, `ordering_trading`, `site_bug`, `site_request`, `press_partnership`, `other`
- `public.order_address_type`: `shipping`, `billing`
- `public.order_status`: `pending`, `paid`, `shipped`, `cancelled`, `confirmed`, `processing`, `delivered`, `canceled`, `refunded`, `fulfilled`
- `public.partner_status`: `active`, `inactive`, `prospect`, `suspended`
- `public.partner_type`: `restaurant`, `retailer`, `wholesale`, `corporate`, `individual`, `other`
- `public.payment_method`: `card`, `bank_transfer`, `convenience_store`, `cod`, `bank`, `paypay`
- `public.payment_status`: `pending`, `completed`, `failed`, `authorized`, `paid`, `canceled`, `refunded`, `unpaid`, `cancelled`
- `public.product_status`: `draft`, `private`, `public`
- `public.review_status`: `published`, `pending`, `hidden`
- `public.ship_method`: `pickup`, `delivery`
- `public.shipment_status`: `pending`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`, `lost`, `canceled`, `in_transit`

