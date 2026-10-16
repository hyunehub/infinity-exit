#!/bin/bash
# full pipeline: textures -> blender (person, cars, lot) -> gltf-transform optimize -> /home/claude/v4/assets
set -e
cd /home/claude/v4/blender
PY=/home/claude/venv42/bin/python
GT="npx -y @gltf-transform/cli@4"
python3 tex_gen.py
$PY person.py > person.log 2>&1 || true
$PY cars.py > cars.log 2>&1 || true
$PY lot_build.py > lot_build.log 2>&1 || true
for n in lot cars person; do
  q=82; [ $n = lot ] && q=90
  $GT dedup ${n}_raw.glb opt/${n}1.glb >/dev/null 2>&1
  $GT prune opt/${n}1.glb opt/${n}2.glb --keep-leaves true --keep-attributes true >/dev/null 2>&1
  $GT webp opt/${n}2.glb opt/${n}3.glb --quality $q >/dev/null 2>&1
  (cd verify && node compress.mjs ../opt/${n}3.glb ../opt/${n}_f.glb >/dev/null 2>&1)
  cp opt/${n}_f.glb /home/claude/v4/assets/$n.glb
done
ls -la /home/claude/v4/assets/*.glb
