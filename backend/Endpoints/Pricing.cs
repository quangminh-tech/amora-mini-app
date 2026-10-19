using System.Text.Json;
using Dapper;

namespace Amora;
public static class Pricing
{
    public static void MapPricing(this WebApplication app)
    {
        app.MapGet("/api/pricing/policies", async (HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            var manager = ctx.User().Manager;
            var policies = await c.QueryAsync("SELECT p.id,p.category_id,p.channel,p.name,p.ctv_allowed,p.active,p.version,cat.name category_name FROM pricing_policies p JOIN product_categories cat ON cat.id=p.category_id WHERE @manager OR (p.active AND p.ctv_allowed AND cat.active) ORDER BY cat.name,p.channel", new { manager }, tx);
            var tiers = await c.QueryAsync("SELECT t.id,t.policy_id,t.min_qty,t.commission_rate FROM pricing_tiers t JOIN pricing_policies p ON p.id=t.policy_id JOIN product_categories cat ON cat.id=p.category_id WHERE @manager OR (p.active AND p.ctv_allowed AND cat.active) ORDER BY t.min_qty", new { manager }, tx);
            await tx.CommitAsync();
            return Results.Ok(new { policies, tiers });
        });
        app.MapGet("/api/pricing/editor", async (HttpContext ctx, Db db) =>
        {
            ctx.Manager();
            Check.That(Guid.TryParse(ctx.Request.Query["categoryId"], out var category), "Chọn nhóm sản phẩm.");
            var channel = ctx.Request.Query["channel"].ToString();
            Check.That(channel is "wholesale" or "b2b", "Chọn sỉ hoặc doanh nghiệp.");
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            var policy = await c.QuerySingleOrDefaultAsync("SELECT * FROM pricing_policies WHERE category_id=@category AND channel=@channel", new { category, channel }, tx);
            var products = (await c.QueryAsync("SELECT p.id,p.sku,p.size_label,p.color_label,m.name,s.name scent_name,p.active,co.unit_cost,COALESCE(co.version,0) cost_version,pr.unit_price retail_price FROM products p JOIN product_models m ON m.id=p.model_id LEFT JOIN scents s ON s.id=p.scent_id LEFT JOIN product_costs co ON co.product_id=p.id LEFT JOIN prices pr ON pr.product_id=p.id AND pr.channel='retail' WHERE m.category_id=@category ORDER BY m.name,p.size_label,p.color_label,p.sku LIMIT 501", new { category }, tx)).ToArray();
            Check.That(products.Length <= 500, "Nhóm vượt 500 SKU. Tách nhóm trước khi chỉnh toàn bộ chính sách.");
            var id = policy is null ? Guid.Empty : (Guid)policy.id;
            var tiers = await c.QueryAsync("SELECT * FROM pricing_tiers WHERE policy_id=@id ORDER BY min_qty", new { id }, tx);
            var prices = await c.QueryAsync("SELECT v.* FROM pricing_tier_prices v JOIN pricing_tiers t ON t.id=v.tier_id WHERE t.policy_id=@id", new { id }, tx);
            await tx.CommitAsync();
            return Results.Ok(new { policy, products, tiers, prices });
        });
        app.MapPut("/api/pricing/policy", async (PolicyInput r, HttpContext ctx, Db db) =>
        {
            ctx.Manager();
            Check.That(r.Channel is "wholesale" or "b2b", "Kênh giá không hợp lệ.");
            var name = Check.Text(r.Name, 180, true);
            Check.That(r.Tiers is { Count: > 0 and <= 6 } && r.Tiers.All(t => t is not null && t.MinQty is> 0 and <= 100000 && t.CommissionRate is >= 0 and <= 100 && decimal.Round(t.CommissionRate, 2) == t.CommissionRate && t.Prices is not null), "Mỗi chính sách cần 1–6 bậc hợp lệ.");
            Check.That(r.Tiers.Select(t => t.MinQty).Distinct().Count() == r.Tiers.Count, "Số lượng bắt đầu các bậc không được trùng.");
            Check.That(r.MinMargin is >= 0 and < 100 && decimal.Round(r.MinMargin, 2) == r.MinMargin, "Ngưỡng lợi nhuận không hợp lệ.");
            Check.That(r.Costs is not null && r.Costs.Count <= 500 && r.Costs.All(x => x is not null && x.UnitCost is >= 0 and <= 1000000000 && decimal.Truncate(x.UnitCost) == x.UnitCost) && r.Costs.Select(x => x.ProductId).Distinct().Count() == r.Costs.Count, "Giá vốn không hợp lệ.");
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("SELECT pg_advisory_xact_lock(@key)", new { key = QuantityPricing.LockKey }, tx);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM product_categories WHERE id=@id", new { id = r.CategoryId }, tx) == 1, "Nhóm không tồn tại.");
            var old = await c.QuerySingleOrDefaultAsync<PolicyRow>("SELECT * FROM pricing_policies WHERE category_id=@CategoryId AND channel=@Channel", r, tx);
            Check.That((old?.version ?? 0) == r.Version, "Chính sách đã thay đổi. Tải lại trước khi lưu.", 409);
            var valid = (await c.QueryAsync<Guid>("SELECT p.id FROM products p JOIN product_models m ON m.id=p.model_id WHERE m.category_id=@CategoryId", r, tx)).ToHashSet();
            Check.That(valid.Count <= 500, "Nhóm vượt 500 SKU.");
            var currentCosts = (await c.QueryAsync<CostRow>("SELECT * FROM product_costs WHERE product_id=ANY(@ids)", new { ids = valid.ToArray() }, tx)).ToDictionary(x => x.product_id);
            foreach (var cost in r.Costs!)
            {
                Check.That(valid.Contains(cost.ProductId), "Giá vốn chứa SKU ngoài nhóm.");
                Check.That((currentCosts.TryGetValue(cost.ProductId, out var current) ? current.version : 0) == cost.Version, "Giá vốn đã thay đổi. Tải lại trước khi lưu.", 409);
            }

            if (r.Costs.Count > 0)
            {
                var values = JsonSerializer.Serialize(r.Costs.Select(x => new { product_id = x.ProductId, unit_cost = x.UnitCost, version = x.Version + 1 }));
                var updated = await c.ExecuteAsync("INSERT INTO product_costs(product_id,unit_cost,version) SELECT product_id,unit_cost,version FROM jsonb_to_recordset(CAST(@values AS jsonb)) AS x(product_id uuid,unit_cost numeric,version integer) ON CONFLICT(product_id) DO UPDATE SET unit_cost=excluded.unit_cost,version=excluded.version,updated_at=now() WHERE product_costs.version=excluded.version-1", new { values }, tx);
                Check.That(updated == r.Costs.Count, "Giá vốn đã thay đổi. Tải lại trước khi lưu.", 409);
            }

            var costs = (await c.QueryAsync<CostRow>("SELECT co.* FROM product_costs co WHERE product_id=ANY(@ids)", new { ids = valid.ToArray() }, tx)).ToDictionary(x => x.product_id);
            foreach (var t in r.Tiers)
            {
                Check.That(t.Prices.Count <= 500 && t.Prices.All(v => v is not null && valid.Contains(v.ProductId) && v.UnitPrice is> 0 and <= 1000000000 && decimal.Truncate(v.UnitPrice) == v.UnitPrice), "Giá chứa SKU ngoài nhóm hoặc số tiền không hợp lệ.");
                Check.That(t.Prices.Select(v => v.ProductId).Distinct().Count() == t.Prices.Count, "SKU trong bậc bị trùng.");
                if (r.Active && r.MinMargin > 0)
                    foreach (var v in t.Prices)
                    {
                        Check.That(costs.TryGetValue(v.ProductId, out var cost), "Cần nhập giá vốn cho mọi SKU có giá khi bật ngưỡng lợi nhuận.");
                        Check.That((v.UnitPrice - cost!.unit_cost - v.UnitPrice * t.CommissionRate / 100) / v.UnitPrice * 100 >= r.MinMargin, "Có giá chưa đạt lợi nhuận tối thiểu sau hoa hồng.");
                    }
            }

            var id = old?.id ?? Guid.NewGuid();
            await c.ExecuteAsync("INSERT INTO pricing_policies(id,category_id,channel,name,ctv_allowed,active,min_margin) VALUES(@id,@CategoryId,@Channel,@name,@CtvAllowed,@Active,@MinMargin) ON CONFLICT(category_id,channel) DO UPDATE SET name=excluded.name,ctv_allowed=excluded.ctv_allowed,active=excluded.active,min_margin=excluded.min_margin,version=pricing_policies.version+1,updated_at=now()", new { id, r.CategoryId, r.Channel, name, r.CtvAllowed, r.Active, r.MinMargin }, tx);
            await c.ExecuteAsync("DELETE FROM pricing_tiers WHERE policy_id=@id", new { id }, tx);
            foreach (var t in r.Tiers.OrderBy(t => t.MinQty))
            {
                var tid = Guid.NewGuid();
                await c.ExecuteAsync("INSERT INTO pricing_tiers(id,policy_id,min_qty,commission_rate) VALUES(@tid,@id,@MinQty,@CommissionRate)", new { tid, id, t.MinQty, t.CommissionRate }, tx);
                if (t.Prices.Count > 0)
                {
                    var values = JsonSerializer.Serialize(t.Prices.Select(v => new { product_id = v.ProductId, unit_price = v.UnitPrice }));
                    await c.ExecuteAsync("INSERT INTO pricing_tier_prices(tier_id,product_id,unit_price) SELECT @tid,product_id,unit_price FROM jsonb_to_recordset(CAST(@values AS jsonb)) AS x(product_id uuid,unit_price numeric)", new { tid, values }, tx);
                }
            }

            await db.Audit(c, tx, ctx.User().Id, "pricing_policy_saved", id, new { r.Channel, r.CategoryId, r.Version });
            await tx.CommitAsync();
            return Results.Ok(new { id });
        });
        app.MapPost("/api/pricing/preview", async (PricePreview r, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var result = await QuantityPricing.Calculate(c, tx, r.Lines, r.Channel, ctx.User().Manager);
            await tx.CommitAsync();
            return Results.Ok(result);
        });
    }
}

public record PolicyInput(Guid CategoryId, string Channel, string Name, bool Active, bool CtvAllowed, decimal MinMargin, int Version, List<TierInput> Tiers, List<CostInput> Costs);
public record TierInput(int MinQty, decimal CommissionRate, List<TierPriceInput> Prices);
public record TierPriceInput(Guid ProductId, decimal UnitPrice);
public record CostInput(Guid ProductId, decimal UnitCost, int Version);
public record PricePreview(string Channel, List<SaleLine> Lines);
