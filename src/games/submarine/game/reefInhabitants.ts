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
  WHIP,
} from "./laut/reefForms";

export interface ReefCritter {
  x: number;
  y: number;
  z: number;
  phase: number;
  kind: "fish" | "shrimp" | "krill";
  color: number;
  tilt?: number;
  size?: number;
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

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (a.normal[1] < 0.16 || a.size < 4.5) continue;

    const tilt = Math.atan2(-a.normal[0], Math.max(0.28, a.normal[1])) * 0.72;

    if (a.kind !== KELP && a.normal[1] >= 0.3 && a.size >= 8.5 && !patches.has(a.patch)) {
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
    if (shrimpHabitat && shrimpCount < 28 && rng() < (a.kind === ANEMONE || a.kind === BUBBLE ? 0.65 : 0.36)) {
      const pair = a.size > 14 && rng() < 0.38 ? 2 : 1;
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
