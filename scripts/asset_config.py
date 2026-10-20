"""Portable, read-only source configuration shared by the Blender tools.

Paths in a JSON configuration are relative to that configuration file. CLI and
environment paths are relative to the current working directory. No source
location is required to run the website from its checked-in public assets.
"""
import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCES = {
    'chapter-1': '一/牡丹与女帝_叙事复合运镜.blend',
    'chapter-2': '二/画卷二_长卷叙事.blend',
    'chapter-3': '三/画卷三_中国长卷_复合运镜_v07.blend',
    'chapter-4': '四/Fourth_Scroll.blend',
}


@dataclass
class PipelineConfig:
    sources: list
    materials_root: Path | None
    reference_width: int | None = None
    reference_height: int | None = None

    def describe(self):
        return {
            'projectRoot': str(ROOT),
            'sources': dict(self.sources),
            'materialsRoot': str(self.materials_root) if self.materials_root else None,
            'referenceSize': [self.reference_width, self.reference_height],
            'sourceFilesReadOnly': True,
        }


def script_arguments():
    # Blender owns the arguments before "--" and does not add the script's
    # directory to sys.path. Normal Python invocations use the usual argv.
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return sys.argv[1:] if Path(sys.argv[0]).suffix.lower() == '.py' else []


def resolve_path(value, base):
    path = Path(os.path.expandvars(str(value))).expanduser()
    return (path if path.is_absolute() else base / path).resolve()


def load_pipeline(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', help='JSON config; also MDGS_ASSET_CONFIG, or asset-pipeline.local.json in the project root')
    parser.add_argument('--source-root', help='Folder containing the four source chapters; also MDGS_SOURCE_ROOT')
    parser.add_argument('--materials-root', help='Optional folder for relocated image files; also MDGS_MATERIALS_ROOT')
    parser.add_argument('--width', type=int, help='Reference render width; defaults to the source scene size')
    parser.add_argument('--height', type=int, help='Reference render height; defaults to the source scene size')
    parser.add_argument('--check-config', action='store_true', help='Validate paths without loading Blender or writing assets')
    parser.add_argument('chapters', nargs='*', metavar='chapter-N', help='Chapter IDs to process (all four by default)')
    args = parser.parse_args(script_arguments() if argv is None else argv)

    config_value = args.config or os.environ.get('MDGS_ASSET_CONFIG')
    config_path = resolve_path(config_value, Path.cwd()) if config_value else ROOT / 'asset-pipeline.local.json'
    data = {}
    if config_path.is_file():
        try:
            data = json.loads(config_path.read_text(encoding='utf-8-sig'))
            if not isinstance(data, dict):
                raise ValueError('the config must be a JSON object')
        except (OSError, ValueError) as error:
            parser.error(f'Cannot read asset configuration {config_path}: {error}')
    elif config_value:
        parser.error(f'Asset configuration does not exist: {config_path}')

    source_value = args.source_root or os.environ.get('MDGS_SOURCE_ROOT')
    source_root = resolve_path(source_value, Path.cwd()) if source_value else resolve_path(data.get('sourceRoot', '.'), config_path.parent)
    configured_sources = data.get('sources', {})
    if not isinstance(configured_sources, dict) or any(key not in DEFAULT_SOURCES for key in configured_sources):
        parser.error('"sources" must be an object keyed by chapter-1 through chapter-4.')
    if not source_value and not data.get('sourceRoot') and not configured_sources:
        parser.error('No Blender source location configured. Set --source-root / MDGS_SOURCE_ROOT, or copy scripts/asset-pipeline.example.json to asset-pipeline.local.json and edit it. The website itself uses public/assets and does not require Blender.')
    chapters = args.chapters or list(DEFAULT_SOURCES)
    unknown = set(chapters) - DEFAULT_SOURCES.keys()
    if unknown:
        parser.error('Unknown chapter IDs: ' + ', '.join(sorted(unknown)))
    sources = []
    for chapter in dict.fromkeys(chapters):
        value = configured_sources.get(chapter, DEFAULT_SOURCES[chapter])
        if not isinstance(value, str) or not value.strip():
            parser.error(f'Invalid source path for {chapter}.')
        path = resolve_path(value, source_root)
        if not path.is_file():
            parser.error(f'Blender source is missing for {chapter}: {path}. Update --source-root or the "sources" configuration; no source files have been modified.')
        sources.append((chapter, str(path)))

    materials_value = args.materials_root or os.environ.get('MDGS_MATERIALS_ROOT')
    materials_root = resolve_path(materials_value, Path.cwd()) if materials_value else resolve_path(data['materialsRoot'], config_path.parent) if data.get('materialsRoot') else None
    if materials_root and not materials_root.is_dir():
        parser.error(f'Materials folder does not exist: {materials_root}')
    width = args.width if args.width is not None else data.get('referenceWidth')
    height = args.height if args.height is not None else data.get('referenceHeight')
    if any(value is not None and (isinstance(value, bool) or not isinstance(value, int) or value <= 0) for value in (width, height)):
        parser.error('Reference width and height must be positive integers.')
    config = PipelineConfig(sources, materials_root, width, height)
    if args.check_config:
        print(json.dumps(config.describe(), ensure_ascii=False, indent=2))
        raise SystemExit(0)
    return config


def image_index(materials_root):
    index = {}
    if materials_root:
        for path in sorted(materials_root.rglob('*')):
            if path.is_file() and path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp'):
                index.setdefault(path.name.casefold(), []).append(path)
    return index


class ImageResolutionError(ValueError):
    """An artwork source is ambiguous; exporting a partial scene is unsafe."""


def resolve_image(filepath, image_name, index, *, explicit_paths=None):
    """Resolve moved images without silently selecting another artwork version.

    Explicit mappings win; existing original paths otherwise remain unchanged.
    Relocated candidates retain the authored chapter /
    storyboard folder when available, then use the longest original path suffix.
    Equally ranked alternatives must have identical bytes or an explicit path.
    ``explicit_paths`` optionally maps an original filepath or image datablock
    name to a source file; its values are resolved against the calling directory.
    """
    if explicit_paths:
        key = str(filepath) if str(filepath) in explicit_paths else image_name
        if key in explicit_paths:
            explicit = Path(explicit_paths[key])
            if not explicit.is_file():
                raise FileNotFoundError(f'Explicit image source does not exist for {key}: {explicit}')
            return explicit
    path = Path(filepath)
    if path.is_file():
        return path
    name = str(filepath).replace('\\', '/').rsplit('/', 1)[-1] or re.sub(r'\.\d{3}$', '', image_name)
    candidates = sorted({Path(item).resolve() for item in index.get(name.casefold(), [])
                         if Path(item).is_file()}, key=lambda item: str(item).casefold())
    if not candidates:
        return None

    def path_parts(value):
        return [part.casefold() for part in str(value).replace('\\', '/').split('/')
                if part not in ('', '.', '..')]

    original_parts = path_parts(filepath)
    # Match complete storyboard folder names: 2-6 must not match 2-60 or 12-6.
    original_scenes = {part for part in original_parts if re.fullmatch(r'[1-4]-\d+', part)}
    same_scene = [item for item in candidates if original_scenes.intersection(path_parts(item))]
    candidates = same_scene or candidates

    def suffix_length(candidate):
        score = 0
        for original, relocated in zip(reversed(original_parts), reversed(path_parts(candidate))):
            if original != relocated:
                break
            score += 1
        return score

    best_score = max(suffix_length(item) for item in candidates)
    best = [item for item in candidates if suffix_length(item) == best_score]
    if len(best) == 1:
        return best[0]

    def same_bytes(left, right):
        if left.stat().st_size != right.stat().st_size:
            return False
        with left.open('rb') as first, right.open('rb') as second:
            while True:
                chunk = first.read(1024 * 1024)
                if chunk != second.read(1024 * 1024):
                    return False
                if not chunk:
                    return True

    if all(same_bytes(best[0], candidate) for candidate in best[1:]):
        return best[0]
    alternatives = '\n'.join(f'  - {candidate}' for candidate in best)
    raise ImageResolutionError(
        f'Ambiguous image source for {image_name!r} ({filepath}): equally matched '
        f'candidates contain different bytes. Provide explicit_paths mapping this '
        f'original filepath or image name to the intended file, or restrict the '
        f'materials folder to the intended version. No image was selected.\n{alternatives}'
    )


if __name__ == '__main__':
    print(json.dumps(load_pipeline().describe(), ensure_ascii=False, indent=2))
