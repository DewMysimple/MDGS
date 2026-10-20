"""Check relocation ambiguity and, optionally, all audited original image links.

python scripts/test-asset-image-resolution.py
python scripts/test-asset-image-resolution.py --source-audit reports/reconstruction/source-audit.json --materials-root source/牡丹/素材 --report reports/reconstruction/image-resolution-validation.json
"""
import argparse
import ast
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from asset_config import ImageResolutionError, image_index, resolve_image


class ImageResolutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='mdgs-image-resolution-')
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def image(self, relative, content=b'first artwork'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path.resolve()

    def test_existing_original_is_preserved(self):
        original = self.image('original/peony.png')
        self.image('moved/peony.png', b'other artwork')
        self.assertEqual(resolve_image(str(original), 'peony.png', image_index(self.root)), original)

    def test_complete_version_suffix_wins(self):
        self.image('materials/二/2-6/peony.png', b'wrong earlier artwork')
        expected = self.image('materials/第二部分2.0(2)/2-6/peony.png', b'intended artwork')
        for original in ('old/第二部分2.0(2)/2-6/peony.png', r'old\第二部分2.0(2)\2-6\peony.png'):
            self.assertEqual(resolve_image(original, 'peony.png.001', image_index(self.root)), expected)

    def test_storyboard_folder_is_an_exact_segment(self):
        self.image('a/2-60/peony.png', b'wrong storyboard')
        self.image('b/12-6/peony.png', b'wrong chapter')
        expected = self.image('z/2-6/new/peony.png', b'intended storyboard')
        self.assertEqual(resolve_image('old/2-6/peony.png', 'peony.png', image_index(self.root)), expected)

    def test_identical_bytes_allow_a_stable_selection(self):
        expected = self.image('a/peony.png', b'one complete identical artwork')
        self.image('b/peony.png', b'one complete identical artwork')
        index = image_index(self.root)
        index['peony.png'].reverse()
        self.assertEqual(resolve_image('missing/peony.png', 'peony.png', index), expected)

    def test_equal_score_different_bytes_fail_clearly(self):
        first = self.image('a/peony.png', b'first artwork')
        second = self.image('b/peony.png', b'other artwork')
        with self.assertRaises(ImageResolutionError) as raised:
            resolve_image('missing/peony.png', 'peony.png', image_index(self.root))
        self.assertIn('explicit_paths', str(raised.exception))
        self.assertIn(str(first), str(raised.exception))
        self.assertIn(str(second), str(raised.exception))

    def test_explicit_path_resolves_ambiguous_content(self):
        self.image('a/peony.png')
        intended = self.image('b/peony.png', b'deliberate alternate version')
        for mapping in ({'missing/peony.png': intended}, {'peony.png.001': intended}):
            self.assertEqual(resolve_image('missing/peony.png', 'peony.png.001', image_index(self.root),
                                           explicit_paths=mapping), intended)

    def test_invalid_explicit_path_fails_instead_of_falling_back(self):
        self.image('a/peony.png')
        with self.assertRaises(FileNotFoundError):
            resolve_image('missing/peony.png', 'peony.png', image_index(self.root),
                          explicit_paths={'peony.png': self.root / 'absent.png'})

    def test_empty_filepath_uses_blender_duplicate_name(self):
        intended = self.image('a/peony.png')
        self.assertEqual(resolve_image('', 'peony.png.001', image_index(self.root)), intended)

    def test_missing_reference_stays_missing(self):
        self.assertIsNone(resolve_image('missing/peony.png', 'peony.png', image_index(self.root)))


class ExportErrorPropagationTests(unittest.TestCase):
    """Run the exporter's actual exception handlers with injected failures.

    Only the Blender-dependent try body is replaced by a raise. Imports and
    handlers come from the real export source, so these checks detect a missing
    error import, incorrect exception classification, or swallowed ambiguity.
    No bpy dependency, source opening, or public asset writes are required.
    """
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).with_name('export_blender.py')
        tree = ast.parse(source.read_text(encoding='utf-8-sig'), filename=str(source))
        chapter = next(node for node in tree.body
                       if isinstance(node, ast.FunctionDef) and node.name == 'export_chapter')
        objects = next(node for node in chapter.body if isinstance(node, ast.For)
                       and isinstance(node.iter, ast.Attribute) and node.iter.attr == 'objects')
        handlers = next(node for node in objects.body if isinstance(node, ast.Try))
        injection = ast.Try(body=[ast.Raise(exc=ast.Name(id='injected_error', ctx=ast.Load()))],
                            handlers=handlers.handlers, orelse=handlers.orelse,
                            finalbody=handlers.finalbody)
        imports = [node for node in tree.body if isinstance(node, ast.ImportFrom)
                   and node.module == 'asset_config']
        module = ast.fix_missing_locations(ast.Module(body=imports + [injection], type_ignores=[]))
        cls.actual_handlers = compile(module, str(source) + ':actual-error-handlers', 'exec')

    def test_artwork_ambiguity_propagates_without_skipping(self):
        error = ImageResolutionError('two different same-ranked artwork candidates')
        scope = {'injected_error': error, 'obj': SimpleNamespace(name='test layer'), 'skipped': []}
        with self.assertRaises(ImageResolutionError) as raised:
            exec(self.actual_handlers, scope)
        self.assertIs(raised.exception, error)
        self.assertEqual(scope['skipped'], [])

    def test_unrelated_geometry_failure_keeps_existing_skip_behavior(self):
        scope = {'injected_error': RuntimeError('geometry evaluation failed'),
                 'obj': SimpleNamespace(name='test layer'), 'skipped': []}
        exec(self.actual_handlers, scope)
        self.assertEqual(scope['skipped'], [{'name': 'test layer', 'reason': 'geometry evaluation failed'}])


def check_audited_links(source_audit, materials_root):
    audit = json.loads(source_audit.read_text(encoding='utf-8-sig'))
    if audit.get('status') != 'verified':
        raise ValueError('The source audit must contain verified original .blend reads.')
    index = image_index(materials_root)
    results = []
    for chapter in audit['chapters']:
        for image in chapter['images']:
            if not image['relink']['required']:
                continue
            original = image['resolvedPath'] or image['path']
            chosen = resolve_image(original, image['name'], index)
            expected = Path(image['relink']['resolvedCandidate']).resolve()
            if chosen != expected:
                raise AssertionError(f"Wrong artwork chosen for {chapter['id']} / {image['name']}: {chosen} != {expected}")
            sha256 = hashlib.sha256(chosen.read_bytes()).hexdigest()
            if sha256 != image['relink']['resolvedCandidateSha256']:
                raise AssertionError('Source artwork bytes changed since the original read-only audit: ' + str(chosen))
            results.append({'chapter': chapter['id'], 'image': image['name'],
                            'resolved': str(chosen), 'sha256': sha256,
                            'matchesAuditedVersion': True,
                            'usedByCurrentWeb': image['usedByCurrentWeb']})
    if not results:
        raise AssertionError('No actual relocated links were checked.')
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-audit', type=Path)
    parser.add_argument('--materials-root', type=Path)
    parser.add_argument('--report', type=Path)
    options = parser.parse_args()
    if bool(options.source_audit) != bool(options.materials_root):
        parser.error('--source-audit and --materials-root must be passed together.')
    suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(case)
                               for case in (ImageResolutionTests, ExportErrorPropagationTests))
    outcome = unittest.TextTestRunner(verbosity=2).run(suite)
    if not outcome.wasSuccessful():
        raise SystemExit(1)
    actual = check_audited_links(options.source_audit, options.materials_root) if options.source_audit else []
    report = {'syntheticCases': outcome.testsRun, 'syntheticPassed': True,
              'exporterActualExceptionHandlersChecked': True,
              'ambiguityStopsExport': True, 'unrelatedGeometrySkipPreserved': True,
              'actualReferencesChecked': len(actual),
              'actualWebReferencesChecked': sum(item['usedByCurrentWeb'] for item in actual),
              'wrongSelections': 0, 'originalFilesModified': False, 'references': actual}
    if options.report:
        options.report.parent.mkdir(parents=True, exist_ok=True)
        options.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Image relocation validation passed: {outcome.testsRun} cases; {len(actual)} audited references.")
