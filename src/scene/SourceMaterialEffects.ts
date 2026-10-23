import * as THREE from 'three';

type Value = number | number[];
type Kind = 'float' | 'vec3' | 'vec4';
interface Socket { index: number; name: string; value: unknown; linked?: boolean }
interface SourceNode { name: string; type: string; inputs: Socket[]; outputs: Socket[]; [key: string]: unknown }
interface Link { from: string; outIndex: number; to: string; inIndex: number }
interface Graph { name: string; nodes: SourceNode[]; links: Link[] }
export interface SourceScalarSample { frame: number; progress?: number; value: number }
export interface SourceEffectMaterial extends Graph {
  materialId?: number; users?: string[]; kind?: string; progressScalarKey?: string;
}
export interface SourceEffects {
  materials: SourceEffectMaterial[];
  scalarTracks: Record<string, SourceScalarSample[]>;
  nodeGroups?: Graph[];
  coordinateObjects?: { name: string; matrix: number[] }[];
}
/** material is the integer material id in manifest.meshes, not a material object. */
export interface SourceEffectMeshDefinition { name: string; material: number }
interface Evaluation { original: number[]; uv: number[]; local: number[]; world: number[]; cache: Map<number, Value> }
interface Expression { kind: Kind; code: string; run: (context: Evaluation) => Value }
interface TrackUniform { key: string; uniform: THREE.IUniform<number>; track: SourceScalarSample[]; min: number; max: number }

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const vector = (value: Value, size: number) => typeof value === 'number' ? Array(size).fill(value) as number[] : Array.from({ length: size }, (_, i) => value[i] ?? (i === 3 ? 1 : 0));
const scalar = (value: Value) => typeof value === 'number' ? value : (value[0] * .2126 + value[1] * .7152 + value[2] * .0722);
const mix = (a: Value, b: Value, t: number): Value => typeof a === 'number' && typeof b === 'number' ? a + (b - a) * t : vector(a, 4).map((x, i) => x + (vector(b, 4)[i] - x) * t);
const hash = (text: string) => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return (value >>> 0).toString(16); };
const fract = (value: number) => value - Math.floor(value);
function noiseHash(p: number[]) { return fract(Math.sin(p[0] * 127.1 + p[1] * 311.7 + p[2] * 74.7) * 43758.5453123); }
function valueNoise(p: number[]) {
  const cell = p.map(Math.floor), t = p.map(value => { const f = fract(value); return f * f * (3 - 2 * f); });
  let result = 0;
  for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) result += noiseHash([cell[0] + x, cell[1] + y, cell[2] + z]) * (x ? t[0] : 1 - t[0]) * (y ? t[1] : 1 - t[1]) * (z ? t[2] : 1 - t[2]);
  return result;
}
function fbm(p: number[], detail: number, roughness: number, lacunarity: number) {
  let result = 0, weight = 1, total = 0;
  for (let i = 0; i < 7; i++) {
    const amount = clamp(detail + 1 - i); if (amount <= 0) break;
    result += valueNoise(p) * weight * amount; total += weight * amount;
    weight *= roughness; p = p.map(value => value * lacunarity);
  }
  return result / Math.max(total, .00001);
}
function voronoi(p: number[], randomness: number, dimensions = 3) {
  const base = p.map(Math.floor), f = p.map(fract); let distance = 8;
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    if (dimensions === 2 && z !== 0) continue;
    const cell = [base[0] + x, base[1] + y, base[2] + z];
    const random = [noiseHash(cell), noiseHash(cell.map(value => value + 19.19)), noiseHash(cell.map(value => value + 47.47))];
    distance = Math.min(distance, Math.hypot(x + random[0] * randomness - f[0], y + random[1] * randomness - f[1], dimensions === 2 ? 0 : z + random[2] * randomness - f[2]));
  }
  return distance;
}

/** The exported samples contain Blender's actual driver/Bezier evaluations.
 * Frame-based interpolation keeps trimmed chapter ranges (e.g. 33..2184) exact. */
export function sampleSourceScalar(track: SourceScalarSample[], sourceProgress: number, frameRange: readonly number[]) {
  if (!track.length) return 0;
  const frame = frameRange[0] + clamp(sourceProgress) * (frameRange[1] - frameRange[0]);
  if (frame <= track[0].frame) return track[0].value;
  if (frame >= track.at(-1)!.frame) return track.at(-1)!.value;
  let low = 0, high = track.length - 1;
  while (high - low > 1) { const mid = (low + high) >>> 1; if (track[mid].frame <= frame) low = mid; else high = mid; }
  const a = track[low], b = track[high];
  return a.value + (b.value - a.value) * (frame - a.frame) / Math.max(.00001, b.frame - a.frame);
}

const shaderFunctions = /* glsl */`
varying vec2 mdgsEffectUv;
varying vec3 mdgsEffectLocal;
varying vec3 mdgsEffectWorld;
uniform float mdgsEffectMode;
uniform float mdgsEffectFullAlpha;
float mdgsHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123); }
float mdgsNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(mdgsHash(i),mdgsHash(i+vec3(1,0,0)),f.x),mix(mdgsHash(i+vec3(0,1,0)),mdgsHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(mdgsHash(i+vec3(0,0,1)),mdgsHash(i+vec3(1,0,1)),f.x),mix(mdgsHash(i+vec3(0,1,1)),mdgsHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float mdgsFbm(vec3 p,float detail,float roughness,float lacunarity) {
  float value=0.0,total=0.0,weight=1.0;
  for(int i=0;i<7;i++) { float amount=clamp(detail+1.0-float(i),0.0,1.0);if(amount<=0.0)break;value+=mdgsNoise(p)*weight*amount;total+=weight*amount;weight*=roughness;p*=lacunarity; }
  return value/max(total,0.00001);
}
vec3 mdgsWarp(vec3 p,float amount) {
  if(abs(amount)<0.000001)return p;
  return p+amount*vec3(mdgsNoise(p),mdgsNoise(p+19.19),mdgsNoise(p+47.47));
}
float mdgsVoronoi(vec3 p,float randomness,float dimensions) {
  vec3 base=floor(p),f=fract(p);float nearest=8.0;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
    if(dimensions<2.5&&z!=0)continue;
    vec3 offset=vec3(float(x),float(y),float(z)),cell=base+offset;
    vec3 random=vec3(mdgsHash(cell),mdgsHash(cell+19.19),mdgsHash(cell+47.47));
    vec3 delta=offset+random*randomness-f;if(dimensions<2.5)delta.z=0.0;
    nearest=min(nearest,length(delta));
  }
  return nearest;
}
float mdgsMap(float value,float fromMin,float fromMax,float toMin,float toMax,float interpolate,float clipped) {
  float denominator=fromMax-fromMin;
  float t=abs(denominator)<0.000001?0.0:(value-fromMin)/denominator;
  if(clipped>0.5||interpolate>0.5)t=clamp(t,0.0,1.0);
  if(interpolate>1.5)t=t*t*t*(t*(t*6.0-15.0)+10.0);else if(interpolate>0.5)t=t*t*(3.0-2.0*t);
  return mix(toMin,toMax,t);
}
`;

type Interval = readonly [number, number];
const unknownInterval: Interval = [-Infinity, Infinity];
const unitInterval: Interval = [0, 1];
const exactInterval = (value: number): Interval => [value, value];
const clampInterval = (value: Interval): Interval => [clamp(value[0]), clamp(value[1])];
function intervalProduct(a: Interval, b: Interval): Interval {
  if (a[0] === 0 && a[1] === 0 || b[0] === 0 && b[1] === 0) return [0, 0];
  const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return values.some(Number.isNaN) ? unknownInterval : [Math.min(...values), Math.max(...values)];
}

/** Prove a completed mask constant over its entire coordinate domain. Sampling
 * the centre is insufficient: native scenic layers can retain UV edge feathers
 * after their timed reveal has finished. Unknown nodes/coordinates deliberately
 * fail this proof and keep the original graph active. Image alpha is 1 here
 * because Three has already applied the original texture alpha exactly once. */
function completedAlphaInterval(effects: SourceEffects, material: SourceEffectMaterial, tracks: TrackUniform[]): Interval {
  const maxima = new Map(tracks.map(track => [track.key, track.max]));
  const groups = new Map((effects.nodeGroups ?? []).map(group => [group.name, group]));
  type Scope = { graph: Graph; root: boolean; args?: Interval[]; cache: Map<string, Interval> };
  function read(scope: Scope, name: string, outputIndex = 0, alpha = false): Interval {
    const key = `${name}:${outputIndex}:${alpha}`, cached = scope.cache.get(key); if (cached) return cached;
    const node = scope.graph.nodes.find(item => item.name === name); if (!node) return unknownInterval;
    const fixed = (socket: Socket | undefined, direction: 'inputs' | 'outputs'): Interval => {
      const trackKey = socket && scope.root ? `${material.name}|nodes[${JSON.stringify(node.name)}].${direction}[${socket.index}].default_value` : '';
      const value = maxima.get(trackKey) ?? socket?.value;
      return typeof value === 'number' ? exactInterval(value) : unknownInterval;
    };
    const input = (index: number, shaderAlpha = false): Interval => {
      const socket = node.inputs.find(item => item.index === index);
      const trackKey = socket && scope.root ? `${material.name}|nodes[${JSON.stringify(node.name)}].inputs[${socket.index}].default_value` : '';
      if (maxima.has(trackKey)) return exactInterval(maxima.get(trackKey)!);
      const link = scope.graph.links.find(item => item.to === node.name && item.inIndex === index);
      return link ? read(scope, link.from, link.outIndex, shaderAlpha) : fixed(socket, 'inputs');
    };
    const named = (name: string, fallback: number) => input(node.inputs.find(socket => socket.name === name)?.index ?? fallback);
    let result = unknownInterval;
    if (node.type === 'BSDF_TRANSPARENT') result = exactInterval(0);
    else if (node.type === 'BSDF_PRINCIPLED') result = clampInterval(named('Alpha', 4));
    else if (node.type === 'EMISSION' || node.type === 'BSDF_DIFFUSE') result = exactInterval(1);
    else if (node.type === 'MIX_SHADER' && alpha) {
      const a = input(1, true), b = input(2, true), t = clampInterval(input(0));
      // Equal constant shader alphas are independent of their colour mix.
      if (a[0] === a[1] && a[0] === b[0] && b[0] === b[1]) result = a;
      else {
        const values = [a[0], a[1]].flatMap(x => [b[0], b[1]].flatMap(y => [t[0], t[1]].map(amount => x + (y - x) * amount)));
        result = values.some(Number.isNaN) ? unknownInterval : [Math.min(...values), Math.max(...values)];
      }
    } else if (node.type === 'TEX_IMAGE' && outputIndex === 1) result = exactInterval(1);
    else if (node.type === 'VALUE') result = fixed(node.outputs.find(socket => socket.index === outputIndex), 'outputs');
    else if (node.type === 'GROUP_INPUT') result = scope.args?.[outputIndex] ?? unknownInterval;
    else if (node.type === 'GROUP') {
      const group = groups.get(String(node.group ?? node.node_tree ?? ''));
      const output = group?.nodes.find(item => item.type === 'GROUP_OUTPUT');
      const link = group?.links.find(item => item.to === output?.name && item.inIndex === outputIndex);
      if (group && link) result = read({ graph: group, root: false, args: node.inputs.map(socket => input(socket.index)), cache: new Map() }, link.from, link.outIndex, alpha);
    } else if (node.type === 'SEPXYZ') {
      const link = scope.graph.links.find(item => item.to === node.name && item.inIndex === 0);
      const coordinates = scope.graph.nodes.find(item => item.name === link?.from);
      if (coordinates?.type === 'TEX_COORD' && (link?.outIndex === 0 || link?.outIndex === 2)) result = outputIndex < 2 ? unitInterval : exactInterval(link.outIndex === 2 ? 0 : .5);
    } else if (node.type === 'TEX_NOISE' && outputIndex === 0) result = unitInterval;
    else if (node.type === 'MATH') {
      const a = input(0), b = input(1), operation = String(node.operation ?? '');
      if (operation === 'MULTIPLY') result = intervalProduct(a, b);
      else if (operation === 'ADD') result = [a[0] + b[0], a[1] + b[1]];
      else if (operation === 'SUBTRACT') result = [a[0] - b[1], a[1] - b[0]];
      else if (operation === 'MULTIPLY_ADD') { const product = intervalProduct(a, b), c = input(2); result = [product[0] + c[0], product[1] + c[1]]; }
      else if (operation === 'MINIMUM') result = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
      else if (operation === 'MAXIMUM') result = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      else if (operation === 'ABSOLUTE') result = [a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(Math.abs(a[0]), Math.abs(a[1])), Math.max(Math.abs(a[0]), Math.abs(a[1]))];
      else if (operation === 'GREATER_THAN') result = a[0] > b[1] ? exactInterval(1) : a[1] <= b[0] ? exactInterval(0) : unitInterval;
      else if (operation === 'LESS_THAN') result = a[1] < b[0] ? exactInterval(1) : a[0] >= b[1] ? exactInterval(0) : unitInterval;
      if (node.use_clamp) result = clampInterval(result);
    } else if (node.type === 'MAP_RANGE') {
      const value = input(0), fromMin = input(1), fromMax = input(2), toMin = input(3), toMax = input(4);
      if ([fromMin, fromMax, toMin, toMax].every(range => Number.isFinite(range[0]) && range[0] === range[1])) {
        const interpolate = String(node.interpolation_type ?? 'LINEAR');
        const map = (x: number) => {
          let t = Math.abs(fromMax[0] - fromMin[0]) < .000001 ? 0 : (x - fromMin[0]) / (fromMax[0] - fromMin[0]);
          if (node.clamp !== false || interpolate === 'SMOOTHSTEP' || interpolate === 'SMOOTHERSTEP') t = clamp(t);
          if (interpolate === 'SMOOTHERSTEP') t = t * t * t * (t * (t * 6 - 15) + 10); else if (interpolate === 'SMOOTHSTEP') t = t * t * (3 - 2 * t);
          return toMin[0] + (toMax[0] - toMin[0]) * t;
        };
        const low = map(value[0]), high = map(value[1]);
        if (!Number.isNaN(low) && !Number.isNaN(high)) result = [Math.min(low, high), Math.max(low, high)];
      }
    }
    scope.cache.set(key, result); return result;
  }
  const output = material.nodes.find(node => node.type === 'OUTPUT_MATERIAL');
  const link = material.links.find(item => item.to === output?.name && item.inIndex === 0);
  return link ? clampInterval(read({ graph: material, root: true, cache: new Map() }, link.from, link.outIndex, true)) : unknownInterval;
}

/** A deliberately small translator for the reachable source shader graph.
 * Noise/Voronoi are deterministic WebGL approximations, not Cycles bit matches.
 * Links, static parameters, sampled scalar curves and coordinate transforms are
 * retained. Original image UVs are never warped: only the reveal mask is. */
export function compileSourceEffectGraph(effects: SourceEffects, material: SourceEffectMaterial) {
  const uniforms: Record<string, THREE.IUniform> = {};
  const tracks: TrackUniform[] = [];
  const declarations: string[] = [], lines: string[] = [];
  const groups = new Map((effects.nodeGroups ?? []).map(group => [group.name, group]));
  const coordinates = new Map((effects.coordinateObjects ?? []).map(object => [object.name, object]));
  const unsupported = new Set<string>(), visited = new Set<string>();
  let counter = 0, uniformCounter = 0;
  const constant = (kind: Kind, value: Value): Expression => {
    const name = `mdgsU${uniformCounter++}`;
    uniforms[name] = { value: kind === 'float' ? scalar(value) : kind === 'vec3' ? new THREE.Vector3(...vector(value, 3) as [number, number, number]) : new THREE.Vector4(...vector(value, 4) as [number, number, number, number]) };
    declarations.push(`uniform ${kind} ${name};`);
    return { kind, code: name, run: () => {
      const current = uniforms[name].value;
      return typeof current === 'number' ? current : current.toArray() as number[];
    } };
  };
  const literal = (kind: Kind, code: string, run: Expression['run']): Expression => ({ kind, code, run });
  const emit = (kind: Kind, code: string, run: Expression['run']): Expression => {
    const id = counter++, name = `mdgsN${id}`; lines.push(`${kind} ${name}=${code};`);
    return { kind, code: name, run: context => { const cached = context.cache.get(id); if (cached !== undefined) return cached; const value = run(context); context.cache.set(id, value); return value; } };
  };
  const cast = (expression: Expression, kind: Kind): Expression => {
    if (expression.kind === kind) return expression;
    if (kind === 'float') return literal(kind, `dot(${expression.code}.xyz,vec3(0.2126,0.7152,0.0722))`, context => scalar(expression.run(context)));
    if (expression.kind === 'float') return literal(kind, `${kind}(${expression.code})`, context => vector(expression.run(context), kind === 'vec3' ? 3 : 4));
    if (kind === 'vec3') return literal(kind, `${expression.code}.xyz`, context => vector(expression.run(context), 3));
    return literal(kind, `vec4(${expression.code},1.0)`, context => [...vector(expression.run(context), 3), 1]);
  };
  const valueFromSocket = (socket?: Socket): Value => typeof socket?.value === 'number' ? socket.value : Array.isArray(socket?.value) ? socket!.value.map(value => Number(value) || 0) : 0;
  type Scope = { graph: Graph; args?: Expression[]; cache: Map<string, Expression>; root: boolean; scopes?: Map<string, Scope> };
  function compile(scope: Scope, name: string, outputIndex = 0): Expression {
    const key = `${name}:${outputIndex}`; const cached = scope.cache.get(key); if (cached) return cached;
    const node = scope.graph.nodes.find(item => item.name === name);
    if (!node) { unsupported.add(`missing:${name}`); return constant('float', 0); }
    visited.add(`${scope.graph.name}/${node.name}`);
    const override = (socket: Socket | undefined, direction: 'inputs' | 'outputs') => {
      if (!scope.root || !socket) return null;
      const trackKey = `${material.name}|nodes[${JSON.stringify(node.name)}].${direction}[${socket.index}].default_value`;
      const track = effects.scalarTracks[trackKey]; if (!track?.length) return null;
      const expression = constant('float', track[0].value);
      tracks.push({ key: trackKey, uniform: uniforms[expression.code] as THREE.IUniform<number>, track,
        min: Math.min(...track.map(sample => sample.value)), max: Math.max(...track.map(sample => sample.value)) });
      return expression;
    };
    const input = (index: number, kind: Kind = 'float'): Expression => {
      const socket = node.inputs.find(item => item.index === index);
      const animated = override(socket, 'inputs'); if (animated) return cast(animated, kind);
      const link = scope.graph.links.find(item => item.to === node.name && item.inIndex === index);
      return link ? cast(compile(scope, link.from, link.outIndex), kind) : constant(kind, valueFromSocket(socket));
    };
    const named = (name: string, fallback: number, kind: Kind = 'float') => input(node.inputs.find(socket => socket.name === name)?.index ?? fallback, kind);
    const operation = String(node.operation ?? '');
    let result: Expression;
    if (node.type === 'VALUE') result = override(node.outputs.find(socket => socket.index === outputIndex), 'outputs') ?? constant('float', valueFromSocket(node.outputs[outputIndex]));
    else if (node.type === 'RGB') result = constant('vec4', valueFromSocket(node.outputs[outputIndex]));
    else if (node.type === 'GROUP_INPUT') result = scope.args?.[outputIndex] ?? constant('float', 0);
    else if (node.type === 'GROUP') {
      const group = groups.get(String(node.group ?? node.node_tree ?? ''));
      if (!group) { unsupported.add(`group:${String(node.group)}`); result = constant('float', 1); }
      else {
        scope.scopes ??= new Map();
        let nested = scope.scopes.get(node.name);
        if (!nested) {
          const args = node.inputs.map(socket => input(socket.index, Array.isArray(socket.value) ? socket.value.length === 4 ? 'vec4' : 'vec3' : 'float'));
          nested = { graph: group, args, cache: new Map(), root: false }; scope.scopes.set(node.name, nested);
        }
        const output = group.nodes.find(item => item.type === 'GROUP_OUTPUT');
        const link = group.links.find(item => item.to === output?.name && item.inIndex === outputIndex);
        result = link ? compile(nested, link.from, link.outIndex) : constant('float', 0);
      }
    } else if (node.type === 'TEX_IMAGE') result = outputIndex === 1
      ? literal('float', '1.0', () => 1) // Three already sampled image alpha; apply it exactly once.
      : literal('vec4', 'vec4(mdgsOriginal.rgb,1.0)', context => [...context.original.slice(0, 3), 1]);
    else if (node.type === 'TEX_COORD') {
      if (outputIndex === 2) result = literal('vec3', 'vec3(mdgsEffectUv,0.0)', context => [context.uv[0], context.uv[1], 0]);
      else if (outputIndex === 3 && coordinates.has(String(node.object))) {
        const matrix = new THREE.Matrix4().fromArray(coordinates.get(String(node.object))!.matrix).invert();
        const uniform = `mdgsU${uniformCounter++}`; uniforms[uniform] = { value: matrix }; declarations.push(`uniform mat4 ${uniform};`);
        result = emit('vec3', `(${uniform}*vec4(mdgsEffectWorld,1.0)).xyz`, context => new THREE.Vector3(...context.world as [number, number, number]).applyMatrix4(matrix).toArray());
      } else if (outputIndex === 3) result = literal('vec3', 'mdgsEffectLocal', context => context.local);
      else if (outputIndex === 0) result = literal('vec3', 'vec3(mdgsEffectUv,0.5)', context => [context.uv[0], context.uv[1], .5]);
      else { unsupported.add(`coordinate:${outputIndex}`); result = constant('vec3', [0, 0, 1]); }
    } else if (node.type === 'SEPXYZ') {
      const a = input(0, 'vec3'); result = emit('float', `${a.code}.${['x', 'y', 'z'][outputIndex]}`, context => vector(a.run(context), 3)[outputIndex]);
    } else if (node.type === 'MATH') {
      const a = input(0), b = input(1), c = operation === 'MULTIPLY_ADD' ? input(2) : null;
      const code: Record<string, string> = { MULTIPLY: `${a.code}*${b.code}`, ADD: `${a.code}+${b.code}`, SUBTRACT: `${a.code}-${b.code}`, MULTIPLY_ADD: `${a.code}*${b.code}+${c?.code}`, MINIMUM: `min(${a.code},${b.code})`, MAXIMUM: `max(${a.code},${b.code})`, ABSOLUTE: `abs(${a.code})`, GREATER_THAN: `float(${a.code}>${b.code})`, LESS_THAN: `float(${a.code}<${b.code})`, DIVIDE: `${a.code}/max(abs(${b.code}),0.000001)` };
      if (!code[operation]) unsupported.add(`math:${operation}`);
      const evaluate = (context: Evaluation) => { const x = scalar(a.run(context)), y = scalar(b.run(context));
        const operations: Record<string, number> = { MULTIPLY: x * y, ADD: x + y, SUBTRACT: x - y, MULTIPLY_ADD: x * y + (c ? scalar(c.run(context)) : 0), MINIMUM: Math.min(x, y), MAXIMUM: Math.max(x, y), ABSOLUTE: Math.abs(x), GREATER_THAN: x > y ? 1 : 0, LESS_THAN: x < y ? 1 : 0, DIVIDE: x / Math.max(Math.abs(y), .000001) };
        return node.use_clamp ? clamp(operations[operation] ?? 0) : operations[operation] ?? 0; };
      result = emit('float', node.use_clamp ? `clamp(${code[operation] ?? '0.0'},0.0,1.0)` : code[operation] ?? '0.0', evaluate);
    } else if (node.type === 'VECT_MATH') {
      const a = input(0, 'vec3'), b = input(1, 'vec3'), scale = operation === 'SCALE' ? named('Scale', 3) : null;
      const code: Record<string, string> = { MULTIPLY: `${a.code}*${b.code}`, ADD: `${a.code}+${b.code}`, SUBTRACT: `${a.code}-${b.code}`, SCALE: `${a.code}*${scale?.code}`, LENGTH: `length(${a.code})` };
      if (!code[operation]) unsupported.add(`vector:${operation}`);
      result = emit(operation === 'LENGTH' ? 'float' : 'vec3', code[operation] ?? 'vec3(0.0)', context => {
        const x = vector(a.run(context), 3), y = vector(b.run(context), 3);
        if (operation === 'LENGTH') return Math.hypot(...x);
        return x.map((value, i) => operation === 'MULTIPLY' ? value * y[i] : operation === 'SUBTRACT' ? value - y[i] : operation === 'SCALE' ? value * scalar(scale!.run(context)) : value + y[i]);
      });
    } else if (node.type === 'MAP_RANGE' || node.type === 'CLAMP') {
      const a = input(0), b = input(1), c = input(2);
      if (node.type === 'CLAMP') result = emit('float', `clamp(${a.code},${b.code},${c.code})`, context => clamp(scalar(a.run(context)), scalar(b.run(context)), scalar(c.run(context))));
      else {
        const d = input(3), e = input(4), interpolation = String(node.interpolation_type ?? 'LINEAR');
        const interpolationValue = interpolation === 'SMOOTHERSTEP' ? 2 : interpolation === 'SMOOTHSTEP' ? 1 : 0;
        const clipped = node.clamp !== false;
        result = emit('float', `mdgsMap(${a.code},${b.code},${c.code},${d.code},${e.code},${interpolationValue}.0,${clipped ? '1.0' : '0.0'})`, context => {
          const low = scalar(b.run(context)), high = scalar(c.run(context)); let t = Math.abs(high - low) < .000001 ? 0 : (scalar(a.run(context)) - low) / (high - low);
          if (clipped || interpolationValue) t = clamp(t);
          if (interpolationValue === 2) t = t * t * t * (t * (t * 6 - 15) + 10); else if (interpolationValue) t = t * t * (3 - 2 * t);
          return scalar(d.run(context)) + (scalar(e.run(context)) - scalar(d.run(context))) * t;
        });
      }
    } else if (node.type === 'TEX_NOISE') {
      const p = input(0, 'vec3'), scale = named('Scale', 2), detail = named('Detail', 3), rough = named('Roughness', 4), lacunarity = named('Lacunarity', 5);
      const w = node.noise_dimensions === '4D' ? named('W', 1) : null, distortion = named('Distortion', 8);
      const coordinates = emit('vec3', `${p.code}*${scale.code}${w ? `+vec3(0.7548,0.5698,0.4382)*${w.code}` : ''}`, context => vector(p.run(context), 3).map((value, i) => value * scalar(scale.run(context)) + (w ? [.7548, .5698, .4382][i] * scalar(w.run(context)) : 0)));
      const distorted = emit('vec3', `mdgsWarp(${coordinates.code},${distortion.code})`, context => {
        const values = vector(coordinates.run(context), 3), amount = scalar(distortion.run(context));
        if (Math.abs(amount) < .000001) return values;
        return values.map((value, i) => value + amount * valueNoise(values.map(component => component + [0, 19.19, 47.47][i])));
      });
      const args = `${distorted.code},${detail.code},${rough.code},${lacunarity.code}`;
      const evaluate = (context: Evaluation, offset = 0) => fbm(vector(distorted.run(context), 3).map(value => value + offset), scalar(detail.run(context)), scalar(rough.run(context)), scalar(lacunarity.run(context)));
      result = outputIndex === 0 ? emit('float', `mdgsFbm(${args})`, context => evaluate(context))
        : emit('vec4', `vec4(mdgsFbm(${args}),mdgsFbm(${distorted.code}+19.19,${detail.code},${rough.code},${lacunarity.code}),mdgsFbm(${distorted.code}+47.47,${detail.code},${rough.code},${lacunarity.code}),1.0)`, context => [evaluate(context), evaluate(context, 19.19), evaluate(context, 47.47), 1]);
    } else if (node.type === 'TEX_VORONOI') {
      const p = input(0, 'vec3'), scale = named('Scale', 2), random = named('Randomness', 8);
      const dimensions = node.voronoi_dimensions === '2D' ? 2 : 3;
      result = emit('float', `mdgsVoronoi(${p.code}*${scale.code},${random.code},${dimensions}.0)`, context => voronoi(vector(p.run(context), 3).map(value => value * scalar(scale.run(context))), scalar(random.run(context)), dimensions));
    } else if (node.type === 'RGBTOBW') {
      const a = input(0, 'vec4'); result = emit('float', `dot(${a.code}.rgb,vec3(0.2126,0.7152,0.0722))`, context => scalar(a.run(context)));
    } else if (node.type === 'MIX_RGB' || node.type === 'MIX' || node.type === 'MIX_SHADER') {
      const kind: Kind = node.type === 'MIX' && node.data_type === 'FLOAT' ? 'float' : node.type === 'MIX' && node.data_type === 'VECTOR' ? 'vec3' : 'vec4';
      const offset = node.type === 'MIX' ? kind === 'float' ? 2 : kind === 'vec3' ? 4 : 6 : 1;
      const t = input(0), a = input(offset, kind), b = input(offset + 1, kind);
      if (node.blend_type && node.blend_type !== 'MIX') unsupported.add(`mix:${String(node.blend_type)}`);
      result = emit(kind, `mix(${a.code},${b.code},clamp(${t.code},0.0,1.0))`, context => {
        const v = mix(a.run(context), b.run(context), clamp(scalar(t.run(context)))); return kind === 'vec3' ? vector(v, 3) : v;
      });
    } else if (node.type === 'BSDF_TRANSPARENT') result = literal('vec4', 'vec4(0.0)', () => [0, 0, 0, 0]);
    else if (node.type === 'BSDF_PRINCIPLED' || node.type === 'BSDF_DIFFUSE' || node.type === 'EMISSION') {
      const color = named(node.type === 'BSDF_PRINCIPLED' ? 'Base Color' : 'Color', 0, 'vec4');
      const alpha = node.type === 'BSDF_PRINCIPLED' ? named('Alpha', 4) : constant('float', 1);
      const emissionStrength = node.inputs.find(socket => socket.name === 'Emission Strength');
      const emission = node.type === 'BSDF_PRINCIPLED' && emissionStrength?.linked ? named('Emission Color', 28, 'vec4') : null;
      const strength = emission ? input(emissionStrength!.index) : null;
      const glowStrength = node.type === 'EMISSION' ? named('Strength', 1) : null;
      const base = glowStrength ? `${color.code}.rgb*${glowStrength.code}` : `${color.code}.rgb`;
      const extra = emission ? `+min(${emission.code}.rgb*${strength!.code},vec3(1.5))` : '';
      result = emit('vec4', `vec4((${base}${extra})*clamp(${alpha.code},0.0,1.0),clamp(${alpha.code},0.0,1.0))`, context => {
        const c = vector(color.run(context), 4), a = clamp(scalar(alpha.run(context))), e = emission ? vector(emission.run(context), 4) : null;
        return [c[0], c[1], c[2]].map((value, i) => (value * (glowStrength ? scalar(glowStrength.run(context)) : 1) + (e ? Math.min(e[i] * scalar(strength!.run(context)), 1.5) : 0)) * a).concat(a);
      });
    } else {
      unsupported.add(node.type); result = constant('float', 1);
    }
    scope.cache.set(key, result); return result;
  }
  const output = material.nodes.find(node => node.type === 'OUTPUT_MATERIAL');
  const link = material.links.find(item => item.to === output?.name && item.inIndex === 0);
  const expression = link ? cast(compile({ graph: material, cache: new Map(), root: true }, link.from, link.outIndex), 'vec4') : literal('vec4', 'vec4(mdgsOriginal.rgb,1.0)', context => [...context.original.slice(0, 3), 1]);
  const code = `${shaderFunctions}\n${declarations.join('\n')}\nvec4 mdgsSourceGraph(vec4 mdgsOriginal){\n${lines.join('\n')}\nreturn ${expression.code};\n}`;
  const progressTracks = tracks.filter(track => !/火线强度|火芯强度/.test(track.key));
  const completedAlphaBounds = completedAlphaInterval(effects, material, tracks);
  const fullAlphaInvariant = Number.isFinite(completedAlphaBounds[0]) && completedAlphaBounds[0] === completedAlphaBounds[1];
  const fullAlpha = fullAlphaInvariant ? completedAlphaBounds[0] : 1;
  let mode = 0;
  function update(sourceProgress: number, frameRange: readonly number[]) {
    for (const track of tracks) track.uniform.value = sampleSourceScalar(track.track, sourceProgress, frameRange);
    const primary = tracks.find(track => track.key === material.progressScalarKey) ?? progressTracks[0];
    const fadedOut = progressTracks.some(track => /清晰显现/.test(track.key) && track.min >= 0 && track.max <= 1.00001 && track.uniform.value <= .000001);
    const hidden = fadedOut || !!primary && primary.min <= 0 && primary.uniform.value <= primary.min + .000001;
    const complete = progressTracks.length > 0 && progressTracks.every(track => track.max > 0 && track.uniform.value >= track.max - .000001);
    mode = hidden ? -1 : complete && fullAlphaInvariant ? 1 : 0;
    return mode;
  }
  function evaluate(uv = [.5, .5], original = [.4, .3, .2, 1], local = [0, 0, 0], world = [0, 0, 0]) {
    return vector(expression.run({ uv, original, local, world, cache: new Map() }), 4);
  }
  // Keep spatial alpha masks in the graph even after all timed tracks finish.
  // Only a conservative interval proof permits replacing alpha by a constant;
  // this also retains native constant transparency without touching opacity.
  return { code, uniforms, tracks, unsupported: [...unsupported], nodeCount: visited.size, programKey: hash(code), fullAlpha,
    fullAlphaInvariant, completedAlphaBounds, update, evaluate, get mode() { return mode; } };
}

type CompiledGraph = ReturnType<typeof compileSourceEffectGraph>;
interface Binding { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; graph: CompiledGraph; mode: THREE.IUniform<number>; restore: () => void }

/** Source-clock effects are shader uniforms, separate from MotionDirector's
 * material opacity. Hidden layers and proven constant completed alpha masks
 * bypass procedural evaluation; completed spatial feathers remain intact. */
export class SourceMaterialEffects {
  private bindings: Binding[] = [];
  private progress = 0;
  private sourceById = new Map<number, SourceEffectMaterial>();
  private sourceByUser = new Map<string, SourceEffectMaterial>();
  constructor(private effects: SourceEffects | undefined, private frameRange: readonly number[]) {
    for (const material of effects?.materials ?? []) {
      if (typeof material.materialId === 'number') this.sourceById.set(material.materialId, material);
      for (const user of material.users ?? []) this.sourceByUser.set(user, material);
    }
  }
  register(mesh: THREE.Mesh, definition: SourceEffectMeshDefinition) {
    const source = this.sourceById.get(definition.material) ?? this.sourceByUser.get(definition.name);
    if (!this.effects || !source || !(mesh.material instanceof THREE.MeshBasicMaterial)) return false;
    const material = mesh.material, graph = compileSourceEffectGraph(this.effects, source);
    const mode = { value: graph.update(this.progress, this.frameRange) };
    const previousCompile = material.onBeforeCompile, previousCache = material.customProgramCacheKey;
    const originalCache = previousCache.call(material);
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, graph.uniforms, { mdgsEffectMode: mode, mdgsEffectFullAlpha: { value: graph.fullAlpha } });
      shader.vertexShader = `varying vec2 mdgsEffectUv;varying vec3 mdgsEffectLocal;varying vec3 mdgsEffectWorld;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nmdgsEffectUv=uv;mdgsEffectLocal=position;mdgsEffectWorld=(modelMatrix*vec4(position,1.0)).xyz;');
      shader.fragmentShader = `${graph.code}\n${shader.fragmentShader}`.replace('#include <alphatest_fragment>', `
        if(mdgsEffectMode < -0.5) discard;
        if(mdgsEffectMode > 0.5) diffuseColor.a*=mdgsEffectFullAlpha;
        if(mdgsEffectMode < 0.5) {
          vec4 mdgsGraph=mdgsSourceGraph(diffuseColor);
          diffuseColor.rgb=mdgsGraph.rgb/max(mdgsGraph.a,0.00001);
          diffuseColor.a*=clamp(mdgsGraph.a,0.0,1.0);
        }
        #include <alphatest_fragment>`);
    };
    material.customProgramCacheKey = () => `${originalCache}:source-effect-v1:${graph.programKey}`;
    material.needsUpdate = true;
    this.bindings.push({ mesh, material, graph, mode, restore: () => { material.onBeforeCompile = previousCompile; material.customProgramCacheKey = previousCache; } });
    return true;
  }
  update(sourceProgress: number) {
    this.progress = clamp(sourceProgress);
    for (const binding of this.bindings) binding.mode.value = binding.graph.update(this.progress, this.frameRange);
  }
  getDiagnostics() {
    let active = 0, complete = 0, hidden = 0, unsupported = 0;
    const programs = new Set<string>();
    for (const binding of this.bindings) {
      if (binding.mode.value > .5) complete++; else if (binding.mode.value < -.5) hidden++; else active++;
      programs.add(binding.graph.programKey); unsupported += binding.graph.unsupported.length;
    }
    return { registered: this.bindings.length, active, complete, hidden, programs: programs.size, unsupported,
      sourceProgress: this.progress, proceduralNoise: 'deterministic WebGL approximation; source graph timing/coordinates retained' };
  }
  dispose() { for (const binding of this.bindings) binding.restore(); this.bindings.length = 0; this.sourceById.clear(); this.sourceByUser.clear(); }
}
