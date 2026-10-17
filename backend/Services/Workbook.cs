using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;
namespace Amora;
// Small OpenXML reader/writer: values only, no macro/formula execution or external links.
public static class Workbook
{
    static readonly XNamespace S="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static XDocument Xml(Stream stream){using var r=XmlReader.Create(stream,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=20_000_000});return XDocument.Load(r);}
    public static List<string[]> Read(byte[] bytes,string filename){
        if(filename.EndsWith(".csv",StringComparison.OrdinalIgnoreCase))return Csv(Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF'));
        Check.That(filename.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase),"Chỉ hỗ trợ .xlsx hoặc CSV UTF-8.");
        using var ms=new MemoryStream(bytes);using var zip=new ZipArchive(ms,ZipArchiveMode.Read);
        Check.That(zip.Entries.Count<=200&&zip.Entries.Sum(x=>x.Length)<=20_000_000,"File Excel quá lớn sau giải nén.");
        var strings=new List<string>();var shared=zip.GetEntry("xl/sharedStrings.xml");if(shared is not null){using var stream=shared.Open();strings=Xml(stream).Descendants(S+"si").Select(e=>string.Concat(e.Descendants(S+"t").Select(t=>t.Value))).ToList();}
        var entry=zip.GetEntry("xl/worksheets/sheet1.xml");Check.That(entry is not null,"File mẫu cần có dữ liệu tại worksheet đầu (sheet1).");
        using var sheet=entry!.Open();var doc=Xml(sheet);var result=new List<string[]>();
        foreach(var row in doc.Descendants(S+"row")){
            var cells=new string[40];Array.Fill(cells,"");foreach(var cell in row.Elements(S+"c")){
                Check.That(cell.Element(S+"f")is null,"File có công thức. Hãy dán giá trị trước khi nhập.");
                var reference=(string?)cell.Attribute("r")??"A1";int col=0;foreach(var ch in reference.TakeWhile(char.IsLetter))col=col*26+(char.ToUpperInvariant(ch)-'A'+1);
                Check.That(col is >0 and <=40,"File chỉ được có tối đa 40 cột.");var type=(string?)cell.Attribute("t");var value=type=="inlineStr"?string.Concat(cell.Descendants(S+"t").Select(x=>x.Value)):cell.Element(S+"v")?.Value??"";
                if(type=="s"){Check.That(int.TryParse(value,out var n)&&n>=0&&n<strings.Count,"Ô chuỗi Excel không hợp lệ.");value=strings[n];}
                Check.That(type!="e","File có ô lỗi Excel. Hãy sửa trước khi nhập.");Check.That(value.Length<=5000,"Nội dung một ô vượt 5.000 ký tự.");cells[col-1]=value;
            }
            if(cells.Any(x=>x!=""))result.Add(cells);Check.That(result.Count<=1001,"Mỗi lần nhập tối đa 1.000 dòng dữ liệu.");
        }return result;
    }
    static List<string[]> Csv(string text){
        var rows=new List<string[]>();var cells=new List<string>();var cell=new StringBuilder();bool quoted=false;var delimiter=text.Split('\n')[0].Count(x=>x==';')>text.Split('\n')[0].Count(x=>x==',')?';':',';
        for(int i=0;i<=text.Length;i++){var ch=i==text.Length?'\n':text[i];if(ch=='"'){if(quoted&&i+1<text.Length&&text[i+1]=='"'){cell.Append('"');i++;}else quoted=!quoted;}else if(!quoted&&(ch==delimiter||ch=='\n')){cells.Add(cell.ToString().TrimEnd('\r'));cell.Clear();if(ch=='\n'){if(cells.Any(x=>x!=""))rows.Add(cells.ToArray());cells.Clear();}}else cell.Append(ch);Check.That(cell.Length<=5000&&cells.Count<=40&&rows.Count<=1001,"CSV quá lớn; tối đa 1.000 dòng và 40 cột.");}
        Check.That(!quoted,"CSV có dấu nháy chưa đóng.");return rows;
    }
    public static byte[] Write(IEnumerable<string[]> rows){
        using var ms=new MemoryStream();using(var zip=new ZipArchive(ms,ZipArchiveMode.Create,true)){
            void Entry(string name,string content){using var writer=new StreamWriter(zip.CreateEntry(name).Open(),new UTF8Encoding(false));writer.Write(content);}
            Entry("[Content_Types].xml","<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>");
            Entry("_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
            Entry("xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"AMORA\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            Entry("xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
            var data=new XElement(S+"sheetData");int n=0;foreach(var row in rows){var element=new XElement(S+"row",new XAttribute("r",++n));for(int i=0;i<row.Length;i++){int index=i+1;string col="";while(index>0){index--;col=(char)('A'+index%26)+col;index/=26;}element.Add(new XElement(S+"c",new XAttribute("r",col+n),new XAttribute("t","inlineStr"),new XElement(S+"is",new XElement(S+"t",new XAttribute(XNamespace.Xml+"space","preserve"),row[i]??""))));}data.Add(element);}
            var sheet=new XElement(S+"worksheet",new XElement(S+"sheetViews",new XElement(S+"sheetView",new XAttribute("workbookViewId",0),new XElement(S+"pane",new XAttribute("ySplit",1),new XAttribute("topLeftCell","A2"),new XAttribute("state","frozen")))),new XElement(S+"cols",new XElement(S+"col",new XAttribute("min",1),new XAttribute("max",40),new XAttribute("width",24),new XAttribute("customWidth",1))),data);
            Entry("xl/worksheets/sheet1.xml",new XDocument(sheet).ToString());
        }return ms.ToArray();
    }
}
