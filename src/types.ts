export interface StoryStop { name: string; frame: number; progress: number }
export interface CameraSample {
  frame: number; progress: number; sourceProgress?: number; position: [number, number, number];
  quaternion: [number, number, number, number]; fov: number;
  type: 'PERSP' | 'ORTHO'; orthoScale: number; lens: number; shift?: number[];
}
export interface SceneManifest {
  version: number; id: string; frameRange: [number, number]; fps: number;
  render: { width: number; height: number; pixelAspectX: number; pixelAspectY: number };
  travel: { axis: 'X' | 'Y'; sign: number; range: [number, number] };
  camera: { name: string; near: number; far: number; sensorFit: string; sensorWidth: number; sensorHeight: number };
  cameras: CameraSample[];
  stops: StoryStop[];
  markers: StoryStop[];
  meshes: {
    name: string; type: string; matrix: number[]; positions: number[]; uvs: number[];
    material: number; indices?: number[]; bounds: { min: number[]; max: number[] }; animated: boolean; isText: boolean;
  }[];
  materials: {
    id: number; name: string; texture: string | null; color: number[]; opacity: number;
    transparent: boolean; alphaTest: number; side: string; depthWrite: boolean;
  }[];
  images: { id: string; src: string; sourceName: string; sourceSize: number[]; hasAlpha: boolean }[];
  animations: Record<string, { progress: number; matrix: number[] }[]>;
}
