import bpy, bmesh, math, json, sys, os, time
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
V = Vector
T0 = time.time()
TEX = '/home/claude/v4/blender/tex/'
OUT = '/home/claude/v4/blender/lot_raw.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)

# =============================================================== materials
MATS = {}
def pm(name, color, rough=0.6, metal=0.0, emit=None, estr=1.0, tex=None, vcol=False, spec=0.4, emit_tex=False, alpha=None, repeat=True):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    src = None
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex)
        if not repeat: t.extension = 'EXTEND'
        src = t.outputs['Color']
        if emit_tex:
            nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = estr
    if vcol:
        c = nt.nodes.new('ShaderNodeVertexColor'); c.layer_name = 'Col'
        if src is not None:
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
            nt.links.new(src, mx.inputs[6]); nt.links.new(c.outputs['Color'], mx.inputs[7]); src = mx.outputs[2]
        else:
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
            mx.inputs[6].default_value = (*color, 1); nt.links.new(c.outputs['Color'], mx.inputs[7]); src = mx.outputs[2]
    if src is not None: nt.links.new(src, b.inputs['Base Color'])
    if emit and not emit_tex:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = estr
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    MATS[name] = m
    return m

FLOORIMG = TEX + 'floor_final.png'
# placeholder; real floor material created after composite
AO_MATS = {'WallPaint', 'Concrete', 'RampSurface', 'Hazard', 'RefugeFloor'}
pm('WallPaint', (1, 1, 1), 0.85, tex=TEX + 'wall.png', vcol=True, spec=0.15)
pm('Concrete', (1, 1, 1), 0.9, tex=TEX + 'concrete.png', vcol=True, spec=0.1)
pm('RampSurface', (1, 1, 1), 0.92, tex=TEX + 'ramp.png', vcol=True, spec=0.1)
pm('Hazard', (1, 1, 1), 0.7, tex=TEX + 'hazard.png', vcol=True, spec=0.2)
pm('RefugeFloor', (0.13, 0.5, 0.3), 0.55, vcol=True, spec=0.3)
pm('YellowPaint', (0.85, 0.66, 0.06), 0.55, spec=0.3)
pm('DoorSteel', (0.30, 0.42, 0.38), 0.45, 0.6, spec=0.5)
pm('DoorFrame', (0.14, 0.16, 0.16), 0.5, 0.7)
pm('ExitSign', (1, 1, 1), 0.4, tex=TEX + 'signs.png', emit_tex=True, estr=1.0, spec=0.3)
pm('SignWhite', (0.9, 0.9, 0.88), 0.4)
pm('WiredGlass', (0.15, 0.25, 0.28), 0.1, 0.0, spec=1.0)
pm('Chrome', (0.8, 0.8, 0.82), 0.2, 1.0)
pm('Galv', (0.62, 0.64, 0.66), 0.45, 0.9)
pm('RedPipe', (0.72, 0.06, 0.05), 0.4, 0.2)
pm('Brass', (0.75, 0.55, 0.2), 0.3, 1.0)
pm('SOSRed', (0.78, 0.05, 0.04), 0.35, 0.0, spec=0.5)
pm('SOSButton', (0.9, 0.03, 0.02), 0.2, 0.0, emit=(1.0, 0.05, 0.02), estr=0.6, spec=0.7)
pm('Beacon', (1.0, 0.45, 0.05), 0.15, 0.0, emit=(1.0, 0.4, 0.05), estr=1.5, spec=0.8)
pm('Signs', (1, 1, 1), 0.45, tex=TEX + 'signs.png', spec=0.3)
pm('OLEDHousing', (0.06, 0.06, 0.07), 0.3, 0.6)
pm('OLEDScreen', (0.01, 0.015, 0.02), 0.1, 0.0, emit=(0.02, 0.05, 0.08), estr=0.6, spec=1.0)
pm('LEDBar', (0.9, 0.95, 1.0), 0.3, 0.0, emit=(0.4, 1.0, 0.6), estr=2.0)
pm('LightPanel', (1, 1, 1), 0.3, 0.0, emit=(1.0, 0.97, 0.9), estr=4.0)
pm('LightHousing', (0.85, 0.85, 0.85), 0.5, 0.2)
pm('BlackPlastic', (0.02, 0.02, 0.025), 0.5, 0.0, spec=0.3)
pm('EVBody', (0.92, 0.93, 0.95), 0.35, 0.0, spec=0.5)
pm('ChargerGlow', (0.2, 0.5, 1.0), 0.3, 0.0, emit=(0.15, 0.5, 1.0), estr=2.0)
pm('ExtRed', (0.8, 0.04, 0.03), 0.3, 0.3)
pm('CabGlass', (0.5, 0.6, 0.65), 0.05, 0.0, spec=1.0, alpha=0.35)
pm('RSSensor', (0.9, 0.9, 0.92), 0.3, 0.0, emit=(0.1, 0.6, 1.0), estr=1.0)
pm('Daylight', (1, 1, 1), 0.5, 0.0, emit=(0.95, 0.97, 1.0), estr=3.0)
pm('SkyGlow', (0.7, 0.85, 1.0), 0.5, 0.0, emit=(0.6, 0.8, 1.0), estr=3.0)

# =============================================================== geometry accumulators
ACC = {}
def acc(mat):
    if mat not in ACC:
        b = bmesh.new(); b.loops.layers.uv.new('UVMap')
        if mat in AO_MATS: b.loops.layers.color.new('Col')
        ACC[mat] = b
    return ACC[mat]
NAMED = []   # (name, bm, [mats], origin)
BVH_EXTRA = []

def merge_into(dst, src):
    me = bpy.data.meshes.new('t'); src.to_mesh(me)
    dst.from_mesh(me); bpy.data.meshes.remove(me)

def set_uv_world(bm, tu, tv, faces=None, vfun=None):
    uvl = bm.loops.layers.uv.verify()
    for f in (faces if faces is not None else bm.faces):
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            if ax == 0: uv = (p.y / tu, p.z / tv)
            elif ax == 1: uv = (p.x / tu, p.z / tv)
            else: uv = (p.x / tu, p.y / tu)
            l[uvl].uv = uv

def grid_face(bm, p, u, v, step):
    nu = max(1, int(math.ceil(u.length / step - 1e-6))); nv = max(1, int(math.ceil(v.length / step - 1e-6)))
    vs = [[bm.verts.new(p + u * (i / nu) + v * (j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    out = []
    for i in range(nu):
        for j in range(nv):
            out.append(bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1])))
    return out

def slab(mat, x0, x1, y0, y1, z0, z1, step=0.3, skip=(), uvt=(2.4, 3.2), target=None):
    bm = target or acc(mat)
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    F = {'+x': (V((x1, y0, z0)), V((0, dy, 0)), V((0, 0, dz))), '-x': (V((x0, y1, z0)), V((0, -dy, 0)), V((0, 0, dz))),
         '+y': (V((x1, y1, z0)), V((-dx, 0, 0)), V((0, 0, dz))), '-y': (V((x0, y0, z0)), V((dx, 0, 0)), V((0, 0, dz))),
         '+z': (V((x0, y0, z1)), V((dx, 0, 0)), V((0, dy, 0))), '-z': (V((x0, y1, z0)), V((dx, 0, 0)), V((0, -dy, 0)))}
    allf = []
    for k, (p, u, v) in F.items():
        if k in skip: continue
        if k == '+z' and mat == 'WallPaint' and target is None:
            cb = acc('Concrete'); ff_ = grid_face(cb, p, u, v, step)
            bmesh.ops.recalc_face_normals(cb, faces=ff_); set_uv_world(cb, 2, 2, ff_)
            continue
        allf += grid_face(bm, p, u, v, step)
    bmesh.ops.recalc_face_normals(bm, faces=allf)
    set_uv_world(bm, uvt[0], uvt[1], allf)
    return allf

def cube(c, s, bevel=0.0, seg=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = V((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], offset=bevel, segments=seg, affect='EDGES')
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=V(c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def cyl(p0, p1, r, seg=12, cap=True, r1=None):
    p0 = V(p0); p1 = V(p1); d = p1 - p0; L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=(r if r1 is None else r1), depth=L)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(p0 + p1) / 2)
    return bm

def sphere(c, r, seg=12, rings=8, half=False):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts: v.co = V((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + V(c)
    if half:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < c[2] - 1e-6], context='VERTS')
    return bm

def tube(pts, r, seg=6):
    bm = bmesh.new(); rings = []
    pts = [V(p) for p in pts]
    for i, P in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(V((0, 0, 1)))
        if a.length < 1e-3: a = t.cross(V((1, 0, 0)))
        a.normalize(); b = t.cross(a)
        rings.append([bm.verts.new(P + (a * math.cos(2 * math.pi * j / seg) + b * math.sin(2 * math.pi * j / seg)) * r) for j in range(seg)])
    for i in range(len(rings) - 1):
        for j in range(seg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def put(mat, bm):
    merge_into(acc(mat), bm); bm.free()

def quad_uv(bm, p, u, v, uvr, front_normal=None):
    """textured quad (p origin, u,v vectors) with atlas rect uvr=(u0,v0,u1,v1)"""
    vs = [bm.verts.new(p), bm.verts.new(p + u), bm.verts.new(p + u + v), bm.verts.new(p + v)]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.verify()
    uv = [(uvr[0], uvr[1]), (uvr[2], uvr[1]), (uvr[2], uvr[3]), (uvr[0], uvr[3])]
    for l, c in zip(f.loops, uv): l[uvl].uv = c
    return f
def cell_uv(i):
    c, r = i % 4, i // 4
    return (c / 4, 1 - (r + 1) / 3, (c + 1) / 4, 1 - r / 3)

def named(name, bm, mats, origin=None):
    NAMED.append((name, bm, mats, origin))

def anchor_list():
    return A
A = {}

# =============================================================== constants
HH = 3.2
WT = 0.3
ST = 0.28
PIL = {'A': (-7, 5), 'B': (7, 5), 'C': (-7, -5), 'D': (7, -5)}
DOORS = {'E1': (-14, 8), 'E2': (14, 8), 'E3': (-14, -8), 'E4': (14, -8)}
SOS = {'S1': (-14, 0), 'S2': (14, 0)}
RAMP_Y = {'R0': (11, 0.0), 'R1': (21, 3.2), 'R2': (31, 6.4), 'R3': (41, 9.6)}
LAND = 0.4
def zprof(y):
    pts = [(10, 0), (11.4, 0), (20.6, 3.2), (21.4, 3.2), (30.6, 6.4), (31.4, 6.4), (40.6, 9.6), (50, 9.6)]
    for (ya, za), (yb, zb) in zip(pts, pts[1:]):
        if ya <= y <= yb: return za + (zb - za) * (y - ya) / (yb - ya) if yb > ya else za
    return 9.6
YB = [10, 11.4, 20.6, 21.4, 30.6, 31.4, 40.6, 43.0]
def ysamples(step=0.4):
    out = []
    for a, b in zip(YB, YB[1:]):
        n = max(1, int(math.ceil((b - a) / step)))
        for i in range(n): out.append(a + (b - a) * i / n)
    out.append(YB[-1])
    return out
YS = ysamples()

# =============================================================== FLOOR (textured, planar UV)
bmf = acc('Floor') if 'Floor' in ACC else None
FLOOR_BM = bmesh.new(); FLOOR_BM.loops.layers.uv.new('UVMap')
vs = [FLOOR_BM.verts.new(p) for p in ((-14, -10, 0), (14, -10, 0), (14, 10, 0), (-14, 10, 0))]
ff = FLOOR_BM.faces.new(vs); uvl = FLOOR_BM.loops.layers.uv.active
for l, uv in zip(ff.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
ACC['Floor'] = FLOOR_BM

# =============================================================== WALLS
# side walls with door openings (x = +-14 inner face)
for sx in (-1, 1):
    xi, xo = (-14.0, -14.3) if sx < 0 else (14.0, 14.3)
    x0, x1 = min(xi, xo), max(xi, xo)
    spans = [(-10.3, -8.6), (-7.4, 7.4), (8.6, 10.3)]
    # openings at |y|=8: y in [7.4,8.6] and [-8.6,-7.4]; pieces between
    pieces = [(-10.0, -8.6), (-7.4, 7.4), (8.6, 10.3)]
    for (ya, yb) in pieces:
        slab('WallPaint', x0, x1, ya, yb, 0, HH, step=0.3, skip=('-z',) if True else ())
    # (the wall segment y -10..10.3 minus the two openings)
    for yc in (8, -8):
        slab('WallPaint', x0, x1, yc - 0.6, yc + 0.6, 2.1, HH, step=0.3, skip=('-z',))
# fix: pieces include [-10,-8.6] and [8.6,10.3] ; the segment [-7.4,7.4] is the middle; openings are [7.4,8.6] and [-8.6,-7.4]
# back wall y in [10,10.3] with ramp opening x in [-3.5,3.5]
slab('WallPaint', -14.3, -3.5, 10.0, 10.3, 0, HH, step=0.3, skip=('-z',))
slab('WallPaint', 3.5, 14.3, 10.0, 10.3, 0, HH, step=0.3, skip=('-z',))
slab('Concrete', -3.5, 3.5, 10.0, 10.3, 2.6, HH, step=0.3, skip=('-z',) and ())
# front low wall y in [-10.3,-10] z 0..1.0, raised piece around the refuge door
slab('WallPaint', -14.3, -1.8, -10.3, -10.0, 0, 1.0, step=0.3, skip=('-z',))
slab('WallPaint', 1.8, 14.3, -10.3, -10.0, 0, 1.0, step=0.3, skip=('-z',))
slab('WallPaint', -1.8, -0.6, -10.3, -10.0, 0, 2.6, step=0.3, skip=('-z',))
slab('WallPaint', 0.6, 1.8, -10.3, -10.0, 0, 2.6, step=0.3, skip=('-z',))
slab('WallPaint', -0.6, 0.6, -10.3, -10.0, 2.05, 2.6, step=0.3, skip=('-z',))
# refuge room Q
slab('WallPaint', -1.8, -1.5, -13.1, -10.3, 0, 2.6, step=0.3, skip=('-z',))
slab('WallPaint', 1.5, 1.8, -13.1, -10.3, 0, 2.6, step=0.3, skip=('-z',))
slab('WallPaint', -1.5, 1.5, -13.1, -12.8, 0, 1.0, step=0.3, skip=('-z',))
# refuge floor
rf = acc('RefugeFloor'); grid_face(rf, V((-1.5, -12.8, 0)), V((3, 0, 0)), V((0, 2.5, 0)), 0.35)
for f in rf.faces: f.normal_update()
set_uv_world(rf, 2, 2)
# corner posts closing the wall corners at ends (outer face coverage is done by slabs)

# =============================================================== PILLARS
for pid, (px, py) in PIL.items():
    slab('WallPaint', px - 0.4, px + 0.4, py - 0.4, py + 0.4, 0, HH, step=0.25, skip=('-z',), uvt=(2.4, 3.2))
    # yellow-black corner guards 0.12 L-guards, 1.2 high
    for cx in (-1, 1):
        for cy in (-1, 1):
            slab('Hazard', px + cx * 0.4 + (0 if cx > 0 else -0.0) - (0.0), px + cx * 0.4 + cx * 0.025, py + cy * 0.4, py + cy * 0.4 + cy * 0.025, 0.0, 1.2, step=0.6, uvt=(0.45, 0.45)) if False else None
    for cx in (-1, 1):
        for cy in (-1, 1):
            gx0 = px + cx * 0.4 - (0.07 if cx > 0 else 0.0) + (-0.0 if cx > 0 else -0.0)
            # L guard = two thin plates on each face of the corner
            xa, xb = sorted((px + cx * 0.4, px + cx * 0.4 - cx * 0.1))
            ya, yb = sorted((py + cy * 0.4 + cy * 0.015, py + cy * 0.4 - cy * 0.0))
            slab('Hazard', xa, xb, ya, yb, 0.0, 1.2, step=0.6, skip=('-z', '-y' if cy > 0 else '+y'), uvt=(0.5, 0.5))
            xa, xb = sorted((px + cx * 0.4 + cx * 0.015, px + cx * 0.4))
            ya, yb = sorted((py + cy * 0.4, py + cy * 0.4 - cy * 0.1))
            slab('Hazard', xa, xb, ya, yb, 0.0, 1.2, step=0.6, skip=('-z', '-x' if cx > 0 else '+x'), uvt=(0.5, 0.5))
    # OLED housing + LED bar facing the lane (towards x=0)
    d = 1 if px < 0 else -1
    fx = px + d * 0.4
    put('OLEDHousing', cube((fx + d * 0.04, py - 0.06, 2.05), (0.08, 0.56, 1.02), bevel=0.04, seg=3))
    # screen plane (named), UV 0..1 facing lane
    sbm = bmesh.new(); uvl_ = sbm.loops.layers.uv.new('UVMap')
    sw, sh = 0.46, 0.86; sx_ = fx + d * 0.083
    cy_ = py - 0.06
    if d > 0:
        pts = [(sx_, cy_ - sw / 2, 2.05 - sh / 2), (sx_, cy_ + sw / 2, 2.05 - sh / 2), (sx_, cy_ + sw / 2, 2.05 + sh / 2), (sx_, cy_ - sw / 2, 2.05 + sh / 2)]
    else:
        pts = [(sx_, cy_ + sw / 2, 2.05 - sh / 2), (sx_, cy_ - sw / 2, 2.05 - sh / 2), (sx_, cy_ - sw / 2, 2.05 + sh / 2), (sx_, cy_ + sw / 2, 2.05 + sh / 2)]
    fv = [sbm.verts.new(p) for p in pts]; fc = sbm.faces.new(fv)
    for l, uv in zip(fc.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl_].uv = uv
    bmesh.ops.recalc_face_normals(sbm, faces=sbm.faces[:])
    if fc.normal.x * d < 0: bmesh.ops.reverse_faces(sbm, faces=sbm.faces[:])
    named('OLED_' + pid, sbm, ['OLEDScreen'])
    # LED bar housing + lit strip
    ly_ = py + 0.31
    put('OLEDHousing', cube((fx + d * 0.02, ly_, 2.0), (0.04, 0.07, 1.5), bevel=0.015, seg=2))
    lb = cube((fx + d * 0.043, ly_, 2.0), (0.012, 0.035, 1.42), bevel=0.005, seg=1)
    named('LED_' + pid, lb, ['LEDBar'])
    # extinguisher cabinet on the face towards the camera (-y)
    ex = px; ey = py - 0.4
    put('ExtRed', cube((ex, ey - 0.06, 1.2), (0.34, 0.12, 0.62), bevel=0.012, seg=2))
    put('CabGlass', cube((ex, ey - 0.122, 1.2), (0.26, 0.006, 0.50)))
    put('ExtRed', cyl((ex, ey - 0.09, 0.98), (ex, ey - 0.09, 1.34), 0.065, seg=14))
    put('BlackPlastic', cyl((ex, ey - 0.09, 1.34), (ex, ey - 0.09, 1.40), 0.022, seg=8))
    sb = bmesh.new(); quad_uv(sb, V((ex - 0.15, ey - 0.0605 - 0.07, 1.56)), V((0.3, 0, 0)), V((0, 0, 0.13)), cell_uv(6))
    put('Signs', sb)
    A['ANCHOR_' + pid] = (px, py, 0)

# =============================================================== CEILING STRUCTURE (cut-away: beams / pipes / trays / lights at z 2.5-3.2)
BZ0 = 2.65
# perimeter beams under wall tops
slab('Concrete', -14.0, -13.65, -10.0, 10.0, BZ0, HH, step=0.35, skip=('-x', '+z'), uvt=(2, 2))
slab('Concrete', 13.65, 14.0, -10.0, 10.0, BZ0, HH, step=0.35, skip=('+x', '+z'), uvt=(2, 2))
slab('Concrete', -14.0, -3.5, 9.65, 10.0, BZ0, HH, step=0.35, skip=('+y', '+z'), uvt=(2, 2))
slab('Concrete', 3.5, 14.0, 9.65, 10.0, BZ0, HH, step=0.35, skip=('+y', '+z'), uvt=(2, 2))
for by in (-5, 5):
    slab('Concrete', -14.0, 14.0, by - 0.18, by + 0.18, 2.8, HH, step=0.35, skip=('+z', '+x', '-x'), uvt=(2, 2))
for bx in (-7, 7):
    slab('Concrete', bx - 0.18, bx + 0.18, -10.0, 10.0, 2.8, HH, step=0.35, skip=('+z', '+y', '-y'), uvt=(2, 2))
# sprinkler pipes (red) along cross beams (offset from beam face) and longitudinal beams
PIPE_Z = 2.84
for by in (-5, 5):
    for s_ in (-1, 1):
        yy = by + s_ * 0.25
        put('RedPipe', cyl((-13.6, yy, PIPE_Z), (13.6, yy, PIPE_Z), 0.045, seg=10))
        for xb in np.arange(-12.5, 13, 3.0):
            put('Galv', cube((xb, by + s_ * 0.22, PIPE_Z + 0.04), (0.05, 0.12, 0.14)))
        for xb in np.arange(-12.0, 12.1, 2.4):
            put('RedPipe', cyl((xb, yy, PIPE_Z), (xb, yy, 2.62), 0.016, seg=6))
            put('Brass', cyl((xb, yy, 2.62), (xb, yy, 2.55), 0.022, seg=8, r1=0.012))
            put('Brass', cyl((xb, yy, 2.55), (xb, yy, 2.545), 0.04, seg=10))
for bx in (-7, 7):
    for s_ in (-1, 1):
        xx = bx + s_ * 0.25
        put('RedPipe', cyl((xx, -9.6, PIPE_Z), (xx, 9.4, PIPE_Z), 0.045, seg=10))
        for yb in np.arange(-8.4, 9.0, 3.0):
            put('Galv', cube((bx + s_ * 0.22, yb, PIPE_Z + 0.04), (0.12, 0.05, 0.14)))
        for yb in (-8.0, -2.5, 2.5, 8.0):
            put('RedPipe', cyl((xx, yb, PIPE_Z), (xx, yb, 2.62), 0.016, seg=6))
            put('Brass', cyl((xx, yb, 2.62), (xx, yb, 2.55), 0.022, seg=8, r1=0.012))
            put('Brass', cyl((xx, yb, 2.55), (xx, yb, 2.545), 0.04, seg=10))
# riser
put('RedPipe', cyl((-13.6, 9.55, 0), (-13.6, 9.55, 2.9), 0.06, seg=12))
put('RedPipe', cyl((-13.6, 9.55, 2.86), (-13.6, 5.0, 2.86), 0.045, seg=10))
# cable trays along the side walls and along beams
def tray(x0, y0, x1, y1, z):
    L = V((x1 - x0, y1 - y0, 0)); ln = L.length; d = L.normalized(); n = V((-d.y, d.x, 0))
    c = V(((x0 + x1) / 2, (y0 + y1) / 2, z))
    ang = math.atan2(d.y, d.x)
    def box(off, s, dz):
        b = cube((0, 0, 0), (ln, s[0], s[1]))
        bmesh.ops.rotate(b, verts=b.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'))
        bmesh.ops.translate(b, verts=b.verts[:], vec=c + n * off + V((0, 0, dz)))
        return b
    put('Galv', box(0, (0.30, 0.012), 0)); put('Galv', box(0.15, (0.012, 0.06), 0.03)); put('Galv', box(-0.15, (0.012, 0.06), 0.03))
    for k in (-0.07, 0.0, 0.07):
        b = cyl((0, 0, 0.02), (ln * 0.98, 0, 0.02), 0.012, seg=6)
        bmesh.ops.translate(b, verts=b.verts[:], vec=(-ln * 0.49, k, 0))
        bmesh.ops.rotate(b, verts=b.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'))
        bmesh.ops.translate(b, verts=b.verts[:], vec=c + V((0, 0, 0.005)))
        put('BlackPlastic', b)
    for t in np.arange(-ln / 2 + 0.6, ln / 2, 1.5):
        put('Galv', cube(c + d * t, (0.02, 0.32, 0.01) if abs(d.x) > 0.5 else (0.32, 0.02, 0.01)))
tray(-13.65, -9.5, -13.65, 9.5, 2.45); tray(13.65, -9.5, 13.65, 9.5, 2.45)
tray(-13.5, 4.35, 13.5, 4.35, 2.95 - 0.1)
# linear LED fixtures
FIX = []
def fixture(c, along='x', L=1.2):
    s = (L, 0.12, 0.05) if along == 'x' else (0.12, L, 0.05)
    put('LightHousing', cube((c[0], c[1], c[2]), s, bevel=0.012, seg=1))
    put('LightPanel', cube((c[0], c[1], c[2] - 0.027), (s[0] * 0.92, s[1] * 0.7, 0.006)))
    FIX.append((c[0], c[1], L, along))
for by in (-5, 5):
    for xb in np.arange(-12.0, 12.1, 2.4): fixture((xb, by, 2.77), 'x', 1.4)
for bx in (-7, 7):
    for yb in np.arange(-8.4, 8.5, 2.4):
        if abs(abs(yb) - 5) < 0.6: continue
        fixture((bx, yb, 2.77), 'y', 1.4)
for sx in (-1, 1):
    for yb in np.arange(-9.0, 9.1, 3.0): fixture((sx * 13.7, yb, 2.62), 'y', 1.2)

# =============================================================== DOORS / SIGNS / SOS / EXTINGUISHERS (walls)
for did, (dx, dy) in DOORS.items():
    d = 1 if dx < 0 else -1     # inward direction
    xi = dx + d * 0.0
    # frame (steel) around the opening on the room face
    fxc = dx + d * 0.04
    put('DoorFrame', cube((fxc, dy, 2.13), (0.08, 1.32, 0.09), bevel=0.01, seg=1))
    put('DoorFrame', cube((fxc, dy - 0.64, 1.05), (0.08, 0.07, 2.1), bevel=0.01, seg=1))
    put('DoorFrame', cube((fxc, dy + 0.64, 1.05), (0.08, 0.07, 2.1), bevel=0.01, seg=1))
    # leaf (named, origin at hinge)
    lx = dx + (-0.15 * d if False else 0)   # leaf centre in wall thickness
    lx = (-14.15 if dx < 0 else 14.15)
    hinge_y = dy - 0.55
    bm = cube((lx, dy, 1.025), (0.07, 1.1, 2.05), bevel=0.006, seg=1)
    for f in bm.faces: f.material_index = 0
    # window
    wx = lx + d * 0.037
    wb_ = bmesh.new()
    wb = cube((wx, dy + 0.15, 1.6), (0.012, 0.22, 0.46), bevel=0.004, seg=1)
    merge_into(bm, wb); n_before = len(bm.faces)
    # push bar
    pb = cyl((lx + d * 0.06, dy - 0.40, 1.05), (lx + d * 0.06, dy + 0.40, 1.05), 0.018, seg=8)
    merge_into(bm, pb)
    bm.faces.ensure_lookup_table()
    # material indices by position
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.x - (lx + d * 0.043)) < 0.01 and abs(c.y - (dy + 0.15)) < 0.12 and abs(c.z - 1.6) < 0.24: f.material_index = 1
        elif abs(c.z - 1.05) < 0.03 and abs(c.x - (lx + d * 0.06)) < 0.03 and c.y > dy - 0.45 and c.y < dy + 0.45: f.material_index = 2
        else: f.material_index = 0
    # kick plate
    kp = cube((lx + d * 0.037, dy, 0.18), (0.012, 1.0, 0.3), bevel=0.003, seg=1); merge_into(bm, kp)
    for f in bm.faces[-len(kp.faces):] if len(kp.faces) else []: f.material_index = 2
    named('DOOR_' + did, bm, ['DoorSteel', 'WiredGlass', 'Chrome'], origin=V((lx, hinge_y, 0)))
    # exit sign (named lit face) + housing
    sd = bmesh.new(); sxp = dx + d * 0.0
    sy = dy
    fx_ = dx + d * 0.07
    w, h = 0.62, 0.31
    # housing
    put('SignWhite', cube((dx + d * 0.035, sy, 2.45), (0.07, w + 0.03, h + 0.03), bevel=0.01, seg=2))
    if d > 0:
        p = V((fx_, sy - w / 2, 2.45 - h / 2)); u = V((0, w, 0))
    else:
        p = V((fx_, sy + w / 2, 2.45 - h / 2)); u = V((0, -w, 0))
    quad_uv(sd, p, u, V((0, 0, h)), cell_uv(0))
    bmesh.ops.recalc_face_normals(sd, faces=sd.faces[:])
    if sd.faces[0].normal.x * d < 0: bmesh.ops.reverse_faces(sd, faces=sd.faces[:])
    named('SIGN_' + did, sd, ['ExitSign'])
    A['ANCHOR_' + did] = (dx, dy, 0)
    # extinguisher cabinets beside doors (towards centre)
    ey = dy - 1.4 if dy > 0 else dy + 1.4
    ex = dx + d * 0.065
    put('ExtRed', cube((ex, ey, 1.2), (0.12, 0.34, 0.62), bevel=0.012, seg=2))
    put('CabGlass', cube((ex + d * 0.062, ey, 1.2), (0.006, 0.26, 0.50)))
    put('ExtRed', cyl((ex + d * 0.03, ey, 0.98), (ex + d * 0.03, ey, 1.34), 0.065, seg=14))
    put('BlackPlastic', cyl((ex + d * 0.03, ey, 1.34), (ex + d * 0.03, ey, 1.40), 0.022, seg=8))
    sb = bmesh.new()
    if d > 0: quad_uv(sb, V((ex + d * 0.062, ey - 0.15, 1.56)), V((0, 0.3, 0)), V((0, 0, 0.13)), cell_uv(6))
    else: quad_uv(sb, V((ex + d * 0.062, ey + 0.15, 1.56)), V((0, -0.3, 0)), V((0, 0, 0.13)), cell_uv(6))
    bmesh.ops.recalc_face_normals(sb, faces=sb.faces[:])
    if sb.faces[0].normal.x * d < 0: bmesh.ops.reverse_faces(sb, faces=sb.faces[:])
    put('Signs', sb)

# SOS stations
for sid, (sx_, sy_) in SOS.items():
    d = 1 if sx_ < 0 else -1
    bx = sx_ + d * 0.08
    bm = cube((bx, sy_, 1.35), (0.16, 0.38, 0.66), bevel=0.03, seg=3)
    for f in bm.faces: f.material_index = 0
    merge_into(bm, cube((bx, sy_, 1.69), (0.17, 0.40, 0.06), bevel=0.015, seg=2));
    for f in list(bm.faces)[-len(cube((0, 0, 0), (1, 1, 1), bevel=0.015, seg=2).faces):]: pass
    # yellow ring + red button
    ring = cyl((bx + d * 0.08, sy_, 1.40), (bx + d * 0.10, sy_, 1.40), 0.085, seg=24)
    # axis x: rotate cyl default along z -> built by cyl() with explicit points, fine
    but = cyl((bx + d * 0.10, sy_, 1.40), (bx + d * 0.135, sy_, 1.40), 0.062, seg=24, r1=0.05)
    grille = cyl((bx + d * 0.08, sy_, 1.19), (bx + d * 0.086, sy_, 1.19), 0.05, seg=16)
    n0 = len(bm.faces)
    merge_into(bm, ring); merge_into(bm, but); merge_into(bm, grille)
    bm.faces.ensure_lookup_table()
    for i, f in enumerate(bm.faces):
        c = f.calc_center_median()
        if i < n0:
            f.material_index = 3 if c.z > 1.66 else 0   # yellow header strip (index 3 = YellowPaint)
        else:
            if abs(c.z - 1.40) < 0.1 and abs(c.x - (bx + d * 0.1)) < 0.05 and abs(c.y - sy_) < 0.1 and (c.x - bx) * d > 0.117: f.material_index = 1
            elif abs(c.z - 1.40) < 0.1: f.material_index = 3
            else: f.material_index = 2
    # plate above the button
    pq = bmesh.new()
    xp = bx + d * 0.082
    if d > 0: quad_uv(pq, V((xp, sy_ - 0.17, 1.52)), V((0, 0.34, 0)), V((0, 0, 0.17)), cell_uv(1))
    else: quad_uv(pq, V((xp, sy_ + 0.17, 1.52)), V((0, -0.34, 0)), V((0, 0, 0.17)), cell_uv(1))
    bmesh.ops.recalc_face_normals(pq, faces=pq.faces[:])
    if pq.faces[0].normal.x * d < 0: bmesh.ops.reverse_faces(pq, faces=pq.faces[:])
    nstart = len(bm.faces); merge_into(bm, pq); bm.faces.ensure_lookup_table()
    for f in list(bm.faces)[nstart:]: f.material_index = 4
    named('SOS_' + sid, bm, ['SOSRed', 'SOSButton', 'BlackPlastic', 'YellowPaint', 'Signs'])
    # beacon dome
    dome = sphere((bx, sy_, 1.72), (0.085, 0.085, 0.09), seg=16, rings=8, half=True)
    named('BEACON_' + sid, dome, ['Beacon'])
    put('BlackPlastic', cyl((bx, sy_, 1.72), (bx, sy_, 1.735), 0.092, seg=16))
    # wall-mount base ring and pole sign
    A['ANCHOR_' + sid] = (sx_, sy_, 0)

# Refuge room door / sign
bm = cube((0, -10.15, 1.0), (1.1, 0.07, 2.0), bevel=0.006, seg=1)
for f in bm.faces: f.material_index = 0
pb = cyl((-0.4, -9.99, 1.0), (0.4, -9.99, 1.0), 0.018, seg=8); n0 = len(bm.faces); merge_into(bm, pb); bm.faces.ensure_lookup_table()
for f in list(bm.faces)[n0:]: f.material_index = 1
named('DOOR_Q', bm, ['DoorSteel', 'Chrome'], origin=V((-0.55, -10.15, 0)))
put('DoorFrame', cube((0, -9.97, 2.03), (1.32, 0.07, 0.09), bevel=0.01, seg=1))
put('DoorFrame', cube((-0.64, -9.97, 1.0), (0.07, 0.07, 2.0), bevel=0.01, seg=1))
put('DoorFrame', cube((0.64, -9.97, 1.0), (0.07, 0.07, 2.0), bevel=0.01, seg=1))
sd = bmesh.new(); quad_uv(sd, V((-0.31, -9.96, 2.2)), V((0.62, 0, 0)), V((0, 0, 0.31)), cell_uv(8))
bmesh.ops.recalc_face_normals(sd, faces=sd.faces[:])
if sd.faces[0].normal.y < 0: bmesh.ops.reverse_faces(sd, faces=sd.faces[:])
put('SignWhite', cube((0, -9.98, 2.355), (0.65, 0.03, 0.34), bevel=0.008, seg=1))
named('SIGN_Q', sd, ['ExitSign'])
A['ANCHOR_Q'] = (0, -10, 0)

# =============================================================== EV chargers, wheel stops, curbs
for sx in (-1, 1):
    wallx = sx * 14.0; d = -sx
    for yc in (1.5, -1.5):
        bx = wallx + d * 0.07
        put('EVBody', cube((bx, yc, 1.2), (0.14, 0.30, 0.66), bevel=0.03, seg=3))
        put('BlackPlastic', cube((bx + d * 0.072, yc, 1.38), (0.012, 0.20, 0.17), bevel=0.006, seg=1))
        put('ChargerGlow', cube((bx + d * 0.072, yc, 1.22), (0.012, 0.20, 0.016)))
        put('BlackPlastic', cube((bx + d * 0.08, yc + 0.02, 1.07), (0.05, 0.09, 0.14), bevel=0.012, seg=2))
        # hanging cable loop
        pts = [(bx + d * 0.06, yc + 0.1, 1.06), (bx + d * 0.12, yc + 0.17, 0.85), (bx + d * 0.2, yc + 0.22, 0.55), (bx + d * 0.30, yc + 0.18, 0.40),
               (bx + d * 0.36, yc + 0.08, 0.50), (bx + d * 0.32, yc, 0.8), (bx + d * 0.2, yc - 0.02, 1.0), (bx + d * 0.1, yc, 1.1)]
        put('BlackPlastic', tube(pts, 0.016, seg=6))
        put('BlackPlastic', cube((bx + d * 0.1, yc, 1.12), (0.05, 0.05, 0.1), bevel=0.01, seg=1))
        sb = bmesh.new(); xp = bx + d * 0.073
        if d > 0: quad_uv(sb, V((xp, yc - 0.15, 1.58)), V((0, 0.3, 0)), V((0, 0, 0.15)), cell_uv(7))
        else: quad_uv(sb, V((xp, yc + 0.15, 1.58)), V((0, -0.3, 0)), V((0, 0, 0.15)), cell_uv(7))
        bmesh.ops.recalc_face_normals(sb, faces=sb.faces[:])
        if sb.faces[0].normal.x * d < 0: bmesh.ops.reverse_faces(sb, faces=sb.faces[:])
        put('Signs', sb)
    # wheel stops: all 6 bays
    for yc in (6.5, 4.0, 1.5, -1.5, -4.0, -6.5):
        put('YellowPaint', cube((sx * 12.32, yc, 0.055), (0.22, 1.5, 0.11), bevel=0.03, seg=2))
        for k in (-0.55, 0.55): put('BlackPlastic', cyl((sx * 12.32, yc + k, 0.11), (sx * 12.32, yc + k, 0.118), 0.018, seg=8))
# pedestrian walkway kerbs at door aisle / pillars? low hazard kerbs at ramp mouth
for sx in (-1, 1):
    slab('Hazard', min(sx * 3.5, sx * 3.1), max(sx * 3.5, sx * 3.1), 10.3, 12.0, 0, 0.12, step=0.6, skip=('-z',), uvt=(0.5, 0.5))

# =============================================================== RAMP
RW = 3.5
# surface grid (x: 20 cols, y: YS)
rs = acc('RampSurface')
nx = 14
xs_ = [-RW + 2 * RW * i / nx for i in range(nx + 1)]
rows = [[rs.verts.new((x, y, zprof(y))) for x in xs_] for y in YS]
faces = []
for j in range(len(YS) - 1):
    for i in range(nx):
        faces.append(rs.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])))
uvl = rs.loops.layers.uv.verify()
for f in faces:
    f.normal_update()
    if f.normal.z < 0: f.normal_flip()
    for l in f.loops:
        l[uvl].uv = ((l.vert.co.x + RW) / (2 * RW) * 2.0, math.hypot(l.vert.co.y, l.vert.co.z * 0.0) / 1.0 * 1.0)
# curbs along ramp inner base (yellow-black) following slope
for sx in (-1, 1):
    xin = sx * (RW - 0.22); xout = sx * RW
    xa, xb = sorted((xin, xout))
    hb = acc('Hazard'); uvh = hb.loops.layers.uv.verify()
    top = [[hb.verts.new((x, y, zprof(y) + 0.14)) for x in (xa, xb)] for y in YS]
    base_in = [hb.verts.new((xin, y, zprof(y))) for y in YS]
    fs = []
    for j in range(len(YS) - 1):
        fs.append(hb.faces.new((top[j][0], top[j][1], top[j + 1][1], top[j + 1][0])))
        a = base_in[j]; b = base_in[j + 1]
        tin = top[j][0] if sx > 0 else top[j][1]; tin2 = top[j + 1][0] if sx > 0 else top[j + 1][1]
        fs.append(hb.faces.new((a, b, tin2, tin)) if sx > 0 else hb.faces.new((b, a, tin, tin2)))
    for f in fs:
        f.normal_update()
        if abs(f.normal.x) > 0.9 and f.normal.x * (-sx) < 0: f.normal_flip()
    for f in fs:
        for l in f.loops: l[uvh].uv = (l.vert.co.y / 0.5, (l.vert.co.x + l.vert.co.z) / 0.5)
    # orient top faces up
    for f in fs:
        if abs(f.normal.z) > 0.9 and f.normal.z < 0: f.normal_flip()
# side walls
for sx in (-1, 1):
    xin = sx * (RW + 0.0); xout = sx * (RW + 0.3)
    wm = acc('WallPaint'); uvw = wm.loops.layers.uv.verify()
    nzr = 4
    # inner face (from surface to surface+1.6)
    cols = []
    for y in YS:
        zs = zprof(y)
        cols.append([wm.verts.new((xin, y, zs + 0.14 + (1.6 - 0.14) * k / nzr)) for k in range(nzr + 1)])
    fs = []
    for j in range(len(YS) - 1):
        for k in range(nzr):
            f = wm.faces.new((cols[j][k], cols[j + 1][k], cols[j + 1][k + 1], cols[j][k + 1]) if sx < 0 else (cols[j + 1][k], cols[j][k], cols[j][k + 1], cols[j + 1][k + 1]))
            fs.append(f)
    for f in fs:
        f.normal_update()
        for l in f.loops:
            zrel = l.vert.co.z - zprof(l.vert.co.y)
            l[uvw].uv = (l.vert.co.y / 2.4, (zrel + 0.0 - 0.14 + 0.0 + 0.0) / 3.2 + 0.0 + 0.0 + (0.14 / 3.2) * 0 + 0.0)
        if f.normal.x * (-sx) < 0: f.normal_flip()
    # outer face (ground to top)
    nzo = 14; ysub = YS[::2] if len(YS) > 4 else YS
    if ysub[-1] != YS[-1]: ysub = list(ysub) + [YS[-1]]
    ocols = []
    for y in ysub:
        zt = zprof(y) + 1.6
        ocols.append([wm.verts.new((xout, y, -0.3 + (zt + 0.3) * k / nzo)) for k in range(nzo + 1)])
    ofs = []
    for j in range(len(ysub) - 1):
        for k in range(nzo):
            f = wm.faces.new((ocols[j + 1][k], ocols[j][k], ocols[j][k + 1], ocols[j + 1][k + 1]) if sx < 0 else (ocols[j][k], ocols[j + 1][k], ocols[j + 1][k + 1], ocols[j][k + 1]))
            ofs.append(f)
    for f in ofs:
        f.normal_update()
        if f.normal.x * sx < 0: f.normal_flip()
        for l in f.loops: l[uvw].uv = (l.vert.co.y / 2.4, l.vert.co.z / 3.2)
    # top cap
    cm = acc('Concrete'); uvc = cm.loops.layers.uv.verify()
    tops_in = [cm.verts.new((xin, y, zprof(y) + 1.6)) for y in YS]
    tops_out = [cm.verts.new((xout, y, zprof(y) + 1.6)) for y in YS]
    cf_ = []
    for j in range(len(YS) - 1):
        cf_.append(cm.faces.new((tops_in[j], tops_in[j + 1], tops_out[j + 1], tops_out[j])))
    for f in cf_:
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()
        for l in f.loops: l[uvc].uv = (l.vert.co.x / 2, l.vert.co.y / 2)
    # inner top lip connecting inner face top (z=+1.6) is covered by cap; wall base strip between surface and the curb: skip
    # level signs on inner face
    for k, (rid, (ry, rz)) in enumerate(RAMP_Y.items()):
        ci = k
        sb = bmesh.new()
        xp = xin - sx * 0.02
        zc = rz + 0.82
        if sx < 0:   # inner face looks +x ; viewer faces -x ... u increases with +y
            quad_uv(sb, V((xp, ry - 0.7, zc - 0.25)), V((0, 1.4, 0)), V((0, 0, 0.5)), cell_uv(2 + ci))
        else:
            quad_uv(sb, V((xp, ry + 0.7, zc - 0.25)), V((0, -1.4, 0)), V((0, 0, 0.5)), cell_uv(2 + ci))
        bmesh.ops.recalc_face_normals(sb, faces=sb.faces[:])
        if sb.faces[0].normal.x * (-sx) < 0: bmesh.ops.reverse_faces(sb, faces=sb.faces[:])
        put('Signs', sb)
        put('SignWhite', cube((xin - sx * 0.008, ry, zc), (0.016, 1.46, 0.56), bevel=0.004, seg=1))
# remove the redundant plane-fill issue: ramp edges ends: caps at y=43
# sensors RS_R*
for rid, (ry, rz) in RAMP_Y.items():
    x = -RW + 0.1
    bm = cube((x, ry, rz + 1.1), (0.16, 0.34, 0.2), bevel=0.02, seg=2)
    named('RS_' + rid, bm, ['RSSensor'])
    put('BlackPlastic', cube((x, ry, rz + 1.1 + 0.0), (0.165, 0.2, 0.08), bevel=0.01, seg=1) if False else cube((x + 0.075, ry, rz + 1.1), (0.012, 0.12, 0.06)))
    A['ANCHOR_' + rid] = (0, ry, rz)
# ramp side LED strip lights near the top of the inner wall every 4 m
for sx in (-1, 1):
    for y in np.arange(13, 42, 4.0):
        z = zprof(y) + 1.38
        put('LightPanel', cube((sx * (RW - 0.015), y, z), (0.02, 0.9, 0.04)))
# exit: daylight apron & sky glow
put('Daylight', cube((0, 45.0, 9.55), (12, 4, 0.1)))
sk = bmesh.new(); vs = [sk.verts.new(p) for p in ((-9, 47.2, 9.5), (9, 47.2, 9.5), (9, 47.2, 16), (-9, 47.2, 16))]
sk.faces.new(vs[::-1]); put('SkyGlow', sk)
# wall piers at exit
slab('Concrete', -RW - 0.3, -RW, 43.0, 43.3, 9.6, 11.4, step=0.3, skip=('-z',), uvt=(2, 2))
slab('Concrete', RW, RW + 0.3, 43.0, 43.3, 9.6, 11.4, step=0.3, skip=('-z',), uvt=(2, 2))

# =============================================================== other anchors
A['ANCHOR_M'] = (0, 0, 0)
for cid, p in {'carA': (-10, 6.5), 'carB': (10, 6.5), 'carC': (-10, -6.5), 'carD': (10, -6.5), 'carR': (2, 8.5)}.items():
    A['ANCHOR_' + cid] = (p[0], p[1], 0)
SPAWN = [(-2.0, 7.0), (-3.4, 3.0), (3.4, 3.0), (0.0, 2.2), (-5.6, 0.0), (5.6, 0.0), (-3.0, -2.5), (3.0, -2.5), (0.0, -6.0), (-5.5, -7.0), (5.5, -7.0), (-2.2, -8.8)]
for i, p in enumerate(SPAWN): A[f'ANCHOR_spawn_{i + 1}'] = (p[0], p[1], 0)
PARK = [(-10, 4.0), (-10, -4.0), (-10, 1.5), (-10, -1.5), (-10, -6.5), (10, 4.0), (10, -4.0), (10, 1.5), (10, -1.5)]
# extra parked-vehicle slots (optional, for the web scene): yaw faces the lane
for i, (x, y) in enumerate([(-10, 4.0), (-10, 1.5), (-10, -1.5), (-10, -4.0), (10, 4.0), (10, 1.5), (10, -1.5), (10, -4.0), (-10, 6.5 + 0), (10, -6.5)]):
    A[f'ANCHOR_park_{i + 1}'] = (x, y, 0)

print('geometry built', round(time.time() - T0, 1))

# =============================================================== AO: build BVH over all geometry
allbm = bmesh.new()
for k, b in ACC.items(): merge_into(allbm, b)
for n, b, m, o in NAMED: merge_into(allbm, b)
bvh = BVHTree.FromBMesh(allbm)
print('bvh tris', len(allbm.faces))
# cosine-weighted sample directions
def samples(K):
    out = []
    for i in range(K):
        u = (i + 0.5) / K; ang = i * 2.399963
        r = math.sqrt(u); out.append((r * math.cos(ang), r * math.sin(ang), math.sqrt(1 - u)))
    return out
SAMP = samples(120)
def ao_at(p, n, D=2.2, K=96):
    n = V(n)
    t = n.cross(V((0, 0, 1)) if abs(n.z) < 0.9 else V((1, 0, 0))).normalized(); b = n.cross(t)
    o = p + n * 0.03; occ = 0.0
    for (sx, sy, sz) in SAMP[:K]:
        d = t * sx + b * sy + n * sz
        h = bvh.ray_cast(o, d, D)
        if h[0] is not None: occ += 1 - h[3] / D
    return 1.0 - 0.9 * occ / K
cnt = 0
for mname in AO_MATS:
    if mname not in ACC: continue
    bm = ACC[mname]; col = bm.loops.layers.color.active
    cache = {}; bm.verts.index_update()
    for f in bm.faces:
        for l in f.loops:
            key = (l.vert.index, round(f.normal.x, 2), round(f.normal.y, 2), round(f.normal.z, 2))
            if key not in cache:
                cache[key] = ao_at(l.vert.co, f.normal)
                cnt += 1
            a = max(0.3, cache[key]); a = a ** 0.8
            l[col] = (a, a, a, 1.0)
print('vertex AO verts', cnt, round(time.time() - T0, 1))

# floor AO texture + light pools
FW, FH = 560, 400
ao = np.ones((FH, FW), np.float32)
for j in range(FH):
    y = 10 - (j + 0.5) / FH * 20
    for i in range(FW):
        x = -14 + (i + 0.5) / FW * 28
        ao[j, i] = ao_at(V((x, y, 0.0)), (0, 0, 1), D=3.0, K=24)
print('floor ao done', round(time.time() - T0, 1))
img = bpy.data.images.new('aoimg', FW, FH, alpha=False, float_buffer=False)
rgba = np.ones((FH, FW, 4), np.float32); a_ = np.clip(ao, 0.3, 1.0) ** 0.9
for c in range(3): rgba[:, :, c] = a_
img.pixels.foreach_set(rgba[::-1].reshape(-1).tolist() if False else np.flipud(rgba).reshape(-1))
img.scale(3072, 2194)
big = np.empty(3072 * 2194 * 4, np.float32); img.pixels.foreach_get(big)
aobig = big.reshape(2194, 3072, 4)[::-1, :, 0].copy()   # top row first (image space)
aobig = aobig * 1.0
paint = bpy.data.images.load(TEX + 'floor_paint.png'); pw, ph = paint.size
pbuf = np.empty(pw * ph * 4, np.float32); paint.pixels.foreach_get(pbuf)
pbuf = pbuf.reshape(ph, pw, 4)[::-1].copy()   # top-first
# light pools from fixtures
yy = np.linspace(10, -10, ph, dtype=np.float32)[:, None]; xx = np.linspace(-14, 14, pw, dtype=np.float32)[None, :]
pool = np.zeros((ph, pw), np.float32)
for (fx_, fy_, L, along) in FIX:
    if abs(fx_) > 13 or True:
        sx_, sy_ = (L * 0.5 + 1.0, 1.1) if along == 'x' else (1.1, L * 0.5 + 1.0)
        x0 = int((fx_ - 14 * 0 + 14 - 3.2) * (pw / 28)); x1 = int((fx_ + 14 + 3.2) * (pw / 28))
        y0 = int((10 - fy_ - 3.2) * (ph / 20)); y1 = int((10 - fy_ + 3.2) * (ph / 20))
        x0, x1 = max(0, x0), min(pw, x1); y0, y1 = max(0, y0), min(ph, y1)
        pool[y0:y1, x0:x1] += np.exp(-(((xx[:, x0:x1] - fx_) / sx_) ** 2 + ((yy[y0:y1] - fy_) / sy_) ** 2))
light = 0.90 + 0.14 * np.clip(pool, 0, 1.2)
for c in range(3): pbuf[:, :, c] = np.clip(pbuf[:, :, c] * aobig * light, 0, 1)
pbuf[:, :, 3] = 1
out = bpy.data.images.new('floor_final', pw, ph, alpha=False)
out.pixels.foreach_set(pbuf[::-1].reshape(-1)); out.filepath_raw = FLOORIMG; out.file_format = 'PNG'; out.save()
print('floor composited', round(time.time() - T0, 1))
pm('Floor', (1, 1, 1), 0.7, tex=FLOORIMG, spec=0.25, repeat=False)

# =============================================================== create objects
def make_obj(name, bm, mats, origin=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me)
    for m in mats: me.materials.append(MATS[m])
    if origin is not None:
        me.transform(Matrix.Translation(-origin))
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if origin is not None: o.location = origin
    return o
objs = []
for mname, bm in ACC.items():
    if len(bm.faces) == 0: continue
    o = make_obj('S_' + mname, bm, [mname]); objs.append(o)
    if mname in AO_MATS:
        # make the Col attribute the active/render one
        ca = o.data.color_attributes
        if 'Col' in ca: ca.active_color = ca['Col']; ca.render_color_index = list(ca.keys()).index('Col')
for name, bm, mats, origin in NAMED:
    if origin is None:
        ctr = sum((v.co for v in bm.verts), V()) / len(bm.verts)
        origin = ctr
    o = make_obj(name, bm, mats, origin); objs.append(o)
for name, p in A.items():
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.3
    e.location = p; bpy.context.collection.objects.link(e)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
tris = 0
for o in objs: tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('OBJECTS', len(objs), 'TRIS', tris, 'MATS used', len([m for m in bpy.data.materials if m.users]))
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/v4/blender/lot.blend')
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    mx = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeMix']
    if mx and b:
        link = [l for l in mx[0].inputs[6].links]
        if link: nt.links.new(link[0].from_socket, b.inputs['Base Color'])
        else:
            for l in list(b.inputs['Base Color'].links): nt.links.remove(l)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=False, export_yup=True,
                          export_vertex_color='ACTIVE', export_animations=False, export_extras=False)
print('EXPORTED', OUT, round(time.time() - T0, 1))
