using System.Globalization;
using System.Text.Json;
using Dapper;
using Npgsql;
namespace Amora;
public static class Transfers
{
    static readonly Dictionary<string,string[]> Columns=new(){
        ["product-categories"]=["code","name","sort_order","active","id","version"],
        ["customer-groups"]=["code","name","sort_order","active","id","version"],
        ["scents"]=["name","meaning","top_notes","middle_notes","base_notes","ritual","active","id","version"],
        ["models"]=["code","name","category_code","description","active","id","version"],
        ["products"]=["sku","model_code","scent_name","size_label","unit","description","lead_days_min","lead_days_max","active","id","version"],
        ["prices"]=["sku","channel","unit_price","min_qty","commission_rate","version"],
        ["customers"]=["name","phone","email","group_code","company","address","note","id","version"],
        ["users"]=["name","email","role","active","id","version"]
    };
    static readonly Dictionary<string,string> Labels=new(){["code"]="Mã",["name"]="Tên",["sort_order"]="Thứ tự",["active"]="Sử dụng",["id"]="ID",["version"]="Phiên bản",["meaning"]="Ý nghĩa",["top_notes"]="Hương đầu",["middle_notes"]="Hương giữa",["base_notes"]="Hương cuối",["ritual"]="Vai trò ritual",["category_code"]="Mã nhóm sản phẩm",["description"]="Mô tả",["sku"]="SKU",["model_code"]="Mã mẫu",["scent_name"]="Tên mùi",["size_label"]="Size / quy cách",["unit"]="Đơn vị",["lead_days_min"]="Số ngày tối thiểu",["lead_days_max"]="Số ngày tối đa",["channel"]="Kênh giá",["unit_price"]="Đơn giá",["min_qty"]="MOQ",["commission_rate"]="Hoa hồng %",["phone"]="Điện thoại",["email"]="Email",["group_code"]="Mã nhóm khách",["company"]="Công ty",["address"]="Địa chỉ",["note"]="Ghi chú",["role"]="Vai trò"};
    static void Access(string kind,HttpContext ctx){Check.That(Columns.ContainsKey(kind),"Loại danh sách không hợp lệ.",404);if(kind!="customers" && kind!="products" && kind!="prices")ctx.Manager();}
    public static void MapTransfers(this WebApplication app){
        app.MapGet("/api/transfers/{kind}/template",(string kind,HttpContext ctx)=>{Access(kind,ctx);if(kind!="customers")ctx.Manager();return Results.File(Workbook.Write(new[]{Columns[kind].Select(x=>Labels[x]).ToArray()}),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",$"amora-mau-{kind}.xlsx");});
        app.MapGet("/api/transfers/{kind}/export",async(string kind,HttpContext ctx,Db db)=>{
            Access(kind,ctx);await using var c=await db.Open();var manager=ctx.User().Manager;var uid=ctx.User().Id;var search="%"+Check.Text(ctx.Request.Query["search"],180).Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")+"%";
            var category=Check.Text(ctx.Request.Query["category"],40);var group=Check.Text(ctx.Request.Query["group"],40);var status=Check.Text(ctx.Request.Query["status"],16);var role=Check.Text(ctx.Request.Query["role"],16);
            string sql=kind switch{
                "products"=>"SELECT p.*,m.code AS model_code,s.name AS scent_name "+Catalogue.ProductFrom+" WHERE (@manager OR ("+Catalogue.Visible+")) AND (@category='' OR cat.code=@category) AND (@status='' OR (@status='active' AND p.active) OR (@status='inactive' AND NOT p.active)) AND (p.name ILIKE @search OR p.sku ILIKE @search OR m.name ILIKE @search OR p.size_label ILIKE @search OR s.name ILIKE @search) ORDER BY p.sku",
                "prices"=>"SELECT pr.*,p.sku FROM prices pr JOIN products p ON p.id=pr.product_id JOIN product_models m ON m.id=p.model_id JOIN product_categories cat ON cat.id=m.category_id LEFT JOIN scents s ON s.id=p.scent_id WHERE (@manager OR (pr.channel='retail' AND "+Catalogue.Visible+")) AND (@category='' OR cat.code=@category) AND (p.name ILIKE @search OR p.sku ILIKE @search OR m.name ILIKE @search OR p.size_label ILIKE @search) ORDER BY p.sku,pr.channel",
                "customers"=>"SELECT c.*,g.code AS group_code FROM customers c JOIN customer_groups g ON g.id=c.group_id WHERE (@manager OR c.owner_id=@uid) AND (@group='' OR g.code=@group) AND (c.name ILIKE @search OR c.phone ILIKE @search OR c.email ILIKE @search OR c.company ILIKE @search) ORDER BY c.name,c.id",
                "users"=>"SELECT id,name,email,role,active,version FROM users WHERE (name ILIKE @search OR email ILIKE @search) AND (@role='' OR role=@role) AND (@status='' OR (@status='active' AND active) OR (@status='inactive' AND NOT active)) ORDER BY name,id",
                "models"=>"SELECT m.*,c.code AS category_code FROM product_models m JOIN product_categories c ON c.id=m.category_id ORDER BY m.code",
                _=>"SELECT * FROM "+Directories.Tables[kind]+" ORDER BY name"
            };
            var rows=(await c.QueryAsync(sql+" LIMIT 20001",new{manager,uid,search,category,group,status,role})).ToList();Check.That(rows.Count<=20000,"Có hơn 20.000 dòng. Thu hẹp bộ lọc trước khi xuất.");
            var columns=Columns[kind];var output=new List<string[]>{columns.Select(x=>Labels[x]).ToArray()};foreach(IDictionary<string,object> row in rows)output.Add(columns.Select(key=>Convert.ToString(row.TryGetValue(key,out var value)?value:null,CultureInfo.InvariantCulture)??"").ToArray());
            return Results.File(Workbook.Write(output),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",$"amora-{kind}-{DateTime.UtcNow:yyyyMMdd}.xlsx");
        });
        app.MapPost("/api/transfers/{kind}/preview",async(string kind,HttpContext ctx,Db db)=>{
            Access(kind,ctx);if(kind!="customers")ctx.Manager();Check.That(ctx.Request.HasFormContentType,"Cần chọn file Excel.");var form=await ctx.Request.ReadFormAsync();var file=form.Files.GetFile("file");Check.That(file is not null&&file.Length is >0 and <=5*1024*1024,"File tối đa 5 MB.");var mode=form["mode"].ToString();Check.That(mode is "create" or "update","Chọn thêm mới hoặc cập nhật.");
            using var ms=new MemoryStream();await file!.CopyToAsync(ms);List<string[]> sheet;try{sheet=Workbook.Read(ms.ToArray(),file.FileName);}catch(AppError){throw;}catch(Exception){throw new AppError(400,"Không đọc được file Excel. Hãy dùng file mẫu và kiểm tra định dạng.");}
            Check.That(sheet.Count>1,"File chưa có dòng dữ liệu.");var keys=sheet[0].Select(h=>Columns[kind].FirstOrDefault(k=>string.Equals(k,h.Trim(),StringComparison.OrdinalIgnoreCase)||Labels[k].Equals(h.Trim(),StringComparison.OrdinalIgnoreCase))??"").ToArray();Check.That(keys.Where(x=>x!="").Distinct().Count()==keys.Count(x=>x!=""),"File có cột trùng.");Check.That(keys.Any(x=>x!=""),"Không nhận diện được tiêu đề; tải file mẫu.");
            Check.That(kind!="users"||sheet.Count<=101,"Mỗi lần nhập tối đa 100 tài khoản.");
            var rows=sheet.Skip(1).Select(cells=>keys.Select((k,i)=>(k,value:i<cells.Length?cells[i].Trim():"")).Where(x=>x.k!="").ToDictionary(x=>x.k,x=>x.value)).ToList();
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var results=await Apply(c,tx,kind,mode,rows,ctx,true);await tx.RollbackAsync();
            var batch=Guid.NewGuid();var valid=results.All(x=>x.Error=="");
            if(valid)await c.ExecuteAsync("INSERT INTO import_batches(id,actor_id,kind,mode,payload) VALUES(@batch,@actor,@kind,@mode,CAST(@payload AS jsonb))",new{batch,actor=ctx.User().Id,kind,mode,payload=JsonSerializer.Serialize(rows)});
            return Results.Ok(new{id=valid?(Guid?)batch:null,valid,rows=results,columns=Columns[kind].Select(x=>Labels[x]),expiresInMinutes=30});
        });
        app.MapPost("/api/transfers/{kind}/{id:guid}/commit",async(string kind,Guid id,HttpContext ctx,Db db)=>{
            Access(kind,ctx);if(kind!="customers")ctx.Manager();await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352022)",transaction:tx);
            var batch=await c.QuerySingleOrDefaultAsync("SELECT * FROM import_batches WHERE id=@id AND actor_id=@actor AND kind=@kind FOR UPDATE",new{id,actor=ctx.User().Id,kind},tx);Check.That(batch is not null,"Không tìm thấy đợt nhập.",404);Check.That((string)batch!.status=="preview"&&(DateTime)batch.expires_at>DateTime.UtcNow,"Đợt nhập đã hoàn tất hoặc hết hạn; xem trước lại.",409);
            var rows=JsonSerializer.Deserialize<List<Dictionary<string,string>>>((string)batch.payload)!;var results=await Apply(c,tx,kind,(string)batch.mode,rows,ctx,false);Check.That(results.All(x=>x.Error==""),"Dữ liệu đã thay đổi hoặc có dòng lỗi. Toàn bộ đợt chưa được nhập; hãy xem trước lại.",409);
            await c.ExecuteAsync("UPDATE import_batches SET status='committed',committed_at=now(),payload='[]'::jsonb WHERE id=@id",new{id},tx);await db.Audit(c,tx,ctx.User().Id,"import_committed",id,new{kind,count=rows.Count});await tx.CommitAsync();return Results.Ok(new{count=rows.Count,temporaryAccounts=results.Where(x=>x.TemporaryPassword!="").Select(x=>new{email=x.Key,password=x.TemporaryPassword})});
        });
    }
    static string Get(Dictionary<string,string> r,string key,string fallback="")=>r.TryGetValue(key,out var v)&&v!=""?v:fallback;
    static int Int(Dictionary<string,string> r,string k,int fallback=0){var s=Get(r,k);if(s=="")return fallback;Check.That(int.TryParse(s,NumberStyles.Integer,CultureInfo.InvariantCulture,out var n),$"{Labels[k]} phải là số nguyên.");return n;}
    static decimal Dec(Dictionary<string,string> r,string k){Check.That(decimal.TryParse(Get(r,k),NumberStyles.AllowDecimalPoint|NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out var n),$"{Labels[k]} phải là số, dấu chấm thập phân, không phân cách hàng nghìn.");return n;}
    static bool Active(Dictionary<string,string> r){var s=Get(r,"active","true").ToLowerInvariant();Check.That(new[]{"true","false","1","0","có","không"}.Contains(s),"Sử dụng: true/false, 1/0 hoặc Có/Không.");return s is "true" or "1" or "có";}
    static async Task<Guid> Lookup(NpgsqlConnection c,NpgsqlTransaction tx,string table,string key,string value){var id=await c.ExecuteScalarAsync<Guid?>($"SELECT id FROM {table} WHERE lower({key})=lower(@value) AND active",new{value},tx);Check.That(id is not null,$"Không tìm thấy {value} đang sử dụng.");return id!.Value;}
    static async Task<List<ImportRow>> Apply(NpgsqlConnection c,NpgsqlTransaction tx,string kind,string mode,List<Dictionary<string,string>> rows,HttpContext ctx,bool preview){
        var results=new List<ImportRow>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);int number=1;
        foreach(var row in rows){number++;var key=kind=="products"||kind=="prices"?Get(row,"sku")+(kind=="prices"?"/"+Get(row,"channel"):""):kind=="users"?Get(row,"email"):kind=="customers"?Get(row,"id",number.ToString()):Get(row,"code",Get(row,"name"));
            string error="",warning="",password="";await c.ExecuteAsync("SAVEPOINT import_row",transaction:tx);
            try{
                Check.That(seen.Add(key),"Khóa nhận diện bị trùng trong file.");Guid? id=null;
                if(mode=="update"&&kind!="prices"){Check.That(Guid.TryParse(Get(row,"id"),out var parsed),"Cập nhật cần ID từ file xuất.");id=parsed;Check.That(Int(row,"version")>0,"Cập nhật cần Phiên bản từ file xuất.");}
                if(mode=="update"){
                    string existingSql=kind switch{
                        "products"=>"SELECT p.*,m.code AS model_code,s.name AS scent_name FROM products p JOIN product_models m ON m.id=p.model_id LEFT JOIN scents s ON s.id=p.scent_id WHERE p.id=@id",
                        "models"=>"SELECT m.*,cat.code AS category_code FROM product_models m JOIN product_categories cat ON cat.id=m.category_id WHERE m.id=@id",
                        "customers"=>"SELECT c.*,g.code AS group_code FROM customers c JOIN customer_groups g ON g.id=c.group_id WHERE c.id=@id AND (@manager OR c.owner_id=@uid)",
                        "users"=>"SELECT id,name,email,role,active,version FROM users WHERE id=@id",
                        "prices"=>"SELECT pr.*,p.sku FROM prices pr JOIN products p ON p.id=pr.product_id WHERE lower(p.sku)=lower(@sku) AND pr.channel=@channel",
                        _=>"SELECT * FROM "+Directories.Tables[kind]+" WHERE id=@id"
                    };
                    var before=await c.QuerySingleOrDefaultAsync(existingSql,new{id,manager=ctx.User().Manager,uid=ctx.User().Id,sku=Get(row,"sku"),channel=Get(row,"channel")},tx);
                    Check.That(before is not null,"Không tìm thấy bản ghi thuộc quyền cập nhật.");var prior=(IDictionary<string,object>)before!;
                    foreach(var keyName in Columns[kind]){
                        if(keyName is "id" or "version")continue;
                        if(row.TryGetValue("_clear_"+keyName,out var clear)&&clear=="1")row[keyName]="";
                        else if(Get(row,keyName)==""&&prior.TryGetValue(keyName,out var priorValue))row[keyName]=Convert.ToString(priorValue,CultureInfo.InvariantCulture)??"";
                        else if(Get(row,keyName)=="[XÓA]"){Check.That(new[]{"phone","email","company","address","note","description","scent_name","meaning","top_notes","middle_notes","base_notes","ritual"}.Contains(keyName),"Trường "+Labels[keyName]+" không được để trống.");row[keyName]="";row["_clear_"+keyName]="1";}
                    }
                }
                var version=Int(row,"version");var active=Active(row);
                if(Directories.Tables.ContainsKey(kind))await Directories.Save(c,tx,kind,id,new(Get(row,"name"),Get(row,"code"),Int(row,"sort_order"),active,version,Get(row,"meaning"),Get(row,"top_notes"),Get(row,"middle_notes"),Get(row,"base_notes"),Get(row,"ritual")));
                else if(kind=="models"){var category=await Lookup(c,tx,"product_categories","code",Get(row,"category_code"));await Directories.SaveModel(c,tx,id,new(Get(row,"code"),Get(row,"name"),category,Get(row,"description"),active,version));}
                else if(kind=="products"){
                    var model=await Lookup(c,tx,"product_models","code",Get(row,"model_code"));Guid? scent=Get(row,"scent_name")==""?null:await Lookup(c,tx,"scents","name",Get(row,"scent_name"));
                    await Catalogue.SaveProduct(c,tx,id,new(Get(row,"sku"),model,Get(row,"size_label"),scent,Get(row,"description"),Get(row,"unit","lọ"),active,version,Int(row,"lead_days_min",7),Int(row,"lead_days_max",10)));
                }else if(kind=="prices"){
                    var product=await Lookup(c,tx,"products","sku",Get(row,"sku"));var existing=await c.ExecuteScalarAsync<int?>("SELECT version FROM prices WHERE product_id=@product AND channel=@channel",new{product,channel=Get(row,"channel")},tx);
                    Check.That(mode=="create"?existing is null:existing is not null,"Chế độ nhập không khớp giá đã có/chưa có.");await Catalogue.SavePrice(c,tx,product,new(Get(row,"channel"),Dec(row,"unit_price"),Dec(row,"commission_rate"),Int(row,"min_qty",1),mode=="create"?0:version));
                }else if(kind=="customers"){
                    var group=await Lookup(c,tx,"customer_groups","code",Get(row,"group_code","UNCLASSIFIED"));var phone=Get(row,"phone");
                    var duplicate=phone!=""&&await c.ExecuteScalarAsync<int>("SELECT count(*) FROM customers WHERE phone<>'' AND amora_phone(phone)=amora_phone(@phone) AND owner_id=@owner AND (@id::uuid IS NULL OR id<>@id)",new{phone,owner=ctx.User().Id,id},tx)>0;if(duplicate)warning="Trùng điện thoại trong danh sách của bạn; kiểm tra trước khi xác nhận.";
                    await Customers.Save(c,tx,id,new(Get(row,"name"),phone,Get(row,"email"),Get(row,"address"),Get(row,"company"),version,group,Get(row,"note")),ctx);
                }else if(kind=="users"){
                    var email=Check.Text(Get(row,"email"),200,true).ToLowerInvariant();Check.That(System.Net.Mail.MailAddress.TryCreate(email,out var parsed)&&parsed.Address==email,"Email không hợp lệ.");var name=Check.Text(Get(row,"name"),120,true);var role=Get(row,"role","ctv");Check.That(role is "ctv" or "manager","Vai trò dùng ctv hoặc manager.");
                    await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352020)",transaction:tx);
                    if(id is null){var limit=await c.ExecuteScalarAsync<int>("SELECT (value->>@key)::int FROM settings WHERE key='account_limits'",new{key=role=="ctv"?"ctvs":"managers"},tx);Check.That(!active||await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE active AND role=@role",new{role},tx)<limit,"Đạt giới hạn tài khoản hoạt động.");password=preview?"":"Amora-"+Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(12))+"!";await c.ExecuteAsync("INSERT INTO users(id,name,email,role,active,password_hash) VALUES(@id,@name,@email,@role,@active,@hash)",new{id=Guid.NewGuid(),name,email,role,active,hash=preview?"preview-only-not-committed":Auth.Hash(password)},tx);}
                    else {var old=await c.QuerySingleOrDefaultAsync("SELECT role,active,version FROM users WHERE id=@id FOR UPDATE",new{id},tx);Check.That(old is not null&&(int)old.version==version,"Tài khoản đã thay đổi.",409);Check.That((string)old!.role==role,"Không đổi vai trò qua nhập file.");Check.That(id!=ctx.User().Id||active,"Không tự khóa tài khoản.");if(!active&&(bool)old.active&&role=="manager")Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE active AND role='manager'",transaction:tx)>1,"Phải giữ một quản lý hoạt động.");if(active&&!(bool)old.active){var lim=await c.ExecuteScalarAsync<int>("SELECT (value->>@key)::int FROM settings WHERE key='account_limits'",new{key=role=="ctv"?"ctvs":"managers"},tx);Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE active AND role=@role",new{role},tx)<lim,"Đạt giới hạn tài khoản.");}await c.ExecuteAsync("UPDATE users SET name=@name,email=@email,active=@active,version=version+1 WHERE id=@id",new{id,name,email,active},tx);if(!active)await c.ExecuteAsync("DELETE FROM sessions WHERE user_id=@id",new{id},tx);}
                }
                await c.ExecuteAsync("RELEASE SAVEPOINT import_row",transaction:tx);
            }catch(Exception e)when(e is AppError or PostgresException){await c.ExecuteAsync("ROLLBACK TO SAVEPOINT import_row",transaction:tx);await c.ExecuteAsync("RELEASE SAVEPOINT import_row",transaction:tx);error=e is AppError?e.Message:"Dữ liệu trùng hoặc vi phạm ràng buộc; kiểm tra ID, SKU, mã nhóm và phiên bản.";}
            results.Add(new(number,key,mode=="create"?"Thêm mới":"Cập nhật",error,warning,password));
        }return results;
    }
}
public record ImportRow(int Row,string Key,string Action,string Error,string Warning,string TemporaryPassword);
