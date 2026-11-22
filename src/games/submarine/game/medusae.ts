import { glowOrb } from "./ocean";

export const FILAMENTS = 9,
  JOINTS = 14,
  STING_SECONDS = 4;
export const JELLY_COLORS = ["#c4a2ff", "#96e5fa", "#f6bad6"];
const TAU = Math.PI * 2;
const glows: HTMLCanvasElement[] = [];

let moonAtlas: HTMLImageElement | null = null;
let moonAtlasLoading = false;
function bakedMoonJellies(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (moonAtlas) return moonAtlas.complete && moonAtlas.naturalWidth > 0 ? moonAtlas : null;
  if (!moonAtlasLoading) {
    moonAtlasLoading = true;
    const img = new Image();
    img.src = "/images/baked/moon-jellies.webp";
    moonAtlas = img;
  }
  return null;
}

function jellyGlow(color: number) {
  if (glows[color]) return glows[color];
  const cv = document.createElement("canvas");
  cv.width = cv.height = 96;
  const c = cv.getContext("2d")!,
    g = c.createRadialGradient(48, 48, 5, 48, 48, 47);
  const rgb = color === 0 ? "186,136,255" : color === 1 ? "115,228,255" : "255,154,216";
  g.addColorStop(0, `rgba(${rgb},.36)`);
  g.addColorStop(0.39, `rgba(${rgb},.15)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, 96, 96);
  glows[color] = cv;
  return cv;
}

type Solid = (x: number, y: number, r: number) => boolean;
type Swimmer = {
  x: number;
  y: number;
  r: number;
  invuln: number;
  hiddenCave: unknown;
};

export interface Medusa {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  r: number;
  seed: number;
  near: boolean;
  color: number;
  phase: number;
  pulse: number;
  tilt: number;
  points: Float32Array;
}

export function createMedusa(
  x: number,
  y: number,
  r: number,
  seed: number,
  near: boolean,
  color: number,
): Medusa {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    r,
    seed,
    near,
    color,
    phase: seed,
    pulse: 0,
    tilt: 0,
    points: new Float32Array(FILAMENTS * JOINTS * 3),
  };
}

export function shapeMedusa(j: Medusa, t: number) {
  j.phase = t * (1.42 + 0.13 * Math.sin(j.seed)) + j.seed;
  j.pulse = (0.5 + 0.5 * Math.cos(j.phase)) ** 2.35;
  j.tilt = Math.sin(t * 0.23 + j.seed) * 0.105;
  const width = 1 - 0.17 * j.pulse,
    co = Math.cos(j.tilt),
    si = Math.sin(j.tilt);
  for (let n = 0; n < FILAMENTS; n++) {
    const a = (n / FILAMENTS) * TAU + j.seed * 0.27;
    const len = 1.6 + 0.95 * (0.5 + 0.5 * Math.sin(n * 3.8 + j.seed));
    for (let k = 0; k < JOINTS; k++) {
      const u = k / (JOINTS - 1),
        ix = (n * JOINTS + k) * 3;
      const x =
        Math.cos(a) * width * 0.91 +
        u *
          (0.24 * Math.sin(j.phase * 0.72 - u * 5 + a) +
            0.32 * Math.sin(t * 0.34 + j.seed)) +
        u * u * Math.sin(a) * 0.14;
      const y =
        0.02 +
        len * u +
        0.14 * u * Math.cos(j.phase - u * 3.4) +
        0.03 * Math.sin(a * 6);
      j.points[ix] = x * co - y * si;
      j.points[ix + 1] = x * si + y * co;
      j.points[ix + 2] =
        Math.sin(a) * width * 0.84 + 0.12 * u * Math.cos(a + t * 0.69 - u * 3);
    }
  }
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax,
    dy = by - ay,
    u = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
  return (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
}

export function touchesTentacle(j: Medusa, p: Swimmer) {
  if (
    !j.near ||
    Math.abs(p.x - j.x) > j.r * 1.9 + p.r ||
    p.y < j.y - j.r * 0.25 - p.r ||
    p.y > j.y + j.r * 3 + p.r
  )
    return false;
  const px = (p.x - j.x) / j.r,
    py = (p.y - j.y) / j.r,
    radius2 = ((p.r * 0.72) / j.r + 0.035) ** 2;
  for (let n = 0; n < FILAMENTS; n++)
    for (let k = 1; k < JOINTS; k++) {
      const ix = (n * JOINTS + k) * 3,
        v = j.points;
      if (
        segmentDistance(px, py, v[ix - 3], v[ix - 2], v[ix], v[ix + 1]) <=
        radius2
      )
        return true;
    }
  return false;
}

export function touchesBell(j: Medusa, p: Swimmer) {
  if (!j.near || p.y > j.y + j.r * 0.12 + p.r * 0.18) return false;
  const dx = (p.x - j.x) / (j.r * 1.03 + p.r * 0.62);
  const dy = (p.y - (j.y - j.r * 0.43)) / (j.r * 0.51 + p.r * 0.52);
  return dx * dx + dy * dy < 1;
}

export class MedusaGarden {
  animals: Medusa[] = [];
  stun = 0;
  time = 0;
  private contact = false;
  private grace = 0;
  private bounceCooldown = 0;
  lastBounce: { x: number; y: number; nx: number; ny: number; r: number } | null = null;
  private lastX = 0;
  private lastY = 0;

  reset(x: number, y: number, solid: Solid) {
    this.animals.length = 0;
    this.stun = 0;
    this.time = 0;
    this.contact = false;
    this.grace = 3.5;
    this.bounceCooldown = 0;
    this.lastBounce = null;
    this.lastX = x;
    this.lastY = y;
    const place = (
      px: number,
      py: number,
      radius: number,
      near: boolean,
      color: number,
      seed: number,
    ) => {
      for (let i = 0; i < 28; i++) {
        const xx = Math.max(28, Math.min(3770, px + Math.sin(i * 2.4) * i * 8));
        const yy = Math.max(45, Math.min(2490, py + Math.cos(i * 1.7) * i * 7));
        if (
          solid(xx, yy + radius * 0.8, radius * 1.8) ||
          Math.hypot(xx - x, yy - y) < (near ? 74 : 30)
        )
          continue;
        const j = createMedusa(xx, yy, radius, seed, near, color);
        shapeMedusa(j, 0);
        this.animals.push(j);
        return;
      }
    };
    const side = x > 3150 ? -1 : 1;
    place(x - side * 117, y - 42, 18, true, 0, 1.2);
    place(x - side * 157, y - 72, 9, false, 1, 3.7);
    place(x + side * 164, y + 26, 13, true, 2, 4.6);
    for (let i = 0; i < 28; i++)
      place(
        115 + ((i * 677) % 3540),
        150 + ((i * 387) % 2220),
        i % 3 ? 12 + (i % 9) : 7 + (i % 6),
        i % 3 !== 0,
        i % 3,
        i * 2.16 + 0.8,
      );
  }

  update(dt: number, p: Swimmer, solid: Solid, shielded: boolean) {
    this.time += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.grace = Math.max(0, this.grace - dt);
    this.bounceCooldown = Math.max(0, this.bounceCooldown - dt);
    if (this.stun < 1e-8) this.stun = 0;
    let touching = false,
      crossed = false;
    let bell: Medusa | null = null;
    const dx = p.x - this.lastX,
      dy = p.y - this.lastY,
      travel = Math.hypot(dx, dy);
    const steps =
      travel < 140
        ? Math.min(32, Math.ceil(travel / Math.max(1.5, p.r * 0.55)))
        : 1;
    for (const j of this.animals) {
      if (Math.abs(p.x - j.x) > 960 || Math.abs(p.y - j.y) > 650) continue;
      const t = this.time,
        ox = j.homeX + Math.sin(t * 0.12 + j.seed) * 19,
        oy = j.homeY + Math.cos(t * 0.13 + j.seed) * 15 - j.pulse * 1.8;
      if (!solid(ox, oy + j.r * 0.55, j.r * 1.28)) {
        j.x = ox;
        j.y = oy;
      }
      shapeMedusa(j, t);
      if (!bell && touchesBell(j, p)) bell = j;
      if (touchesTentacle(j, p)) touching = true;
      if (
        j.near &&
        !touching &&
        !crossed &&
        steps > 1 &&
        Math.abs(j.x - p.x) < j.r * 2 + travel + p.r &&
        Math.abs(j.y - p.y) < j.r * 3 + travel + p.r
      ) {
        const swept = {
          x: 0,
          y: 0,
          r: p.r,
          invuln: p.invuln,
          hiddenCave: p.hiddenCave,
        };
        for (let step = 1; step < steps; step++) {
          swept.x = this.lastX + (dx * step) / steps;
          swept.y = this.lastY + (dy * step) / steps;
          if (touchesTentacle(j, swept)) {
            crossed = true;
            break;
          }
        }
      }
    }
    this.lastX = p.x;
    this.lastY = p.y;
    if (bell && this.bounceCooldown <= 0 && !p.hiddenCave) {
      const nx = (p.x - bell.x) / (bell.r * 1.03 + p.r * 0.62);
      const ny = (p.y - (bell.y - bell.r * 0.43)) / (bell.r * 0.51 + p.r * 0.52);
      const length = Math.hypot(nx, ny) || 1;
      this.lastBounce = { x: p.x, y: p.y, nx: nx / length, ny: ny / length, r: bell.r };
      bell.phase += 0.67;
      this.bounceCooldown = 0.72;
      this.contact = touching;
      return "bounce";
    }
    const fresh =
      (touching || crossed) &&
      !this.contact &&
      this.stun <= 0 &&
      this.grace <= 0 &&
      !p.hiddenCave &&
      p.invuln <= 0;
    this.contact = touching;
    if (!fresh) return null;
    if (shielded) {
      this.grace = 1.5;
      return "shield";
    }
    this.stun = STING_SECONDS;
    this.grace = STING_SECONDS + 1.4;
    return "sting";
  }

  /** Tick jellyfish motion even when menu attract mode is active without player collisions. */
  tickVisual(dt: number) {
    this.time += dt;
    for (const j of this.animals) {
      j.x = j.homeX + Math.sin(this.time * 0.12 + j.seed) * 19;
      j.y = j.homeY + Math.cos(this.time * 0.13 + j.seed) * 15 - j.pulse * 1.8;
      shapeMedusa(j, this.time);
    }
  }

  drawCached(
    c: CanvasRenderingContext2D,
    cl: number,
    ct: number,
    vw: number,
    vh: number,
    near: boolean,
  ) {
    const atlas = bakedMoonJellies();
    if (!atlas) return;
    c.save();
    c.translate(-cl, -ct);
    c.lineJoin = "round";
    c.lineCap = "round";
    for (const j of this.animals) {
      if (
        j.near !== near ||
        j.x < cl - 35 ||
        j.x > cl + vw + 35 ||
        j.y < ct - 75 ||
        j.y > ct + vh + 35
      )
        continue;
      const r = j.r,
        v = j.points;
      c.save();
      c.translate(j.x, j.y);
      c.scale(r, r);
      c.save();
      c.globalCompositeOperation = "screen";
      c.globalAlpha = near ? 0.6 : 0.26;
      c.drawImage(jellyGlow(j.color), -1.75, -2.05, 3.5, 3.5);
      c.restore();
      c.strokeStyle = JELLY_COLORS[j.color];
      c.globalAlpha = near ? 0.8 : 0.44;
      for (let n = 0; n < FILAMENTS; n++) {
        c.beginPath();
        c.lineWidth = 0.029 + (n % 3) * 0.007;
        for (let k = 0; k < JOINTS; k++) {
          const i = (n * JOINTS + k) * 3;
          if (!k) c.moveTo(v[i], v[i + 1]);
          else c.lineTo(v[i], v[i + 1]);
        }
        c.stroke();
      }
      c.rotate(j.tilt);
      c.globalAlpha = near ? 1 : 0.7;
      const f = Math.floor(((((j.phase / TAU) % 1) + 1) % 1) * 12);
      c.drawImage(
        atlas,
        f * 144,
        j.color * 160,
        144,
        160,
        -1.35,
        -1.16,
        2.7,
        3,
      );
      c.fillStyle = "rgba(235,255,255,.75)";
      for (let n = 0; n < 7; n++) {
        const a = n * 2.399 + j.seed,
          rr = 0.23 + 0.64 * Math.sqrt((n + 1) / 8),
          tw = 0.42 + 0.28 * Math.sin(j.phase * 1.3 + n * 2);
        c.globalAlpha = (near ? 0.63 : 0.28) * tw;
        c.beginPath();
        c.arc(Math.cos(a) * rr, -0.23 - Math.sin(a) * rr * 0.35, 0.025 + (n % 3) * 0.012, 0, TAU);
        c.fill();
      }
      c.restore();
    }
    c.restore();
  }

  drawShock(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ) {
    if (this.stun <= 0) return;
    const t = this.time;
    const hash = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return s - Math.floor(s);
    };
    const buildBolt = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      disp: number,
      seed: number,
      depth = 4,
    ) => {
      let pts = [x0, y0, x1, y1];
      let ts = [0, 1];
      let amp = disp;
      for (let d = 0; d < depth; d++) {
        const nextPts: number[] = [pts[0], pts[1]];
        const nextTs: number[] = [ts[0]];
        for (let i = 0; i < pts.length - 2; i += 2) {
          const idx = i >> 1;
          const ax = pts[i],
            ay = pts[i + 1],
            bx = pts[i + 2],
            by = pts[i + 3];
          const ta = ts[idx],
            tb = ts[idx + 1];
          const dx = bx - ax,
            dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len,
            ny = dx / len;
          const h = hash(seed + d * 43 + i * 17) - 0.5;
          const bias = hash(seed + d * 19 + i * 7) * 0.24 + 0.38;
          const tm = ta + (tb - ta) * bias;
          const envelope = 0.28 + 0.72 * Math.sin(Math.PI * tm);
          nextPts.push(
            ax + dx * bias + nx * h * amp * envelope,
            ay + dy * bias + ny * h * amp * envelope,
            bx,
            by,
          );
          nextTs.push(tm, tb);
        }
        pts = nextPts;
        ts = nextTs;
        amp *= 0.54;
      }
      return pts;
    };
    const frame = Math.floor(t * 28);
    const pulse = 0.74 + 0.26 * Math.sin(t * 54);
    const surge = hash(frame * 31) > 0.8 ? 1.15 : 0.94;
    const bolts: number[][] = [];
    const forks: number[][] = [];
    const sparks: { x: number; y: number; r: number }[] = [];

    for (let a = 0; a < 5; a++) {
      const seed = frame * 17 + a * 41;
      const ang0 = (a / 5) * TAU + hash(seed + 1) * 0.85 + t * 2.9;
      const ang1 = ang0 + Math.PI * (0.48 + hash(seed + 2) * 0.45);
      const rx0 = r * (0.58 + hash(seed + 3) * 0.42);
      const ry0 = r * (0.36 + hash(seed + 4) * 0.32);
      const rx1 = r * (0.62 + hash(seed + 5) * 0.44);
      const ry1 = r * (0.38 + hash(seed + 6) * 0.34);
      const pts = buildBolt(
        x + Math.cos(ang0) * rx0,
        y + Math.sin(ang0) * ry0,
        x + Math.cos(ang1) * rx1,
        y + Math.sin(ang1) * ry1,
        r * 0.26,
        seed,
        4,
      );
      bolts.push(pts);
      const bIdx = (2 + Math.floor(hash(seed + 9) * 4)) * 2;
      if (bIdx < pts.length - 3 && a % 2 === 0) {
        const bx = pts[bIdx],
          by = pts[bIdx + 1];
        const bAng = ang0 + (hash(seed + 11) - 0.5) * 1.4;
        const bLen = r * (0.24 + hash(seed + 13) * 0.22);
        forks.push(
          buildBolt(
            bx,
            by,
            bx + Math.cos(bAng) * bLen,
            by + Math.sin(bAng) * bLen,
            r * 0.14,
            seed + 71,
            2,
          ),
        );
      }
    }

    const nTendril = 4;
    for (let b = 0; b < nTendril; b++) {
      const seed = frame * 23 + b * 61;
      const a0 = (b / nTendril) * TAU + t * 2.3 + (hash(seed + 3) - 0.5) * 0.7;
      const rStart = r * (0.42 + hash(seed + 5) * 0.24);
      const rEnd = r * (1.06 + hash(seed + 7) * 0.26);
      const aEnd = a0 + (hash(seed + 9) - 0.5) * 0.52;
      const x1 = x + Math.cos(aEnd) * rEnd,
        y1 = y + Math.sin(aEnd) * rEnd * 0.78;
      const pts = buildBolt(
        x + Math.cos(a0) * rStart,
        y + Math.sin(a0) * rStart * 0.72,
        x1,
        y1,
        r * 0.24,
        seed,
        3,
      );
      bolts.push(pts);
      const branchIdx = (2 + Math.floor(hash(seed + 11) * 2)) * 2;
      if (branchIdx < pts.length - 3) {
        const bx = pts[branchIdx],
          by = pts[branchIdx + 1];
        const side = hash(seed + 13) > 0.5 ? 1 : -1;
        const bAng = aEnd + side * (0.48 + hash(seed + 15) * 0.36);
        const bLen = r * (0.22 + hash(seed + 17) * 0.2);
        forks.push(
          buildBolt(
            bx,
            by,
            bx + Math.cos(bAng) * bLen,
            by + Math.sin(bAng) * bLen,
            r * 0.13,
            seed + 97,
            2,
          ),
        );
        sparks.push({ x: bx, y: by, r: 0.9 + hash(seed + 19) * 0.6 });
      }
      if (b % 2 === 0) sparks.push({ x: x1, y: y1, r: 0.8 + hash(seed + 21) * 0.5 });
    }

    c.save();
    c.globalCompositeOperation = "lighter";
    c.lineJoin = "miter";
    c.miterLimit = 5;
    c.lineCap = "round";

    c.globalAlpha = (0.22 + 0.08 * Math.sin(t * 36)) * surge;
    c.drawImage(
      glowOrb("rgba(90, 210, 255, 0.48)", false),
      x - r * 1.2,
      y - r * 1.15,
      r * 2.4,
      r * 2.3,
    );

    const strokePaths = (
      list: number[][],
      width: number,
      style: string,
      alpha: number,
    ) => {
      if (!list.length) return;
      c.strokeStyle = style;
      c.lineWidth = width;
      c.globalAlpha = alpha;
      c.beginPath();
      for (const pts of list) {
        c.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      }
      c.stroke();
    };

    const wOuter = Math.max(0.95, Math.min(2.1, r * 0.046));
    const wMid = Math.max(0.65, Math.min(1.25, r * 0.025));
    const wCore = Math.max(0.45, Math.min(0.82, r * 0.013));
    strokePaths(bolts, wOuter, "#38bdf8", 0.34 * pulse);
    strokePaths(forks, wOuter * 0.65, "#60a5fa", 0.28 * pulse);
    strokePaths(bolts, wMid, "#7dd3fc", 0.70 * pulse);
    strokePaths(forks, wMid * 0.65, "#bae6fd", 0.60 * pulse);
    strokePaths(bolts, wCore, "#ffffff", 0.95 * surge);
    strokePaths(forks, wCore * 0.65, "#f0f9ff", 0.85 * surge);

    c.fillStyle = "#e0f2fe";
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      c.globalAlpha = 0.68 + 0.32 * hash(frame * 7 + i * 13);
      c.beginPath();
      c.arc(sp.x, sp.y, sp.r, 0, TAU);
      c.fill();
    }

    c.restore();
  }
}
