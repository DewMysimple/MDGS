"""Export the new four originals into an isolated revision, never rewrite them.

Blender --background --disable-autoexec --python scripts/export-new-scrolls.py
Then normal Python scripts/prepare-new-scrolls.py.
"""
import os, runpy, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['MDGS_EXPORT_ASSETS']=str(ROOT/'public/assets/new-scrolls')
os.environ['MDGS_EXPORT_REPORT']=str(ROOT/'reports/new-scrolls/export-summary.json')
os.environ['MDGS_SOURCE_REVISION']='peony-2026-10-21'
sys.argv=['export_blender.py','--','--config',str(ROOT/'scripts/new-scroll-sources.json')]
runpy.run_path(str(ROOT/'scripts/export_blender.py'),run_name='__main__')
