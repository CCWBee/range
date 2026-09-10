"""Package RANGE's ES modules and Blender library as offline HTML files.

Two tiers (spec 2026-09-10 section 9). `desktop` writes dist/index.html and RANGE.zip as before,
plus one inline script that sends phones to mobile.html. `mobile` writes dist/mobile.html: the
settlement chunks nearest the airfield inside a byte budget, the binary repacked, the unused
binary terrain block dropped, roads and land cover thinned, textures shrunk, the heritage skin
left out. Both tiers carry the height grid as a base64 int16 array (0.1 m) in place of the JSON
text: physics.js only ever indexes it. With no --tier both bundles are written.
"""
from pathlib import Path
import re, base64, json, zipfile, io, subprocess, argparse, struct
from html.parser import HTMLParser
from PIL import Image
root=Path(__file__).resolve().parent.parent

FIXED_TEXTURES=['concrete','concrete_normal','sky','moor','tarmac','corrugated','grime','grass_tuft','gorse','tree_card','cloud_1','cloud_2','cloud_3','airframe','airframe_normal','raf_typhoon_heritage']
SPRITES={'grass_tuft','gorse','tree_card','cloud_1','cloud_2','cloud_3'}
AIRFIELD=(0.0,-900.0)
SETTLEMENT_BUDGET=3_000_000
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

def part_extent(part):
    """Byte range [start, end) of one part inside the binary."""
    n=part['vertexCount'];starts=[part['position'],part['normal']];ends=[part['position']+n*12,part['normal']+n*12]
    if part.get('uv') is not None:starts.append(part['uv']);ends.append(part['uv']+n*8)
    if part.get('color') is not None:starts.append(part['color']);ends.append(part['color']+n*3)
    starts.append(part['index']);ends.append(part['index']+part['indexCount']*4)
    return min(starts),max(ends)

def diet(manifest,binary):
    """Keep the settlement chunks nearest the airfield inside the budget, repack the binary with
    4-byte alignment, and drop the terrain block nothing reads."""
    assets=manifest['assets'];keep={};chunks=[]
    for name,parts in assets.items():
        if not name.startswith('settlement_'):keep[name]=parts;continue
        lo=[min(p['bounds'][i] for p in parts) for i in range(3)];hi=[max(p['bounds'][i+3] for p in parts) for i in range(3)]
        centre=((lo[0]+hi[0])/2,(lo[2]+hi[2])/2)
        size=sum(part_extent(p)[1]-part_extent(p)[0] for p in parts)
        chunks.append((((centre[0]-AIRFIELD[0])**2+(centre[1]-AIRFIELD[1])**2)**.5,size,name,parts))
    chunks.sort(key=lambda c:c[0]);total=0;kept=0
    for distance,size,name,parts in chunks:
        if total+size>SETTLEMENT_BUDGET:continue
        total+=size;kept+=1;keep[name]=parts
    print(f'settlement: kept {kept} of {len(chunks)} chunks, {total} bytes of geometry')
    out=bytearray();new_assets={}
    def put(start,length):
        offset=len(out);out.extend(binary[start:start+length])
        while len(out)%4:out.append(0)
        return offset
    for name,parts in keep.items():
        new_parts=[]
        for p in parts:
            n=p['vertexCount'];q=dict(p)
            q['position']=put(p['position'],n*12);q['normal']=put(p['normal'],n*12)
            if p.get('uv') is not None:q['uv']=put(p['uv'],n*8)
            if p.get('color') is not None:q['color']=put(p['color'],n*3)
            q['index']=put(p['index'],p['indexCount']*4)
            new_parts.append(q)
        new_assets[name]=new_parts
    m=dict(manifest);m['assets']=new_assets;m.pop('terrain',None)
    return m,bytes(out)

# ------------------------------------------------------------------------------- textures

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
    head,name,literal=match.group(1),match.group(2),match.group(3)
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
    manifest=json.loads((root/'assets/meshes.json').read_text())
    assert manifest['version']==2,'Release requires articulated Blender library'
    binary=(root/'assets/meshes.bin').read_bytes()
    if tier=='mobile':manifest,binary=diet(manifest,binary)
    texture_stems=set(FIXED_TEXTURES)
    if tier=='mobile':texture_stems.discard('raf_typhoon_heritage')
    for material in manifest['materials'].values():
        texture_stems.update(material[key] for key in ('map','normalMap','bumpMap','ormMap','grimeMap') if key in material)
    textures={};texture_bytes=0
    for stem in sorted(texture_stems):
        path=next((root/'textures'/f'{stem}.{ext}' for ext in ['jpg','png'] if (root/'textures'/f'{stem}.{ext}').exists()),None)
        assert path, f'Missing texture {stem}'
        textures[stem],size=encode_texture(stem,path,tier);texture_bytes+=size
        print(f'texture {stem}: {size} bytes')
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
    out.write_text(html,encoding='utf-8')
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
