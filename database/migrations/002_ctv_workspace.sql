-- Additive upgrade: never rewrite 001 or delete existing business data.
ALTER TABLE users ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE products ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE products ADD COLUMN category varchar(80) NOT NULL DEFAULT 'Nến thơm';
ALTER TABLE products ADD COLUMN lead_days_min int NOT NULL DEFAULT 7 CHECK(lead_days_min BETWEEN 0 AND 365);
ALTER TABLE products ADD COLUMN lead_days_max int NOT NULL DEFAULT 10 CHECK(lead_days_max BETWEEN lead_days_min AND 365);
ALTER TABLE prices ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE customers ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE customers ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE settings ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
INSERT INTO settings(key,value) VALUES('account_limits','{"managers":2,"ctvs":50}');
ALTER TABLE users ADD CONSTRAINT user_name_required CHECK(length(trim(name))>0) NOT VALID;
ALTER TABLE customers ADD CONSTRAINT customer_name_required CHECK(length(trim(name))>0) NOT VALID;
ALTER TABLE products ADD CONSTRAINT product_text_required CHECK(length(trim(name))>0 AND length(trim(sku))>0 AND length(trim(unit))>0) NOT VALID;
ALTER TABLE orders ADD CONSTRAINT order_money_valid CHECK(subtotal>0 AND commission_total BETWEEN 0 AND subtotal AND version>0 AND channel IN ('retail','wholesale','b2b')) NOT VALID;
ALTER TABLE quotes ADD CONSTRAINT quote_money_valid CHECK(subtotal>0 AND version>0 AND channel IN ('retail','wholesale','b2b')) NOT VALID;
ALTER TABLE order_lines ADD CONSTRAINT order_line_math CHECK(amount=qty*unit_price AND commission=round(amount*commission_rate/100,0)) NOT VALID;
ALTER TABLE quote_lines ADD CONSTRAINT quote_line_math CHECK(amount=qty*unit_price) NOT VALID;
ALTER TABLE order_lines ADD CONSTRAINT order_product_once UNIQUE(order_id,product_id);
ALTER TABLE quote_lines ADD CONSTRAINT quote_product_once UNIQUE(quote_id,product_id);
-- Validate legacy rows inside the migration transaction. Invalid data aborts the upgrade.
ALTER TABLE users VALIDATE CONSTRAINT user_name_required;
ALTER TABLE customers VALIDATE CONSTRAINT customer_name_required;
ALTER TABLE products VALIDATE CONSTRAINT product_text_required;
ALTER TABLE orders VALIDATE CONSTRAINT order_money_valid;
ALTER TABLE quotes VALIDATE CONSTRAINT quote_money_valid;
ALTER TABLE order_lines VALIDATE CONSTRAINT order_line_math;
ALTER TABLE quote_lines VALIDATE CONSTRAINT quote_line_math;
CREATE INDEX orders_customer_date ON orders(customer_id,created_at DESC,id DESC);
CREATE INDEX quotes_customer_date ON quotes(customer_id,created_at DESC,id DESC);
CREATE INDEX orders_date_id ON orders(created_at DESC,id DESC);
CREATE INDEX quotes_date_id ON quotes(created_at DESC,id DESC);
CREATE INDEX orders_owner_status_date ON orders(owner_id,status,created_at DESC,id DESC);
CREATE INDEX quotes_owner_status_date ON quotes(owner_id,status,created_at DESC,id DESC);
CREATE INDEX orders_completed ON orders(completed_at DESC) WHERE status='completed';
CREATE INDEX customers_owner_date ON customers(owner_id,created_at DESC,id DESC);
CREATE INDEX customers_date_id ON customers(created_at DESC,id DESC);
CREATE INDEX users_role_active ON users(role,active);
CREATE INDEX product_images_product ON product_images(product_id);
CREATE INDEX products_scent ON products(scent_id);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX order_events_order ON order_events(order_id,created_at);
CREATE INDEX commissions_date_id ON commissions(created_at DESC,id DESC);
CREATE INDEX commissions_approver ON commissions(approved_by);
-- Preserve the historical balance; migration date is NOT a payment receipt date.
CREATE TABLE payments (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 actor_id uuid REFERENCES users(id),
 amount numeric(15,0) NOT NULL CHECK(amount<>0),
 reference varchar(300) NOT NULL CHECK(length(trim(reference))>0),
 occurred_at timestamptz,
 opening_balance boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((opening_balance AND occurred_at IS NULL) OR (NOT opening_balance AND occurred_at IS NOT NULL))
);
INSERT INTO payments(id,order_id,amount,reference,opening_balance)
 SELECT id,id,paid,'Số dư khi nâng cấp; chưa xác định ngày thu',true FROM orders WHERE paid<>0;
CREATE INDEX payments_order ON payments(order_id,created_at,id);
CREATE INDEX payments_date ON payments(occurred_at) WHERE NOT opening_balance;
CREATE INDEX payments_actor ON payments(actor_id);
CREATE FUNCTION amora_immutable_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Payment entries are immutable; insert a correcting entry' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_payments BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION amora_immutable_payment();
-- Check full-document arithmetic at COMMIT, after all child rows have been written.
CREATE FUNCTION amora_check_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc uuid; total numeric; expected numeric; received numeric; actual numeric;
BEGIN
 IF TG_TABLE_NAME='orders' THEN doc=COALESCE(NEW.id,OLD.id);
 ELSE doc=COALESCE(NEW.order_id,OLD.order_id); END IF;
 SELECT subtotal,paid INTO expected,received FROM orders WHERE id=doc;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT COALESCE(sum(amount),0) INTO total FROM order_lines WHERE order_id=doc;
 SELECT COALESCE(sum(amount),0) INTO actual FROM payments WHERE order_id=doc;
 IF expected<>total OR received<>actual THEN RAISE EXCEPTION 'Order total/payment balance mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_totals AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION amora_check_order();
CREATE CONSTRAINT TRIGGER line_totals AFTER INSERT OR UPDATE OR DELETE ON order_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION amora_check_order();
CREATE CONSTRAINT TRIGGER payment_totals AFTER INSERT ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION amora_check_order();
CREATE FUNCTION amora_check_quote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc uuid; total numeric; expected numeric;
BEGIN
 IF TG_TABLE_NAME='quotes' THEN doc=COALESCE(NEW.id,OLD.id);
 ELSE doc=COALESCE(NEW.quote_id,OLD.quote_id); END IF;
 SELECT subtotal INTO expected FROM quotes WHERE id=doc;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT COALESCE(sum(amount),0) INTO total FROM quote_lines WHERE quote_id=doc;
 IF expected<>total THEN RAISE EXCEPTION 'Quote total mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER quote_totals AFTER INSERT OR UPDATE ON quotes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION amora_check_quote();
CREATE CONSTRAINT TRIGGER quote_line_totals AFTER INSERT OR UPDATE OR DELETE ON quote_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION amora_check_quote();
CREATE FUNCTION amora_no_reparent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)->>TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0]) THEN RAISE EXCEPTION 'Cannot move document lines between documents' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER no_reparent_order_line BEFORE UPDATE ON order_lines FOR EACH ROW EXECUTE FUNCTION amora_no_reparent('order_id');
CREATE TRIGGER no_reparent_quote_line BEFORE UPDATE ON quote_lines FOR EACH ROW EXECUTE FUNCTION amora_no_reparent('quote_id');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM orders o WHERE o.subtotal<>(SELECT COALESCE(sum(l.amount),0) FROM order_lines l WHERE l.order_id=o.id)) OR EXISTS(SELECT 1 FROM quotes q WHERE q.subtotal<>(SELECT COALESCE(sum(l.amount),0) FROM quote_lines l WHERE l.quote_id=q.id)) THEN
 RAISE EXCEPTION 'Existing document totals do not match lines; review data before upgrading'; END IF;
END $$;

CREATE UNIQUE INDEX users_email_normalized ON users(lower(email));
