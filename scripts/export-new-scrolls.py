"""Export the new four originals into an isolated revision, never rewrite them.

Blender --background --disable-autoexec --python scripts/export-new-scrolls.py
Then normal Python scripts/prepare-new-scrolls.py.
"""
import os, runpy, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['MDGS_EXPORT_ASSETS']=os.environ.get('MDGS_EXPORT_ASSETS',str(ROOT/'public/assets/new-scrolls'))
report=Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT/'reports/peony-2.0'))
os.environ['MDGS_EXPORT_REPORT']=str(report/'export-summary.json')
os.environ['MDGS_SOURCE_REVISION']=os.environ.get('MDGS_SCROLL_REVISION','peony-2.0-2026-10-22')
sys.argv=['export_blender.py','--','--config',os.environ.get('MDGS_SCROLL_CONFIG',str(ROOT/'scripts/peony-2.0-sources.json'))]
runpy.run_path(str(ROOT/'scripts/export_blender.py'),run_name='__main__')
