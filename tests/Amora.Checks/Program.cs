using Amora;
using Microsoft.Extensions.Configuration;
var values=new Dictionary<string,string?> {
 ["ConnectionStrings:Default"]="Host=sample-pooler.neon.tech;Database=amora;Username=amora;Password=test;SSL Mode=VerifyFull",
 ["ConnectionStrings:Migrations"]="Host=sample.neon.tech;Database=amora;Username=amora;Password=test;SSL Mode=VerifyFull",
 ["AllowedOrigins"]="https://amora.pages.dev/",
 ["R2:Endpoint"]="https://sample.r2.cloudflarestorage.com",
 ["R2:Bucket"]="amora-products",["R2:AccessKeyId"]="test-id",["R2:SecretAccessKey"]="test-secret"
};
IConfiguration Config(Dictionary<string,string?> v)=>new ConfigurationBuilder().AddInMemoryCollection(v).Build();
var normalized=Deployment.Validate(Config(values),true);
if(normalized.Single()!="https://amora.pages.dev")throw new Exception("Origin must normalize trailing slash");
var cases=new Dictionary<string,string?>[] {
 new(){["ConnectionStrings:Default"]="Host=sample.neon.tech;Database=amora;SSL Mode=Disable"},
 new(){["ConnectionStrings:Migrations"]=null},
 new(){["ConnectionStrings:Migrations"]=values["ConnectionStrings:Default"]},
 new(){["ConnectionStrings:Migrations"]="Host=sample.neon.tech;Database=wrong;SSL Mode=VerifyFull"},
 new(){["ConnectionStrings:Migrations"]="Host=other.neon.tech;Database=amora;SSL Mode=VerifyFull"},
 new(){["AllowedOrigins"]="http://amora.pages.dev"},new(){["AllowedOrigins"]="https://amora.pages.dev/api"},
 new(){["AllowedOrigins"]="https://*.pages.dev"},new(){["AllowedOrigins"]=""},
 new(){["R2:SecretAccessKey"]=null},new(){["R2:Endpoint"]="https://sample.r2.cloudflarestorage.com/bucket"}
};
foreach(var change in cases){var input=new Dictionary<string,string?>(values);foreach(var item in change)input[item.Key]=item.Value;try{Deployment.Validate(Config(input),true);throw new Exception("Unsafe production configuration was accepted");}catch(AppError){}}
Console.WriteLine($"PASS: {cases.Length+1} production configuration checks.");
