"""Export the authored Blender shader graph and native procedural texture fields.

Run after export-new-scrolls.py and prepare-new-scrolls.py with Blender 5.2:
  blender --background --disable-autoexec --python scripts/export-source-materials.py

The input .blend files are opened read-only and are never saved. Static effect
Noise/Voronoi fields are evaluated by Blender. Paper 3D fBm uses the source's
Perlin/hash/fractal math directly, avoiding high-frequency atlas aliasing.
Downstream arithmetic, wiring and animated/driven sockets remain explicit.
"""
from __future__ import annotations
import argparse, gzip, hashlib, itertools, json, math, os, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'peony-2.0-2026-10-23'
NAMES = ['画卷一_灼烧入场版.blend', '画卷二_街市建筑完整补全版.blend',
         '画卷三_分镜构图版_图层补全.blend', '画卷四_画卷一节奏运镜版.blend']
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--source-root', default=os.environ.get('MDGS_PEONY2_SOURCE_ROOT') or os.environ.get('MDGS_SOURCE_ROOT'))
parser.add_argument('--assets', default=str(ROOT / 'public/assets/new-scrolls'))
parser.add_argument('--chapters', default='1,2,3,4')
parser.add_argument('--resolution', type=int, default=1024)
parser.add_argument('--paper-resolution', type=int, default=4096)
parser.add_argument('--skip-bake', action='store_true')
parser.add_argument('--verbose', action='store_true')
OPTIONS = parser.parse_args(ARGS)
if not OPTIONS.source_root:
    config_path=ROOT/'scripts/new-scroll-sources.json'
    config=json.loads(config_path.read_text(encoding='utf8'))
    OPTIONS.source_root=str((config_path.parent/config['sourceRoot']).resolve())
COLLECT_DOMAINS = False
SHARED_DOMAINS = {}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def value(socket):
    v = getattr(socket, 'default_value', 0.)
    if isinstance(v, (int, float, bool)):
        return float(v)
    try:
        return [float(x) for x in v]
    except (TypeError, ValueError):
        return 0.


def number(x):
    if not math.isfinite(float(x)):
        raise ValueError('Non-finite source shader value')
    result = format(float(x), '.10g')
    result=result if '.' in result or 'e' in result.lower() else result + '.0'
    return '('+result+')' if result.startswith('-') else result


def literal(v):
    if isinstance(v, (float, int)):
        return number(v), 'float'
    if len(v) in (3, 4):
        return f'vec{len(v)}(' + ','.join(number(x) for x in v) + ')', f'vec{len(v)}'
    raise ValueError(f'Unsupported socket value {v}')


def cast(ref, kind):
    code, source = ref
    if source == kind:
        return code
    if kind == 'float':
        return f'dot(({code}).rgb,vec3(0.333333333333))'
    if source == 'float':
        return f'vec3({code})' if kind == 'vec3' else f'vec4(vec3({code}),1.0)'
    return f'({code}).rgb' if kind == 'vec3' else f'vec4({code},1.0)'


def curves(holder):
    ad = getattr(holder, 'animation_data', None)
    action = ad.action if ad else None
    result = list(getattr(action, 'fcurves', [])) if action else []
    if action:
        for layer in getattr(action, 'layers', []):
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    result.extend(bag.fcurves)
    if ad:
        result.extend(ad.drivers)
    return result


def socket_is_animated(socket):
    try:
        path = socket.path_from_id('default_value')
        return any(c.data_path == path for c in curves(socket.id_data))
    except (ValueError, AttributeError):
        return False


def uv_mapping(obj):
    """For a paper surface without UVs, use its actual non-overlapping axes."""
    if obj.data.uv_layers.active:
        us = [list(x.uv) for x in obj.data.uv_layers.active.data]
        return {'mode': 'authored', 'bounds': [[min(x[i] for x in us), max(x[i] for x in us)] for i in range(2)]}
    points = [v.co for v in obj.data.vertices]
    limits = [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)]
    axes = sorted(range(3), key=lambda i: limits[i][1] - limits[i][0], reverse=True)[:2]
    axes.sort()
    degenerate=False
    for poly in obj.data.polygons:
        pts = [points[i] for i in poly.vertices]
        area = sum(pts[i][axes[0]] * pts[(i+1) % len(pts)][axes[1]] - pts[(i+1) % len(pts)][axes[0]] * pts[i][axes[1]] for i in range(len(pts)))
        if abs(area) < 1e-8:degenerate=True
    if degenerate:
        axis=max(range(3),key=lambda i:limits[i][1]-limits[i][0]);cross=[i for i in range(3) if i!=axis]
        sections=[]
        for p in points:
            co=[float(p[i]) for i in cross]
            if not any(max(abs(a-b) for a,b in zip(co,s['point']))<1e-7 for s in sections):
                distance=sections[-1]['distance']+math.dist(co,sections[-1]['point']) if sections else 0.
                sections.append({'point':co,'distance':distance})
        if len(sections)<2:raise ValueError('Paper surface cannot be unwrapped: '+obj.name)
        return {'mode':'local-strip','axis':axis,'crossAxes':cross,'sections':sections,'length':sections[-1]['distance'],
                'min':limits[axis][0],'size':limits[axis][1]-limits[axis][0],'bounds':[[0.,1.],[0.,1.]]}
    return {'mode': 'local-axes', 'axes': axes, 'min': [limits[i][0] for i in axes],
            'size': [limits[i][1] - limits[i][0] for i in axes], 'bounds': [[0., 1.], [0., 1.]]}


def mapped_uv(p,mapping):
    if mapping['mode']=='local-axes':return [(p[a]-lo)/sz for a,lo,sz in zip(mapping['axes'],mapping['min'],mapping['size'])]
    cross=[p[i] for i in mapping['crossAxes']]
    section=min(mapping['sections'],key=lambda s:math.dist(s['point'],cross))
    if math.dist(section['point'],cross)>1e-4:raise ValueError('Paper UV strip has an unknown vertex')
    return [(p[mapping['axis']]-mapping['min'])/mapping['size'],section['distance']/mapping['length']]


def setup_bake_scene(source_scene):
    scene = bpy.data.scenes.new('MDGS_NATIVE_FIELD_BAKE')
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    return scene


def bake_noise(noise, output_index, inputs, mapping, original_obj, bake_scene, folder, cache):
    """Native emission baking retains Blender's noise variant, normalization and W.

    UV effects use a 2D coordinate-domain lookup, so object transforms/morphs can
    move through the same source field. Paper uses its real 3D surface instead.
    """
    domain = inputs['domain']
    key = {'type': noise.bl_idname, 'output': output_index, 'domain': domain,'nativeVersion':bpy.app.version_string,
           'properties': {p: getattr(noise, p) for p in ['noise_dimensions', 'noise_type', 'normalize', 'voronoi_dimensions', 'distance', 'feature'] if hasattr(noise, p)},
           'inputs': inputs['values'], 'mapping': mapping if domain['kind'] == 'surface' else None,
           'object': original_obj.name if domain['kind'] == 'surface' else None,
           'surfaceGeometrySha256':hashlib.sha256(np.array([list(v.co) for v in original_obj.data.vertices],dtype='<f4').tobytes()).hexdigest() if domain['kind']=='surface' else None}
    channels = 3 if noise.outputs[output_index].type in ('VECTOR', 'RGBA') else 1
    resolution = OPTIONS.paper_resolution if domain['kind'] == 'surface' else OPTIONS.resolution
    width = resolution
    height = max(256, resolution // 4) if domain['kind'] == 'surface' else resolution
    key.update(width=width,height=height)
    digest = hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:24]
    path = folder / 'material-fields' / (digest + '.f16.gz')
    descriptor = {'url': 'material-fields/' + path.name, 'encoding': 'gzip-float16-le', 'width': width,
                  'height': height, 'channels': channels, 'domain': domain, 'nativeNode': noise.bl_idname,
                  'nativeProperties': key['properties'], 'nativeInputs': inputs['values'],
                  'nativeOutputIndex': output_index, 'nativeOutputName': noise.outputs[output_index].name,
                  'recipeSha256': hashlib.sha256(json.dumps(key,sort_keys=True).encode()).hexdigest()}
    if COLLECT_DOMAINS:return descriptor
    if digest in cache:
        return cache[digest]
    if path.is_file() and OPTIONS.skip_bake:
        payload=gzip.decompress(path.read_bytes())
        if len(payload)!=width*height*channels*2:raise ValueError('Cached native field dimensions changed: '+str(path))
        cached=np.frombuffer(payload,dtype='<f2')
        if not np.isfinite(cached).all():raise ValueError('Cached native field has non-finite values: '+str(path))
        descriptor.update(sha256=sha(path),valueMin=float(cached.min()),valueMax=float(cached.max()),
                          precision='IEEE754 binary16, native linear values; no display transform',uncompressedBytes=len(payload))
        cache[digest] = descriptor
        return descriptor
    path.parent.mkdir(parents=True, exist_ok=True)
    old_scene = bpy.context.window.scene
    bpy.context.window.scene = bake_scene
    material = bpy.data.materials.new('MDGS_FIELD_' + digest)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    baked = nodes.new(noise.bl_idname)
    for prop, v in key['properties'].items():
        setattr(baked, prop, v)
    for index, v in enumerate(inputs['values']):
        if index < len(baked.inputs) and hasattr(baked.inputs[index], 'default_value'):
            try:
                baked.inputs[index].default_value = v
            except (TypeError, ValueError):
                pass
    coord = nodes.new('ShaderNodeTexCoord')
    if domain['kind'] == 'coordinate-2d':
        multiply = nodes.new('ShaderNodeVectorMath'); multiply.operation = 'MULTIPLY'
        add = nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'
        multiply.inputs[1].default_value = [domain['size'][0], domain['size'][1], 0.]
        add.inputs[1].default_value = [domain['min'][0], domain['min'][1], domain['z']]
        material.node_tree.links.new(coord.outputs['UV'], multiply.inputs[0])
        material.node_tree.links.new(multiply.outputs[0], add.inputs[0])
        material.node_tree.links.new(add.outputs[0], baked.inputs[0])
        mesh = bpy.data.meshes.new('MDGS_FIELD_GRID')
        mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)], [], [(0,1,2,3)])
        uv = mesh.uv_layers.new(name='MDGS_FIELD_UV')
        for li, co in enumerate([(0,0),(1,0),(1,1),(0,1)]): uv.data[li].uv = co
        obj = bpy.data.objects.new('MDGS_FIELD_SURFACE', mesh)
    else:
        obj = original_obj.copy(); obj.data = original_obj.data.copy()
        obj.animation_data_clear()
        obj.hide_render = False
        mesh = obj.data
        if not mesh.uv_layers.active:
            uv = mesh.uv_layers.new(name='MDGS_FIELD_UV')
            for poly in mesh.polygons:
                for li in poly.loop_indices:
                    p = mesh.vertices[mesh.loops[li].vertex_index].co
                    uv.data[li].uv = mapped_uv(p,mapping)
        source_coord = inputs.get('sourceCoordinate', 'Object')
        material.node_tree.links.new(coord.outputs[source_coord], baked.inputs[0])
    mesh.materials.clear(); mesh.materials.append(material)
    for polygon in mesh.polygons: polygon.material_index = 0
    bake_scene.collection.objects.link(obj)
    image = bpy.data.images.new('MDGS_NATIVE_FIELD_' + digest, width=width, height=height, alpha=True, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage'); target.image = image; nodes.active = target
    material.node_tree.links.new(baked.outputs[output_index], emit.inputs['Color'])
    material.node_tree.links.new(emit.outputs[0], out.inputs['Surface'])
    for other in bake_scene.objects: other.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type='EMIT')
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(height, width, 4)[:, :, :channels]
        if not np.isfinite(pixels).all(): raise ValueError('Native field has non-finite pixels: ' + digest)
        payload = pixels.astype('<f2').tobytes(order='C')
        temporary=path.with_suffix(path.suffix+'.tmp')
        temporary.write_bytes(gzip.compress(payload,compresslevel=6,mtime=0))
        temporary.replace(path)
        descriptor.update(sha256=sha(path), valueMin=float(pixels.min()), valueMax=float(pixels.max()),
                          precision='IEEE754 binary16, native linear values; no display transform',
                          uncompressedBytes=len(payload))
        if OPTIONS.verbose:print('NATIVE_FIELD', digest, original_obj.name, noise.name, output_index, width, height, flush=True)
    finally:
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        bpy.data.materials.remove(material)
        bpy.data.images.remove(image)
        bpy.context.window.scene = old_scene
    cache[digest] = descriptor
    return descriptor


class Compiler:
    def __init__(self, material, obj, record, scene, folder, bake_scene, field_cache, tracks):
        self.material, self.obj, self.record, self.scene = material, obj, record, scene
        self.folder, self.bake_scene, self.field_cache = folder, bake_scene, field_cache
        self.tracks = tracks
        self.mapping = uv_mapping(obj)
        self.memo = {}; self.lines = []; self.uniforms = {}; self.fields = []; self.coordinates = {}
        self.groups = []; self.bounds_cache = {}
        self.source_graph = []; self.closures=[]; self.procedural=[]
        self.paper = not any(n.type=='TEX_IMAGE' for n in material.node_tree.nodes)

    def constant(self, socket):
        if socket_is_animated(socket):
            key = self.material.name + '::' + socket.id_data.name + '::' + socket.path_from_id('default_value')
            if key not in self.tracks:
                self.tracks[key] = {'socket': socket, 'values': [], 'id': 'sourceParam' + str(len(self.tracks))}
            track = self.tracks[key]
            _, kind = literal(value(socket)); self.uniforms[track['id']] = {'kind': kind, 'track': key}
            return track['id'], kind
        return literal(value(socket))

    def inp(self, node, index, environment):
        s = node.inputs[index]
        if s.is_linked:
            link = s.links[0]
            return self.output(link.from_node, list(link.from_node.outputs).index(link.from_socket), environment)
        return self.constant(s)

    def emit(self, expr, kind):
        name = 'sourceNode' + str(len(self.lines))
        self.lines.append(f'{kind} {name} = {expr};')
        return name, kind

    def input_bounds(self, node, index, environment):
        s = node.inputs[index]
        if s.is_linked:
            l = s.links[0]
            return self.bounds(l.from_node, list(l.from_node.outputs).index(l.from_socket), environment)
        v = value(s); v = [v]*3 if isinstance(v, (int,float)) else v[:3]
        return [[x,x] for x in v]

    def bounds(self, node, index, environment):
        if node.type == 'GROUP_INPUT': return environment[index][1]
        if node.type == 'GROUP':
            env = {i:(self.inp(node,i,environment),self.input_bounds(node,i,environment)) for i in range(len(node.inputs))}
            out = next(n for n in node.node_tree.nodes if n.type == 'GROUP_OUTPUT' and n.is_active_output)
            return self.input_bounds(out,index,env)
        if node.type == 'TEX_COORD':
            name = node.outputs[index].name
            if name == 'UV': return self.mapping['bounds'] + [[0.,0.]]
            if name in ('Object', 'Generated'):
                if name == 'Generated': return [[0.,1.]]*3
                points = [Vector(c) for c in self.obj.bound_box]
                keys=getattr(self.obj.data,'shape_keys',None)
                if keys:
                    points.extend(p.co.copy() for block in keys.key_blocks for p in block.data)
                if node.object:
                    transform = node.object.matrix_world.inverted() @ self.obj.matrix_world
                    points = [transform @ p for p in points]
                return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
        if node.type in ('TEX_NOISE','TEX_VORONOI'): return [[0.,1.]]*3
        if node.type == 'VECT_MATH':
            a,b = self.input_bounds(node,0,environment),self.input_bounds(node,1,environment)
            if node.operation == 'ADD': return [[x[0]+y[0],x[1]+y[1]] for x,y in zip(a,b)]
            if node.operation == 'SUBTRACT': return [[x[0]-y[1],x[1]-y[0]] for x,y in zip(a,b)]
            if node.operation == 'MULTIPLY': return [[min(x0*y0 for x0 in x for y0 in y),max(x0*y0 for x0 in x for y0 in y)] for x,y in zip(a,b)]
            if node.operation == 'SCALE':
                k=self.input_bounds(node,3,environment)[0]
                return [[min(x0*y0 for x0 in x for y0 in k),max(x0*y0 for x0 in x for y0 in k)] for x in a]
        if node.type in ('VALUE','RGB'):
            v=value(node.outputs[index]);v=[v]*3 if isinstance(v,(int,float)) else v[:3]
            return [[x,x] for x in v]
        raise ValueError(f'Cannot establish static procedural domain: {self.material.name}/{node.name}/{node.type}')

    def output(self, node, index, environment):
        env_key = tuple((i,x[0][0]) for i,x in environment.items())
        key = (node.as_pointer(),index,env_key)
        if key in self.memo:return self.memo[key]
        properties={p:getattr(node,p) for p in ('operation','data_type','blend_type','interpolation_type','clamp','use_clamp','clamp_factor','clamp_result','invert','distribution','noise_dimensions','noise_type','normalize') if hasattr(node,p)}
        self.source_graph.append({'tree':node.id_data.name,'node':node.name,'type':node.type,'output':index,'properties':properties,
            'inputs':[{'index':i,'name':s.name,'value':value(s),'animated':socket_is_animated(s),
                       'path':s.path_from_id('default_value') if hasattr(s,'default_value') else None,
                       'from':{'node':s.links[0].from_node.name,'output':list(s.links[0].from_node.outputs).index(s.links[0].from_socket)} if s.is_linked else None} for i,s in enumerate(node.inputs)]})
        t = node.type
        get = lambda i,k='float': cast(self.inp(node,i,environment),k)
        if t == 'GROUP_INPUT': result=environment[index][0]
        elif t == 'GROUP':
            env={i:(self.inp(node,i,environment),self.input_bounds(node,i,environment) if node.inputs[i].type=='VECTOR' else [[0,1]]*3) for i in range(len(node.inputs))}
            out=next(n for n in node.node_tree.nodes if n.type=='GROUP_OUTPUT' and n.is_active_output)
            result=self.inp(out,index,env)
        elif t in ('VALUE','RGB'):result=self.constant(node.outputs[index])
        elif t == 'REROUTE':result=self.inp(node,0,environment)
        elif t == 'TEX_COORD':
            name=node.outputs[index].name
            if name=='UV':result=('vec3(vSourceUv,0.0)','vec3')
            elif name=='Generated':
                limits=[[min(v.co[i] for v in self.obj.data.vertices),max(v.co[i] for v in self.obj.data.vertices)] for i in range(3)]
                low=literal([x[0] for x in limits])[0];size=literal([max(1e-8,x[1]-x[0]) for x in limits])[0]
                result=(f'((vSourcePosition-{low})/{size})','vec3')
            elif name=='Object':
                if node.object:
                    uniform='sourceCoord'+str(len(self.coordinates));self.coordinates[uniform]=node.object
                    self.uniforms[uniform]={'kind':'mat4','coordinateObject':node.object.name}
                    result=(f'({uniform}*vec4(vSourceWorldPosition,1.0)).xyz','vec3')
                else:result=('vSourcePosition','vec3')
            elif name=='Normal':result=('normalize(vSourceNormal)','vec3')
            else:raise ValueError('Unsupported source coordinate '+name)
        elif t=='TEX_IMAGE':
            if not node.image:raise ValueError('Missing source image '+node.name)
            if node.projection!='FLAT' or node.interpolation!='Linear':raise ValueError('Unsupported source image sampling: '+node.name)
            if node.extension not in ('CLIP','EXTEND','REPEAT','MIRROR'):raise ValueError('Unsupported source image extension: '+node.extension)
            raw=bytes(node.image.packed_file.data) if node.image.packed_file else None
            image=next((i for i in self.record['images'] if i['sourceName']==node.image.name),None)
            if not image and raw:
                digest=hashlib.sha256(raw).hexdigest()
                image=next((i for i in self.record['images'] if i.get('sourceSha256')==digest),None)
            if not image:raise ValueError('Source image not exported: '+node.image.name)
            uniform='sourceImage'+str(len(self.fields));self.fields.append({'uniform':uniform,'url':image['src'],'encoding':'image','colorSpace':node.image.colorspace_settings.name,
                'extension':node.extension,'interpolation':node.interpolation,'projection':node.projection})
            coord=get(0,'vec3') if node.inputs[0].is_linked else 'vec3(vSourceUv,0.0)'
            lookup=f'texture2D({uniform},({coord}).xy,sourceImageLodBias)'
            if node.extension=='CLIP':lookup=f'({lookup}*sourceImageCoverage(({coord}).xy))'
            sample=self.emit(lookup,'vec4')
            result=(f'{sample[0]}.a','float') if index==1 else (f'{sample[0]}.rgb','vec3')
        elif t in ('TEX_NOISE','TEX_VORONOI'):
            if self.paper and t=='TEX_NOISE' and node.noise_dimensions=='3D' and node.noise_type=='FBM' and index==0 and not node.inputs['Distortion'].is_linked and value(node.inputs['Distortion'])==0:
                # Paper spans hundreds of source units, with a native scale up
                # to 1700. A surface atlas aliases that function even at 4096px.
                # Evaluate its source 3D Perlin/fBm math at the actual fragment
                # coordinate, including the Bump node's subpixel evaluations.
                ni=lambda name:list(node.inputs).index(node.inputs[name])
                if node.inputs['Vector'].is_linked:co=get(ni('Vector'),'vec3')
                else:
                    limits=[[min(v.co[i] for v in self.obj.data.vertices),max(v.co[i] for v in self.obj.data.vertices)] for i in range(3)]
                    low=literal([x[0] for x in limits])[0];size=literal([max(1e-8,x[1]-x[0]) for x in limits])[0]
                    co=f'((vSourcePosition-{low})/{size})'
                parameters=[get(ni(name)) for name in ('Scale','Detail','Roughness','Lacunarity')]
                result=(f'sourceNoiseFbm3({co},'+','.join(parameters)+(','+'1.0' if node.normalize else ',0.0')+')','float')
                self.procedural.append({'node':node.name,'tree':node.id_data.name,'output':index,'implementation':'blender-5.2-perlin-fbm-3d','properties':properties,
                    'parameters':{s.name:value(s) for s in node.inputs if hasattr(s,'default_value')},'expression':result[0]})
                self.memo[key]=result
                return result
            domain=self.input_bounds(node,0,environment)
            source_values=[value(s) for s in node.inputs]
            for i,s in enumerate(node.inputs):
                if i==0:continue
                if socket_is_animated(s):raise ValueError('Animated procedural parameter requires native time field: '+node.name)
                if s.is_linked:
                    code,kind=self.inp(node,i,environment)
                    if code.startswith('sourceParam'):raise ValueError('Animated procedural input '+node.name)
                    # A seed is a scalar group input. Resolve its source value at
                    # export time; changing/driver inputs are rejected above.
                    source_values[i]=self.resolve_static(s,environment)
            planar=abs(domain[2][1]-domain[2][0])<1e-7
            if planar:
                low=[domain[i][0]-.002 for i in range(2)];size=[max(.004,domain[i][1]-domain[i][0]+.004) for i in range(2)]
                if self.coordinates:
                    # A shared EMPTY supplies one continuous burn field across
                    # overlapping planes. Give every plane the exact same native
                    # sample lattice, rather than a separate per-plane crop.
                    shared=(node.id_data.name,node.name,tuple(sorted({o.name for o in self.coordinates.values()})))
                    if COLLECT_DOMAINS:
                        previous=SHARED_DOMAINS.get(shared)
                        limits=[[low[i],low[i]+size[i]] for i in range(2)]
                        SHARED_DOMAINS[shared]=[[min(a[0],b[0]),max(a[1],b[1])] for a,b in zip(previous,limits)] if previous else limits
                    elif shared in SHARED_DOMAINS:
                        limits=SHARED_DOMAINS[shared];low=[x[0] for x in limits];size=[x[1]-x[0] for x in limits]
                d={'kind':'coordinate-2d','min':low,'size':size,'z':sum(domain[2])/2}
            else:
                if node.inputs[0].is_linked:
                    link=node.inputs[0].links[0]
                    if link.from_node.type!='TEX_COORD' or link.from_socket.name not in ('Object','Generated','UV'):
                        raise ValueError('Nonplanar native field requires explicit surface coordinate: '+node.name)
                    coordinate=link.from_socket.name
                else:coordinate='Generated'
                d={'kind':'surface'}
            field=bake_noise(node,index,{'domain':d,'values':source_values,'sourceCoordinate':coordinate if not planar else None},self.mapping,self.obj,self.bake_scene,self.folder,self.field_cache)
            uniform='sourceField'+str(len(self.fields));self.fields.append(dict(field,uniform=uniform))
            if planar:
                coords=get(0,'vec3');uv=f'(({coords}).xy-vec2({number(low[0])},{number(low[1])}))/vec2({number(size[0])},{number(size[1])})'
            else:uv='vSourceUv'
            result=(f'texture2D({uniform},{uv}).'+('rgb' if field['channels']==3 else 'r'),'vec3' if field['channels']==3 else 'float')
        elif t=='SEPXYZ':result=(f'({get(0,"vec3")}).'+ 'xyz'[index],'float')
        elif t=='RGBTOBW':result=(f'dot({get(0,"vec3")},vec3(0.2126,0.7152,0.0722))','float')
        elif t=='CLAMP':result=(f'clamp({get(0)},{get(1)},{get(2)})','float')
        elif t=='MATH':
            a,b,c=get(0),get(1),get(2);op=node.operation
            expressions={'ADD':f'({a}+{b})','SUBTRACT':f'({a}-{b})','MULTIPLY':f'({a}*{b})','DIVIDE':f'sourceDivide({a},{b})','MULTIPLY_ADD':f'({a}*{b}+{c})','MINIMUM':f'min({a},{b})','MAXIMUM':f'max({a},{b})','ABSOLUTE':f'abs({a})','POWER':f'pow(max(0.0,{a}),{b})','LESS_THAN':f'float({a}<{b})','GREATER_THAN':f'float({a}>{b})','SUBTRACT':f'({a}-{b})','SINE':f'sin({a})','COSINE':f'cos({a})','FLOOR':f'floor({a})','FRACT':f'fract({a})','SQRT':f'sqrt(max(0.0,{a}))'}
            if op not in expressions:raise ValueError('Unsupported source Math operation '+op)
            expression=expressions[op]
            if node.use_clamp:expression=f'clamp({expression},0.0,1.0)'
            result=self.emit(expression,'float')
        elif t=='VECT_MATH':
            a,b=get(0,'vec3'),get(1,'vec3');op=node.operation
            expressions={'ADD':f'({a}+{b})','SUBTRACT':f'({a}-{b})','MULTIPLY':f'({a}*{b})','SCALE':f'({a}*{get(3)})','LENGTH':f'length({a})','DISTANCE':f'distance({a},{b})','DOT_PRODUCT':f'dot({a},{b})','NORMALIZE':f'normalize({a})'}
            if op not in expressions:raise ValueError('Unsupported source Vector Math '+op)
            result=self.emit(expressions[op],'float' if op in ('LENGTH','DISTANCE','DOT_PRODUCT') else 'vec3')
        elif t=='MAP_RANGE':
            if node.data_type!='FLOAT':raise ValueError('Unsupported vector Map Range')
            a,b,c,d,e=[get(i) for i in range(5)]
            amount=f'sourceDivide(({a}-{b}),({c}-{b}))'
            if node.interpolation_type in ('SMOOTHSTEP','SMOOTHERSTEP') or node.clamp:amount=f'clamp({amount},0.0,1.0)'
            if node.interpolation_type=='SMOOTHSTEP':amount=f'sourceSmooth({amount})'
            elif node.interpolation_type=='SMOOTHERSTEP':amount=f'sourceSmoother({amount})'
            elif node.interpolation_type!='LINEAR':raise ValueError('Unsupported Map Range interpolation '+node.interpolation_type)
            result=self.emit(f'mix({d},{e},{amount})','float')
        elif t in ('MIX_RGB','MIX'):
            if t=='MIX_RGB':a,b,f=get(1,'vec3'),get(2,'vec3'),get(0)
            else:
                if node.data_type=='RGBA':a,b,f=get(6,'vec3'),get(7,'vec3'),get(0)
                elif node.data_type=='FLOAT':a,b,f=get(2),get(3),get(0)
                else:raise ValueError('Unsupported source Mix data type '+node.data_type)
            if getattr(node,'clamp_factor',False) or t=='MIX_RGB':f=f'clamp({f},0.0,1.0)'
            op=node.blend_type
            blend={'MIX':b,'MULTIPLY':f'({a}*{b})','ADD':f'({a}+{b})','SUBTRACT':f'({a}-{b})','SCREEN':f'(1.0-(1.0-{a})*(1.0-{b}))'}.get(op)
            if blend is None:raise ValueError('Unsupported source Mix blend '+op)
            expression=f'mix({a},{blend},{f})'
            if getattr(node,'use_clamp',False) or getattr(node,'clamp_result',False):expression=f'clamp({expression},0.0,1.0)'
            result=self.emit(expression,'float' if t=='MIX' and node.data_type=='FLOAT' else 'vec3')
        elif t=='VALTORGB':
            ramp=node.color_ramp
            if ramp.color_mode!='RGB' or ramp.interpolation not in ('LINEAR','EASE','CONSTANT'):raise ValueError('Unsupported source ramp mode')
            f=get(0);els=list(ramp.elements);expr=literal(list(els[-1].color))[0]
            for a,b in reversed(list(zip(els,els[1:]))):
                amount=f'clamp(({f}-{number(a.position)})/{number(max(1e-9,b.position-a.position))},0.0,1.0)'
                if ramp.interpolation=='EASE':amount=f'sourceSmooth({amount})'
                if ramp.interpolation=='CONSTANT':amount='0.0'
                blend=f'mix({literal(list(a.color))[0]},{literal(list(b.color))[0]},{amount})'
                expr=f'({f}<{number(b.position)}?{blend}:{expr})'
            v=self.emit(expr,'vec4');result=(f'{v[0]}.a','float') if index else(f'{v[0]}.rgb','vec3')
        elif t=='BUMP':
            # Match the source height differential and distance/strength; normal
            # perturbation is evaluated in the same surface tangent derivatives.
            index_of=lambda name:list(node.inputs).index(node.inputs[name])
            strength,distance,height=[get(index_of(name)) for name in ('Strength','Distance','Height')]
            width=get(index_of('Filter Width'))
            coordinates=[name for name in ('vSourceUv','vSourcePosition','vSourceWorldPosition') if name in height]
            if not coordinates or not ('texture2D(' in height or 'sourceNoiseFbm3(' in height):
                raise ValueError('Source bump height needs an explicitly resampleable native field: '+self.material.name)
            hx,hy=height,height
            for coordinate in coordinates:
                hx=hx.replace(coordinate,f'({coordinate}+dFdx({coordinate})*{width})')
                hy=hy.replace(coordinate,f'({coordinate}+dFdy({coordinate})*{width})')
            ni=index_of('Normal')
            normal=get(ni,'vec3') if node.inputs[ni].is_linked else '(normalize(vSourceNormal)*(gl_FrontFacing?1.0:-1.0))'
            sign='-1.0' if node.invert else '1.0'
            result=self.emit(f'sourceBump({normal},{height},{hx},{hy},{strength},{distance}*{sign}*(gl_FrontFacing?1.0:-1.0),{width})','vec3')
        elif t=='BSDF_TRANSPARENT':result=('vec4(0.0)','vec4')
        elif t=='EMISSION':result=self.emit(f'vec4({get(0,"vec3")}*{get(1)},1.0)','vec4')
        elif t=='BSDF_DIFFUSE':
            ni=list(node.inputs).index(node.inputs['Normal'])
            normal=get(ni,'vec3') if node.inputs[ni].is_linked else '(normalize(vSourceNormal)*(gl_FrontFacing?1.0:-1.0))'
            self.closures.append({'type':t,'name':node.name,'parameters':[{'index':i,'name':s.name,'expression':self.inp(node,i,environment)} for i,s in enumerate(node.inputs)]})
            ri=list(node.inputs).index(node.inputs['Roughness'])
            result=self.emit(f'vec4(sourceDiffuse({get(0,"vec3")},{get(ri)},{normal}),1.0)','vec4')
        elif t=='BSDF_PRINCIPLED':
            if node.distribution!='MULTI_GGX':raise ValueError('Source Principled distribution is not implemented: '+node.distribution)
            index_of=lambda name:list(node.inputs).index(node.inputs[name])
            base=get(index_of('Base Color'),'vec3');alpha=get(index_of('Alpha'));ni=index_of('Normal')
            normal=get(ni,'vec3') if node.inputs[ni].is_linked else '(normalize(vSourceNormal)*(gl_FrontFacing?1.0:-1.0))'
            emission=get(index_of('Emission Color'),'vec3');strength=get(index_of('Emission Strength'))
            self.closures.append({'type':t,'name':node.name,'distribution':node.distribution,'parameters':[{'index':i,'name':s.name,'expression':self.inp(node,i,environment)} for i,s in enumerate(node.inputs)]})
            roughness=get(index_of('Roughness'));metallic=get(index_of('Metallic'));ior=get(index_of('IOR'))
            specular=get(index_of('Specular IOR Level'));tint=get(index_of('Specular Tint'),'vec3')
            result=self.emit(f'vec4((sourcePrincipled({base},{roughness},{metallic},{ior},{specular},{tint},{normal})+{emission}*{strength})*{alpha},{alpha})','vec4')
        elif t=='MIX_SHADER':result=self.emit(f'mix({get(1,"vec4")},{get(2,"vec4")},clamp({get(0)},0.0,1.0))','vec4')
        elif t=='ADD_SHADER':result=self.emit(f'({get(0,"vec4")}+{get(1,"vec4")})','vec4')
        else:raise ValueError(f'Unsupported source node: {self.material.name}/{node.name}/{t}')
        self.memo[key]=result
        return result

    def resolve_static(self, socket, environment):
        link=socket.links[0]
        n=link.from_node;i=list(n.outputs).index(link.from_socket)
        if n.type=='GROUP_INPUT':
            code,kind=environment[i][0]
            if kind=='float':return float(code.strip('()'))
        if n.type=='VALUE' and not socket_is_animated(n.outputs[i]):return value(n.outputs[i])
        raise ValueError('Unresolved static procedural input: '+self.material.name+'/'+socket.node.name+'/'+socket.name)

    def compile(self):
        output=next(n for n in self.material.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
        result=self.inp(output,0,{})
        glow=[]
        for node in self.material.node_tree.nodes:
            if node.type=='OUTPUT_AOV':
                socket=node.inputs.get('Color')
                if socket and socket.is_linked:glow.append(cast(self.inp(node,list(node.inputs).index(socket),{}),'vec3'))
                else:
                    socket=node.inputs.get('Value')
                    if socket and socket.is_linked:glow.append('vec3('+cast(self.inp(node,list(node.inputs).index(socket),{}),'float')+')')
        surface_nodes={node['node'] for node in self.source_graph if node['tree']==self.material.node_tree.name}
        used_closures=[n for n in self.material.node_tree.nodes if n.name in surface_nodes and n.type in ('BSDF_TRANSPARENT','BSDF_PRINCIPLED')]
        opaque=not any(n.type=='BSDF_TRANSPARENT' or n.inputs['Alpha'].is_linked or socket_is_animated(n.inputs['Alpha']) or abs(value(n.inputs['Alpha'])-1.)>1e-8 for n in used_closures)
        if self.material.surface_render_method not in ('DITHERED','BLENDED'):
            raise ValueError('Unsupported source surface render method: '+self.material.surface_render_method)
        return {'materialName':self.material.name,'objectName':self.obj.name,'uvMapping':self.mapping,
                'body':'\n'.join(self.lines)+f'\nvec4 sourceSurface = {cast(result,"vec4")};\nvec3 sourceGlow = '+('+'.join(glow) if glow else 'vec3(0.0)')+';',
                'uniforms':self.uniforms,'fields':self.fields,'coordinates':self.coordinates,'closureParameters':self.closures,'nodeGraph':self.source_graph,'opaque':opaque,'proceduralPrograms':self.procedural,
                'surfaceRenderMethod':self.material.surface_render_method}


def export_chapter(chapter):
    global COLLECT_DOMAINS
    SHARED_DOMAINS.clear()
    source=Path(OPTIONS.source_root)/NAMES[chapter-1]
    original_sha=sha(source)
    folder=Path(OPTIONS.assets)/f'chapter-{chapter}'
    manifest=json.loads((folder/'scene.json').read_text(encoding='utf8'))
    if manifest.get('sourceSha256')!=original_sha or manifest.get('sourceRevision')!=REVISION:
        raise ValueError('Geometry must first be exported from this exact source revision: '+str(source))
    bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False,load_ui=False)
    scene=bpy.context.scene
    if scene.render.engine not in ('BLENDER_EEVEE','CYCLES'):raise ValueError('Unsupported source render engine')
    scene.frame_set(scene.frame_start)
    bake_scene=setup_bake_scene(scene);cache={};tracks={};programs={};coordinate_tracks={}
    COLLECT_DOMAINS=True
    try:
        for mesh in manifest['meshes']:
            material=bpy.data.materials.get(manifest['materials'][mesh['material']]['name'])
            obj=scene.objects.get(mesh['name'])
            if not material or not obj:raise ValueError('Stale source/manifest object: '+mesh['name'])
            Compiler(material,obj,manifest,scene,folder,bake_scene,{},{}).compile()
    finally:COLLECT_DOMAINS=False
    for mesh in manifest['meshes']:
        name=manifest['materials'][mesh['material']]['name']
        material=bpy.data.materials.get(name)
        obj=scene.objects.get(mesh['name'])
        if not material or not obj:raise ValueError('Manifest/source material mapping is stale: '+mesh['name'])
        compiler=Compiler(material,obj,manifest,scene,folder,bake_scene,cache,tracks)
        program=compiler.compile()
        for uniform,target in program['coordinates'].items():
            coordinate_tracks[target.name]={'object':target,'values':[]}
        del program['coordinates']
        programs[str(mesh['material'])+':'+mesh['name']]=program
        if OPTIONS.verbose:print('SOURCE_MATERIAL',chapter,mesh['name'],len(program['fields']),flush=True)
    for frame in range(scene.frame_start,scene.frame_end+1):
        scene.frame_set(frame)
        for item in tracks.values():item['values'].append(value(item['socket']))
        for item in coordinate_tracks.values():
            m=item['object'].matrix_world.inverted();item['values'].append([float(m[r][c]) for c in range(4) for r in range(4)])
    track_records={}
    for key,item in tracks.items():
        values=item['values'];samples=[{'frame':scene.frame_start+i,'value':v} for i,v in enumerate(values)
            if i==0 or i==len(values)-1 or not(values[i-1]==v==values[i+1])]
        track_records[key]={'id':item['id'],'samples':samples,'sourcePath':item['socket'].path_from_id('default_value'),'sourceTree':item['socket'].id_data.name}
    coord_records={name:{'samples':[{'frame':scene.frame_start+i,'value':v} for i,v in enumerate(item['values'])
        if i==0 or i==len(item['values'])-1 or not(item['values'][i-1]==v==item['values'][i+1])]} for name,item in coordinate_tracks.items()}
    result={'version':1,'sourceRevision':REVISION,'sourceSha256':original_sha,'frameRange':[scene.frame_start,scene.frame_end],
            'fps':scene.render.fps,'fpsBase':scene.render.fps_base,'programs':programs,'tracks':track_records,'coordinateTracks':coord_records,
            'fields':list(cache.values()),'nativeFieldResolution':OPTIONS.resolution,'paperFieldResolution':OPTIONS.paper_resolution,
            'nativeVersion':bpy.app.version_string,'sourceUnchanged':original_sha==sha(source)}
    if not result['sourceUnchanged']:raise ValueError('Source changed during material export')
    target=folder/'source-materials.json';temporary=target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8');temporary.replace(target)
    print('SOURCE_MATERIAL_CHAPTER_COMPLETE',chapter,len(programs),len(tracks),len(cache),flush=True)


for chapter in map(int,OPTIONS.chapters.split(',')):export_chapter(chapter)
