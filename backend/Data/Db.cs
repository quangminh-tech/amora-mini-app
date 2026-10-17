using System.Text.Json;
using Dapper;
using Npgsql;
namespace Amora;

public sealed class Db(NpgsqlDataSource source, IConfiguration config)
{
    public async Task<NpgsqlConnection> Open() => await source.OpenConnectionAsync();
    public async Task Audit(NpgsqlConnection c, NpgsqlTransaction? tx, Guid? actor, string action, Guid? entity = null, object? detail = null) =>
        await c.ExecuteAsync("INSERT INTO audit_logs(id,user_id,action,entity_id,detail) VALUES(@id,@actor,@action,@entity,CAST(@detail AS jsonb))", new { id = Guid.NewGuid(), actor, action, entity, detail = JsonSerializer.Serialize(detail ?? new { }) }, tx);
    public async Task Migrate()
    {
        var migrationConnection = config["ConnectionStrings:Migrations"] ?? config["ConnectionStrings:Default"]!;
        var cs = new NpgsqlConnectionStringBuilder(migrationConnection) { Pooling = false };
        await using var c = new NpgsqlConnection(cs.ConnectionString);
        await c.OpenAsync();
        await using var tx = await c.BeginTransactionAsync();
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352019)", transaction: tx);
        await c.ExecuteAsync("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())", transaction: tx);
        await c.ExecuteAsync("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text",transaction:tx);
        foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Migrations"), "*.sql").Order())
        {
            var name = Path.GetFileName(file);
            var checksum=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(await File.ReadAllBytesAsync(file)));
            if (await c.ExecuteScalarAsync<int>("SELECT count(*) FROM schema_migrations WHERE name=@name", new { name }, tx) > 0) {
                var applied=await c.ExecuteScalarAsync<string>("SELECT checksum FROM schema_migrations WHERE name=@name",new {name},tx);
                Check.That(applied is null || applied==checksum,$"Migration {name} đã thay đổi sau khi áp dụng; cần tạo migration mới.",503);
                if(applied is null)await c.ExecuteAsync("UPDATE schema_migrations SET checksum=@checksum WHERE name=@name",new {name,checksum},tx);
                continue;
            }
            await c.ExecuteAsync(await File.ReadAllTextAsync(file), transaction: tx);
            await c.ExecuteAsync("INSERT INTO schema_migrations(name,checksum) VALUES(@name,@checksum)", new { name, checksum }, tx);
        }
        await tx.CommitAsync();
    }
}
public sealed class AppError(int status, string message) : Exception(message) { public int Status { get; } = status; }
public static class Check
{
    public static DateOnly Day(object value)=>value is DateOnly d?d:DateOnly.FromDateTime((DateTime)value);
    public static void That(bool condition, string message, int status = 400) { if (!condition) throw new AppError(status, message); }
    public static string Text(string? value, int max, bool required = false)
    { var s = (value ?? "").Trim(); That(s.Length <= max && (!required || s.Length > 0), $"Nội dung phải {(required ? "có dữ liệu và " : "")}không quá {max} ký tự."); return s; }
}
