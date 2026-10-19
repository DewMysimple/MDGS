"""Losslessly index triangle geometry in each exported scene manifest."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
results=[]
for path in (ROOT/'public'/'assets').glob('chapter-*/scene.json'):
    size_before=path.stat().st_size
    data=json.loads(path.read_text(encoding='utf8'))
    vertices_before=0;vertices_after=0
    for mesh in data['meshes']:
        if 'indices' in mesh:continue
        source_positions=mesh['positions'];source_uvs=mesh['uvs']
        positions=[];uvs=[];indices=[];seen={}
        count=len(source_positions)//3
        vertices_before+=count
        for v in range(count):
            p=source_positions[v*3:v*3+3]
            uv=source_uvs[v*2:v*2+2]
            key=tuple(p+uv)
            if key not in seen:
                seen[key]=len(positions)//3
                positions.extend(p);uvs.extend(uv)
            indices.append(seen[key])
        mesh['positions']=positions;mesh['uvs']=uvs;mesh['indices']=indices
        vertices_after+=len(positions)//3
    data['geometryEncoding']='indexed-json'
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    results.append({'chapter':data['id'],'beforeBytes':size_before,'afterBytes':path.stat().st_size,'beforeVertices':vertices_before,'afterVertices':vertices_after})
report=ROOT/'reports'/'assets-geometry.json'
report.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results))
