-- Add an optional cup colour without guessing colours for existing SKUs.
ALTER TABLE products ADD COLUMN color_label varchar(80) NOT NULL DEFAULT '';
DROP INDEX product_variant_combination;
CREATE UNIQUE INDEX product_variant_combination ON products(
 model_id,COALESCE(scent_id,'00000000-0000-0000-0000-000000000000'::uuid),
 lower(btrim(size_label)),lower(btrim(color_label))
);
