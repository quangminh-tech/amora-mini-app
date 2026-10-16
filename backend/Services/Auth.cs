using System.Security.Cryptography;
using System.Text;
using Dapper;
namespace Amora;

public record Actor(Guid Id, string Name, string Email, string Role, bool MustChangePassword) { public bool Manager => Role == "manager"; }
public static class Auth
{
    public static string Hash(string password)
    {
        Validate(password); var salt = RandomNumberGenerator.GetBytes(16);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA256, 32);
        return $"210000.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }
    public static void Validate(string password) => Check.That(password.Length is >= 12 and <= 200, "Mật khẩu cần từ 12 đến 200 ký tự.");
    public static bool Verify(string password, string hash)
    {
        try { var p = hash.Split('.'); var key = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(p[1]), int.Parse(p[0]), HashAlgorithmName.SHA256, 32); return CryptographicOperations.FixedTimeEquals(key, Convert.FromBase64String(p[2])); }
        catch (FormatException) { return false; }
    }
    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static Actor User(this HttpContext ctx) => (Actor)ctx.Items["actor"]!;
    public static void Manager(this HttpContext ctx) => Check.That(ctx.User().Manager, "Chỉ quản lý được thực hiện thao tác này.", 403);
    public static void Own(this HttpContext ctx, Guid owner) => Check.That(ctx.User().Manager || ctx.User().Id == owner, "Bạn không có quyền xem dữ liệu này.", 403);
    public static void MapAuth(this WebApplication app)
    {
        app.MapPost("/api/auth/login", async (LoginRequest r, Db db) =>
        {
            var email = Check.Text(r.Email, 200, true).ToLowerInvariant(); Check.That(r.Password.Length <= 200, "Thông tin đăng nhập không hợp lệ.", 401);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            var u = await c.QuerySingleOrDefaultAsync<UserRow>("SELECT id,name,email,role,active,must_change_password AS MustChangePassword,password_hash AS PasswordHash,failed_attempts AS FailedAttempts,locked_until AS LockedUntil FROM users WHERE email=@email FOR UPDATE", new { email }, tx);
            if (u is null) { Auth.Verify(r.Password, DummyHash); throw new AppError(401, "Email hoặc mật khẩu không đúng."); }
            Check.That(u.Active && (u.LockedUntil is null || u.LockedUntil < DateTime.UtcNow), "Tài khoản đang khóa hoặc tạm khóa. Thử lại sau 15 phút.", 401);
            if (!Verify(r.Password, u.PasswordHash))
            {
                await c.ExecuteAsync("UPDATE users SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=@id", new { u.Id }, tx); await tx.CommitAsync(); throw new AppError(401, "Email hoặc mật khẩu không đúng.");
            }
            await c.ExecuteAsync("UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=@id; DELETE FROM sessions WHERE expires_at<now()", new { u.Id }, tx);
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            await c.ExecuteAsync("INSERT INTO sessions VALUES(@id,@uid,@hash,now()+interval '8 hours')", new { id = Guid.NewGuid(), uid = u.Id, hash = TokenHash(token) }, tx);
            await db.Audit(c, tx, u.Id, "login"); await tx.CommitAsync();
            return Results.Ok(new { token, user = new Actor(u.Id, u.Name, u.Email, u.Role, u.MustChangePassword) });
        }).RequireRateLimiting("login");
        app.MapGet("/api/auth/me", (HttpContext ctx) => ctx.User());
        app.MapPost("/api/auth/logout", async (HttpContext ctx, Db db) => { await using var c = await db.Open(); await c.ExecuteAsync("DELETE FROM sessions WHERE token_hash=@hash", new { hash = TokenHash(ctx.Request.Headers.Authorization.ToString()[7..]) }); return Results.NoContent(); });
        app.MapPost("/api/auth/password", async (PasswordRequest r, HttpContext ctx, Db db) =>
        {
            Validate(r.NewPassword); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            var old = await c.ExecuteScalarAsync<string>("SELECT password_hash FROM users WHERE id=@id FOR UPDATE", new { id = ctx.User().Id }, tx);
            Check.That(Verify(r.CurrentPassword, old!), "Mật khẩu hiện tại không đúng.", 400);
            Check.That(r.NewPassword != r.CurrentPassword, "Mật khẩu mới cần khác mật khẩu hiện tại.");
            await c.ExecuteAsync("UPDATE users SET password_hash=@hash,must_change_password=false WHERE id=@id;DELETE FROM sessions WHERE user_id=@id", new { hash = Hash(r.NewPassword), id = ctx.User().Id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "password_changed"); await tx.CommitAsync(); return Results.NoContent();
        }).RequireRateLimiting("login");
    }
    private static readonly string DummyHash = Hash("dummy-password-for-timing-only");
}
public record LoginRequest(string Email, string Password);
public record PasswordRequest(string CurrentPassword, string NewPassword);
public class UserRow { public Guid Id { get; set; } public string Name { get; set; } = ""; public string Email { get; set; } = ""; public string Role { get; set; } = ""; public string PasswordHash { get; set; } = ""; public bool Active { get; set; } public bool MustChangePassword { get; set; } public int FailedAttempts { get; set; } public DateTime? LockedUntil { get; set; } }
