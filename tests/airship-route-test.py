"""Airship data gates must reject unreachable ports and free walking bypasses."""
import copy
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build import audit_airships

DATA = Path(__file__).resolve().parents[1] / 'source' / 'data'
def read(name):
    return json.loads((DATA / name).read_text(encoding='utf-8-sig'))
spec, maps, npcs = read('db-airships.json'), read('db-maps.json'), read('db-npcs.json')
assert audit_airships(spec, maps, npcs) == []
wrong = copy.deepcopy(spec)
wrong['routes']['domestic']['stops'][0] = '등록되지 않은 공항'
assert any('정박지 미등록' in e for e in audit_airships(wrong, maps, npcs))
wrong = copy.deepcopy(spec)
wrong['routes']['international']['flightMs'] = 0
assert any('flightMs' in e for e in audit_airships(wrong, maps, npcs))
wrong_maps = copy.deepcopy(maps)
wrong_maps['비공정 국내선']['noSavePoint'] = False
assert any('귀환지점' in e for e in audit_airships(spec, wrong_maps, npcs))
wrong_maps = copy.deepcopy(maps)
wrong_maps['이즈루드']['connected'].append('비공정 국제선')
assert any('도보 진입 불가' in e for e in audit_airships(spec, wrong_maps, npcs))
wrong_npcs = {k: v for k, v in npcs.items() if not (v.get('service') == 'airship' and v.get('map') == '유노')}
assert any('안내원 누락' in e for e in audit_airships(spec, maps, wrong_npcs))
print('PASS airship route/map/NPC audit rejects missing ports, invalid timing, savepoint and free-walking errors')
