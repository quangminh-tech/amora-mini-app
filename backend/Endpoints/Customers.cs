using Dapper;
namespace Amora;

public static class Customers
{
    public static void MapCustomers(this WebApplication app)
    {
        app.MapGet("/api/customers", async (HttpContext ctx, Db db) => { await using var c = await db.Open(); return await c.QueryAsync("SELECT * FROM customers WHERE @manager OR owner_id=@uid ORDER BY created_at DESC", new { manager = ctx.User().Manager, uid = ctx.User().Id }); });
        app.MapPost("/api/customers", async (CustomerRequest r, HttpContext ctx, Db db) =>
        {
            Validate(r); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var id = Guid.NewGuid();
            await c.ExecuteAsync("INSERT INTO customers(id,owner_id,name,phone,email,address,company) VALUES(@id,@uid,@Name,@Phone,@Email,@Address,@Company)", new { id, uid = ctx.User().Id, r.Name, r.Phone, r.Email, r.Address, r.Company }, tx);
            await db.Audit(c, tx, ctx.User().Id, "customer_created", id); await tx.CommitAsync(); return Results.Ok(new { id });
        });
        app.MapPut("/api/customers/{id:guid}", async (Guid id, CustomerRequest r, HttpContext ctx, Db db) =>
        {
            Validate(r); await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            var owner = await c.QuerySingleOrDefaultAsync<Guid?>("SELECT owner_id FROM customers WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(owner is not null, "Không tìm thấy khách hàng.", 404); ctx.Own(owner!.Value);
            await c.ExecuteAsync("UPDATE customers SET name=@Name,phone=@Phone,email=@Email,address=@Address,company=@Company WHERE id=@id", new { id, r.Name, r.Phone, r.Email, r.Address, r.Company }, tx);
            await db.Audit(c, tx, ctx.User().Id, "customer_updated", id); await tx.CommitAsync(); return Results.NoContent();
        });
    }
    static void Validate(CustomerRequest r) { Check.Text(r.Name, 180, true); Check.Text(r.Phone, 40); Check.Text(r.Email, 200); Check.Text(r.Address, 1000); Check.Text(r.Company, 300); }
}
public record CustomerRequest(string Name, string Phone, string Email, string Address, string Company);
