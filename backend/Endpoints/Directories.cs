using Dapper;
using Npgsql;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace Amora;
public static class Directories
{
    public static readonly Dictionary<string,string> Tables=new() {{"product-categories","product_categories"},{"customer-groups","customer_groups"},{"scents","scents"}};
    public static void MapDirectories(this WebApplication app)
    {
        foreach(var pair in Tables){var kind=pair.Key;var table=pair.Value;
            app.MapGet("/api/directories/"+kind,async(HttpContext ctx,Db db)=>{await using var c=await db.Open();return Results.Ok(await c.QueryAsync($"SELECT * FROM {table} WHERE @manager OR active ORDER BY "+(kind=="scents"?"name":"sort_order,name"),new{manager=ctx.User().Manager}));});
            app.MapPost("/api/directories/"+kind,async(DirectoryRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var id=await Save(c,tx,kind,null,r);await db.Audit(c,tx,ctx.User().Id,"directory_created",id,new{kind});await tx.CommitAsync();return Results.Ok(new{id});});
            app.MapPut("/api/directories/"+kind+"/{id:guid}",async(Guid id,DirectoryRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await Save(c,tx,kind,id,r);await db.Audit(c,tx,ctx.User().Id,"directory_updated",id,new{kind});await tx.CommitAsync();return Results.NoContent();});
        }
        app.MapGet("/api/models",async(HttpContext ctx,Db db)=> await Listing.Page(ctx,db,"m.*,c.name AS category_name,c.code AS category_code,(SELECT count(*) FROM products p WHERE p.model_id=m.id) AS variants_count","FROM product_models m JOIN product_categories c ON c.id=m.category_id","(@manager OR (m.active AND c.active)) AND (m.name ILIKE @search OR m.code ILIKE @search) AND (@category='' OR c.code=@category)","m.created_at DESC,m.id DESC",new{category=Check.Text(ctx.Request.Query["category"],40)}));
        app.MapGet("/api/models/next-code",async(Guid categoryId,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var code=await NextModelCode(c,tx,categoryId);return Results.Ok(new{code});});
        app.MapPost("/api/models",async(ModelRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var id=await SaveModel(c,tx,null,r);await db.Audit(c,tx,ctx.User().Id,"model_created",id);await tx.CommitAsync();return Results.Ok(new{id});});
        app.MapDelete("/api/models/{id:guid}",async(Guid id,int version,HttpContext ctx,Db db)=>{
            ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var model=await c.QuerySingleOrDefaultAsync("SELECT code,name,version FROM product_models WHERE id=@id FOR UPDATE",new{id},tx);
            Check.That(model is not null,"Không tìm thấy mẫu.",404);Check.That((int)model!.version==version,"Mẫu đã thay đổi. Hãy tải lại.",409);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM products WHERE model_id=@id",new{id},tx)==0,"Mẫu đang có SKU. Xóa các SKU chưa phát sinh trước, hoặc ngừng sử dụng mẫu để giữ lịch sử.",409);
            await c.ExecuteAsync("DELETE FROM product_models WHERE id=@id",new{id},tx);await db.Audit(c,tx,ctx.User().Id,"model_deleted",id,new{code=(string)model.code,name=(string)model.name});await tx.CommitAsync();return Results.NoContent();
        });
        app.MapPut("/api/models/{id:guid}",async(Guid id,ModelRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await SaveModel(c,tx,id,r);await db.Audit(c,tx,ctx.User().Id,"model_updated",id);await tx.CommitAsync();return Results.NoContent();});
    }
    public static async Task<Guid> Save(NpgsqlConnection c,NpgsqlTransaction tx,string kind,Guid? existing,DirectoryRequest r){
        Check.That(Tables.ContainsKey(kind),"Danh mục không hợp lệ.");var table=Tables[kind];var name=Check.Text(r.Name,kind=="scents"?180:120,true);
        var code=Check.Text(r.Code,40,kind!="scents").ToUpperInvariant();Check.That(r.SortOrder is >=0 and <=100000,"Thứ tự không hợp lệ.");
        Check.Text(r.Meaning,1000);Check.Text(r.TopNotes,1000);Check.Text(r.MiddleNotes,1000);Check.Text(r.BaseNotes,1000);Check.Text(r.Ritual,1000);
        var id=existing??Guid.NewGuid();
        var duplicateSql=kind=="scents"?"SELECT EXISTS(SELECT 1 FROM scents WHERE id<>@id AND lower(btrim(name))=lower(@name))":$"SELECT EXISTS(SELECT 1 FROM {table} WHERE id<>@id AND (lower(btrim(name))=lower(@name) OR lower(btrim(code))=lower(@code)))";
        Check.That(!await c.ExecuteScalarAsync<bool>(duplicateSql,new{id,name,code},tx),"Tên hoặc mã danh mục đã tồn tại.",409);
        if(existing is null){
            if(kind=="scents")await c.ExecuteAsync("INSERT INTO scents(id,name,meaning,top_notes,middle_notes,base_notes,ritual,active) VALUES(@id,@name,@Meaning,@TopNotes,@MiddleNotes,@BaseNotes,@Ritual,@Active)",new{id,name,r.Meaning,r.TopNotes,r.MiddleNotes,r.BaseNotes,r.Ritual,r.Active},tx);
            else await c.ExecuteAsync($"INSERT INTO {table}(id,code,name,sort_order,active) VALUES(@id,@code,@name,@SortOrder,@Active)",new{id,code,name,r.SortOrder,r.Active},tx);
        }else{
            if(kind=="customer-groups" && id==Guid.Parse("00000000-0000-0000-0000-000000000001"))Check.That(r.Active && code=="UNCLASSIFIED","Nhóm mặc định phải hoạt động và giữ mã UNCLASSIFIED.");
            var sql=kind=="scents"?$"UPDATE {table} SET name=@name,meaning=@Meaning,top_notes=@TopNotes,middle_notes=@MiddleNotes,base_notes=@BaseNotes,ritual=@Ritual,active=@Active,version=version+1 WHERE id=@id AND version=@Version":$"UPDATE {table} SET name=@name,code=@code,sort_order=@SortOrder,active=@Active,version=version+1 WHERE id=@id AND version=@Version";
            Check.That(await c.ExecuteAsync(sql,new{id,name,code,r.SortOrder,r.Active,r.Version,r.Meaning,r.TopNotes,r.MiddleNotes,r.BaseNotes,r.Ritual},tx)==1,"Danh mục đã thay đổi. Hãy tải lại.",409);
        }return id;
    }
    public static async Task<string> NextModelCode(NpgsqlConnection c,NpgsqlTransaction tx,Guid categoryId){
        var name=await c.QuerySingleOrDefaultAsync<string>("SELECT name FROM product_categories WHERE id=@categoryId AND active",new{categoryId},tx);
        Check.That(name is not null,"Cần chọn nhóm sản phẩm đang sử dụng.");
        var plain=new string(name!.Normalize(NormalizationForm.FormD).Where(ch=>CharUnicodeInfo.GetUnicodeCategory(ch)!=UnicodeCategory.NonSpacingMark).ToArray()).Replace('đ','d').Replace('Đ','D').ToUpperInvariant();
        var words=Regex.Matches(plain,"[A-Z0-9]+").Select(m=>m.Value).ToArray();
        var prefix=string.Concat(words.Select(w=>w[0])).Trim();if(prefix.Length==0)prefix="SP";if(prefix.Length>12)prefix=prefix[..12];
        var number=await c.ExecuteScalarAsync<long>("SELECT COALESCE(max(substring(code from @start)::bigint),0)+1 FROM product_models WHERE code ~ @pattern",new{start=prefix.Length+2,pattern="^"+prefix+"-[0-9]{1,12}$"},tx);
        Check.That(number<=999999999999,"Nhóm đã hết dải mã tự động.");
        return prefix+"-"+number.ToString("D4",CultureInfo.InvariantCulture);
    }
    public static async Task<Guid> SaveModel(NpgsqlConnection c,NpgsqlTransaction tx,Guid? existing,ModelRequest r){
        // Serialize both automatic and manual model writes across API instances.
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352024)",transaction:tx);
        var code=Check.Text(r.Code,40,existing is not null).ToUpperInvariant();
        if(existing is null && code.Length==0)code=await NextModelCode(c,tx,r.CategoryId);
        var name=Check.Text(r.Name,180,true);var description=Check.Text(r.Description,5000);
        Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM product_categories WHERE id=@CategoryId AND active",new{r.CategoryId},tx)==1,"Cần chọn nhóm sản phẩm đang sử dụng.");var id=existing??Guid.NewGuid();
        Check.That(!await c.ExecuteScalarAsync<bool>("SELECT EXISTS(SELECT 1 FROM product_models WHERE id<>@id AND lower(btrim(code))=lower(@code))",new{id,code},tx),"Mã mẫu đã tồn tại.",409);
        if(existing is null)await c.ExecuteAsync("INSERT INTO product_models(id,code,name,category_id,description,active) VALUES(@id,@code,@name,@CategoryId,@description,@Active)",new{id,code,name,r.CategoryId,description,r.Active},tx);
        else Check.That(await c.ExecuteAsync("UPDATE product_models SET code=@code,name=@name,category_id=@CategoryId,description=@description,active=@Active,version=version+1 WHERE id=@id AND version=@Version",new{id,code,name,r.CategoryId,description,r.Active,r.Version},tx)==1,"Mẫu đã thay đổi. Hãy tải lại.",409);
        if(existing is not null)await c.ExecuteAsync("UPDATE products p SET name=@name||COALESCE((SELECT ' · '||name FROM scents WHERE id=p.scent_id AND name<>@name),'')||CASE WHEN p.size_label='' THEN '' ELSE ' · '||p.size_label END||CASE WHEN p.color_label='' THEN '' ELSE ' · '||p.color_label END,version=version+1 WHERE p.model_id=@id",new{id,name},tx);
        return id;
    }
}
public record DirectoryRequest(string Name,string Code="",int SortOrder=0,bool Active=true,int Version=0,string Meaning="",string TopNotes="",string MiddleNotes="",string BaseNotes="",string Ritual="");
public record ModelRequest(string Code,string Name,Guid CategoryId,string Description="",bool Active=true,int Version=0);
