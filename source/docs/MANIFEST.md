# v4 3D assets — MANIFEST

Pipeline: `/home/claude/v4/blender/build_all.sh` (tex_gen.py -> person.py / cars.py / lot_build.py in Blender 4.2 -> gltf-transform dedup/prune/webp -> EXT_meshopt FILTER compression). Sources in `/home/claude/v4/blender/`.

## Files
| file | size | tris (instanced) | prims / materials | notes |
|---|---|---|---|---|
| lot.glb | 1.12 MB | 45,402 | 62 prims (about 32 static joined-by-material + 30 named dynamic parts) / 33 materials | textures: floor 3072x2194 webp, wall/concrete/ramp/hazard tiles, sign atlas 2048x768 |
| cars.glb | 0.27 MB | 35,994 total (about 12.0k per car) | 48 prims / 15 materials | 3 cars + wheels as child empties |
| person.glb | 0.15 MB | 5,880 | 9 prims / 9 materials, 1 skin, 17 joints | 5 animations |
| total | 1.54 MB | | | target 2.5 MB met |

Needs: `EXT_meshopt_compression` (MeshoptDecoder), `EXT_texture_webp`, `KHR_materials_emissive_strength`/`KHR_materials_specular` (standard in three r15x+). I deliberately used the meshopt FILTER method, NOT KHR_mesh_quantization, so no node ends up with a scale != 1 (named nodes keep clean transforms).
Coordinates: Blender (x,y,z) -> glTF (x, z, -y) as in SPEC. Re-read from the optimized GLBs with gltf-transform + MeshoptDecoder: all names/anchors/animations/skin verified.

## lot.glb
Named dynamic meshes (each a separate node; origin = its own centre unless noted):
`OLED_A..D` (UV 0-1 plane facing the lane, material `OLEDScreen`), `LED_A..D` (`LEDBar`), `SIGN_E1..E4` and `SIGN_Q` (`ExitSign`, emissive texture, green pictogram I drew), `DOOR_E1..E4`, `DOOR_Q` (origin = hinge edge at floor, so rotate about local Y to open; materials DoorSteel/WiredGlass/Chrome), `SOS_S1/S2` (housing, big button, plate "비상벨 SOS"), `BEACON_S1/S2` (dome, `Beacon`), `RS_R0..R3` (`RSSensor`, on the left ramp wall at the landing, z = landing + 1.1).
Dynamic meshes share ONE material per type (OLEDScreen, LEDBar, ExitSign, Beacon, RSSensor, DoorSteel...) to stay under the material budget: clone the material per mesh in the web code if each must change colour independently.
Static content: painted floor (epoxy green aisles, blue EV bays + EV marks, white lines, stall numbers A-01..B-06, hatching, crosswalk, lane arrows, yellow pillar frames, hazard stripes at the ramp mouth, SOS floor boxes, refuge marking), walls with panel joints + painted lower band + baseboard, front wall 1.0 m (2.6 m around the refuge door), refuge room Q (3 x 2.5 m, walls 2.6 m, front wall 1.0 m), pillars with yellow-black corner guards, OLED housings (rounded, bevelled), LED bar housings, extinguisher cabinets (pillars + beside doors), ceiling beams (perimeter, y=+-5, x=+-7 lines), red sprinkler pipes + heads + brackets, riser, cable trays with cables, linear LED fixtures (emissive, along beams/edges only), EV chargers with hanging cables and glow strip, yellow wheel stops (12), steel fire-door frames, ramp (grooved concrete tile, side walls 1.6 m, yellow-black curbs, level plates B3 / B2 / B1 / 1F 출구 on both walls, wall LED strips), daylight apron + sky glow beyond y=43.
Ramp profile: landings +-0.4 m around R0..R3 (y=11/21/31/41 at z=0/3.2/6.4/9.6), 7 m wide, runs to y=43 then the `Daylight`/`SkyGlow` emissive apron.
AO: baked (see deviations). Floor: AO + soft light pools under the LED fixtures multiplied into the floor texture. Walls/pillars/ramp/curbs/refuge floor: AO in vertex colours (`COLOR_0`; three.js picks it up automatically; materials WallPaint, Concrete, RampSurface, Hazard, RefugeFloor).

### Anchors (Blender coords x, y, z; Empty nodes `ANCHOR_<id>`, glTF y/z swapped as per SPEC)
A(-7,5,0) B(7,5,0) C(-7,-5,0) D(7,-5,0); E1(-14,8,0) E2(14,8,0) E3(-14,-8,0) E4(14,-8,0); S1(-14,0,0) S2(14,0,0); Q(0,-10,0); R0(0,11,0) R1(0,21,3.2) R2(0,31,6.4) R3(0,41,9.6); M(0,0,0);
carA(-10,6.5,0) carB(10,6.5,0) carC(-10,-6.5,0) carD(10,-6.5,0) carR(2,8.5,0);
spawn_1..12: (-2,7) (-3.4,3) (3.4,3) (0,2.2) (-5.6,0) (5.6,0) (-3,-2.5) (3,-2.5) (0,-6) (-5.5,-7) (5.5,-7) (-2.2,-8.8), all z=0, clear of pillars/cars.
Extra (not in SPEC): `ANCHOR_park_1..10` = free parking slots for ordinary cars: (-10,4) (-10,1.5) (-10,-1.5) (-10,-4) (10,4) (10,1.5) (10,-1.5) (10,-4) (-10,6.5) (10,-6.5); cars sit with their long axis along x, front (+y of the car) toward the lane (yaw -90 deg on the left side, +90 deg on the right).
Layout I used: bays 5.0 m deep x 2.5 m wide at x in [-12.5,-7.5] / [7.5,12.5], bay lines at y = +-0.25, 2.75, 5.25, 7.75 (so carA/B/C/D at +-6.5 are bay-centred); EV bays = the 4 middle bays at y = +-1.5; 1.4 m green pedestrian walkway along each side wall; door aisles at y=+-8.

## cars.glb
Roots `CAR_EV_HATCH`, `CAR_SEDAN`, `CAR_SUV` (origin bottom centre, front = +Y Blender). Children: `<car>_Body` (multi-material: Paint, BlackTrim, Seam, WheelWell), `_Glass`, `_Headlight`, `_Taillight`, `_BlackTrim` (grille, arch trim, mirror stalks), `_Chrome` (handles, DRL), `_Paint` (mirror shells), `_Plate1` (plate texture "12가 3456" etc.), `_ChargePort` (+ ring, left front fender), `_Seam`; wheel empties `<car>_WHEEL_FL/FR/RL/RR` each with Tire (tread grooves), Rim (5-spoke alloy), Brake. Body material is the single shared material `Paint` (clone per car in web). Door seams are real grooves. Lofted bodies (no subdivision modifier; smooth profile curves + boolean wheel arches), glass is projected decals.

## person.glb
`Armature` (17 bones: Hips, Spine, Chest, Neck, Head, UpperArm/Forearm/Hand L+R, Thigh/Shin/Foot L+R) + skinned meshes `P_Skin, P_Shirt (material "Shirt", base colour blue-ish; tint it), P_Pants, P_Shoes, P_Sole, P_Hair, P_EyeWhite, P_Iris, P_Lips`. Height 1.70 m, front = +Y (Blender). Animations (24 fps, in place, loops with last key == first): `Run` 0.75 s, `CrouchWalk` 1.21 s (right hand to mouth), `Idle` 2.04 s, `PressButton` 1.25 s (reach, press, release), `WaitCrouch` 2.04 s (deep squat, both hands at mouth).

## Previews
preview_lot.png (3/4 elevated), preview_closeup.png (pillar + OLED/LED + extinguisher + cars, SOS in background), preview_cars.png, preview_person.png (all five poses; Run is the right-most figure). Rendered with Cycles from the un-optimized GLB re-imported into Blender.

## Deviations / notes
1. AO "bake": instead of a Cycles atlas bake I computed AO with BVH ray casting (96 rays/vertex, 24 rays/texel) in Blender: result = vertex-colour AO for walls/pillars/ramp and an AO + light-pool multiplied floor texture. Takes about 15 s total, no lightmap UV set (saves a 2nd texture + a UV channel). No diffuse GI bake.
2. lot.glb has 62 primitives (33 materials); the ~30 extra primitives are the named dynamic parts that must not be merged. Static content is joined by material (about 32 prims).
3. Ordinary parked cars are NOT in lot.glb; place `cars.glb` clones at `ANCHOR_car*` / `ANCHOR_park_*`.
4. Front low wall has a 2.6 m raised piece around DOOR_Q; the longitudinal ceiling beams simply end at y=-10 (cut-away).
5. Wheels are not animated; person `Shirt` is mid blue (0.20,0.42,0.78).
