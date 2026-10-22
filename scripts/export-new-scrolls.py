"""Export the new four originals into an isolated revision, never rewrite them.

Blender --background --disable-autoexec --python scripts/export-new-scrolls.py
Then normal Python scripts/prepare-new-scrolls.py.
"""
import os, runpy, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('MDGS_EXPORT_ASSETS',str(ROOT/'public/assets/new-scrolls'))
os.environ.setdefault('MDGS_EXPORT_REPORT',str(ROOT/'reports/peony2-fidelity/export-summary.json'))
os.environ.setdefault('MDGS_SOURCE_REVISION','peony-2.0-2026-10-23')
os.environ.setdefault('MDGS_SOURCE_LABEL_ROOT','牡丹2.0')
arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if '--config' not in arguments:
    arguments=['--config',str(ROOT/'scripts/new-scroll-sources.json'),*arguments]
sys.argv=['export_blender.py','--',*arguments]
runpy.run_path(str(ROOT/'scripts/export_blender.py'),run_name='__main__')
