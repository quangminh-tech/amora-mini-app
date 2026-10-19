using System.Threading.RateLimiting;
using System.Text.Json;
using Amora;
using Dapper;
using Npgsql;
var builder = WebApplication.CreateBuilder(args);
var origins = Deployment.Validate(builder.Configuration, builder.Environment.IsProduction());
var port = builder.Configuration["PORT"];
if (port is not null)
{
    Check.That(int.TryParse(port, out var number) && number is > 0 and <= 65535, "PORT không hợp lệ.", 503);
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}
builder.Services.AddSingleton(Deployment.Source(builder.Configuration));
builder.Services.AddSingleton<Db>(); builder.Services.AddSingleton<ObjectStorage>(); builder.Services.AddHttpClient().ConfigureHttpClientDefaults(b => b.ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(30)));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 6 * 1024 * 1024);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    // One small instance: global and per-account quotas, no dependency on spoofable forwarding headers.
    o.AddPolicy("login", _ => RateLimitPartition.GetFixedWindowLimiter("login", _ => new() { PermitLimit = 40, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Items["actor"] is Actor a ? a.Id.ToString() : "anonymous", _ => new() { PermitLimit = 300, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Cache-Control"] = "no-store";
    try { await next(); }
    catch (AppError e) { if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = e.Status; await ctx.Response.WriteAsJsonAsync(new { message = e.Message }); } }
    catch (PostgresException e) when (e.SqlState == "23505") { ctx.Response.StatusCode = 409; await ctx.Response.WriteAsJsonAsync(new { message = "Dữ liệu đã tồn tại. Vui lòng tải lại và kiểm tra." }); }
    catch (PostgresException e) when (e.SqlState is "23503" or "23514" or "22001" or "22003") { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "Dữ liệu không đáp ứng ràng buộc lưu trữ. Hãy kiểm tra số tiền và thông tin liên kết." }); }
    catch (NpgsqlException e) when (e.IsTransient) { app.Logger.LogWarning("Database tạm thời không khả dụng."); if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = 503; await ctx.Response.WriteAsJsonAsync(new { message = "Dữ liệu đang kết nối lại. Vui lòng thử lại sau." }); } }
    catch (BadHttpRequestException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "Dữ liệu gửi lên không hợp lệ hoặc quá lớn." }); }
    catch (Exception e) { app.Logger.LogError(e, "Request failed: {Path}", ctx.Request.Path); if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { message = "Không thể xử lý yêu cầu. Vui lòng thử lại." }); } }
});
app.UseCors();
// Bound invalid token lookups before touching Neon. No trust in client-supplied IP headers.
using var lookupLimit = PartitionedRateLimiter.Create<HttpContext, string>(_ =>
    RateLimitPartition.GetFixedWindowLimiter("lookup", _ => new() { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Method != "OPTIONS")
    {
        using var lease = await lookupLimit.AcquireAsync(ctx, 1, ctx.RequestAborted);
        if (!lease.IsAcquired) { ctx.Response.StatusCode = 429; ctx.Response.Headers.RetryAfter = "60"; await ctx.Response.WriteAsJsonAsync(new { message = "Có nhiều yêu cầu cùng lúc. Vui lòng thử lại sau một phút." }); return; }
    }
    await next();
});
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (ctx.Request.Method == "OPTIONS" || path == "/health" || path == "/api/auth/login") { await next(); return; }
    if (!path.StartsWith("/api/")) { ctx.Response.StatusCode = 404; return; }
    var header = ctx.Request.Headers.Authorization.ToString(); Check.That(header.StartsWith("Bearer ") && header.Length < 300, "Vui lòng đăng nhập.", 401);
    Actor? a;
    await using (var c = await app.Services.GetRequiredService<Db>().Open())
        a = await c.QuerySingleOrDefaultAsync<Actor>("SELECT u.id,u.name,u.email,u.role,u.must_change_password AS MustChangePassword FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=@hash AND s.expires_at>now() AND u.active", new { hash = Auth.TokenHash(header[7..]) });
    Check.That(a is not null, "Phiên đăng nhập đã hết hạn.", 401); ctx.Items["actor"] = a;
    Check.That(!a!.MustChangePassword || path is "/api/auth/me" or "/api/auth/password" or "/api/auth/logout", "Bạn cần đổi mật khẩu trước khi sử dụng.", 428);
    await next();
});
app.UseRateLimiter();
// Liveness must not continuously wake Neon; startup completes DB migration before listening.
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "amora-mini", version = "3.3.0" }));
app.MapGet("/api/admin/readiness", async (HttpContext ctx, Db db) =>
{
    ctx.Manager(); await using var c = await db.Open();
    await c.ExecuteScalarAsync<int>("SELECT 1");
    return Results.Ok(new { database = "ok", checkedAt = DateTime.UtcNow });
});
app.MapPost("/api/admin/storage-check", async (HttpContext ctx, ObjectStorage storage, Db db) =>
{
    ctx.Manager(); await storage.Probe();
    await using var c = await db.Open(); await db.Audit(c, null, ctx.User().Id, "storage_checked");
    return Results.Ok(new { storage = "ok", checkedAt = DateTime.UtcNow });
});
app.MapOverview(); app.MapAuth(); app.MapDirectories(); app.MapTransfers(); app.MapCatalogue();
app.MapPricing(); app.MapDocuments(); app.MapCustomers(); app.MapSales(); app.MapConversion(); app.MapAdmin();
for (var attempt = 1; ; attempt++)
{
    try
    {
        await app.Services.GetRequiredService<Db>().Migrate();
        await Seed.Run(app.Services.GetRequiredService<Db>(), app.Configuration);
        break;
    }
    catch (NpgsqlException e) when (e.IsTransient && attempt < 3)
    {
        app.Logger.LogWarning("Database chưa sẵn sàng, thử kết nối startup lần {Attempt}/3.", attempt + 1);
        await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
    }
}
await app.RunAsync();
public partial class Program;
