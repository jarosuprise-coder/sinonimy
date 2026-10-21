"""Использование: python3 tools/build_dicts.py ПАПКА_С_ИСХОДНИКАМИ dict

В папке с исходниками должны лежать клоны:
  synonym_dictionary/ (github.com/egorkaru/synonym_dictionary)
  lo/ru_RU/ (github.com/LibreOffice/dictionaries, папка ru_RU)
  rwn/data/rwn-2021/ (github.com/avidale/python-ruwordnet)

Собирает компактные файлы словарей для панели: dict/*.json
Формат: {"id","name","v","g":[[метка, слово, слово...]...], "h":{слово:[номера групп]} (необязательно)}
Если "h" нет, каждое слово группы указывает на эту группу (симметричные синсеты)."""
import json, re, sys, os, subprocess, xml.etree.ElementTree as ET
DL = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)

def norm(s): return s.lower().replace('ё', 'е').strip()

def clean_word(w):
    w = re.sub(r'\([^)]*\)', ' ', w)
    w = re.sub(r'\s+', ' ', w).strip().strip('.,;:')
    if not w or len(w) < 2 or len(w.split()) > 3 or re.search(r'[a-zA-Z0-9<>=]', w): return None
    return w.lower()

def save(id_, name, groups, heads=None):
    seen, g2, remap = {}, [], {}
    for i, g in enumerate(groups):
        key = (g[0], tuple(g[1:]))
        if key in seen: remap[i] = seen[key]; continue
        seen[key] = len(g2); remap[i] = len(g2); g2.append(g)
    data = {"id": id_, "name": name, "v": 1, "g": g2}
    if heads is not None:
        h = {}
        for k, ids in heads.items():
            ids2 = []
            for i in ids:
                j = remap[i]
                if j not in ids2: ids2.append(j)
            h[k] = ids2
        data["h"] = h
    p = os.path.join(OUT, id_ + '.json')
    with open(p, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(id_, len(g2), 'groups', len(data.get('h', {})), 'heads', os.path.getsize(p) // 1024, 'KB')

js = r'''
const S=require(process.argv[1]); const d=require(process.argv[2]);
const idx=S.buildIndex(d.wordlist); process.stdout.write(JSON.stringify(idx));
'''
idx = json.loads(subprocess.check_output(['node', '-e', js, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'synonyms.js'),
                                          os.path.join(DL, 'synonym_dictionary/dictionary.json')]))
groups, heads = [], {}
for k, syns in idx.items():
    heads[k] = [len(groups)]; groups.append([''] + syns)
save('abramov', 'Абрамов', groups, heads)

LABELS = {'(синоним)': '', '(сходный термин)': 'сходные', '(антоним)': None}
groups, heads = [], {}
with open(os.path.join(DL, 'lo/ru_RU/th_ru_RU_M_aot_and_v2.dat'), encoding='utf-8-sig') as f:
    lines = f.read().splitlines()
i = 1; unknown = {}
while i < len(lines):
    head, n = lines[i].rsplit('|', 1); n = int(n); i += 1
    hk = norm(head)
    for _ in range(n):
        parts = lines[i].split('|'); i += 1
        lab = parts[0]
        if lab.startswith('(синоним)'): lab = '(синоним)'
        if lab == '(связанный термин)': lab2 = 'связанные'
        elif lab in LABELS:
            lab2 = LABELS[lab]
        else:
            unknown[lab] = unknown.get(lab, 0) + 1; lab2 = lab.strip('()')
        if lab2 is None: continue
        ws = []
        for w in parts[1:]:
            c = clean_word(w)
            if c and norm(c) != hk and c not in ws: ws.append(c)
        if ws:
            heads.setdefault(hk, []).append(len(groups)); groups.append([lab2] + ws)
print('LO labels other:', sorted(unknown.items(), key=lambda x: -x[1])[:10])
save('libreoffice', 'LibreOffice', groups, heads)

groups = []
for pos in 'NVA':
    names = {}
    for sense in ET.parse(os.path.join(DL, f'rwn/data/rwn-2021/senses.{pos}.xml')).getroot():
        names[sense.get('id')] = sense.get('name') or ''
    root = ET.parse(os.path.join(DL, f'rwn/data/rwn-2021/synsets.{pos}.xml')).getroot()
    for s in root:
        ws = []
        for sense in s:
            c = clean_word(names.get(sense.get('id')) or sense.text or '')
            if c and c not in ws: ws.append(c)
        if len(ws) >= 2:
            groups.append([(s.get('ruthes_name') or '').lower()] + ws)
save('ruwordnet', 'RuWordNet', groups)
