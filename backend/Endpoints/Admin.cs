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
            var stats = await c.QuerySingleAsync("SELECT count(*) AS orders_month,(SELECT COALESCE(sum(subtotal+shipping),0) FROM orders WHERE (@manager OR owner_id=@uid) AND status='completed' AND completed_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS revenue,(SELECT COALESCE(sum(p.amount),0) FROM payments p JOIN orders o ON o.id=p.order_id WHERE (@manager OR o.owner_id=@uid) AND NOT p.opening_balance AND p.occurred_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS collected, count(*) FILTER(WHERE status='pending') AS pending FROM orders WHERE (@manager OR owner_id=@uid) AND created_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'", param);
            var commissions = await c.QuerySingleAsync("SELECT COALESCE(sum(amount) FILTER(WHERE status IN ('pending','approved')),0) AS outstanding,COALESCE(sum(amount) FILTER(WHERE status='paid'),0) AS paid FROM commissions WHERE @manager OR user_id=@uid", param);
            var recent = await c.QueryAsync("SELECT id,code,customer_snapshot->>'name' AS customer_name,status,subtotal+shipping AS total,created_at FROM orders WHERE @manager OR owner_id=@uid ORDER BY created_at DESC LIMIT 6", param);
            var trend = await c.QueryAsync("SELECT to_char(d,'DD/MM') AS day,COALESCE(sum(o.subtotal+o.shipping),0) AS revenue FROM generate_series((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-6,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,interval '1 day') d LEFT JOIN orders o ON (o.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=d::date AND o.status='completed' AND (@manager OR o.owner_id=@uid) GROUP BY d ORDER BY d", param);
            var quotes=await c.QuerySingleAsync("SELECT count(*) AS total,count(*) FILTER(WHERE status='draft') AS drafts,count(*) FILTER(WHERE status='sent') AS sent,count(*) FILTER(WHERE status='accepted') AS accepted,count(*) FILTER(WHERE status='sent' AND valid_until<(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS expired FROM quotes WHERE @manager OR owner_id=@uid",param);
            var team=await c.QuerySingleAsync("SELECT count(*) FILTER(WHERE role='ctv' AND active) AS active_ctvs,count(*) FILTER(WHERE role='ctv' AND NOT active) AS inactive_ctvs FROM users");
            var work=await c.QuerySingleAsync("SELECT count(*) FILTER(WHERE status='pending') AS pending,count(*) FILTER(WHERE status IN ('confirmed','shipping')) AS processing FROM orders WHERE @manager OR owner_id=@uid",param);
            return Results.Ok(new { stats, commissions, recent, trend, quotes, team=ctx.User().Manager ? team : null, work });
        });
        app.MapGet("/api/commissions", async (HttpContext ctx, Db db) => await Listing.Page(ctx,db,"cm.*,o.code AS order_code,u.name AS ctv_name", "FROM commissions cm JOIN orders o ON o.id=cm.order_id JOIN users u ON u.id=cm.user_id", "(@manager OR cm.user_id=@uid) AND (@owner IS NULL OR cm.user_id=@owner) AND (@status='' OR cm.status=@status) AND (o.code ILIKE @search OR u.name ILIKE @search)", "cm.created_at DESC,cm.id DESC"));
        app.MapGet("/api/commissions/summary",async(HttpContext ctx,Db db)=>{await using var c=await db.Open();return await c.QuerySingleAsync("SELECT COALESCE(sum(amount) FILTER(WHERE status='pending'),0) AS pending,COALESCE(sum(amount) FILTER(WHERE status='approved'),0) AS approved,COALESCE(sum(amount) FILTER(WHERE status='paid'),0) AS paid FROM commissions WHERE @manager OR user_id=@uid",new {manager=ctx.User().Manager,uid=ctx.User().Id});});
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
        app.MapGet("/api/settings", async (Db db) => { await using var c = await db.Open(); return Results.Content((await c.ExecuteScalarAsync<string>("SELECT (value || jsonb_build_object('version',version))::text FROM settings WHERE key='business'"))!, "application/json"); });
        app.MapPut("/api/settings", async (BusinessRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 180, true); Check.Text(r.Tagline, 200); Check.Text(r.Phone, 40); Check.Text(r.Email, 200); Check.Text(r.Address, 1000); Check.Text(r.TaxCode, 50); Check.Text(r.Bank, 1000); Check.Text(r.QuoteTerms, 5000);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); Check.That(await c.ExecuteAsync("UPDATE settings SET value=CAST(@value AS jsonb)-'version',version=version+1 WHERE key='business' AND version=@Version", new { r.Version,value = JsonSerializer.Serialize(r, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) }, tx)==1,"Thiết lập đã thay đổi. Hãy tải lại.",409); await db.Audit(c, tx, ctx.User().Id, "business_updated"); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapGet("/api/admin/users", async (HttpContext ctx, Db db) => {
            ctx.Manager(); return await Listing.Page(ctx, db, "u.id,u.email,u.name,u.role,u.active,u.version,u.must_change_password,u.created_at,(SELECT count(*) FROM orders o WHERE o.owner_id=u.id) AS orders_count,(SELECT count(*) FROM quotes q WHERE q.owner_id=u.id) AS quotes_count,(SELECT COALESCE(sum(o.subtotal),0) FROM orders o WHERE o.owner_id=u.id AND o.status='completed') AS revenue,(SELECT COALESCE(sum(cm.amount),0) FROM commissions cm WHERE cm.user_id=u.id AND cm.status IN ('pending','approved')) AS outstanding",
            "FROM users u", "(u.name ILIKE @search OR u.email ILIKE @search) AND (@status='' OR (@status='active' AND u.active) OR (@status='inactive' AND NOT u.active)) AND (@role='' OR u.role=@role)", "u.created_at DESC,u.id DESC",new {role=Check.Text(ctx.Request.Query["role"],16)});
        });
        app.MapGet("/api/admin/account-limits",async(HttpContext ctx,Db db)=>{
            ctx.Manager();await using var c=await db.Open();return await c.QuerySingleAsync("SELECT value->>'managers' AS managers,value->>'ctvs' AS ctvs,version,(SELECT count(*) FROM users WHERE role='manager' AND active) AS active_managers,(SELECT count(*) FROM users WHERE role='ctv' AND active) AS active_ctvs FROM settings WHERE key='account_limits'");
        });
        app.MapPut("/api/admin/account-limits",async(LimitsRequest r,HttpContext ctx,Db db)=>{
            ctx.Manager();Check.That(r.Managers is >=1 and <=1000 && r.Ctvs is >=1 and <=10000,"Giới hạn quản lý 1–1.000; CTV 1–10.000.");
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352020)",transaction:tx);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE active AND role='manager'",transaction:tx)<=r.Managers && await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE active AND role='ctv'",transaction:tx)<=r.Ctvs,"Giới hạn không được thấp hơn số tài khoản đang hoạt động.");
            Check.That(await c.ExecuteAsync("UPDATE settings SET value=CAST(@v AS jsonb),version=version+1 WHERE key='account_limits' AND version=@Version",new {v=JsonSerializer.Serialize(new {managers=r.Managers,ctvs=r.Ctvs}),r.Version},tx)==1,"Giới hạn đã thay đổi. Hãy tải lại.",409);
            await db.Audit(c,tx,ctx.User().Id,"account_limits_updated",detail:r);await tx.CommitAsync();return Results.NoContent();
        });
        app.MapPost("/api/admin/users", async (CreateUserRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 120, true); var email = Check.Text(r.Email, 200, true).ToLowerInvariant(); Check.That(email.Contains('@'), "Email không hợp lệ."); Check.That(new[] { "manager", "ctv" }.Contains(r.Role), "Vai trò không hợp lệ."); Auth.Validate(r.Password);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352020)", transaction: tx);
            await CheckLimit(c,tx,r.Role);
            var id = Guid.NewGuid(); await c.ExecuteAsync("INSERT INTO users(id,email,name,password_hash,role) VALUES(@id,@email,@Name,@hash,@Role)", new { id, email, r.Name, hash = Auth.Hash(r.Password), r.Role }, tx); await db.Audit(c, tx, ctx.User().Id, "user_created", id, new { r.Role }); await tx.CommitAsync(); return Results.Ok(new { id });
        });
        app.MapPut("/api/admin/users/{id:guid}", async (Guid id, UpdateUserRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.Text(r.Name, 120, true); var email = Check.Text(r.Email, 200, true).ToLowerInvariant(); Check.That(email.Contains('@'), "Email không hợp lệ."); Check.That(id != ctx.User().Id || r.Active, "Không thể tự khóa tài khoản.");
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352020)",transaction:tx);
            var old=await c.QuerySingleOrDefaultAsync("SELECT role,active,version FROM users WHERE id=@id FOR UPDATE",new {id},tx);
            Check.That(old is not null,"Không tìm thấy tài khoản.",404);
            Check.That((int)old!.version==r.Version,"Tài khoản đã thay đổi. Hãy tải lại.",409);
            if(!r.Active && (bool)old.active && (string)old.role=="manager") Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE role='manager' AND active",transaction:tx)>1,"Phải giữ ít nhất một quản lý đang hoạt động.");
            if(r.Active && !(bool)old.active) await CheckLimit(c,tx,(string)old.role);
            Check.That(await c.ExecuteAsync("UPDATE users SET name=@Name,email=@email,active=@Active,version=version+1 WHERE id=@id", new { id, Name=r.Name.Trim(), email, r.Active }, tx) == 1, "Không tìm thấy tài khoản.", 404);
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
            string[] tables = ["users", "scents", "product_categories", "customer_groups", "product_models", "products", "product_images", "prices", "customers", "quotes", "quote_lines", "orders", "order_lines", "commissions", "audit_logs", "settings", "order_events", "payments", "import_batches"];
            var data = new Dictionary<string, JsonElement>(); foreach (var t in tables) { var raw = await c.ExecuteScalarAsync<string>($"SELECT COALESCE(json_agg(t),'[]'::json)::text FROM {t} t", transaction: tx); data[t] = JsonSerializer.Deserialize<JsonElement>(raw!); }
            var bytes = JsonSerializer.SerializeToUtf8Bytes(new { format = "amora-mini-backup-v1", createdAt = DateTime.UtcNow, schema = "003_catalogue_workspace.sql", tables = data }); await tx.CommitAsync();
            return Results.File(bytes, "application/json", $"amora-backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json");
        });
    }
    static async Task CheckLimit(Npgsql.NpgsqlConnection c,Npgsql.NpgsqlTransaction tx,string role) {
        var count=await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE role=@role AND active",new {role},tx);
        var limit=await c.ExecuteScalarAsync<int>("SELECT (value->>@key)::int FROM settings WHERE key='account_limits'",new {key=role=="manager" ? "managers":"ctvs"},tx);
        Check.That(count<limit,"Đã đạt giới hạn tài khoản đang hoạt động. Quản lý có thể điều chỉnh tại mục Cộng tác viên.");
    }
}
public record LimitsRequest(int Managers,int Ctvs,int Version);
public record CommissionRequest(string Status, int Version, string? Reference);
public record BusinessRequest(string Name, string Tagline, string Phone, string Email, string Address, string TaxCode, string Bank, string QuoteTerms, bool CtvQuotes, int Version = 0);
public record CreateUserRequest(string Email, string Name, string Role, string Password);
public record UpdateUserRequest(string Email, string Name, bool Active, int Version = 0);
public record ResetPasswordRequest(string Password);
