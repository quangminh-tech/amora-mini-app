using Amora;
using System.Reflection;

var method = typeof(CatalogueStudio).GetMethod("Validate", BindingFlags.NonPublic | BindingFlags.Static)!;
int checks = 0;
void Test(StudioContent data, bool manager, bool allowed)
{
    try
    {
        method.Invoke(null, [data, manager]);
        if (!allowed)
            throw new Exception("Invalid catalogue accepted");
    }
    catch (TargetInvocationException e)when (e.InnerException is AppError)
    {
        if (allowed)
            throw;
    }

    checks++;
}

StudioSection Section() => new()
{
    Id = Guid.NewGuid(),
    Kind = "product",
    Title = "Sandalwood",
    Spec = "220g"
};
Test(new(), false, true);
Test(new() { ShowPrices = true }, false, false);
Test(new() { ShowPrices = true }, true, true);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Price = 199000 }] }, false, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Price = 199000 }] }, true, true);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Price = -1 }] }, true, false);
Test(new() { Theme = "url(javascript:alert(1))" }, true, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Kind = "html" }] }, true, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Kind = "table", Columns = ["a"], Rows = [["a", "b"]] }] }, true, false);
Test(new() { Sections = Enumerable.Range(0, 101).Select(_ => Section()).ToList() }, true, false);
var same = Section();
Test(new() { Sections = [same, same] }, true, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), ImageIds = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray() }] }, true, false);
Test(new() { Title = new string ('x', 181) }, true, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Description = new string ('x', 5001) }] }, true, false);
Test(new() { Sections = [new() { Id = Guid.NewGuid(), Position = 101 }] }, true, false);
var photoIds = Enumerable.Range(0,12).Select(_=>Guid.NewGuid()).ToArray();
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",Layout="full",ImageIds=photoIds,GalleryColumns=4,ImageGap=0,ImageRadius=32,ImageRatio="portrait",ImageCrops=new(){[photoIds[0]]=new(){X=0,Y=100}} }] },true,true);
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",Layout="full",GalleryColumns=5 }] },true,false);
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",ImageGap=-1 }] },true,false);
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",ImageRatio="url(x)" }] },true,false);
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",ImageIds=photoIds,ImageCrops=new(){[photoIds[0]]=new(){X=101}} }] },true,false);
Test(new() { Sections = [new() { Id=Guid.NewGuid(),Kind="gallery",ImageCrops=new(){[Guid.NewGuid()]=new()} }] },true,false);
Console.WriteLine($"PASS {checks} Catalogue Studio validation cases (CTV prices, limits, layouts, tables and duplicate IDs).");

void Assert(bool ok,string label) { if(!ok)throw new Exception(label);checks++; }
Test(new(){Sections=[new(){Id=Guid.NewGuid(),TopNotes=new string('x',1001)}]},true,false);
var image=Guid.NewGuid();var unused=Guid.NewGuid();var product=Guid.NewGuid();
var publicContent=PublicCatalogue.Decode($$"""{"title":"AMORA","owner_id":"private","cost":999,"sections":[{"id":"{{Guid.NewGuid()}}","productId":"{{product}}","topNotes":"Trà trắng","imageIds":["{{image}}"]}]}""");
Assert(publicContent.Sections[0].ProductId is null,"Public content must strip source product IDs");
Assert(publicContent.Sections[0].TopNotes=="Trà trắng","Notes must survive publication");
var publicJson=System.Text.Json.JsonSerializer.Serialize(publicContent);
Assert(!publicJson.Contains("owner_id")&&!publicJson.Contains("cost"),"Unknown private fields must be dropped");
Assert(PublicCatalogue.HasImage(publicContent,image),"Published image must be visible");
Assert(!PublicCatalogue.HasImage(publicContent,unused),"Unused draft image must be rejected");
Assert(PublicCatalogue.ValidSlug(new string('a',64)),"256-bit public slug accepted");
Assert(!PublicCatalogue.ValidSlug(new string('a',63))&&!PublicCatalogue.ValidSlug(new string('X',64)),"Malformed slug rejected");
foreach(var (verb,url,allowed) in new[]{("GET","/api/public/catalogues/slug",true),("HEAD","/api/public/catalogues/slug/images/id",true),("POST","/api/public/catalogues/slug",false),("GET","/api/public/catalogues-evil",false),("GET","/api/studio/id",false),("DELETE","/api/studio/id",false)}){
 var ctx=new Microsoft.AspNetCore.Http.DefaultHttpContext();ctx.Request.Method=verb;ctx.Request.Path=url;
 Assert(PublicCatalogue.AnonymousRead(ctx)==allowed,$"Anonymous route isolation: {verb} {url}");
}
Console.WriteLine($"PASS {checks} total checks including public response whitelist, slug, image scope and anonymous route isolation.");

Assert(QuantityPricing.ChannelLabel("b2b")=="Doanh nghiệp","Missing B2B prices must never be labelled retail");
Assert(QuantityPricing.ChannelLabel("wholesale")=="Bán sỉ","Missing wholesale prices label");
Console.WriteLine($"PASS {checks} total checks including correct channel labels.");
