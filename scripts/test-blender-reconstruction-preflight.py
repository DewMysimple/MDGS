"""Check reconstruction path safety and incomplete-manifest gates without bpy."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('reconstruct_blender', Path(__file__).with_name('reconstruct-blender.py'))
reconstruction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconstruction)
preview_spec = importlib.util.spec_from_file_location('render_blender_preview', Path(__file__).with_name('render-blank-blender.py'))
preview = importlib.util.module_from_spec(preview_spec)
preview_spec.loader.exec_module(preview)


class ReconstructionPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='mdgs-blender-preflight-')
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def original(self):
        path = self.root / 'source' / 'chapter-1' / 'original.blend'
        path.parent.mkdir(parents=True)
        path.write_bytes(b'original fixture, never opened by Blender')
        return path

    def test_original_and_source_sibling_outputs_are_rejected(self):
        original = self.original()
        for output in (original, original.parent / 'new.blend', original.parent / 'nested' / 'new.blend'):
            with self.assertRaises(ValueError):
                reconstruction.validate_output_path(output, {'chapter-1': original})
        self.assertEqual(original.read_bytes(), b'original fixture, never opened by Blender')

    def test_artifact_output_is_accepted(self):
        original = self.original()
        output = self.root / 'artwork' / 'chapter-1.blend'
        self.assertEqual(reconstruction.validate_output_path(output, {'chapter-1': original}), output.resolve())

    def test_source_paths_are_relative_to_the_config(self):
        original = self.original()
        config = self.root / 'config' / 'sources.json'
        config.parent.mkdir()
        config.write_text(json.dumps({'chapter-1': '../source/chapter-1/original.blend'}), encoding='utf-8')
        self.assertEqual(reconstruction.load_sources(config)['chapter-1'], original.resolve())

    def delivery(self, output=None, report_dir=None, manifest=None):
        return reconstruction.validate_delivery_paths(
            output or self.root / 'artwork' / 'chapter-1.blend',
            report_dir or self.root / 'reports' / 'new-art-pass', 1,
            {'chapter-1': self.original_source}, manifest or self.revision)

    def delivery_inputs(self):
        self.original_source = self.original()
        self.revision = self.manifest({'schemaVersion': 1, 'activeChapters': [1], 'chapters': {'1': {}}})

    def test_new_delivery_can_isolate_blend_and_evidence_directories(self):
        self.delivery_inputs()
        paths = self.delivery()
        self.assertEqual(paths['saved'].parent, (self.root / 'reports' / 'new-art-pass').resolve())
        self.assertEqual(paths['output'], (self.root / 'artwork' / 'chapter-1.blend').resolve())
        self.assertFalse(paths['output'].exists())
        self.assertFalse(paths['saved'].exists())

    def test_new_snapshot_cannot_overwrite_another_delivery_report(self):
        self.delivery_inputs()
        paths = self.delivery()
        paths['saved'].parent.mkdir(parents=True)
        paths['saved'].write_text(json.dumps({'manifest': str(self.root / 'previous-pass.json'),
                                             'output': str(paths['output'])}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'another delivery'):
            self.delivery()

    def test_new_output_cannot_reuse_another_delivery_report(self):
        self.delivery_inputs()
        paths = self.delivery()
        paths['saved'].parent.mkdir(parents=True)
        paths['saved'].write_text(json.dumps({'manifest': str(self.revision),
                                             'output': str(self.root / 'old-artwork' / 'chapter-1.blend')}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'another delivery'):
            self.delivery()

    def test_same_delivery_can_be_repeated_without_using_an_original_as_output(self):
        self.delivery_inputs()
        paths = self.delivery()
        paths['saved'].parent.mkdir(parents=True)
        paths['saved'].write_text(json.dumps({'manifest': str(self.revision),
                                             'output': str(paths['output'])}), encoding='utf-8')
        paths['output'].parent.mkdir(parents=True)
        paths['output'].write_bytes(b'derived fixture')
        self.assertEqual(self.delivery()['output'], paths['output'])
        self.assertEqual(self.original_source.read_bytes(), b'original fixture, never opened by Blender')

    def test_existing_output_without_matching_report_is_not_overwritten(self):
        self.delivery_inputs()
        output = self.root / 'artwork' / 'chapter-1.blend'
        output.parent.mkdir(parents=True)
        output.write_bytes(b'unrelated existing delivery')
        with self.assertRaisesRegex(ValueError, 'no matching delivery evidence'):
            self.delivery(output=output)
        self.assertEqual(output.read_bytes(), b'unrelated existing delivery')

    def test_report_cannot_be_placed_in_source_folder_or_over_an_input(self):
        self.delivery_inputs()
        with self.assertRaisesRegex(ValueError, 'original source directory'):
            self.delivery(report_dir=self.original_source.parent)
        report_dir = self.root / 'reports'
        input_named_like_report = report_dir / 'blender-reconstruction-chapter-1.json'
        with self.assertRaisesRegex(ValueError, 'input file'):
            self.delivery(report_dir=report_dir, manifest=input_named_like_report)

    def test_explicit_world_paper_is_validated_before_importing_blender(self):
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [2], 'chapters': {'2': {
            'worldPaper': {'color': '#F5ECDC', 'strength': 1, 'narrative': 'visible paper after retiring the curved ground'}
        }}})
        reconstruction.load_revision(path, 2)
        result = reconstruction.validate_world_paper({'color': '#FFFFFF', 'narrative': 'white paper'})
        self.assertEqual(result['colorLinear'], [1, 1, 1])
        self.assertEqual(result['strength'], 1)

    def test_world_paper_rejects_invalid_color_strength_and_missing_ownership(self):
        for config in ({'color': 'paper', 'narrative': 'test'},
                       {'color': '#fff', 'narrative': 'test'},
                       {'color': '#f5ecdc', 'strength': 0, 'narrative': 'test'},
                       {'color': '#f5ecdc', 'strength': float('nan'), 'narrative': 'test'},
                       {'color': '#f5ecdc'}):
            with self.assertRaises(ValueError):
                reconstruction.validate_world_paper(config)

    def test_absent_world_paper_keeps_legacy_delivery_unchanged(self):
        self.assertIsNone(reconstruction.validate_world_paper(None))
        self.assertEqual(reconstruction.verify_world_paper(None, {'worldModified': False}), 'legacy-or-unmodified')
        with self.assertRaisesRegex(AssertionError, 'explicit'):
            reconstruction.verify_world_paper(None, {'worldModified': True})

    def manifest(self, payload):
        path = self.root / 'manifest.json'
        path.write_text(json.dumps(payload), encoding='utf-8')
        return path

    def test_inactive_chapter_cannot_bypass_the_pilot_gate(self):
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [1], 'chapters': {'2': {}}})
        with self.assertRaisesRegex(ValueError, 'not active'):
            reconstruction.load_revision(path, 2)

    def test_missing_production_image_fails_before_any_save(self):
        asset = self.root / 'browser.webp'
        asset.write_bytes(b'browser fixture')
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [1], 'chapters': {'1': {
            'replacements': [{'id': 'fixture', 'role': '后景连续层', 'narrative': 'test',
                              'asset': str(asset), 'productionPng': str(self.root / 'absent.png')}]
        }}})
        with self.assertRaisesRegex(FileNotFoundError, 'incomplete'):
            reconstruction.load_revision(path, 1)
        self.assertFalse(any(self.root.rglob('*.blend')))

    def test_incomplete_uv_samples_recover_the_entire_authored_plane(self):
        coordinates = [(u, v) for u, v in ((.2, .2), (.8, .2), (.8, .7), (.3, .9), (.6, .8))]
        positions = [value for u, v in coordinates for value in (7 + 4 * u, 2 + .5 * u - .2 * v, -3 + 6 * v)]
        uvs = [value for pair in coordinates for value in pair]
        fitted = reconstruction.affine_plane_from_uv(positions, uvs)
        expected = [(7, 2, -3), (11, 2.5, -3), (11, 2.3, 3), (7, 1.8, 3)]
        for actual, desired in zip(fitted['corners'], expected):
            for value, wanted in zip(actual, desired):
                self.assertAlmostEqual(value, wanted, places=10)
        self.assertEqual(fitted['uvBounds'], [0, 0, 1, 1])

    def test_collinear_uvs_do_not_produce_an_arbitrary_plane(self):
        with self.assertRaisesRegex(ValueError, 'collinear'):
            reconstruction.affine_plane_from_uv([0, 0, 0, 1, 0, 1, 2, 0, 2], [0, 0, .5, .5, 1, 1])

    def test_source_surface_relief_is_measured_separately_from_uv_distortion(self):
        coordinates = [(u / 4, v / 4) for u in range(5) for v in range(5)]
        positions = [value for u, v in coordinates for value in (10 * u, .04 * (u - .5) ** 2, 5 * v)]
        fitted = reconstruction.affine_plane_from_uv(positions, [value for pair in coordinates for value in pair])
        self.assertGreater(fitted['maxNormalResidual'], .001)
        self.assertLess(fitted['maxInPlaneResidual'], 1e-8)

    def test_distorted_uv_mapping_is_not_accepted_as_surface_relief(self):
        coordinates = [(u / 4, v / 4) for u in range(5) for v in range(5)]
        positions = [value for u, v in coordinates for value in (10 * u + u * u, 0, 5 * v)]
        with self.assertRaisesRegex(ValueError, 'exceeds'):
            reconstruction.affine_plane_from_uv(positions, [value for pair in coordinates for value in pair])

    def test_geometry_only_repair_needs_no_new_bitmap(self):
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {
            'geometryRepairs': [{'id': 'fixture-full-uv', 'meshNames': ['complete original group'],
                                 'role': '主体叙事层', 'narrative': 'restore a complete original painted group',
                                 'geometryPolicy': 'full-uv-affine', 'treatment': '修复'}]
        }}})
        manifest, chapter, resources = reconstruction.load_revision(path, 3)
        self.assertEqual(resources, [])
        self.assertEqual(chapter['geometryRepairs'][0]['geometryPolicy'], 'full-uv-affine')

    def test_atlas_extraction_is_not_implicitly_a_full_uv_repair(self):
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {
            'geometryRepairs': [{'id': 'fixture-atlas', 'meshNames': ['single lantern selected from a pair'],
                                 'role': '动效层', 'narrative': 'keep the authored isolated lamp',
                                 'geometryPolicy': 'keep-extraction', 'treatment': '保留'}]
        }}})
        with self.assertRaisesRegex(ValueError, 'full-uv-affine'):
            reconstruction.load_revision(path, 3)

    def test_preserved_region_remaps_the_original_selection_without_completing_it(self):
        original = [0, 0, .75, 0, .75, .4, .1, .4]
        rect = [.1, .12, .9, .92]
        actual = reconstruction.remap_region_uv(original, rect)
        for value, expected in zip(actual, [.1, .12, .7, .12, .7, .44, .18, .44]):
            self.assertAlmostEqual(value, expected)
        self.assertEqual(original, [0, 0, .75, 0, .75, .4, .1, .4])
        self.assertLess(max(actual[::2]), rect[2])

    def test_preserved_region_requires_an_explicit_valid_inset(self):
        for rect in (None, [0, 0, 0, 1], [-.1, 0, 1, 1], [0, 0, float('nan'), 1]):
            with self.assertRaises(ValueError):
                reconstruction.remap_region_uv([0, 0, 1, 1], rect)

    def test_seal_remains_editable_without_body_lines(self):
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {
            'textLayers': [{'id': 'editable-seal', 'title': '富贵', 'lines': [], 'variant': 'seal',
                            'narrative': 'contemporary decorative seal', 'matrix': [1, 0, 0, 0] * 4}]
        }}})
        reconstruction.load_revision(path, 3)

    def test_geometry_changes_are_limited_to_explicit_targets(self):
        baseline = {'retained subject': {'positionsSha256': 'original'},
                    'declared carrier': {'positionsSha256': 'original'}}
        current = {'retained subject': {'positionsSha256': 'original'},
                   'declared carrier': {'positionsSha256': 'completed'}}
        reconstruction.assert_original_geometry_policy(baseline, current, {'declared carrier'})
        current['retained subject']['positionsSha256'] = 'unexpected edit'
        with self.assertRaisesRegex(AssertionError, 'Undeclared'):
            reconstruction.assert_original_geometry_policy(baseline, current, {'declared carrier'})

    def test_explicit_raw_corners_add_only_transparent_gutter_without_aspect_rescaling(self):
        entry = {'geometryCorners': [[2, 3, 4], [6, 3, 4], [6, 9, 4], [2, 9, 4]],
                 'paddingScaleX': 1.2, 'paddingScaleY': 1.4, 'contentAspect': .75, 'sourceAspect': 1.8}
        corners = reconstruction.padded_explicit_corners(entry)
        self.assertAlmostEqual(corners[1][0] - corners[0][0], 4.8)
        self.assertAlmostEqual(corners[3][1] - corners[0][1], 8.4)
        self.assertEqual([point[2] for point in corners], [4] * 4)

    def test_invalid_explicit_quad_cannot_silently_reorder_or_flatten_the_geometry(self):
        for corners in ([[0, 0, 0]] * 4,
                        [[0, 0, 0], [1, 0, 0], [1, 1, .2], [0, 1, 0]],
                        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]):
            with self.assertRaises(ValueError):
                reconstruction.padded_explicit_corners({'geometryCorners': corners})

    def test_layout_adjustment_is_an_explicit_nonsingular_world_delta(self):
        delta = [1, 0, 0, 0, 0, .8, 0, 0, 0, 0, .8, 0, 0, 20, 2, 1]
        entry = {'id': 'recompose', 'meshNames': ['source scene group'], 'worldMatrix': delta,
                 'role': '主体叙事层', 'narrative': 'move the group below the top breathing space'}
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {'layoutAdjustments': [entry]}}})
        _, revision, resources = reconstruction.load_revision(path, 3)
        self.assertEqual(resources, [])
        self.assertEqual(revision['layoutAdjustments'][0]['worldMatrix'], delta)
        for invalid in ([0] * 16, delta[:-1], [*delta[:15], float('nan')]):
            with self.assertRaises(ValueError):
                reconstruction.validate_layout_adjustment({**entry, 'worldMatrix': invalid})
        with self.assertRaises(ValueError):
            reconstruction.validate_layout_adjustment({**entry, 'meshNames': ['duplicate', 'duplicate']})

    def test_spatial_reading_progress_does_not_use_the_source_timeline_fraction(self):
        source = {'frameRange': [1, 101], 'travel': {'axis': 'Y'},
                  'stops': [{'progress': .1}, {'progress': .9}],
                  'cameras': [{'progress': p, 'frame': 1 + p * 100, 'position': [0, y, 0]}
                              for p, y in ((0, 0), (.1, 0), (.4, 0), (.5, 50), (.9, 100), (1, 100))]}
        route = reconstruction.reading_route(source, 3)
        frame = reconstruction.route_interpolate(route, .5, 'progress', 'frame')
        self.assertAlmostEqual(frame, 51, places=4)
        self.assertGreater(frame, 1 + .5 * (route[-1]['frame'] - route[0]['frame']))
        self.assertAlmostEqual(reconstruction.route_interpolate(route, frame, 'frame', 'progress'), .5)

    def test_vertical_columns_match_the_shared_dom_band_with_seal_on_the_left(self):
        entry = {'id': 'vertical', 'title': '花意入器', 'lines': ['吉纹寓美满', '花开祝安宁'],
                 'domWidth': 200, 'domHeight': 360, 'titleSize': 50, 'bodySize': 34, 'seal': '吉庆'}
        parts = reconstruction.vertical_text_parts(entry)
        self.assertEqual([part['part'] for part in parts], ['title', 'column-1', 'column-2', 'seal'])
        self.assertEqual(parts[0]['body'], '花\n意\n入\n器')
        self.assertEqual([part['fontPixels'] for part in parts], [50, 34, 34, 24.48])
        self.assertGreater(parts[0]['x'], parts[1]['x'])
        self.assertGreater(parts[1]['x'], parts[2]['x'])
        self.assertGreater(parts[2]['x'], parts[3]['x'])
        self.assertAlmostEqual(parts[0]['bandWidth'], 236.2)
        self.assertAlmostEqual(parts[3]['y'] + parts[3]['height'], parts[0]['y'] + parts[0]['bandHeight'])
        self.assertAlmostEqual(parts[-1]['x'], (200 - 236.2) / 2)

    def test_vertical_text_rejects_unbounded_columns_and_invalid_font_metrics(self):
        base = {'id': 'vertical', 'title': '题', 'lines': ['甲', '乙'], 'domWidth': 200, 'domHeight': 360}
        for override in ({'lines': ['甲', '乙', '丙']}, {'titleSize': 0}, {'bodySize': float('nan')}, {'domHeight': -10}):
            with self.assertRaises(ValueError):
                reconstruction.vertical_text_parts({**base, **override})

    def test_text_visibility_fades_on_prepared_progress_boundaries(self):
        entry = {'range': [.2, .4], 'fade': .02}
        self.assertEqual(reconstruction.text_opacity(entry, .19), 0)
        self.assertEqual(reconstruction.text_opacity(entry, .2), 0)
        self.assertAlmostEqual(reconstruction.text_opacity(entry, .21), .5)
        self.assertAlmostEqual(reconstruction.text_opacity(entry, .205), .15625)
        self.assertEqual(reconstruction.text_opacity(entry, .3), 1)
        self.assertAlmostEqual(reconstruction.text_opacity(entry, .39), .5)
        self.assertEqual(reconstruction.text_opacity(entry, .41), 0)
        self.assertEqual(reconstruction.text_opacity({}, .5), 1)
        self.assertEqual(reconstruction.text_opacity({'range': [0, 1], 'fade': .05}, 0), 1)
        self.assertEqual(reconstruction.text_opacity({'range': [0, 1], 'fade': .05}, 1), 1)

    def test_invalid_text_ranges_and_font_retirement_are_rejected_before_blender(self):
        base = {'id': 'text', 'title': '题', 'lines': ['短文'], 'narrative': 'test', 'matrix': [1, 0, 0, 0] * 4}
        for override in ({'range': [.4, .2]}, {'range': [-1, .2]}, {'fade': -.1}, {'layout': 'unknown'}, {'seal': ''}):
            path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {'textLayers': [{**base, **override}]}}})
            with self.assertRaises(ValueError):
                reconstruction.load_revision(path, 3)
        path = self.manifest({'schemaVersion': 1, 'activeChapters': [3], 'chapters': {'3': {'hiddenBlenderTextNames': ['same', 'same']}}})
        with self.assertRaises(ValueError):
            reconstruction.load_revision(path, 3)

    def test_source_stop_preview_does_not_require_a_fake_added_layer_anchor(self):
        source = {'frameRange': [1, 101], 'travel': {'axis': 'Y'},
                  'stops': [{'name': 'one', 'frame': 11, 'progress': .1}, {'name': 'two', 'frame': 91, 'progress': .9}],
                  'cameras': [{'progress': p, 'frame': 1 + p * 100, 'position': [0, y, 0]}
                              for p, y in ((0, 0), (.1, 0), (.4, 0), (.5, 50), (.9, 100), (1, 100))]}
        manifest = {'chapters': {'3': {'addedLayers': []}}}
        anchors = preview.choose_anchors(manifest, 3, None, {}, [2], source)
        self.assertEqual(len(anchors), 1)
        self.assertEqual(anchors[0]['anchorFrame'], 91)
        self.assertEqual(anchors[0]['sourceStopName'], 'two')
        self.assertGreater(anchors[0]['progress'], .99)
        with self.assertRaisesRegex(ValueError, 'stop'):
            preview.choose_anchors(manifest, 3, None, {}, [3], source)

    def test_image_datablock_names_and_layout_target_names_are_distinct(self):
        exported = {'images': [{'src': 'textures/image.webp', 'sourceName': 'original-png.png'}],
                    'meshes': [{'name': 'PaintedObject', 'isText': False}], 'textObjects': [{'name': 'OriginalProse'}]}
        revision = {'replacements': [{'id': 'new-image', 'sourceTexture': 'textures/image.webp', 'sourceName': 'PaintedObject'}]}
        with self.assertRaisesRegex(ValueError, 'image datablock'):
            reconstruction.validate_export_targets(revision, exported)
        revision['replacements'][0]['sourceName'] = 'original-png.png'
        reconstruction.validate_export_targets(revision, exported)
        with self.assertRaisesRegex(ValueError, 'painted meshes'):
            reconstruction.validate_export_targets({'layoutAdjustments': [{'meshNames': ['OriginalProse']}]}, exported)
        with self.assertRaisesRegex(ValueError, 'original FONT'):
            reconstruction.validate_export_targets({'hiddenBlenderTextNames': ['PaintedObject']}, exported)


if __name__ == '__main__':
    unittest.main(verbosity=2)
