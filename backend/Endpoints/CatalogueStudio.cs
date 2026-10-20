using System.Text.Json;
using Dapper;
using Npgsql;

namespace Amora;
public static class CatalogueStudio
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Pack(StudioContent content) => JsonSerializer.Serialize(content, Json);
    private static StudioContent Unpack(string content) => JsonSerializer.Deserialize<StudioContent>(content, Json)!;
    private static Guid[] Images(StudioContent content) => content.Sections.SelectMany(x => x.ImageIds).Append(content.CoverId ?? Guid.Empty).Where(x => x != Guid.Empty).Distinct().ToArray();
    private static async Task<StudioRow> Read(NpgsqlConnection c, Guid id, NpgsqlTransaction? tx = null, bool locked = false)
    {
        var row = await c.QuerySingleOrDefaultAsync<StudioRow>("SELECT id,owner_id AS OwnerId,name,content::text AS Content,published_content::text AS PublishedContent,published_name AS PublishedName,version,archived FROM catalogue_documents WHERE id=@id" + (locked ? " FOR UPDATE" : ""), new { id }, tx);
        Check.That(row is not null && !row.Archived, "Không tìm thấy catalogue.", 404);
        return row!;
    }

    private static void Editable(HttpContext ctx, StudioRow row) => ctx.Own(row.OwnerId);
    private static StudioContent Visible(HttpContext ctx, StudioRow row, bool published = false)
    {
        if (!published && (ctx.User().Manager || row.OwnerId == ctx.User().Id))
            return Unpack(row.Content);
        Check.That(row.PublishedContent is not null, "Catalogue chưa được phát hành.", 404);
        return Unpack(row.PublishedContent!);
    }

    private static void Validate(StudioContent c, bool manager)
    {
        Check.Text(c.Title, 180, true);
        Check.Text(c.Subtitle, 300);
        Check.Text(c.Intro, 3000);
        Check.Text(c.Contact, 1200);
        Check.Text(c.Note, 3000);
        Check.That(c.CoverId != Guid.Empty, "Ảnh bìa không hợp lệ.");
        Check.That(new[] { "cream", "white", "dark" }.Contains(c.Theme), "Màu nền không hợp lệ.");
        Check.That(c.Sections is not null && c.Sections.Count <= 100, "Tối đa 100 mục nội dung.");
        Check.That(manager || !c.ShowPrices, "CTV dùng catalogue giới thiệu không giá; lập giá tại Báo giá.", 403);
        var keys = new HashSet<Guid>();
        foreach (var s in c.Sections!)
        {
            Check.That(s is not null && s.Id != Guid.Empty && keys.Add(s.Id), "Mục nội dung không hợp lệ hoặc trùng ID.");
            Check.That(new[] { "product", "text", "gallery", "table" }.Contains(s!.Kind), "Loại nội dung không hợp lệ.");
            Check.That(new[] { "split", "gallery", "compact" }.Contains(s.Layout), "Bố cục không hợp lệ.");
            Check.That(new[] { "contain", "cover" }.Contains(s.Fit) && s.Position is >= 0 and <= 100, "Vị trí ảnh không hợp lệ.");
            Check.Text(s.Title, 180);
            Check.Text(s.Description, 5000);
            Check.Text(s.Sku, 80);
            Check.Text(s.Spec, 300);
            Check.That(s.Price is null or > 0 and <= 1000000000, "Giá không hợp lệ.");
            Check.That(manager || s.Price is null, "CTV không nhập giá trong catalogue.", 403);
            Check.That(s.ImageIds is not null && s.ImageIds.Length <= 4 && !s.ImageIds.Contains(Guid.Empty) && s.ImageIds.Distinct().Count() == s.ImageIds.Length, "Tối đa 4 ảnh khác nhau cho một mục.");
            Check.That(s.Columns is not null && s.Columns.Length <= 6 && s.Rows is not null && s.Rows.Length <= 40, "Bảng tối đa 6 cột, 40 hàng.");
            foreach (var column in s.Columns!)
                Check.Text(column, 100);
            foreach (var cells in s.Rows!)
            {
                Check.That(cells is not null && cells.Length == s.Columns.Length, "Số ô không khớp cột.");
                foreach (var cell in cells!)
                    Check.Text(cell, 500);
            }
        }

        Check.That(System.Text.Encoding.UTF8.GetByteCount(Pack(c)) <= 256000, "Nội dung tối đa 250 KB.");
    }

    public static void MapCatalogueStudio(this WebApplication app)
    {
        app.MapGet("/api/studio", async (int? page, string? search, HttpContext ctx, Db db) =>
        {
            var pg = Math.Max(1, page ?? 1);
            Check.That(pg <= 10000, "Trang không hợp lệ.");
            var term = "%" + Check.Text(search, 100) + "%";
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            const string filter = "NOT archived AND (@manager OR owner_id=@uid OR published_content IS NOT NULL) AND (CASE WHEN @manager OR owner_id=@uid THEN name ELSE published_name END) ILIKE @term";
            var args = new
            {
                manager = ctx.User().Manager,
                uid = ctx.User().Id,
                term,
                offset = (pg - 1) * 12
            };
            var total = await c.ExecuteScalarAsync<int>("SELECT count(*) FROM catalogue_documents WHERE " + filter, args, tx);
            var items = await c.QueryAsync("SELECT id,CASE WHEN @manager OR owner_id=@uid THEN name ELSE published_name END AS name,owner_id,published_at,updated_at,version,(@manager OR owner_id=@uid) AS editable FROM catalogue_documents WHERE " + filter + " ORDER BY updated_at DESC,id LIMIT 12 OFFSET @offset", args, tx);
            await tx.CommitAsync();
            return Results.Ok(new { items, total, page = pg });
        });
        app.MapPost("/api/studio", async (StudioCreate r, HttpContext ctx, Db db) =>
        {
            var name = Check.Text(r.Name, 180, true);
            var id = Guid.NewGuid();
            var content = new StudioContent
            {
                Title = name
            };
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("SELECT id FROM users WHERE id=@uid FOR UPDATE", new { uid = ctx.User().Id }, tx);
            var count = await c.ExecuteScalarAsync<int>("SELECT count(*) FROM catalogue_documents WHERE owner_id=@uid AND NOT archived", new { uid = ctx.User().Id }, tx);
            Check.That(count < 100, "Mỗi tài khoản tối đa 100 catalogue đang dùng.");
            await c.ExecuteAsync("INSERT INTO catalogue_documents(id,owner_id,name,content) VALUES(@id,@uid,@name,CAST(@content AS jsonb))", new { id, uid = ctx.User().Id, name, content = Pack(content) }, tx);
            await db.Audit(c, tx, ctx.User().Id, "catalogue_created", id);
            await tx.CommitAsync();
            return Results.Ok(new { id });
        });
        app.MapGet("/api/studio/{id:guid}", async (Guid id, bool? published, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            var row = await Read(c, id);
            var content = Visible(ctx, row, published == true);
            return Results.Ok(new { id, name = published == true ? row.PublishedName ?? row.Name : ctx.User().Manager || row.OwnerId == ctx.User().Id ? row.Name : row.PublishedName, content, version = row.Version, editable = ctx.User().Manager || row.OwnerId == ctx.User().Id, published = row.PublishedContent is not null });
        });
        app.MapPut("/api/studio/{id:guid}", async (Guid id, StudioSave r, HttpContext ctx, Db db) =>
        {
            var name = Check.Text(r.Name, 180, true);
            Check.That(r.Content is not null, "Thiếu nội dung.");
            Validate(r.Content!, ctx.User().Manager);
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var row = await Read(c, id, tx, true);
            Editable(ctx, row);
            Check.That(row.Version == r.Version, "Catalogue đã được sửa ở nơi khác. Tải lại trước khi lưu.", 409);
            var ids = Images(r.Content!);
            var found = await c.ExecuteScalarAsync<int>("SELECT count(*) FROM catalogue_assets WHERE document_id=@id AND id=ANY(@ids)", new { id, ids }, tx);
            Check.That(found == ids.Length, "Có ảnh không thuộc catalogue này. Hãy chọn hoặc tải lại ảnh.");
            await c.ExecuteAsync("UPDATE catalogue_documents SET name=@name,content=CAST(@content AS jsonb),version=version+1,updated_at=now() WHERE id=@id", new { id, name, content = Pack(r.Content!) }, tx);
            await db.Audit(c, tx, ctx.User().Id, "catalogue_saved", id, new { version = row.Version + 1 });
            await tx.CommitAsync();
            return Results.Ok(new { version = row.Version + 1 });
        });
        app.MapPost("/api/studio/{id:guid}/publish", async (Guid id, StudioVersion r, HttpContext ctx, Db db) =>
        {
            ctx.Manager();
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var row = await Read(c, id, tx, true);
            Check.That(row.Version == r.Version, "Catalogue đã thay đổi. Tải lại trước khi phát hành.", 409);
            Check.That(Unpack(row.Content).Sections.Count > 0, "Thêm nội dung trước khi phát hành.");
            await c.ExecuteAsync("UPDATE catalogue_documents SET published_content=content,published_name=name,published_at=now(),version=version+1,updated_at=now() WHERE id=@id", new { id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "catalogue_published", id);
            await tx.CommitAsync();
            return Results.Ok(new { version = row.Version + 1 });
        });
        app.MapPost("/api/studio/{id:guid}/unpublish", async (Guid id, StudioVersion r, HttpContext ctx, Db db) =>
        {
            ctx.Manager();
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var row = await Read(c, id, tx, true);
            Check.That(row.Version == r.Version, "Dữ liệu đã thay đổi. Tải lại.", 409);
            await c.ExecuteAsync("UPDATE catalogue_documents SET published_content=NULL,published_name=NULL,published_at=NULL,version=version+1,updated_at=now() WHERE id=@id", new { id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "catalogue_unpublished", id);
            await tx.CommitAsync();
            return Results.Ok(new { version = row.Version + 1 });
        });
        app.MapPost("/api/studio/{id:guid}/archive", async (Guid id, StudioVersion r, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var row = await Read(c, id, tx, true);
            Editable(ctx, row);
            Check.That(ctx.User().Manager || row.PublishedContent is null, "Nhờ quản lý thu hồi bản phát hành trước.", 403);
            Check.That(row.Version == r.Version, "Dữ liệu đã thay đổi. Tải lại.", 409);
            await c.ExecuteAsync("UPDATE catalogue_documents SET archived=true,version=version+1,updated_at=now() WHERE id=@id", new { id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "catalogue_archived", id);
            await tx.CommitAsync();
            return Results.NoContent();
        });
        app.MapPost("/api/studio/{id:guid}/copy", async (Guid id, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("SELECT id FROM users WHERE id=@uid FOR UPDATE", new { uid = ctx.User().Id }, tx);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM catalogue_documents WHERE owner_id=@uid AND NOT archived", new { uid = ctx.User().Id }, tx) < 100, "Mỗi tài khoản tối đa 100 catalogue đang dùng.");
            var row = await Read(c, id, tx, true);
            var content = Visible(ctx, row);
            var next = Guid.NewGuid();
            if (!ctx.User().Manager)
            {
                content.ShowPrices = false;
                foreach (var section in content.Sections)
                    section.Price = null;
            }

            var sourceName = (ctx.User().Manager || row.OwnerId == ctx.User().Id ? row.Name : row.PublishedName) ?? "Catalogue";
            var name = sourceName[..Math.Min(sourceName.Length, 168)] + " · bản sao";
            // Images are immutable. New asset IDs reference the same R2 objects; archiving never deletes them.
            var remap = new Dictionary<Guid, Guid>();
            foreach (var old in Images(content))
                remap[old] = Guid.NewGuid();
            if (content.CoverId is Guid cover)
                content.CoverId = remap[cover];
            foreach (var section in content.Sections)
            {
                section.Id = Guid.NewGuid();
                section.ImageIds = section.ImageIds.Select(x => remap[x]).ToArray();
            }

            await c.ExecuteAsync("INSERT INTO catalogue_documents(id,owner_id,name,content) VALUES(@next,@uid,@name,CAST(@content AS jsonb))", new { next, uid = ctx.User().Id, name, content = Pack(content) }, tx);
            foreach (var pair in remap)
            {
                var n = await c.ExecuteAsync("INSERT INTO catalogue_assets(id,document_id,object_key,content_type,caption,byte_size) SELECT @newId,@next,object_key,content_type,caption,byte_size FROM catalogue_assets WHERE id=@old AND document_id=@id", new { newId = pair.Value, next, old = pair.Key, id }, tx);
                Check.That(n == 1, "Ảnh nguồn không còn tồn tại. Tải lại catalogue.", 409);
            }

            await db.Audit(c, tx, ctx.User().Id, "catalogue_copied", next, new { source = id });
            await tx.CommitAsync();
            return Results.Ok(new { id = next });
        });
        app.MapGet("/api/studio/{id:guid}/assets", async (Guid id, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open();
            var row = await Read(c, id);
            Editable(ctx, row);
            return Results.Ok(await c.QueryAsync("SELECT id,caption,byte_size FROM catalogue_assets WHERE document_id=@id ORDER BY created_at,id", new { id }));
        });
        app.MapPost("/api/studio/{id:guid}/assets", async (Guid id, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            Check.That(ctx.Request.HasFormContentType, "Cần gửi ảnh.");
            var form = await ctx.Request.ReadFormAsync();
            var f = form.Files.GetFile("file");
            Check.That(f is not null && f.Length is> 0 and <= 2097152, "Ảnh tối đa 2 MB.");
            using var ms = new MemoryStream();
            await f!.CopyToAsync(ms);
            var bytes = ms.ToArray();
            var ext = bytes.Length > 8 && bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 ? "png" : bytes.Length > 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 ? "jpg" : bytes.Length > 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP" ? "webp" : null;
            Check.That(ext is not null, "Chỉ nhận PNG, JPEG, WebP.");
            var contentType = ext == "jpg" ? "image/jpeg" : "image/" + ext;
            var assetId = Guid.NewGuid();
            var key = $"catalogue-{assetId:N}.{ext}";
            var uploaded = false;
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var row = await Read(c, id, tx, true);
            Editable(ctx, row);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM catalogue_assets WHERE document_id=@id", new { id }, tx) < 120, "Mỗi catalogue tối đa 120 ảnh. Dùng lại ảnh trong thư viện.");
            try
            {
                await store.Put(key, bytes, contentType);
                uploaded = true;
                await c.ExecuteAsync("INSERT INTO catalogue_assets(id,document_id,object_key,content_type,caption,byte_size) VALUES(@assetId,@id,@key,@contentType,@caption,@size)", new { assetId, id, key, contentType, caption = Check.Text(form["caption"], 180), size = bytes.Length }, tx);
                await db.Audit(c, tx, ctx.User().Id, "catalogue_image_uploaded", id, new { assetId });
                await tx.CommitAsync();
            }
            catch
            {
                if (uploaded)
                    try
                    {
                        await store.Delete(key);
                    }
                    catch
                    { /* preserve original error */
                    }

                throw;
            }

            return Results.Ok(new { id = assetId });
        });
        app.MapGet("/api/studio/{id:guid}/assets/{assetId:guid}", async (Guid id, Guid assetId, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            await using var c = await db.Open();
            var row = await Read(c, id);
            if (!ctx.User().Manager && row.OwnerId != ctx.User().Id)
                Check.That(Images(Visible(ctx, row, true)).Contains(assetId), "Không tìm thấy ảnh.", 404);
            var a = await c.QuerySingleOrDefaultAsync<StudioAsset>("SELECT object_key AS ObjectKey,content_type AS ContentType FROM catalogue_assets WHERE document_id=@id AND id=@assetId", new { id, assetId });
            Check.That(a is not null, "Không tìm thấy ảnh.", 404);
            return Results.File(await store.Get(a!.ObjectKey), a.ContentType);
        });
    }
}

public sealed class StudioContent
{
    public string Title { get; set; } = "Bộ sưu tập AMORA";
    public string Subtitle { get; set; } = "Simple Moments. Deep Calm.";
    public string Intro { get; set; } = "";
    public string Contact { get; set; } = "CÔNG TY TNHH AMORA STUDIO\nMST: 0319667775";
    public string Note { get; set; } = "Thông tin và điều kiện đặt hàng được xác nhận khi lập báo giá.";
    public string Theme { get; set; } = "cream";
    public bool Motion { get; set; } = true;
    public bool ShowPrices { get; set; } = false;
    public Guid? CoverId { get; set; }
    public List<StudioSection> Sections { get; set; } = [];
}

public sealed class StudioSection
{
    public Guid Id { get; set; }
    public string Kind { get; set; } = "product";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Sku { get; set; } = "";
    public Guid? ProductId { get; set; }
    public string Spec { get; set; } = "";
    public decimal? Price { get; set; }
    public string Layout { get; set; } = "split";
    public string Fit { get; set; } = "contain";
    public int Position { get; set; } = 50;
    public bool PageBreak { get; set; }
    public Guid[] ImageIds { get; set; } = [];
    public string[] Columns { get; set; } = [];
    public string[][] Rows { get; set; } = [];
}

public record StudioCreate(string Name);
public record StudioSave(string Name, int Version, StudioContent Content);
public record StudioVersion(int Version);
public sealed class StudioRow
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = "";
    public string Content { get; set; } = "";
    public string? PublishedContent { get; set; }
    public string? PublishedName { get; set; }
    public int Version { get; set; }
    public bool Archived { get; set; }
}

public sealed class StudioAsset
{
    public string ObjectKey { get; set; } = "";
    public string ContentType { get; set; } = "";
}
