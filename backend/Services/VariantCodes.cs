using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace Amora;
public static class VariantCodes
{
    public static string Plain(string value) => new string(value.Normalize(NormalizationForm.FormD)
        .Where(ch=>CharUnicodeInfo.GetUnicodeCategory(ch)!=UnicodeCategory.NonSpacingMark).ToArray())
        .Replace('đ','d').Replace('Đ','D').ToUpperInvariant();
    public static string Slug(string value) => Regex.Replace(Plain(value),"[^A-Z0-9]+","-").Trim('-');
    public static string Build(string model,string scent,string size,string colour){
        var words=Regex.Matches(Plain(scent),"[A-Z0-9]+").Select(m=>m.Value).ToArray();
        var smell=words.Length==0?"KM":string.Concat(words.Select(w=>w[0]));
        var weight=Slug(size);if(Regex.IsMatch(weight,"^[0-9]+G$"))weight=weight[..^1];
        var code=string.Join("-",new[]{Slug(model),smell,weight,Slug(colour)}.Where(x=>x.Length>0));
        Check.That(code.Length<=50,"SKU tự động dài quá 50 ký tự. Rút gọn mã mẫu, size hoặc màu.");
        return code;
    }
}
