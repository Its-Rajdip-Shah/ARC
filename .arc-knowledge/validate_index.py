#!/usr/bin/env python3
"""Validate the tracked ARC knowledge map against the current working tree."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
map_path = root / '.arc-knowledge/repo_map.json'
meta = json.loads(map_path.read_text())
entries = meta['files']
paths = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()

def indexed_candidate(p):
    excluded_prefixes = ('tests/reports/','frontend/src/assets/','frontend/public/','.arc-knowledge/')
    excluded_names = {'package-lock.json','requirements-lock.txt','.DS_Store','db.sqlite3','.coverage','handoff.md'}
    excluded_ext = {'.pyc','.log','.sqlite3','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.otf','.pdf','.zip'}
    path = Path(p)
    return (not p.startswith(excluded_prefixes) and path.name not in excluded_names
            and not path.name.startswith('.env') and path.suffix.lower() not in excluded_ext
            and not any(x in p.split('/') for x in ('node_modules','.venv','__pycache__','dist','build','.git')))

current = {p for p in paths if indexed_candidate(p) and (root/p).is_file()}
known = set(entries)
missing = sorted(known-current)
new = sorted(current-known)
changed = sorted(p for p in known & current if hashlib.sha256((root/p).read_bytes()).hexdigest()!=entries[p]['sha256'])
bad_links = sorted((p,r) for p,e in entries.items() for r in e.get('local_imports',[]) if r not in current)
for label,values in [('MISSING',missing),('NEW',new),('HASH_CHANGED',changed),('BROKEN_IMPORT',bad_links)]:
    print(f'{label}: {len(values)}')
    for v in values[:50]: print('  ',v)
if missing or new or changed or bad_links:
    print('Knowledge map is stale. Update affected entries; do not silently rewrite hashes without inspecting changes.')
    sys.exit(1)
print('Knowledge map matches current repository files and hashes.')
