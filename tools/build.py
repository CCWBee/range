"""Package RANGE's ES modules and the packed library as offline HTML files.

Two tiers (spec 2026-09-10 section 9). `desktop` writes dist/index.html and RANGE.zip, plus one
inline script that sends phones to mobile.html. `mobile` writes dist/mobile.html: the settlement
chunks nearest the airfield inside a byte budget, roads and land cover thinned, textures shrunk,
the heritage skin left out. Both tiers carry the height grid as a base64 int16 array (0.1 m) in
place of the JSON text, since physics.js only ever indexes it. With no --tier both are written.

The library is assets/library.json and library.bin (version 3, tools/pack_library.py). When the
Blender export beside it is newer, it is packed first.
"""
from pathlib import Path
import re, base64, json, zipfile, io, subprocess, argparse, struct, sys
from html.parser import HTMLParser
from PIL import Image
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'tools'))
from pack_library import read_v3, write_v3, select, pack

SPRITES={'grass_tuft','gorse','tree_card','cloud_1','cloud_2','cloud_3'}
SETTLEMENT_BUDGET=1_500_000
MOBILE_BUDGET=15_000_000
DESKTOP_BUDGET=40_000_000
# Drawn at under a pixel on the 2048 road map, so the phone never sees them.
MOBILE_ROADS_DROPPED={'footway','path','steps','track','bridleway','cycleway','raceway','construction','bus_stop','busway','service'}
ROAD_TOLERANCE=8.0
COVER_TOLERANCE=10.0
REDIRECT=("<script>(function(){try{if(!/^https?:/.test(location.protocol)||/[?&]desktop=1/.test(location.search))return;"
          "if(matchMedia('(pointer: coarse)').matches&&!matchMedia('(hover: hover)').matches)"
          "location.replace('mobile.html'+location.search+location.hash)}catch(e){}})()</script>")
HEIGHTS_DECODER=('const RANGE_HEIGHTS=(()=>{const s=atob(%s);const n=s.length>>1,o=new Float32Array(n);'
                 'for(let i=0;i<n;i++){let v=s.charCodeAt(2*i)|s.charCodeAt(2*i+1)<<8;if(v>32767)v-=65536;o[i]=v/10}return o})();\n')

three=(root/'vendor/three.module.js').read_text(encoding='utf-8')
exports=re.search(r'export\s*\{([^}]+)\};?\s*$',three)
assert exports
fields=[]
for entry in exports.group(1).split(','):
    bits=entry.strip().split(' as ');fields.append(f'{bits[-1]}:{bits[0]}')
three=three[:exports.start()]+'\nreturn {'+','.join(fields)+'};'

# ------------------------------------------------------------------------------- the library

def library():
    """The packed library, packed first when the Blender export beside it is newer."""
    packed=root/'assets/library.bin';export=root/'assets/meshes.bin'
    if export.exists() and (not packed.exists() or export.stat().st_mtime>packed.stat().st_mtime):
        print('library: the Blender export is newer, packing it');pack()
    manifest=json.loads((root/'assets/library.json').read_text(encoding='utf-8'))
    assert manifest['version']==3,'assets/library.json must be version 3 (python tools/pack_library.py)'
    return manifest,packed.read_bytes()

# ------------------------------------------------------------------------------- textures

def texture_stems(manifest):
    """The renderer's own list from loader.js, plus every map a material names."""
    source=(root/'src/loader.js').read_text(encoding='utf-8')
    table=re.search(r'TEXTURE_STEMS\s*=\s*\[(.*?)\];',source,re.S)
    stems=set(re.findall(r"'(\w+)'",table.group(1)))
    for material in manifest['materials'].values():
        stems.update(material[key] for key in ('map','normalMap','bumpMap','ormMap','grimeMap') if key in material)
    return stems

def encode_texture(stem,path,tier):
    image=Image.open(path);data=path.read_bytes();mime='image/jpeg' if path.suffix=='.jpg' else 'image/png'
    alpha=image.mode in ('RGBA','LA') or (image.mode=='P' and 'transparency' in image.info)
    if tier=='mobile':
        limit=256 if stem in SPRITES else 768
        image=image.convert('RGBA' if alpha else 'RGB')
        if max(image.size)>limit:image.thumbnail((limit,limit),Image.LANCZOS)
        stream=io.BytesIO()
        if alpha:image.save(stream,format='PNG',optimize=True);mime='image/png'
        else:image.save(stream,format='JPEG',quality=80,optimize=True);mime='image/jpeg'
        data=stream.getvalue()
    elif stem in ('sky','concrete'):
        stream=io.BytesIO();image.convert('RGB').save(stream,format='JPEG',quality=92)
        data=stream.getvalue();mime='image/jpeg'
    return 'data:'+mime+';base64,'+base64.b64encode(data).decode(),len(data)

# ------------------------------------------------------------------------------- data modules

DATA=re.compile(r'^(export const (\w+)\s*=\s*)(.*);\s*$',re.S|re.M)

def thin(points,tolerance,closed):
    """Drop points closer than the tolerance to the last kept one; keep the ends of a line and at
    least a triangle of a ring."""
    out=[points[0]]
    for p in points[1:]:
        q=out[-1]
        if (p[0]-q[0])**2+(p[1]-q[1])**2>=tolerance*tolerance:out.append(p)
    if closed:return out if len(out)>=3 else points
    if out[-1]!=points[-1]:out.append(points[-1])
    return out

def transform_data(stem,body,tier):
    """Rewrite one data module for the bundle. Returns (body, preamble)."""
    if stem not in ('jersey','roads','landcover'):return body,''
    match=DATA.search(body)
    assert match,f'{stem}.js is not one exported literal'
    head,literal=match.group(1),match.group(3)
    comment=body[:match.start()]
    data=json.loads(literal)
    preamble=''
    if stem=='jersey':
        heights=data.pop('heights')
        packed=struct.pack(f'<{len(heights)}h',*(int(round(h*10)) for h in heights))
        preamble=HEIGHTS_DECODER%json.dumps(base64.b64encode(packed).decode())
        literal=json.dumps(data,separators=(',',':'))[:-1]+',"heights":RANGE_HEIGHTS}'
        print(f'heights: {len(heights)} samples as int16, {len(packed)} bytes')
    elif tier=='mobile' and stem=='roads':
        before=sum(len(r['points']) for r in data)
        data=[dict(r,points=thin(r['points'],ROAD_TOLERANCE,False)) for r in data if r['kind'] not in MOBILE_ROADS_DROPPED]
        print(f'roads: {before} points to {sum(len(r["points"]) for r in data)} in {len(data)} ways')
        literal=json.dumps(data,separators=(',',':'))
    elif tier=='mobile' and stem=='landcover':
        before=sum(len(a['points']) for a in data)
        data=[dict(a,points=thin(a['points'],COVER_TOLERANCE,True)) for a in data]
        print(f'land cover: {before} points to {sum(len(a["points"]) for a in data)}')
        literal=json.dumps(data,separators=(',',':'))
    else:return body,''
    return comment+head+literal+';\n',preamble

# ------------------------------------------------------------------------------- the bundle

pattern=re.compile(r'^import\s+(.+?)\s+from\s+[\'"](.+?)[\'"];\s*',re.M|re.S)

def bundle_code(manifest,binary,textures,tier):
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
    preamble=''
    for path in order:
        modules[path],extra=transform_data(path.stem,modules[path],tier);preamble+=extra
    code='const THREE=(()=>{'+three+'})();\nconst RANGE={};\n'+preamble
    code+='window.RANGE_MANIFEST='+json.dumps(manifest,separators=(',',':'))+';\n'
    code+='window.RANGE_BIN='+json.dumps(base64.b64encode(binary).decode())+';\n'
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
    return code,[p.stem for p in order]

class DependencyCheck(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for name,value in attrs:
            assert not(name in ('src','href') and value and not value.startswith(('data:','#'))),f'External dependency: {value}'

def build(tier):
    manifest,binary=library()
    if tier=='mobile':
        assets=select(read_v3(manifest,binary),SETTLEMENT_BUDGET)
        manifest,binary=write_v3(assets,manifest['materials'],manifest.get('pivots',{}),manifest.get('blender',''))
    stems=texture_stems(manifest)
    if tier=='mobile':stems.discard('raf_typhoon_heritage')
    textures={};texture_bytes=0
    for stem in sorted(stems):
        path=next((root/'textures'/f'{stem}.{ext}' for ext in ['jpg','png'] if (root/'textures'/f'{stem}.{ext}').exists()),None)
        assert path, f'Missing texture {stem}'
        textures[stem],size=encode_texture(stem,path,tier);texture_bytes+=size
    code,order=bundle_code(manifest,binary,textures,tier)
    html=(root/'index.html').read_text(encoding='utf-8')
    entry='<script type="module" src="src/main.js"></script>'
    assert entry in html
    html=html.replace(entry,'<script type="module">'+code.replace('</script','<\\/script')+'</script>')
    csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; media-src data: blob:; base-uri \'none\'">'
    html=html.replace('<head>','<head>'+csp+(REDIRECT if tier=='desktop' else ''),1)
    DependencyCheck().feed(html)
    size=len(html.encode());budget=MOBILE_BUDGET if tier=='mobile' else DESKTOP_BUDGET
    print(f'{tier}: library {len(binary)} bytes, textures {texture_bytes} bytes, page {size} bytes')
    assert size<budget,f'{tier} bundle exceeds its size budget: {size} bytes'
    out=root/('dist/mobile.html' if tier=='mobile' else 'dist/index.html');out.parent.mkdir(exist_ok=True)
    out.write_text(html,encoding='utf-8',newline='\n')
    if tier=='desktop':
        with zipfile.ZipFile(root/'RANGE.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
            archive.write(out,'RANGE.html');archive.write(root/'vendor/THREE-LICENSE.txt','THREE-LICENSE.txt')
        with zipfile.ZipFile(root/'RANGE.zip') as archive:assert archive.testzip() is None
    print(json.dumps({'status':'built','tier':tier,'file':str(out.relative_to(root)),'bytes':out.stat().st_size,'networkAssets':0,'modules':order}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tier',choices=['desktop','mobile','both'],default='both')
    args=parser.parse_args()
    for tier in (['desktop','mobile'] if args.tier=='both' else [args.tier]):build(tier)
