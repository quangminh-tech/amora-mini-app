using Dapper;
using Npgsql;
namespace Amora;
public static class Customers
{
    public static void MapCustomers(this WebApplication app){
        app.MapGet("/api/customers",async(HttpContext ctx,Db db)=>await Listing.Page(ctx,db,"t.*,u.name AS owner_name,g.code AS group_code,g.name AS group_name","FROM customers t JOIN users u ON u.id=t.owner_id JOIN customer_groups g ON g.id=t.group_id","(@manager OR t.owner_id=@uid) AND (@owner IS NULL OR t.owner_id=@owner) AND (@group='' OR g.code=@group) AND (t.name ILIKE @search OR t.phone ILIKE @search OR t.email ILIKE @search OR t.company ILIKE @search)","t.created_at DESC,t.id DESC",new{group=Check.Text(ctx.Request.Query["group"],40)}));
        app.MapGet("/api/customers/duplicates",async(HttpContext ctx,Db db)=>{
            var phone=Check.Text(ctx.Request.Query["phone"],40);await using var c=await db.Open();
            var matches=await c.QueryAsync("SELECT id,name,phone FROM customers WHERE phone<>'' AND amora_phone(phone)=amora_phone(@phone) AND (@manager OR owner_id=@uid) LIMIT 10",new{phone,manager=ctx.User().Manager,uid=ctx.User().Id});return Results.Ok(matches);
        });
        app.MapPost("/api/customers",async(CustomerRequest r,HttpContext ctx,Db db)=>{await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();var id=await Save(c,tx,null,r,ctx);await db.Audit(c,tx,ctx.User().Id,"customer_created",id);await tx.CommitAsync();return Results.Ok(new{id});});
        app.MapPut("/api/customers/{id:guid}",async(Guid id,CustomerRequest r,HttpContext ctx,Db db)=>{await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();await Save(c,tx,id,r,ctx);await db.Audit(c,tx,ctx.User().Id,"customer_updated",id);await tx.CommitAsync();return Results.NoContent();});
    }
    public static async Task<Guid> Save(NpgsqlConnection c,NpgsqlTransaction tx,Guid? existing,CustomerRequest r,HttpContext ctx){
        var name=Check.Text(r.Name,180,true);var phone=Check.Text(r.Phone,40);var email=Check.Text(r.Email,200).ToLowerInvariant();var address=Check.Text(r.Address,1000);var company=Check.Text(r.Company,300);var note=Check.Text(r.Note,1000);
        Check.That(email==""||System.Net.Mail.MailAddress.TryCreate(email,out var mail)&&mail.Address==email,"Email không hợp lệ.");
        var group=r.GroupId??Guid.Parse("00000000-0000-0000-0000-000000000001");
        Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM customer_groups WHERE id=@group AND active",new{group},tx)==1,"Nhóm khách không hợp lệ hoặc ngừng sử dụng.");
        var owner=ctx.User().Id;
        if(existing is not null){var old=await c.QuerySingleOrDefaultAsync("SELECT owner_id,version FROM customers WHERE id=@id FOR UPDATE",new{id=existing},tx);Check.That(old is not null,"Không tìm thấy khách.",404);ctx.Own((Guid)old!.owner_id);owner=(Guid)old.owner_id;Check.That((int)old.version==r.Version,"Khách hàng đã thay đổi. Hãy tải lại.",409);}
        var id=existing??Guid.NewGuid();var args=new{id,owner,name,phone,email,address,company,group,note,r.Version};
        if(existing is null)await c.ExecuteAsync("INSERT INTO customers(id,owner_id,name,phone,email,address,company,group_id,note) VALUES(@id,@owner,@name,@phone,@email,@address,@company,@group,@note)",args,tx);
        else await c.ExecuteAsync("UPDATE customers SET name=@name,phone=@phone,email=@email,address=@address,company=@company,group_id=@group,note=@note,version=version+1,updated_at=now() WHERE id=@id",args,tx);
        return id;
    }
}
public record CustomerRequest(string Name,string Phone="",string Email="",string Address="",string Company="",int Version=0,Guid? GroupId=null,string Note="");
