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
Console.WriteLine($"PASS {checks} Catalogue Studio validation cases (CTV prices, limits, layouts, tables and duplicate IDs).");
