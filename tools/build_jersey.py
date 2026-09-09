"""Sample public Mapzen Terrain Tiles into an offline Jersey elevation grid."""
from pathlib import Path
import io, json, math, urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
N, SPACING, ZOOM = 513, 39.0625, 12
ORIGIN_X, ORIGIN_Z = -7000, -14000
# NATS EGJJ chart: airport reference point at the centre of runway 08/26.
# The demo keeps its longer runway; its centre and orientation are geographically registered.
AIRPORT_LON, AIRPORT_LAT = -(2+11/60+44/3600), 49+12/60+29/3600
BEARING = math.radians(82.8)
tiles = {}

def pixel_height(px,py):
    key = (int(px)//256, int(py)//256)
    if key not in tiles:
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{key[0]}/{key[1]}.png'
        tiles[key] = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=30).read())).convert('RGB')
    r,g,b = tiles[key].getpixel((int(px)%256,int(py)%256))
    return r*256 + g + b/256 - 32768

def height(lon, lat):
    px = (lon + 180) / 360 * (2**ZOOM) * 256 - .5
    py = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * (2**ZOOM) * 256 - .5
    x,y=math.floor(px),math.floor(py);fx,fy=px-x,py-y
    return ((1-fx)*pixel_height(x,y)+fx*pixel_height(x+1,y))*(1-fy)+((1-fx)*pixel_height(x,y+1)+fx*pixel_height(x+1,y+1))*fy

values = []
for j in range(N):
    z = ORIGIN_Z+j*SPACING
    for i in range(N):
        x = ORIGIN_X+i*SPACING
        east = x*math.cos(BEARING)-(z+1100)*math.sin(BEARING)
        north = -x*math.sin(BEARING)-(z+1100)*math.cos(BEARING)
        lon, lat = AIRPORT_LON+east/(73000*.85), AIRPORT_LAT+north/(111320*.85)
        # Isolate Jersey from France and neighbouring islands. Sea remains below the water mesh.
        h = height(lon,lat) if -2.27 <= lon <= -2.005 and 49.155 <= lat <= 49.275 else -20
        values.append(round(h-82.6,1) if h>.5 else -94)

# A light separable filter removes single-cell corners without flattening whole hills.
# Apply once to the shared data, rather than smoothing only the visible mesh.
raw=values
horizontal=[(raw[j*N+max(0,i-1)]+6*raw[j*N+i]+raw[j*N+min(N-1,i+1)])/8 for j in range(N) for i in range(N)]
values=[round((horizontal[max(0,j-1)*N+i]+6*horizontal[j*N+i]+horizontal[min(N-1,j+1)*N+i])/8,2) for j in range(N) for i in range(N)]
data = dict(nx=N,nz=N,spacing=SPACING,originX=ORIGIN_X,originZ=ORIGIN_Z,seaLevel=-82.6,airport=[AIRPORT_LON,AIRPORT_LAT],bearing=82.8,heights=values)
credit = 'Mapzen Terrain Tiles; Europe terrain produced using Copernicus data and information funded by the European Union (EU-DEM); global SRTM/GMTED2010 courtesy of USGS; ETOPO1 NOAA. Accessed 2026-09-08. Horizontal scale 85%; airfield and range locally flattened for gameplay.'
out = ROOT/'src/jersey.js'
out.write_text('// '+credit+'\n// Source: https://registry.opendata.aws/terrain-tiles/\nexport const JERSEY = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps(dict(path=str(out),samples=len(values),tiles=len(tiles),maximum=max(values))))
