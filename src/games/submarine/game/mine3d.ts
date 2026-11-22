// ============================================================================
// 3D PBR STUDIO MINE & INTERLOCKING CHAIN SPRITE BAKER
// Renders crisp RoomEnvironment-lit 3D Naval Sea Mines, alternating 0°/90°
// stud-link chain links, and seabed clump anchors into cached sprites for when
// Dunia Laut 3D is turned off (non-pixel mode). Zero per-frame WebGL cost!
// ============================================================================
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  buildAnchorSinkerGeometry,
  buildChainLinkGeometry,
  buildSeaMineGeometry,
} from "./mineGeo";

export interface Mine3DSprites {
  mineFrames: HTMLCanvasElement[];
  chainFlat: HTMLCanvasElement;
  chainEdge: HTMLCanvasElement;
  anchor: HTMLCanvasElement;
}

let cachedSprites: Mine3DSprites | null = null;
let attempted = false;

/** Converts a PaintedPart BufferGeometry (with aCol/aMet/aAO/aPart) into standard vertex-colored PBR geometry */
function toVertexColorPBR(src: THREE.BufferGeometry, partFilter?: (p: number) => boolean) {
  const pos = src.getAttribute("position");
  const norm = src.getAttribute("normal");
  const aCol = src.getAttribute("aCol");
  const aAO = src.getAttribute("aAO");
  const aPart = src.getAttribute("aPart");
  const srcIdx = src.index;

  const outIdx: number[] = [];
  if (srcIdx && partFilter) {
    for (let i = 0; i < srcIdx.count; i += 3) {
      const a = srcIdx.getX(i);
      if (partFilter(aPart.getX(a))) {
        outIdx.push(a, srcIdx.getX(i + 1), srcIdx.getX(i + 2));
      }
    }
  } else if (srcIdx) {
    for (let i = 0; i < srcIdx.count; i++) outIdx.push(srcIdx.getX(i));
  }

  const colArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ao = aAO ? aAO.getX(i) : 1;
    const aoSoft = 0.3 + 0.7 * ao;
    colArr[i * 3] = Math.min(1, Math.pow(aCol.getX(i), 0.92) * aoSoft);
    colArr[i * 3 + 1] = Math.min(1, Math.pow(aCol.getY(i), 0.92) * aoSoft);
    colArr[i * 3 + 2] = Math.min(1, Math.pow(aCol.getZ(i), 0.92) * aoSoft);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", pos.clone());
  g.setAttribute("normal", norm.clone());
  g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  if (outIdx.length > 0) g.setIndex(outIdx);
  return g;
}

function captureCanvas(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  cam: THREE.OrthographicCamera,
  sizeW: number,
  sizeH: number,
): HTMLCanvasElement {
  renderer.setSize(sizeW, sizeH, false);
  renderer.clear();
  renderer.render(scene, cam);
  const out = document.createElement("canvas");
  out.width = sizeW;
  out.height = sizeH;
  const ctx = out.getContext("2d");
  if (ctx) ctx.drawImage(renderer.domElement, 0, 0);
  return out;
}

export function getMine3DSprites(): Mine3DSprites | null {
  if (cachedSprites) return cachedSprites;
  if (attempted) return null;
  attempted = true;

  let renderer: THREE.WebGLRenderer | null = null;
  let envRT: THREE.WebGLRenderTarget | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;

  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;
    renderer.setClearColor(0x000000, 0);

    pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnv, 0.04);
    roomEnv.dispose();

    const scene = new THREE.Scene();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.3;

    const key = new THREE.DirectionalLight(0xfff4e0, 2.35);
    key.position.set(-2.5, 4.0, 3.5);
    const fill = new THREE.DirectionalLight(0x8be2ff, 1.15);
    fill.position.set(3.0, -2.0, 2.0);
    const rim = new THREE.DirectionalLight(0xbef9ff, 1.45);
    rim.position.set(0.0, 2.5, -4.0);
    scene.add(key, fill, rim);

    const metalMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.78,
      envMapIntensity: 1.45,
    });

    const rubyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xef2323),
      emissive: new THREE.Color(0x7f1111),
      emissiveIntensity: 0.85,
      roughness: 0.14,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });

    const rawMine = buildSeaMineGeometry();
    const mineMetalGeo = toVertexColorPBR(rawMine, (p) => p < 0.4);
    const mineRubyGeo = toVertexColorPBR(rawMine, (p) => p >= 0.4);
    rawMine.dispose();

    const mineGroup = new THREE.Group();
    mineGroup.add(new THREE.Mesh(mineMetalGeo, metalMat));
    mineGroup.add(new THREE.Mesh(mineRubyGeo, rubyMat));
    scene.add(mineGroup);

    const mineCam = new THREE.OrthographicCamera(-1.62, 1.62, 1.62, -1.62, 0.1, 20);
    mineCam.position.set(0, 0, 5);
    mineCam.lookAt(0, 0, 0);

    const mineFrames: HTMLCanvasElement[] = [];
    const N_FRAMES = 24;
    for (let i = 0; i < N_FRAMES; i++) {
      const a = (i / N_FRAMES) * Math.PI * 2;
      mineGroup.rotation.set(Math.sin(a * 2) * 0.14, a * 0.5, a, "YXZ");
      mineFrames.push(captureCanvas(renderer, scene, mineCam, 112, 112));
    }
    scene.remove(mineGroup);

    // Chain links (flat + 90° edge)
    const rawChain = buildChainLinkGeometry();
    const chainGeo = toVertexColorPBR(rawChain);
    rawChain.dispose();
    const chainMesh = new THREE.Mesh(chainGeo, metalMat);
    scene.add(chainMesh);

    const chainCam = new THREE.OrthographicCamera(-0.44, 0.44, 0.62, -0.62, 0.1, 20);
    chainCam.position.set(0, 0, 5);
    chainMesh.rotation.set(0, 0.34, 0);
    const chainFlat = captureCanvas(renderer, scene, chainCam, 40, 56);
    chainMesh.rotation.set(0, 0.34 + Math.PI * 0.5, 0);
    const chainEdge = captureCanvas(renderer, scene, chainCam, 40, 56);
    scene.remove(chainMesh);

    // Seabed clump anchor sinker
    const rawAnchor = buildAnchorSinkerGeometry();
    const anchorGeo = toVertexColorPBR(rawAnchor);
    rawAnchor.dispose();
    const anchorMesh = new THREE.Mesh(anchorGeo, metalMat);
    anchorMesh.position.set(0, -0.5, 0);
    anchorMesh.rotation.set(0.18, 0.4, 0);
    scene.add(anchorMesh);
    const anchorCam = new THREE.OrthographicCamera(-1.1, 1.1, 0.9, -0.9, 0.1, 20);
    anchorCam.position.set(0, 0, 5);
    const anchor = captureCanvas(renderer, scene, anchorCam, 72, 60);
    scene.remove(anchorMesh);

    mineMetalGeo.dispose();
    mineRubyGeo.dispose();
    chainGeo.dispose();
    anchorGeo.dispose();
    metalMat.dispose();
    rubyMat.dispose();

    cachedSprites = { mineFrames, chainFlat, chainEdge, anchor };
    return cachedSprites;
  } catch {
    return null;
  } finally {
    envRT?.dispose();
    pmrem?.dispose();
    try {
      renderer?.dispose();
      renderer?.forceContextLoss();
    } catch {
      /* ignore */
    }
  }
}
