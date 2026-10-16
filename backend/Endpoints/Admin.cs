using System.Text.Json;
using System.Data;
using Dapper;
namespace Amora;

public static class Admin
{
    public static void MapAdmin(this WebApplication app)
    {
        app.MapGet("/api/dashboard", async (HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open(); var param = new { manager = ctx.User().Manager, uid = ctx.User().Id };
            var stats = await c.QuerySingleAsync("SELECT count(*) AS orders_month,(SELECT COALESCE(sum(subtotal+shipping),0) FROM orders WHERE (@manager OR owner_id=@uid) AND status='completed' AND completed_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS revenue,COALESCE(sum(paid) FILTER(WHERE status NOT IN ('cancelled','returned')),0) AS collected, count(*) FILTER(WHERE status='pending') AS pending FROM orders WHERE (@manager OR owner_id=@uid) AND created_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'", param);
            var commissions = await c.QuerySingleAsync("SELECT COALESCE(sum(amount) FILTER(WHERE status IN ('pending','approved')),0) AS outstanding,COALESCE(sum(amount) FILTER(WHERE status='paid'),0) AS paid FROM commissions WHERE @manager OR user_id=@uid", param);
            var recent = await c.QueryAsync("SELECT id,code,customer_snapshot->>'name' AS customer_name,status,subtotal+shipping AS total,created_at FROM orders WHERE @manager OR owner_id=@uid ORDER BY created_at DESC LIMIT 6", param);
            var trend = await c.QueryAsync("SELECT to_char(d,'DD/MM') AS day,COALESCE(sum(o.subtotal+o.shipping),0) AS revenue FROM generate_series((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-6,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,interval '1 day') d LEFT JOIN orders o ON (o.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=d::date AND o.status='completed' AND (@manager OR o.owner_id=@uid) GROUP BY d ORDER BY d", param);
            return Results.Ok(new { stats, commissions, recent, trend });
        });
        app.MapGet("/api/commissions", async (HttpContext ctx, Db db) => { await using var c = await db.Open(); return await c.QueryAsync("SELECT cm.*,o.code AS order_code,u.name AS ctv_name FROM commissions cm JOIN orders o ON o.id=cm.order_id JOIN users u ON u.id=cm.user_id WHERE @manager OR cm.user_id=@uid ORDER BY cm.created_at DESC LIMIT 500", new { manager = ctx.User().Manager, uid = ctx.User().Id }); });
        app.MapPost("/api/commissions/{id:guid}/status", async (Guid id, CommissionRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            // Always lock order before commission; same ordering as payment/status actions.
            var order = await c.QuerySingleOrDefaultAsync("SELECT o.* FROM orders o JOIN commissions cm ON cm.order_id=o.id WHERE cm.id=@id FOR UPDATE OF o", new { id }, tx); Check.That(order is not null, "Không tìm thấy hoa hồng.", 404);
            var cm = await c.QuerySingleAsync("SELECT * FROM commissions WHERE id=@id FOR UPDATE", new { id }, tx);
            Check.That((int)cm.version == r.Version, "Hoa hồng đã thay đổi. Vui lòng tải lại.", 409);
            Check.That((string)order!.status == "completed" && (decimal)order.paid == (decimal)order.subtotal + (decimal)order.shipping, "Đơn cần hoàn tất và thu đủ tiền.");
            Check.That(((string)cm.status == "pending" && r.Status == "approved") || ((string)cm.status == "approved" && r.Status == "paid"), "Trạng thái hoa hồng không hợp lệ.");
            if (r.Status == "paid") Check.Text(r.Reference, 300, true);
            await c.ExecuteAsync("UPDATE commissions SET status=@Status,approved_by=CASE WHEN @Status='approved' THEN @uid ELSE approved_by END,payment_reference=CASE WHEN @Status='paid' THEN @Reference ELSE payment_reference END,paid_at=CASE WHEN @Status='paid' THEN now() ELSE paid_at END,version=version+1 WHERE id=@id", new { id, r.Status, Reference = r.Reference ?? "", uid = ctx.User().Id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "commission_" + r.Status, id, new { r.Reference }); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapGet("/api/settings", async (Db db) => { await using var c = await db.Open(); return Results.Content((await c.ExecuteScalarAsync<string>("SELECT value::text FROM settings WHERE key='business'"))!, "application/json"); });
        app.MapPut("/api/settings", async (BusinessRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 180, true); Check.Text(r.Tagline, 200); Check.Text(r.Phone, 40); Check.Text(r.Email, 200); Check.Text(r.Address, 1000); Check.Text(r.TaxCode, 50); Check.Text(r.Bank, 1000); Check.Text(r.QuoteTerms, 5000);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); await c.ExecuteAsync("UPDATE settings SET value=CAST(@value AS jsonb) WHERE key='business'", new { value = JsonSerializer.Serialize(r, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) }, tx); await db.Audit(c, tx, ctx.User().Id, "business_updated"); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapGet("/api/admin/users", async (HttpContext ctx, Db db) => { ctx.Manager(); await using var c = await db.Open(); return await c.QueryAsync("SELECT u.id,u.email,u.name,u.role,u.active,u.must_change_password,u.created_at,(SELECT count(*) FROM orders o WHERE o.owner_id=u.id) AS orders_count FROM users u ORDER BY role DESC,created_at"); });
        app.MapPost("/api/admin/users", async (CreateUserRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 120, true); var email = Check.Text(r.Email, 200, true).ToLowerInvariant(); Check.That(email.Contains('@'), "Email không hợp lệ."); Check.That(new[] { "manager", "ctv" }.Contains(r.Role), "Vai trò không hợp lệ."); Auth.Validate(r.Password);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352020)", transaction: tx);
            var count = await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE role=@Role", new { r.Role }, tx); Check.That(count < (r.Role == "manager" ? 2 : 5), "AMORA Mini giới hạn 2 quản lý và 5 CTV. Hãy sửa tài khoản đã có hoặc nâng giới hạn trong mã nguồn.");
            var id = Guid.NewGuid(); await c.ExecuteAsync("INSERT INTO users(id,email,name,password_hash,role) VALUES(@id,@email,@Name,@hash,@Role)", new { id, email, r.Name, hash = Auth.Hash(r.Password), r.Role }, tx); await db.Audit(c, tx, ctx.User().Id, "user_created", id, new { r.Role }); await tx.CommitAsync(); return Results.Ok(new { id });
        });
        app.MapPut("/api/admin/users/{id:guid}", async (Guid id, UpdateUserRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 120, true); var email = Check.Text(r.Email, 200, true).ToLowerInvariant(); Check.That(email.Contains('@'), "Email không hợp lệ."); Check.That(id != ctx.User().Id || r.Active, "Không thể tự khóa tài khoản.");
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            Check.That(await c.ExecuteAsync("UPDATE users SET name=@Name,email=@email,active=@Active WHERE id=@id", new { id, r.Name, email, r.Active }, tx) == 1, "Không tìm thấy tài khoản.", 404);
            if (!r.Active) await c.ExecuteAsync("DELETE FROM sessions WHERE user_id=@id", new { id }, tx); await db.Audit(c, tx, ctx.User().Id, "user_updated", id, new { r.Active }); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapPost("/api/admin/users/{id:guid}/reset-password", async (Guid id, ResetPasswordRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.That(id != ctx.User().Id, "Hãy dùng chức năng đổi mật khẩu cho tài khoản của bạn."); Auth.Validate(r.Password); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            Check.That(await c.ExecuteAsync("UPDATE users SET password_hash=@hash,must_change_password=true,failed_attempts=0,locked_until=NULL WHERE id=@id", new { id, hash = Auth.Hash(r.Password) }, tx) == 1, "Không tìm thấy tài khoản.", 404); await c.ExecuteAsync("DELETE FROM sessions WHERE user_id=@id", new { id }, tx); await db.Audit(c, tx, ctx.User().Id, "password_reset", id); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapGet("/api/admin/audit", async (HttpContext ctx, Db db) => { ctx.Manager(); await using var c = await db.Open(); return await c.QueryAsync("SELECT a.id,a.action,a.entity_id,a.detail,a.created_at,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200"); });
        app.MapGet("/api/admin/backup", async (HttpContext ctx, Db db) =>
        {
            ctx.Manager(); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(IsolationLevel.RepeatableRead);
            await db.Audit(c, tx, ctx.User().Id, "backup_exported");
            string[] tables = ["users", "scents", "products", "product_images", "prices", "customers", "orders", "order_lines", "quotes", "quote_lines", "commissions", "audit_logs", "settings", "order_events"];
            var data = new Dictionary<string, JsonElement>(); foreach (var t in tables) { var raw = await c.ExecuteScalarAsync<string>($"SELECT COALESCE(json_agg(t),'[]'::json)::text FROM {t} t", transaction: tx); data[t] = JsonSerializer.Deserialize<JsonElement>(raw!); }
            var bytes = JsonSerializer.SerializeToUtf8Bytes(new { format = "amora-mini-backup-v1", createdAt = DateTime.UtcNow, schema = "001_initial.sql", tables = data }); await tx.CommitAsync();
            return Results.File(bytes, "application/json", $"amora-backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json");
        });
    }
}
public record CommissionRequest(string Status, int Version, string? Reference);
public record BusinessRequest(string Name, string Tagline, string Phone, string Email, string Address, string TaxCode, string Bank, string QuoteTerms, bool CtvQuotes);
public record CreateUserRequest(string Email, string Name, string Role, string Password);
public record UpdateUserRequest(string Email, string Name, bool Active);
public record ResetPasswordRequest(string Password);
