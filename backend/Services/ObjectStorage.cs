using System.Security.Cryptography;
using System.Text;
using System.Globalization;
namespace Amora;
// Private R2 bucket, AWS Signature V4 (no public customer/file URLs).
public sealed class ObjectStorage(IConfiguration config, IHttpClientFactory factory, IHostEnvironment env)
{
    public async Task Put(string key, byte[] bytes, string contentType)
    {
        if (Local) { await File.WriteAllBytesAsync(LocalPath(key), bytes); return; }
        using var response = await Send(HttpMethod.Put, key, bytes, contentType); Ensure(response);
    }
    public async Task<byte[]> Get(string key)
    {
        if (Local) return await File.ReadAllBytesAsync(LocalPath(key));
        using var response = await Send(HttpMethod.Get, key, [], null); Ensure(response); return await response.Content.ReadAsByteArrayAsync();
    }
    public async Task Delete(string key)
    {
        if (Local) { File.Delete(LocalPath(key)); return; }
        using var response = await Send(HttpMethod.Delete, key, [], null); Ensure(response);
    }
    private bool Local
    {
        get { var local = string.IsNullOrWhiteSpace(config["R2:Endpoint"]); if (local && !env.IsDevelopment()) throw new AppError(503, "Chưa cấu hình kho ảnh R2."); return local; }
    }
    private string LocalPath(string key)
    {
        Check.That(!key.Contains("..") && !key.Contains('/') && !key.Contains('\\'), "Khóa ảnh không hợp lệ.");
        var dir = config["Storage:LocalDirectory"] ?? "uploads"; Directory.CreateDirectory(dir); return Path.Combine(dir, key);
    }
    private async Task<HttpResponseMessage> Send(HttpMethod method, string key, byte[] bytes, string? contentType)
    {
        var endpoint = new Uri(config["R2:Endpoint"] ?? throw new AppError(503, "Thiếu R2 Endpoint."));
        Check.That(endpoint.Scheme == "https", "R2 bắt buộc HTTPS.", 503);
        var bucket = config["R2:Bucket"] ?? throw new AppError(503, "Thiếu R2 bucket.");
        var access = config["R2:AccessKeyId"] ?? throw new AppError(503, "Thiếu R2 key.");
        var secret = config["R2:SecretAccessKey"] ?? throw new AppError(503, "Thiếu R2 secret.");
        var now = DateTime.UtcNow; var stamp = now.ToString("yyyyMMddTHHmmssZ", CultureInfo.InvariantCulture); var date = now.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var path = $"/{Uri.EscapeDataString(bucket)}/{Uri.EscapeDataString(key)}";
        var hash = Hex(SHA256.HashData(bytes)); var scope = $"{date}/auto/s3/aws4_request";
        var headers = $"host:{endpoint.Host}\nx-amz-content-sha256:{hash}\nx-amz-date:{stamp}\n";
        const string signed = "host;x-amz-content-sha256;x-amz-date";
        var canonical = $"{method.Method}\n{path}\n\n{headers}\n{signed}\n{hash}";
        var toSign = $"AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{Hex(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)))}";
        var signing = Hmac(Hmac(Hmac(Hmac(Encoding.UTF8.GetBytes("AWS4" + secret), date), "auto"), "s3"), "aws4_request");
        var req = new HttpRequestMessage(method, new Uri(endpoint.GetLeftPart(UriPartial.Authority) + path));
        req.Headers.TryAddWithoutValidation("x-amz-date", stamp); req.Headers.TryAddWithoutValidation("x-amz-content-sha256", hash);
        req.Headers.TryAddWithoutValidation("Authorization", $"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={Hex(Hmac(signing, toSign))}");
        if (method == HttpMethod.Put) { req.Content = new ByteArrayContent(bytes); req.Content.Headers.ContentType = new(contentType!); }
        try { return await factory.CreateClient().SendAsync(req); }
        catch (HttpRequestException) { throw new AppError(503, "Kho ảnh chưa kết nối được. Vui lòng thử lại hoặc kiểm tra cấu hình dịch vụ."); }
        catch (TaskCanceledException) { throw new AppError(503, "Kho ảnh phản hồi quá chậm. Vui lòng thử lại."); }
        finally { req.Dispose(); }
    }
    public async Task Probe()
    {
        var key = $"connection-check-{Guid.NewGuid():N}.png";
        byte[] payload = [137, 80, 78, 71, 13, 10, 26, 10];
        var created = false;
        try
        {
            await Put(key, payload, "image/png"); created = true;
            Check.That((await Get(key)).SequenceEqual(payload), "Kho ảnh chưa đọc lại đúng dữ liệu.", 503);
        }
        finally { if (created) await Delete(key); }
    }
    private static void Ensure(HttpResponseMessage response)
    {
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) throw new AppError(404, "Không tìm thấy ảnh trong kho lưu trữ.");
        if (!response.IsSuccessStatusCode) throw new AppError(503, "Chưa kết nối được kho ảnh. Quản lý cần kiểm tra cấu hình và quyền truy cập.");
    }
    private static byte[] Hmac(byte[] key, string value) => HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(value));
    private static string Hex(byte[] bytes) => Convert.ToHexString(bytes).ToLowerInvariant();
}
