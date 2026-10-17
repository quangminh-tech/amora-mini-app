"""Read-only checks on actual deployed URLs. No tokens or cloud secrets needed.
python3 scripts/check-cloud.py --frontend https://NAME.pages.dev --backend https://NAME.onrender.com
"""
import argparse,json,sys,urllib.request,urllib.error,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--frontend',required=True);p.add_argument('--backend',required=True);args=p.parse_args()
def origin(value):
    u=urllib.parse.urlsplit(value)
    if u.scheme!='https' or not u.netloc or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:
        p.error('Chỉ nhập HTTPS origin, không thêm /api hoặc đường dẫn.')
    return f'https://{u.netloc}'
front=origin(args.frontend);back=origin(args.backend);failures=[]
def get(url,method='GET',headers=None):
    req=urllib.request.Request(url,method=method,headers=headers or {})
    try:
        with urllib.request.urlopen(req,timeout=95) as r:return r.status,r.headers,r.read(2*1024*1024)
    except urllib.error.HTTPError as e:return e.code,e.headers,e.read(4096)
def check(ok,label):
    print(('PASS' if ok else 'FAIL')+': '+label)
    if not ok:failures.append(label)
try:
    status,headers,body=get(front)
    check(status==200 and 'text/html' in headers.get('Content-Type',''),'Pages trả giao diện HTML')
    csp=headers.get('Content-Security-Policy','')
    check(back in csp and 'connect-src' in csp and "connect-src 'self' https:" not in csp,'CSP chỉ định backend cụ thể')
    check(headers.get('X-Content-Type-Options','')=='nosniff','Header chống đoán kiểu nội dung')
    status,headers,body=get(back+'/health')
    data=json.loads(body) if 'application/json' in headers.get('Content-Type','') else {}
    check(status==200 and data.get('service')=='amora-mini','Đúng backend AMORA, liveness hoạt động')
    status,headers,body=get(back+'/api/products')
    check(status==401,'API từ chối đọc sản phẩm khi chưa đăng nhập')
    status,headers,body=get(back+'/api/auth/login','OPTIONS',{'Origin':front,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'})
    check(status in (200,204) and headers.get('Access-Control-Allow-Origin')==front,'CORS cho đúng frontend')
    status,headers,body=get(back+'/api/auth/login','OPTIONS',{'Origin':'https://untrusted.invalid','Access-Control-Request-Method':'POST'})
    check(headers.get('Access-Control-Allow-Origin') is None,'CORS không cho origin ngoài danh sách')
except Exception as error:
    failures.append(str(error));print('FAIL: Không kiểm tra xong. Máy chủ có thể đang khởi động; chạy lại sau hoặc xem log dịch vụ.')
print('Kiểm tra HTTP hoàn tất. Database và R2 cần kiểm tra trong Thiết lập bằng tài khoản quản lý.')
sys.exit(1 if failures else 0)
