using Npgsql;
namespace Amora;

public static class Deployment
{
    public static string[] Validate(IConfiguration config, bool production)
    {
        var connection = config["ConnectionStrings:Default"];
        Check.That(!string.IsNullOrWhiteSpace(connection), "Thiếu ConnectionStrings__Default.", 503);
        var db = new NpgsqlConnectionStringBuilder(connection!);
        if (production)
        {
            Check.That(db.SslMode == SslMode.VerifyFull, "Production cần SSL Mode=VerifyFull cho database.", 503);
            var migrations = config["ConnectionStrings:Migrations"];
            Check.That(!string.IsNullOrWhiteSpace(migrations), "Thiếu ConnectionStrings__Migrations (Neon direct endpoint).", 503);
            var direct = new NpgsqlConnectionStringBuilder(migrations!);
            Check.That(direct.SslMode == SslMode.VerifyFull && !string.IsNullOrEmpty(direct.Host) && !direct.Host.Contains("-pooler", StringComparison.OrdinalIgnoreCase), "Migrations cần direct endpoint và SSL Mode=VerifyFull.", 503);
            Check.That(direct.Database == db.Database, "Ứng dụng và migrations phải trỏ cùng database.", 503);
            if ((db.Host ?? "").EndsWith(".neon.tech", StringComparison.OrdinalIgnoreCase))
                Check.That(string.Equals((db.Host ?? "").Replace("-pooler.", ".", StringComparison.OrdinalIgnoreCase), direct.Host, StringComparison.OrdinalIgnoreCase), "Hai chuỗi Neon phải thuộc cùng endpoint/branch; chỉ khác phần -pooler.", 503);
        }
        var originValue = config["AllowedOrigins"] ?? (production ? "" : "http://localhost:5173,http://localhost:3000");
        var origins = originValue.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(value =>
        {
            Check.That(Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.AbsolutePath == "/" && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment) && string.IsNullOrEmpty(uri.UserInfo) && !value.Contains('*') && (uri.Scheme == "https" || (!production && uri.Scheme == "http")), "AllowedOrigins chỉ nhận origin HTTPS chính xác, không đường dẫn hoặc ký tự *.", 503);
            return new Uri(value).GetLeftPart(UriPartial.Authority);
        }).Distinct().ToArray();
        Check.That(origins.Length > 0, "Production cần AllowedOrigins của Cloudflare Pages.", 503);
        var keys = new[] { "R2:Endpoint", "R2:Bucket", "R2:AccessKeyId", "R2:SecretAccessKey" };
        var configured = keys.Count(k => !string.IsNullOrWhiteSpace(config[k]));
        Check.That((!production && configured == 0) || configured == keys.Length, "Cần cấu hình đủ bốn biến R2 trước khi dùng kho ảnh.", 503);
        if (configured > 0)
        {
            Check.That(Uri.TryCreate(config["R2:Endpoint"], UriKind.Absolute, out var endpoint) && endpoint.Scheme == "https" && endpoint.AbsolutePath == "/" && string.IsNullOrEmpty(endpoint.Query) && string.IsNullOrEmpty(endpoint.Fragment) && string.IsNullOrEmpty(endpoint.UserInfo) && endpoint.IsDefaultPort, "R2 Endpoint phải là HTTPS origin, không gồm tên bucket hoặc đường dẫn.", 503);
        }
        return origins;
    }

    public static NpgsqlDataSource Source(IConfiguration config)
    {
        var cs = new NpgsqlConnectionStringBuilder(config["ConnectionStrings:Default"]!);
        if (!cs.ContainsKey("Maximum Pool Size")) cs.MaxPoolSize = 5;
        cs.MinPoolSize = 0;
        cs.ConnectionIdleLifetime = 60;
        cs.ConnectionPruningInterval = 10;
        cs.KeepAlive = 0;
        cs.ApplicationName = "AMORA-Mini";
        return NpgsqlDataSource.Create(cs.ConnectionString);
    }
}
