using System.Text.Json;
using Dapper;
using Npgsql;

namespace Amora;
public static class QuantityPricing
{
    public static string ChannelLabel(string channel) => channel switch { "retail" => "Bán lẻ", "wholesale" => "Bán sỉ", "b2b" => "Doanh nghiệp", _ => "Không hợp lệ" };
    public const long LockKey = 71352033;
    public static async Task<PricingResult> Calculate(NpgsqlConnection c, NpgsqlTransaction tx, List<SaleLine> lines, string channel, bool manager)
    {
        Check.That(new[] { "retail", "wholesale", "b2b" }.Contains(channel), "Kênh giá không hợp lệ.");
        Check.That(lines is { Count: > 0 and <= 50 } && lines.All(l => l is not null && l.ProductId != Guid.Empty && l.Qty is> 0 and <= 100000), "Chọn từ 1 đến 50 SKU, số lượng nguyên từ 1 đến 100.000.");
        Check.That(lines.Select(l => l.ProductId).Distinct().Count() == lines.Count, "Một SKU chỉ xuất hiện một lần.");
        // Shared lock serializes with policy replacement and cost changes without blocking other quotes.
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock_shared(@key)", new { key = LockKey }, tx);
        var ids = lines.Select(l => l.ProductId).ToArray();
        var products = (await c.QueryAsync<PricingProduct>("""
            SELECT p.id,m.category_id,cat.name category_name,p.sku,
            (m.name||CASE WHEN s.name IS NULL OR s.name=m.name THEN '' ELSE ' · '||s.name END||' · '||p.size_label||CASE WHEN p.color_label='' THEN '' ELSE ' · '||p.color_label END) name,
            p.unit,p.size_label,p.lead_days_min,p.lead_days_max
            FROM products p JOIN product_models m ON m.id=p.model_id JOIN product_categories cat ON cat.id=m.category_id LEFT JOIN scents s ON s.id=p.scent_id
            WHERE p.id=ANY(@ids) AND p.active AND m.active AND cat.active AND (p.scent_id IS NULL OR s.active)
            """, new { ids }, tx)).ToDictionary(p => p.id);
        Check.That(products.Count == ids.Length, "Có SKU không còn được bán. Hãy chọn lại.");
        var policies = (await c.QueryAsync<PolicyRow>("SELECT * FROM pricing_policies WHERE active AND channel=@channel AND category_id=ANY(@categories)", new { channel, categories = products.Values.Select(p => p.category_id).Distinct().ToArray() }, tx)).ToDictionary(p => p.category_id);
        var tiers = (await c.QueryAsync<TierRow>("SELECT t.* FROM pricing_tiers t JOIN pricing_policies p ON p.id=t.policy_id WHERE p.active AND p.channel=@channel AND p.category_id=ANY(@categories)", new { channel, categories = products.Values.Select(p => p.category_id).Distinct().ToArray() }, tx)).ToArray();
        var tierPrices = (await c.QueryAsync<TierPriceRow>("SELECT v.* FROM pricing_tier_prices v WHERE v.product_id=ANY(@ids)", new { ids }, tx)).ToDictionary(p => (p.tier_id, p.product_id));
        var legacy = (await c.QueryAsync<LegacyPrice>("SELECT product_id,unit_price,commission_rate,min_qty FROM prices WHERE product_id=ANY(@ids) AND channel=@channel", new { ids, channel }, tx)).ToDictionary(p => p.product_id);
        var costs = (await c.QueryAsync<CostRow>("SELECT product_id,unit_cost,version FROM product_costs WHERE product_id=ANY(@ids)", new { ids }, tx)).ToDictionary(p => p.product_id);
        var totals = lines.GroupBy(l => products[l.ProductId].category_id).ToDictionary(g => g.Key, g => g.Sum(l => l.Qty));
        var output = new List<PricedLine>();
        foreach (var l in lines)
        {
            var p = products[l.ProductId];
            Check.That(!string.IsNullOrWhiteSpace(p.size_label), $"{p.sku}: quản lý cần xác nhận quy cách trước.");
            decimal? price = null;
            decimal rate = 0;
            string? error = null;
            Guid? tierId = null;
            int? policyVersion = null;
            var groupQty = totals[p.category_id];
            var minimum = 1;
            var channelLabel = ChannelLabel(channel);
            var label = channelLabel;
            if (policies.TryGetValue(p.category_id, out var policy))
            {
                Check.That(manager || policy.ctv_allowed, "CTV chưa được phép dùng chính sách giá của nhóm này.", 403);
                var applicable = tiers.Where(t => t.policy_id == policy.id).OrderBy(t => t.min_qty).ToArray();
                minimum = applicable.FirstOrDefault()?.min_qty ?? 1;
                var tier = applicable.LastOrDefault(t => t.min_qty <= groupQty);
                policyVersion = policy.version;
                label = policy.name;
                if (tier is null)
                    error = $"{p.category_name}: đang có {groupQty}, cần thêm {Math.Max(0, minimum - groupQty)} sản phẩm cùng nhóm để đạt mức {minimum}.";
                else
                {
                    tierId = tier.id;
                    minimum = tier.min_qty;
                    rate = tier.commission_rate;
                    if (tierPrices.TryGetValue((tier.id, p.id), out var tp))
                        price = tp.unit_price;
                    else
                        error = $"{p.sku}: chưa có giá tại bậc từ {tier.min_qty}. Liên hệ quản lý.";
                    label += $" · từ {tier.min_qty}";
                }

                if (price is not null && policy.min_margin > 0)
                {
                    if (!costs.TryGetValue(p.id, out var cost))
                        error = $"{p.sku}: quản lý cần bổ sung giá vốn để kiểm tra lợi nhuận.";
                    else if ((price.Value - cost.unit_cost - price.Value * rate / 100) / price.Value * 100 < policy.min_margin)
                        error = $"{p.sku}: giá chưa đạt ngưỡng lợi nhuận, liên hệ quản lý.";
                }
            }
            else
            {
                Check.That(manager || channel == "retail", $"{p.category_name}: chưa có chính sách {channelLabel.ToLowerInvariant()} được phép cho CTV. Giá bán lẻ là bảng riêng; liên hệ quản lý hoặc chọn bảng giá bán lẻ.", 403);
                if (legacy.TryGetValue(p.id, out var old))
                {
                    price = old.unit_price;
                    rate = old.commission_rate;
                    minimum = old.min_qty;
                    label = channelLabel + (channel == "retail" ? "" : " · theo từng SKU");
                    if (l.Qty < minimum)
                        error = $"{p.sku}: tối thiểu {minimum} cho riêng SKU này.";
                }
                else
                    error = $"{p.sku}: chưa có giá {channelLabel.ToLowerInvariant()} cho SKU này." + (channel == "retail" ? " Quản lý kiểm tra bảng giá lẻ theo đúng mã SKU." : " Giá bán lẻ không tự áp dụng cho kênh này. Quản lý cần thiết lập chính sách hoặc chuyển báo giá sang bảng giá bán lẻ.");
            }

            // Quantity policy prices cannot be manually overridden; changes go through manager's policy editor.
            Check.That(l.UnitPrice is null || (manager && tierId is null && policyVersion is null) || l.UnitPrice == price, "Đơn giá theo chính sách được hệ thống tính, không sửa trực tiếp.", 403);
            if (manager && policyVersion is null && l.UnitPrice is not null)
                price = l.UnitPrice;
            if (price is not null)
                Check.That(price is> 0 and <= 1000000000 && decimal.Truncate(price.Value) == price, "Đơn giá không hợp lệ.");
            var amount = (price ?? 0) * l.Qty;
            output.Add(new(p.id, p.sku, p.name, p.unit, l.Qty, price, rate, amount, decimal.Round(amount * rate / 100, 0, MidpointRounding.AwayFromZero), p.lead_days_min, p.lead_days_max, p.category_name, groupQty, minimum, label, tierId, policyVersion, error));
        }

        return new(output.All(l => l.Error is null), output, output.Sum(l => l.Amount), output.Sum(l => l.Commission));
    }
}

public sealed record PricingResult(bool Valid, List<PricedLine> Lines, decimal Subtotal, decimal Commission)
{
    public string Token => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(Lines.OrderBy(l => l.ProductId).Select(l => new { l.ProductId, l.Qty, l.UnitPrice, l.CommissionRate, l.TierId, l.PolicyVersion })))));
}

public sealed record PricedLine(Guid ProductId, string Sku, string ProductName, string Unit, int Qty, decimal? UnitPrice, decimal CommissionRate, decimal Amount, decimal Commission, int LeadDaysMin, int LeadDaysMax, string Group, int GroupQty, int Minimum, string Policy, Guid? TierId, int? PolicyVersion, string? Error);
public sealed class PricingProduct
{
    public Guid id { get; set; }
    public Guid category_id { get; set; }
    public string category_name { get; set; } = "";
    public string sku { get; set; } = "";
    public string name { get; set; } = "";
    public string unit { get; set; } = "";
    public string size_label { get; set; } = "";
    public int lead_days_min { get; set; }
    public int lead_days_max { get; set; }
}

public sealed class PolicyRow
{
    public Guid id { get; set; }
    public Guid category_id { get; set; }
    public string channel { get; set; } = "";
    public string name { get; set; } = "";
    public bool ctv_allowed { get; set; }
    public bool active { get; set; }
    public decimal min_margin { get; set; }
    public int version { get; set; }
}

public sealed class TierRow
{
    public Guid id { get; set; }
    public Guid policy_id { get; set; }
    public int min_qty { get; set; }
    public decimal commission_rate { get; set; }
}

public sealed class TierPriceRow
{
    public Guid tier_id { get; set; }
    public Guid product_id { get; set; }
    public decimal unit_price { get; set; }
}

public sealed class LegacyPrice
{
    public Guid product_id { get; set; }
    public decimal unit_price { get; set; }
    public decimal commission_rate { get; set; }
    public int min_qty { get; set; }
}

public sealed class CostRow
{
    public Guid product_id { get; set; }
    public decimal unit_cost { get; set; }
    public int version { get; set; }
}
