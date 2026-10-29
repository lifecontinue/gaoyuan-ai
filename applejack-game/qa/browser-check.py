"""Compatibility entry point for the current 21-level browser regression suite."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('expansion-check.py')), run_name='__main__')
