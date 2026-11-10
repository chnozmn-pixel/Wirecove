#!/usr/bin/env python3
"""Run this app's Python test suite.

The helpers under native/ are plain scripts, not a package, so they are only
importable once that directory is on sys.path. Doing it here keeps the command
a plain `npm run test:py` instead of relying on the shell exporting PYTHONPATH.
"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'native'))

if __name__ == '__main__':
    tests = unittest.defaultTestLoader.discover(
        start_dir=os.path.join(ROOT, 'tests'), pattern='test_*.py',
        top_level_dir=os.path.join(ROOT, 'tests'))
    result = unittest.TextTestRunner(verbosity=2).run(tests)
    sys.exit(0 if result.wasSuccessful() else 1)
