from pathlib import Path
import base64, mimetypes, re

root=Path(__file__).resolve().parents[1]
dist=root/'dist'
html=(dist/'index.html').read_text()
js_path=re.search(r'<script[^>]*src="([^"]+)"[^>]*></script>',html).group(1)
css_path=re.search(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>',html).group(1)
js=(dist/js_path).read_text()
css=(dist/css_path).read_text()
for file in (root/'public/assets').rglob('*'):
    if not file.is_file(): continue
    name=file.relative_to(root/'public/assets').as_posix()
    mime=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    uri='data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode()
    for old in ['../assets/'+name,'./assets/'+name,'/assets/'+name,'assets/'+name]:
        js=js.replace(old,uri);css=css.replace(old,uri);html=html.replace(old,uri)
html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',html)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+css+'</style></head>')
html=html.replace('</body>','<script type="module">'+js.replace('</script','<\\/script')+'</script></body>')
(root/'applejack-play.html').write_text(html)
print(root/'applejack-play.html')
