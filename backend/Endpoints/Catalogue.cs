using Dapper;
using Npgsql;
namespace Amora;
public static class Catalogue
{
    public const string ProductFrom="FROM products p JOIN product_models m ON m.id=p.model_id JOIN product_categories cat ON cat.id=m.category_id LEFT JOIN scents s ON s.id=p.scent_id";
    public const string Visible="p.active AND m.active AND cat.active AND (p.scent_id IS NULL OR s.active)";
    public const string ProductSelect="p.*,m.name AS model_name,m.code AS model_code,m.category_id,cat.name AS category_name,cat.code AS category_code,s.name AS scent_name,s.top_notes,s.middle_notes,s.base_notes,s.ritual";
    public static void MapCatalogue(this WebApplication app)
    {
        app.MapGet("/api/scents",async(HttpContext ctx,Db db)=>{await using var c=await db.Open();return await c.QueryAsync("SELECT * FROM scents WHERE @manager OR active ORDER BY name",new{manager=ctx.User().Manager});});
        app.MapGet("/api/products",async(HttpContext ctx,Db db)=>{
            var q=ctx.Request.Query;int Number(string key,int fallback,int max){if(!q.ContainsKey(key))return fallback;Check.That(int.TryParse(q[key],out var n)&&n>0&&n<=max,"Trang không hợp lệ.");return n;}
            var page=Number("page",1,1000000);var pageSize=Number("pageSize",100,100);var manager=ctx.User().Manager;
            var extra=new List<Guid>();foreach(var raw in q["includeIds"].ToString().Split(',',StringSplitOptions.RemoveEmptyEntries)){Check.That(Guid.TryParse(raw,out var id),"SKU không hợp lệ.");extra.Add(id);}Check.That(extra.Count<=50,"Tối đa 50 SKU đã chọn.");
            var filter="(@manager OR ("+Visible+")) AND (@category='' OR cat.code=@category) AND (@model='' OR m.id::text=@model) AND (@status='' OR (@status='active' AND p.active) OR (@status='inactive' AND NOT p.active)) AND (p.name ILIKE @search OR p.sku ILIKE @search OR m.name ILIKE @search OR p.size_label ILIKE @search OR p.color_label ILIKE @search OR s.name ILIKE @search)";
            var args=new{manager,category=Check.Text(q["category"],40),model=Check.Text(q["modelId"],40),status=Check.Text(q["status"],16),search="%"+Check.Text(q["search"],180).Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")+"%",limit=pageSize,offset=(page-1)*pageSize};
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            var total=await c.ExecuteScalarAsync<long>("SELECT count(*) "+ProductFrom+" WHERE "+filter,args,tx);
            var products=(await c.QueryAsync("SELECT "+ProductSelect+" "+ProductFrom+" WHERE "+filter+" ORDER BY m.name,p.size_label,p.sku,p.id LIMIT @limit OFFSET @offset",args,tx)).ToList();
            var selected=products.Select(x=>(Guid)x.id).ToHashSet();var included=extra.Where(x=>!selected.Contains(x)).ToArray();
            if(included.Length>0)products.AddRange(await c.QueryAsync("SELECT "+ProductSelect+" "+ProductFrom+" WHERE p.id=ANY(@included) AND (@manager OR ("+Visible+"))",new{included,manager},tx));
            var ids=products.Select(x=>(Guid)x.id).ToArray();
            var prices=await c.QueryAsync("SELECT * FROM prices WHERE product_id=ANY(@ids) AND (@manager OR channel='retail')",new{ids,manager},tx);
            var images=await c.QueryAsync("SELECT id,product_id,caption FROM product_images WHERE product_id=ANY(@ids) ORDER BY created_at,id",new{ids},tx);
            await tx.CommitAsync();return Results.Ok(new{products,prices,images,total,page,pageSize});
        });
        app.MapGet("/api/products/variant-options",async(HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();return Results.Ok(new{sizes=await c.QueryAsync<string>("SELECT DISTINCT size_label FROM products WHERE size_label<>'' ORDER BY size_label LIMIT 200"),colors=await c.QueryAsync<string>("SELECT DISTINCT color_label FROM products WHERE color_label<>'' ORDER BY color_label LIMIT 200")});});
        app.MapPost("/api/products/sku-preview",async(ProductRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var id=await SaveProduct(c,tx,null,r with{Sku=""});var sku=await c.ExecuteScalarAsync<string>("SELECT sku FROM products WHERE id=@id",new{id},tx);await tx.RollbackAsync();return Results.Ok(new{sku});});
        app.MapPost("/api/products/batch",async(VariantBatch r,HttpContext ctx,Db db)=>{
            ctx.Manager();Check.That(r.Items is not null && r.Items.Length is >0 and <=100,"Mỗi lần tạo từ 1 đến 100 SKU.");
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var items=new List<object>();
            foreach(var item in r.Items!){Check.That(item.Product is not null,"Thiếu thông tin phiên bản.");var id=await SaveProduct(c,tx,null,item.Product! with{Sku=""});
                if(item.Retail is not null){Check.That(item.Retail.Channel=="retail","Bảng tạo nhanh chỉ nhận giá lẻ.");await SavePrice(c,tx,id,item.Retail with{Version=0});}
                var sku=await c.ExecuteScalarAsync<string>("SELECT sku FROM products WHERE id=@id",new{id},tx);items.Add(new{id,sku});
                await db.Audit(c,tx,ctx.User().Id,"product_created",id,new{sku,batch=true});
            }
            await tx.CommitAsync();return Results.Ok(new{count=items.Count,items});
        });
        app.MapPost("/api/products",async(ProductRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var id=await SaveProduct(c,tx,null,r);await db.Audit(c,tx,ctx.User().Id,"product_created",id);await tx.CommitAsync();return Results.Ok(new{id});});
        app.MapPut("/api/products/{id:guid}",async(Guid id,ProductRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await SaveProduct(c,tx,id,r);await db.Audit(c,tx,ctx.User().Id,"product_updated",id);await tx.CommitAsync();return Results.NoContent();});
        app.MapPut("/api/products/{id:guid}/prices",async(Guid id,PriceRequest r,HttpContext ctx,Db db)=>{ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await SavePrice(c,tx,id,r);await db.Audit(c,tx,ctx.User().Id,"price_updated",id,r);await tx.CommitAsync();return Results.NoContent();});
        app.MapDelete("/api/products/{id:guid}",async(Guid id,int version,HttpContext ctx,Db db,ObjectStorage store)=>{
            ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();
            var product=await c.QuerySingleOrDefaultAsync("SELECT sku,name,version FROM products WHERE id=@id FOR UPDATE",new{id},tx);
            Check.That(product is not null,"Không tìm thấy SKU.",404);Check.That((int)product!.version==version,"SKU đã thay đổi. Hãy tải lại trước khi xóa.",409);
            var used=await c.ExecuteScalarAsync<bool>("SELECT EXISTS(SELECT 1 FROM order_lines WHERE product_id=@id) OR EXISTS(SELECT 1 FROM quote_lines WHERE product_id=@id)",new{id},tx);
            Check.That(!used,"SKU đã có trong báo giá hoặc đơn hàng nên không thể xóa. Hãy vào Sửa và tắt hiển thị cho CTV để giữ lịch sử chứng từ.",409);
            var keys=(await c.QueryAsync<string>("SELECT object_key FROM product_images WHERE product_id=@id",new{id},tx)).ToList();
            await c.ExecuteAsync("DELETE FROM product_images WHERE product_id=@id",new{id},tx);
            await c.ExecuteAsync("DELETE FROM prices WHERE product_id=@id",new{id},tx);
            await c.ExecuteAsync("DELETE FROM products WHERE id=@id",new{id},tx);
            await db.Audit(c,tx,ctx.User().Id,"product_deleted",id,new{sku=(string)product.sku,name=(string)product.name,images=keys.Count});await tx.CommitAsync();
            var pending=new List<string>();foreach(var key in keys){try{await store.Delete(key);}catch(Exception){pending.Add(key);}}
            if(pending.Count>0)await db.Audit(c,null,ctx.User().Id,"product_image_cleanup_pending",id,new{keys=pending});
            return Results.Ok(new{message=pending.Count==0?"Đã xóa SKU cùng bảng giá và ảnh.":"Đã xóa SKU; có ảnh trong kho lưu trữ chưa dọn được. Quản lý có thể kiểm tra nhật ký.",pendingImages=pending.Count});
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
            await using var c = await db.Open(); var key = await c.ExecuteScalarAsync<string>("SELECT i.object_key FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_models m ON m.id=p.model_id JOIN product_categories cat ON cat.id=m.category_id LEFT JOIN scents s ON s.id=p.scent_id WHERE i.id=@id AND (@manager OR (p.active AND m.active AND cat.active AND (p.scent_id IS NULL OR s.active)))", new { id, manager = ctx.User().Manager }); Check.That(key is not null, "Không tìm thấy ảnh.", 404);
            return Results.File(await store.Get(key!), key!.EndsWith(".jpg") ? "image/jpeg" : key.EndsWith(".png") ? "image/png" : "image/webp");
        });
        app.MapDelete("/api/images/{id:guid}", async (Guid id, HttpContext ctx, Db db, ObjectStorage store) =>
        {
            ctx.Manager(); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var key = await c.ExecuteScalarAsync<string>("SELECT object_key FROM product_images WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(key is not null, "Không tìm thấy ảnh.", 404); await store.Delete(key!); await c.ExecuteAsync("DELETE FROM product_images WHERE id=@id", new { id }, tx); await db.Audit(c, tx, ctx.User().Id, "image_deleted", id); await tx.CommitAsync(); return Results.NoContent();
        });
    }
    public static async Task<Guid> SaveProduct(NpgsqlConnection c,NpgsqlTransaction tx,Guid? existing,ProductRequest r){
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352025)",transaction:tx);
        var sku=Check.Text(r.Sku,50,existing is not null).ToUpperInvariant();var color=Check.Text(r.ColorLabel,80);var size=Check.Text(r.SizeLabel,100,true);var unit=Check.Text(r.Unit,30,true);var description=Check.Text(r.Description,5000);
        Check.That(r.LeadDaysMin>=0&&r.LeadDaysMax>=r.LeadDaysMin&&r.LeadDaysMax<=365,"Thời gian chuẩn bị 0–365 ngày; số tối đa không nhỏ hơn tối thiểu.");
        var model=await c.QuerySingleOrDefaultAsync("SELECT m.name,m.code,cat.name AS category FROM product_models m JOIN product_categories cat ON cat.id=m.category_id WHERE m.id=@ModelId AND m.active AND cat.active FOR SHARE OF m,cat",new{r.ModelId},tx);Check.That(model is not null,"Chọn mẫu sản phẩm và nhóm đang sử dụng.");
        string scent="";if(r.ScentId is not null){scent=await c.ExecuteScalarAsync<string>("SELECT name FROM scents WHERE id=@ScentId AND active",new{r.ScentId},tx)??"";Check.That(scent!="","Mùi hương không hợp lệ hoặc đã ngừng sử dụng.");}
        var name=Check.Text(string.Join(" · ",new[]{(string)model!.name,scent,size,color}.Where(x=>x!="").Distinct()),180,true);var id=existing??Guid.NewGuid();
        if(sku.Length==0){
            var stem=VariantCodes.Build((string)model!.code,scent,size,color);sku=stem;var suffix=1;
            while(await c.ExecuteScalarAsync<bool>("SELECT EXISTS(SELECT 1 FROM products WHERE lower(btrim(sku))=lower(@sku))",new{sku},tx)){
                suffix++;var tail="-"+suffix;sku=stem[..Math.Min(stem.Length,50-tail.Length)]+tail;
            }
        }
        Check.That(!await c.ExecuteScalarAsync<bool>("SELECT EXISTS(SELECT 1 FROM products WHERE id<>@id AND lower(btrim(sku))=lower(@sku))",new{id,sku},tx),"SKU đã tồn tại.",409);
        Check.That(!await c.ExecuteScalarAsync<bool>("SELECT EXISTS(SELECT 1 FROM products WHERE id<>@id AND model_id=@ModelId AND scent_id IS NOT DISTINCT FROM @ScentId::uuid AND lower(btrim(size_label))=lower(@size) AND lower(btrim(color_label))=lower(@color))",new{id,r.ModelId,r.ScentId,size,color},tx),"Mẫu, mùi, size và màu này đã có SKU.",409);
        var args=new{id,sku,name,r.ModelId,r.ScentId,description,unit,r.Active,r.Version,size,color,category=(string)model.category,r.LeadDaysMin,r.LeadDaysMax};
        if(existing is null)await c.ExecuteAsync("INSERT INTO products(id,sku,name,model_id,scent_id,size_label,color_label,description,unit,active,category,lead_days_min,lead_days_max) VALUES(@id,@sku,@name,@ModelId,@ScentId,@size,@color,@description,@unit,@Active,@category,@LeadDaysMin,@LeadDaysMax)",args,tx);
        else Check.That(await c.ExecuteAsync("UPDATE products SET sku=@sku,name=@name,model_id=@ModelId,scent_id=@ScentId,size_label=@size,color_label=@color,description=@description,unit=@unit,active=@Active,category=@category,lead_days_min=@LeadDaysMin,lead_days_max=@LeadDaysMax,version=version+1 WHERE id=@id AND version=@Version",args,tx)==1,"SKU đã thay đổi. Hãy tải lại.",409);
        return id;
    }
    public static async Task SavePrice(NpgsqlConnection c,NpgsqlTransaction tx,Guid id,PriceRequest r){
        Check.That(new[]{"retail","wholesale","b2b"}.Contains(r.Channel),"Kênh giá không hợp lệ.");
        Check.That(r.UnitPrice is >0 and <=1000000000&&decimal.Truncate(r.UnitPrice)==r.UnitPrice&&r.CommissionRate is >=0 and <=100&&decimal.Round(r.CommissionRate,2)==r.CommissionRate&&r.MinQty is >0 and <=100000,"Giá, MOQ hoặc hoa hồng không hợp lệ.");
        Check.That(await c.ExecuteScalarAsync<Guid?>("SELECT id FROM products WHERE id=@id FOR UPDATE",new{id},tx)is not null,"Không tìm thấy SKU.",404);
        var version=await c.ExecuteScalarAsync<int?>("SELECT version FROM prices WHERE product_id=@id AND channel=@Channel",new{id,r.Channel},tx);
        Check.That((version??0)==r.Version,"Giá đã thay đổi. Hãy tải lại.",409);
        await c.ExecuteAsync("INSERT INTO prices(id,product_id,channel,unit_price,commission_rate,min_qty) VALUES(@pid,@id,@Channel,@UnitPrice,@CommissionRate,@MinQty) ON CONFLICT(product_id,channel) DO UPDATE SET unit_price=excluded.unit_price,commission_rate=excluded.commission_rate,min_qty=excluded.min_qty,updated_at=now(),version=prices.version+1",new{pid=Guid.NewGuid(),id,r.Channel,r.UnitPrice,r.CommissionRate,r.MinQty},tx);
    }
}
public record ProductRequest(string Sku,Guid ModelId,string SizeLabel,Guid? ScentId=null,string Description="",string Unit="lọ",bool Active=true,int Version=0,int LeadDaysMin=7,int LeadDaysMax=10,string ColorLabel="");
public record PriceRequest(string Channel,decimal UnitPrice,decimal CommissionRate,int MinQty,int Version=0);

public record VariantBatch(VariantBatchItem[] Items);
public record VariantBatchItem(ProductRequest Product,PriceRequest? Retail=null);
