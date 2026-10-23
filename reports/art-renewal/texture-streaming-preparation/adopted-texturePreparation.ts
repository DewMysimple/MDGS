import type * as THREE from 'three';

/** Resolve browser image decoding before the texture's first GPU use. Native
 * data textures keep their exact source buffers and bypass image decoding. */
export async function decodeTextureImage(texture: THREE.Texture, signal?: AbortSignal): Promise<THREE.Texture> {
  const image = texture.image as { decode?: () => Promise<void> } | undefined;
  try {
    if (image?.decode) await image.decode();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return texture;
  } catch (error) {
    texture.dispose();
    throw error;
  }
}
