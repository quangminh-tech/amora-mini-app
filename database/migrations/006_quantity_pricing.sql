-- Existing prices and historical documents remain intact. New policies are opt-in.
CREATE TABLE pricing_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id uuid NOT NULL REFERENCES product_categories(id),
 channel text NOT NULL CHECK(channel IN ('wholesale','b2b')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 ctv_allowed boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT false,
 min_margin numeric(5,2) NOT NULL DEFAULT 0 CHECK(min_margin>=0 AND min_margin<100),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(category_id,channel)
);
CREATE TABLE pricing_tiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES pricing_policies(id) ON DELETE CASCADE,
 min_qty integer NOT NULL CHECK(min_qty BETWEEN 1 AND 100000),
 commission_rate numeric(5,2) NOT NULL CHECK(commission_rate BETWEEN 0 AND 100),
 UNIQUE(policy_id,min_qty)
);
CREATE TABLE pricing_tier_prices (
 tier_id uuid NOT NULL REFERENCES pricing_tiers(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 unit_price numeric(14,0) NOT NULL CHECK(unit_price>0 AND unit_price<=1000000000),
 PRIMARY KEY(tier_id,product_id)
);
CREATE INDEX ix_pricing_tier_product ON pricing_tier_prices(product_id);
CREATE TABLE product_costs (
 product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 unit_cost numeric(14,0) NOT NULL CHECK(unit_cost>=0 AND unit_cost<=1000000000),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quotes ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}';

-- Protect the group boundary even when maintenance bypasses the API.
CREATE FUNCTION check_tier_product_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pricing_tiers t JOIN pricing_policies pol ON pol.id=t.policy_id
  JOIN products p ON p.id=NEW.product_id JOIN product_models m ON m.id=p.model_id
  WHERE t.id=NEW.tier_id AND m.category_id=pol.category_id
 ) THEN RAISE EXCEPTION 'Tier price must belong to the policy product group' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pricing_tier_product_group BEFORE INSERT OR UPDATE ON pricing_tier_prices FOR EACH ROW EXECUTE FUNCTION check_tier_product_group();
CREATE FUNCTION protect_priced_model_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.category_id<>OLD.category_id AND EXISTS (
  SELECT 1 FROM products p JOIN pricing_tier_prices v ON v.product_id=p.id
  WHERE p.model_id=OLD.id
 ) THEN RAISE EXCEPTION 'Remove quantity prices before moving a model to another group' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pricing_model_group BEFORE UPDATE OF category_id ON product_models FOR EACH ROW EXECUTE FUNCTION protect_priced_model_group();
CREATE FUNCTION protect_priced_product_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.model_id<>OLD.model_id AND EXISTS (
  SELECT 1 FROM pricing_tier_prices v JOIN pricing_tiers t ON t.id=v.tier_id
  JOIN pricing_policies pol ON pol.id=t.policy_id JOIN product_models m ON m.id=NEW.model_id
  WHERE v.product_id=OLD.id AND pol.category_id<>m.category_id
 ) THEN RAISE EXCEPTION 'Remove quantity prices before moving SKU to another group' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pricing_product_group BEFORE UPDATE OF model_id ON products FOR EACH ROW EXECUTE FUNCTION protect_priced_product_group();
CREATE FUNCTION protect_pricing_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='pricing_policies' THEN
  IF NEW.category_id<>OLD.category_id OR NEW.channel<>OLD.channel THEN
   RAISE EXCEPTION 'Policy group and channel are immutable; create another policy' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.policy_id<>OLD.policy_id THEN
   RAISE EXCEPTION 'Tier policy is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pricing_policy_parent BEFORE UPDATE ON pricing_policies FOR EACH ROW EXECUTE FUNCTION protect_pricing_parent();
CREATE TRIGGER pricing_tier_parent BEFORE UPDATE ON pricing_tiers FOR EACH ROW EXECUTE FUNCTION protect_pricing_parent();
