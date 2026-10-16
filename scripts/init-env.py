"""Generate local-only random secrets without printing them."""
from pathlib import Path
import secrets
root=Path(__file__).resolve().parents[1]
p=root/'.env'
if p.exists():
    raise SystemExit('.env đã tồn tại. Không ghi đè.')
p.write_text(f'POSTGRES_PASSWORD={secrets.token_hex(24)}\nBOOTSTRAP_EMAIL=admin@amora.local\nBOOTSTRAP_PASSWORD={secrets.token_urlsafe(24)}\n')
p.chmod(0o600)
print('Đã tạo .env. Mở tệp để xem thông tin đăng nhập local. Không commit tệp này.')
