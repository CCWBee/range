"""Package RANGE as one offline HTML file, retaining the three.js licence."""
from pathlib import Path
import re
import base64
import json
import zipfile
from html.parser import HTMLParser

root=Path(__file__).resolve().parent.parent
three=(root/'vendor/three.module.js').read_text(encoding='utf-8')
exports=re.search(r'export\s*\{([^}]+)\};?\s*$',three)
assert exports,'Expected the vendored three.js export table'
fields=[]
for entry in exports.group(1).split(','):
    bits=entry.strip().split(' as ')
    fields.append(f'{bits[-1]}:{bits[0]}')
three=three[:exports.start()]+'\nreturn {'+','.join(fields)+'};'
physics=(root/'physics.js').read_text(encoding='utf-8')
physics=re.sub(r'^import .*?;\s*','',physics,flags=re.M).replace('export class ','class ').replace('export function ','function ')
game=(root/'game.js').read_text(encoding='utf-8')
game=re.sub(r'^import .*?;\s*','',game,flags=re.M)
textures={name:'data:image/png;base64,'+base64.b64encode((root/f'textures/{name}.png').read_bytes()).decode() for name in ['concrete','airframe','sky']}
meshes=(root/'assets/meshes.json').read_text(encoding='utf-8')
code='const THREE=(()=>{'+three+'})();\nconst {Flight,bombStep}=(()=>{'+physics+';return {Flight,bombStep};})();\nwindow.RANGE_MESHES='+meshes+';\nwindow.RANGE_TEXTURES='+json.dumps(textures)+';\n'+game
html=(root/'index.html').read_text(encoding='utf-8').replace('<script type="module" src="game.js"></script>','<script type="module">'+code.replace('</script','<\\/script')+'</script>')
html=html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; media-src data: blob:; base-uri \'none\'">',1)
out=root/'dist/index.html';out.parent.mkdir(exist_ok=True);out.write_text(html,encoding='utf-8')
assert 'src="game.js"' not in html
class DependencyCheck(HTMLParser):
    external=[]
    def handle_starttag(self, tag, attrs):
        for name,value in attrs:
            if name in ('src','href') and value and not value.startswith(('data:','#')):
                self.external.append(value)
check=DependencyCheck();check.feed(html)
assert not check.external, f'External dependency found: {check.external}'
assert "connect-src 'none'" in html
with zipfile.ZipFile(root/'RANGE.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.write(out,'RANGE.html')
    z.write(root/'vendor/THREE-LICENSE.txt','THREE-LICENSE.txt')
with zipfile.ZipFile(root/'RANGE.zip') as z:
    assert z.testzip() is None,'Archive integrity check failed'
print(json.dumps({'status':'built','html':str(out),'bytes':out.stat().st_size,'archive':str(root/'RANGE.zip'),'runtimeDependencies':['three.js r160'],'networkAssets':0}))
