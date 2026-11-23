import * as T from "three";
import { COMMON, SHARED } from "./laut/glsl";
import type { Attachment } from "./laut/reefEcology";
import {
  ANEMONE,
  BUBBLE,
  FAN,
  KELP,
  LETTUCE,
  ORGAN,
  PLATE,
  PORITES,
  SPONGE,
  STAG,
  TURF,
  FANALGAE,
  WHIP,
} from "./laut/reefForms";

export interface ReefCritter {
  x: number;
  y: number;
  z: number;
  phase: number;
  kind: "fish" | "shrimp" | "krill" | "crab" | "nudibranch" | "starfish" | "brittlestar";
  color: number;
  tilt?: number;
  size?: number;
  yaw?: number;
  pitch?: number;
}

const choose = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
};

function mergeAux(parts: { g: T.BufferGeometry; aux?: number }[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const aux: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const p of parts) {
    const g = p.g.index ? p.g : p.g.toNonIndexed();
    const gp = g.getAttribute("position") as T.BufferAttribute;
    const gn = g.getAttribute("normal") as T.BufferAttribute;
    const ga = g.getAttribute("aux") as T.BufferAttribute | undefined;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      aux.push(ga ? ga.getX(i) : p.aux ?? 0);
    }
    if (g.index) {
      const gi = g.index;
      for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + off);
    } else {
      for (let i = 0; i < gp.count; i++) idx.push(i + off);
    }
    off += gp.count;
    p.g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("aux", new T.Float32BufferAttribute(aux, 1));
  out.setIndex(idx);
  return out;
}

export function placeReefLife(anchors: Attachment[], seed: number): ReefCritter[] {
  const rng = choose(seed * 313 + 77);
  const result: ReefCritter[] = [];
  const patches = new Set<number>();
  let shrimpCount = 0;
  let krillCount = 0;
  let crabCount = 0;
  let nudiCount = 0;
  let starCount = 0;
  let brittleCount = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (a.normal[1] < 0.16 || a.size < 4.5) continue;

    const tilt = Math.atan2(-a.normal[0], Math.max(0.28, a.normal[1])) * 0.72;

    if (a.kind !== KELP && a.kind !== TURF && a.kind !== FANALGAE && a.normal[1] >= 0.3 && a.size >= 8.5 && !patches.has(a.patch)) {
      patches.add(a.patch);
      if (patches.size <= 16) {
        const nFish = a.size > 26 ? 3 : 2;
        for (let k = 0; k < nFish; k++) {
          result.push({
            x: a.point[0] + (rng() - 0.5) * Math.min(20, a.size * 0.38),
            y: -a.point[1] - Math.max(6, a.size * 0.42) - rng() * 11,
            z: a.point[2] + 4 + rng() * 10,
            phase: rng() * Math.PI * 2 + k * 0.55,
            kind: "fish",
            color: (seed + k + patches.size) % 5,
            size: 3.1 + rng() * 2.1,
          });
        }
      }
    }

    const shrimpHabitat =
      a.kind === PORITES ||
      a.kind === PLATE ||
      a.kind === BUBBLE ||
      a.kind === SPONGE ||
      a.kind === ANEMONE ||
      a.kind === ORGAN ||
      a.kind === LETTUCE ||
      a.kind === STAG;
    if (shrimpHabitat && shrimpCount < 24 && rng() < (a.kind === ANEMONE || a.kind === BUBBLE ? 0.58 : 0.32)) {
      const pair = a.size > 14 && rng() < 0.34 ? 2 : 1;
      for (let s = 0; s < pair; s++) {
        result.push({
          x: a.point[0] + (rng() - 0.5) * Math.min(12, a.size * 0.28),
          y: -a.point[1] - 0.4 - rng() * 1.4,
          z: a.point[2] + 2.2 + (rng() - 0.5) * 4.5,
          phase: rng() * Math.PI * 2,
          kind: "shrimp",
          color: Math.floor(rng() * 4),
          tilt,
          size: 3.5 + rng() * 2.25,
        });
        shrimpCount++;
      }
    }

    // Mini rock crab patrolling flatter terraces & ledges
    if (a.normal[1] >= 0.56 && crabCount < 14 && rng() < (a.support === "ledge" || a.kind === TURF ? 0.42 : 0.22)) {
      result.push({
        x: a.point[0] + (rng() - 0.5) * 6,
        y: -a.point[1] - 0.15,
        z: a.point[2] + 3.2 + (rng() - 0.5) * 4,
        phase: rng() * Math.PI * 2,
        kind: "crab",
        color: Math.floor(rng() * 3),
        tilt: tilt * 0.7,
        size: 2.9 + rng() * 1.55,
      });
      crabCount++;
    }

    // Vibrant rainbow nudibranch crawling slowly over stone crowns & ledges
    if (a.normal[1] >= 0.34 && nudiCount < 12 && rng() < (a.kind === TURF || a.kind === FANALGAE || a.kind === SPONGE ? 0.36 : 0.18)) {
      result.push({
        x: a.point[0] + (rng() - 0.5) * 7,
        y: -a.point[1] - 0.1,
        z: a.point[2] + 3.0 + (rng() - 0.5) * 4,
        phase: rng() * Math.PI * 2,
        kind: "nudibranch",
        color: Math.floor(rng() * 3),
        tilt: tilt * 0.78,
        size: 3.1 + rng() * 1.65,
      });
      nudiCount++;
    }

    // Sea stars & brittle stars draping along curved stone contours & shoulders
    if (a.normal[1] >= 0.2 && starCount < 14 && rng() < 0.24) {
      result.push({
        x: a.point[0] + (rng() - 0.5) * 8,
        y: -a.point[1] + 0.4,
        z: a.point[2] + 3.8 + rng() * 3.5,
        phase: rng() * Math.PI * 2,
        kind: "starfish",
        color: Math.floor(rng() * 3),
        tilt,
        pitch: 0.78 + rng() * 0.45,
        yaw: (rng() - 0.5) * 1.2,
        size: 3.6 + rng() * 2.2,
      });
      starCount++;
    } else if (a.normal[1] >= 0.18 && brittleCount < 11 && rng() < 0.2) {
      result.push({
        x: a.point[0] + (rng() - 0.5) * 8,
        y: -a.point[1] + 0.5,
        z: a.point[2] + 4.1 + rng() * 3.5,
        phase: rng() * Math.PI * 2,
        kind: "brittlestar",
        color: Math.floor(rng() * 3),
        tilt,
        pitch: 0.74 + rng() * 0.45,
        yaw: (rng() - 0.5) * 1.2,
        size: 3.8 + rng() * 2.1,
      });
      brittleCount++;
    }

    const krillHabitat =
      a.kind === FAN ||
      a.kind === STAG ||
      a.kind === KELP ||
      a.kind === WHIP ||
      a.kind === BUBBLE ||
      a.kind === ANEMONE ||
      a.kind === ORGAN ||
      a.kind === SPONGE;
    if (krillHabitat && krillCount < 42 && rng() < (a.kind === FAN || a.kind === KELP ? 0.48 : 0.34)) {
      const swarmN = 2 + Math.floor(rng() * 3);
      const lift = Math.max(6, a.size * 0.38);
      for (let k = 0; k < swarmN; k++) {
        result.push({
          x: a.point[0] + (rng() - 0.5) * Math.min(26, Math.max(10, a.size * 0.7)),
          y: -a.point[1] - lift * (0.45 + rng() * 0.65) - rng() * 10,
          z: a.point[2] + 4 + (rng() - 0.5) * 14,
          phase: rng() * Math.PI * 2,
          kind: "krill",
          color: Math.floor(rng() * 3),
          size: 2.0 + rng() * 1.35,
        });
        krillCount++;
      }
    }
  }

  return result;
}

const FISH_VS = /* glsl */ `
attribute float aux;
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vPal; varying vec3 vWP;
void main(){
  float t = uTime * iB.y + iB.x;
  float rx = iA.w, ry = iA.w * .36;
  float dart = pow(.5 + .5 * sin(t * 3.1 + iB.x * 7.), 6.);
  vec2 c = vec2(sin(t) * rx + sin(t * 2.3) * rx * .15, sin(t * 2.) * ry + dart * 3.5);
  vec2 dc = vec2(cos(t) * rx + cos(t * 2.3) * rx * .35, cos(t * 2.) * ry * 2.);
  float face = dc.x >= 0. ? 1. : -1.;
  float pitch = clamp(dc.y / (abs(dc.x) + 1.), -.58, .58);
  vec3 p = position * iB.w;
  float rear = smoothstep(.1, .9, -position.x);
  p.z += sin(uTime * (14. + 6. * dart) + iB.x * 3.) * rear * rear * .35 * iB.w;
  p.x *= face;
  float cp = cos(pitch), sp = sin(pitch);
  p = vec3(p.x * cp - p.y * sp * face, p.x * sp * face + p.y * cp, p.z);
  vec3 n = vec3(normal.x * face, normal.y, normal.z);
  vec3 wp = vec3(iA.x + c.x, -(iA.y + c.y), iA.z) + p;
  vN = n; vLP = position; vPal = iB.z; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

const FISH_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vPal; varying vec3 vWP;
vec3 palette(float k){
  if (k < .5) return vec3(.16, .62, 1.);
  if (k < 1.5) return vec3(1., .54, .18);
  if (k < 2.5) return vec3(1., .86, .22);
  if (k < 3.5) return vec3(.42, .95, .64);
  return vec3(.72, .44, 1.);
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 base = palette(vPal);
  float belly = smoothstep(-.1, -.35, vLP.y);
  vec3 col = mix(base, vec3(.95, .98, 1.), belly * .7);
  col = mix(col, base * .56, smoothstep(.1, .35, vLP.y));
  float stripe = smoothstep(.02, .0, abs(vLP.x + .15) - .05) * .6;
  col = mix(col, vec3(1.), stripe * step(1.5, vPal) * step(vPal, 2.5));
  float eye = smoothstep(.07, .04, length(vLP.xy - vec2(.55, .08)));
  col = mix(col, vec3(.02), eye);
  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);
  float wy = -vWP.y;
  float sk = sunK(wy);
  col = col * (.48 + .6 * ndl * sk + .16 * max(N.y, 0.)) * absorbK(wy * .35);
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 24.) * .38 * sk;
  col = mix(col, waterCol(wy), .14);
  gl_FragColor = vec4(col, 1.);
}`;

const SHRIMP_VS = /* glsl */ `
attribute float aux;
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  vec3 p = position * iB.y;
  float cyc = fract(uTime * .15 + ph * .17);
  float flick = pow(max(0., sin(cyc * 6.2832)), 36.);
  float crawl = sin(uTime * 1.45 + ph) * .36 * iB.y;
  float hop = abs(sin(uTime * 2.2 + ph)) * .085 * iB.y;
  if (aux > 3.5) {
    p.y += hop * .15;
  } else if (aux > 1.5 && aux < 2.5) {
    float s = sin(uTime * 2.1 + ph) * .24 + sin(uTime * 10. + ph * 3.) * .04;
    float u = clamp((position.x - .85) / 1.5, 0., 1.);
    p.y += s * u * u * iB.y * 1.85;
    p.z += cos(uTime * 1.3 + ph) * u * u * iB.y * .55;
  } else if (aux > 2.5) {
    p.y += sin(uTime * 14. + position.x * 26. + ph) * .03 * iB.y;
  } else {
    float curl = flick * aux * aux * 1.15;
    p.y -= curl * iB.y * .48;
    p.x += curl * iB.y * .38;
  }
  p.x += crawl - flick * iB.y * 2.6;
  p.y += hop + flick * iB.y * 1.4;
  float ct = cos(iB.z), st = sin(iB.z);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  p.x *= iA.w;
  vec3 n = vec3(normal.x * iA.w, normal.y, normal.z);
  vec3 wp = vec3(iA.x, -iA.y, iA.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.w; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

const SHRIMP_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
vec3 shrimpAccent(float k){
  if (k < .5) return vec3(.98, .26, .24);
  if (k < 1.5) return vec3(1., .62, .18);
  if (k < 2.5) return vec3(.98, .38, .66);
  return vec3(1., .44, .26);
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);
  float wy = -vWP.y;
  float sk = sunK(wy);

  if (vAux > 3.5) {
    vec3 eyeCol = vec3(.03, .03, .06);
    float spec1 = pow(max(dot(N, normalize(vec3(.25, .62, .74))), 0.), 26.);
    float spec2 = pow(max(dot(N, normalize(vec3(-.35, -.35, .86))), 0.), 48.) * .45;
    eyeCol += vec3(1.) * smoothstep(.22, .62, spec1 + spec2);
    eyeCol = mix(eyeCol, waterCol(wy), .06);
    gl_FragColor = vec4(eyeCol, 1.);
    return;
  }

  float band = .5 + .5 * sin(vLP.x * 10.2 + .8);
  vec3 accent = shrimpAccent(vPal);
  vec3 shellWhite = mix(vec3(1., .97, .94), vec3(1., .93, .84), step(1.5, vPal) * .45);
  vec3 col = mix(shellWhite, accent, smoothstep(.28, .68, band));
  float blush = exp(-dot(vLP.xy - vec2(.76, .24), vLP.xy - vec2(.76, .24)) * 22.);
  col = mix(col, vec3(1., .42, .56), blush * .55);
  if (vAux > 1.5) col = mix(vec3(1., .98, .94), accent, .24);
  float fr = pow(1. - abs(N.z), 2.);
  col = col * (.60 + .50 * ndl * sk) * absorbK(wy * .28) + vec3(1., .96, .94) * fr * .30;
  col += accent * .14 * smoothstep(700., 1600., wy);
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 26.) * .42;
  col = mix(col, waterCol(wy), .10);
  float a = vAux > 1.5 ? .84 : .92 + fr * .08;
  gl_FragColor = vec4(col * a, a);
}`;

const KRILL_VS = /* glsl */ `
attribute float aux;
attribute vec4 iA;
attribute vec4 iB;
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  float t = uTime * iB.y + ph;
  float rx = iA.w;
  float ry = iA.w * .44;
  float rz = iA.w * .34;
  float dart = pow(.5 + .5 * sin(t * 1.45 + ph * 2.3), 16.) * 2.6;
  vec3 c = vec3(
    sin(t) * rx + cos(t * 2.1 + ph) * rx * .24 - dart,
    sin(t * 2.0 + ph * .7) * ry + sin(t * .7) * 2.2,
    cos(t * 1.15 + ph) * rz
  );
  vec3 dc = vec3(
    cos(t) * rx * iB.y - sin(t * 2.1 + ph) * rx * .5 * iB.y,
    cos(t * 2.0 + ph * .7) * ry * 2.0 * iB.y,
    -sin(t * 1.15 + ph) * rz * 1.15 * iB.y
  );
  float face = dc.x >= 0. ? 1. : -1.;
  float pitch = clamp(dc.y / (abs(dc.x) + .9), -.58, .58);
  vec3 p = position * iB.w;
  if (aux > 2.5) {
    p.x += sin(uTime * 26. + position.x * 16. + ph * 5.) * .16 * iB.w;
    p.y += cos(uTime * 26. + position.x * 16. + ph * 5.) * .06 * iB.w;
  } else if (aux > 1.5 && aux < 2.5) {
    float u = clamp((position.x - .4) / 1.1, 0., 1.);
    p.y += sin(uTime * 5. + ph) * u * u * .28 * iB.w;
    p.z += cos(uTime * 4.2 + ph) * u * u * .14 * iB.w;
  } else {
    float curl = sin(uTime * 11. + ph * 3. + dart * 3.) * .18 * aux * aux;
    p.y += curl * iB.w;
    p.z += sin(uTime * 9. + ph) * .12 * aux * iB.w;
  }
  p.x *= face;
  float cp = cos(pitch), sp = sin(pitch);
  p = vec3(p.x * cp - p.y * sp * face, p.x * sp * face + p.y * cp, p.z);
  vec3 n = vec3(normal.x * face, normal.y, normal.z);
  vec3 wp = vec3(iA.x + c.x, -(iA.y + c.y), iA.z + c.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.z; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

const KRILL_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
vec3 krillPalette(float k){
  if (k < .5) return vec3(1., .46, .48);
  if (k < 1.5) return vec3(1., .64, .30);
  return vec3(1., .74, .82);
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 base = krillPalette(vPal);
  float seg = .5 + .5 * sin(vLP.x * 16.0);
  vec3 col = mix(vec3(1., .92, .88), base, .55 + .45 * smoothstep(.2, .8, seg));
  float core = exp(-dot(vLP.xy - vec2(.24, .03), vLP.xy - vec2(.24, .03)) * 12.);
  col = mix(col, vec3(1., .24, .22), core * .65);
  float eye = smoothstep(.11, .055, length(vLP.xy - vec2(.62, .09)));
  col = mix(col, vec3(.02, .02, .05), eye);
  if (vAux > 1.5) col = vec3(1., .95, .90);

  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);
  float wy = -vWP.y;
  float sk = sunK(wy);
  float fr = pow(1. - abs(N.z), 2.1);
  float photo = smoothstep(.05, -.14, vLP.y) * smoothstep(.15, .5, fract(vLP.x * 4.5)) * (1. - step(1.5, vAux));
  float deepGlow = smoothstep(450., 1400., wy);
  vec3 bioGlow = vec3(.32, .95, 1.) * photo * (.28 + 1.15 * deepGlow);

  col = col * (.56 + .52 * ndl * sk) * absorbK(wy * .26) + vec3(1., .9, .95) * fr * .32 + bioGlow;
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 26.) * .42;
  col = mix(col, waterCol(wy), .10);
  float a = vAux > 1.5 ? .68 : .8 + fr * .2;
  gl_FragColor = vec4(col * a, a);
}`;

// =====================================================================================
// SHARED 3D ROCK FAUNA: MINI CRAB, RAINBOW NUDIBRANCH, SEA STAR, BRITTLE STAR
// =====================================================================================

export const CRAB_VS = /* glsl */ `
attribute float aux; // 0=carapace, 1.5=claws, 2.5=legs, 4=eyes
attribute vec4 iA; // anchor x, y (down), z, obliqueFactor (1 for G2, 0 for G1)
attribute vec4 iB; // phase, size, tilt, palette
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  float sz = iB.y;
  vec3 p = position * sz;
  float cyc = uTime * 1.15 + ph;
  float walk = sin(cyc) * 3.8 * sz * .32;
  float stepBounce = abs(sin(cyc * 7.5)) * .08 * sz;
  if (aux > 3.5) {
    p.y += stepBounce * .25;
  } else if (aux > 2.0) {
    // 8 scuttling crab legs alternating left/right
    float legPh = uTime * 15.0 + position.x * 16.0 + position.z * 9.0 + ph;
    p.y += max(0., sin(legPh)) * .11 * sz;
    p.x += cos(legPh) * .06 * sz;
  } else if (aux > 1.0) {
    // playful snapping raised pincers
    float snap = pow(max(0., sin(uTime * 2.4 + ph * 2.)), 4.);
    p.y += snap * .16 * sz;
    p.z += snap * .08 * sz * sign(position.z + .001);
  }
  p.x += walk;
  p.y += stepBounce;
  float ct = cos(iB.z), st = sin(iB.z);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  vec3 n = vec3(normal.x * ct - normal.y * st, normal.x * st + normal.y * ct, normal.z);
  vec3 wp = vec3(iA.x, -iA.y, iA.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.w; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z * iA.w;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

export const CRAB_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
vec3 crabCol(float k){
  if (k < .5) return vec3(.96, .22, .14);  // scarlet reef crab
  if (k < 1.5) return vec3(1., .46, .10);  // fiery tangerine rock crab
  return vec3(.98, .32, .24);              // coral-vermilion crab
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float wy = -vWP.y;
  float sk = sunK(wy);
  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);
  if (vAux > 3.5) {
    vec3 eye = vec3(.03, .03, .06) + vec3(1.) * pow(max(dot(N, normalize(vec3(.25, .6, .75))), 0.), 24.);
    gl_FragColor = vec4(mix(eye, waterCol(wy), .05), 1.);
    return;
  }
  vec3 base = crabCol(vPal);
  vec3 shell = mix(base, vec3(1., .84, .58), smoothstep(.18, .52, -vLP.y) * .45);
  float spot = smoothstep(.16, .08, length(vLP.xz - vec2(.18, .22))) + smoothstep(.16, .08, length(vLP.xz - vec2(-.18, .22)));
  shell = mix(shell, vec3(1., .92, .72), clamp(spot, 0., 1.) * .55);
  if (vAux > 1.0 && vAux < 2.0) shell = mix(base, vec3(1., .76, .24), smoothstep(.42, .85, vLP.y));
  if (vAux > 2.0) shell = mix(base * .82, vec3(1., .68, .34), .35);
  float fr = pow(1. - abs(N.z), 2.);
  vec3 col = shell * (.58 + .52 * ndl * sk) * absorbK(wy * .28) + vec3(1., .88, .75) * fr * .24;
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 22.) * .42;
  col = mix(col, waterCol(wy), .11);
  gl_FragColor = vec4(col, 1.);
}`;

export const NUDI_VS = /* glsl */ `
attribute float aux; // 0..1 body, 2=mantle skirt, 3=rhinophores, 4=gill plume, 5=cerata tendrils
attribute vec4 iA; // anchor x, y (down), z, obliqueFactor
attribute vec4 iB; // phase, size, tilt, palette
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  float sz = iB.y;
  float crawlT = uTime * .46 + ph;
  float crawl = sin(crawlT) * 3.2 * sz * .28;
  float face = cos(crawlT) >= 0. ? 1. : -1.;
  vec3 p = position * sz;
  // graceful muscular wave along slug underside & ruffled neon mantle skirt
  if (aux > 1.5 && aux < 2.5) {
    float wave = sin(position.x * 7.5 - uTime * 3.8 + ph) * .085 * sz;
    p.y += wave;
    p.z += cos(position.x * 6.0 - uTime * 3.2 + ph) * .045 * sz * sign(position.z + .001);
  } else if (aux > 2.5 && aux < 3.5) {
    // rhinophores gently feel the current
    p.x += sin(uTime * 2.2 + ph) * .06 * sz * max(0., position.y - .35);
    p.z += cos(uTime * 1.9 + ph) * .04 * sz * max(0., position.y - .35);
  } else if (aux > 3.5) {
    // dorsal gills & neon cerata tendrils sway luxuriously
    float tip = clamp(position.y - .28, 0., 1.);
    p.x += sin(uTime * 2.6 + position.x * 4. + ph) * .18 * sz * tip;
    p.z += cos(uTime * 2.1 + position.z * 5. + ph) * .12 * sz * tip;
  } else {
    p.y += max(0., sin(position.x * 4.5 - uTime * 2.8 + ph)) * .035 * sz * (1. - abs(position.y));
  }
  p.x *= face;
  p.x += crawl;
  float ct = cos(iB.z), st = sin(iB.z);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  vec3 n = vec3(normal.x * face * ct - normal.y * st, normal.x * face * st + normal.y * ct, normal.z);
  vec3 wp = vec3(iA.x, -iA.y, iA.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.w; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z * iA.w;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

export const NUDI_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float wy = -vWP.y;
  float sk = sunK(wy);
  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);

  // Vibrant electric-blue, fiery neon-orange & royal-purple rainbow sea slug palette
  vec3 neonBlue = vec3(.06, .58, 1.);
  vec3 neonOrange = vec3(1., .44, .06);
  vec3 neonPurple = vec3(.68, .18, 1.);
  if (vPal > 1.5) {
    neonBlue = vec3(.14, .82, 1.);
    neonPurple = vec3(.86, .22, .96);
  } else if (vPal > .5) {
    neonBlue = vec3(.10, .45, 1.);
    neonOrange = vec3(1., .54, .12);
  }

  float band = .5 + .5 * sin(vLP.x * 7.2 + vLP.z * 3.8);
  vec3 bodyCol = mix(neonBlue, neonPurple, smoothstep(.2, .8, band));
  float dorsalStripe = exp(-abs(vLP.z) * 7.5);
  bodyCol = mix(bodyCol, neonOrange, dorsalStripe * .78);

  if (vAux > 1.5 && vAux < 2.5) {
    // Flared double-rimmed neon orange + violet skirt
    bodyCol = mix(neonPurple, neonOrange, smoothstep(.22, .52, abs(vLP.z)));
  } else if (vAux > 2.5 && vAux < 3.5) {
    // Glowing orange-tipped sensory rhinophores
    bodyCol = mix(neonPurple, neonOrange, smoothstep(.28, .62, vLP.y));
  } else if (vAux > 3.5 && vAux < 4.5) {
    // Crown gill rosette
    bodyCol = mix(neonOrange, vec3(1., .86, .22), smoothstep(.25, .6, vLP.y));
  } else if (vAux > 4.5) {
    // Cerata tips glowing orange/blue-purple
    bodyCol = mix(neonPurple, mix(neonBlue, neonOrange, smoothstep(.36, .68, vLP.y)), .85);
  }

  float fr = pow(1. - abs(N.z), 1.9);
  float glowBoost = .26 + .32 * smoothstep(350., 1300., wy);
  vec3 col = bodyCol * (.62 + .48 * ndl * sk) * absorbK(wy * .24) + bodyCol * glowBoost + vec3(.7, .92, 1.) * fr * .28;
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 26.) * .38;
  col = mix(col, waterCol(wy), .09);
  gl_FragColor = vec4(col, 1.);
}`;

export const STAR_VS = /* glsl */ `
attribute float aux; // 0=center .. 1=arm tip, >=1.5 = dorsal bead tubercles
attribute vec4 iA; // anchor x, y (down), z, obliqueFactor
attribute vec4 iB; // phase, size, tiltZ, palette
attribute vec2 iC; // pitch (tilt toward camera), yaw
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  float sz = iB.y;
  float rArm = aux >= 1.5 ? aux - 2.0 : aux;
  vec3 p = position;
  // Bend arms gently downward (-Y in local space before rock-orientation) so stars drape/hug rounded rock contours!
  float hug = rArm * rArm * (.22 + .10 * sin(ph * 3.7));
  p.y -= hug;
  // Subtle organic wiggle for brittle stars (when aux encodes curl or via phase)
  p.y += sin(uTime * 1.35 + ph + atan(position.z, position.x) * 2.0) * .025 * rArm;
  p *= sz;

  // Pitch so the dorsal star face leans out toward the viewer on curved rocks, yaw & tilt along stone slope
  float cp = cos(iC.x), sp = sin(iC.x);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  vec3 n = vec3(normal.x, normal.y * cp - normal.z * sp, normal.y * sp + normal.z * cp);

  float cy = cos(iC.y), sy = sin(iC.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);

  float ct = cos(iB.z), st = sin(iB.z);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  n = vec3(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);

  vec3 wp = vec3(iA.x, -iA.y, iA.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.w; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z * iA.w;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

export const BRITTLE_VS = /* glsl */ `
attribute float aux; // 0=center .. 1=slender arm tip
attribute vec4 iA;
attribute vec4 iB;
attribute vec2 iC;
uniform float uTime;
uniform vec2 uReefView;
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
void main(){
  float ph = iB.x;
  float sz = iB.y;
  vec3 p = position;
  float ang = atan(position.z, position.x);
  // Cling/drape slender sinuous arms around rock curves + delicate creeping curl at arm tips
  float drape = aux * aux * .28;
  float wave = sin(uTime * 1.55 + ph + ang * 2.5 + aux * 4.5) * .09 * aux * aux;
  p.y -= drape;
  p.x += -sin(ang) * wave;
  p.z += cos(ang) * wave;
  p *= sz;

  float cp = cos(iC.x), sp = sin(iC.x);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  vec3 n = vec3(normal.x, normal.y * cp - normal.z * sp, normal.y * sp + normal.z * cp);

  float cy = cos(iC.y), sy = sin(iC.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);

  float ct = cos(iB.z), st = sin(iB.z);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  n = vec3(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);

  vec3 wp = vec3(iA.x, -iA.y, iA.z) + p;
  vN = n; vLP = position; vAux = aux; vPal = iB.w; vWP = wp;
  vec4 outPos = modelMatrix * vec4(wp, 1.);
  outPos.xy += uReefView * outPos.z * iA.w;
  gl_Position = projectionMatrix * viewMatrix * outPos;
}`;

export const STAR_FS = /* glsl */ `
varying vec3 vN; varying vec3 vLP; varying float vAux; varying float vPal; varying vec3 vWP;
vec3 starPalette(float k){
  if (k < .5) return vec3(1., .42, .06);    // bright vibrant orange sea star
  if (k < 1.5) return vec3(.62, .22, .92);  // radiant purple sea star
  return vec3(.64, .10, .24);               // deep rich maroon sea star
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float wy = -vWP.y;
  float sk = sunK(wy);
  vec3 L = normalize(vec3(-.4, .8, .5));
  float ndl = max(dot(N, L), 0.);
  vec3 base = starPalette(vPal);
  float rArm = vAux >= 1.5 ? vAux - 2.0 : vAux;
  vec3 col = mix(base * .86, base * 1.18, smoothstep(.05, .85, rArm));
  // Contrasting pale cream/coral tubercles & brittle arm rings
  if (vAux >= 1.5) {
    col = mix(vec3(1., .92, .72), base * 1.45, .32);
  } else {
    float band = .5 + .5 * sin(rArm * 28.0);
    col = mix(col, mix(base, vec3(1., .86, .68), .52), smoothstep(.66, .94, band) * .42);
  }
  float fr = pow(1. - abs(N.z), 2.1);
  col = col * (.60 + .52 * ndl * sk) * absorbK(wy * .26) + vec3(1., .92, .85) * fr * .22;
  col += vec3(1.) * pow(max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.), 20.) * .28;
  col = mix(col, waterCol(wy), .10);
  gl_FragColor = vec4(col, 1.);
}`;

function fishGeometry() {
  const body = new T.SphereGeometry(0.5, 16, 10);
  body.scale(1.1, 0.5, 0.26);
  const tail = new T.ConeGeometry(0.28, 0.42, 3);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.15);
  tail.translate(-0.72, 0, 0);
  const dorsal = new T.ConeGeometry(0.22, 0.22, 3);
  dorsal.scale(1.6, 1, 0.12);
  dorsal.translate(-0.05, 0.3, 0);
  const g = mergeAux([
    { g: body, aux: 0 },
    { g: tail, aux: 1 },
    { g: dorsal, aux: 0.3 },
  ]);
  g.deleteAttribute("uv");
  return g;
}

function shrimpGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const r = 0.34 * (1 - t * 0.5);
    const seg = new T.SphereGeometry(r, 12, 8);
    seg.scale(1.18, 1.14, 0.94);
    const x = 0.86 - t * 1.78;
    const y = 0.28 - Math.pow(t, 1.55) * 0.44 + Math.sin(t * Math.PI) * 0.22;
    seg.translate(x, y, 0);
    parts.push({ g: seg, aux: t });
  }
  for (const s of [-1, 1]) {
    const fan = new T.ConeGeometry(0.24, 0.34, 5);
    fan.rotateZ(Math.PI / 2);
    fan.rotateY(s * 0.34);
    fan.scale(1, 0.85, 0.35);
    fan.translate(-1.08, -0.2, s * 0.09);
    parts.push({ g: fan, aux: 1 });
  }
  const ros = new T.ConeGeometry(0.065, 0.26, 6);
  ros.rotateZ(-Math.PI / 2 + 0.22);
  ros.translate(1.22, 0.44, 0);
  parts.push({ g: ros, aux: 0 });
  for (const s of [-1, 1]) {
    const eyeOrb = new T.SphereGeometry(0.11, 10, 8);
    eyeOrb.scale(1.0, 1.08, 0.95);
    eyeOrb.translate(1.06, 0.52, s * 0.14);
    parts.push({ g: eyeOrb, aux: 4 });
  }
  for (const s of [-1, 1]) {
    const a = new T.CylinderGeometry(0.015, 0.03, 1.55, 5);
    a.rotateZ(-Math.PI / 2 + 0.62);
    a.rotateY(s * 0.22);
    a.translate(1.65, 0.92, s * 0.1);
    parts.push({ g: a, aux: 2 });
  }
  for (let i = 0; i < 5; i++) {
    const l = new T.CylinderGeometry(0.026, 0.024, 0.38, 5);
    l.rotateZ(0.45 - i * 0.18);
    l.translate(0.65 - i * 0.26, -0.08, (i % 2 ? 1 : -1) * 0.14);
    parts.push({ g: l, aux: 3 });
  }
  const g = mergeAux(parts);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.deleteAttribute("uv");
  return g;
}

function krillGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  const head = new T.SphereGeometry(0.24, 10, 7);
  head.scale(1.85, 0.72, 0.62);
  head.translate(0.32, 0.05, 0);
  parts.push({ g: head, aux: 0.05 });

  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const r = 0.16 * (1 - t * 0.52);
    const seg = new T.SphereGeometry(r, 8, 6);
    seg.scale(1.15, 0.85, 0.72);
    seg.translate(-0.08 - t * 0.68, 0.06 - Math.pow(t, 1.5) * 0.16, 0);
    parts.push({ g: seg, aux: 0.2 + t * 0.75 });
  }
  for (const s of [-1, 1]) {
    const uropod = new T.ConeGeometry(0.11, 0.28, 3);
    uropod.rotateZ(Math.PI / 2);
    uropod.rotateY(s * 0.28);
    uropod.scale(1, 0.4, 0.85);
    uropod.translate(-0.88, -0.1, s * 0.06);
    parts.push({ g: uropod, aux: 1 });
  }
  for (const s of [-1, 1]) {
    const ant = new T.CylinderGeometry(0.008, 0.016, 1.0, 4);
    ant.rotateZ(-Math.PI / 2 + 0.36);
    ant.rotateY(s * 0.18);
    ant.translate(0.96, 0.24, s * 0.07);
    parts.push({ g: ant, aux: 2 });
  }
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const leg = new T.CylinderGeometry(0.01, 0.015, 0.24, 4);
      leg.rotateZ(0.45 - i * 0.12);
      leg.translate(0.28 - i * 0.18, -0.13, s * 0.065);
      parts.push({ g: leg, aux: 3 });
    }
  }
  const g = mergeAux(parts);
  g.deleteAttribute("uv");
  return g;
}

export function crabGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  // Broad glossy dome carapace
  const shell = new T.SphereGeometry(0.55, 14, 10);
  shell.scale(1.12, 0.48, 0.88);
  shell.translate(0, 0.28, 0);
  parts.push({ g: shell, aux: 0 });
  // Slight apron/frontal edge
  const brow = new T.BoxGeometry(0.75, 0.14, 0.42);
  brow.translate(0, 0.24, 0.35);
  parts.push({ g: brow, aux: 0.2 });

  // 2 cute glossy black eye stalks
  for (const s of [-1, 1]) {
    const stalk = new T.CylinderGeometry(0.03, 0.04, 0.22, 6);
    stalk.rotateZ(s * 0.25);
    stalk.translate(s * 0.24, 0.52, 0.42);
    parts.push({ g: stalk, aux: 0.4 });
    const eye = new T.SphereGeometry(0.085, 8, 6);
    eye.translate(s * 0.27, 0.63, 0.44);
    parts.push({ g: eye, aux: 4 });
  }

  // Twin snapping forward claws (arm + chubby claw palm + dactyl)
  for (const s of [-1, 1]) {
    const arm = new T.CylinderGeometry(0.06, 0.07, 0.38, 6);
    arm.rotateX(0.9);
    arm.rotateZ(-s * 0.5);
    arm.translate(s * 0.56, 0.32, 0.46);
    parts.push({ g: arm, aux: 1.5 });
    const claw = new T.SphereGeometry(0.18, 9, 7);
    claw.scale(1.35, 0.88, 0.72);
    claw.rotateY(-s * 0.55);
    claw.translate(s * 0.52, 0.42, 0.68);
    parts.push({ g: claw, aux: 1.6 });
    const tip = new T.ConeGeometry(0.07, 0.22, 5);
    tip.rotateZ(s * Math.PI * 0.48);
    tip.translate(s * 0.34, 0.46, 0.72);
    parts.push({ g: tip, aux: 1.7 });
  }

  // 8 jointed walking legs (4 on left, 4 on right)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const zOff = 0.22 - i * 0.17;
      const upper = new T.CylinderGeometry(0.045, 0.04, 0.42, 5);
      upper.rotateZ(s * 1.18);
      upper.rotateY(-s * (i - 1.5) * 0.22);
      upper.translate(s * 0.66, 0.22, zOff);
      parts.push({ g: upper, aux: 2.5 });
      const lower = new T.CylinderGeometry(0.038, 0.018, 0.36, 5);
      lower.rotateZ(-s * 0.25);
      lower.translate(s * 0.85, 0.06, zOff * 1.12);
      parts.push({ g: lower, aux: 2.8 });
    }
  }

  const g = mergeAux(parts);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.deleteAttribute("uv");
  return g;
}

export function nudibranchGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  // Plump tapered slug body (7 segments)
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 0.72 - t * 1.56;
    const r = 0.24 * Math.sin((0.18 + t * 0.72) * Math.PI) + 0.07;
    const seg = new T.SphereGeometry(r, 11, 8);
    seg.scale(1.45, 0.88, 1.08);
    seg.translate(x, 0.18 + Math.sin(t * Math.PI) * 0.05, 0);
    parts.push({ g: seg, aux: t });
  }
  // Ruffled undulating outer mantle skirt along left/right flanks
  for (const s of [-1, 1]) {
    const skirt = new T.PlaneGeometry(1.58, 0.34, 14, 2);
    const sp = skirt.getAttribute("position") as T.BufferAttribute;
    for (let v = 0; v < sp.count; v++) {
      const lx = sp.getX(v);
      const w = (sp.getY(v) + 0.17) / 0.34; // 0 inner .. 1 outer edge
      const taper = Math.sqrt(Math.max(0.08, 1 - (lx / 0.84) * (lx / 0.84)));
      const z = s * (0.12 + w * 0.36 * taper);
      const y = 0.10 + Math.sin(lx * 10 + w * 2) * 0.045 * w;
      sp.setXYZ(v, lx - 0.06, y, z);
    }
    skirt.computeVertexNormals();
    parts.push({ g: skirt, aux: 2.0 });
  }
  // Twin curved anterior sensory rhinophores
  for (const s of [-1, 1]) {
    const rhino = new T.ConeGeometry(0.055, 0.34, 6);
    rhino.rotateZ(-0.34);
    rhino.rotateX(s * 0.26);
    rhino.translate(0.66, 0.42, s * 0.13);
    parts.push({ g: rhino, aux: 3.0 });
  }
  // Rear dorsal branchial gill rosette
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const gill = new T.ConeGeometry(0.048, 0.24, 5);
    gill.rotateZ(-0.42 * Math.cos(a));
    gill.rotateX(0.42 * Math.sin(a));
    gill.translate(-0.46 + Math.cos(a) * 0.07, 0.36, Math.sin(a) * 0.07);
    parts.push({ g: gill, aux: 4.0 });
  }
  // Dorsal clusters of glowing finger-like neon cerata
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const c = new T.CylinderGeometry(0.018, 0.045, 0.28 + (i % 2) * 0.06, 5);
      c.rotateZ(-0.22 - (i - 2) * 0.09);
      c.rotateX(s * (0.28 + (i % 2) * 0.1));
      c.translate(0.32 - i * 0.18, 0.38, s * (0.14 + (i % 2) * 0.05));
      parts.push({ g: c, aux: 5.0 });
    }
  }
  const g = mergeAux(parts);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.deleteAttribute("uv");
  return g;
}

export function starfishGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  const disc = new T.SphereGeometry(0.32, 14, 8);
  disc.scale(1, 0.46, 1);
  disc.translate(0, 0.08, 0);
  parts.push({ g: disc, aux: 0.05 });

  for (let a = 0; a < 5; a++) {
    const ang = (a / 5) * Math.PI * 2;
    const ca = Math.cos(ang),
      sa = Math.sin(ang);
    const segs = 5;
    for (let j = 0; j < segs; j++) {
      const t = (j + 1) / segs;
      const rad = 0.2 + t * 0.85;
      const thick = 0.21 * (1 - t * 0.72);
      const seg = new T.SphereGeometry(thick, 8, 6);
      seg.scale(1.35, 0.65, 1.0);
      seg.rotateY(-ang);
      seg.translate(ca * rad, 0.08 * (1 - t * 0.6), sa * rad);
      parts.push({ g: seg, aux: t });

      // Dorsal tubercle bead along the ridge
      if (j < segs - 1) {
        const bead = new T.SphereGeometry(0.042 * (1 - t * 0.45), 6, 4);
        bead.translate(ca * rad, 0.08 * (1 - t * 0.6) + thick * 0.66, sa * rad);
        parts.push({ g: bead, aux: 2.0 + t });
      }
    }
  }
  const g = mergeAux(parts);
  g.deleteAttribute("uv");
  return g;
}

export function brittleStarGeometry() {
  const parts: { g: T.BufferGeometry; aux?: number }[] = [];
  const disc = new T.CylinderGeometry(0.24, 0.26, 0.09, 5);
  disc.translate(0, 0.045, 0);
  parts.push({ g: disc, aux: 0.05 });

  for (let a = 0; a < 5; a++) {
    const ang = (a / 5) * Math.PI * 2 + 0.2;
    const ca = Math.cos(ang),
      sa = Math.sin(ang);
    const segs = 8;
    for (let j = 0; j < segs; j++) {
      const t = (j + 0.5) / segs;
      const r = 0.22 + t * 1.18;
      // natural gentle S-curve bend in each brittle arm
      const perp = Math.sin(t * Math.PI * 1.4 + a * 1.7) * 0.14 * t;
      const x = ca * r - sa * perp;
      const z = sa * r + ca * perp;
      const w = 0.055 * (1 - t * 0.72);
      const seg = new T.SphereGeometry(w, 6, 5);
      seg.scale(1.6, 0.7, 1.0);
      seg.rotateY(-ang);
      seg.translate(x, 0.04 * (1 - t * 0.5), z);
      parts.push({ g: seg, aux: 0.12 + t * 0.88 });
    }
  }
  const g = mergeAux(parts);
  g.deleteAttribute("uv");
  return g;
}

export class ReefLifeRenderer {
  readonly group = new T.Group();
  readonly fish: ReefCritter[];
  private disposables: { dispose: () => void }[] = [];
  private bubbles: T.Points | null = null;

  constructor(all: ReefCritter[]) {
    this.fish = all;
    const rng = choose(9241);
    const fishList = all.filter((c) => c.kind === "fish");
    const shrimpList = all.filter((c) => c.kind === "shrimp");
    const krillList = all.filter((c) => c.kind === "krill");
    const crabList = all.filter((c) => c.kind === "crab");
    const nudiList = all.filter((c) => c.kind === "nudibranch");
    const starList = all.filter((c) => c.kind === "starfish");
    const brittleList = all.filter((c) => c.kind === "brittlestar");

    this.group.name = "reef-microfauna";

    if (fishList.length) {
      const g = fishGeometry();
      const n = fishList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      fishList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 10 + rng() * 14], i * 4);
        B.set([c.phase, 0.52 + rng() * 0.56, c.color, c.size ?? 3.4 + rng() * 1.9], i * 4);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: FISH_VS,
        fragmentShader: COMMON + FISH_FS,
        side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (shrimpList.length) {
      const g = shrimpGeometry();
      const n = shrimpList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      shrimpList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, rng() < 0.5 ? 1 : -1], i * 4);
        B.set([c.phase, c.size ?? 3.6 + rng() * 2.25, c.tilt ?? 0, c.color], i * 4);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: SHRIMP_VS,
        fragmentShader: COMMON + SHRIMP_FS,
        side: T.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: T.CustomBlending,
        blendEquation: T.AddEquation,
        blendSrc: T.OneFactor,
        blendDst: T.OneMinusSrcAlphaFactor,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (krillList.length) {
      const g = krillGeometry();
      const n = krillList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      krillList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 8 + rng() * 14], i * 4);
        B.set([c.phase, 0.72 + rng() * 0.65, c.color, c.size ?? 2.0 + rng() * 1.35], i * 4);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: KRILL_VS,
        fragmentShader: COMMON + KRILL_FS,
        side: T.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: T.CustomBlending,
        blendEquation: T.AddEquation,
        blendSrc: T.OneFactor,
        blendDst: T.OneMinusSrcAlphaFactor,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 16;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (crabList.length) {
      const g = crabGeometry();
      const n = crabList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      crabList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 1], i * 4);
        B.set([c.phase, c.size ?? 3.1, c.tilt ?? 0, c.color], i * 4);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: CRAB_VS,
        fragmentShader: COMMON + CRAB_FS,
        side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (nudiList.length) {
      const g = nudibranchGeometry();
      const n = nudiList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      nudiList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 1], i * 4);
        B.set([c.phase, c.size ?? 3.3, c.tilt ?? 0, c.color], i * 4);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: NUDI_VS,
        fragmentShader: COMMON + NUDI_FS,
        side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (starList.length) {
      const g = starfishGeometry();
      const n = starList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      const C = new Float32Array(n * 2);
      starList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 1], i * 4);
        B.set([c.phase, c.size ?? 4.2, c.tilt ?? 0, c.color], i * 4);
        C.set([c.pitch ?? 0.9, c.yaw ?? 0], i * 2);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      g.setAttribute("iC", new T.InstancedBufferAttribute(C, 2));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: STAR_VS,
        fragmentShader: COMMON + STAR_FS,
        side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    if (brittleList.length) {
      const g = brittleStarGeometry();
      const n = brittleList.length;
      const A = new Float32Array(n * 4);
      const B = new Float32Array(n * 4);
      const C = new Float32Array(n * 2);
      brittleList.forEach((c, i) => {
        A.set([c.x, c.y, c.z, 1], i * 4);
        B.set([c.phase, c.size ?? 4.4, c.tilt ?? 0, c.color], i * 4);
        C.set([c.pitch ?? 0.88, c.yaw ?? 0], i * 2);
      });
      g.setAttribute("iA", new T.InstancedBufferAttribute(A, 4));
      g.setAttribute("iB", new T.InstancedBufferAttribute(B, 4));
      g.setAttribute("iC", new T.InstancedBufferAttribute(C, 2));
      const m = new T.ShaderMaterial({
        uniforms: { ...SHARED },
        vertexShader: BRITTLE_VS,
        fragmentShader: COMMON + STAR_FS,
        side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(g, m, n);
      const mtx = new T.Matrix4();
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mtx);
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      this.group.add(mesh);
      this.disposables.push(g, m);
    }

    const bubbleBase: number[] = [];
    const bubbleSeed: number[] = [];
    for (let k = 0; k < all.length; k++) {
      if (all[k].kind !== "shrimp") continue;
      for (let i = 0; i < 4; i++) {
        bubbleBase.push(all[k].x + (i - 1.5) * 1.8, -all[k].y + 1.5, all[k].z + 2);
        bubbleSeed.push((i / 4 + k * 0.187) % 1);
      }
    }
    if (bubbleBase.length) {
      const bg = new T.BufferGeometry();
      bg.setAttribute("position", new T.Float32BufferAttribute(bubbleBase, 3));
      bg.setAttribute("aSeed", new T.Float32BufferAttribute(bubbleSeed, 1));
      const bm = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...SHARED },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime, uPx;
          uniform vec2 uReefView;
          varying float vFade;
          void main(){
            float t = fract(aSeed + uTime * (.08 + .023 * aSeed));
            float drift = sin(uTime * .68 + aSeed * 41. + t * 10.) * 3.;
            vec3 p = position + vec3(drift, t * 62., sin(aSeed * 13. + t * 8.) * 3.);
            vec4 wp = modelMatrix * vec4(p, 1.);
            wp.xy += uReefView * wp.z;
            gl_Position = projectionMatrix * viewMatrix * wp;
            gl_PointSize = clamp((1.8 + 2.0 * t) * uPx, 1.4, 8.5);
            vFade = sin(t * 3.14159) * .65;
          }`,
        fragmentShader: /* glsl */ `
          varying float vFade;
          void main(){
            vec2 p = gl_PointCoord - .5;
            float r = length(p) * 2.;
            float rim = smoothstep(.57, .85, r) * (1. - smoothstep(.94, 1., r));
            float shine = exp(-dot(p - vec2(-.18, -.19), p - vec2(-.18, -.19)) * 120.);
            gl_FragColor = vec4(mix(vec3(.54, .84, .94), vec3(1.), shine), vFade * (.72 * rim + .68 * shine));
          }`,
      });
      this.bubbles = new T.Points(bg, bm);
      this.bubbles.frustumCulled = false;
      this.bubbles.renderOrder = 31;
      this.group.add(this.bubbles);
      this.disposables.push(bg, bm);
    }
  }

  update(_t: number, _cx: number, _cy: number, _vw: number, _vh: number) {
    // Motion, oblique coral projection (uReefView), and bubble rise run on the GPU via SHARED uniforms.
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
