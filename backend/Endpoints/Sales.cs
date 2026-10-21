using System.Text.Json;
using Dapper;
using Npgsql;
namespace Amora;

public static class Sales
{
    static readonly string[] Channels = ["retail", "wholesale", "b2b"];
    public static void MapSales(this WebApplication app)
    {
        foreach (var type in new[] { "orders", "quotes" })
        {
            var table = type; var quote = table == "quotes"; var fk = quote ? "quote_id" : "order_id"; var lines = quote ? "quote_lines" : "order_lines";
            app.MapGet($"/api/{table}", async (HttpContext ctx, Db db) =>
            {
                return await Listing.Page(ctx, db, "t.*,u.name AS owner_name,t.customer_snapshot->>'name' AS customer_name", $"FROM {table} t JOIN users u ON u.id=t.owner_id", "(@manager OR t.owner_id=@uid) AND (@owner IS NULL OR t.owner_id=@owner) AND (@status='' OR t.status=@status) AND (t.code ILIKE @search OR t.customer_snapshot->>'name' ILIKE @search OR u.name ILIKE @search)", "t.created_at DESC,t.id DESC");
            });
            app.MapGet($"/api/{table}/{{id:guid}}", async (Guid id, HttpContext ctx, Db db) =>
            {
                await using var c = await db.Open(); var row = await c.QuerySingleOrDefaultAsync($"SELECT * FROM {table} WHERE id=@id", new { id }); Check.That(row is not null, "Không tìm thấy dữ liệu.", 404); ctx.Own((Guid)row!.owner_id);
                var items = await c.QueryAsync($"SELECT * FROM {lines} WHERE {fk}=@id ORDER BY sku", new { id });
                var events = quote ? Array.Empty<object>() : await c.QueryAsync("SELECT e.*,u.name AS actor_name FROM order_events e JOIN users u ON u.id=e.actor_id WHERE e.order_id=@id ORDER BY e.created_at", new { id });
                var payments = quote ? Array.Empty<object>() : await c.QueryAsync("SELECT p.*,u.name AS actor_name FROM payments p LEFT JOIN users u ON u.id=p.actor_id WHERE p.order_id=@id ORDER BY p.created_at,p.id",new {id});
                var orderId=quote?await c.ExecuteScalarAsync<Guid?>("SELECT id FROM orders WHERE source_quote_id=@id AND (@manager OR owner_id=@uid)",new{id,manager=ctx.User().Manager,uid=ctx.User().Id}):null;
                return Results.Ok(new { record = row, lines = items, events, payments, orderId });
            });
            app.MapPost($"/api/{table}", async (SaleRequest r, HttpContext ctx, Db db) => await Save(null, quote, r, ctx, db));
            app.MapPut($"/api/{table}/{{id:guid}}", async (Guid id, SaleRequest r, HttpContext ctx, Db db) => await Save(id, quote, r, ctx, db));
        }
        app.MapDelete("/api/quotes/{id:guid}", async (Guid id, HttpContext ctx, Db db) =>
        {
            Check.That(int.TryParse(ctx.Request.Query["version"], out var version) && version > 0,
                "Cần phiên bản báo giá hợp lệ. Tải lại danh sách trước khi xóa.");
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var q = await c.QuerySingleOrDefaultAsync("SELECT id,code,owner_id,status,version FROM quotes WHERE id=@id FOR UPDATE", new { id }, tx);
            Check.That(q is not null, "Báo giá không còn tồn tại. Hãy tải lại danh sách.", 404);
            ctx.Own((Guid)q!.owner_id);
            await QuotePolicy(c, tx, ctx);
            Check.That((int)q.version == version, "Báo giá đã thay đổi. Tải lại trước khi xóa.", 409);
            Check.That((string)q.status == "draft", "Chỉ được xóa báo giá đang ở trạng thái bản nháp.", 409);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM orders WHERE source_quote_id=@id", new { id }, tx) == 0,
                "Báo giá đã liên kết với đơn hàng, không được xóa.", 409);
            await c.ExecuteAsync("DELETE FROM quote_lines WHERE quote_id=@id", new { id }, tx);
            await c.ExecuteAsync("DELETE FROM quotes WHERE id=@id", new { id }, tx);
            await db.Audit(c, tx, ctx.User().Id, "quote_draft_deleted", id, new { code=(string)q.code, ownerId=(Guid)q.owner_id });
            await tx.CommitAsync();
            return Results.NoContent();
        });
        app.MapPost("/api/orders/{id:guid}/status", async (Guid id, StatusRequest r, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
            var o = await c.QuerySingleOrDefaultAsync("SELECT * FROM orders WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(o is not null, "Không tìm thấy đơn.", 404); ctx.Own((Guid)o!.owner_id);
            Check.That((int)o.version == r.Version, "Đơn đã thay đổi. Vui lòng tải lại.", 409);
            var current = (string)o.status; var target = r.Status;
            Check.That(ctx.User().Manager || (current == "pending" && target == "cancelled"), "CTV chỉ có thể hủy đơn đang chờ xác nhận.", 403);
            var allowed = current switch { "pending" => new[] { "confirmed", "cancelled" }, "confirmed" => ["shipping", "cancelled"], "shipping" => ["completed", "returned"], "completed" => ["returned"], _ => Array.Empty<string>() };
            Check.That(allowed.Contains(target), "Không thể chuyển trạng thái đơn theo cách này.");
            if (target is "cancelled" or "returned")
            {
                Check.That(!string.IsNullOrWhiteSpace(r.Reason), "Cần nhập lý do hủy hoặc trả hàng.");
                var paidCommission = await c.ExecuteScalarAsync<int>("SELECT count(*) FROM commissions WHERE order_id=@id AND status='paid'", new { id }, tx);
                Check.That(paidCommission == 0, "Hoa hồng đã chi. Cần đối soát và thu hồi khoản chi trước khi xử lý trả hàng.", 409);
                if (target == "cancelled") Check.That((decimal)o.paid == 0, "Cần hoàn tiền và cập nhật đã thu về 0 trước khi hủy đơn.");
                await c.ExecuteAsync("UPDATE commissions SET status='void',version=version+1 WHERE order_id=@id", new { id }, tx);
            }
            await c.ExecuteAsync("UPDATE orders SET status=@target,completed_at=CASE WHEN @target='completed' THEN now() ELSE completed_at END,version=version+1,updated_at=now() WHERE id=@id", new { target, id }, tx);
            await Event(c, tx, id, ctx.User().Id, "status", new { from = current, to = target, reason = Check.Text(r.Reason, 1000) });
            await SyncCommission(c, tx, id); await db.Audit(c, tx, ctx.User().Id, "order_status", id, new { from = current, to = target }); await tx.CommitAsync(); return Results.NoContent();
        });
        // A deliberate manager action: deliver + collect the remaining balance atomically.
        // Keep the detailed shipping/payment flow for deposits and deliveries still in progress.
        app.MapPost("/api/orders/{id:guid}/complete", async (Guid id, VersionRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager();
            await using var c = await db.Open();
            await using var tx = await c.BeginTransactionAsync();
            var o = await c.QuerySingleOrDefaultAsync("SELECT * FROM orders WHERE id=@id FOR UPDATE", new { id }, tx);
            Check.That(o is not null, "Không tìm thấy đơn.", 404);
            // A repeated click after success must never create another receipt or commission.
            if ((string)o!.status == "completed" && (decimal)o.paid == (decimal)o.subtotal + (decimal)o.shipping)
            {
                await tx.CommitAsync();
                return Results.NoContent();
            }
            Check.That((int)o.version == r.Version, "Đơn đã thay đổi. Vui lòng tải lại.", 409);
            Check.That(new[] { "pending", "confirmed", "shipping", "completed" }.Contains((string)o.status), "Không thể hoàn tất đơn đã hủy hoặc trả hàng.", 409);
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM commissions WHERE order_id=@id AND status IN ('approved','paid')", new { id }, tx) == 0, "Hoa hồng đã duyệt/đã chi; cần đối soát trước khi thay đổi.", 409);
            var total = (decimal)o.subtotal + (decimal)o.shipping;
            var delta = total - (decimal)o.paid;
            if (delta > 0)
            {
                var reference = "Hoàn tất & thu đủ đơn " + (string)o.code;
                await c.ExecuteAsync("INSERT INTO payments(id,order_id,actor_id,amount,reference,occurred_at) VALUES(@pid,@id,@actor,@delta,@reference,now())", new { pid=Guid.NewGuid(), id, actor=ctx.User().Id, delta, reference }, tx);
                await Event(c, tx, id, ctx.User().Id, "payment", new { before=(decimal)o.paid, after=total, reference });
            }
            await c.ExecuteAsync("UPDATE orders SET paid=@total,status='completed',completed_at=COALESCE(completed_at,now()),version=version+1,updated_at=now() WHERE id=@id", new { id, total }, tx);
            if ((string)o.status != "completed")
                await Event(c, tx, id, ctx.User().Id, "status", new { from=(string)o.status, to="completed", reason="Quản lý xác nhận đã giao xong và thu đủ tiền" });
            await SyncCommission(c, tx, id);
            await db.Audit(c, tx, ctx.User().Id, "order_completed_and_collected", id, new { previousStatus=(string)o.status, previousPaid=(decimal)o.paid, collected=delta, total });
            await tx.CommitAsync();
            return Results.NoContent();
        });
        app.MapPost("/api/orders/{id:guid}/payment", async (Guid id, PaymentRequest r, HttpContext ctx, Db db) =>
        {
            ctx.Manager(); Check.That(r.Paid >= 0 && decimal.Truncate(r.Paid) == r.Paid, "Số tiền không hợp lệ."); Check.Text(r.Reference, 300, true);
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var o = await c.QuerySingleOrDefaultAsync("SELECT * FROM orders WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(o is not null, "Không tìm thấy đơn.", 404);
            Check.That((int)o!.version == r.Version, "Đơn đã thay đổi. Vui lòng tải lại.", 409); Check.That(!new[] { "cancelled", "returned" }.Contains((string)o.status), "Không thể thay đổi tiền trên đơn đã hủy hoặc trả hàng.");
            Check.That(r.Paid <= (decimal)o.subtotal + (decimal)o.shipping, "Số tiền đã thu vượt tổng giá trị đơn.");
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM commissions WHERE order_id=@id AND status IN ('approved','paid')", new { id }, tx) == 0, "Hoa hồng đã duyệt/đã chi; không thể chỉnh tiền thu.", 409);
            var delta=r.Paid-(decimal)o.paid;
            Check.That(delta!=0,"Số tiền đã thu không thay đổi.");
            var occurred=r.OccurredAt ?? DateTime.UtcNow;
            Check.That(occurred.Kind==DateTimeKind.Utc && occurred<=DateTime.UtcNow.AddMinutes(1) && occurred>=((DateTime)o.created_at).AddMinutes(-1),"Ngày thu tiền phải nằm từ ngày tạo đơn đến hiện tại, có múi giờ UTC.");
            await c.ExecuteAsync("INSERT INTO payments(id,order_id,actor_id,amount,reference,occurred_at) VALUES(@pid,@id,@actor,@delta,@Reference,@occurred)",new {pid=Guid.NewGuid(),id,actor=ctx.User().Id,delta,r.Reference,occurred},tx);
            await c.ExecuteAsync("UPDATE orders SET paid=@Paid,version=version+1,updated_at=now() WHERE id=@id", new { id, r.Paid }, tx);
            await Event(c, tx, id, ctx.User().Id, "payment", new { before = (decimal)o.paid, after = r.Paid, reference = r.Reference }); await SyncCommission(c, tx, id);
            await db.Audit(c, tx, ctx.User().Id, "payment_recorded", id, new { r.Paid, r.Reference }); await tx.CommitAsync(); return Results.NoContent();
        });
        app.MapPost("/api/quotes/{id:guid}/status", async (Guid id, StatusRequest r, HttpContext ctx, Db db) =>
        {
            await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync(); var q = await c.QuerySingleOrDefaultAsync("SELECT * FROM quotes WHERE id=@id FOR UPDATE", new { id }, tx); Check.That(q is not null, "Không tìm thấy báo giá.", 404); ctx.Own((Guid)q!.owner_id);
            await QuotePolicy(c, tx, ctx); Check.That((int)q.version == r.Version, "Báo giá đã thay đổi. Vui lòng tải lại.", 409);
            var allowed = (string)q.status switch { "draft" => new[] { "sent" }, "sent" => new[] { "draft", "accepted", "rejected" }, _ => Array.Empty<string>() };
            Check.That(allowed.Contains(r.Status), "Trạng thái báo giá không hợp lệ.");
            if (r.Status == "accepted") Check.That(Check.Day((object)q.valid_until) >= DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7)), "Báo giá đã hết hạn. Hãy phát hành báo giá mới.");
            await c.ExecuteAsync("UPDATE quotes SET status=@Status,version=version+1,updated_at=now() WHERE id=@id", new { id, r.Status }, tx); await db.Audit(c, tx, ctx.User().Id, "quote_status", id, new { r.Status }); await tx.CommitAsync(); return Results.NoContent();
        });
    }
    public static void MapConversion(this WebApplication app){
        app.MapPost("/api/quotes/{id:guid}/convert",async(Guid id,VersionRequest r,HttpContext ctx,Db db)=>{
            await using var c=await db.Open();await using var tx=await c.BeginTransactionAsync();
            var quote=await c.QuerySingleOrDefaultAsync("SELECT * FROM quotes WHERE id=@id FOR UPDATE",new{id},tx);Check.That(quote is not null,"Không tìm thấy báo giá.",404);ctx.Own((Guid)quote!.owner_id);await QuotePolicy(c,tx,ctx);
            var existing=await c.ExecuteScalarAsync<Guid?>("SELECT id FROM orders WHERE source_quote_id=@id",new{id},tx);
            if(existing is not null){await tx.CommitAsync();return Results.Ok(new{id=existing,alreadyConverted=true});}
            Check.That((int)quote.version==r.Version,"Báo giá đã thay đổi. Hãy tải lại.",409);Check.That((string)quote.status=="accepted","Báo giá phải được chấp nhận trước khi tạo đơn.");Check.That(Check.Day((object)quote.valid_until)>=DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7)),"Báo giá đã hết hạn.");
            Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM quote_lines WHERE quote_id=@id AND commission_rate IS NULL",new{id},tx)==0,"Báo giá cũ chưa có chính sách hoa hồng chốt theo dòng; lập lại báo giá mới.");
            var order=Guid.NewGuid();var code="DH-"+DateTime.UtcNow.AddHours(7).ToString("yyMMdd")+"-"+Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
            var rateSum=await c.ExecuteScalarAsync<decimal>("SELECT COALESCE(sum(round(amount*commission_rate/100,0)),0) FROM quote_lines WHERE quote_id=@id",new{id},tx);
            var role=await c.ExecuteScalarAsync<string>("SELECT role FROM users WHERE id=@owner",new{owner=(Guid)quote.owner_id},tx);
            await c.ExecuteAsync("INSERT INTO orders(id,code,owner_id,customer_id,customer_snapshot,channel,subtotal,shipping,commission_total,note,source_quote_id) SELECT @order,@code,owner_id,customer_id,customer_snapshot,channel,subtotal,shipping,@commission,note,id FROM quotes WHERE id=@id",new{order,code,id,commission=role=="ctv"?rateSum:0},tx);
            await c.ExecuteAsync("INSERT INTO order_lines(id,order_id,product_id,sku,product_name,unit,qty,unit_price,commission_rate,amount,commission,lead_days_min,lead_days_max) SELECT gen_random_uuid(),@order,product_id,sku,product_name,unit,qty,unit_price,commission_rate,amount,round(amount*commission_rate/100,0),lead_days_min,lead_days_max FROM quote_lines WHERE quote_id=@id",new{order,id},tx);
            await c.ExecuteAsync("UPDATE orders SET pricing_snapshot=(SELECT pricing_snapshot FROM quotes WHERE id=@id) WHERE id=@order",new{id,order},tx);
            await Event(c,tx,order,ctx.User().Id,"created",new{sourceQuote=(string)quote.code});await db.Audit(c,tx,ctx.User().Id,"quote_converted",id,new{order});await tx.CommitAsync();return Results.Ok(new{id=order,alreadyConverted=false});
        });
    }
    static async Task<IResult> Save(Guid? existing, bool quote, SaleRequest r, HttpContext ctx, Db db)
    {
        Check.That(Channels.Contains(r.Channel), "Kênh bán không hợp lệ.");
        Check.That(r.Lines is { Count: > 0 and <= 50 } && r.Lines.All(l=>l is not null), "Cần từ 1 đến 50 dòng sản phẩm.");
        Check.That(r.Lines.Select(l => l.ProductId).Distinct().Count() == r.Lines.Count, "Mỗi sản phẩm chỉ được xuất hiện một lần.");
        Check.That(r.Shipping is >= 0 and <= 100000000 && decimal.Truncate(r.Shipping) == r.Shipping, "Phí vận chuyển không hợp lệ."); Check.Text(r.Note, 3000);
        await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
        if (quote) await QuotePolicy(c, tx, ctx);
        var table = quote ? "quotes" : "orders"; var lineTable = quote ? "quote_lines" : "order_lines"; var fk = quote ? "quote_id" : "order_id"; var owner = ctx.User().Id;
        if (existing is not null)
        {
            var old = await c.QuerySingleOrDefaultAsync($"SELECT * FROM {table} WHERE id=@id FOR UPDATE", new { id = existing }, tx); Check.That(old is not null, "Không tìm thấy dữ liệu.", 404); ctx.Own((Guid)old!.owner_id); owner = (Guid)old.owner_id;
            Check.That((int)old.version == r.Version, "Dữ liệu đã thay đổi. Vui lòng tải lại.", 409); Check.That((string)old.status == (quote ? "draft" : "pending"), "Chỉ chỉnh sửa báo giá nháp hoặc đơn đang chờ xác nhận.");
            if (!quote) Check.That((decimal)old.paid == 0, "Đơn đã ghi nhận thanh toán; không thể chỉnh sản phẩm.");
        }
        else if (ctx.User().Manager && r.OwnerId is not null)
        {
            owner = r.OwnerId.Value; Check.That(await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users WHERE id=@owner AND active", new { owner }, tx) == 1, "Tài khoản phụ trách không hợp lệ.");
        }
        var customer = await c.QuerySingleOrDefaultAsync("SELECT id,owner_id,name,phone,email,address,company FROM customers WHERE id=@id", new { id = r.CustomerId }, tx);
        Check.That(customer is not null, "Cần chọn khách hàng hợp lệ."); ctx.Own((Guid)customer!.owner_id);
        var snapshot = JsonSerializer.Serialize(new { name = (string)customer.name, phone = (string)customer.phone, email = (string)customer.email, address = (string)customer.address, company = (string)customer.company });
        var pricing=await QuantityPricing.Calculate(c,tx,r.Lines,r.Channel,ctx.User().Manager);
        Check.That(r.PricingToken is null || r.PricingToken==pricing.Token,"Chính sách giá đã thay đổi. Kiểm tra lại giá mới rồi lưu.",409);
        Check.That(pricing.Valid,string.Join(" ",pricing.Lines.Where(l=>l.Error is not null).Select(l=>l.Error).Distinct()));
        var built=pricing.Lines.Select(l=>new BuiltLine(Guid.NewGuid(),l.ProductId,l.Sku,l.ProductName,l.Unit,l.Qty,l.UnitPrice!.Value,l.CommissionRate,l.Amount,l.Commission,l.LeadDaysMin,l.LeadDaysMax)).ToList();
        var subtotal = built.Sum(l => l.Amount); Check.That(subtotal + r.Shipping <= 99999999999999m, "Giá trị chứng từ vượt giới hạn.");
        var commission = await c.ExecuteScalarAsync<string>("SELECT role FROM users WHERE id=@owner", new { owner }, tx) == "ctv" ? built.Sum(l => l.Commission) : 0;
        var id = existing ?? Guid.NewGuid(); var code = (quote ? "BG" : "DH") + "-" + DateTime.UtcNow.AddHours(7).ToString("yyMMdd") + "-" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        var valid = r.ValidUntil ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7).AddDays(14));
        if (quote) Check.That(valid >= DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7)), "Ngày hết hạn không thể ở quá khứ.");
        var business = await c.ExecuteScalarAsync<string>("SELECT value::text FROM settings WHERE key='business'", transaction: tx);
        var terms = r.Terms ?? JsonDocument.Parse(business!).RootElement.GetProperty("quoteTerms").GetString() ?? ""; Check.Text(terms, 5000);
        var args = new { id, code, owner, customerId = r.CustomerId, snapshot, channel = r.Channel, subtotal, shipping = r.Shipping, commission, note = r.Note, valid = valid.ToDateTime(TimeOnly.MinValue), terms, business };
        if (existing is null)
            await c.ExecuteAsync(quote ? "INSERT INTO quotes(id,code,owner_id,customer_id,customer_snapshot,channel,subtotal,shipping,valid_until,note,terms,seller_snapshot) VALUES(@id,@code,@owner,@customerId,CAST(@snapshot AS jsonb),@channel,@subtotal,@shipping,@valid,@note,@terms,CAST(@business AS jsonb))" : "INSERT INTO orders(id,code,owner_id,customer_id,customer_snapshot,channel,subtotal,shipping,commission_total,note) VALUES(@id,@code,@owner,@customerId,CAST(@snapshot AS jsonb),@channel,@subtotal,@shipping,@commission,@note)", args, tx);
        else
            await c.ExecuteAsync(quote ? "UPDATE quotes SET customer_id=@customerId,customer_snapshot=CAST(@snapshot AS jsonb),channel=@channel,subtotal=@subtotal,shipping=@shipping,valid_until=@valid,note=@note,terms=@terms,seller_snapshot=CAST(@business AS jsonb),version=version+1,updated_at=now() WHERE id=@id" : "UPDATE orders SET customer_id=@customerId,customer_snapshot=CAST(@snapshot AS jsonb),channel=@channel,subtotal=@subtotal,shipping=@shipping,commission_total=@commission,note=@note,version=version+1,updated_at=now() WHERE id=@id", args, tx);
        var pricingSnapshot=JsonSerializer.Serialize(new {channel=r.Channel,lines=pricing.Lines.Select(l=>new {l.ProductId,l.Group,l.GroupQty,l.Minimum,l.Policy,l.TierId,l.PolicyVersion,l.UnitPrice,l.CommissionRate}),calculatedAt=DateTime.UtcNow});
        await c.ExecuteAsync($"UPDATE {table} SET pricing_snapshot=CAST(@pricingSnapshot AS jsonb) WHERE id=@id",new{id,pricingSnapshot},tx);
        if(quote && r.Document is not null){var document=await Documents.Snapshot(c,tx,r.Document);await c.ExecuteAsync("UPDATE quotes SET document_snapshot=CAST(@document AS jsonb) WHERE id=@id",new{id,document},tx);}
        if(quote && r.ClearDocument && r.Document is null)await c.ExecuteAsync("UPDATE quotes SET document_snapshot='{}'::jsonb WHERE id=@id",new{id},tx);
        await c.ExecuteAsync($"DELETE FROM {lineTable} WHERE {fk}=@id", new { id }, tx);
        foreach (var l in built)
            await c.ExecuteAsync(quote ? "INSERT INTO quote_lines(id,quote_id,product_id,sku,product_name,unit,qty,unit_price,amount,commission_rate,lead_days_min,lead_days_max) VALUES(@Id,@parent,@ProductId,@Sku,@ProductName,@Unit,@Qty,@UnitPrice,@Amount,@CommissionRate,@LeadDaysMin,@LeadDaysMax)" : "INSERT INTO order_lines(id,order_id,product_id,sku,product_name,unit,qty,unit_price,commission_rate,amount,commission,lead_days_min,lead_days_max) VALUES(@Id,@parent,@ProductId,@Sku,@ProductName,@Unit,@Qty,@UnitPrice,@CommissionRate,@Amount,@Commission,@LeadDaysMin,@LeadDaysMax)", new { l.Id, parent = id, l.ProductId, l.Sku, l.ProductName, l.Unit, l.Qty, l.UnitPrice, l.CommissionRate, l.Amount, l.Commission,l.LeadDaysMin,l.LeadDaysMax }, tx);
        if (!quote) await Event(c, tx, id, ctx.User().Id, existing is null ? "created" : "edited", new { subtotal, r.Shipping });
        await db.Audit(c, tx, ctx.User().Id, $"{table}_{(existing is null ? "created" : "edited")}", id); await tx.CommitAsync(); return Results.Ok(new { id });
    }
    static async Task QuotePolicy(NpgsqlConnection c, NpgsqlTransaction tx, HttpContext ctx)
    {
        if (ctx.User().Manager) return;
        var enabled = await c.ExecuteScalarAsync<bool>("SELECT COALESCE((value->>'ctvQuotes')::boolean,false) FROM settings WHERE key='business'", transaction: tx); Check.That(enabled, "Quản lý chưa cho phép CTV tạo hoặc chỉnh báo giá.", 403);
    }
    static async Task SyncCommission(NpgsqlConnection c, NpgsqlTransaction tx, Guid id)
    {
        await c.ExecuteAsync("INSERT INTO commissions(id,order_id,user_id,amount) SELECT @cid,o.id,o.owner_id,o.commission_total FROM orders o JOIN users u ON u.id=o.owner_id WHERE o.id=@id AND u.role='ctv' AND o.status='completed' AND o.paid=o.subtotal+o.shipping AND o.commission_total>0 ON CONFLICT(order_id) DO UPDATE SET amount=excluded.amount,status='pending',version=commissions.version+1 WHERE commissions.status='void'", new { id, cid = Guid.NewGuid() }, tx);
        await c.ExecuteAsync("UPDATE commissions cm SET status='void',version=cm.version+1 FROM orders o WHERE cm.order_id=o.id AND o.id=@id AND cm.status='pending' AND (o.status<>'completed' OR o.paid<>o.subtotal+o.shipping)", new { id }, tx);
    }
    static async Task Event(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, Guid actor, string kind, object detail) => await c.ExecuteAsync("INSERT INTO order_events VALUES(@eid,@id,@actor,@kind,CAST(@detail AS jsonb),now())", new { eid = Guid.NewGuid(), id, actor, kind, detail = JsonSerializer.Serialize(detail) }, tx);
}
public record SaleLine(Guid ProductId, int Qty, decimal? UnitPrice);
public record SaleRequest(Guid CustomerId, string Channel, decimal Shipping, string Note, List<SaleLine> Lines, int? Version, Guid? OwnerId, DateOnly? ValidUntil, string? Terms,DocumentInput? Document=null,bool ClearDocument=false,string? PricingToken=null);
public record BuiltLine(Guid Id, Guid ProductId, string Sku, string ProductName, string Unit, int Qty, decimal UnitPrice, decimal CommissionRate, decimal Amount, decimal Commission,int LeadDaysMin,int LeadDaysMax);
public record StatusRequest(string Status, int Version, string? Reason);
public record PaymentRequest(decimal Paid, int Version, string Reference, DateTime? OccurredAt = null);

public record VersionRequest(int Version);
