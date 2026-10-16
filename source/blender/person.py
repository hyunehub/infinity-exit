import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree
V = Vector
OUT = '/home/claude/v4/blender/person_raw.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24

# ---------------------------------------------------------------- materials
def mat(name, col, rough=0.6, metal=0.0, spec=0.4, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    return m
M = dict(
    Skin=mat('Skin', (0.80, 0.55, 0.42), 0.55, spec=0.35),
    Shirt=mat('Shirt', (0.20, 0.42, 0.78), 0.8, spec=0.15),
    Pants=mat('Pants', (0.10, 0.12, 0.18), 0.85, spec=0.15),
    Shoes=mat('Shoes', (0.14, 0.14, 0.15), 0.6, spec=0.3),
    Sole=mat('Sole', (0.88, 0.88, 0.86), 0.7),
    Hair=mat('Hair', (0.06, 0.04, 0.035), 0.5, spec=0.5),
    EyeWhite=mat('EyeWhite', (0.93, 0.93, 0.92), 0.25, spec=0.5),
    Iris=mat('Iris', (0.05, 0.03, 0.02), 0.2, spec=0.6),
    Lips=mat('Lips', (0.55, 0.30, 0.28), 0.5),
)

# ---------------------------------------------------------------- mesh helpers
def loft(path, rx, ry, n=14, ref=(0, 1, 0), shift=None, cap0=True, cap1=True):
    bm = bmesh.new(); rings = []
    ref = V(ref)
    for i, P in enumerate(path):
        P = V(P)
        a = V(path[min(i + 1, len(path) - 1)]); b = V(path[max(i - 1, 0)])
        t = (a - b).normalized()
        side = t.cross(ref)
        if side.length < 1e-4: side = t.cross(V((1, 0, 0)))
        side.normalize(); up = t.cross(side).normalized()
        if rx[i] < 1e-6 and ry[i] < 1e-6:
            rings.append(bm.verts.new(P)); continue
        c = P + (V(shift[i]) if shift else V())
        rings.append([bm.verts.new(c + side * rx[i] * math.cos(2 * math.pi * j / n) + up * ry[i] * math.sin(2 * math.pi * j / n)) for j in range(n)])
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        if isinstance(A, list) and isinstance(B, list):
            for j in range(n):
                bm.faces.new((A[j], A[(j + 1) % n], B[(j + 1) % n], B[j]))
        elif isinstance(A, list):
            for j in range(n): bm.faces.new((A[j], A[(j + 1) % n], B))
        elif isinstance(B, list):
            for j in range(n): bm.faces.new((B[(j + 1) % n], B[j], A))
    for idx, flag in ((0, cap0), (-1, cap1)):
        R = rings[idx]
        if flag and isinstance(R, list):
            c = bm.verts.new(sum((v.co for v in R), V()) / n)
            for j in range(n): bm.faces.new((R[j], R[(j + 1) % n], c) if idx == 0 else (R[(j + 1) % n], R[j], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def ellipsoid(center, r, seg=16, rings=10, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
    if rot: bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=center)
    return bm

def merge(dst, src):
    me = bpy.data.meshes.new('t'); src.to_mesh(me); dst.from_mesh(me); bpy.data.meshes.remove(me)

# ---------------------------------------------------------------- skeleton
SH = 0.19
arm_dir = V((math.sin(math.radians(22)), 0.0, -math.cos(math.radians(22))))
fore_dir = V((math.sin(math.radians(14)), 0.10, -math.cos(math.radians(14)))).normalized()
LU, LF, LH = 0.295, 0.255, 0.17
bones = {}  # name -> (head, tail, parent)
bones['Hips'] = (V((0, 0, 0.90)), V((0, 0, 1.02)), None)
bones['Spine'] = (V((0, 0, 1.02)), V((0, 0, 1.17)), 'Hips')
bones['Chest'] = (V((0, 0, 1.17)), V((0, 0.005, 1.40)), 'Spine')
bones['Neck'] = (V((0, 0.005, 1.40)), V((0, 0.01, 1.49)), 'Chest')
bones['Head'] = (V((0, 0.01, 1.49)), V((0, 0.01, 1.71)), 'Neck')
for s, sx in (('L', 1), ('R', -1)):
    sh = V((sx * SH, 0, 1.37))
    el = sh + V((sx * arm_dir.x, arm_dir.y, arm_dir.z)) * LU
    wr = el + V((sx * fore_dir.x, fore_dir.y, fore_dir.z)) * LF
    hd = wr + V((sx * fore_dir.x, fore_dir.y, fore_dir.z)) * LH
    bones['UpperArm_' + s] = (sh, el, 'Chest')
    bones['Forearm_' + s] = (el, wr, 'UpperArm_' + s)
    bones['Hand_' + s] = (wr, hd, 'Forearm_' + s)
    hp = V((sx * 0.09, 0, 0.90)); kn = V((sx * 0.095, 0.0, 0.50)); an = V((sx * 0.095, 0, 0.085)); to = V((sx * 0.095, 0.15, 0.035))
    bones['Thigh_' + s] = (hp, kn, 'Hips')
    bones['Shin_' + s] = (kn, an, 'Thigh_' + s)
    bones['Foot_' + s] = (an, to, 'Shin_' + s)
LT = (bones['Thigh_L'][0] - bones['Thigh_L'][1]).length
LS = (bones['Shin_L'][0] - bones['Shin_L'][1]).length

bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm = bpy.context.object; arm.name = 'Armature'; arm.data.name = 'Armature'
eb = arm.data.edit_bones
for b in list(eb): eb.remove(b)
for name, (h, t, p) in bones.items():
    e = eb.new(name); e.head = h; e.tail = t; e.roll = 0.0
for name, (h, t, p) in bones.items():
    if p: eb[name].parent = eb[p]; eb[name].use_connect = (eb[p].tail - h).length < 1e-5
bpy.ops.object.mode_set(mode='OBJECT')
arm.data.display_type = 'STICK'

# ---------------------------------------------------------------- body parts
parts = []   # (bm, matname, candidate bones)
def add_part(bm, matname, cands, smooth=True):
    parts.append((bm, matname, cands))

# torso (shirt)
tz = [0.90, 0.95, 1.00, 1.08, 1.17, 1.26, 1.33, 1.385, 1.42, 1.44, 1.45]
trx = [0.160, 0.160, 0.158, 0.154, 0.164, 0.180, 0.190, 0.172, 0.100, 0.064, 0.060]
try_ = [0.104, 0.102, 0.100, 0.097, 0.102, 0.110, 0.104, 0.090, 0.075, 0.064, 0.060]
tcy = [0.0, 0.0, 0.0, 0.0, 0.004, 0.01, 0.006, 0.0, 0.0, 0.004, 0.004]
bm = loft([(0, 0, z) for z in tz], trx, try_, n=20, ref=(0, 1, 0), shift=[(0, c, 0) for c in tcy], cap0=False, cap1=False)
add_part(bm, 'Shirt', ['Hips', 'Spine', 'Chest', 'Neck', 'UpperArm_L', 'UpperArm_R'])
# pelvis pants
pz = [0.74, 0.80, 0.86, 0.92, 0.97, 1.05, 1.062, 1.066]
prx = [0.150, 0.178, 0.188, 0.182, 0.176, 0.170, 0.169, 0.158]
pry = [0.100, 0.116, 0.120, 0.116, 0.112, 0.108, 0.107, 0.099]
bm = loft([(0, 0, z) for z in pz], prx, pry, n=20, cap0=True, cap1=False)
add_part(bm, 'Pants', ['Hips', 'Spine', 'Thigh_L', 'Thigh_R'])

for s, sx in (('L', 1), ('R', -1)):
    lp = [(sx * 0.093, 0.0, 0.92), (sx * 0.093, 0.0, 0.80), (sx * 0.094, 0.0, 0.66), (sx * 0.095, 0.004, 0.52),
          (sx * 0.095, 0.0, 0.40), (sx * 0.095, 0.0, 0.26), (sx * 0.095, 0.0, 0.13), (sx * 0.095, 0.0, 0.075)]
    lr = [0.090, 0.094, 0.083, 0.068, 0.064, 0.056, 0.050, 0.052]
    lry = [0.096, 0.100, 0.088, 0.072, 0.068, 0.060, 0.054, 0.054]
    bm = loft(lp, lr, lry, n=16, ref=(0, 1, 0), cap0=False, cap1=True)
    add_part(bm, 'Pants', ['Hips', 'Thigh_' + s, 'Shin_' + s, 'Foot_' + s])
    sp = [(sx * 0.095, -0.075, 0.05), (sx * 0.095, -0.06, 0.055), (sx * 0.095, 0.0, 0.058), (sx * 0.095, 0.08, 0.052), (sx * 0.095, 0.15, 0.044), (sx * 0.095, 0.205, 0.034), (sx * 0.095, 0.225, 0.028)]
    srx = [0.0, 0.040, 0.046, 0.050, 0.050, 0.044, 0.0]
    sry = [0.0, 0.044, 0.052, 0.040, 0.030, 0.024, 0.0]
    bm = loft(sp, srx, sry, n=14, ref=(0, 0, 1), cap0=True, cap1=True)
    for v in bm.verts:
        if v.co.z > 0.07 and v.co.y < 0.06: v.co.z += 0.03
    add_part(bm, 'Shoes', ['Foot_' + s, 'Shin_' + s])
    bm = loft([(sx * 0.095, -0.077, 0.012), (sx * 0.095, -0.06, 0.012), (sx * 0.095, 0.1, 0.012), (sx * 0.095, 0.2, 0.012), (sx * 0.095, 0.232, 0.012)],
              [0.0, 0.043, 0.052, 0.046, 0.0], [0.0, 0.012, 0.014, 0.012, 0.0], n=10, ref=(0, 0, 1), cap0=True, cap1=True)
    add_part(bm, 'Sole', ['Foot_' + s])
    h0, t0, _ = bones['UpperArm_' + s]; h1, t1, _ = bones['Forearm_' + s]; h2, t2, _ = bones['Hand_' + s]
    up = [h0 - (h1 - h0).normalized() * 0.02, h0 + (h1 - h0) * 0.25, h0 + (h1 - h0) * 0.7, h1, h1 + (t1 - h1) * 0.3, h1 + (t1 - h1) * 0.75, t1]
    bm = loft(up, [0.0, 0.048, 0.043, 0.037, 0.035, 0.029, 0.027], [0.0, 0.048, 0.044, 0.037, 0.033, 0.027, 0.024], n=14, ref=(0, 1, 0), cap0=False, cap1=True)
    add_part(bm, 'Skin', ['Chest', 'UpperArm_' + s, 'Forearm_' + s, 'Hand_' + s])
    sl = [h0 - (h1 - h0).normalized() * 0.03, h0 + (h1 - h0) * 0.12, h0 + (h1 - h0) * 0.45, h0 + (h1 - h0) * 0.72, h0 + (h1 - h0) * 0.76]
    bm = loft(sl, [0.0, 0.066, 0.063, 0.060, 0.062], [0.0, 0.066, 0.062, 0.058, 0.060], n=16, ref=(0, 1, 0), cap0=False, cap1=False)
    add_part(bm, 'Shirt', ['Chest', 'UpperArm_' + s, 'Forearm_' + s])
    d = (t2 - h2).normalized()
    palm = ellipsoid(V((0, 0, 0)), (0.037, 0.016, 0.075), seg=12, rings=8)
    q = V((0, 0, 1)).rotation_difference(d); bmesh.ops.rotate(palm, verts=palm.verts[:], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(palm, verts=palm.verts[:], vec=h2 + d * 0.07)
    add_part(palm, 'Skin', ['Hand_' + s, 'Forearm_' + s])
    tc = h2 + d * 0.045 + V((sx * 0.032, 0.012, 0))
    th = ellipsoid(V((0, 0, 0)), (0.014, 0.014, 0.04), seg=8, rings=6)
    d2 = (d + V((sx * 0.35, 0.3, 0)).normalized() * 0.5).normalized()
    q2 = V((0, 0, 1)).rotation_difference(d2); bmesh.ops.rotate(th, verts=th.verts[:], cent=(0, 0, 0), matrix=q2.to_matrix())
    bmesh.ops.translate(th, verts=th.verts[:], vec=tc)
    add_part(th, 'Skin', ['Hand_' + s])

bm = loft([(0, 0.0, 1.38), (0, 0.005, 1.44), (0, 0.01, 1.52)], [0.047, 0.044, 0.043], [0.048, 0.045, 0.045], n=14, cap0=False, cap1=False)
add_part(bm, 'Skin', ['Neck', 'Chest', 'Head'])

# head
HC = V((0, 0.012, 1.605)); HR = (0.088, 0.104, 0.113)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
def head_shape(co):
    sx_, sy_, sz_ = co.x, co.y, co.z
    x = sx_ * HR[0]; y = sy_ * HR[1]; z = sz_ * HR[2]
    if sz_ < 0.05:
        t = (0.05 - sz_) / 1.05
        x *= 1 - 0.36 * t ** 1.25
        y *= 1 - 0.06 * t
        if sy_ > 0: y += 0.012 * t
    if sy_ > 0.25: y *= 0.95
    if sz_ > 0.3: x *= 1 - 0.06 * (sz_ - 0.3)
    return V((x, y, z)) + HC
for v in bm.verts: v.co = head_shape(v.co)
def gauss(c0, c, sx_, sz_):
    return math.exp(-(((c0.x - c[0]) / sx_) ** 2 + ((c0.z - c[1]) / sz_) ** 2))
for v in bm.verts:
    if v.co.y > HC.y + 0.03:
        co = v.co
        v.co.y += 0.026 * gauss(co, (0, 1.588), 0.011, 0.024)
        v.co.y += 0.008 * gauss(co, (0, 1.568), 0.016, 0.012)
        for sx in (-1, 1):
            v.co.y -= 0.007 * gauss(co, (sx * 0.033, 1.618), 0.017, 0.012)
            v.co.y += 0.004 * gauss(co, (sx * 0.033, 1.642), 0.02, 0.006)
        v.co.y -= 0.004 * gauss(co, (0, 1.545), 0.02, 0.005)
        v.co.y += 0.004 * gauss(co, (0, 1.527), 0.02, 0.01)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
head_bm = bm.copy()
add_part(bm, 'Skin', ['Head', 'Neck'])
bvh = BVHTree.FromBMesh(head_bm)
def surf_y(x, z, off=0.0):
    hit = bvh.ray_cast(V((x, 0.5, z)), V((0, -1, 0)), 2.0)
    return (hit[0].y if hit[0] else HC.y + 0.1) + off

eyes = bmesh.new(); iris = bmesh.new()
for sx in (-1, 1):
    x = sx * 0.034; z = 1.618; y = surf_y(x, z) - 0.0035
    merge(eyes, ellipsoid(V((x, y, z)), (0.0135, 0.0112, 0.0112), seg=14, rings=10))
    merge(iris, ellipsoid(V((x, y + 0.0075, z)), (0.0068, 0.004, 0.0068), seg=12, rings=8))
add_part(eyes, 'EyeWhite', ['Head']); add_part(iris, 'Iris', ['Head'])
brows = bmesh.new()
for sx in (-1, 1):
    x = sx * 0.035; z = 1.647; y = surf_y(x, z) + 0.001
    merge(brows, ellipsoid(V((x, y, z)), (0.021, 0.0055, 0.0055), seg=10, rings=6, rot=Matrix.Rotation(sx * -0.12, 3, 'Y')))
add_part(brows, 'Hair', ['Head'])
lips = ellipsoid(V((0, surf_y(0, 1.544) + 0.0005, 1.544)), (0.019, 0.0042, 0.0034), seg=12, rings=8)
add_part(lips, 'Lips', ['Head'])
ears = bmesh.new()
for sx in (-1, 1):
    merge(ears, ellipsoid(V((sx * 0.087, 0.0, 1.60)), (0.010, 0.016, 0.028), seg=10, rings=8))
add_part(ears, 'Skin', ['Head'])

hair = bmesh.new(); bmesh.ops.create_uvsphere(hair, u_segments=32, v_segments=20, radius=1.0)
dele = []
for v in hair.verts:
    sx_, sy_, sz_ = v.co.x, v.co.y, v.co.z
    h = 0.10 + 0.52 * sy_ - 0.12 * abs(sx_) * (1 if sy_ > -0.2 else 0)
    if abs(sx_) > 0.8 and sz_ < 0.35: h = 9
    if sz_ < h: dele.append(v)
for v in hair.verts:
    sx_, sy_, sz_ = v.co.x, v.co.y, v.co.z
    p = head_shape(v.co); c = p - HC
    k = 1.07 + 0.05 * max(0, sz_) + (0.04 if sy_ < -0.2 else 0)
    c = V((c.x * k, c.y * (k + (0.03 if sy_ < 0 else 0)), c.z * (k + 0.015)))
    v.co = HC + c
bmesh.ops.delete(hair, geom=dele, context='VERTS')
add_part(hair, 'Hair', ['Head'])

# ---------------------------------------------------------------- build objects & skin weights
def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * t)).length
by_mat = {}
for bm_, mname, cands in parts:
    by_mat.setdefault(mname, []).append((bm_, cands))
objs = []
for mname, lst in by_mat.items():
    full = bmesh.new(); vgroups = []
    for bm_, cands in lst:
        n0 = len(full.verts); merge(full, bm_)
        full.verts.ensure_lookup_table(); full.verts.index_update()
        for v in full.verts[n0:]:
            ws = []
            for bn in cands:
                h, t, _ = bones[bn]
                d = seg_dist(v.co, h, t)
                ws.append((bn, 1.0 / (d + 0.02) ** 3))
            ws.sort(key=lambda x: -x[1]); ws = ws[:3]; tot = sum(w for _, w in ws)
            vgroups.append((v.index, [(b, w / tot) for b, w in ws]))
    me = bpy.data.meshes.new(mname); full.to_mesh(me); full.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new('P_' + mname, me); bpy.context.collection.objects.link(o)
    me.materials.append(M[mname])
    for bn in bones: o.vertex_groups.new(name=bn)
    for vi, ws in vgroups:
        for bn, w in ws: o.vertex_groups[bn].add([vi], w, 'REPLACE')
    o.parent = arm
    mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    objs.append(o)

# ---------------------------------------------------------------- poses
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
Rrest = {n: arm.data.bones[n].matrix_local.to_3x3() for n in bones}

def wq(rx=0, ry=0, rz=0):
    return (Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ')).to_quaternion()
def set_rot(name, rx=0, ry=0, rz=0):
    R = Rrest[name]; qw = wq(rx, ry, rz)
    pb[name].rotation_quaternion = (R.inverted() @ qw.to_matrix() @ R).to_quaternion()
def set_loc(name, dx, dy, dz):
    pb[name].location = Rrest[name].inverted() @ V((dx, dy, dz))
def reset():
    for b in pb: b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)

def leg_pose(side, alpha, beta, foot_extra=0.0, abd=0.0):
    set_rot('Thigh_' + side, alpha, abd * (1 if side == 'L' else -1), 0)
    set_rot('Shin_' + side, -beta, 0, 0)
    set_rot('Foot_' + side, -(alpha - beta) + foot_extra, 0, 0)
def leg_geom(alpha, beta):
    a, b = math.radians(alpha), math.radians(alpha - beta)
    return LT * math.sin(a) + LS * math.sin(b), LT * math.cos(a) + LS * math.cos(b) + 0.085
def place_hips(aL, bL, aR, bR, bounce=0.0):
    yl, zl = leg_geom(aL, bL); yr, zr = leg_geom(aR, bR)
    set_loc('Hips', 0, -(yl + yr) / 2, max(zl, zr) - 0.90 + bounce)

def arm_pose(side, sw, add, fl):
    sg = 1 if side == 'L' else -1
    set_rot('UpperArm_' + side, sw, add * sg, 0)
    set_rot('Forearm_' + side, fl, 0, 0)

def head_point(local):
    hb = pb['Head']; rest = arm.data.bones['Head'].matrix_local
    return hb.matrix @ (rest.inverted() @ local)
def hand_center(side):
    hb = pb['Hand_' + side]; return hb.head * 0.4 + hb.tail * 0.6
def solve_arm(side, target_fn, init=(40, 10, 90), iters=60):
    best = list(init)
    def cost(p):
        arm_pose(side, p[0], p[1], p[2]); bpy.context.view_layer.update()
        return (hand_center(side) - target_fn()).length
    c = cost(best); step = [16, 12, 16]
    for it in range(iters):
        improved = False
        for i in range(3):
            for d in (+1, -1):
                q = best[:]; q[i] += d * step[i]
                cq = cost(q)
                if cq < c - 1e-5: best, c, improved = q, cq, True
        if not improved:
            step = [s * 0.5 for s in step]
            if max(step) < 0.3: break
    return best, c

actions = {}
def new_action(name, nframes, fn):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    if arm.animation_data is None: arm.animation_data_create()
    arm.animation_data.action = act
    for f in range(nframes + 1):
        reset(); fn(f % nframes, 2 * math.pi * (f % nframes) / nframes)
        for b in pb:
            b.keyframe_insert('rotation_quaternion', frame=f + 1)
            b.keyframe_insert('location', frame=f + 1)
    actions[name] = act

def idle(f, ph):
    place_hips(1, 2, 0.5, 2)
    set_rot('Hips', 0, 0, 1.2 * math.sin(ph))
    leg_pose('L', 1 + 0.5 * math.sin(ph), 2); leg_pose('R', 0.5, 2)
    set_rot('Spine', -1.0 * math.sin(ph + 0.6), 0, -1.0 * math.sin(ph))
    set_rot('Chest', -1.5 * math.sin(ph + 0.6) - 1, 0, 0)
    set_rot('Head', 2.0 * math.sin(ph + 0.2) - 1, 0, 4 * math.sin(ph))
    set_rot('Neck', 1.0 * math.sin(ph), 0, 0)
    arm_pose('L', 2 + 1.5 * math.sin(ph + 0.5), 9, 6 + 1.5 * math.sin(ph + 0.5))
    arm_pose('R', 2 + 1.5 * math.sin(ph + 1.0), 9, 7 + 1.5 * math.sin(ph + 0.8))

def run(f, ph):
    aL = 40 * math.sin(ph) + 6; aR = 40 * math.sin(ph + math.pi) + 6
    kL = max(14, 52 + 44 * math.cos(ph - 0.35)); kR = max(14, 52 + 44 * math.cos(ph + math.pi - 0.35))
    leg_pose('L', aL, kL, -0.25 * kL); leg_pose('R', aR, kR, -0.25 * kR)
    place_hips(aL, kL, aR, kR, bounce=0.009 * (1 - math.cos(2 * ph)))
    set_rot('Hips', 0, 0, 9 * math.sin(ph))
    set_rot('Spine', -9, 0, -7 * math.sin(ph)); set_rot('Chest', -5, 0, -6 * math.sin(ph))
    set_rot('Neck', 5, 0, 0); set_rot('Head', 7, 0, 5 * math.sin(ph))
    arm_pose('L', -48 * math.sin(ph) + 8, 12, 95 + 12 * math.sin(ph + 1.2))
    arm_pose('R', 48 * math.sin(ph) + 8, 12, 95 - 12 * math.sin(ph + 1.2))

mouth_rest = V((0, 0.115, 1.535))
def mouth_target(): return head_point(mouth_rest)

def crouch_base(ph):
    aL = 52 + 18 * math.sin(ph); aR = 52 + 18 * math.sin(ph + math.pi)
    kL = 88 + 22 * math.cos(ph - 0.3); kR = 88 + 22 * math.cos(ph + math.pi - 0.3)
    leg_pose('L', aL, kL, 0); leg_pose('R', aR, kR, 0)
    place_hips(aL, kL, aR, kR, bounce=0.012 * math.cos(2 * ph))
    set_rot('Hips', -12, 0, 6 * math.sin(ph))
    set_rot('Spine', -22, 0, -5 * math.sin(ph)); set_rot('Chest', -14, 0, -4 * math.sin(ph))
    set_rot('Neck', 18, 0, 0); set_rot('Head', 14, 0, 0)

reset(); crouch_base(0.0); bpy.context.view_layer.update()
sol_cw, c_cw = solve_arm('R', mouth_target, init=(60, -15, 120))
print('CrouchWalk R hand solve', sol_cw, c_cw)
def crouchwalk(f, ph):
    crouch_base(ph)
    arm_pose('R', sol_cw[0], sol_cw[1], sol_cw[2])
    set_rot('Hand_R', 10, 0, 0)
    arm_pose('L', -28 * math.sin(ph) + 16, 14, 55 + 10 * math.sin(ph))

def wc_base(ph):
    a, b = 98, 138
    leg_pose('L', a, b, 0, abd=3); leg_pose('R', a, b, 0, abd=3)
    place_hips(a, b, a, b, bounce=0.004 * math.sin(ph))
    set_rot('Hips', -8 + 0.7 * math.sin(ph), 0, 0)
    set_rot('Spine', -26 - 1.5 * math.sin(ph), 0, 0); set_rot('Chest', -16 - 1.5 * math.sin(ph), 0, 0)
    set_rot('Neck', 24, 0, 0); set_rot('Head', 18 + 1.5 * math.sin(ph + 0.6), 0, 3 * math.sin(ph))
reset(); wc_base(0.0); bpy.context.view_layer.update()
sol_wcR, _ = solve_arm('R', lambda: mouth_target() + V((-0.012, 0.0, 0.0)), init=(60, -10, 120))
sol_wcL, _ = solve_arm('L', lambda: mouth_target() + V((0.012, 0.0, 0.0)), init=(60, -10, 120))
print('WaitCrouch hands', sol_wcR, sol_wcL)
def waitcrouch(f, ph):
    wc_base(ph)
    arm_pose('R', sol_wcR[0] + 1.5 * math.sin(ph), sol_wcR[1], sol_wcR[2]); arm_pose('L', sol_wcL[0] + 1.5 * math.sin(ph), sol_wcL[1], sol_wcL[2])
    set_rot('Hand_R', 12, 0, 0); set_rot('Hand_L', 12, 0, 0)

def press_base():
    place_hips(2, 6, 4, 8); leg_pose('L', 2, 6); leg_pose('R', 4, 8)
    set_rot('Spine', -6); set_rot('Chest', -4); set_rot('Head', 4); set_rot('Neck', 3)
reset(); press_base(); bpy.context.view_layer.update()
press_far = V((0.12, 0.58, 1.30)); press_near = V((0.12, 0.51, 1.30))
sol_p0, c0 = solve_arm('R', lambda: press_far, init=(80, 5, 20))
sol_p1, c1 = solve_arm('R', lambda: press_near, init=sol_p0)
print('Press', sol_p0, c0, sol_p1, c1)
def pressbutton(f, ph):
    place_hips(2, 6, 4, 8); leg_pose('L', 2, 6); leg_pose('R', 4, 8)
    t = f / 29.0
    def sm(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
    reach = sm(t / 0.22) - sm((t - 0.8) / 0.2)
    press = sm((t - 0.38) / 0.08) - sm((t - 0.55) / 0.1)
    a0 = [sol_p0[i] * (1 - press) + sol_p1[i] * press for i in range(3)]
    rest = (4, 10, 8)
    arm_pose('R', *[rest[i] * (1 - reach) + a0[i] * reach for i in range(3)])
    set_rot('Hand_R', 15 * press, 0, 0)
    set_rot('Hips', 0, 0, -4 * reach)
    set_rot('Spine', -6 * reach - 1 * math.sin(ph), 0, 5 * reach); set_rot('Chest', -4 * reach - 1, 0, 4 * reach)
    set_rot('Head', 4 * reach, 0, 0)
    arm_pose('L', 3 + 1 * math.sin(ph), 9, 8)

new_action('Idle', 48, idle)
new_action('Run', 17, run)
new_action('CrouchWalk', 28, crouchwalk)
new_action('PressButton', 29, pressbutton)
new_action('WaitCrouch', 48, waitcrouch)
arm.animation_data.action = actions['Idle']
reset()
sc.frame_start = 1; sc.frame_end = 49
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.wm.save_as_mainfile(filepath='/home/claude/v4/blender/person.blend')
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_apply=False, export_yup=True,
                          export_optimize_animation_size=False)
print('EXPORTED', OUT)
print('person polys', sum(len(o.data.polygons) for o in objs))
