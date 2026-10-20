using Dapper;
namespace Amora;
public static class ScentLearning
{
    private static bool Layer(string layer)=>layer is "top" or "middle" or "base";
    public static void MapScentLearning(this WebApplication app)
    {
        app.MapGet("/api/scent-learning",async(HttpContext ctx,Db db)=>{
            await using var c=await db.Open();
            return Results.Ok(await c.QueryAsync("SELECT s.id,s.name,s.meaning,s.top_notes,s.middle_notes,s.base_notes,s.ritual,s.active,EXISTS(SELECT 1 FROM scent_note_images i WHERE i.scent_id=s.id AND i.layer='top') AS has_top_image,EXISTS(SELECT 1 FROM scent_note_images i WHERE i.scent_id=s.id AND i.layer='middle') AS has_middle_image,EXISTS(SELECT 1 FROM scent_note_images i WHERE i.scent_id=s.id AND i.layer='base') AS has_base_image FROM scents s WHERE @manager OR s.active ORDER BY s.name",new{manager=ctx.User().Manager}));
        });
        app.MapGet("/api/scent-learning/{id:guid}/images/{layer}",async(Guid id,string layer,HttpContext ctx,Db db,ObjectStorage store)=>{
            Check.That(Layer(layer),"Tầng hương không hợp lệ.");await using var c=await db.Open();
            var key=await c.ExecuteScalarAsync<string>("SELECT i.object_key FROM scent_note_images i JOIN scents s ON s.id=i.scent_id WHERE s.id=@id AND i.layer=@layer AND (@manager OR s.active)",new{id,layer,manager=ctx.User().Manager});
            Check.That(key is not null,"Chưa có ảnh minh họa.",404);return Results.File(await store.Get(key!),"image/jpeg");
        });
        app.MapPost("/api/scent-learning/{id:guid}/images/{layer}",async(Guid id,string layer,HttpContext ctx,Db db,ObjectStorage store)=>{
            ctx.Manager();Check.That(Layer(layer),"Tầng hương không hợp lệ.");Check.That(ctx.Request.HasFormContentType,"Cần gửi tệp ảnh JPEG.");
            var form=await ctx.Request.ReadFormAsync();var f=form.Files.GetFile("file");Check.That(f is not null && f.Length is >0 and <=2097152,"Ảnh sau nén tối đa 2 MB.");
            using var ms=new MemoryStream();await f!.CopyToAsync(ms);var bytes=ms.ToArray();Check.That(bytes.Length>3&&bytes[0]==255&&bytes[1]==216&&bytes[2]==255,"Chỉ nhận ảnh JPEG đã nén.");
            var key=$"scent-{Guid.NewGuid():N}.jpg";string? previous=null;var uploaded=false;
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM (SELECT id FROM scents WHERE id=@id FOR UPDATE) x",new{id},tx)==1,"Không tìm thấy mùi hương.",404);
            previous=await c.ExecuteScalarAsync<string>("SELECT object_key FROM scent_note_images WHERE scent_id=@id AND layer=@layer",new{id,layer},tx);
            try{
                await store.Put(key,bytes,"image/jpeg");uploaded=true;
                await c.ExecuteAsync("INSERT INTO scent_note_images(scent_id,layer,object_key) VALUES(@id,@layer,@key) ON CONFLICT(scent_id,layer) DO UPDATE SET object_key=excluded.object_key,created_at=now()",new{id,layer,key},tx);
                await db.Audit(c,tx,ctx.User().Id,"scent_note_image_updated",id,new{layer});await tx.CommitAsync();
            }catch{if(uploaded)try{await store.Delete(key);}catch{}throw;}
            if(previous is not null)try{await store.Delete(previous);}catch{await db.Audit(c,null,ctx.User().Id,"scent_image_cleanup_pending",id,new{key=previous});}
            return Results.NoContent();
        });
    }
}
