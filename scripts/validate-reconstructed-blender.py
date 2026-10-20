"""Independently reopen and verify a reconstructed .blend and its source hashes.

blender --background --factory-startup --disable-autoexec --python-exit-code 1
--python scripts/validate-reconstructed-blender.py -- --report
reports/reconstruction/blender-reconstruction-chapter-1.json
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location('reconstruct_blender', Path(__file__).with_name('reconstruct-blender.py'))
reconstruction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconstruction)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', required=True)
    parser.add_argument('--source-config', default='reports/reconstruction/source-paths.local.json')
    options = parser.parse_args(args)
    report_path = reconstruction.resolve_path(options.report)
    report = reconstruction.read_json(report_path)
    if report.get('status') != 'verified':
        raise ValueError('A completed reconstruction report is required.')
    sources = reconstruction.load_sources(reconstruction.resolve_path(options.source_config))
    output = reconstruction.validate_output_path(reconstruction.resolve_path(report['output']), sources)
    current_hashes = {name: reconstruction.sha256(path) for name, path in sources.items()}
    if current_hashes != report['sourceHashesBefore'] or current_hashes != report['sourceHashesAfter']:
        raise AssertionError('Original source files differ from the recorded reconstruction baseline.')
    if reconstruction.sha256(output) != report['outputSha256']:
        raise AssertionError('Derived .blend bytes changed after the verified save.')
    manifest = reconstruction.resolve_path(report['manifest'])
    if not manifest.is_file() or reconstruction.sha256(manifest) != report['manifestSha256']:
        raise AssertionError('Archived reconstruction manifest differs from the saved copy evidence.')
    for resource in report['inputResources']:
        path = reconstruction.resolve_path(resource['path'])
        if not path.is_file() or reconstruction.sha256(path) != resource['sha256']:
            raise AssertionError('Reconstruction input asset differs from the saved copy: ' + resource['path'])
    import bpy
    bpy.ops.wm.open_mainfile(filepath=str(output), load_ui=False, use_scripts=False)
    verification = reconstruction.verify_derived(bpy, report)
    result = {'schemaVersion': 1, 'chapter': report['chapter'], 'status': 'verified', 'output': report['output'],
              'outputSha256': report['outputSha256'], 'originalFilesUnchanged': True,
              'reconstructionReport': reconstruction.relative_path(report_path),
              'reconstructionReportSha256': reconstruction.sha256(report_path),
              'manifest': report['manifest'], 'manifestSha256': report['manifestSha256'],
              'sourceHashesVerified': current_hashes,
              'inputResourcesVerified': len(report['inputResources']),
              'backgroundPresentation': report.get('backgroundPresentation'),
              'verification': verification}
    result_path = report_path.parent / f"blender-reopen-validation-chapter-{report['chapter']}.json"
    reconstruction.write_json(result_path, result)
    print('RECONSTRUCTION_REOPEN_VERIFIED', json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
