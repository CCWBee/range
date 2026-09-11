"""Extract Gorey's mapped walls and St Catherine's paired walkways from the local OSM snapshot."""
import sys, json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'tools/python/osm'))
import osmium
ANGLE = math.radians(82.8)

def project(lon, lat):
    east = (lon + 2.1955555556) * 73000 * .85
    north = (lat - 49.2080555556) * 111320 * .85
    return [round(east*math.cos(ANGLE)-north*math.sin(ANGLE), 2),
            round(-east*math.sin(ANGLE)-north*math.cos(ANGLE)-1100, 2)]

features = []
class Extract(osmium.SimpleHandler):
    def way(self, way):
        tags = dict(way.tags)
        points = [(n.lon, n.lat) for n in way.nodes if n.location.valid()]
        castle = points and all(-2.0204 < x < -2.0182 and 49.1988 < y < 49.2002 for x, y in points)
        if way.id in (175072229, 301125693, 170333854) or (castle and any(k in tags for k in ('building','barrier','historic'))):
            features.append(dict(id=way.id, tags=tags, points=[project(*p) for p in points],
                                 lonlat=points, closed=way.is_closed()))

if __name__ == '__main__':
    Extract().apply_file(str(ROOT/'_archive/jersey-detail.osm.pbf'), locations=True)
    (ROOT/'assets/east_coast_geometry.json').write_text(json.dumps(features, separators=(',',':')))
    print('East-coast features:', len(features))
