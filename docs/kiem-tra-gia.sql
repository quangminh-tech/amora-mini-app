-- CHỈ ĐỌC: chạy trong SQL Editor của đúng database/branch API đang dùng.
-- Không cập nhật giá, không suy dung lượng từ hậu tố SKU.
SELECT p.id AS product_id,p.sku,p.size_label,p.color_label,
       m.name AS model_name,cat.name AS category_name,
       p.active AS sku_active,m.active AS model_active,cat.active AS category_active,
       r.unit_price AS retail_price,r.min_qty AS retail_min_qty,r.commission_rate AS retail_commission,
       b.unit_price AS legacy_b2b_price,
       pol.name AS b2b_policy,pol.active AS b2b_active,pol.ctv_allowed AS b2b_ctv_allowed,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('minimum_group_qty',t.min_qty,'unit_price',v.unit_price,'commission_rate',t.commission_rate) ORDER BY t.min_qty)
          FROM pricing_tiers t LEFT JOIN pricing_tier_prices v ON v.tier_id=t.id AND v.product_id=p.id
          WHERE t.policy_id=pol.id),'[]'::jsonb) AS b2b_tiers
FROM products p
JOIN product_models m ON m.id=p.model_id
JOIN product_categories cat ON cat.id=m.category_id
LEFT JOIN prices r ON r.product_id=p.id AND r.channel='retail'
LEFT JOIN prices b ON b.product_id=p.id AND b.channel='b2b'
LEFT JOIN pricing_policies pol ON pol.category_id=cat.id AND pol.channel='b2b'
ORDER BY cat.name,m.name,p.size_label,p.sku;
-- retail_price có số nhưng b2b_tiers rỗng: mới có giá lẻ, chưa thiết lập bậc DN.
-- b2b_active=false: chính sách chưa kích hoạt; b2b_ctv_allowed=false: CTV chưa được dùng.
-- unit_price=null ở bậc đã đạt: SKU chưa nhập giá tại chính bậc đó.
-- Tổng số lượng tính trong cùng category_id; không cộng nến với phụ kiện.
-- Nếu retail_price tồn tại mà API retail vẫn báo thiếu: đối chiếu product_id,
-- payload channel và ConnectionStrings__Default (branch/database) ở bản backend đang chạy.
