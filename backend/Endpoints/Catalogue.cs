using Dapper;
namespace Amora;

public static class Catalogue
{
    public static void MapCatalogue(this WebApplication app)
    {
        app.MapGet("/api/scents", async (Db db) => { await using var c = await db.Open(); return await c.QueryAsync("SELECT * FROM scents ORDER BY name"); });
        app.MapGet("/api/products", async (HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open(); var manager = ctx.User().Manager;
            var products = (await c.QueryAsync("SELECT p.*,s.name AS scent_name,s.top_notes,s.middle_notes,s.base_notes,s.ritual FROM products p LEFT JOIN scents s ON s.id=p.scent_id WHERE @manager OR p.active ORDER BY p.created_at", new { manager })).ToList();
            var prices = (await c.QueryAsync("SELECT pr.* FROM prices pr JOIN products p ON p.id=pr.product_id WHERE @manager OR (pr.channel='retail' AND p.active)", new { manager })).ToList();
            var images = (await c.QueryAsync("SELECT i.id,i.product_id,i.caption FROM product_images i JOIN products p ON p.id=i.product_id WHERE @manager OR p.active ORDER BY i.created_at", new { manager })).ToList();
            return Results.Ok(new { products, prices, images });
        });
        app.MapPost("/api/products", async (ProductRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Validate(r); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var id = Guid.NewGuid();
            await c.ExecuteAsync("INSERT INTO products(id,sku,name,scent_id,description,unit,active) VALUES(@id,@Sku,@Name,@ScentId,@Description,@Unit,@Active)", new { id, r.Sku, r.Name, r.ScentId, r.Description, r.Unit, r.Active }, tx);
            await db.Audit(c, tx, ctx.User().Id, "product_created", id); await tx.CommitAsync(); return Results.Ok(new { id });
        });
        app.MapPut("/api/products/{id:guid}", async (Guid id, ProductRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Validate(r); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            var n = await c.ExecuteAsync("UPDATE products SET sku=@Sku,name=@Name,scent_id=@ScentId,description=@Description,unit=@Unit,active=@Active WHERE id=@id", new { id, r.Sku, r.Name, r.ScentId, r.Description, r.Unit, r.Active }, tx);
            Check.That(n == 1, "Không tìm thấy sản phẩm.", 404); await db.Audit(c, tx, ctx.User().Id, "product_updated", id); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapPut("/api/products/{id:guid}/prices", async (Guid id, PriceRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.That(new[] { "retail", "wholesale", "b2b" }.Contains(r.Channel), "Kênh giá không hợp lệ.");
            Check.That(r.UnitPrice is > 0 and <= 1_000_000_000 && decimal.Truncate(r.UnitPrice) == r.UnitPrice && r.CommissionRate is >= 0 and <= 100 && decimal.Round(r.CommissionRate, 2) == r.CommissionRate && r.MinQty is > 0 and <= 100000, "Giá, số lượng hoặc tỷ lệ hoa hồng không hợp lệ.");
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM products WHERE id=@id", new { id }, tx) == 1, "Không tìm thấy sản phẩm.", 404);
            await c.ExecuteAsync("INSERT INTO prices(id,product_id,channel,unit_price,commission_rate,min_qty) VALUES(@pid,@id,@Channel,@UnitPrice,@CommissionRate,@MinQty) ON CONFLICT(product_id,channel) DO UPDATE SET unit_price=excluded.unit_price,commission_rate=excluded.commission_rate,min_qty=excluded.min_qty,updated_at=now()", new { pid = Guid.NewGuid(), id, r.Channel, r.UnitPrice, r.CommissionRate, r.MinQty }, tx);
            await db.Audit(c, tx, ctx.User().Id, "price_updated", id, r); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapPost("/api/products/{id:guid}/images", async (Guid id, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            ctx.Manager(); Check.That(ctx.Request.HasFormContentType, "Cần gửi tệp ảnh."); var form = await ctx.Request.ReadFormAsync(); var f = form.Files.GetFile("file");
            Check.That(f is not null && f.Length is > 0 and <= 5 * 1024 * 1024, "Ảnh phải nhỏ hơn hoặc bằng 5 MB.");
            await using var c = await db.Open(); Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM products WHERE id=@id", new { id }) == 1, "Không tìm thấy sản phẩm.", 404);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM product_images WHERE product_id=@id", new { id }) < 8, "Mỗi sản phẩm tối đa 8 ảnh.");
            using var ms = new MemoryStream(); await f!.CopyToAsync(ms); var b = ms.ToArray();
            var ext = b.Length > 8 && b[0] == 137 && b[1] == 80 && b[2] == 78 && b[3] == 71 ? "png" : b.Length > 3 && b[0] == 255 && b[1] == 216 && b[2] == 255 ? "jpg" : b.Length > 12 && System.Text.Encoding.ASCII.GetString(b, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(b, 8, 4) == "WEBP" ? "webp" : null;
            Check.That(ext is not null, "Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP."); var imageId = Guid.NewGuid(); var key = $"{imageId:N}.{ext}";
            await store.Put(key, b, ext == "jpg" ? "image/jpeg" : $"image/{ext}");
            try { await using var tx = await c.BeginTransactionAsync(); await c.ExecuteAsync("INSERT INTO product_images(id,product_id,object_key,caption) VALUES(@imageId,@id,@key,@caption)", new { imageId, id, key, caption = Check.Text(form["caption"], 300) }, tx); await db.Audit(c, tx, ctx.User().Id, "image_uploaded", id); await tx.CommitAsync(); }
            catch { await store.Delete(key); throw; }
            return Results.Ok(new { id = imageId });
        });
        app.MapGet("/api/images/{id:guid}", async (Guid id, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            await using var c = await db.Open(); var key = await c.ExecuteScalarAsync<string>("SELECT i.object_key FROM product_images i JOIN products p ON p.id=i.product_id WHERE i.id=@id AND (@manager OR p.active)", new { id, manager = ctx.User().Manager }); Check.That(key is not null, "Không tìm thấy ảnh.", 404);
            return Results.File(await store.Get(key!), key!.EndsWith(".jpg") ? "image/jpeg" : key.EndsWith(".png") ? "image/png" : "image/webp");
        });
        app.MapDelete("/api/images/{id:guid}", async (Guid id, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            ctx.Manager(); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var key = await c.ExecuteScalarAsync<string>("SELECT object_key FROM product_images WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(key is not null, "Không tìm thấy ảnh.", 404); await store.Delete(key!); await c.ExecuteAsync("DELETE FROM product_images WHERE id=@id", new { id }, tx); await db.Audit(c, tx, ctx.User().Id, "image_deleted", id); await tx.CommitAsync(); return Results.NoContent();
        });
    }
    static void Validate(ProductRequest r) { Check.Text(r.Sku, 50, true); Check.Text(r.Name, 180, true); Check.Text(r.Description, 5000); Check.Text(r.Unit, 30, true); }
}
public record ProductRequest(string Sku, string Name, Guid? ScentId, string Description, string Unit, bool Active);
public record PriceRequest(string Channel, decimal UnitPrice, decimal CommissionRate, int MinQty);
