// ============================================================================
// PROCEDURAL 3D NAVAL SEA MINE, INTERLOCKING STUD-LINK CHAIN & SINKER ANCHOR
// Pure Three.js BufferGeometry builders shared by:
//   1. Live in-world 3D mines inside Dunia Laut 3D (laut/seaMines.ts)
//   2. Offscreen RoomEnvironment PBR studio fallback (mine3d.ts)
// ============================================================================
import * as THREE from "three";

export interface PaintedPart {
  geo: THREE.BufferGeometry;
  col: [number, number, number];
  met: number;
  ao: number;
  part: number; // 0 = hull/iron/brass/rivet, 0.6 = horn detonator cap, 1.0 = main ruby beacon lens
}

/** Uniformly distributed directions on the unit sphere (Fibonacci lattice) */
export function fibonacciDirections(count: number): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    dirs.push(new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius));
  }
  return dirs;
}

/** Merges multiple BufferGeometries with constant per-part lit attributes (aCol, aMet, aAO, aPart) */
export function mergePaintedParts(parts: PaintedPart[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const p of parts) {
    const pos = p.geo.getAttribute("position");
    totalVerts += pos.count;
    totalIndices += p.geo.index ? p.geo.index.count : pos.count;
  }

  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const colArr = new Float32Array(totalVerts * 3);
  const metArr = new Float32Array(totalVerts);
  const aoArr = new Float32Array(totalVerts);
  const partArr = new Float32Array(totalVerts);
  const idxArr = new Uint32Array(totalIndices);

  let vOff = 0;
  let iOff = 0;

  for (const p of parts) {
    const g = p.geo;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const pos = g.getAttribute("position");
    const norm = g.getAttribute("normal");
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const vi = vOff + i;
      const v3 = vi * 3;
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      posArr[v3] = px;
      posArr[v3 + 1] = py;
      posArr[v3 + 2] = pz;

      normArr[v3] = norm.getX(i);
      normArr[v3 + 1] = norm.getY(i);
      normArr[v3 + 2] = norm.getZ(i);

      // Subtle vertical ambient shading on large shells so underside reads heavier
      const vertAO = p.part === 0 ? THREE.MathUtils.clamp(0.86 + py * 0.14, 0.72, 1.05) : 1.0;
      colArr[v3] = p.col[0];
      colArr[v3 + 1] = p.col[1];
      colArr[v3 + 2] = p.col[2];
      metArr[vi] = p.met;
      aoArr[vi] = p.ao * vertAO;
      partArr[vi] = p.part;
    }

    if (g.index) {
      const idx = g.index;
      for (let k = 0; k < idx.count; k++) {
        idxArr[iOff + k] = idx.getX(k) + vOff;
      }
      iOff += idx.count;
    } else {
      for (let k = 0; k < count; k++) {
        idxArr[iOff + k] = vOff + k;
      }
      iOff += count;
    }
    vOff += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
  out.setAttribute("aCol", new THREE.BufferAttribute(colArr, 3));
  out.setAttribute("aMet", new THREE.BufferAttribute(metArr, 1));
  out.setAttribute("aAO", new THREE.BufferAttribute(aoArr, 1));
  out.setAttribute("aPart", new THREE.BufferAttribute(partArr, 1));
  out.setIndex(new THREE.BufferAttribute(idxArr, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * Builds the composite normalized Mk-VI Naval Sea Mine geometry (radius = 1.0):
 *  - Riveted cast-iron spherical hull
 *  - Beveled equatorial & meridian weld flanges + 24 steel rivets
 *  - 12–14 sculpted 3-tier Hertz contact horns (brass hex boss + tapered iron sheath + ruby tip)
 *  - Top lifting padeye ring & bottom mooring swivel clevis
 *  - Dual armored brass warning lamp bezels + pulsing ruby danger cores
 */
export function buildSeaMineGeometry(): THREE.BufferGeometry {
  const parts: PaintedPart[] = [];
  const temp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();

  const ironDark: [number, number, number] = [0.52, 0.57, 0.63];
  const ironMid: [number, number, number] = [0.66, 0.71, 0.77];
  const steelBright: [number, number, number] = [0.84, 0.88, 0.93];
  const brassWarm: [number, number, number] = [0.76, 0.58, 0.28];
  const brassDark: [number, number, number] = [0.54, 0.41, 0.21];
  const socketDark: [number, number, number] = [0.22, 0.26, 0.31];
  const rubyTip: [number, number, number] = [0.96, 0.18, 0.13];
  const rubyCore: [number, number, number] = [0.98, 0.15, 0.12];

  // 1. Cast-iron mine pressure hull
  parts.push({
    geo: new THREE.SphereGeometry(0.985, 28, 20),
    col: ironDark,
    met: 0.78,
    ao: 0.96,
    part: 0,
  });

  // 2. Equatorial beveled flange + meridian seam band
  const eqBand = new THREE.TorusGeometry(0.99, 0.056, 8, 36);
  eqBand.rotateX(Math.PI * 0.5);
  parts.push({ geo: eqBand, col: ironMid, met: 0.86, ao: 0.92, part: 0 });

  const eqRim = new THREE.TorusGeometry(1.03, 0.026, 6, 36);
  eqRim.rotateX(Math.PI * 0.5);
  parts.push({ geo: eqRim, col: brassDark, met: 0.88, ao: 0.95, part: 0 });

  const merBand = new THREE.TorusGeometry(0.988, 0.042, 8, 32);
  merBand.rotateY(Math.PI * 0.5);
  parts.push({ geo: merBand, col: ironMid, met: 0.84, ao: 0.9, part: 0 });

  // 3. Equatorial + meridian steel rivets
  const baseRivet = new THREE.SphereGeometry(0.042, 6, 5);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    // Skip right next to +/-Z lamp bezels and meridian intersection
    if (Math.abs(Math.sin(a)) < 0.24) continue;
    const r = baseRivet.clone();
    r.translate(Math.cos(a) * 1.045, 0, Math.sin(a) * 1.045);
    parts.push({ geo: r, col: steelBright, met: 0.94, ao: 1.0, part: 0 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    // Skip near +/-Y poles and +/-Z lamps
    if (Math.abs(Math.sin(a)) > 0.82 || Math.abs(Math.cos(a)) > 0.84) continue;
    const r = baseRivet.clone();
    r.scale(0.85, 0.85, 0.85);
    r.translate(0, Math.sin(a) * 1.028, Math.cos(a) * 1.028);
    parts.push({ geo: r, col: steelBright, met: 0.94, ao: 1.0, part: 0 });
  }
  baseRivet.dispose();

  // 4. Sculpted 3-tier Hertz contact horns on a clean Fibonacci sphere (avoiding poles & beacon faces)
  const rawDirs = fibonacciDirections(18);
  const hornDirs = rawDirs.filter((d) => {
    const absY = Math.abs(d.y);
    const absZ = Math.abs(d.z);
    // Keep clear of top padeye, bottom clevis, and front/back danger beacons
    return absY < 0.84 && absZ < 0.86;
  });

  // Reusable Lathe profile for tapered ribbed horn sheath along +Y
  const hornProf = [
    new THREE.Vector2(0.118, 1.08),
    new THREE.Vector2(0.125, 1.12),
    new THREE.Vector2(0.095, 1.14),
    new THREE.Vector2(0.088, 1.24),
    new THREE.Vector2(0.068, 1.35),
    new THREE.Vector2(0.082, 1.38),
    new THREE.Vector2(0.062, 1.40),
  ];
  const protoHexBoss = new THREE.CylinderGeometry(0.135, 0.168, 0.14, 6);
  protoHexBoss.translate(0, 1.015, 0);
  const protoSheath = new THREE.LatheGeometry(hornProf, 10);
  const protoTip = new THREE.SphereGeometry(0.068, 8, 6);
  protoTip.translate(0, 1.435, 0);

  for (const dir of hornDirs) {
    quat.setFromUnitVectors(up, dir);

    const boss = protoHexBoss.clone().applyQuaternion(quat);
    parts.push({ geo: boss, col: brassWarm, met: 0.88, ao: 0.94, part: 0 });

    const sheath = protoSheath.clone().applyQuaternion(quat);
    parts.push({ geo: sheath, col: ironMid, met: 0.82, ao: 0.96, part: 0 });

    const tip = protoTip.clone().applyQuaternion(quat);
    parts.push({ geo: tip, col: rubyTip, met: 0.25, ao: 1.0, part: 0.6 });
  }
  protoHexBoss.dispose();
  protoSheath.dispose();
  protoTip.dispose();

  // 5. Top forged lifting padeye & collar
  const topBoss = new THREE.CylinderGeometry(0.15, 0.20, 0.14, 12);
  topBoss.translate(0, 0.99, 0);
  parts.push({ geo: topBoss, col: ironMid, met: 0.86, ao: 0.94, part: 0 });

  const topLoop = new THREE.TorusGeometry(0.13, 0.036, 7, 16);
  topLoop.translate(0, 1.13, 0);
  parts.push({ geo: topLoop, col: steelBright, met: 0.9, ao: 1.0, part: 0 });

  // 6. Bottom mooring swivel lug & clevis shackle (connects to chain)
  const botBoss = new THREE.CylinderGeometry(0.21, 0.14, 0.15, 12);
  botBoss.translate(0, -1.0, 0);
  parts.push({ geo: botBoss, col: ironMid, met: 0.86, ao: 0.88, part: 0 });

  const botLoop = new THREE.TorusGeometry(0.135, 0.038, 7, 16);
  botLoop.rotateY(Math.PI * 0.5);
  botLoop.translate(0, -1.14, 0);
  parts.push({ geo: botLoop, col: brassDark, met: 0.88, ao: 0.92, part: 0 });

  // 7. Armored front (+Z) & rear (-Z) brass warning bezels + pulsing ruby beacon domes
  for (const sign of [1, -1] as const) {
    const bezelCollar = new THREE.TorusGeometry(0.295, 0.068, 8, 20);
    bezelCollar.translate(0, 0, sign * 0.94);
    parts.push({ geo: bezelCollar, col: brassWarm, met: 0.92, ao: 0.96, part: 0 });

    const bezelInner = new THREE.CylinderGeometry(0.26, 0.28, 0.08, 16);
    bezelInner.rotateX(Math.PI * 0.5);
    bezelInner.translate(0, 0, sign * 0.935);
    parts.push({ geo: bezelInner, col: socketDark, met: 0.35, ao: 0.75, part: 0 });

    // 4 small brass bezel bolts
    for (let b = 0; b < 4; b++) {
      const ang = (b * Math.PI) / 2 + Math.PI / 4;
      temp.set(Math.cos(ang) * 0.31, Math.sin(ang) * 0.31, sign * 0.985);
      const bolt = new THREE.SphereGeometry(0.036, 5, 4);
      bolt.translate(temp.x, temp.y, temp.z);
      parts.push({ geo: bolt, col: steelBright, met: 0.95, ao: 1.0, part: 0 });
    }

    // Pulsing faceted ruby danger dome
    const lens = new THREE.SphereGeometry(0.235, 14, 10);
    lens.scale(1, 1, 0.56);
    lens.translate(0, 0, sign * 0.97);
    parts.push({ geo: lens, col: rubyCore, met: 0.18, ao: 1.0, part: 1.0 });
  }

  const merged = mergePaintedParts(parts);
  for (const p of parts) p.geo.dispose();
  return merged;
}

/**
 * Builds a single interlocking 3D forged stud-link anchor chain link.
 * Height = 1.0 (from -0.5 to +0.5), Width ~ 0.62, thick tubular cross-section.
 */
export function buildChainLinkGeometry(): THREE.BufferGeometry {
  const parts: PaintedPart[] = [];
  const halfH = 0.21;
  const rx = 0.195;
  const tubeR = 0.105;

  // Build smooth closed stadium oval points in XY plane
  const pts: THREE.Vector3[] = [];
  const arcSteps = 10;
  // Top semicircle (right -> left)
  for (let i = 0; i <= arcSteps; i++) {
    const a = (i / arcSteps) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * rx, halfH + Math.sin(a) * rx, 0));
  }
  // Bottom semicircle (left -> right)
  for (let i = 0; i <= arcSteps; i++) {
    const a = Math.PI + (i / arcSteps) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * rx, -halfH + Math.sin(a) * rx, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.22);
  const loopGeo = new THREE.TubeGeometry(curve, 28, tubeR, 8, true);

  // Center forged cross-stud bar
  const studGeo = new THREE.CylinderGeometry(0.072, 0.072, rx * 1.92, 8);
  studGeo.rotateZ(Math.PI * 0.5);

  const chainIron: [number, number, number] = [0.56, 0.61, 0.68];
  const chainStud: [number, number, number] = [0.46, 0.50, 0.56];

  parts.push({ geo: loopGeo, col: chainIron, met: 0.84, ao: 0.92, part: 0 });
  parts.push({ geo: studGeo, col: chainStud, met: 0.74, ao: 0.88, part: 0 });

  const merged = mergePaintedParts(parts);
  for (const p of parts) p.geo.dispose();
  return merged;
}

/**
 * Builds a heavy cast-iron seabed mooring clump anchor weight (height ~ 1.0, sits on y=0).
 */
export function buildAnchorSinkerGeometry(): THREE.BufferGeometry {
  const parts: PaintedPart[] = [];
  const ironHeavy: [number, number, number] = [0.46, 0.51, 0.58];
  const ironTrim: [number, number, number] = [0.64, 0.69, 0.76];
  const brassShackle: [number, number, number] = [0.64, 0.48, 0.25];

  const plinth = new THREE.CylinderGeometry(0.84, 0.94, 0.22, 8);
  plinth.translate(0, 0.11, 0);
  parts.push({ geo: plinth, col: ironHeavy, met: 0.72, ao: 0.86, part: 0 });

  const body = new THREE.CylinderGeometry(0.46, 0.78, 0.56, 8);
  body.translate(0, 0.48, 0);
  parts.push({ geo: body, col: ironTrim, met: 0.80, ao: 0.94, part: 0 });

  const cap = new THREE.CylinderGeometry(0.26, 0.44, 0.14, 8);
  cap.translate(0, 0.81, 0);
  parts.push({ geo: cap, col: ironHeavy, met: 0.84, ao: 0.98, part: 0 });

  const shackle = new THREE.TorusGeometry(0.18, 0.052, 7, 14);
  shackle.translate(0, 0.97, 0);
  parts.push({ geo: shackle, col: brassShackle, met: 0.88, ao: 1.0, part: 0 });

  const merged = mergePaintedParts(parts);
  for (const p of parts) p.geo.dispose();
  return merged;
}
