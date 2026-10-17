using Dapper;
namespace Amora;

public static class Seed
{
    public static async Task Run(Db db, IConfiguration config)
    {
        await using var c = await db.Open(); await using var tx = await c.BeginTransactionAsync();
        await c.ExecuteAsync("SELECT pg_advisory_xact_lock(71352019)", transaction: tx);
        if (await c.ExecuteScalarAsync<int>("SELECT count(*) FROM scents", transaction: tx) == 0)
        {
            var data = new[]{
    new[]{"Lucente nel Buio","Ánh sáng trong màn đêm","Gỗ đàn hương tươi – mịn, sữa nhẹ","Đàn hương ấm – tròn, kem gỗ","Amber mềm – musk ấm, lưu hương bền","CLARITY"},
    new[]{"Piacere Sottile","Khoái cảm tinh tế","Rượu ấm (rum/brandy) – citrus trầm nhẹ","Hoa khô tinh tế – gỗ ẩm ấm","Amber khói – musk trầm, sâu và thân thể","CREATIVE FLOW"},
    new[]{"Dolce Distacco","Buông tay ngọt ngào","Đào chín – ngọt tươi, mọng nước","Gừng tươi – cay nhẹ, sống động","Musk mềm – gỗ sáng, cân bằng và êm","RESET"},
    new[]{"Amore che Resta","Tình yêu ở lại","Gỗ khô sạch – thoảng nhựa gỗ","Gỗ tuyết tùng – gỗ sồi, khô và vững","Amber khô – musk trầm, bền mùi","DEEP FOCUS"}
   };
            for (var i = 0; i < data.Length; i++)
            {
                var s = data[i]; var id = Guid.NewGuid();
                await c.ExecuteAsync("INSERT INTO scents VALUES(@id,@name,@meaning,@top,@middle,@base,@ritual)", new { id, name = s[0], meaning = s[1], top = s[2], middle = s[3], @base = s[4], ritual = s[5] }, tx);
                var category=await c.ExecuteScalarAsync<Guid>("SELECT id FROM product_categories WHERE name='Nến thơm'",transaction:tx);
                await c.ExecuteAsync("INSERT INTO product_models(id,code,name,category_id,description) VALUES(@pid,@code,@name,@category,@description)",new{pid=Guid.NewGuid(),code=$"AM-{i+1:00}",name=s[0],category,description=s[1]},tx);
            }
        }
        if (await c.ExecuteScalarAsync<int>("SELECT count(*) FROM users", transaction: tx) == 0)
        {
            var email = config["Bootstrap:Email"]; var password = config["Bootstrap:Password"];
            Check.That(!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password), "Lần chạy đầu cần Bootstrap__Email và Bootstrap__Password (tối thiểu 12 ký tự).", 503);
            await c.ExecuteAsync("INSERT INTO users(id,email,name,password_hash,role) VALUES(@id,@email,'Quản lý AMORA',@hash,'manager')", new { id = Guid.NewGuid(), email = email!.Trim().ToLowerInvariant(), hash = Auth.Hash(password!) }, tx);
        }
        await tx.CommitAsync();
    }
}
