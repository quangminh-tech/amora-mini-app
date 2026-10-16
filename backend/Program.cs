using System.Threading.RateLimiting;
using System.Text.Json;
using Amora;
using Dapper;
using Npgsql;
var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration["ConnectionStrings:Default"] ?? throw new InvalidOperationException("Thiếu ConnectionStrings__Default.");
builder.Services.AddSingleton(NpgsqlDataSource.Create(connection));
builder.Services.AddSingleton<Db>(); builder.Services.AddSingleton<ObjectStorage>(); builder.Services.AddHttpClient();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 6 * 1024 * 1024);
var origins = (builder.Configuration["AllowedOrigins"] ?? "http://localhost:5173").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
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
    catch (BadHttpRequestException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "Dữ liệu gửi lên không hợp lệ hoặc quá lớn." }); }
    catch (Exception e) { app.Logger.LogError(e, "Request failed: {Path}", ctx.Request.Path); if (!ctx.Response.HasStarted) { ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { message = "Không thể xử lý yêu cầu. Vui lòng thử lại." }); } }
});
app.UseCors();
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
app.MapGet("/health", async (Db db) => { await using var c = await db.Open(); await c.ExecuteScalarAsync<int>("SELECT 1"); return Results.Ok(new { status = "ok" }); });
app.MapAuth(); app.MapCatalogue(); app.MapCustomers(); app.MapSales(); app.MapAdmin();
await app.Services.GetRequiredService<Db>().Migrate();
await Seed.Run(app.Services.GetRequiredService<Db>(), app.Configuration);
await app.RunAsync();
public partial class Program;
