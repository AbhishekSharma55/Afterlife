"""Host-only configuration; reads a root-only Secrets Manager download, never logs values."""
import json
from urllib.parse import urlparse
from pathlib import Path

base = Path('/srv/afterlife')
secret = json.loads((base / 'runtime.json').read_text())
images = json.loads((base / 'images.json').read_text())

def private_write(name, content):
    path = base / name
    path.write_text(content)
    path.chmod(0o600)

for value in secret['env'].values():
    if '\n' in value or '\r' in value:
        raise ValueError('Runtime values must be single-line strings')
private_write('backend.env', ''.join(f'{key}={value}\n' for key, value in secret['env'].items()))
private_write('.env', f"POSTGRES_PASSWORD={secret['dbPassword']}\nAFTERLIFE_APP_IMAGE={images['app']}\nPOSTGRES_IMAGE={images['postgres']}\nCADDY_IMAGE={images['caddy']}\n")
private_write('Caddyfile', (base / 'Caddyfile.template').read_text().replace('__PUBLIC_HOST__', urlparse(secret['env']['PUBLIC_ORIGIN']).hostname))
for name in ['caddy-data', 'caddy-config']:
    (base / name).mkdir(exist_ok=True, mode=0o700)
(base / 'postgres').mkdir(exist_ok=True, mode=0o700)
(base / 'runtime.json').unlink()
print('Private runtime configuration written.')
