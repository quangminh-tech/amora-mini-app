using Dapper;
using Npgsql;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Amora;

public static class Documents
{
    static readonly JsonSerializerOptions Json = new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase,PropertyNameCaseInsensitive=true};
    static readonly Regex Token = new(@"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}");
    static readonly string[] SystemKeys=["customer_name","company_name","seller_name","quote_code","quote_date","valid_until"];
    public static DocumentTemplate[] Defaults()=>[
        new("standard","Báo giá thông thường","BẢNG BÁO GIÁ SẢN PHẨM","Kính gửi {{customer_name}},\nCảm ơn Quý khách đã quan tâm đến sản phẩm của {{seller_name}}. Chúng tôi gửi bảng báo giá chi tiết dưới đây.","Điều kiện báo giá","Thông tin thuế, vận chuyển và thời gian giao hàng xác nhận khi chốt đơn.",14,[]),
        new("corporate","Quà tặng doanh nghiệp","BẢNG BÁO GIÁ QUÀ TẶNG DOANH NGHIỆP","Kính gửi {{customer_name}},\nNgười liên hệ: {{contact_person}}\nChân thành cảm ơn Quý khách đã quan tâm đến {{seller_name}}. Căn cứ yêu cầu của Quý khách, chúng tôi gửi bảng báo giá chi tiết dưới đây.","Ghi chú và điều kiện","{{packaging}}\n{{tax_note}}\nThời gian sản xuất: {{production_time}}\nThanh toán: {{payment_terms}}",7,[new("contact_person","Người liên hệ",""),new("packaging","Đóng gói","Quy cách hộp, tag và nhãn theo thỏa thuận trong báo giá."),new("tax_note","Thuế / vận chuyển","Thuế và phí vận chuyển xác nhận theo thực tế; chưa tự cộng vào báo giá."),new("production_time","Thời gian sản xuất","Xác nhận khi chốt đơn."),new("payment_terms","Điều khoản thanh toán","Theo thỏa thuận.")])
    ];
    public static void Validate(DocumentTemplate[]? templates){
        Check.That(templates is {Length:>0 and <=12},"Cần từ 1 đến 12 mẫu chứng từ.");
        var ids=new HashSet<string>();
        foreach(var t in templates!){
            Check.That(t is not null,"Mẫu không hợp lệ.");Check.That(Regex.IsMatch(t!.Id??"","^[a-z][a-z0-9_-]{0,39}$")&&ids.Add(t.Id!),"Mã mẫu phải duy nhất, dùng chữ thường, số, _ hoặc -.");
            Check.That(t.Intro is not null&&t.Terms is not null,"Nội dung mẫu phải là văn bản.");Check.Text(t.Name,120,true);Check.Text(t.Title,180,true);Check.Text(t.Intro,3000);Check.Text(t.TermsTitle,120,true);Check.Text(t.Terms,5000);Check.That(t.ValidDays is >=1 and <=365,"Hiệu lực mẫu từ 1 đến 365 ngày.");
            Check.That(t.Fields is {Length:<=16},"Mỗi mẫu tối đa 16 biến.");var keys=new HashSet<string>(SystemKeys);
            foreach(var field in t.Fields!){Check.That(field is not null,"Biến không hợp lệ.");Check.That(Regex.IsMatch(field!.Key??"","^[a-z][a-z0-9_]{0,39}$")&&keys.Add(field.Key!),"Mã biến không hợp lệ hoặc bị trùng.");Check.Text(field.Label,100,true);Check.Text(field.DefaultValue,1000);}
            foreach(var text in new[]{t.Title,t.Intro,t.TermsTitle,t.Terms}){
                foreach(Match token in Token.Matches(text!))Check.That(keys.Contains(token.Groups[1].Value),"Biến chưa khai báo: "+token.Groups[1].Value);
                Check.That(!Token.Replace(text!,"").Contains("{{")&&!Token.Replace(text!,"").Contains("}}"),"Cú pháp biến cần dạng {{ten_bien}}.");
            }
        }
    }
    public static async Task<(DocumentTemplate[] Templates,int Version)> Read(NpgsqlConnection c,NpgsqlTransaction? tx=null){
        var row=await c.QuerySingleOrDefaultAsync("SELECT value::text AS json,version FROM settings WHERE key='document_templates'",transaction:tx);
        return row is null?(Defaults(),0):(JsonSerializer.Deserialize<DocumentTemplate[]>((string)row.json,Json)!, (int)row.version);
    }
    public static async Task<string> Snapshot(NpgsqlConnection c,NpgsqlTransaction tx,DocumentInput input){
        var (templates,version)=await Read(c,tx);var t=templates.FirstOrDefault(t=>t.Id==input.TemplateId);Check.That(t is not null,"Mẫu chứng từ không còn tồn tại. Chọn lại mẫu.");
        var values=input.Values??new();Check.That(values.Count<=16,"Tối đa 16 biến nhập.");var allowed=t!.Fields.Select(f=>f.Key).ToHashSet();
        foreach(var pair in values){Check.That(allowed.Contains(pair.Key),"Biến nhập không có trong mẫu: "+pair.Key);Check.Text(pair.Value,1000);}
        return JsonSerializer.Serialize(new{template=t,version,values=t.Fields.ToDictionary(f=>f.Key,f=>values.TryGetValue(f.Key,out var v)?v:f.DefaultValue)},Json);
    }
    public static void MapDocuments(this WebApplication app){
        app.MapGet("/api/document-templates",async(Db db)=>{await using var c=await db.Open();var (templates,version)=await Read(c);return Results.Ok(new{format="amora-document-templates-v1",version,templates});});
        app.MapPut("/api/document-templates",async(TemplateUpdate r,HttpContext ctx,Db db)=>{
            ctx.Manager();Validate(r.Templates);await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352026)",transaction:tx);
            var (_,version)=await Read(c,tx);Check.That(version==r.Version,"Mẫu đã được sửa bởi người khác. Tải lại trước khi lưu.",409);
            await c.ExecuteAsync("INSERT INTO settings(key,value,version) VALUES('document_templates',CAST(@value AS jsonb),1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1",new{value=JsonSerializer.Serialize(r.Templates,Json)},tx);
            await db.Audit(c,tx,ctx.User().Id,"document_templates_updated");await tx.CommitAsync();return Results.NoContent();
        });
        app.MapPost("/api/prices/batch",async(BatchPrices r,HttpContext ctx,Db db)=>{
            ctx.Manager();Check.That(r.Items is {Length:>0 and <=150},"Mỗi lần lưu từ 1 đến 150 mức giá.");Check.That(r.Items.All(x=>x is not null && x.Price is not null),"Dòng giá không hợp lệ.");Check.That(r.Items.Select(x=>(x.ProductId,x.Price.Channel)).Distinct().Count()==r.Items.Length,"SKU và kênh giá bị lặp.");
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();
            // All callers lock SKU then price; deterministic order avoids batch deadlocks.
            foreach(var item in r.Items.OrderBy(x=>x.ProductId).ThenBy(x=>x.Price.Channel)){await Catalogue.SavePrice(c,tx,item.ProductId,item.Price);await db.Audit(c,tx,ctx.User().Id,"price_updated",item.ProductId,item.Price);}
            await tx.CommitAsync();return Results.Ok(new{count=r.Items.Length});
        });
        app.MapPost("/api/catalogue/export-data",async(CatalogueInput r,HttpContext ctx,Db db)=>{
            Check.That(r.Ids is {Length:>0 and <=50}&&r.Ids.Distinct().Count()==r.Ids.Length,"Chọn từ 1 đến 50 SKU khác nhau.");Check.That(new[]{"retail","wholesale","b2b"}.Contains(r.Channel),"Kênh giá không hợp lệ.");Check.That(ctx.User().Manager||r.Channel=="retail","CTV chỉ được xuất giá lẻ.",403);
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
            var products=(await c.QueryAsync("SELECT p.id,p.sku,p.name,m.name AS model_name,p.description,p.size_label,p.color_label,p.unit,p.lead_days_min,p.lead_days_max,m.description AS model_description,cat.name AS category_name,s.name AS scent_name,s.top_notes,s.middle_notes,s.base_notes,(SELECT id FROM product_images WHERE product_id=p.id ORDER BY created_at,id LIMIT 1) AS image_id "+Catalogue.ProductFrom+" WHERE p.id=ANY(@ids) AND "+Catalogue.Visible,new{ids=r.Ids},tx)).ToList();
            Check.That(products.Count==r.Ids.Length,"Có SKU bị ẩn, ngừng sử dụng hoặc không còn tồn tại. Bỏ chọn và tải lại danh sách.",409);
            var prices=await c.QueryAsync("SELECT product_id,unit_price,min_qty FROM prices WHERE product_id=ANY(@ids) AND channel=@Channel",new{ids=r.Ids,r.Channel},tx);
            var seller=await c.ExecuteScalarAsync<string>("SELECT jsonb_build_object('name',value->'name','tagline',value->'tagline','phone',value->'phone','email',value->'email','address',value->'address','taxCode',value->'taxCode')::text FROM settings WHERE key='business'",transaction:tx);
            await tx.CommitAsync();return Results.Ok(new{products,prices,seller=JsonSerializer.Deserialize<JsonElement>(seller!),channel=r.Channel});
        });
    }
}
public record TemplateField(string Key,string Label,string DefaultValue="");
public record DocumentTemplate(string Id,string Name,string Title,string Intro,string TermsTitle,string Terms,int ValidDays,TemplateField[] Fields);
public record TemplateUpdate(int Version,DocumentTemplate[] Templates);
public record DocumentInput(string TemplateId,Dictionary<string,string>? Values=null);
public record BatchPriceItem(Guid ProductId,PriceRequest Price);
public record BatchPrices(BatchPriceItem[] Items);
public record CatalogueInput(Guid[] Ids,string Channel="retail");
