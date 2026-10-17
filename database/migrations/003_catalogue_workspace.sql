CREATE TABLE product_categories (
 id uuid PRIMARY KEY, code varchar(40) NOT NULL, name varchar(120) NOT NULL CHECK(length(btrim(name))>0),
 sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 100000), active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE UNIQUE INDEX product_category_code ON product_categories(lower(btrim(code)));
CREATE UNIQUE INDEX product_category_name ON product_categories(lower(btrim(name)));
CREATE TABLE customer_groups (LIKE product_categories INCLUDING ALL);
CREATE TABLE product_models (
 id uuid PRIMARY KEY, code varchar(40) NOT NULL, name varchar(180) NOT NULL CHECK(length(btrim(name))>0),
 category_id uuid NOT NULL REFERENCES product_categories(id), description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 version int NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX model_code ON product_models(lower(btrim(code)));
CREATE INDEX model_category ON product_models(category_id);
-- Retain existing SKU identifiers; no guessed sizes are assigned to legacy rows.
INSERT INTO product_categories(id,code,name)
 SELECT gen_random_uuid(),'CAT-'||row_number() OVER(ORDER BY category),category FROM (SELECT DISTINCT category FROM products) x;
INSERT INTO product_categories(id,code,name) SELECT gen_random_uuid(),'CANDLE','Nến thơm' WHERE NOT EXISTS(SELECT 1 FROM product_categories WHERE name='Nến thơm');
INSERT INTO product_categories(id,code,name) SELECT gen_random_uuid(),'MINI','Sáp mini' WHERE NOT EXISTS(SELECT 1 FROM product_categories WHERE name='Sáp mini');
INSERT INTO product_categories(id,code,name) SELECT gen_random_uuid(),'GIFT','Set quà' WHERE NOT EXISTS(SELECT 1 FROM product_categories WHERE name='Set quà');
INSERT INTO product_categories(id,code,name) SELECT gen_random_uuid(),'ACCESSORY','Phụ kiện' WHERE NOT EXISTS(SELECT 1 FROM product_categories WHERE name='Phụ kiện');
INSERT INTO product_models(id,code,name,category_id,description,active)
 SELECT p.id,left(p.sku,40),p.name,c.id,p.description,p.active FROM products p JOIN product_categories c ON c.name=p.category;
ALTER TABLE products ADD COLUMN model_id uuid REFERENCES product_models(id);
UPDATE products SET model_id=id;
ALTER TABLE products ALTER COLUMN model_id SET NOT NULL;
ALTER TABLE products ADD COLUMN size_label varchar(100) NOT NULL DEFAULT '';
CREATE INDEX products_model ON products(model_id);
CREATE UNIQUE INDEX product_sku_normalized ON products(lower(btrim(sku)));
CREATE UNIQUE INDEX product_variant_combination ON products(model_id,COALESCE(scent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(size_label)));
ALTER TABLE scents ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE scents ADD COLUMN version int NOT NULL DEFAULT 1;
INSERT INTO customer_groups(id,code,name,sort_order) VALUES
 ('00000000-0000-0000-0000-000000000001','UNCLASSIFIED','Chưa phân loại',0),
 (gen_random_uuid(),'RETAIL','Khách lẻ',1),(gen_random_uuid(),'WHOLESALE','Khách sỉ',2),(gen_random_uuid(),'BUSINESS','Doanh nghiệp',3);
ALTER TABLE customers ADD COLUMN group_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES customer_groups(id);
ALTER TABLE customers ADD COLUMN note varchar(1000) NOT NULL DEFAULT '';
CREATE INDEX customers_group ON customers(group_id);
CREATE FUNCTION amora_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN cleaned ~ '^84[0-9]{9}$' THEN '0'||substring(cleaned FROM 3) ELSE cleaned END
 FROM (SELECT regexp_replace(value,'[^0-9]','','g') AS cleaned) p
$$;
CREATE INDEX customers_phone ON customers(amora_phone(phone)) WHERE phone<>'';
ALTER TABLE quote_lines ADD COLUMN commission_rate numeric(5,2) CHECK(commission_rate BETWEEN 0 AND 100);
ALTER TABLE orders ADD COLUMN source_quote_id uuid UNIQUE REFERENCES quotes(id);
CREATE TABLE import_batches (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), kind varchar(40) NOT NULL, mode varchar(10) NOT NULL CHECK(mode IN ('create','update')),
 payload jsonb NOT NULL, status varchar(12) NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','committed')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', committed_at timestamptz
);
CREATE INDEX imports_actor ON import_batches(actor_id,created_at DESC);
ALTER TABLE product_categories ADD CONSTRAINT product_category_code_required CHECK(length(btrim(code))>0);
ALTER TABLE customer_groups ADD CONSTRAINT customer_group_code_required CHECK(length(btrim(code))>0);
ALTER TABLE product_models ADD CONSTRAINT model_code_required CHECK(length(btrim(code))>0);
ALTER TABLE scents ADD CONSTRAINT scent_version_valid CHECK(version>0);
CREATE UNIQUE INDEX scent_name_normalized ON scents(lower(btrim(name)));
ALTER TABLE quote_lines ADD COLUMN lead_days_min int, ADD COLUMN lead_days_max int,
 ADD CONSTRAINT quote_lead_time CHECK((lead_days_min IS NULL AND lead_days_max IS NULL) OR (lead_days_min IS NOT NULL AND lead_days_max IS NOT NULL AND lead_days_min>=0 AND lead_days_max BETWEEN lead_days_min AND 365));
ALTER TABLE order_lines ADD COLUMN lead_days_min int, ADD COLUMN lead_days_max int,
 ADD CONSTRAINT order_lead_time CHECK((lead_days_min IS NULL AND lead_days_max IS NULL) OR (lead_days_min IS NOT NULL AND lead_days_max IS NOT NULL AND lead_days_min>=0 AND lead_days_max BETWEEN lead_days_min AND 365));
UPDATE settings SET value=jsonb_set(value,'{quoteTerms}',to_jsonb('Thời gian chuẩn bị theo từng dòng sản phẩm; lịch giao xác nhận khi chốt đơn. Báo giá chưa phải hóa đơn thuế. Thuế và vận chuyển cần xác nhận trước khi đặt hàng.'::text)),version=version+1
 WHERE key='business' AND value->>'quoteTerms' LIKE 'Thời gian thực hiện dự kiến 7–10 ngày%';
