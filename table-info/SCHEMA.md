# Database Schema (generated)

> Generated at: 2025-10-12T20:35:58.940Z

---

## Schema: `undefined`

### `undefined.undefined`

**Columns**

| # | Column | Type | NULL | Default | Comment |
|---:|---|---|:---:|---|---|
| 1 | `` | `uuid` | NO | gen_random_uuid() |  |
| 1 | `` | `uuid` | NO | gen_random_uuid() |  |
| 1 | `` | `uuid` | NO | gen_random_uuid() |  |
| 1 | `` | `integer` | NO | nextval('categories_id_seq'::regclass) |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 1 | `` | `uuid` | NO | gen_random_uuid() |  |
| 1 | `` | `text` | NO |  |  |
| 1 | `` | `uuid` | NO | gen_random_uuid() |  |
| 1 | `` | `integer` | NO | nextval('order_items_id_seq'::regclass) |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 1 | `` | `uuid` | YES |  |  |
| 1 | `` | `integer` | NO | nextval('payments_id_seq'::regclass) |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 1 | `` | `uuid` | NO |  |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 1 | `` | `text` | NO |  |  |
| 1 | `` | `integer` | NO | nextval('shipments_id_seq'::regclass) |  |
| 1 | `` | `integer` | NO | nextval('tags_id_seq'::regclass) |  |
| 1 | `` | `uuid` | NO |  |  |
| 1 | `` | `uuid` | NO | uuid_generate_v4() |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | YES |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `integer` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `text` | YES |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 2 | `` | `uuid` | NO |  |  |
| 2 | `` | `text` | NO |  |  |
| 3 | `` | `uuid` | YES |  |  |
| 3 | `` | `uuid` | NO |  |  |
| 3 | `` | `text` | YES |  |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `text` | YES |  |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `USER-DEFINED` | NO |  |  |
| 3 | `` | `uuid` | NO |  |  |
| 3 | `` | `USER-DEFINED` | NO | 'pending'::order_status |  |
| 3 | `` | `USER-DEFINED` | YES |  |  |
| 3 | `` | `integer` | NO |  |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `integer` | YES |  |  |
| 3 | `` | `text` | YES |  |  |
| 3 | `` | `USER-DEFINED` | NO | 'pending'::shipment_status |  |
| 3 | `` | `text` | NO |  |  |
| 3 | `` | `timestamp with time zone` | NO | now() |  |
| 3 | `` | `text` | NO |  |  |
| 4 | `` | `uuid` | YES |  |  |
| 4 | `` | `integer` | NO |  |  |
| 4 | `` | `timestamp with time zone` | NO | now() |  |
| 4 | `` | `integer` | NO | 100 |  |
| 4 | `` | `text` | NO |  |  |
| 4 | `` | `text` | YES |  |  |
| 4 | `` | `text` | NO |  |  |
| 4 | `` | `text` | NO |  |  |
| 4 | `` | `integer` | NO |  |  |
| 4 | `` | `integer` | NO | 0 |  |
| 4 | `` | `integer` | YES |  |  |
| 4 | `` | `USER-DEFINED` | NO |  |  |
| 4 | `` | `text` | YES |  |  |
| 4 | `` | `text` | NO |  |  |
| 4 | `` | `text` | NO |  |  |
| 4 | `` | `integer` | YES |  |  |
| 4 | `` | `text` | YES |  |  |
| 4 | `` | `timestamp with time zone` | NO | now() |  |
| 4 | `` | `text` | NO |  |  |
| 5 | `` | `text` | NO | 'shipping'::text |  |
| 5 | `` | `boolean` | NO | false |  |
| 5 | `` | `timestamp with time zone` | NO | now() |  |
| 5 | `` | `timestamp with time zone` | NO | now() |  |
| 5 | `` | `text` | NO |  |  |
| 5 | `` | `text` | NO |  |  |
| 5 | `` | `integer` | NO | 0 |  |
| 5 | `` | `text` | NO |  |  |
| 5 | `` | `integer` | NO |  |  |
| 5 | `` | `integer` | NO | 0 |  |
| 5 | `` | `integer` | YES |  |  |
| 5 | `` | `USER-DEFINED` | NO | 'pending'::payment_status |  |
| 5 | `` | `integer` | NO | 0 |  |
| 5 | `` | `integer` | NO | 0 |  |
| 5 | `` | `text` | NO |  |  |
| 5 | `` | `integer` | YES |  |  |
| 5 | `` | `text` | YES |  |  |
| 5 | `` | `timestamp with time zone` | NO | now() |  |
| 5 | `` | `ARRAY` | NO | ARRAY['buyer'::text] |  |
| 6 | `` | `text` | NO |  |  |
| 6 | `` | `timestamp with time zone` | NO | now() |  |
| 6 | `` | `timestamp with time zone` | NO | now() |  |
| 6 | `` | `text` | NO | 'open'::text |  |
| 6 | `` | `integer` | NO |  |  |
| 6 | `` | `boolean` | NO | true |  |
| 6 | `` | `text` | NO |  |  |
| 6 | `` | `uuid` | YES |  |  |
| 6 | `` | `integer` | NO | 0 |  |
| 6 | `` | `integer` | YES |  |  |
| 6 | `` | `text` | YES |  |  |
| 6 | `` | `timestamp with time zone` | NO | now() |  |
| 6 | `` | `timestamp with time zone` | NO | now() |  |
| 6 | `` | `text` | YES |  |  |
| 6 | `` | `integer` | YES |  |  |
| 6 | `` | `timestamp with time zone` | YES |  |  |
| 6 | `` | `timestamp with time zone` | NO | now() |  |
| 7 | `` | `text` | YES |  |  |
| 7 | `` | `timestamp with time zone` | NO | now() |  |
| 7 | `` | `uuid` | YES |  |  |
| 7 | `` | `integer` | NO | 0 |  |
| 7 | `` | `timestamp with time zone` | NO | now() |  |
| 7 | `` | `text` | NO |  |  |
| 7 | `` | `text` | YES |  |  |
| 7 | `` | `integer` | NO |  |  |
| 7 | `` | `integer` | YES |  |  |
| 7 | `` | `timestamp with time zone` | NO | now() |  |
| 7 | `` | `text` | YES |  |  |
| 7 | `` | `text` | YES |  |  |
| 7 | `` | `uuid` | YES |  |  |
| 7 | `` | `timestamp with time zone` | YES |  |  |
| 7 | `` | `timestamp with time zone` | NO | now() |  |
| 8 | `` | `text` | YES |  |  |
| 8 | `` | `uuid` | YES |  |  |
| 8 | `` | `timestamp with time zone` | YES |  |  |
| 8 | `` | `integer` | YES |  |  |
| 8 | `` | `timestamp with time zone` | NO | now() |  |
| 8 | `` | `text` | NO |  |  |
| 8 | `` | `text` | YES |  |  |
| 8 | `` | `timestamp with time zone` | NO | now() |  |
| 8 | `` | `timestamp with time zone` | YES |  |  |
| 8 | `` | `timestamp with time zone` | NO | now() |  |
| 8 | `` | `text` | YES |  |  |
| 8 | `` | `integer` | NO |  |  |
| 8 | `` | `timestamp with time zone` | NO | now() |  |
| 8 | `` | `timestamp with time zone` | NO | now() |  |
| 9 | `` | `text` | NO |  |  |
| 9 | `` | `timestamp with time zone` | NO | now() |  |
| 9 | `` | `text` | NO | 'order'::text |  |
| 9 | `` | `text` | NO |  |  |
| 9 | `` | `timestamp with time zone` | NO | now() |  |
| 9 | `` | `timestamp with time zone` | YES |  |  |
| 9 | `` | `integer` | YES |  |  |
| 9 | `` | `text` | NO |  |  |
| 9 | `` | `timestamp with time zone` | NO | now() |  |
| 10 | `` | `text` | NO |  |  |
| 10 | `` | `timestamp with time zone` | NO | now() |  |
| 10 | `` | `integer` | YES |  |  |
| 10 | `` | `text` | YES |  |  |
| 10 | `` | `text` | YES |  |  |
| 10 | `` | `text` | YES |  |  |
| 10 | `` | `integer` | YES |  |  |
| 10 | `` | `integer` | NO | 0 |  |
| 11 | `` | `text` | NO |  |  |
| 11 | `` | `integer` | YES |  |  |
| 11 | `` | `timestamp with time zone` | NO | now() |  |
| 11 | `` | `timestamp with time zone` | YES |  |  |
| 11 | `` | `timestamp with time zone` | YES |  |  |
| 11 | `` | `integer` | YES |  |  |
| 11 | `` | `boolean` | NO | false |  |
| 12 | `` | `text` | NO |  |  |
| 12 | `` | `timestamp with time zone` | YES |  |  |
| 12 | `` | `timestamp with time zone` | NO | now() |  |
| 12 | `` | `text` | YES |  |  |
| 12 | `` | `text` | YES |  |  |
| 12 | `` | `text` | YES |  |  |
| 12 | `` | `boolean` | NO | false |  |
| 13 | `` | `text` | YES |  |  |
| 13 | `` | `timestamp with time zone` | YES |  |  |
| 13 | `` | `text` | NO | 'JP'::text |  |
| 13 | `` | `boolean` | YES | false |  |
| 13 | `` | `boolean` | YES |  |  |
| 13 | `` | `text` | NO |  |  |
| 14 | `` | `text` | NO | 'JP'::text |  |
| 14 | `` | `boolean` | NO | true |  |
| 14 | `` | `text` | YES |  |  |
| 14 | `` | `USER-DEFINED` | YES | 'cod'::payment_method |  |
| 14 | `` | `text` | YES |  |  |
| 14 | `` | `text` | NO |  |  |
| 15 | `` | `boolean` | NO | false |  |
| 15 | `` | `jsonb` | YES |  |  |
| 15 | `` | `USER-DEFINED` | NO | 'unpaid'::payment_status |  |
| 15 | `` | `text` | YES |  |  |
| 15 | `` | `USER-DEFINED` | NO | 'public'::product_status |  |
| 16 | `` | `text` | YES |  |  |
| 16 | `` | `timestamp with time zone` | NO | now() |  |
| 16 | `` | `text` | YES |  |  |
| 16 | `` | `text` | YES |  |  |
| 16 | `` | `timestamp with time zone` | YES |  |  |
| 17 | `` | `timestamp with time zone` | NO | now() |  |
| 17 | `` | `timestamp with time zone` | NO | now() |  |
| 17 | `` | `USER-DEFINED` | YES |  |  |
| 17 | `` | `text` | YES |  |  |
| 17 | `` | `timestamp with time zone` | NO | now() |  |
| 18 | `` | `timestamp with time zone` | NO | now() |  |
| 18 | `` | `text` | YES |  |  |
| 18 | `` | `text` | YES |  |  |
| 18 | `` | `timestamp with time zone` | NO | now() |  |
| 19 | `` | `text` | YES |  |  |
| 19 | `` | `text` | YES |  |  |
| 20 | `` | `text` | NO | 'unshipped'::text |  |
| 20 | `` | `text` | YES |  |  |
| 21 | `` | `integer` | NO | 0 |  |
| 21 | `` | `integer` | YES |  |  |
| 22 | `` | `text` | YES |  |  |
| 22 | `` | `text` | YES |  |  |
| 23 | `` | `integer` | NO | 0 |  |
| 23 | `` | `integer` | YES |  |  |
| 24 | `` | `boolean` | NO | true |  |
| 24 | `` | `boolean` | YES |  |  |
| 25 | `` | `text` | YES |  |  |
| 26 | `` | `text` | YES |  |  |
| 27 | `` | `text` | YES |  |  |
| 28 | `` | `text` | YES |  |  |
| 29 | `` | `text` | YES |  |  |
| 30 | `` | `text` | YES |  |  |
| 31 | `` | `text` | YES |  |  |
| 32 | `` | `text` | YES |  |  |
| 33 | `` | `text` | YES |  |  |
| 34 | `` | `text` | YES |  |  |
| 35 | `` | `text` | YES |  |  |
| 36 | `` | `text` | YES |  |  |
| 37 | `` | `text` | YES |  |  |
| 38 | `` | `text` | YES |  |  |
| 39 | `` | `text` | YES |  |  |
| 40 | `` | `text` | YES |  |  |

**Indexes**

- `addresses_pkey` (UNIQUE): `undefined`
- `ix_addresses_order_scope`: `undefined`
- `ix_addresses_user_scope`: `undefined`
- `ux_user_default_address` (UNIQUE): `undefined`
- `cart_items_cart_id_product_id_key` (UNIQUE): `undefined`
- `cart_items_pkey` (UNIQUE): `undefined`
- `idx_cart_items_cart`: `undefined`
- `idx_cart_items_product`: `undefined`
- `idx_cart_items_user`: `undefined`
- `carts_pkey` (UNIQUE): `undefined`
- `carts_user_id_key` (UNIQUE): `undefined`
- `categories_name_key` (UNIQUE): `undefined`
- `categories_pkey` (UNIQUE): `undefined`
- `categories_slug_key` (UNIQUE): `undefined`
- `contacts_pkey` (UNIQUE): `undefined`
- `idx_contacts_created_at`: `undefined`
- `idx_contacts_email`: `undefined`
- `idx_contacts_status`: `undefined`
- `idx_contacts_type`: `undefined`
- `coupons_code_key` (UNIQUE): `undefined`
- `coupons_pkey` (UNIQUE): `undefined`
- `ix_coupons_active_window`: `undefined`
- `option_labels_pkey` (UNIQUE): `undefined`
- `option_labels_unique` (UNIQUE): `undefined`
- `idx_order_addresses_order`: `undefined`
- `idx_order_addresses_type`: `undefined`
- `ix_order_addresses_order_id`: `undefined`
- `ix_order_addresses_type`: `undefined`
- `order_addresses_pkey` (UNIQUE): `undefined`
- `idx_order_items_order`: `undefined`
- `idx_order_items_product`: `undefined`
- `order_items_pkey` (UNIQUE): `undefined`
- `idx_orders_buyer`: `undefined`
- `idx_orders_buyer_created_at`: `undefined`
- `idx_orders_created`: `undefined`
- `idx_orders_order_number`: `undefined`
- `idx_orders_payment_status`: `undefined`
- `idx_orders_shipment_status`: `undefined`
- `idx_orders_status`: `undefined`
- `idx_orders_status_updated_at`: `undefined`
- `orders_order_number_key` (UNIQUE): `undefined`
- `orders_pkey` (UNIQUE): `undefined`
- `uq_orders_order_number` (UNIQUE): `undefined`
- `idx_payments_created`: `undefined`
- `idx_payments_order`: `undefined`
- `idx_payments_status`: `undefined`
- `payments_pkey` (UNIQUE): `undefined`
- `payments_transaction_id_key` (UNIQUE): `undefined`
- `idx_product_images_position`: `undefined`
- `idx_product_images_product`: `undefined`
- `ix_product_images_position`: `undefined`
- `ix_product_images_product_id`: `undefined`
- `product_images_pkey` (UNIQUE): `undefined`
- `product_images_r2_key_key` (UNIQUE): `undefined`
- `idx_product_specs_pos`: `undefined`
- `idx_product_specs_product`: `undefined`
- `product_specs_pkey` (UNIQUE): `undefined`
- `product_tags_pkey` (UNIQUE): `undefined`
- `idx_products_category`: `undefined`
- `idx_products_price`: `undefined`
- `idx_products_published_at`: `undefined`
- `idx_products_status`: `undefined`
- `idx_products_stock`: `undefined`
- `idx_products_trgm`: `undefined`
- `products_pkey` (UNIQUE): `undefined`
- `products_slug_key` (UNIQUE): `undefined`
- `r2_assets_key_uidx` (UNIQUE): `undefined`
- `r2_assets_pkey` (UNIQUE): `undefined`
- `r2_assets_seller_idx`: `undefined`
- `r2_assets_sha256_idx`: `undefined`
- `idx_shipments_created`: `undefined`
- `idx_shipments_order`: `undefined`
- `idx_shipments_status`: `undefined`
- `ix_shipments_order`: `undefined`
- `ix_shipments_status`: `undefined`
- `shipments_pkey` (UNIQUE): `undefined`
- `shipments_tracking_number_key` (UNIQUE): `undefined`
- `idx_tags_name`: `undefined`
- `tags_name_key` (UNIQUE): `undefined`
- `tags_pkey` (UNIQUE): `undefined`
- `tags_slug_key` (UNIQUE): `undefined`
- `idx_user_recent_products_user_time`: `undefined`
- `user_recent_products_pkey` (UNIQUE): `undefined`
- `users_email_key` (UNIQUE): `undefined`
- `users_pkey` (UNIQUE): `undefined`

---

