import type { SceneManifest } from '../types';

export interface SourceViewport { x: number; y: number; width: number; height: number; aspect: number }
export interface SourceViewportLayout { viewport: SourceViewport; verticalFovScale: number }

/** All six HDR and three depth buffers share this bounded pixel budget. */
export function sourceTargetSize(width: number, height: number, pixelRatio: number) {
  if (![width, height, pixelRatio].every(Number.isFinite) || width < 0 || height < 0 || pixelRatio <= 0) throw new Error('画卷绘制尺寸无效。');
  const physicalWidth = Math.max(1, width * pixelRatio), physicalHeight = Math.max(1, height * pixelRatio);
  const scale = Math.min(2, 4096 / physicalWidth, 4096 / physicalHeight,
    Math.sqrt(4 * 1024 * 1024 / (physicalWidth * physicalHeight)));
  return { width: Math.max(1, Math.floor(physicalWidth * scale)), height: Math.max(1, Math.floor(physicalHeight * scale)), scale };
}

/** Preserve Blender's whole camera gate, including pixel aspect, in any window. */
export function fitSourceViewport(width: number, height: number, render: SceneManifest['render']): SourceViewport {
  const aspect = render.width * render.pixelAspectX / (render.height * render.pixelAspectY);
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error('画卷源画幅无效。');
  const fittedWidth = Math.min(width, height * aspect);
  const fittedHeight = fittedWidth / aspect;
  return { x: (width - fittedWidth) / 2, y: (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight, aspect };
}

/** Fill a wide scroll window while retaining the authored vertical framing. */
export function sourceViewportLayout(width: number, height: number, render: SceneManifest['render']): SourceViewportLayout {
  const source = fitSourceViewport(width, height, render);
  const canvasAspect = width / height;
  if (canvasAspect <= source.aspect) return { viewport: source, verticalFovScale: 1 };
  return {
    viewport: { x: 0, y: 0, width, height, aspect: canvasAspect },
    // Widen the horizontal view to fill the window. Narrowing the vertical FOV
    // instead crops authored heads and scroll details, most visibly at the end
    // of chapter one where the composition rises close to the top edge.
    verticalFovScale: 1,
  };
}

/** Apply an optional vertical framing scale without changing scene geometry. */
export function sourceVerticalFov(fov: number, scale: number): number {
  if (!Number.isFinite(fov) || fov <= 0 || fov >= 180 || !Number.isFinite(scale) || scale < 1) throw new Error('画卷取景参数无效。');
  return 2 * Math.atan(Math.tan(fov * Math.PI / 360) / scale) * 180 / Math.PI;
}
