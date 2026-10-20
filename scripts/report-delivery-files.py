"""Inventory local delivery changes; user-supplied source/ stays outside delivery."""
import csv
import io
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'reports' / 'reconstruction'


def git_paths(*args):
    data = subprocess.check_output(['git', '-c', 'core.quotepath=false', *args, '-z'], cwd=ROOT)
    return [item.decode('utf-8') for item in data.split(b'\0') if item]


def category(name):
    if name.startswith('artwork/blender-reconstructed/'):
        return 'derived-blender'
    if name.startswith(('artwork/', 'public/assets/reconstruction/')):
        return 'artwork-and-runtime-assets'
    if name.startswith('reports/'):
        return 'evidence-and-documentation'
    if name.startswith('wiki_memory/'):
        return 'engineering-memory'
    return 'code-and-configuration'


def main():
    changed = git_paths('diff', '--name-only', '--diff-filter=ACMRT', 'HEAD')
    deleted = git_paths('diff', '--name-only', '--diff-filter=D', 'HEAD')
    untracked = git_paths('ls-files', '--others', '--exclude-standard')
    excluded = [name for name in untracked if name.startswith('source/')]
    reports = ['reports/reconstruction/delivery-files.json', 'reports/reconstruction/delivery-files.csv']
    added = sorted((set(untracked) | set(reports)) - set(excluded) - set(changed))
    rows = []
    for status, paths in [('modified', changed), ('added', added), ('deleted', deleted)]:
        for name in sorted(paths):
            file = ROOT / name
            rows.append({'status': status, 'category': category(name), 'path': name,
                         'bytes': file.stat().st_size if file.exists() and name not in reports else None})
    manifest = json.loads((ROOT / 'public/assets/reconstruction/manifest.json').read_text(encoding='utf-8'))
    retired = [{'chapter': int(chapter), 'mesh': name, 'status': 'runtime-hidden-original-retained'}
               for chapter, config in manifest['chapters'].items() for name in config.get('hiddenMeshNames', [])]
    result = {'generatedAt': datetime.now(timezone.utc).isoformat(),
              'baseline': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'scope': 'Local worktree changes relative to HEAD, including the earlier portability fix. No commit or push was performed. source/ contains user inputs and is excluded; no source file is removed.',
              'summary': {status: sum(row['status'] == status for row in rows) for status in ['modified', 'added', 'deleted']},
              'excludedUserInputFileCount': len(excluded), 'files': rows, 'retiredRuntimeInstances': retired,
              'sourceFonts': '12 original FONT instances remain exported but are skipped by the web renderer; readable content is provided through HTML and the culture drawer.'}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'delivery-files.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=['status', 'category', 'path', 'bytes'])
    writer.writeheader()
    writer.writerows(rows)
    (OUTPUT / 'delivery-files.csv').write_text(buffer.getvalue(), encoding='utf-8-sig', newline='')
    print(json.dumps({'files': result['summary'], 'retiredRuntimeInstances': len(retired), 'excludedUserInputFiles': len(excluded)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
