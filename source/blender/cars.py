import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
V = Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
OUT = '/home/claude/v4/blender/cars_raw.glb'
TEX = '/home/claude/v4/blender/tex/'

# ------------------------------------------------------------------ materials
def mat(name, col, rough=0.5, metal=0.0, emit=None, estr=1.0, alpha=None, spec=0.5, img=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = estr
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(img)
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m
MAT = dict(
    Paint=mat('Paint', (0.78, 0.80, 0.84), 0.28, 0.35, spec=0.6),
    Glass=mat('Glass', (0.02, 0.035, 0.05), 0.04, 0.0, spec=1.0),
    BlackTrim=mat('BlackTrim', (0.025, 0.025, 0.027), 0.55, spec=0.3),
    Seam=mat('Seam', (0.01, 0.01, 0.012), 0.7, spec=0.1),
    WheelWell=mat('WheelWell', (0.01, 0.01, 0.01), 0.9, spec=0.1),
    Tire=mat('Tire', (0.03, 0.03, 0.032), 0.85, spec=0.2),
    Alloy=mat('Alloy', (0.62, 0.64, 0.67), 0.28, 1.0),
    Brake=mat('Brake', (0.22, 0.22, 0.23), 0.5, 0.8),
    Headlight=mat('Headlight', (0.9, 0.92, 0.95), 0.1, 0.0, emit=(1.0, 0.96, 0.85), estr=0.5, spec=1.0),
    Taillight=mat('Taillight', (0.7, 0.02, 0.02), 0.15, 0.0, emit=(1.0, 0.04, 0.02), estr=1.0, spec=1.0),
    Chrome=mat('Chrome', (0.8, 0.8, 0.82), 0.12, 1.0),
    ChargePort=mat('ChargePort', (0.05, 0.28, 0.9), 0.4, 0.0, emit=(0.1, 0.4, 1.0), estr=0.25),
    Plate1=mat('Plate', (1, 1, 1), 0.5, img=TEX + 'plate1.png'),
)
BODY_SLOTS = ['Paint', 'Glass', 'BlackTrim', 'Seam', 'WheelWell']

# ------------------------------------------------------------------ helpers
def pchip(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]; d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else 2 * d[i - 1] * d[i] / (d[i - 1] + d[i])
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = max(j for j in range(n - 1) if xs[j] <= x)
        t = (x - xs[i]) / h[i]
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]
    return f

def merge(dst, src):
    me = bpy.data.meshes.new('t'); src.to_mesh(me); dst.from_mesh(me); bpy.data.meshes.remove(me)

def mk_obj(name, bm, mats, parent=None, smooth_angle=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm.to_mesh(me)
    for m in mats: me.materials.append(MAT[m] if isinstance(m, str) else m)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc
    if parent: o.parent = parent
    return o

def smooth(o, deg=45):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))

# ------------------------------------------------------------------ body loft
def build_body(P):
    L2 = P['L'] / 2
    zt = pchip(P['zt']); zbe = pchip(P['zbelt']); cf = pchip(P['c']); zb = pchip(P['zb']); wbf = pchip(P['wb'])
    rN = P.get('rN', 0.32)
    base = [-L2 + L * 0 for L in [0]]
    ys = []
    N = 36
    for i in range(N + 1):
        s = i / N; ys.append(-L2 + P['L'] * (0.5 - 0.5 * math.cos(math.pi * s)))
    for e in (0.0, 0.008, 0.02, 0.04, 0.07):
        ys.append(-L2 + e); ys.append(L2 - e)
    seam_pairs = []
    for ysm in P['seams']:
        ys.append(ysm); ys.append(ysm + 0.012); seam_pairs.append(ysm)
    ys = sorted(set(round(y, 5) for y in ys))
    # drop near-duplicates
    ys2 = [ys[0]]
    for y in ys[1:]:
        if y - ys2[-1] > 0.004 or any(abs(y - s) < 1e-4 or abs(y - s - 0.012) < 1e-4 for s in seam_pairs): ys2.append(y)
    ys = ys2
    bm = bmesh.new()
    rings = []; segtags = None
    for k, y in enumerate(ys):
        e = min(y + L2, L2 - y)
        t = 1.0
        if e < rN: t = math.sqrt(max(0.0, 1 - ((rN - e) / rN) ** 2))
        sxf = 0.74 + 0.26 * t
        ez = 0.08; tz = math.sqrt(max(0.0, 1 - ((ez - e) / ez) ** 2)) if e < ez else 1.0
        wb_ = wbf(y) * sxf
        zb_ = zb(y) + 0.045 * (1 - tz); zt_ = zt(y) - 0.04 * (1 - tz)
        zbe_ = min(zbe(y), zt_ - 0.002); cc = cf(y)
        groove = any(abs(y - s) < 1e-4 or abs(y - s - 0.012) < 1e-4 for s in seam_pairs)
        if groove: wb_ *= 0.987
        zmid = zb_ + 0.42 * (zbe_ - zb_)
        wt = wb_ * (0.97 - 0.33 * cc)
        R = [(0, zb_), (wb_ * 0.60, zb_), (wb_ * 0.88, zb_ + 0.025), (wb_ * 0.975, zb_ + 0.10), (wb_, zmid), (wb_ * 0.995, zbe_ - 0.10), (wb_ * 0.985, zbe_)]
        S = R[-1]
        for u in range(1, 6):
            a = u / 5 * math.pi / 2
            R.append((wt + (S[0] - wt) * math.cos(a) ** 1.15, zbe_ + (zt_ - zbe_) * math.sin(a) ** 1.15))
        R.append((wt * 0.5, zt_)); R.append((0, zt_))
        m = len(R)
        full = R + [(-R[i][0], R[i][1]) for i in range(m - 2, 0, -1)]
        verts = [bm.verts.new((x, y, z)) for x, z in full]
        rings.append(verts)
    m = 14; n = 2 * m - 2
    segtags = ['bot', 'bot', 'sill', 'sill', 'side', 'side', 'arc0', 'arc1', 'arc2', 'arc3', 'arc4', 'roof', 'roof']
    def seg_of(i): return i if i < m - 1 else n - i - 1
    faces = []
    for k in range(len(ys) - 1):
        A, B = rings[k], rings[k + 1]
        seam = any(abs(ys[k] - s) < 1e-4 for s in seam_pairs) and abs(ys[k + 1] - ys[k] - 0.012) < 1e-4
        for j in range(n):
            f = bm.faces.new((A[j], A[(j + 1) % n], B[(j + 1) % n], B[j]))
            faces.append((f, segtags[seg_of(j)], seam, k, j))
    # caps: concentric rings to centre
    for end in (0, -1):
        ring = rings[end]; y = ys[end]
        cen = V((0, y, sum(v.co.z for v in ring) / n))
        prev = ring
        for sc in (0.66, 0.33):
            cur = [bm.verts.new(cen + (v.co - cen) * sc) for v in ring]
            for j in range(n):
                bm.faces.new((prev[j], prev[(j + 1) % n], cur[(j + 1) % n], cur[j]))
            prev = cur
        c = bm.verts.new(cen)
        for j in range(n): bm.faces.new((prev[j], prev[(j + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    return bm, dict(zt=zt, zbe=zbe, cf=cf, zb=zb, wb=wbf, ys=ys, faces=faces, n=n)

def assign_body_mats(bm, P, info):
    zbe = info['zbe']; cf = info['cf']; zb = info['zb']; zt = info['zt']
    L2 = P['L'] / 2
    for f in bm.faces: f.material_index = 0
    for f, tag, seam, k, j in info['faces']:
        c = f.calc_center_median(); nrm = f.normal
        y = c.y; cc = cf(y)
        mi = 0
        if tag == 'bot': mi = 2
        elif tag == 'sill': mi = 2 if P['cladding'] else 0
        if seam and tag in ('sill', 'side', 'arc0', 'arc1', 'arc2', 'arc3', 'arc4'): mi = 3
        f.material_index = mi
    # cap faces (those not in info['faces'])
    tagged = set(f for f, *_ in info['faces'])
    for f in bm.faces:
        if f not in tagged:
            c = f.calc_center_median()
            f.material_index = 0

# ------------------------------------------------------------------ wheel
def revolve(profile, seg=28, axis='x'):
    bm = bmesh.new(); rings = []
    for (r, x) in profile:
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))) if r > 1e-6 else None)
        rings.append(ring)
    # handle r=0 points
    out = []
    for idx, (r, x) in enumerate(profile):
        if r <= 1e-6: out.append(bm.verts.new((x, 0, 0)))
        else: out.append(rings[idx])
    for i in range(len(profile) - 1):
        A, B = out[i], out[i + 1]
        for j in range(seg):
            j2 = (j + 1) % seg
            if isinstance(A, list) and isinstance(B, list): bm.faces.new((A[j], A[j2], B[j2], B[j]))
            elif isinstance(A, list): bm.faces.new((A[j], A[j2], B))
            else: bm.faces.new((B[j2], B[j], A))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def make_wheel(R, W):
    hw = W / 2; rr = R * 0.63   # rim radius
    # tire profile (outer side at +x). from inner bead to outer bead
    g = 0.34
    prof = [(rr + 0.012, -hw * 0.78), (rr + 0.05, -hw * 1.0), (R * 0.86, -hw * 1.02), (R * 0.965, -hw * 0.84), (R, -hw * 0.6), (R, -hw * 0.3),
            (R - 0.007, -hw * 0.24), (R - 0.007, hw * 0.24), (R, hw * 0.3), (R, hw * 0.6), (R * 0.965, hw * 0.84), (R * 0.86, hw * 1.02), (rr + 0.05, hw * 1.0), (rr + 0.012, hw * 0.78)]
    tire = revolve(prof, seg=24)
    for f in tire.faces: f.smooth = True
    # rim barrel + lip
    barrel = revolve([(rr + 0.012, -hw * 0.78), (rr, -hw * 0.70), (rr - 0.02, -hw * 0.2), (rr - 0.02, hw * 0.35), (rr, hw * 0.72), (rr + 0.01, hw * 0.80)], seg=24)
    # face disc (dished) dark brake behind spokes
    brake = revolve([(rr * 0.80, -hw * 0.30), (rr * 0.30, -hw * 0.30), (0, -hw * 0.30)], seg=20)
    # spokes on outer plane
    spokes = bmesh.new()
    nsp = 5
    for s in range(nsp):
        a = 2 * math.pi * s / nsp + 0.3
        def pt(r, w, x): return V((x, r * math.cos(a) - w * math.sin(a), r * math.sin(a) + w * math.cos(a)))
        x0 = hw * 0.55; x1 = hw * 0.70
        vs = []
        for (r, w) in ((rr * 0.14, 0.022), (rr * 0.96, 0.030)):
            for xx in (x0 - 0.02 * (1 if r > rr * 0.5 else 0), x1):
                for sg in (-1, 1): vs.append(spokes.verts.new(pt(r, sg * w, xx)))
        # vs order: r0:x0:-,+ ; r0:x1:-,+ ; r1:x0:-,+ ; r1:x1:-,+
        q = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (2, 3, 7, 6), (0, 4, 5, 1)]
        for t in q: spokes.faces.new([vs[i] for i in t])
    hub = revolve([(rr * 0.18, hw * 0.55), (rr * 0.16, hw * 0.74), (0, hw * 0.76)], seg=16)
    merge(spokes, hub)
    bmesh.ops.recalc_face_normals(spokes, faces=spokes.faces[:])
    merge(barrel, spokes)
    return tire, barrel, brake

# ------------------------------------------------------------------ decals
def project_poly(bvh, outline, axis, dirn, offset, rings=3, y0=0, uv=False):
    """dense projected decal: triangulate+subdivide a flat polygon then raycast every vertex onto the body."""
    bm = bmesh.new()
    def p3(a, b):
        return V((a, 0, b)) if axis == 'y' else (V((0, a, b)) if axis == 'x' else V((a, b, 0)))
    vs = [bm.verts.new(p3(*p)) for p in outline]
    try:
        f = bm.faces.new(vs)
    except Exception:
        bm.free(); return None
    bmesh.ops.triangulate(bm, faces=[f])
    xs_ = [p[0] for p in outline]; zs_ = [p[1] for p in outline]
    diag = math.hypot(max(xs_) - min(xs_), max(zs_) - min(zs_))
    cuts = 1 if diag < 0.5 else (2 if diag < 0.8 else 4)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        a, b = (v.co.x, v.co.z) if axis == 'y' else ((v.co.y, v.co.z) if axis == 'x' else (v.co.x, v.co.y))
        if axis == 'y': o = V((a, -dirn * 10, b)); d = V((0, dirn, 0))
        elif axis == 'x': o = V((-dirn * 10, a, b)); d = V((dirn, 0, 0))
        else: o = V((a, b, -dirn * 10)); d = V((0, 0, dirn))
        h = bvh.ray_cast(o, d, 30)
        if h[0] is None: bm.free(); return None
        v.co = h[0] + h[1] * offset
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    want = V((0, -dirn, 0)) if axis == 'y' else (V((-dirn, 0, 0)) if axis == 'x' else V((0, 0, -dirn)))
    if sum((f.normal.dot(want) for f in bm.faces)) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm

def chaikin(pts, it=1):
    for _ in range(it):
        out = []
        n = len(pts)
        for i in range(n):
            a = pts[i]; b = pts[(i + 1) % n]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1])); out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        pts = out
    return pts

def blob(cx, cz, w, h, mirror=False):
    base = [(-1, 0.15), (-0.92, -0.35), (-0.3, -0.5), (0.7, -0.6), (1, -0.25), (0.95, 0.3), (0.3, 0.62), (-0.6, 0.5)]
    pts = [(cx + (-p[0] if mirror else p[0]) * w / 2, cz + p[1] * h) for p in base]
    return pts

def rrect(cx, cz, w, h, r=0.3, n=3):
    pts = []
    for (sx, sz, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx = cx + sx * (w / 2 - w * r * 0.5); ccz = cz + sz * (h / 2 - h * r * 0.5)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ccx + math.cos(a) * w * r * 0.5, ccz + math.sin(a) * h * r * 0.5))
    return pts

def circle(cx, cz, r, n=14): return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def box_bm(c, s, rot_y=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = V((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if rot_y: bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(rot_y, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=c)
    return bm

def ellipsoid(c, r, seg=14, rings=8):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts: v.co = V((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + V(c)
    return bm

def arc_trim(yw, zw, R, xin, xout, th, a0=-12, a1=192, seg=14):
    bm = bmesh.new(); rows = []
    for i in range(seg + 1):
        a = math.radians(a0 + (a1 - a0) * i / seg)
        cy, sz = math.cos(a), math.sin(a)
        row = []
        for (r, x) in ((R, xin), (R + th, xin), (R + th, xout), (R, xout)):
            row.append(bm.verts.new((x, yw + r * cy, zw + r * sz)))
        rows.append(row)
    for i in range(seg):
        for j in range(4):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % 4], rows[i + 1][(j + 1) % 4], rows[i + 1][j]))
    for end in (0, -1):
        bm.faces.new(rows[end])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

# ------------------------------------------------------------------ car builder
def build_car(P, root_name, plate_img, shared_wheel):
    root = bpy.data.objects.new(root_name, None); bpy.context.collection.objects.link(root)
    bm, info = build_body(P)
    assign_body_mats(bm, P, info)
    # wheel arches
    body_me = bpy.data.meshes.new(root_name + '_body'); bm.to_mesh(body_me); bm.free()
    body = bpy.data.objects.new(root_name + '_Body', body_me); bpy.context.collection.objects.link(body)
    for m in BODY_SLOTS: body_me.materials.append(MAT[m])
    wr = P['wr']; wy = P['wy']; wbf = info['wb']
    Rarch = wr + 0.065
    for sx in (-1, 1):
        for sy in (-1, 1):
            yw = sy * wy; xw = wbf(yw)
            cb = bmesh.new()
            bmesh.ops.create_cone(cb, cap_ends=True, cap_tris=False, segments=40, radius1=Rarch, radius2=Rarch, depth=0.55)
            for v in cb.verts: v.co = V((v.co.z, v.co.x, v.co.y))  # axis -> x
            bmesh.ops.translate(cb, verts=cb.verts[:], vec=V((sx * (xw - 0.125), yw, wr)))
            cme = bpy.data.meshes.new('cut'); cb.to_mesh(cme); cb.free()
            co = bpy.data.objects.new('cut', cme); bpy.context.collection.objects.link(co)
            md = body.modifiers.new('b', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = co; md.solver = 'EXACT'
            bpy.context.view_layer.objects.active = body
            bpy.ops.object.modifier_apply(modifier=md.name)
            bpy.data.objects.remove(co); bpy.data.meshes.remove(cme)
    # material for arch interior faces
    bmb = bmesh.new(); bmb.from_mesh(body.data)
    for f in bmb.faces:
        c = f.calc_center_median()
        for sy in (-1, 1):
            d = math.hypot(c.y - sy * wy, c.z - wr)
            if d < Rarch + 0.004 and abs(c.x) < wbf(sy * wy) * 0.93: f.material_index = 4
    bmb.to_mesh(body.data);
    body.parent = root
    smooth(body, 42)
    # BVH of body
    bvh = BVHTree.FromBMesh(bmb)
    zt = info['zt']; zb = info['zb']; zbe = info['zbe']
    L2 = P['L'] / 2
    parts = {k: bmesh.new() for k in ('Glass', 'Headlight', 'Taillight', 'BlackTrim', 'Chrome', 'Paint', 'ChargePort', 'Plate1', 'Seam')}
    def add(k, b):
        if b is not None: merge(parts[k], b)
    # head lamps
    hz = zb(L2) + (zt(L2) - zb(L2)) * P['lamp_f']
    hx = P['lamp_x']
    for sx in (-1, 1):
        add('Headlight', project_poly(bvh, blob(sx * hx, hz, P['lamp_w'], P['lamp_h'], mirror=(sx < 0)), 'y', -1, 0.003))
        # drl strip
        add('Chrome', project_poly(bvh, rrect(sx * (hx - 0.02), hz - P['lamp_h'] * 0.62, P['lamp_w'] * 0.7, 0.012, 0.8, 2), 'y', -1, 0.004, rings=2))
    # tail lamps
    tz = zb(-L2) + (zt(-L2) - zb(-L2)) * P['lamp_r']
    for sx in (-1, 1):
        add('Taillight', project_poly(bvh, blob(sx * P['tail_x'], tz, P['tail_w'], P['tail_h'], mirror=(sx < 0)), 'y', 1, 0.003))
    # grille / intake dark
    add('BlackTrim', project_poly(bvh, rrect(0, zb(L2) + 0.10, P['grille_w'], 0.13, 0.5, 3), 'y', -1, 0.003))
    add('BlackTrim', project_poly(bvh, rrect(0, zb(-L2) + 0.09, P['grille_w'] * 0.95, 0.09, 0.5, 3), 'y', 1, 0.003))
    # ---- glass decals
    wt = lambda y: wbf(y) * (0.97 - 0.33 * info['cf'](y))
    gl = bmesh.new()
    y0, y1 = P['ws']
    xb = wt(y0) * 0.86; xt = wt(y1) * 0.92
    poly = [(-xb, y0), (xb, y0), (xt, y1), (-xt, y1)]
    add('Glass', project_poly(bvh, chaikin(poly, 2), 'z', -1, 0.009, rings=3))
    rg = P['rg']
    if rg[0] == 'z':
        ya, yb = rg[1], rg[2]
        xa = wt(ya) * 0.86; xbb = wt(yb) * 0.9
        add('Glass', project_poly(bvh, chaikin([(-xa, ya), (xa, ya), (xbb, yb), (-xbb, yb)], 2), 'z', -1, 0.009, rings=3))
    else:
        _, zlo, zhi, wlo, whi = rg
        add('Glass', project_poly(bvh, chaikin([(-wlo, zlo), (wlo, zlo), (whi, zhi), (-whi, zhi)], 2), 'y', 1, 0.008, rings=3))
    for sx in (-1, 1):
        for (a, b) in P['win']:
            ys_ = [a + (b - a) * i / 5 for i in range(6)]
            top = lambda y: zbe(y) + 0.88 * (zt(y) - zbe(y))
            bot = lambda y: zbe(y) + 0.05
            poly = [(a, bot(a))] + [(y, bot(y)) for y in ys_[1:-1]] + [(b, bot(b)), (b - 0.16, top(b - 0.16))] + [(y, top(y)) for y in reversed(ys_[1:-1])] + [(a + 0.08, top(a + 0.08))]
            add('Glass', project_poly(bvh, chaikin(poly, 1), 'x', -sx, 0.008, rings=3))
    # plates
    for sgn, nm in ((-1, 'f'), (1, 'r')):
        yy = L2 * sgn
        pz = zb(yy) + 0.20 if sgn < 0 else zb(yy) + 0.24
    bmp = bmesh.new()
    for yy, dirn in ((L2, -1), (-L2, 1)):
        zz = zb(yy) + 0.21
        h = bvh.ray_cast(V((0, -dirn * 10, zz)), V((0, dirn, 0)), 30)
        if h[0]:
            bp = bmesh.new(); uvl = bp.loops.layers.uv.new('UVMap')
            w, hh = 0.26, 0.055
            o = h[0] + V((0, -dirn * 0.012, 0))
            vs = [bp.verts.new(o + V((sx * w, 0, sz * hh))) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            fc = bp.faces.new(vs if dirn < 0 else vs[::-1])
            uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
            for lp in fc.loops:
                idx = vs.index(lp.vert); lp[uvl].uv = (1 - uvs[idx][0], uvs[idx][1]) if dirn < 0 else (uvs[idx][0], uvs[idx][1])
            # make sure normal faces outward
            if (fc.normal.y * dirn) > 0: bmesh.ops.reverse_faces(bp, faces=[fc])
            merge(parts['Plate1'], bp)
    # charge port on left-front fender (x<0)
    cpy, cpz = P['cp']
    add('BlackTrim', project_poly(bvh, circle(cpy, cpz, 0.052, 16), 'x', 1, 0.003, rings=2))
    add('ChargePort', project_poly(bvh, circle(cpy, cpz, 0.034, 14), 'x', 1, 0.0045, rings=2))
    # door handles + mirrors
    for sx in (-1, 1):
        for hy in P['handles']:
            hz_ = zbe(hy) - 0.05
            h = bvh.ray_cast(V((sx * 10, hy, hz_)), V((-sx, 0, 0)), 30)
            if h[0]:
                add('Chrome', box_bm(h[0] + V((sx * 0.006, 0, 0)), (0.016, 0.14, 0.024)))
        my = P['mirror_y']; mz = zbe(my) + 0.075
        h = bvh.ray_cast(V((sx * 10, my, mz - 0.05)), V((-sx, 0, 0)), 30)
        mx = (h[0].x if h[0] else wbf(my)) + sx * 0.075
        add('Paint', ellipsoid((mx, my - 0.01, mz), (0.045, 0.085, 0.055), 14, 8))
        add('BlackTrim', box_bm(V((sx * (abs(mx) - 0.055), my + 0.02, mz - 0.045)), (0.07, 0.03, 0.02)))
        add('Seam', ellipsoid((mx, my + 0.034, mz), (0.036, 0.012, 0.045), 10, 6))
        # arch trim
    for sx in (-1, 1):
        for sy in (-1, 1):
            yw = sy * wy
            xs = wbf(yw) * 0.99
            b = arc_trim(yw, wr, Rarch - 0.004, sx * (xs - 0.015), sx * (xs + 0.022), 0.045)
            add('BlackTrim', b)
    # side skirt / roof rails
    objs = [body]
    for k, b in parts.items():
        if len(b.verts) == 0: b.free(); continue
        mname = 'Plate1' if k == 'Plate1' else k
        o = mk_obj(root_name + '_' + k, b, [MAT[mname]], parent=root)
        smooth(o, 50)
        objs.append(o)
    # wheels
    tire_bm, rim_bm, brake_bm = shared_wheel
    wmeshes = []
    for nm, mdat, mn in (('Tire', tire_bm, 'Tire'), ('Rim', rim_bm, 'Alloy'), ('Brake', brake_bm, 'Brake')):
        me = bpy.data.meshes.new('wheel_' + nm + root_name); mdat.to_mesh(me); me.materials.append(MAT[mn])
        for p_ in me.polygons: p_.use_smooth = True
        wmeshes.append(me)
    for fb, sy in (('F', 1), ('R', -1)):
        for side, sx in (('L', -1), ('R', 1)):
            wh = bpy.data.objects.new(f'{root_name}_WHEEL_{fb}{side}', None); bpy.context.collection.objects.link(wh)
            wh.parent = root
            xw = wbf(sy * wy) - P['wx_in']
            wh.location = (sx * xw, sy * wy, wr)
            if sx < 0: wh.rotation_euler = (0, 0, math.pi)
            for me, nm in zip(wmeshes, ('Tire', 'Rim', 'Brake')):
                o = bpy.data.objects.new(f'{root_name}_{fb}{side}_{nm}', me); bpy.context.collection.objects.link(o); o.parent = wh
    return root

def wheel_mesh(wr, ww):
    return make_wheel(wr, ww)

PARAMS = {}
PARAMS['CAR_EV_HATCH'] = dict(
    L=4.40, wr=0.34, wy=1.35, wx_in=0.145, rN=0.36, cladding=False, wide_glass=True,
    zt=[(-2.20, 0.95), (-2.14, 1.18), (-2.00, 1.34), (-1.6, 1.46), (-1.0, 1.50), (0.0, 1.49), (0.45, 1.44), (0.85, 1.24), (1.15, 1.05), (1.4, 0.99), (1.95, 0.90), (2.20, 0.72)],
    zbelt=[(-2.20, 0.92), (-1.9, 0.99), (-1.0, 1.01), (0.5, 1.0), (1.25, 0.97), (1.9, 0.88), (2.2, 0.72)],
    c=[(-2.2, 0.9), (-2.1, 1), (0.7, 1), (1.1, 0.8), (1.3, 0.0), (2.2, 0)],
    zb=[(-2.2, 0.38), (-1.9, 0.24), (-1.4, 0.19), (1.4, 0.19), (1.9, 0.24), (2.2, 0.32)],
    wb=[(-2.2, 0.80), (-1.9, 0.88), (-1.2, 0.91), (0, 0.91), (1.2, 0.91), (1.9, 0.89), (2.2, 0.82)],
    seams=[0.85, -0.12, -0.93], win=[(-1.55, -0.2), (-0.1, 0.62)],
    lamp_f=0.60, lamp_x=0.46, lamp_w=0.30, lamp_h=0.075, lamp_r=0.82, tail_x=0.55, tail_w=0.42, tail_h=0.14, grille_w=1.15,
    ws=(1.12, 0.52), rg=('y', 1.03, 1.30, 0.52, 0.40), cp=(1.18, 0.74), handles=[0.30, -0.55], mirror_y=0.74, ww=0.215, plate='plate1')
PARAMS['CAR_SEDAN'] = dict(
    L=4.85, wr=0.335, wy=1.41, wx_in=0.145, rN=0.36, cladding=False, wide_glass=True,
    zt=[(-2.425, 0.92), (-2.35, 0.99), (-1.9, 1.00), (-1.62, 1.01), (-1.2, 1.30), (-0.85, 1.44), (-0.3, 1.465), (0.3, 1.45), (0.75, 1.30), (1.1, 1.04), (1.45, 0.99), (2.0, 0.94), (2.425, 0.80)],
    zbelt=[(-2.425, 0.90), (-2.0, 0.99), (-1.0, 1.00), (0.5, 1.0), (1.3, 0.97), (2.0, 0.92), (2.425, 0.80)],
    c=[(-2.425, 0), (-1.75, 0), (-1.55, 0.5), (-1.35, 1.0), (0.9, 1.0), (1.15, 0.5), (1.35, 0), (2.425, 0)],
    zb=[(-2.425, 0.40), (-2.1, 0.25), (-1.5, 0.19), (1.5, 0.19), (2.1, 0.25), (2.425, 0.36)],
    wb=[(-2.425, 0.80), (-2.0, 0.90), (-1.3, 0.93), (1.3, 0.93), (2.0, 0.91), (2.425, 0.82)],
    seams=[1.0, -0.12, -1.05], win=[(-1.2, -0.2), (-0.1, 0.75)],
    lamp_f=0.62, lamp_x=0.48, lamp_w=0.32, lamp_h=0.075, lamp_r=0.72, tail_x=0.60, tail_w=0.44, tail_h=0.12, grille_w=1.25,
    ws=(1.05, 0.40), rg=('z', -1.52, -0.98), cp=(1.22, 0.76), handles=[0.38, -0.60], mirror_y=0.88, ww=0.225, plate='plate2')
PARAMS['CAR_SUV'] = dict(
    L=4.70, wr=0.37, wy=1.40, wx_in=0.15, rN=0.32, cladding=True, wide_glass=True,
    zt=[(-2.35, 1.20), (-2.30, 1.45), (-2.2, 1.62), (-1.6, 1.70), (-0.5, 1.72), (0.45, 1.70), (1.0, 1.55), (1.4, 1.17), (1.6, 1.12), (2.0, 1.05), (2.35, 0.92)],
    zbelt=[(-2.35, 1.05), (-2.0, 1.10), (-1.0, 1.12), (0.8, 1.10), (1.4, 1.08), (2.0, 1.02), (2.35, 0.92)],
    c=[(-2.35, 0.9), (-2.3, 1), (1.1, 1), (1.35, 0.5), (1.55, 0), (2.35, 0)],
    zb=[(-2.35, 0.44), (-2.1, 0.30), (-1.6, 0.24), (1.6, 0.24), (2.1, 0.30), (2.35, 0.40)],
    wb=[(-2.35, 0.84), (-2.1, 0.94), (-1.4, 0.96), (1.4, 0.96), (2.0, 0.94), (2.35, 0.86)],
    seams=[1.0, -0.15, -1.0], win=[(-2.0, -0.25), (-0.05, 0.95)],
    lamp_f=0.62, lamp_x=0.50, lamp_w=0.32, lamp_h=0.10, lamp_r=0.80, tail_x=0.66, tail_w=0.22, tail_h=0.30, grille_w=1.25,
    ws=(1.32, 0.60), rg=('y', 1.25, 1.55, 0.62, 0.55), cp=(1.25, 0.90), handles=[0.45, -0.65], mirror_y=1.0, ww=0.235, plate='plate3')

if __name__ == '__main__':
    which = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(PARAMS)
    for name in which:
        P = PARAMS[name]
        sw = wheel_mesh(P['wr'], P['ww'])
        MAT['Plate1'] = mat('Plate_' + name.replace('CAR_', ''), (1, 1, 1), 0.5, img=TEX + P['plate'] + '.png')
        r = build_car(P, name, None, sw)
    bpy.ops.wm.save_as_mainfile(filepath='/home/claude/v4/blender/cars.blend')
    tris = 0
    for o in bpy.data.objects:
        if o.type == 'MESH': tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('TRIS (instanced total)', tris)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=False, export_yup=True, export_animations=False)
    print('EXPORTED', OUT)
