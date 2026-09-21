"""Validate and package the reviewed native Play listing. Never includes credentials."""
from pathlib import Path
from hashlib import sha256
from html import escape
import json
import zipfile
from PIL import Image

root = Path(__file__).resolve().parent.parent
store = root / 'store/google-play'
version = json.loads((root / 'package.json').read_text())['version']
text = {}
for name, limit in [('title', 30), ('short-description', 80), ('full-description', 4000)]:
    text[name] = (store / f'en-US/{name}.txt').read_text().strip()
    assert 0 < len(text[name]) <= limit, f'{name}: exceeds {limit} characters'
images = [('icon-512.png', (512, 512)), ('feature-graphic-1024x500.jpg', (1024, 500))]
for folder, size in [('phone', (1080, 1920)), ('seven-inch', (1080, 1920)), ('ten-inch', (1920, 1080))]:
    shots = sorted((store / 'screenshots' / folder).glob('*.jpg'))
    assert len(shots) == 5, f'{folder}: expected 5 actual Android screenshots'
    capture = json.loads((store / 'screenshots' / folder / 'capture.json').read_text())
    assert capture['version'] == version, f'{folder}: stale app screenshots'
    images += [(str(p.relative_to(store)), size) for p in shots]
manifest = {'version': version, 'screenshots': 'Actual native Android UI, fictional examples', 'images': []}
for name, size in images:
    path = store / name
    with Image.open(path) as img:
        assert img.size == size, f'{name}: unexpected dimensions {img.size}'
        if name.endswith('.jpg'):
            assert img.mode == 'RGB', f'{name}: JPEG must be RGB'
        if name == 'icon-512.png':
            assert path.stat().st_size < 1024 * 1024, 'Icon exceeds 1 MB'
    manifest['images'].append({'path': name, 'width': size[0], 'height': size[1], 'sha256': sha256(path.read_bytes()).hexdigest()})
(store / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
labels = ['Capoeira conversation with spoken answer ideas', 'Portuguese practice with Hebrew support', 'Practice levels and daily progress', 'Unlock capoeira character skins', 'A short vocabulary review']
sections = []
for folder, title in [('phone', 'Phone · 1080 × 1920'), ('seven-inch', '7-inch tablet · 1080 × 1920'), ('ten-inch', '10-inch tablet · 1920 × 1080')]:
    figures = ''.join(f'<figure><a href="{p.relative_to(store)}"><img src="{p.relative_to(store)}" alt="{escape(label)}" loading="lazy"></a><figcaption>{escape(label)}</figcaption></figure>' for p, label in zip(sorted((store / 'screenshots' / folder).glob('*.jpg')), labels))
    sections.append(f'<section><h2>{title}</h2><div class="gallery">{figures}</div></section>')
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fala · Google Play listing</title><style>
*{box-sizing:border-box}body{margin:0;background:#fffdf7;color:#152f28;font:17px/1.6 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:36px 24px}header{display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-bottom:30px}header>div{flex:1;min-width:210px}header img{width:100px;border-radius:24px}h1{font-size:clamp(28px,4vw,46px);line-height:1.1;margin:8px 0}h2{font-size:25px}small,.muted{color:#587066}section{margin:40px 0}a{color:#146451}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}.card{background:#e7f0e9;padding:28px;border-radius:20px}.banner{width:100%;max-width:1024px;display:block;border-radius:16px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px}figure{margin:0}figure img{width:100%;height:auto;border-radius:12px;border:1px solid #c6d4cb}figcaption{font-size:14px;line-height:1.4;margin:10px 0}.tag{font-size:13px;letter-spacing:.1em;text-transform:uppercase}nav{display:flex;flex-wrap:wrap;gap:20px}footer{border-top:1px solid #c6d4cb;padding-top:24px;font-size:14px}
</style><main>'''
html += f'<header><img src="icon-512.png" alt="Fala app icon"><div><span class="tag">Google Play package · {escape(version)}</span><h1>{escape(text["title"])}</h1><p>{escape(text["short-description"])}</p></div></header>'
html += '<nav><a href="en-US/full-description.txt">Listing text</a><a href="app-access.txt">Reviewer instructions</a><a href="console-answers.md">Console setup answers</a><a href="closed-test-plan.md">Closed-test plan</a><a href="publishing-status.md">Publishing status</a><a href="asset-manifest.json">Sizes and checksums</a></nav><section><img class="banner" src="feature-graphic-1024x500.jpg" alt="Fala: Speak a little. Grow a little. Portuguese conversation speech bubbles"></section>'
html += '<section class="card"><h2>Full description</h2><pre>' + escape(text['full-description']) + '</pre></section>'
html += ''.join(sections)
html += '<footer>Real Android screens captured on an emulator using fictional examples. Original logo and character art are AI-generated. This package does not confirm production approval. Closed testing and the remaining Play Console declarations still need to be completed.</footer></main></html>'
(store / 'preview.html').write_text(html)
output = root / 'artifacts' / f'Fala-Google-Play-{version}.zip'
output.parent.mkdir(exist_ok=True)
allowed = [store / name for name, _ in images] + [store / 'preview.html', store / 'asset-manifest.json', store / 'app-access.txt', store / 'console-answers.md', store / 'closed-test-plan.md', store / 'publishing-status.md', store / 'README.md'] + list((store / 'en-US').glob('*.txt')) + list((store / 'screenshots').glob('*/capture.json'))
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in allowed:
        archive.write(path, str(path.relative_to(store)))
print(json.dumps({'version': version, 'validated_images': len(images), 'archive': str(output), 'bytes': output.stat().st_size}))
