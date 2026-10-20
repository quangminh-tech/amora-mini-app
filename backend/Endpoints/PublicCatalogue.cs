using System.Text.Json;
using Dapper;
namespace Amora;

public static class PublicCatalogue
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static bool AnonymousRead(HttpContext ctx) => (ctx.Request.Method is "GET" or "HEAD") && ctx.Request.Path.StartsWithSegments("/api/public/catalogues");
    public static StudioContent Decode(string json)
    {
        var content=JsonSerializer.Deserialize<StudioContent>(json,Json)!;
        foreach(var section in content.Sections)section.ProductId=null;
        return content;
    }
    public static bool HasImage(StudioContent content,Guid id) => content.CoverId==id || content.Sections.Any(s=>s.ImageIds.Contains(id));
    public static bool ValidSlug(string slug) => slug.Length==64 && slug.All(c=>c is >= 'a' and <= 'f' or >= '0' and <= '9');
    public static void MapPublicCatalogue(this WebApplication app)
    {
        app.MapGet("/api/public/catalogues/{slug}",async(string slug,HttpContext ctx,Db db)=>{
            Check.That(ValidSlug(slug),"Link catalogue không hợp lệ hoặc đã thu hồi.",404);
            await using var c=await db.Open();
            var json=await c.ExecuteScalarAsync<string>("SELECT published_content::text FROM catalogue_documents WHERE public_slug=@slug AND public_enabled AND NOT archived AND published_content IS NOT NULL",new{slug});
            Check.That(json is not null,"Catalogue chưa phát hành hoặc đã thu hồi.",404);
            ctx.Response.Headers["X-Robots-Tag"]="noindex, nofollow, noarchive";
            ctx.Response.Headers["Referrer-Policy"]="no-referrer";
            return Results.Ok(new{content=Decode(json!)});
        });
        app.MapGet("/api/public/catalogues/{slug}/images/{imageId:guid}",async(string slug,Guid imageId,HttpContext ctx,Db db,ObjectStorage store)=>{
            Check.That(ValidSlug(slug),"Không tìm thấy ảnh.",404);
            await using var c=await db.Open();
            // Short-lived transaction keeps authorization and asset lookup on one publication snapshot.
            await using var tx=await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            var row=await c.QuerySingleOrDefaultAsync<PublicRow>("SELECT id,published_content::text AS Content FROM catalogue_documents WHERE public_slug=@slug AND public_enabled AND NOT archived AND published_content IS NOT NULL",new{slug},tx);
            Check.That(row is not null && HasImage(Decode(row.Content),imageId),"Không tìm thấy ảnh.",404);
            var asset=await c.QuerySingleOrDefaultAsync<StudioAsset>("SELECT object_key AS ObjectKey,content_type AS ContentType FROM catalogue_assets WHERE document_id=@id AND id=@imageId",new{id=row!.Id,imageId},tx);
            Check.That(asset is not null,"Không tìm thấy ảnh.",404);
            await tx.CommitAsync();ctx.Response.Headers["Referrer-Policy"]="no-referrer";
            return Results.File(await store.Get(asset!.ObjectKey),asset.ContentType);
        });
    }
}
public sealed class PublicRow { public Guid Id {get;set;} public string Content {get;set;}=""; }
