/** WebGL2 implementation of the source's 3D Perlin/fBm mathematical operations.
 * The Jenkins Lookup3 seed/rotations, Perlin gradients and normalization match
 * Blender 5.2's documented GPU implementation. No screen-space random pattern
 * or lower-resolution texture is substituted for a high-frequency paper field.
 * References:
 * https://github.com/blender/blender/blob/blender-v5.2-release/source/blender/gpu/shaders/common/gpu_shader_common_hash.glsl
 * https://github.com/blender/blender/blob/blender-v5.2-release/source/blender/gpu/shaders/material/gpu_shader_material_noise.glsl
 * https://github.com/blender/blender/blob/blender-v5.2-release/source/blender/gpu/shaders/material/gpu_shader_material_fractal_noise.glsl
 */
export const SOURCE_NOISE_3D = `
uint sourceRotate32(uint word,uint shift){return (word<<shift)|(word>>(32u-shift));}
uint sourceLatticeHash(ivec3 cell){
  uvec3 state=uvec3(0xdeadbeefu+25u)+uvec3(cell);
  state.z=(state.z^state.y)-sourceRotate32(state.y,14u);
  state.x=(state.x^state.z)-sourceRotate32(state.z,11u);
  state.y=(state.y^state.x)-sourceRotate32(state.x,25u);
  state.z=(state.z^state.y)-sourceRotate32(state.y,16u);
  state.x=(state.x^state.z)-sourceRotate32(state.z,4u);
  state.y=(state.y^state.x)-sourceRotate32(state.x,14u);
  state.z=(state.z^state.y)-sourceRotate32(state.y,24u);
  return state.z;
}
float sourceGradient(ivec3 cell,vec3 delta){
  uint code=sourceLatticeHash(cell)&15u;
  float first=code<8u?delta.x:delta.y;
  float second=code<4u?delta.y:((code==12u||code==14u)?delta.x:delta.z);
  first=(code&1u)==0u?first:-first;
  second=(code&2u)==0u?second:-second;
  return first+second;
}
float sourceSignedNoise3(vec3 original){
  vec3 point=original-vec3(ivec3(original/100000.0))*100000.0;
  point+=vec3(greaterThanEqual(abs(original),vec3(1000000.0)))*.5;
  ivec3 cell=ivec3(floor(point));vec3 fractional=point-vec3(cell);
  vec3 blend=fractional*fractional*fractional*(fractional*(fractional*6.0-15.0)+10.0);
  float corners[8];
  for(int k=0;k<8;k++){
    ivec3 offset=ivec3(k&1,(k>>1)&1,(k>>2)&1);
    corners[k]=sourceGradient(cell+offset,fractional-vec3(offset));
  }
  float inverseX=1.0-blend.x,inverseY=1.0-blend.y;
  float bottom=inverseY*(corners[0]*inverseX+corners[1]*blend.x)+blend.y*(corners[2]*inverseX+corners[3]*blend.x);
  float top=inverseY*(corners[4]*inverseX+corners[5]*blend.x)+blend.y*(corners[6]*inverseX+corners[7]*blend.x);
  return .982*((1.0-blend.z)*bottom+blend.z*top);
}
float sourceNoiseFbm3(vec3 coordinate,float scale,float detail,float roughness,float lacunarity,float normalized){
  vec3 point=coordinate*scale;
  float octaves=clamp(detail,0.0,15.0),amplitude=1.0,frequency=1.0,total=0.0,weight=0.0;
  float attenuation=max(roughness,0.0);
  for(int octave=0;octave<=15;octave++){
    if(octave>int(octaves))break;
    total+=sourceSignedNoise3(point*frequency)*amplitude;
    weight+=amplitude;amplitude*=attenuation;frequency*=lacunarity;
  }
  float partial=octaves-floor(octaves);
  if(partial>0.0){
    float following=total+sourceSignedNoise3(point*frequency)*amplitude;
    return normalized>.5?mix(.5*total/weight+.5,.5*following/(weight+amplitude)+.5,partial):mix(total,following,partial);
  }
  return normalized>.5?.5*total/weight+.5:total;
}
`;
