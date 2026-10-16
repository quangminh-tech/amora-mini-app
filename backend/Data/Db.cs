using System.Text.Json;
using Dapper;
using Npgsql;
namespace Amora;

public sealed class Db(NpgsqlDataSource source)
{
    public async Task<NpgsqlConnection> Open() => await source.OpenConnectionAsync();
    public async Task Audit(NpgsqlConnection c, NpgsqlTransaction? tx, Guid? actor, string action, Guid? entity = null, object? detail = null) =>
        await c.ExecuteAsync("INSERT INTO audit_logs(id,user_id,action,entity_id,detail) VALUES(@id,@actor,@action,@entity,CAST(@detail AS jsonb))", new { id = Guid.NewGuid(), actor, action, entity, detail = JsonSerializer.Serialize(detail ?? new { }) }, tx);
    public async Task Migrate()
    {
        await using var c = await Open();
        await using var tx = await c.BeginTransactionAsync();
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352019)", transaction: tx);
        await c.ExecuteAsync("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())", transaction: tx);
        foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Migrations"), "*.sql").Order())
        {
            var name = Path.GetFileName(file);
            if (await c.ExecuteScalarAsync<int>("SELECT count(*) FROM schema_migrations WHERE name=@name", new { name }, tx) > 0) continue;
            await c.ExecuteAsync(await File.ReadAllTextAsync(file), transaction: tx);
            await c.ExecuteAsync("INSERT INTO schema_migrations(name) VALUES(@name)", new { name }, tx);
        }
        await tx.CommitAsync();
    }
}
public sealed class AppError(int status, string message) : Exception(message) { public int Status { get; } = status; }
public static class Check
{
    public static void That(bool condition, string message, int status = 400) { if (!condition) throw new AppError(status, message); }
    public static string Text(string? value, int max, bool required = false)
    { var s = (value ?? "").Trim(); That(s.Length <= max && (!required || s.Length > 0), $"Nội dung phải {(required ? "có dữ liệu và " : "")}không quá {max} ký tự."); return s; }
}
