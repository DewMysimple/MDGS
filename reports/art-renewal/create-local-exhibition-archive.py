"""Archive a verified frozen exhibition locally, without rewriting any asset."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--build-manifest', required=True)
args = parser.parse_args()
build_file = root / args.build_manifest
build = json.loads(build_file.read_text(encoding='utf-8'))
package = root / 'dist-exhibition'
inventory_file = package / '.mdgs-exhibition-package.json'

def digest(file):
    hasher = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(block)
    return hasher.hexdigest()

assert digest(inventory_file) == build['exhibitionInventorySha256']
inventory = json.loads(inventory_file.read_text(encoding='utf-8'))
rows = inventory['files'] + [{'path': inventory_file.name, 'bytes': inventory_file.stat().st_size, 'sha256': digest(inventory_file)}]
assert len({row['path'] for row in rows}) == len(rows)
for row in rows:
    file = (package / row['path']).resolve()
    assert file.is_relative_to(package.resolve()) and file.is_file()
    assert file.stat().st_size == row['bytes'] and digest(file) == row['sha256']

run_id = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')
destination = root / 'tmp' / 'exhibition-delivery' / run_id
destination.mkdir(parents=True, exist_ok=False)
archive = destination / '国色长卷-电脑端展览包.zip'
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as output:
    for row in sorted(rows, key=lambda item: item['path']):
        info = zipfile.ZipInfo('国色长卷/' + row['path'], date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_STORED
        info.external_attr = 0o100644 << 16
        with (package / row['path']).open('rb') as source, output.open(info, 'w') as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)

with zipfile.ZipFile(archive) as output:
    assert set(output.namelist()) == {'国色长卷/' + row['path'] for row in rows}
    assert output.testzip() is None
    for row in rows:
        hasher = hashlib.sha256()
        with output.open('国色长卷/' + row['path']) as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                hasher.update(block)
        assert hasher.hexdigest() == row['sha256']
        assert digest(package / row['path']) == row['sha256']

report = {
    'status': 'passed', 'createdAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Local ZIP of the frozen standalone exhibition; exact original member bytes, complete CRC and SHA256 read-back. Includes the 361 payload files and inventory marker. ZIP_STORED does not transcode or recompress artwork.',
    'buildManifest': args.build_manifest, 'buildManifestSha256': digest(build_file),
    'exhibitionInventorySha256': build['exhibitionInventorySha256'],
    'archive': archive.relative_to(root).as_posix(), 'archiveBytes': archive.stat().st_size,
    'archiveSha256': digest(archive), 'members': len(rows),
    'uncompressedBytes': sum(row['bytes'] for row in rows),
    'allMemberHashesMatch': True, 'sourceFilesUnchanged': True,
    'gitDelivery': 'ZIP stays in ignored tmp; source/assets and archive verification metadata are delivered through Git. This is a local convenience archive, not a remotely uploaded ZIP.',
    'files': rows,
}
report_file = root / 'reports' / 'art-renewal' / 'exhibition-local-archive.json'
report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({key: report[key] for key in ['status', 'archive', 'archiveBytes', 'archiveSha256', 'members']}, ensure_ascii=False))
