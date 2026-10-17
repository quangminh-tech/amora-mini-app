using Dapper;
using System.Data;
namespace Amora;

// SQL text is supplied only by endpoint code, never from query-string identifiers.
public static class Listing
{
    public static async Task<IResult> Page(HttpContext ctx, Db db, string select, string from, string where, string order, object? extra = null)
    {
        var q = ctx.Request.Query;
        int Read(string key, int fallback, int max) {
            if (!q.ContainsKey(key)) return fallback;
            Check.That(int.TryParse(q[key],out var n) && n>0 && n<=max, $"{key} không hợp lệ."); return n;
        }
        var page = Read("page",1,1000000); var size = Read("pageSize",25,100);
        var search = Check.Text(q["search"],180);
        Guid? owner=null;
        if (!string.IsNullOrEmpty(q["ownerId"])) { Check.That(Guid.TryParse(q["ownerId"],out var id),"Người phụ trách không hợp lệ."); owner=id; }
        // A CTV cannot widen access by choosing a different owner.
        Check.That(ctx.User().Manager || owner is null || owner==ctx.User().Id,"Không có quyền xem dữ liệu CTV khác.",403);
        var args = new DynamicParameters(extra);
        args.Add("manager",ctx.User().Manager); args.Add("uid",ctx.User().Id); args.Add("owner",owner,DbType.Guid);
        args.Add("search","%"+search.Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")+"%");
        args.Add("status",Check.Text(q["status"],30));
        args.Add("limit",size); args.Add("offset",(page-1)*size);
        await using var c=await db.Open(); await using var tx=await c.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        var total=await c.ExecuteScalarAsync<long>($"SELECT count(*) {from} WHERE {where}",args,tx);
        var items=(await c.QueryAsync($"SELECT {select} {from} WHERE {where} ORDER BY {order} LIMIT @limit OFFSET @offset",args,tx)).ToList();
        await tx.CommitAsync();
        // Legacy array callers are bounded too. All new screens request paged envelopes.
        return q.ContainsKey("page") ? Results.Ok(new { items,total,page,pageSize=size }) : Results.Ok(items);
    }
}
