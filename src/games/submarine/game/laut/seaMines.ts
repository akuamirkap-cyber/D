// ============================================================================
// MODE "DUNIA LAUT 3D" — Live 3D Naval Sea Mines, Interlocking Stud-Link Chains
//                        and Cast-Iron Seabed Mooring Sinkers
// ============================================================================
import * as THREE from "three";
import { floorY } from "../ocean";
import { SHARED, COMMON } from "./glsl";
import {
  buildAnchorSinkerGeometry,
  buildChainLinkGeometry,
  buildSeaMineGeometry,
} from "../mineGeo";

export interface Mine3DData {
  x: number;
  y: number;
  baseY: number;
  r: number;
  rot: number;
  ph: number;
  tether: number;
}

const MAX_MINES = 28;
const MAX_LINKS = 720;
const MINE_Z = 44;

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _scale = new THREE.Vector3();
const _clevisOffset = new THREE.Vector3();

function mineLitMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SHARED,
      uFog: { value: 0.04 },
    },
    vertexShader: /* glsl */ `
attribute vec3 aCol;
attribute float aMet;
attribute float aAO;
attribute float aPart;
attribute float aPh;
attribute float aFade;

varying vec3 vWP;
varying vec3 vN;
varying vec3 vC;
varying float vM;
varying float vAO;
varying float vPart;
varying float vPh;
varying float vFade;
varying vec3 vLocal;

void main(){
  mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
    mm = mm * instanceMatrix;
  #endif
  vec4 wp = mm * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(mm) * normal);
  vC = aCol;
  vM = aMet;
  vAO = aAO;
  vPart = aPart;
  vPh = aPh;
  vFade = aFade;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader:
      COMMON +
      /* glsl */ `
uniform float uFog;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vC;
varying float vM;
varying float vAO;
varying float vPart;
varying float vPh;
varying float vFade;
varying vec3 vLocal;

void main(){
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float wy = -vWP.y;
  vec3 L = normalize(vec3(-0.42, 0.80, 0.44));
  float sk = sunK(wy);
  float ndl = max(dot(N, L), 0.0);
  float wrap = dot(N, L) * 0.5 + 0.5;
  vec3 wc = waterCol(wy);

  // Underwater caustics glint across upward steel/brass curves
  float cAmt = smoothstep(1550.0, 220.0, wy);
  float cs = cAmt > 0.015 ? caustics(vWP.xy * 0.014, uTime * 0.55) : 0.0;
  vec3 amb = mix(vec3(0.26, 0.31, 0.38), wc * 0.95 + vec3(0.18, 0.22, 0.27), 0.46);
  vec3 sun = vec3(1.0, 0.96, 0.88) * sk * (ndl * 1.08 + wrap * 0.28 + cAmt * cs * 0.65);

  vec3 col = vC * (amb * (0.64 + 0.36 * N.y * 0.5 + 0.20) + sun) * (0.56 + 0.44 * vAO) * absorbK(wy * 0.44) * 1.18;

  // Dynamic submarine bow searchlight & diver headlamp beams illuminate mines & chains!
  if (uLampCount > 0) {
    for (int i = 0; i < 7; i++) {
      if (i >= uLampCount) break;
      vec3 off = vWP - uLampOrigin[i].xyz;
      vec3 axis = uLampAxis[i].xyz;
      float along = dot(off, axis);
      float reach = uLampOrigin[i].w;
      if (along > 0.0 && along < reach) {
        float rad = 1.4 + along * abs(uLampAxis[i].w);
        vec3 side = off - axis * along;
        float fall = exp(-dot(side, side) / (rad * rad) * 2.1);
        vec3 tint = uLampAxis[i].w > 0.0 ? vec3(1.0, 0.77, 0.41) : vec3(0.68, 0.89, 1.0);
        float beamLit = fall * (1.0 - along / reach) * (0.25 + 0.75 * max(0.0, -dot(N, axis)));
        col += (vC * (0.72 + 0.55 * vM) + vec3(0.06)) * tint * beamLit;
      }
    }
  }

  // Metallic silver-iron specular highlights & oceanic rim sheen
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(N, Hh), 0.0), 30.0) * vM * (sk * 0.95 + 0.24);
  float rim = pow(1.0 - abs(N.z), 2.35);
  col += vec3(0.92, 0.96, 1.0) * spec * 0.95;
  col = mix(col, col * 0.74 + wc * 0.24 * vM, rim * vM * 0.52);
  col += vec3(0.24, 0.31, 0.38) * pow(1.0 - abs(N.z), 2.5) * vM;

  // Brushed silver-iron grain & subtle wear
  float patina = vnoise(vLocal.xy * 10.5 + vLocal.z * 5.0) * 0.68 + vnoise(vLocal.zy * 21.0 + vLocal.x * 11.0) * 0.32;
  if (vM > 0.5) {
    col *= 0.92 + 0.16 * patina;
    col = mix(col, vec3(0.30, 0.35, 0.40), smoothstep(0.72, 0.92, patina) * 0.12);
  }

  // Pulsing ruby danger beacon dome & crimson horn detonator caps
  if (vPart > 0.4) {
    float blink = 0.5 + 0.5 * sin(uTime * 7.5 + vPh);
    float facing = max(dot(N, V), 0.0);
    if (vPart > 0.85) {
      // Main faceted ruby beacon lens
      vec3 darkGarnet = vec3(0.28, 0.03, 0.03);
      vec3 brightRuby = vec3(1.0, 0.22, 0.14);
      vec3 hotCore = vec3(1.0, 0.88, 0.42);
      vec3 glowC = mix(darkGarnet, brightRuby, 0.28 + blink * 0.72);
      glowC += hotCore * pow(facing, 2.4) * (0.25 + blink * 0.95);
      float glassSpec = pow(max(dot(N, normalize(vec3(-0.35, 0.55, 0.85))), 0.0), 46.0);
      col = glowC * (0.9 + blink * 0.75) + vec3(1.0, 0.96, 0.90) * glassSpec * 0.75;
    } else {
      // Horn detonator caps pulse subtly
      float p = 0.30 + 0.70 * blink;
      col += vec3(0.95, 0.16, 0.10) * (0.32 + p * 0.68);
    }
  }

  col = mix(col, wc * 1.02 + vec3(0.02, 0.035, 0.045), uFog);
  // Subtle fade into abyss for unanchored mid-water trailing chains
  col = mix(wc, col, clamp(vFade, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}

function mineHaloMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SHARED,
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
attribute float aPh;
varying vec2 vUv;
varying float vPh;
void main(){
  vUv = uv;
  vPh = aPh;
  mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
    mm = mm * instanceMatrix;
  #endif
  gl_Position = projectionMatrix * viewMatrix * mm * vec4(position, 1.0);
}`,
    fragmentShader:
      COMMON +
      /* glsl */ `
varying vec2 vUv;
varying float vPh;
void main(){
  vec2 d = (vUv - 0.5) * 2.0;
  float r2 = dot(d, d);
  if (r2 >= 1.0) discard;
  float blink = 0.5 + 0.5 * sin(uTime * 7.5 + vPh);
  float falloff = pow(1.0 - r2, 2.35);
  float a = falloff * (0.24 + blink * 0.42);
  vec3 tint = mix(vec3(0.95, 0.18, 0.16), vec3(1.0, 0.36, 0.22), blink);
  gl_FragColor = vec4(tint * a, a);
}`,
  });
}

export class SeaMines3D {
  readonly group = new THREE.Group();
  private mineGeo: THREE.BufferGeometry;
  private chainGeo: THREE.BufferGeometry;
  private anchorGeo: THREE.BufferGeometry;
  private haloGeo: THREE.BufferGeometry;

  private mineMat: THREE.ShaderMaterial;
  private haloMat: THREE.ShaderMaterial;

  private mineInst: THREE.InstancedMesh;
  private chainInst: THREE.InstancedMesh;
  private anchorInst: THREE.InstancedMesh;
  private haloInst: THREE.InstancedMesh;

  private minePhAttr: THREE.InstancedBufferAttribute;
  private mineFadeAttr: THREE.InstancedBufferAttribute;
  private chainPhAttr: THREE.InstancedBufferAttribute;
  private chainFadeAttr: THREE.InstancedBufferAttribute;
  private anchorPhAttr: THREE.InstancedBufferAttribute;
  private anchorFadeAttr: THREE.InstancedBufferAttribute;
  private haloPhAttr: THREE.InstancedBufferAttribute;

  constructor() {
    this.group.name = "SeaMines3D";

    this.mineGeo = buildSeaMineGeometry();
    this.chainGeo = buildChainLinkGeometry();
    this.anchorGeo = buildAnchorSinkerGeometry();
    this.haloGeo = new THREE.PlaneGeometry(1, 1);

    const initFade = (geo: THREE.BufferGeometry, n: number) => {
      const phArr = new Float32Array(n);
      const fadeArr = new Float32Array(n).fill(1);
      const phAttr = new THREE.InstancedBufferAttribute(phArr, 1);
      const fadeAttr = new THREE.InstancedBufferAttribute(fadeArr, 1);
      phAttr.setUsage(THREE.DynamicDrawUsage);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aPh", phAttr);
      geo.setAttribute("aFade", fadeAttr);
      return { phAttr, fadeAttr };
    };

    const mAttr = initFade(this.mineGeo, MAX_MINES);
    this.minePhAttr = mAttr.phAttr;
    this.mineFadeAttr = mAttr.fadeAttr;

    const cAttr = initFade(this.chainGeo, MAX_LINKS);
    this.chainPhAttr = cAttr.phAttr;
    this.chainFadeAttr = cAttr.fadeAttr;

    const aAttr = initFade(this.anchorGeo, MAX_MINES);
    this.anchorPhAttr = aAttr.phAttr;
    this.anchorFadeAttr = aAttr.fadeAttr;

    const haloPhArr = new Float32Array(MAX_MINES);
    this.haloPhAttr = new THREE.InstancedBufferAttribute(haloPhArr, 1);
    this.haloPhAttr.setUsage(THREE.DynamicDrawUsage);
    this.haloGeo.setAttribute("aPh", this.haloPhAttr);

    this.mineMat = mineLitMaterial();
    this.haloMat = mineHaloMaterial();

    this.chainInst = new THREE.InstancedMesh(this.chainGeo, this.mineMat, MAX_LINKS);
    this.chainInst.frustumCulled = false;
    this.chainInst.renderOrder = 32;
    this.chainInst.count = 0;

    this.anchorInst = new THREE.InstancedMesh(this.anchorGeo, this.mineMat, MAX_MINES);
    this.anchorInst.frustumCulled = false;
    this.anchorInst.renderOrder = 33;
    this.anchorInst.count = 0;

    this.mineInst = new THREE.InstancedMesh(this.mineGeo, this.mineMat, MAX_MINES);
    this.mineInst.frustumCulled = false;
    this.mineInst.renderOrder = 34;
    this.mineInst.count = 0;

    this.haloInst = new THREE.InstancedMesh(this.haloGeo, this.haloMat, MAX_MINES);
    this.haloInst.frustumCulled = false;
    this.haloInst.renderOrder = 40;
    this.haloInst.count = 0;

    this.group.add(this.chainInst, this.anchorInst, this.mineInst, this.haloInst);
  }

  update(
    mines: readonly Mine3DData[],
    t: number,
    camLeft: number,
    camTop: number,
    vw: number,
    vh: number,
  ) {
    let mCount = 0;
    let lCount = 0;
    let aCount = 0;

    const minX = camLeft - 72;
    const maxX = camLeft + vw + 72;
    const minY = camTop - 275;
    const maxY = camTop + vh + 80;

    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (m.x < minX || m.x > maxX || m.y < minY || m.y > maxY) continue;
      if (mCount >= MAX_MINES) break;

      // 1. Live 3D Mine rotation (smooth Z spin + oceanic 3D pitch/yaw sway)
      const yaw = Math.cos(t * 0.78 + m.ph * 1.3) * 0.28 + m.rot * 0.35;
      const pitch = Math.sin(t * 1.1 + m.ph) * 0.16;
      const roll = -m.rot;
      _euler.set(pitch, yaw, roll, "YXZ");
      _quat.setFromEuler(_euler);
      _pos.set(m.x, -m.y, MINE_Z);
      _scale.setScalar(m.r);
      _mat4.compose(_pos, _quat, _scale);

      this.mineInst.setMatrixAt(mCount, _mat4);
      (this.minePhAttr.array as Float32Array)[mCount] = m.ph;
      (this.mineFadeAttr.array as Float32Array)[mCount] = 1;

      // 2. Pulsing volumetric red danger halo quad positioned behind/around ruby beacon
      const blink = 0.5 + 0.5 * Math.sin(t * 7.5 + m.ph);
      const haloSize = m.r * (4.4 + blink * 0.9);
      _pos.set(m.x, -m.y, MINE_Z + m.r * 1.5);
      _quat.identity();
      _scale.set(haloSize, haloSize, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.haloInst.setMatrixAt(mCount, _mat4);
      (this.haloPhAttr.array as Float32Array)[mCount] = m.ph;

      // 3. Exact rotated bottom swivel clevis world coordinates so chain locks onto hull
      _clevisOffset.set(0, -1.11 * m.r, 0).applyAxisAngle(_scale.set(1, 0, 0), 0);
      _euler.set(pitch, yaw, roll, "YXZ");
      _quat.setFromEuler(_euler);
      _clevisOffset.set(0, -1.11 * m.r, 0).applyQuaternion(_quat);

      const topX = m.x + _clevisOffset.x;
      const topY = -m.y + _clevisOffset.y;
      const topZ = MINE_Z + _clevisOffset.z;

      const fy = floorY(m.x);
      const chainBottomYWorld = m.baseY + m.tether;
      const anchoredOnFloor = chainBottomYWorld >= fy - 24;
      const botX = m.x;
      const botY = -(anchoredOnFloor ? fy - 4 : chainBottomYWorld);
      const botZ = MINE_Z;

      const spanY = Math.max(8, topY - botY);
      const linkHeight = m.r * 0.54;
      const pitchY = linkHeight * 0.64;
      const numLinks = Math.max(2, Math.round(spanY / pitchY));

      // Place seabed clump sinker anchor when chain reaches floor
      if (anchoredOnFloor && aCount < MAX_MINES) {
        _pos.set(botX, -fy + 1, botZ);
        _euler.set(0, m.ph * 0.7, 0);
        _quat.setFromEuler(_euler);
        _scale.setScalar(m.r * 0.95);
        _mat4.compose(_pos, _quat, _scale);
        this.anchorInst.setMatrixAt(aCount, _mat4);
        (this.anchorPhAttr.array as Float32Array)[aCount] = m.ph;
        (this.anchorFadeAttr.array as Float32Array)[aCount] = 1;
        aCount++;
      }

      // 4. Interlocking 3D Stud-Link Chain (alternating 90° flat/edge orientation along swaying curve)
      let prevPx = topX;
      let prevPy = topY;
      for (let k = 0; k < numLinks && lCount < MAX_LINKS; k++) {
        const u = (k + 0.5) / numLinks;
        const amp = Math.sin(u * Math.PI) * 3.1;
        const swayX = Math.sin(t * 1.35 + m.ph + u * 3.8) * amp;
        const px = topX + (botX - topX) * u + swayX;
        const py = topY + (botY - topY) * u;
        const pz = topZ + (botZ - topZ) * u;

        // Next point for smooth tangent tilt along Z
        const uNext = Math.min(1, (k + 1.5) / numLinks);
        const nextX =
          topX +
          (botX - topX) * uNext +
          Math.sin(t * 1.35 + m.ph + uNext * 3.8) * Math.sin(uNext * Math.PI) * 3.1;
        const nextY = topY + (botY - topY) * uNext;
        const tiltZ = Math.atan2(nextX - px, Math.max(1e-3, py - nextY));

        // Alternate 90° every consecutive link so oval loops physically interlock!
        const linkYaw = 0.34 + m.rot * 0.25 * (1 - u) + (k & 1 ? Math.PI * 0.5 : 0);
        _euler.set(0, linkYaw, tiltZ, "YXZ");
        _quat.setFromEuler(_euler);
        _pos.set(px, py, pz);
        _scale.setScalar(linkHeight);
        _mat4.compose(_pos, _quat, _scale);

        this.chainInst.setMatrixAt(lCount, _mat4);
        (this.chainPhAttr.array as Float32Array)[lCount] = m.ph;
        // Mid-water hanging chains fade gracefully into the abyssal blue at their lowest links
        const depthFade = anchoredOnFloor ? 1.0 : Math.min(1.0, (1.0 - u) * 3.6 + 0.14);
        (this.chainFadeAttr.array as Float32Array)[lCount] = depthFade;
        lCount++;

        prevPx = px;
        prevPy = py;
      }
      void prevPx;
      void prevPy;

      mCount++;
    }

    this.mineInst.count = mCount;
    this.haloInst.count = mCount;
    this.chainInst.count = lCount;
    this.anchorInst.count = aCount;

    if (mCount > 0) {
      this.mineInst.instanceMatrix.needsUpdate = true;
      this.minePhAttr.needsUpdate = true;
      this.haloInst.instanceMatrix.needsUpdate = true;
      this.haloPhAttr.needsUpdate = true;
    }
    if (lCount > 0) {
      this.chainInst.instanceMatrix.needsUpdate = true;
      this.chainFadeAttr.needsUpdate = true;
    }
    if (aCount > 0) {
      this.anchorInst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.mineGeo.dispose();
    this.chainGeo.dispose();
    this.anchorGeo.dispose();
    this.haloGeo.dispose();
    this.mineMat.dispose();
    this.haloMat.dispose();
    this.mineInst.dispose();
    this.chainInst.dispose();
    this.anchorInst.dispose();
    this.haloInst.dispose();
  }
}
