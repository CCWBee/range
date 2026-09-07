"""Package RANGE's ES modules and Blender library as one offline HTML file."""
from pathlib import Path
import re, base64, json, zipfile, io, subprocess
from html.parser import HTMLParser
from PIL import Image
root=Path(__file__).resolve().parent.parent
three=(root/'vendor/three.module.js').read_text(encoding='utf-8')
exports=re.search(r'export\s*\{([^}]+)\};?\s*$',three)
assert exports
fields=[]
for entry in exports.group(1).split(','):
    bits=entry.strip().split(' as ');fields.append(f'{bits[-1]}:{bits[0]}')
three=three[:exports.start()]+'\nreturn {'+','.join(fields)+'};'
manifest=json.loads((root/'assets/meshes.json').read_text())
assert manifest['version']==2,'Release requires articulated Blender library'
textures={}
for stem in ['concrete','concrete_normal','sky','moor','tarmac','corrugated','grime','grass_tuft','gorse','tree_card','cloud_1','cloud_2','cloud_3','airframe','airframe_normal']:
    path=next((root/'textures'/f'{stem}.{ext}' for ext in ['jpg','png'] if (root/'textures'/f'{stem}.{ext}').exists()),None)
    assert path, f'Missing texture {stem}'
    data=path.read_bytes();mime='image/jpeg' if path.suffix=='.jpg' else 'image/png'
    if stem in ('sky','concrete'):
        stream=io.BytesIO();Image.open(path).convert('RGB').save(stream,format='JPEG',quality=92)
        data=stream.getvalue();mime='image/jpeg'
    textures[stem]='data:'+mime+';base64,'+base64.b64encode(data).decode()
    print(f'texture {stem}: {len(data)} bytes')
pattern=re.compile(r'^import\s+(.+?)\s+from\s+[\'"](.+?)[\'"];\s*',re.M|re.S)
modules={p.resolve():p.read_text(encoding='utf-8') for p in [root/'physics.js',root/'control.js',*sorted((root/'src').glob('*.js'))]}
order=[];visiting=set();visited=set()
def visit(path):
    if path in visited:return
    assert path not in visiting, f'Module cycle at {path}'
    visiting.add(path)
    for match in pattern.finditer(modules[path]):
        dep=(path.parent/match.group(2)).resolve()
        if dep.name!='three.module.js':visit(dep)
    visiting.remove(path);visited.add(path);order.append(path)
visit((root/'src/main.js').resolve())
code='const THREE=(()=>{'+three+'})();\nconst RANGE={};\n'
code+='window.RANGE_MANIFEST='+json.dumps(manifest,separators=(',',':'))+';\n'
code+='window.RANGE_BIN='+json.dumps(base64.b64encode((root/'assets/meshes.bin').read_bytes()).decode())+';\n'
code+='window.RANGE_TEXTURES='+json.dumps(textures,separators=(',',':'))+';\n'
for path in order:
    body=modules[path];bindings=[]
    for match in pattern.finditer(body):
        target=(path.parent/match.group(2)).resolve()
        if target.name=='three.module.js':continue
        names=match.group(1).replace(' as ',':')
        bindings.append(f'const {names}=RANGE[{json.dumps(target.stem)}];')
    names=re.findall(r'^export\s+(?:async\s+)?(?:class|function|const)\s+(\w+)',body,re.M)
    for table in re.findall(r'^export\s*\{([^}]+)\};?',body,re.M):
        for item in table.split(','):
            fields=item.strip().split(' as ')
            names.append(fields[-1]+':'+fields[0])
    body=re.sub(r'^export\s*\{[^}]+\};?','',body,flags=re.M)
    assert not re.search(r'^export\s+let\s',body,re.M),'Live exports need explicit handling'
    body=pattern.sub('',body);body=re.sub(r'^export\s+', '',body,flags=re.M)
    code+='\n{\n'+'\n'.join(bindings)+'\n'+body+'\nRANGE['+json.dumps(path.stem)+']={'+','.join(names)+'};\n}\n'
syntax=subprocess.run(['node','--check','--input-type=module'],input=code,text=True,encoding='utf-8',capture_output=True)
assert syntax.returncode==0,syntax.stderr
html=(root/'index.html').read_text(encoding='utf-8')
entry='<script type="module" src="src/main.js"></script>'
assert entry in html
html=html.replace(entry,'<script type="module">'+code.replace('</script','<\\/script')+'</script>')
html=html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; media-src data: blob:; base-uri \'none\'">',1)
class DependencyCheck(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for name,value in attrs:
            assert not(name in ('src','href') and value and not value.startswith(('data:','#'))),f'External dependency: {value}'
DependencyCheck().feed(html)
assert len(html.encode())<40_000_000,'Bundle exceeds size budget'
out=root/'dist/index.html';out.parent.mkdir(exist_ok=True);out.write_text(html,encoding='utf-8')
with zipfile.ZipFile(root/'RANGE.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    archive.write(out,'RANGE.html');archive.write(root/'vendor/THREE-LICENSE.txt','THREE-LICENSE.txt')
with zipfile.ZipFile(root/'RANGE.zip') as archive:assert archive.testzip() is None
print(json.dumps({'status':'built','bytes':out.stat().st_size,'networkAssets':0,'modules':[p.stem for p in order]}))

