"""Verify every deployed build file byte-for-byte before browser acceptance."""
import hashlib
import os
from pathlib import Path
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1] / 'dist'
base = os.environ['GAME_BASE_URL'].rstrip('/')
for path in sorted(root.rglob('*')):
    if not path.is_file():
        continue
    relative = path.relative_to(root).as_posix()
    request = Request(f'{base}/{relative}', headers={'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=30) as response:
        remote = response.read()
    local = path.read_bytes()
    assert hashlib.sha256(remote).digest() == hashlib.sha256(local).digest(), f'File mismatch: {relative} ({len(remote)} vs {len(local)} bytes)'
    print(f'PASS {relative} ({len(local)} bytes)', flush=True)
print('All deployment files match the tested local build.', flush=True)
