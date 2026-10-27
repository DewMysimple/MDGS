import type { SceneManifest } from '../types';
import { renderPixelRatio, renderQualityProfile, type RenderQuality } from './renderQuality';

export interface SourceViewport { x: number; y: number; width: number; height: number; aspect: number }
export interface SourceViewportLayout { viewport: SourceViewport; verticalFovScale: number }

/** All six HDR and three depth buffers share this bounded pixel budget. */
export function sourceTargetSize(width: number, height: number, pixelRatio: number, quality?: RenderQuality) {
  if (![width, height, pixelRatio].every(Number.isFinite) || width < 0 || height < 0 || pixelRatio <= 0) throw new Error('画卷绘制尺寸无效。');
  const physicalWidth = Math.max(1, width * pixelRatio), physicalHeight = Math.max(1, height * pixelRatio);
  // Preserve the public legacy helper when no profile is supplied; production
  // renderers always supply their explicit quality and share the output cap.
  const scale = quality ? renderPixelRatio(physicalWidth, physicalHeight, renderQualityProfile(quality).sourceSupersampling, quality)
    : Math.min(2, 4096 / physicalWidth, 4096 / physicalHeight, Math.sqrt(4 * 1024 * 1024 / (physicalWidth * physicalHeight)));
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

/** Center the source image within equal paper gutters while retaining its authored vertical framing. */
export function sourceViewportLayout(width: number, height: number, render: SceneManifest['render'], sideMarginPercent = 0): SourceViewportLayout {
  const source = fitSourceViewport(width, height, render);
  const percent = Number.isFinite(sideMarginPercent) ? Math.max(0, Math.min(49, sideMarginPercent)) : 0;
  const inset = width * percent / 100;
  const availableWidth = width - inset * 2;
  const canvasAspect = availableWidth / height;
  if (canvasAspect <= source.aspect) {
    const fitted = fitSourceViewport(availableWidth, height, render);
    return { viewport: { ...fitted, x: fitted.x + inset }, verticalFovScale: 1 };
  }
  return {
    viewport: { x: inset, y: 0, width: availableWidth, height, aspect: canvasAspect },
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
