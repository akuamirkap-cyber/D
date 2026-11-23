import * as THREE from "three";
import type { Species } from "./species";
import {
  addToothConeRow,
  baseGroups,
  blendBotToPalate,
  bodySpineOutlineMask,
  buildLoftedSurface,
  buildOutlineGeometry,
  buildSlicedHeadBody,
  clamp,
  computeEyeZ,
  createBiteRing,
  createEyePair,
  createOralParts,
  createRigContext,
  createWorldMapper,
  drawBlob,
  drawFinRays,
  drawGlow,
  injectSpineShader,
  interpCurveY,
  jawOutlineMask,
  makeLin,
  makeSpineFinMesh,
  mixHex,
  mouthSeamOutlineMask,
  rgbaHex,
  sampleBezierChain,
  smoothstep,
  surfaceZAt,
} from "./fish3dShared";
import type { Fish3DRig, Pt } from "./fish3dShared";

function sortAscX(pts: Pt[]): Pt[] {
  return [...pts].sort((a, b) => a[0] - b[0]);
}

function makeTeethMat(track: <T extends { dispose: () => void }>(x: T) => T) {
  return track(
    new THREE.MeshPhysicalMaterial({
      color: "#fffcf2",
      emissive: "#fffcf2",
      emissiveIntensity: 0.14,
      roughness: 0.48,
      clearcoat: 0.06,
      envMapIntensity: 0.08,
    })
  );
}

// =====================================================================================
// 1. MINNOW & FRY (Hiromi Teri, Sarden, Ekor Kuning, Ikan Lentera)
// =====================================================================================
function createMinnow3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#13474d";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || pal.fin;
  const STR = pal.stripe;
  const LURE = pal.lure;
  const isLentera = !!LURE;
  const isPoison = !!sp.poisonous;

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.335;
  const xHead = 0.258;
  const xSnout = 0.365;
  const tipY = -0.002;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.036],
          [-0.23, 0.088],
          [-0.08, 0.148],
          [0.08, 0.16],
        ],
        [
          [0.08, 0.16],
          [0.19, 0.14],
          [0.29, 0.082],
          [xSnout, tipY],
        ],
      ],
      20
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.036],
          [-0.23, -0.082],
          [-0.08, -0.136],
          [0.08, -0.146],
        ],
        [
          [0.08, -0.146],
          [0.19, -0.125],
          [0.29, -0.068],
          [xSnout, tipY],
        ],
      ],
      20
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.086 * Math.sin(Math.pow(clamp(t, 0, 1), 0.78) * Math.PI);
    const cheek = x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.24, 0.62, 1) : base;
    const noseStart = 0.275;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.4, -0.18, 0.18, 512);

  // Paint counter-shaded anchovy/fry coat in 2D space matching sprites.ts
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.16, 0, 0.16, [
    [0, D],
    [0.32, B],
    [0.72, mixHex(B, BEL, 0.55)],
    [1, BEL],
  ]);
  bc.fillRect(-0.4, -0.22, 0.85, 0.44);

  // Counter-shading dark back + silver specular sheen
  bc.fillStyle = makeLin(bc, 0, -0.16, 0, 0.02, [
    [0, rgbaHex(D, 0.82)],
    [1, rgbaHex(D, 0)],
  ]);
  bc.fillRect(-0.4, -0.2, 0.85, 0.22);
  drawGlow(bc, 0.04, -0.06, 0.22, 0.045, -0.06, isPoison ? "182,255,64" : "255,255,255", isPoison ? 0.2 : 0.14);

  if (isPoison) {
    // Distinct green & brown poisonous markings: brown saddle blotches + toxic lime lateral mottling
    bc.fillStyle = rgbaHex(D, 0.78);
    for (const [bx0, by0, rx0, ry0, rot0] of [
      [-0.22, -0.07, 0.055, 0.068, 0.18],
      [-0.07, -0.085, 0.064, 0.078, -0.1],
      [0.08, -0.082, 0.058, 0.072, 0.12],
      [0.2, -0.055, 0.042, 0.05, -0.14],
    ]) {
      drawBlob(bc, bx0, by0, rx0, ry0, rot0);
    }
    bc.strokeStyle = rgbaHex(STR || D, 0.72);
    bc.lineWidth = 0.028;
    bc.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const sx0 = -0.21 + i * 0.105;
      bc.beginPath();
      bc.moveTo(sx0, -0.12);
      bc.quadraticCurveTo(sx0 - 0.024, 0.0, sx0 + 0.014, 0.095);
      bc.stroke();
    }
    // Toxic green venom spots with brown halos
    for (let i = 0; i < 7; i++) {
      const sx0 = -0.24 + i * 0.068;
      const sy0 = -0.015 + Math.sin(i * 1.45) * 0.036;
      bc.fillStyle = rgbaHex(D, 0.75);
      drawBlob(bc, sx0, sy0, 0.021, 0.024, 0.1);
      bc.fillStyle = rgbaHex(pal.spot || "#9ef01a", 0.94);
      drawBlob(bc, sx0, sy0, 0.013, 0.015, 0.1);
    }
  } else {
    // Bright silver/yellow/cyan lateral band matching sprites.ts
    bc.strokeStyle = STR ? rgbaHex(STR, isLentera ? 0.92 : 0.94) : "rgba(232, 255, 255, 0.86)";
    bc.lineWidth = 0.046;
    bc.lineCap = "round";
    bc.beginPath();
    bc.moveTo(-0.33, 0.008);
    bc.quadraticCurveTo(0.0, -0.015, 0.22, 0.004);
    bc.stroke();

    // Minnow lateral teal spots (Hiromi Teri)
    if (sp.spots && pal.spot) {
      bc.fillStyle = rgbaHex(pal.spot, 0.72);
      for (let i = 0; i < 6; i++) {
        drawBlob(bc, -0.2 + i * 0.062, -0.01 + Math.sin(i * 0.95) * 0.014, 0.012, 0.019, 0.12);
      }
    }
  }

  // Gill operculum crease + cheek gleam
  bc.strokeStyle = rgbaHex(D, 0.72);
  bc.lineWidth = 0.0068;
  bc.beginPath();
  bc.moveTo(0.185, -0.055);
  bc.quadraticCurveTo(0.155, 0.01, 0.135, 0.08);
  bc.stroke();
  bc.strokeStyle = "rgba(255, 245, 210, 0.35)";
  bc.lineWidth = 0.0042;
  bc.beginPath();
  bc.moveTo(0.195, -0.05);
  bc.quadraticCurveTo(0.165, 0.01, 0.145, 0.075);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const hx = xHead;
  const hy = -0.024;
  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.004 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 54,
    vSteps: 28,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(
    bodyTex,
    isLentera ? { emissiveIntensity: 0.34 } : isPoison ? { emissiveIntensity: 0.16 } : undefined
  );
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const minnowSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.125, x1: 0.075, top: true },
      { x0: -0.23, x1: -0.12, top: false },
      { x0: -0.035, x1: 0.055, top: false },
    ],
    0.024
  );
  const minnowSeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const minnowMask = (x: number, y: number, z: number) => minnowSpineMask(x, y, z) * minnowSeamMask(x, y, z);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, minnowMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(
    bodyTex,
    isLentera ? { emissiveIntensity: 0.34 } : isPoison ? { emissiveIntensity: 0.16 } : undefined
  );
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0036, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.012,
    hy + 0.002,
    "#521022",
    "#ec6b8e",
    [0.028, 0.022, 0.018],
    [0.022, 0.008, 0.013],
    0.032
  );

  // Forked V-Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.032);
  tailShape.quadraticCurveTo(-0.088, 0.116, -0.185, 0.165);
  tailShape.quadraticCurveTo(-0.125, 0.05, -0.068, 0);
  tailShape.quadraticCurveTo(-0.125, -0.05, -0.185, -0.165);
  tailShape.quadraticCurveTo(-0.088, -0.116, 0.01, -0.032);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(TAIL, D, 0.35)],
        [0.55, TAIL],
        [1, mixHex(TAIL, "#ffffff", 0.48)],
      ]);
      fc.fillRect(b.minX - 0.1, b.minY - 0.1, 0.5, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.175, 0.145],
          [-0.15, 0.092],
          [-0.11, 0.042],
          [-0.072, 0],
          [-0.11, -0.042],
          [-0.15, -0.092],
          [-0.175, -0.145],
        ],
        rgbaHex(D, 0.36),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.0011,
    isLentera ? { emissiveIntensity: 0.44 } : undefined
  );
  tailPivot.add(tailFin.mesh);

  // Swept Dorsal Fin
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.075, 0.122);
  dorsalShape.lineTo(-0.018, 0.268);
  dorsalShape.quadraticCurveTo(-0.065, 0.185, -0.125, 0.118);
  dorsalShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0009,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.minY, 0, b.maxY, [
          [0, mixHex(FIN, D, 0.35)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.3, -0.1, 0.6, 0.5);
        drawFinRays(
          fc,
          [-0.02, 0.11],
          [
            [-0.015, 0.255],
            [-0.045, 0.22],
            [-0.082, 0.178],
          ],
          rgbaHex(D, 0.36),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Rear Anal Fin & Mid Pelvic Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.12, -0.095);
  analShape.lineTo(-0.185, -0.195);
  analShape.quadraticCurveTo(-0.21, -0.12, -0.23, -0.072);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.35)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.5);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.055, -0.115);
  pelvShape.lineTo(-0.02, -0.202);
  pelvShape.lineTo(-0.035, -0.112);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0025,
      0.0008,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#ffffff", 0.38)],
        ]);
        fc.fillRect(-0.2, -0.4, 0.4, 0.5);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.016, y)
    ).mesh
  );

  // Paired Pectoral Fins
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.01);
  pecShape.bezierCurveTo(-0.04, 0.04, -0.112, 0.022, -0.106, -0.016);
  pecShape.bezierCurveTo(-0.088, -0.046, -0.025, -0.038, 0, -0.014);
  pecShape.closePath();
  const pecMatObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.14,
    -0.055,
    0.0024,
    0.0007,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.45)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.5, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecZMinnow =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      0.145,
      -0.055,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.145, -0.055, pecZMinnow);
  pecLeft.add(pecMatObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.145, -0.055, -pecZMinnow);
  pecRight.add(pecMatObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  // Bioluminescent Photophores for Ikan Lentera
  if (LURE) {
    const glowMat = track(
      new THREE.MeshBasicMaterial({
        color: LURE,
        transparent: true,
        opacity: 0.92,
      })
    );
    const orbGeo = track(new THREE.SphereGeometry(0.011, 10, 10));
    for (let i = 0; i < 5; i++) {
      const px = -0.18 + i * 0.088;
      const py = interpCurveY(botPts, px) + 0.024;
      const pz = evalZ(px, (px - xTail) / (xSnout - xTail)) * 0.94;
      for (const s of [1, -1]) {
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(px, py, s * pz);
        bodyGroup.add(orb);
      }
    }
  }

  // Glowing 3D venom nodules along upper flank for poisonous fish
  if (isPoison) {
    const toxMat = track(
      new THREE.MeshStandardMaterial({
        color: "#a3e635",
        emissive: "#65a30d",
        emissiveIntensity: 0.72,
        roughness: 0.28,
        metalness: 0.08,
      })
    );
    injectSpineShader(toxMat, uniforms, 0, 0);
    const nodeGeo = track(new THREE.SphereGeometry(0.013, 10, 10));
    const nodes = [
      [-0.14, 0.072, 1.0],
      [-0.04, 0.095, 1.12],
      [0.06, 0.088, 1.05],
      [0.14, 0.062, 0.9],
    ];
    for (let i = 0; i < nodes.length; i++) {
      const [nx, ny, ns] = nodes[i];
      const nz = evalZ(nx, (nx - xTail) / (xSnout - xTail)) * 0.92;
      for (const s of [1, -1]) {
        const node = new THREE.Mesh(nodeGeo, toxMat);
        node.position.set(nx, ny, s * nz);
        node.scale.setScalar(ns);
        bodyGroup.add(node);
      }
    }
  }

  const minnowEz = surfaceZAt(
    evalTop,
    evalBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.252,
    0.022
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.252,
    ey: 0.022,
    ez: minnowEz,
    er: 0.044,
    irisColor: pal.iris || "#1e56a0",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(
    ctx,
    bodyGroup,
    xSnout + 0.022,
    0,
    LURE || "#d8f8ff",
    0.042
  );

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 2. PIERRE (Kerapu Bintik — Blue Grouper with Pale-Haloed Spots & Spiny Dorsal Crest)
// =====================================================================================
function createPierre3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#142563";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const SPOT = pal.spot || "#f5fbff";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.242;
  const xSnout = 0.36;
  const tipY = -0.01;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.044],
          [-0.21, 0.125],
          [-0.06, 0.195],
          [0.08, 0.2],
        ],
        [
          [0.08, 0.2],
          [0.2, 0.182],
          [0.29, 0.118],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.044],
          [-0.21, -0.118],
          [-0.06, -0.182],
          [0.08, -0.188],
        ],
        [
          [0.08, -0.188],
          [0.2, -0.168],
          [0.29, -0.105],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.028 + 0.118 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheek = x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.26, 0.68, 1) : base;
    const noseStart = 0.268;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.4, -0.22, 0.22, 512);

  // Paint Blue Grouper Body + 30 Dark-Haloed Ivory Spots matching sprites.ts
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.2, 0, 0.2, [
    [0, D],
    [0.32, B],
    [0.72, mixHex(B, BEL, 0.46)],
    [1, BEL],
  ]);
  bc.fillRect(-0.42, -0.26, 0.88, 0.52);

  // Forehead & shoulder specular glow
  drawGlow(bc, 0.04, -0.09, 0.2, 0.06, -0.15, "255,255,255", 0.14);

  // 30 signature haloed coral-grouper spots across head & flank
  for (let i = 0; i < 30; i++) {
    const sx = -0.26 + ((i * 0.7548776662 + 0.31) % 1) * 0.52;
    const sy = -0.14 + ((i * 0.5698402909 + 0.17) % 1) * 0.26;
    const r = 0.011 + (i % 3) * 0.0028;
    bc.fillStyle = rgbaHex(D, 0.48);
    bc.beginPath();
    bc.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
    bc.fill();
    bc.fillStyle = rgbaHex(SPOT, 0.94);
    bc.beginPath();
    bc.arc(sx, sy, r, 0, Math.PI * 2);
    bc.fill();
  }

  // Gill operculum curve + inner highlight
  bc.strokeStyle = rgbaHex(OL, 0.65);
  bc.lineWidth = 0.0072;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.155, -0.072);
  bc.quadraticCurveTo(0.122, 0.01, 0.088, 0.095);
  bc.stroke();
  bc.strokeStyle = "rgba(255, 240, 195, 0.35)";
  bc.lineWidth = 0.0042;
  bc.beginPath();
  bc.moveTo(0.165, -0.068);
  bc.quadraticCurveTo(0.132, 0.01, 0.098, 0.09);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const hx = xHead;
  const hy = -0.038;
  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.005 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.005,
    uSteps: 56,
    vSteps: 30,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const pierreSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.295, x1: 0.115, top: true },
      { x0: -0.272, x1: -0.075, top: false },
      { x0: 0.002, x1: hx - 0.002, top: false },
    ],
    0.028
  );
  const pierreSeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const pierreMask = (x: number, y: number, z: number) => pierreSpineMask(x, y, z) * pierreSeamMask(x, y, z);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, pierreMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0038, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.012,
    hy + 0.002,
    "#5c1226",
    "#ee6a8e",
    [0.034, 0.028, 0.022],
    [0.026, 0.01, 0.016],
    0.036
  );

  // Rounded Spotted Broom Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.012, 0.042);
  tailShape.bezierCurveTo(-0.052, 0.128, -0.148, 0.145, -0.18, 0.068);
  tailShape.quadraticCurveTo(-0.205, 0, -0.18, -0.068);
  tailShape.bezierCurveTo(-0.148, -0.145, -0.052, -0.128, 0.012, -0.042);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0038,
    0.001,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(FIN, D, 0.35)],
        [0.6, FIN],
        [1, mixHex(FIN, "#ffffff", 0.35)],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.175, 0.095],
          [-0.185, 0.052],
          [-0.19, 0],
          [-0.185, -0.052],
          [-0.175, -0.095],
        ],
        rgbaHex(D, 0.35),
        0.0036
      );
      fc.fillStyle = rgbaHex(SPOT, 0.9);
      for (let i = 0; i < 9; i++) {
        const sx = -0.045 - (i % 3) * 0.048;
        const sy = (-0.06 + Math.floor(i / 3) * 0.06) * (0.65 + (i % 3) * 0.22);
        fc.beginPath();
        fc.arc(sx, sy, 0.009, 0, Math.PI * 2);
        fc.fill();
      }
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // 7-Spine Serrated Front Dorsal Crest + Rounded Soft Rear Lobe
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.115, 0.145);
  for (let i = 0; i < 7; i++) {
    const sx = 0.095 - i * 0.036;
    const sy = 0.252 - Math.abs(i - 2) * 0.006;
    dorsalShape.lineTo(sx, sy);
    dorsalShape.lineTo(sx - 0.02, sy - 0.042);
  }
  dorsalShape.bezierCurveTo(-0.21, 0.275, -0.295, 0.242, -0.295, 0.125);
  dorsalShape.quadraticCurveTo(-0.295, 0.068, -0.268, 0.028);
  dorsalShape.lineTo(-0.08, 0.125);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0038,
      0.001,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.minY, 0, b.maxY, [
          [0, mixHex(FIN, D, 0.38)],
          [1, mixHex(FIN, "#ffffff", 0.36)],
        ]);
        fc.fillRect(-0.5, -0.1, 0.8, 0.5);
        const rTips: Pt[] = [];
        for (let i = 0; i < 11; i++) rTips.push([0.085 - i * 0.036, 0.245]);
        drawFinRays(fc, [-0.08, 0.1], rTips, rgbaHex(D, 0.34), 0.0035);
        fc.fillStyle = rgbaHex(SPOT, 0.86);
        for (let i = 0; i < 6; i++) {
          fc.beginPath();
          fc.arc(0.055 - i * 0.058, 0.195 - (i % 2) * 0.025, 0.0085, 0, Math.PI * 2);
          fc.fill();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Rounded Spotted Anal Fin + Pelvic Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.075, -0.148);
  analShape.bezierCurveTo(-0.125, -0.258, -0.255, -0.245, -0.272, -0.135);
  analShape.lineTo(-0.245, -0.042);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0035,
      0.001,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.38)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.5, -0.4, 0.6, 0.5);
        drawFinRays(
          fc,
          [-0.14, -0.09],
          [
            [-0.11, -0.22],
            [-0.16, -0.23],
            [-0.21, -0.21],
            [-0.25, -0.16],
          ],
          rgbaHex(D, 0.34),
          0.0034
        );
        fc.fillStyle = rgbaHex(SPOT, 0.86);
        for (const [sx, sy] of [
          [-0.14, -0.18],
          [-0.19, -0.19],
          [-0.23, -0.15],
        ]) {
          fc.beginPath();
          fc.arc(sx, sy, 0.008, 0, Math.PI * 2);
          fc.fill();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.095, -0.158);
  pelvShape.quadraticCurveTo(0.088, -0.255, -0.005, -0.238);
  pelvShape.quadraticCurveTo(0.002, -0.185, 0.028, -0.162);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.32)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.2, -0.4, 0.4, 0.4);
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.048, 0.056, -0.132, 0.026, -0.125, -0.02);
  pecShape.bezierCurveTo(-0.105, -0.06, -0.032, -0.048, 0, -0.016);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.095,
    -0.068,
    0.003,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.4)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.5, 0.4);
      fc.fillStyle = rgbaHex(SPOT, 0.85);
      for (const [sx, sy] of [
        [-0.045, 0.006],
        [-0.075, -0.012],
        [-0.092, 0.01],
      ]) {
        fc.beginPath();
        fc.arc(sx, sy, 0.0065, 0, Math.PI * 2);
        fc.fill();
      }
    },
    maxAnisotropy,
    false,
    0.0012
  );
  const pecZPierre =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      0.095,
      -0.068,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.095, -0.068, pecZPierre);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.095, -0.068, -pecZPierre);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pierreEz = surfaceZAt(
    evalTop,
    evalBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.228,
    0.042
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.228,
    ey: 0.042,
    ez: pierreEz,
    er: 0.046,
    irisColor: pal.iris || "#d9920f",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#d8ecff", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.014,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.86 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.25;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.88, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 3. LEON LEPU (Lionfish — Golden Underbite Snout, 10 Feathered Spines, Banded Wing Fan)
// =====================================================================================
function createLeon3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#262004";
  const GLD = "#e5ba14";
  const GLD_HI = "#f8df44";
  const OLV = "#7d6406";
  const DK = "#322804";
  const MINT = "#c8ddc6";
  const MINT_L = "#e4efe0";
  const CREAM = "#f6f3cc";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawLeon 2D offset c.translate(-0.015, 0.02) in +Y-down -> y3 = -(y2 + 0.02)
  const ox2 = -0.015;
  const oy2 = 0.02;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.23; // -0.215 - 0.015
  const hx = 0.253; // 0.268 - 0.015
  const hy = -0.078; // -(0.058 + 0.02)
  const ux3 = 0.339; // 0.354 - 0.015
  const lx3 = 0.367; // 0.382 - 0.015 (protruding golden lower jaw underbite!)

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.215, -0.028), to3D(-0.14, -0.028), to3D(-0.09, -0.068), to3D(-0.01, -0.132)],
        [to3D(-0.01, -0.132), to3D(0.085, -0.165), to3D(0.185, -0.138), to3D(0.246, -0.085)],
        [to3D(0.246, -0.085), to3D(0.268, -0.062), to3D(0.292, -0.028), to3D(0.312, 0.004)],
        [to3D(0.312, 0.004), to3D(0.336, 0.028), to3D(0.348, 0.042), to3D(0.354, 0.052)],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.215, 0.044), to3D(-0.175, 0.05), to3D(-0.115, 0.068), to3D(-0.035, 0.1)],
        [to3D(-0.035, 0.1), to3D(0.05, 0.132), to3D(0.135, 0.15), to3D(0.225, 0.138)],
        [to3D(0.225, 0.138), to3D(0.295, 0.128), to3D(0.355, 0.105), to3D(0.386, 0.092)],
      ],
      22
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (lx3 - xTail), 0, 1);
    const base = 0.02 + 0.095 * Math.sin(Math.pow(t, 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.44, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.27, 0.41, -0.18, 0.18, 512);

  // Paint Golden-Olive Zebra Lionfish Skin matching drawLeon
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = makeLin(bc, 0.04, -0.16, 0.04, 0.15, [
    [0, "#a88208"],
    [0.24, GLD_HI],
    [0.58, GLD],
    [0.86, "#8a6804"],
    [1, "#4e3e02"],
  ]);
  bc.fillRect(-0.35, -0.25, 0.85, 0.5);

  drawGlow(bc, 0.06, -0.02, 0.22, 0.11, -0.08, "255,230,90", 0.34);

  // Trunk zebra stripes (cream-lemon & deep olive)
  const flankStripes = [
    { x: 0.155, w: 0.018, c: CREAM, a: 0.86, bend: 0.014 },
    { x: 0.115, w: 0.02, c: OLV, a: 0.42, bend: 0.014 },
    { x: 0.072, w: 0.022, c: CREAM, a: 0.9, bend: 0.012 },
    { x: 0.028, w: 0.02, c: OLV, a: 0.42, bend: 0.008 },
    { x: -0.018, w: 0.02, c: CREAM, a: 0.88, bend: 0.004 },
    { x: -0.065, w: 0.02, c: OLV, a: 0.42, bend: -0.004 },
    { x: -0.108, w: 0.016, c: CREAM, a: 0.82, bend: -0.008 },
    { x: -0.158, w: 0.014, c: CREAM, a: 0.76, bend: -0.01 },
  ];
  for (const s of flankStripes) {
    bc.beginPath();
    bc.moveTo(s.x, -0.18);
    bc.quadraticCurveTo(s.x + s.bend, 0.0, s.x - 0.01, 0.18);
    bc.strokeStyle = rgbaHex(s.c, s.a);
    bc.lineWidth = s.w;
    bc.stroke();
  }

  // Snout & cheek diagonal stripes
  const headStripes = [
    [0.328, -0.01, 0.285, 0.11],
    [0.302, -0.04, 0.258, 0.125],
    [0.274, -0.07, 0.228, 0.138],
    [0.242, -0.085, 0.205, 0.14],
  ];
  for (const [x0, y0, x1, y1] of headStripes) {
    bc.beginPath();
    bc.moveTo(x0, y0);
    bc.quadraticCurveTo((x0 + x1) * 0.5 + 0.012, (y0 + y1) * 0.5, x1, y1);
    bc.strokeStyle = rgbaHex("#e6ebbb", 0.78);
    bc.lineWidth = 0.01;
    bc.stroke();
  }

  // Protruding golden lower lip cushion highlight
  bc.beginPath();
  bc.moveTo(0.285, 0.056);
  bc.quadraticCurveTo(0.34, 0.052, 0.382, 0.066);
  bc.quadraticCurveTo(0.345, 0.088, 0.285, 0.08);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.285, 0.056, 0.382, 0.088, [
    [0, "#c89608"],
    [0.5, "#f7dc44"],
    [1, "#e8b410"],
  ]);
  bc.fill();
  bc.strokeStyle = rgbaHex(DK, 0.55);
  bc.lineWidth = 0.0042;
  bc.stroke();

  // Operculum curve & cheek rim
  bc.beginPath();
  bc.moveTo(0.195, -0.035);
  bc.bezierCurveTo(0.168, 0.02, 0.18, 0.095, 0.228, 0.132);
  bc.strokeStyle = rgbaHex(DK, 0.75);
  bc.lineWidth = 0.0072;
  bc.stroke();
  bc.beginPath();
  bc.moveTo(0.204, -0.025);
  bc.bezierCurveTo(0.18, 0.025, 0.192, 0.092, 0.232, 0.122);
  bc.strokeStyle = rgbaHex("#f5eea8", 0.58);
  bc.lineWidth = 0.004;
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (ux3 - (hx - 0.012)), 0, 1);
    return hy - 0.010 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.056, 0.016);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 48,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const leonMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.16, x1: 0.19, top: true },
      { x0: -0.16, x1: -0.075, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, leonMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 20,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (lx3 - (hx - 0.012)), 0, 1);
        return hy - 0.006 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const teethMat = makeTeethMat(track);
  addToothConeRow(
    bodyGroup,
    track,
    5,
    hx + 0.018,
    ux3 - 0.008,
    (t) => {
      const x = hx + 0.018 + (ux3 - 0.008 - (hx + 0.018)) * t;
      return evalUpperPalate(x) - 0.001;
    },
    (t) => 0.018 * (1 - t * 0.45),
    0.0028,
    0.009,
    false,
    teethMat
  );
  addToothConeRow(
    lowerJawGroup,
    track,
    5,
    0.018,
    lx3 - hx - 0.01,
    (t) => {
      const x = hx + 0.018 + (lx3 - 0.01 - (hx + 0.018)) * t;
      const lt = clamp((x - (hx - 0.012)) / (lx3 - (hx - 0.012)), 0, 1);
      return -0.006 * lt + 0.002;
    },
    (t) => 0.018 * (1 - t * 0.45),
    0.003,
    0.01,
    true,
    teethMat
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#520e1e",
    "#d94f78",
    [0.044, 0.036, 0.028],
    [0.032, 0.012, 0.018],
    0.042
  );

  // 10 Slender Banded Dorsal Spines with Sage-Mint Feather Pennants (exact drawLeon geometry!)
  const nSp = 10;
  for (let i = 0; i < nSp; i++) {
    const f = i / (nSp - 1);
    const [rx, ry] = to3D(0.205 - f * 0.24, -0.105 - Math.sin(f * Math.PI * 0.85) * 0.042 + f * 0.045);
    const ang3 = Math.PI * (0.38 + f * 0.3);
    const spLen = 0.215 + Math.sin(f * Math.PI * 0.9) * 0.095 - f * 0.035;
    const bend = 0.012 + f * 0.028;
    const midX = rx + Math.cos(ang3) * spLen * 0.56 - bend * 0.15;
    const midY = ry + Math.sin(ang3) * spLen * 0.56;
    const tipX = rx + Math.cos(ang3) * spLen - bend;
    const tipY = ry + Math.sin(ang3) * spLen - f * 0.012;

    const dx = tipX - midX;
    const dy = tipY - midY;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const bx = -uy;
    const by = ux;
    const sign = bx < 0 ? 1 : -1;
    const nx = bx * sign;
    const ny = by * sign;

    const spineShape = new THREE.Shape();
    spineShape.moveTo(rx - nx * 0.004, ry - 0.015);
    spineShape.quadraticCurveTo(midX - nx * 0.004, midY, tipX, tipY);
    spineShape.lineTo(tipX + nx * 0.034 + ux * 0.008, tipY + ny * 0.034 + uy * 0.008);
    spineShape.lineTo(tipX - ux * 0.018 + nx * 0.02, tipY - uy * 0.018 + ny * 0.02);
    spineShape.lineTo(tipX - ux * 0.032 + nx * 0.028, tipY - uy * 0.032 + ny * 0.028);
    spineShape.lineTo(midX + nx * 0.006, midY + ny * 0.006);
    spineShape.lineTo(rx + nx * 0.005, ry - 0.015);
    spineShape.closePath();

    bodyGroup.add(
      makeSpineFinMesh(
        ctx,
        spineShape,
        0,
        0,
        0.0022,
        0.0006,
        (fc, b) => {
          // Mint feather pennant gradient
          fc.fillStyle = makeLin(fc, rx, ry, tipX, tipY, [
            [0, rgbaHex(MINT, 0.88)],
            [0.65, rgbaHex(MINT_L, 0.92)],
            [1, "#d6e6d4"],
          ]);
          fc.fillRect(b.minX - 0.1, b.minY - 0.1, 0.5, 0.6);
          // Banded spine shaft along leading spine edge
          fc.beginPath();
          fc.moveTo(rx, ry - 0.01);
          fc.quadraticCurveTo(midX, midY, tipX, tipY);
          fc.strokeStyle = "#8c8b52";
          fc.lineWidth = 0.0095;
          fc.stroke();
          fc.setLineDash([0.014, 0.016]);
          fc.strokeStyle = rgbaHex(DK, 0.85);
          fc.lineWidth = 0.0088;
          fc.stroke();
          fc.setLineDash([]);
        },
        maxAnisotropy,
        true,
        0.0009,
        undefined,
        (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
      ).mesh
    );
  }

  // Soft Spotted Rear Dorsal & Tucked Anal Fin
  const rearDShape = new THREE.Shape();
  rearDShape.moveTo(...to3D(-0.04, -0.065));
  rearDShape.quadraticCurveTo(...to3D(-0.095, -0.18), ...to3D(-0.145, -0.175));
  rearDShape.bezierCurveTo(...to3D(-0.155, -0.11), ...to3D(-0.145, -0.05), ...to3D(-0.145, -0.015));
  rearDShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      rearDShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.07, 0.02, -0.15, 0.16, [
          [0, "#c2b850"],
          [0.5, MINT],
          [1, MINT_L],
        ]);
        fc.fillRect(-0.4, -0.1, 0.6, 0.4);
        fc.fillStyle = rgbaHex("#424b28", 0.6);
        for (let r = 0; r < 3; r++) {
          for (let k = 0; k < 3; k++) {
            drawBlob(fc, -0.09 - r * 0.024, 0.05 + k * 0.028 + r * 0.012, 0.0045, 0.0035, 0);
          }
        }
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(-0.06, 0.08));
  analShape.quadraticCurveTo(...to3D(-0.095, 0.145), ...to3D(-0.135, 0.145));
  analShape.quadraticCurveTo(...to3D(-0.15, 0.095), ...to3D(-0.145, 0.045));
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0026,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.07, -0.08, -0.15, -0.18, [
          [0, "#c2b850"],
          [0.5, MINT],
          [1, MINT_L],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.4);
        fc.fillStyle = rgbaHex("#424b28", 0.56);
        for (const [sx, sy] of [
          [-0.1, -0.11],
          [-0.13, -0.13],
          [-0.12, -0.09],
        ]) {
          drawBlob(fc, sx, sy, 0.0045, 0.0035, 0);
        }
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Rounded Translucent Pale-Mint Speckled Tail Fin
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, -0.035, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.036);
  tailShape.quadraticCurveTo(-0.06, 0.105, -0.145, 0.135);
  tailShape.bezierCurveTo(-0.22, 0.095, -0.235, -0.085, -0.13, -0.148);
  tailShape.quadraticCurveTo(-0.055, -0.115, 0.01, -0.042);
  tailShape.closePath();
  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.22, 0, [
        [0, "#b4bc84"],
        [0.35, MINT],
        [1, MINT_L],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      const tRays: Pt[] = [];
      for (let i = 0; i < 7; i++) tRays.push([-0.21, -0.1 + i * 0.036]);
      drawFinRays(fc, [0.02, -0.004], tRays, rgbaHex("#eff4e4", 0.54), 0.0034);
      fc.fillStyle = rgbaHex("#303818", 0.68);
      for (let i = 0; i < 7; i++) {
        const ry = -0.088 + i * 0.031;
        for (let j = 1; j <= 4; j++) {
          const t = j * 0.22;
          drawBlob(fc, -0.03 - t * 0.17, ry * (0.35 + t * 0.85), 0.0044, 0.0036, 0);
        }
      }
    },
    maxAnisotropy,
    false,
    0.0011,
    { transparent: true, opacity: 0.9 }
  );
  tailPivot.add(tailFin.mesh);

  // Sweeping 7-Ray Banded & Ragged Feathered Pectoral Curtain
  const [pecOx, pecOy] = to3D(0.18, 0.082);
  const raysData = [
    { ang: 1.5, len: 0.215 },
    { ang: 1.76, len: 0.255 },
    { ang: 2.02, len: 0.28 },
    { ang: 2.28, len: 0.295 },
    { ang: 2.54, len: 0.295 },
    { ang: 2.8, len: 0.29 },
    { ang: 3.06, len: 0.305 },
  ];
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.035, 0.0);
  for (let i = 0; i < raysData.length; i++) {
    const r = raysData[i];
    const ex = Math.cos(r.ang) * r.len;
    const ey = -Math.sin(r.ang) * r.len;
    const nx = Math.cos(r.ang + 0.09) * (r.len * 0.92);
    const ny = -Math.sin(r.ang + 0.09) * (r.len * 0.92);
    pecShape.lineTo(ex, ey);
    pecShape.lineTo(nx, ny);
    if (i < raysData.length - 1) {
      pecShape.lineTo(
        Math.cos(r.ang + 0.14) * (r.len * 0.78),
        -Math.sin(r.ang + 0.14) * (r.len * 0.78)
      );
    }
  }
  pecShape.lineTo(-0.08, 0.025);
  pecShape.closePath();

  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.0026,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0.0, -0.16, -0.26, [
        [0, "#c89e18"],
        [0.38, "#98b888"],
        [0.72, "#d6ead8"],
        [1, "#f2f9f2"],
      ]);
      fc.fillRect(-0.4, -0.4, 0.5, 0.5);
      for (let b = 0; b < 5; b++) {
        fc.beginPath();
        fc.arc(0.01, 0.01, 0.045 + b * 0.042, -3.25, -1.55);
        fc.strokeStyle = b % 2 === 0 ? rgbaHex("#d4861a", 0.56) : rgbaHex("#f4f2cc", 0.58);
        fc.lineWidth = 0.016;
        fc.stroke();
      }
      for (const r of raysData) {
        const ex = Math.cos(r.ang) * r.len;
        const ey = -Math.sin(r.ang) * r.len;
        fc.beginPath();
        fc.moveTo(0.01, 0.0);
        fc.quadraticCurveTo(ex * 0.45 + 0.01, ey * 0.5, ex, ey);
        fc.strokeStyle = rgbaHex("#e4edd4", 0.85);
        fc.lineWidth = 0.0052;
        fc.stroke();
        fc.setLineDash([0.01, 0.013]);
        fc.strokeStyle = rgbaHex("#6a5812", 0.48);
        fc.lineWidth = 0.0042;
        fc.stroke();
        fc.setLineDash([]);
        fc.fillStyle = rgbaHex("#3a4424", 0.48);
        drawBlob(fc, ex * 0.78, ey * 0.78, 0.004, 0.0032, 0);
      }
    },
    maxAnisotropy,
    false,
    0.001,
    { transparent: true, opacity: 0.92 }
  );
  const pecZLeon = surfaceZAt(evalTop, evalUnifiedBot, evalZ, pecOx, pecOy, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, pecZLeon);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -pecZLeon);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  // Dual Curved 3D Brow Tentacles
  const tentMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#9a8618",
      emissive: "#5e4e08",
      emissiveIntensity: 0.2,
      roughness: 0.35,
    })
  );
  for (const [bx0, by0, cx0, cy0, tx0, ty0, rad] of [
    [0.242, -0.088, 0.262, -0.142, 0.302, -0.168, 0.0042],
    [0.256, -0.082, 0.28, -0.128, 0.312, -0.145, 0.0036],
  ] as const) {
    const [p0x, p0y] = to3D(bx0, by0);
    const [p1x, p1y] = to3D(cx0, cy0);
    const [p2x, p2y] = to3D(tx0, ty0);
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(p0x, p0y, s * 0.028),
        new THREE.Vector3(p1x, p1y, s * 0.034),
        new THREE.Vector3(p2x, p2y, s * 0.036),
      ]);
      const tGeo = track(new THREE.TubeGeometry(curve, 10, rad, 6, false));
      const tMesh = new THREE.Mesh(tGeo, tentMat);
      bodyGroup.add(tMesh);
    }
  }

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const [ex, ey] = to3D(0.252, -0.044);
  const leonEz = surfaceZAt(evalTop, evalUnifiedBot, evalZ, ex, ey);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: leonEz,
    er: 0.036,
    irisColor: "#a4bc1c",
    rimColor: OL,
    lidColor: "#907206",
    lidTilt: 0.22,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, lx3 + 0.015, hy, "#f8eba2", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 4. PETER (John Dory FF2 — Deep Emerald Oval, 3 Wavy Golden Bands, Thumbprint Ocellus, 9-Spine Mohawk)
// =====================================================================================
function createPeter3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0b2410";
  const B = pal.body; // #28863c
  const D = pal.dark; // #0f421a
  const BEL = pal.belly; // #4ca850
  const FIN = pal.fin; // #6ea862
  const GOLD = pal.stripe || "#ffe61c";
  const SPOT = pal.spot || "#101a10";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.255;
  const xHead = 0.228;
  const xSnout = 0.35;
  const tipY = -0.048;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.04],
          [-0.16, 0.175],
          [-0.03, 0.252],
          [0.08, 0.246],
        ],
        [
          [0.08, 0.246],
          [0.18, 0.22],
          [0.27, 0.125],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.04],
          [-0.15, -0.172],
          [-0.02, -0.238],
          [0.09, -0.228],
        ],
        [
          [0.09, -0.228],
          [0.2, -0.205],
          [0.285, -0.145],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.084 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheek = x > 0.18 ? base * clamp(1 - (x - 0.18) / 0.26, 0.66, 1) : base;
    const noseStart = 0.255;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.3, 0.39, -0.27, 0.27, 512);

  // Paint Deep Emerald John Dory Body with 3 Wavy Golden Bands + Thumbprint Ocellus + Black Peduncle Bar
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.25, 0, 0.25, [
    [0, D],
    [0.36, B],
    [0.74, mixHex(B, BEL, 0.55)],
    [1, mixHex(D, BEL, 0.38)],
  ]);
  bc.fillRect(-0.36, -0.3, 0.8, 0.6);

  drawGlow(bc, 0.02, -0.11, 0.18, 0.065, -0.12, "255,255,255", 0.13);

  // 3 Wavy Longitudinal Golden Bands matching sprites.ts peter!
  bc.fillStyle = GOLD;
  // Top golden sweeping band
  bc.beginPath();
  bc.moveTo(0.115, -0.08);
  bc.bezierCurveTo(0.02, -0.145, -0.095, -0.105, -0.225, -0.02);
  bc.bezierCurveTo(-0.095, -0.045, 0.02, -0.07, 0.105, -0.035);
  bc.closePath();
  bc.fill();
  // Middle-lower golden sweeping band
  bc.beginPath();
  bc.moveTo(0.068, 0.06);
  bc.bezierCurveTo(-0.03, 0.015, -0.125, 0.015, -0.225, -0.005);
  bc.bezierCurveTo(-0.125, 0.06, -0.025, 0.07, 0.062, 0.09);
  bc.closePath();
  bc.fill();
  // Bottom golden sweeping band
  bc.beginPath();
  bc.moveTo(0.132, 0.165);
  bc.bezierCurveTo(0.018, 0.11, -0.102, 0.14, -0.21, 0.025);
  bc.bezierCurveTo(-0.102, 0.19, 0.018, 0.18, 0.132, 0.195);
  bc.closePath();
  bc.fill();

  // Yellow cheek wedge & forehead spots
  bc.beginPath();
  bc.moveTo(0.228, 0.025);
  bc.lineTo(0.175, 0.07);
  bc.lineTo(0.202, 0.115);
  bc.closePath();
  bc.fill();
  for (const [sx, sy, rr] of [
    [0.088, -0.17, 0.022],
    [0.018, -0.185, 0.024],
    [-0.065, -0.165, 0.018],
    [0.155, 0.035, 0.015],
    [0.132, 0.09, 0.014],
  ]) {
    drawBlob(bc, sx, sy, rr * 1.15, rr * 0.85, -0.2);
  }

  // Signature pale-yellow-ringed dark thumbprint ocellus at center flank
  bc.fillStyle = "#e8f68c";
  drawBlob(bc, -0.02, -0.004, 0.058, 0.042, 0);
  bc.fillStyle = SPOT;
  drawBlob(bc, -0.02, -0.004, 0.044, 0.031, 0);

  // Crisp black vertical bar at tail peduncle
  bc.fillStyle = "#0b140b";
  bc.fillRect(-0.26, -0.12, 0.03, 0.24);

  // Operculum crease
  bc.strokeStyle = rgbaHex(OL, 0.55);
  bc.lineWidth = 0.0068;
  bc.beginPath();
  bc.moveTo(0.14, -0.085);
  bc.quadraticCurveTo(0.108, 0.03, 0.076, 0.13);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const hx = xHead;
  const hy = -0.07;
  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.005 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 56,
    vSteps: 30,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const peterSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.252, x1: 0.1, top: true },
      { x0: -0.228, x1: -0.048, top: false },
      { x0: 0.03, x1: hx - 0.002, top: false },
    ],
    0.026
  );
  const peterSeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const peterMask = (x: number, y: number, z: number) => peterSpineMask(x, y, z) * peterSeamMask(x, y, z);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, peterMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0038, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.012,
    hy + 0.002,
    "#4e1022",
    "#ec6a8e",
    [0.032, 0.026, 0.02],
    [0.026, 0.01, 0.015],
    0.036
  );

  // Truncate Rounded Tail Fin w/ Dark Base & Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.042);
  tailShape.quadraticCurveTo(-0.072, 0.125, -0.145, 0.135);
  tailShape.quadraticCurveTo(-0.162, 0, -0.145, -0.135);
  tailShape.quadraticCurveTo(-0.072, -0.125, 0.01, -0.042);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(pal.tail || FIN, D, 0.4)],
        [0.55, pal.tail || FIN],
        [1, mixHex(pal.tail || FIN, "#ffffff", 0.45)],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.14, 0.105],
          [-0.148, 0.052],
          [-0.15, 0],
          [-0.148, -0.052],
          [-0.14, -0.105],
        ],
        rgbaHex(D, 0.36),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // 9-Spine Spiky Mohawk Dorsal Crest (deep V-notches between spines!)
  const nSp = 9;
  const basePts: Pt[] = [];
  const tipPts: Pt[] = [];
  for (let i = 0; i < nSp; i++) {
    const f = i / (nSp - 1);
    const bx0 = 0.095 - f * 0.165;
    const by0 = 0.18 + Math.sin(f * Math.PI) * 0.025;
    const ang3 = Math.PI * (0.36 + f * 0.38);
    const len = 0.22 - Math.abs(f - 0.35) * 0.09;
    basePts.push([bx0, by0]);
    tipPts.push([bx0 + Math.cos(ang3) * len, by0 + Math.sin(ang3) * len]);
  }
  const crestShape = new THREE.Shape();
  crestShape.moveTo(basePts[0][0], basePts[0][1] - 0.02);
  for (let i = 0; i < nSp; i++) {
    crestShape.lineTo(tipPts[i][0], tipPts[i][1]);
    if (i < nSp - 1) {
      const vx = (basePts[i][0] + basePts[i + 1][0]) * 0.28 + (tipPts[i][0] + tipPts[i + 1][0]) * 0.22;
      const vy = (basePts[i][1] + basePts[i + 1][1]) * 0.28 + (tipPts[i][1] + tipPts[i + 1][1]) * 0.22;
      crestShape.lineTo(vx, vy);
    }
  }
  crestShape.lineTo(basePts[nSp - 1][0], basePts[nSp - 1][1] - 0.02);
  crestShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      crestShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.18, 0, 0.42, [
          [0, "#3d7a36"],
          [0.45, "#8ec868"],
          [1, "#d8f294"],
        ]);
        fc.fillRect(-0.3, 0, 0.6, 0.5);
        for (let i = 0; i < nSp; i++) {
          fc.beginPath();
          fc.moveTo(basePts[i][0], basePts[i][1]);
          fc.lineTo(tipPts[i][0], tipPts[i][1]);
          fc.strokeStyle = rgbaHex("#d8f294", 0.72);
          fc.lineWidth = 0.004;
          fc.stroke();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Scalloped Rear Soft Dorsal & Notched Anal Fin
  const rearDShape = new THREE.Shape();
  rearDShape.moveTo(-0.075, 0.175);
  rearDShape.quadraticCurveTo(-0.125, 0.258, -0.17, 0.242);
  rearDShape.quadraticCurveTo(-0.225, 0.232, -0.252, 0.148);
  rearDShape.quadraticCurveTo(-0.256, 0.095, -0.225, 0.048);
  rearDShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      rearDShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, 0.25, -0.16, 0.06, [
          [0, "rgba(148,196,130,0.88)"],
          [1, "rgba(88,132,78,0.85)"],
        ]);
        fc.fillRect(-0.4, 0, 0.4, 0.35);
      },
      maxAnisotropy,
      true,
      0.0011,
      { transparent: true, opacity: 0.9 },
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.048, -0.182);
  analShape.lineTo(-0.076, -0.258);
  analShape.lineTo(-0.11, -0.222);
  analShape.lineTo(-0.152, -0.275);
  analShape.lineTo(-0.228, -0.162);
  analShape.lineTo(-0.225, -0.052);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.14, -0.27, -0.14, -0.06, [
          [0, "rgba(148,196,130,0.88)"],
          [1, "rgba(88,132,78,0.85)"],
        ]);
        fc.fillRect(-0.4, -0.35, 0.4, 0.35);
      },
      maxAnisotropy,
      true,
      0.0011,
      { transparent: true, opacity: 0.9 },
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Broad Downward Yellow-Green Pelvic Paddle Fin w/ 5 Rays
  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.118, -0.185);
  pelvShape.bezierCurveTo(0.125, -0.285, 0.088, -0.375, 0.048, -0.392);
  pelvShape.quadraticCurveTo(0.016, -0.322, 0.032, -0.198);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.08, -0.39, 0.08, -0.19, [
          [0, "#e8d442"],
          [1, "#4f7d46"],
        ]);
        fc.fillRect(-0.1, -0.45, 0.3, 0.3);
        drawFinRays(
          fc,
          [0.082, -0.192],
          [
            [0.105, -0.355],
            [0.085, -0.375],
            [0.062, -0.382],
            [0.042, -0.365],
            [0.028, -0.335],
          ],
          rgbaHex(OL, 0.35),
          0.0034
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Pectoral Fins
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.045, 0.048, -0.118, 0.024, -0.112, -0.018);
  pecShape.bezierCurveTo(-0.095, -0.052, -0.028, -0.042, 0, -0.014);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.045,
    -0.068,
    0.0028,
    0.0008,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.42)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecZPeter =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      0.045,
      -0.068,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.045, -0.068, pecZPeter);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.045, -0.068, -pecZPeter);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const peterEz = surfaceZAt(
    evalTop,
    evalBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.195,
    0.078
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.195,
    ey: 0.078,
    ez: peterEz,
    er: 0.045,
    irisColor: pal.iris || "#a8c828",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#eaff96", 0.054);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.86 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.25;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.88, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. PUFFER (Bubu — Inflating Spiny Globe, Fused Ivory Beak Plates, Saddles & Dots)
// =====================================================================================
function createPuffer3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#4a2f0a";
  const B = pal.body; // #f2c24e
  const D = pal.dark; // #b57d1e
  const BEL = pal.belly; // #fff8e2
  const FIN = pal.fin; // #ffd970
  const SPOT = pal.spot || "#6b4312";

  const ctx = createRigContext(OL, "#c8c8c8");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const scaleGroup = new THREE.Group();
  bodyGroup.add(scaleGroup);

  const xTail = -0.242;
  const xSnout = 0.258;

  // Plump, chubby pear-globe puffer silhouette with rounded forehead & chin (no pointy beak or sharp chin corner)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.044],
          [-0.178, 0.168],
          [-0.068, 0.236],
          [0.035, 0.238],
        ],
        [
          [0.035, 0.238],
          [0.156, 0.232],
          [0.244, 0.148],
          [xSnout, -0.002],
        ],
      ],
      28
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.044],
          [-0.178, -0.162],
          [-0.068, -0.228],
          [0.035, -0.232],
        ],
        [
          [0.035, -0.232],
          [0.156, -0.222],
          [0.242, -0.145],
          [xSnout - 0.002, -0.028],
        ],
      ],
      28
    )
  );

  // Smooth full-cheeked ellipsoid breadth tapering gently into the rounded nose and tail peduncle
  const evalZ = (_x: number, t: number) => {
    const u = clamp(t, 0, 1);
    const arc = Math.sin(Math.pow(u, 0.72) * Math.PI);
    return 0.034 + 0.194 * Math.pow(Math.max(0, arc), 0.56);
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.28, 0.3, -0.26, 0.26, 512);

  // Paint rich matte-satin golden puffer skin with feathered dorsal saddles, spots, belly creases & rosy cheek blush
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.23, 0, 0.23, [
    [0, mixHex(D, "#8f5d14", 0.25)],
    [0.26, D],
    [0.54, B],
    [0.8, mixHex(B, BEL, 0.56)],
    [1, mixHex(BEL, "#f5dc9c", 0.48)],
  ]);
  bc.fillRect(-0.36, -0.3, 0.76, 0.6);

  // Soft warm forehead bloom (matte, no harsh white glare)
  drawGlow(bc, 0.04, -0.1, 0.15, 0.055, -0.1, "255,232,160", 0.12);

  // Feathered dorsal saddle bands matching Porcupine Puffer markings
  for (const [sx, sy, rx0, ry0, rot] of [
    [0.078, -0.145, 0.044, 0.032, 0.22],
    [-0.045, -0.175, 0.056, 0.036, -0.06],
    [-0.152, -0.12, 0.04, 0.028, -0.25],
  ] as [number, number, number, number, number][]) {
    bc.save();
    bc.translate(sx, sy);
    bc.rotate(rot);
    bc.scale(1, ry0 / rx0);
    const sg = bc.createRadialGradient(0, 0, rx0 * 0.18, 0, 0, rx0);
    sg.addColorStop(0, rgbaHex(SPOT, 0.62));
    sg.addColorStop(0.68, rgbaHex(SPOT, 0.42));
    sg.addColorStop(1, rgbaHex(SPOT, 0));
    bc.fillStyle = sg;
    bc.beginPath();
    bc.arc(0, 0, rx0, 0, Math.PI * 2);
    bc.fill();
    bc.restore();
  }

  // Varied warm chestnut spots across upper back & flanks (avoiding eye & belly)
  const spots: [number, number, number][] = [
    [-0.19, -0.05, 0.008],
    [-0.15, -0.02, 0.011],
    [-0.11, -0.1, 0.009],
    [-0.09, -0.04, 0.012],
    [-0.05, -0.09, 0.008],
    [-0.02, -0.02, 0.01],
    [0.01, -0.12, 0.011],
    [0.03, -0.05, 0.008],
    [0.06, -0.01, 0.009],
    [0.08, -0.09, 0.011],
    [0.11, -0.13, 0.0075],
    [0.11, -0.04, 0.0085],
    [-0.13, 0.03, 0.008],
    [-0.06, 0.04, 0.0095],
    [0.0, 0.03, 0.0085],
    [0.05, 0.05, 0.007],
  ];
  for (const [sx, sy, sr] of spots) {
    bc.fillStyle = rgbaHex(D, 0.35);
    bc.beginPath();
    bc.arc(sx, sy, sr * 1.45, 0, Math.PI * 2);
    bc.fill();
    bc.fillStyle = rgbaHex(SPOT, 0.85);
    bc.beginPath();
    bc.arc(sx, sy, sr, 0, Math.PI * 2);
    bc.fill();
  }

  // Cute rosy peach cheek blush under the eye
  drawGlow(bc, 0.145, 0.018, 0.036, 0.024, 0.1, "244,126,92", 0.34);

  // Subtle curved belly pleats along lower plump underside
  bc.strokeStyle = rgbaHex(D, 0.22);
  bc.lineWidth = 0.0042;
  bc.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const py = 0.105 + i * 0.024;
    bc.beginPath();
    bc.moveTo(-0.11 + i * 0.02, py);
    bc.quadraticCurveTo(0.02, py + 0.018, 0.14 - i * 0.018, py - 0.004);
    bc.stroke();
  }

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = 0.238;
  const hy = -0.016;
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  // Seamless unbroken plump puffer globe (roundFront: false avoids double-pinching the front dome)
  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 54,
      vSteps: 32,
      evalTopY: evalTop,
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: false,
      rearBulge: 0.006,
      taper: (s) => 1 - 0.12 * s * s,
    })
  );
  const bodyMat = makeFishMat(bodyTex, {
    roughness: 0.9,
    clearcoat: 0,
    envMapIntensity: 0.04,
    emissiveIntensity: 0.12,
  });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const pufferMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.215, x1: -0.105, top: true },
      { x0: -0.215, x1: -0.108, top: false },
    ],
    0.028
  );
  scaleGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0036, pufferMask)), makeOutlineMat(0, 0))
  );

  // Cute rounded puckered upper lip cushion curving along the front snout contour
  const lipMat = track(
    new THREE.MeshPhysicalMaterial({
      color: mixHex(B, "#ffe2a6", 0.38),
      emissive: mixHex(B, "#ffe2a6", 0.38),
      emissiveIntensity: 0.12,
      roughness: 0.88,
      clearcoat: 0,
      envMapIntensity: 0.04,
    })
  );
  const upperLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.246, hy - 0.002, -0.032),
    new THREE.Vector3(0.258, hy + 0.008, -0.017),
    new THREE.Vector3(0.264, hy + 0.012, 0),
    new THREE.Vector3(0.258, hy + 0.008, 0.017),
    new THREE.Vector3(0.246, hy - 0.002, 0.032),
  ]);
  const upperLipGeo = track(new THREE.TubeGeometry(upperLipCurve, 20, 0.0072, 10, false));
  const upperLipMesh = new THREE.Mesh(upperLipGeo, lipMat);
  const upperLipOl = new THREE.Mesh(
    track(buildOutlineGeometry(upperLipGeo, 0.0014, jawOutlineMask(0.248, 0.258))),
    makeOutlineMat(0, 0, false)
  );
  upperLipMesh.add(upperLipOl);
  scaleGroup.add(upperLipMesh);

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  scaleGroup.add(upperJawGroup);

  // Compact rounded lower lip arch hinged cleanly at (hx, hy) so opening forms a cute puffer "O" mouth
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  scaleGroup.add(lowerJawGroup);

  const lowerLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.246 - hx, -0.001, -0.03),
    new THREE.Vector3(0.257 - hx, -0.009, -0.016),
    new THREE.Vector3(0.263 - hx, -0.012, 0),
    new THREE.Vector3(0.257 - hx, -0.009, 0.016),
    new THREE.Vector3(0.246 - hx, -0.001, 0.03),
  ]);
  const lowerLipGeo = track(new THREE.TubeGeometry(lowerLipCurve, 20, 0.0068, 10, false));
  const lowerLipMesh = new THREE.Mesh(lowerLipGeo, lipMat);
  const lowerLipOl = new THREE.Mesh(
    track(buildOutlineGeometry(lowerLipGeo, 0.0014, jawOutlineMask(0.248 - hx, 0.258 - hx))),
    makeOutlineMat(hx, hy, false)
  );
  lowerLipMesh.add(lowerLipOl);
  lowerJawGroup.add(lowerLipMesh);

  // Twin rounded ivory buck-tooth beak plates tucked neatly inside the lip ring
  const beakMat = makeTeethMat(track);
  const addRoundedTooth = (parent: THREE.Object3D, bx: number, by: number, rx0: number, ry0: number, rz0: number, gapZ: number) => {
    const tGeo = track(new THREE.SphereGeometry(1, 12, 10));
    tGeo.scale(rx0, ry0, rz0);
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(tGeo, beakMat);
      m.position.set(bx, by, side * gapZ);
      parent.add(m);
    }
  };
  addRoundedTooth(scaleGroup, 0.261, hy + 0.003, 0.0044, 0.0052, 0.006, 0.0066);
  addRoundedTooth(lowerJawGroup, 0.26 - hx, -0.004, 0.0038, 0.0042, 0.0054, 0.0058);

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    scaleGroup,
    lowerJawGroup,
    0.244,
    hy,
    "#4a0d1d",
    "#ec6a8e",
    [0.016, 0.015, 0.021],
    [0.011, 0.005, 0.009],
    0.018
  );
  mouthInterior.position.set(0.240, hy - 0.001, 0);

  // Clean Sculpted 3D Conical Spines anchored along exact surface normals (kept clear of face, eyes & fins)
  const spineGeo = track(new THREE.ConeGeometry(0.0102, 0.046, 10));
  spineGeo.translate(0, 0.015, 0);
  const spineCollarGeo = track(new THREE.SphereGeometry(0.0115, 10, 6));
  spineCollarGeo.scale(1, 0.42, 1);
  const spineMat = track(
    new THREE.MeshStandardMaterial({
      color: "#fff5d6",
      emissive: "#ffe8b8",
      emissiveIntensity: 0.1,
      roughness: 0.82,
      envMapIntensity: 0.04,
    })
  );
  const collarMat = track(
    new THREE.MeshStandardMaterial({
      color: mixHex(D, B, 0.35),
      roughness: 0.88,
      envMapIntensity: 0.04,
    })
  );
  const spineNodes: { mesh: THREE.Mesh; restQ: THREE.Quaternion; puffQ: THREE.Quaternion }[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  const sampleSurfPos = (sx: number, phi: number) => {
    const t = clamp((sx - xTail) / (xSnout - xTail), 0, 1);
    const yt = evalTop(sx);
    const yb = evalBot(sx);
    const ym = (yt + yb) * 0.5;
    const hh = (yt - yb) * 0.5;
    const hz = evalZ(sx, t);
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    const tap = 1 - 0.12 * sinP * sinP;
    return new THREE.Vector3(sx, ym + hh * sinP, hz * cosP * tap);
  };

  const xSlices = [-0.145, -0.085, -0.02, 0.045, 0.105];
  for (let xi = 0; xi < xSlices.length; xi++) {
    const sx = xSlices[xi];
    const nAround = xi === 0 || xi === xSlices.length - 1 ? 7 : 9;
    const ymSlice = evalMidY(sx);
    for (let k = 0; k < nAround; k++) {
      const phi = (k / nAround) * Math.PI * 2 + xi * 0.38;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      // Keep dorsal/anal fin roots, pectoral fin sockets, and entire face/eye/cheek zone clear
      if (sx < -0.075 && Math.abs(sinP) > 0.8) continue;
      if (sx > -0.065 && sx < 0.065 && Math.abs(sinP + 0.18) < 0.32 && Math.abs(cosP) > 0.68) continue;
      if (sx > 0.065 && sinP > -0.45 && sinP < 0.65 && Math.abs(cosP) > 0.45) continue;

      const p0 = sampleSurfPos(sx, phi);
      const px = sampleSurfPos(sx + 0.008, phi).sub(p0);
      const pp = sampleSurfPos(sx, phi + 0.05).sub(p0);
      const nrmOut = new THREE.Vector3().crossVectors(pp, px).normalize();
      const dirOut = new THREE.Vector3(p0.x * 0.35, p0.y - ymSlice, p0.z);
      if (nrmOut.dot(dirOut) < 0) nrmOut.negate();

      const puffDir = nrmOut.clone().normalize();
      const restDir = nrmOut.clone();
      restDir.x -= 0.38;
      restDir.normalize();

      const restQ = new THREE.Quaternion().setFromUnitVectors(upVec, restDir);
      const puffQ = new THREE.Quaternion().setFromUnitVectors(upVec, puffDir);

      const sm = new THREE.Mesh(spineGeo, spineMat);
      sm.position.set(p0.x - puffDir.x * 0.004, p0.y - puffDir.y * 0.004, p0.z - puffDir.z * 0.004);
      sm.quaternion.copy(restQ);
      const collar = new THREE.Mesh(spineCollarGeo, collarMat);
      sm.add(collar);
      scaleGroup.add(sm);
      spineNodes.push({ mesh: sm, restQ, puffQ });
    }
  }

  // Compact Rounded Fan Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  scaleGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.038);
  tailShape.bezierCurveTo(-0.045, 0.105, -0.118, 0.098, -0.135, 0.035);
  tailShape.quadraticCurveTo(-0.15, 0, -0.135, -0.035);
  tailShape.bezierCurveTo(-0.118, -0.098, -0.045, -0.105, 0.01, -0.038);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(FIN, D, 0.3)],
        [0.55, FIN],
        [1, mixHex(FIN, "#fff4cf", 0.3)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      drawFinRays(
        fc,
        [0.008, 0],
        [
          [-0.125, 0.068],
          [-0.132, 0.034],
          [-0.136, 0],
          [-0.132, -0.034],
          [-0.125, -0.068],
        ],
        rgbaHex(D, 0.34),
        0.0034
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Far-Back Rounded Dorsal & Anal Fins w/ 4 rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.105, 0.175);
  dorsalShape.bezierCurveTo(-0.118, 0.272, -0.205, 0.258, -0.215, 0.14);
  dorsalShape.lineTo(-0.188, 0.082);
  dorsalShape.closePath();
  scaleGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, 0.1, -0.16, 0.26, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#fff4cf", 0.28)],
        ]);
        fc.fillRect(-0.3, 0, 0.3, 0.35);
        drawFinRays(
          fc,
          [-0.145, 0.135],
          [
            [-0.132, 0.232],
            [-0.155, 0.234],
            [-0.178, 0.222],
            [-0.195, 0.195],
          ],
          rgbaHex(D, 0.34),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.11, -0.172);
  analShape.bezierCurveTo(-0.122, -0.264, -0.205, -0.25, -0.215, -0.135);
  analShape.lineTo(-0.188, -0.082);
  analShape.closePath();
  scaleGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.003,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, -0.1, -0.16, -0.26, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#fff4cf", 0.28)],
        ]);
        fc.fillRect(-0.3, -0.35, 0.3, 0.35);
        drawFinRays(
          fc,
          [-0.145, -0.135],
          [
            [-0.132, -0.228],
            [-0.155, -0.23],
            [-0.178, -0.218],
            [-0.195, -0.19],
          ],
          rgbaHex(D, 0.34),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Delicate Sculling Pectoral Fins seated neatly on mid-flank behind cheek (never overlapping chin/mouth)
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.008);
  pecShape.bezierCurveTo(-0.028, 0.036, -0.072, 0.022, -0.068, -0.012);
  pecShape.bezierCurveTo(-0.056, -0.038, -0.018, -0.032, 0, -0.01);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    -0.025,
    -0.034,
    0.0024,
    0.0007,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(FIN, D, 0.28)],
        [1, mixHex(FIN, "#fff6d8", 0.22)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      drawFinRays(
        fc,
        [-0.004, 0],
        [
          [-0.058, 0.015],
          [-0.064, 0],
          [-0.058, -0.015],
        ],
        rgbaHex(D, 0.34),
        0.0024
      );
    },
    maxAnisotropy,
    false,
    0.001
  );
  const pecX = -0.025;
  const pecY = -0.034;
  const pecZ =
    surfaceZAt(evalTop, evalBot, (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)), pecX, pecY, 0.12, 1.0) +
    0.005;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecX, pecY, pecZ);
  pecObj.mesh.rotation.y = 0.22;
  pecLeft.add(pecObj.mesh);

  const pecRight = new THREE.Group();
  pecRight.position.set(pecX, pecY, -pecZ);
  const pecMeshR = pecObj.mesh.clone();
  pecMeshR.rotation.y = -0.22;
  pecRight.add(pecMeshR);
  scaleGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  scaleGroup.add(pelvicFin);

  const pufferEx = 0.146;
  const pufferEy = 0.062;
  const pufferEz = surfaceZAt(
    evalTop,
    evalBot,
    (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
    pufferEx,
    pufferEy,
    0.12,
    0.9
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, scaleGroup, {
    ex: pufferEx,
    ey: pufferEy,
    ez: pufferEz,
    er: 0.047,
    yawRot: 0.4,
    irisColor: pal.iris || "#1f4a6e",
    rimColor: OL,
    lidColor: mixHex(D, B, 0.42),
    lidTilt: -0.14,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.018, hy, "#fff2c2", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    scaleGroup,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      const puffK = clamp((p.puff ? 0.72 : 0) + clamp(p.gulpT, 0, 1) * 0.45, 0, 1.15);
      scaleGroup.scale.set(1 + puffK * 0.14, 1 + puffK * 0.2, 1 + puffK * 0.24);
      const erectK = clamp(puffK * 0.85, 0, 1);
      for (const node of spineNodes) {
        node.mesh.scale.setScalar(0.76 + puffK * 0.56);
        node.mesh.quaternion.copy(node.restQ).slerp(node.puffQ, erectK);
      }
      lowerJawGroup.rotation.z = -open * 0.94 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.26;
        mouthInterior.scale.set(0.82 + open * 0.18, 0.28 + open * 0.96, 0.54 + open * 0.12);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.006;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. TANG (Dori — Royal-Blue Disc, Black Palette Saddle, Blue Oval Window, Yellow Wedge Tail)
// =====================================================================================
function createTang3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#07174a";
  const B = "#1b6cff";
  const BD = "#0d35b8";
  const BL = "#4ca8ff";
  const BLK = "#0b1022";
  const YEL = pal.tail || "#ffe02a";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawTang 2D offset c.translate(-0.01, 0.008) in +Y down -> y3 = -(y2 + 0.008)
  const ox2 = -0.01;
  const oy2 = 0.008;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.235;
  const hx = 0.218; // 0.228 - 0.01
  const hy = -0.064; // -(0.056 + 0.008)
  const ux3 = 0.334; // 0.344 - 0.01
  const tipY = -0.062;

  // Match drawTang 2D rounded forehead, steep cute nose bridge, and plump convex chin meeting cleanly at tip
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.225, -0.042), to3D(-0.205, -0.16), to3D(-0.1, -0.255), to3D(0.055, -0.258)],
        [to3D(0.055, -0.258), to3D(0.185, -0.258), to3D(0.275, -0.195), to3D(0.305, -0.115)],
        [to3D(0.305, -0.115), to3D(0.324, -0.048), to3D(0.336, 0.008), [ux3, tipY]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.225, 0.025), to3D(-0.225, 0.062), to3D(-0.202, 0.105), to3D(-0.115, 0.192)],
        [to3D(-0.115, 0.192), to3D(-0.005, 0.264), to3D(0.135, 0.236), to3D(0.245, 0.195)],
        [to3D(0.245, 0.195), to3D(0.305, 0.145), to3D(0.332, 0.098), [ux3, tipY]],
      ],
      24
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.018 + 0.094 * Math.sin(Math.pow(clamp(t, 0, 1), 0.68) * Math.PI);
    const cheek = x > 0.21 ? base * clamp(1 - (x - 0.21) / 0.26, 0.76, 1) : base;
    const noseRound =
      x > 0.265 ? Math.sqrt(clamp(1 - Math.pow((x - 0.265) / (ux3 - 0.265), 2) * 0.996, 0.002, 1)) : 1;
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return x > 0.265 ? Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78)) : cheek;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.28, 0.37, -0.28, 0.28, 512);

  // Paint Dori Regal Blue Tang Flank: Royal Blue + Black Palette Saddle + Blue Window + Yellow Tail Wedge + Smile & Dimple
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = makeLin(bc, 0.1, -0.26, -0.08, 0.25, [
    [0, BL],
    [0.45, B],
    [0.85, BD],
    [1, "#09268a"],
  ]);
  bc.fillRect(-0.34, -0.34, 0.8, 0.68);

  drawGlow(bc, 0.22, 0.02, 0.16, 0.16, 0.1, "90,190,255", 0.52);

  // Iconic Regal Blue Tang black palette saddle
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.moveTo(0.225, -0.165);
  bc.bezierCurveTo(0.145, -0.258, -0.08, -0.275, -0.24, -0.055);
  bc.lineTo(-0.24, 0.038);
  bc.bezierCurveTo(-0.15, 0.065, -0.095, 0.135, -0.005, 0.132);
  bc.bezierCurveTo(0.075, 0.128, 0.105, 0.055, 0.055, -0.005);
  bc.bezierCurveTo(0.005, -0.062, 0.075, -0.145, 0.225, -0.165);
  bc.closePath();
  bc.fill();

  // Electric-blue oval window inside black palette
  bc.fillStyle = makeLin(bc, -0.09, -0.04, -0.02, 0.06, [
    [0, BL],
    [1, B],
  ]);
  bc.beginPath();
  bc.ellipse(-0.055, -0.008, 0.078, 0.048, -0.14, 0, Math.PI * 2);
  bc.fill();

  // Yellow triangle root aligned cleanly with tailPivot (y2 = -0.015 -> y3 = +0.007)
  bc.fillStyle = YEL;
  bc.beginPath();
  bc.moveTo(-0.125, -0.012);
  bc.lineTo(-0.245, -0.052);
  bc.lineTo(-0.245, 0.026);
  bc.closePath();
  bc.fill();

  // Soft eye-socket rim behind Dory's expressive eye
  bc.strokeStyle = rgbaHex(BD, 0.26);
  bc.lineWidth = 0.0046;
  bc.beginPath();
  bc.ellipse(0.248, -0.072, 0.055, 0.060, -0.06, Math.PI * 0.55, Math.PI * 1.75);
  bc.stroke();

  // Happy smiling cheek line & cheerful dimple matching drawTang
  bc.strokeStyle = rgbaHex(OL, 0.80);
  bc.lineWidth = 0.0052;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.338, 0.058);
  bc.quadraticCurveTo(0.285, 0.072, 0.220, 0.044);
  bc.stroke();
  c2Dimple: {
    bc.lineWidth = 0.0046;
    bc.beginPath();
    bc.arc(0.216, 0.044, 0.014, Math.PI * 0.7, Math.PI * 1.45);
    bc.stroke();
    break c2Dimple;
  }

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (ux3 - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.006 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;
  const tangSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.22, x1: 0.205, top: true },
      { x0: -0.225, x1: hx - 0.002, top: false },
    ],
    0.026
  );
  const tangSeamMask = mouthSeamOutlineMask(hx, ux3, hy, evalSeamY, false);
  const tangMask = (x: number, y: number, z: number) => tangSpineMask(x, y, z) * tangSeamMask(x, y, z);

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: ux3,
    xLowerEnd: ux3 - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 60,
    vSteps: 32,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, tangMask)), makeOutlineMat(0, 0))
  );

  // Happy Mouth Jaw (upper snout unified cleanly into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0038, mouthSeamOutlineMask(hx, ux3, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#220a38",
    "#c9629c",
    [0.036, 0.032, 0.024],
    [0.028, 0.01, 0.016],
    0.036
  );

  // Yellow Wedge Tail with Thick Black Top & Bottom Borders
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.232, 0.007, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.016, 0.032);
  tailShape.bezierCurveTo(-0.045, 0.068, -0.115, 0.104, -0.185, 0.122);
  tailShape.quadraticCurveTo(-0.172, 0.0, -0.182, -0.118);
  tailShape.bezierCurveTo(-0.11, -0.1, -0.042, -0.064, 0.016, -0.032);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0, -0.18, 0, [
        [0, "#d8a212"],
        [0.45, YEL],
        [1, "#fff268"],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 6; i++) pts.push([-0.18, -0.09 + i * 0.036]);
      drawFinRays(fc, [0.02, 0], pts, "rgba(170, 110, 10, 0.38)", 0.0038);
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Continuous Low Royal-Blue Dorsal & Anal Ridges w/ Black Margin & Rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(...to3D(0.205, -0.19));
  dorsalShape.bezierCurveTo(...to3D(0.11, -0.292), ...to3D(-0.08, -0.305), ...to3D(-0.22, -0.185));
  dorsalShape.quadraticCurveTo(...to3D(-0.245, -0.11), ...to3D(-0.22, -0.048));
  dorsalShape.lineTo(...to3D(-0.08, -0.12));
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.02, 0.18, -0.06, 0.3, [
          [0, BD],
          [0.6, B],
          [1, BL],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 10; i++) pts.push([0.15 - i * 0.042, 0.28 - Math.abs(i - 4) * 0.012]);
        drawFinRays(fc, [-0.03, 0.11], pts, "rgba(8, 22, 80, 0.36)", 0.0036);
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(0.03, 0.228));
  analShape.bezierCurveTo(...to3D(-0.06, 0.278), ...to3D(-0.175, 0.248), ...to3D(-0.225, 0.142));
  analShape.quadraticCurveTo(...to3D(-0.238, 0.085), ...to3D(-0.218, 0.04));
  analShape.lineTo(...to3D(-0.08, 0.13));
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.06, -0.16, -0.12, -0.27, [
          [0, BD],
          [0.65, B],
          [1, BL],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 8; i++) pts.push([-0.01 - i * 0.032, -0.27 + i * 0.01]);
        drawFinRays(fc, [-0.09, -0.12], pts, "rgba(8, 22, 80, 0.36)", 0.0036);
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Small Pelvic Fin
  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.115, -0.205);
  pelvShape.quadraticCurveTo(0.09, -0.295, 0.015, -0.328);
  pelvShape.quadraticCurveTo(0.035, -0.25, 0.055, -0.215);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.08, -0.2, 0.02, -0.33, [
          [0, BD],
          [1, BL],
        ]);
        fc.fillRect(-0.1, -0.4, 0.3, 0.3);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Swept Pointed Pectoral Wing with Black Frame & Bright Yellow Wing Tip
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.045, 0.048, -0.115, 0.042, -0.155, 0.01);
  pecShape.bezierCurveTo(-0.11, -0.036, -0.045, -0.045, 0, -0.018);
  pecShape.closePath();

  const [pecOx, pecOy] = to3D(0.052, 0.068);
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.003,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.15, 0, [
        [0, B],
        [0.45, BL],
        [0.52, BLK],
        [1, BLK],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      fc.fillStyle = YEL;
      drawBlob(fc, -0.1, 0.002, 0.042, 0.018, -0.05);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  pecObj.mesh.rotation.z = 0.62;
  const pecZTang =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (ux3 - xTail), 0, 1)),
      pecOx,
      pecOy,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, pecZTang);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -pecZTang);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const [ex, ey] = to3D(0.252, -0.072);
  const tangEz = computeEyeZ(
    evalTop,
    evalBot,
    (x) => evalZ(x, clamp((x - xTail) / (ux3 - xTail), 0, 1)),
    ex,
    ey,
    0.056
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: tangEz,
    er: 0.056,
    sx: 0.90,
    yawRot: 0.28,
    tiltZ: 0.06,
    irisScale: 0.55,
    pupilScale: 0.34,
    irisColor: pal.iris || "#7c2228",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, ux3 + 0.02, hy, "#80c8ff", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.232,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 7. IDOL (Gill — Moorish Idol, Slender Kite Crest, Bulbous White Beak, Nasal Saddle & Whip)
// =====================================================================================
function createIdol3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const DK = "#261640";
  const DK2 = "#120822";
  const PUR = "#51397a";
  const WH = "#fffdf6";
  const CREAM = "#f6ecc2";
  const YEL = "#efd98a";
  const OL = pal.outline || "#0c0412";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawIdol 2D offset c.translate(0, 0.012) in +Y-down -> y3 = -(y2 + 0.012)
  const ox2 = 0.0;
  const oy2 = 0.012;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.056;
  const hx = 0.355;
  const hy = -0.036;
  const xSnout = 0.456;
  const tipY = -0.008;

  // Strictly ascending-X upper profile matching drawIdol forehead, brow, concave bridge & arched bulbous beak!
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.056, -0.016), to3D(-0.025, -0.115), to3D(0.035, -0.235), to3D(0.114, -0.322)],
        [to3D(0.114, -0.322), to3D(0.185, -0.305), to3D(0.255, -0.215), to3D(0.305, -0.104)],
        [to3D(0.305, -0.104), to3D(0.326, -0.072), to3D(0.365, -0.09), to3D(0.422, -0.064)],
        [to3D(0.422, -0.064), to3D(0.442, -0.046), to3D(0.452, -0.028), [xSnout, tipY]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.056, 0.016), to3D(-0.03, 0.095), to3D(0.085, 0.215), to3D(0.205, 0.277)],
        [to3D(0.205, 0.277), to3D(0.245, 0.248), to3D(0.288, 0.195), to3D(0.336, 0.138)],
        [to3D(0.336, 0.138), to3D(0.376, 0.072), to3D(0.415, 0.026), [xSnout, tipY]],
      ],
      24
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.016 + 0.068 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheek = x > 0.28 ? base * clamp(1 - (x - 0.28) / 0.26, 0.62, 1) : base;
    const noseStart = 0.375;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.1, 0.5, -0.35, 0.35, 512);

  // Paint Exact Moorish Idol Coat: Yellow Stalk -> Cream-White Band -> Purple-Black Crescent Band -> Dark Mask w/ White Snout + Nasal Yellow Saddle!
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = WH;
  bc.fillRect(-0.14, -0.38, 0.7, 0.76);

  // Warm cream fading to yellow at tail stalk
  bc.fillStyle = makeLin(bc, 0.02, 0, -0.06, 0, [
    [0, "#fbf3d0"],
    [1, YEL],
  ]);
  bc.fillRect(-0.1, -0.35, 0.12, 0.7);

  // Middle pure white band
  bc.fillStyle = makeLin(bc, 0, -0.3, 0, 0.3, [
    [0, "#ffffff"],
    [0.55, WH],
    [1, "#efe6c6"],
  ]);
  bc.fillRect(0.02, -0.35, 0.16, 0.7);

  // Rear purple-black band
  bc.beginPath();
  bc.moveTo(0.078, -0.32);
  bc.quadraticCurveTo(0.046, -0.03, 0.082, 0.22);
  bc.lineTo(0.125, 0.335);
  bc.lineTo(0.0, 0.38);
  bc.lineTo(0.01, 0.22);
  bc.quadraticCurveTo(-0.012, 0.0, -0.004, -0.19);
  bc.lineTo(0.0, -0.32);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.08, 0, -0.01, 0, [
    [0, DK],
    [1, DK2],
  ]);
  bc.fill();

  // Dark face mask + purple satin forehead/cheek sheen
  bc.beginPath();
  bc.moveTo(0.158, -0.36);
  bc.bezierCurveTo(0.126, -0.2, 0.122, -0.05, 0.138, 0.07);
  bc.quadraticCurveTo(0.15, 0.19, 0.19, 0.32);
  bc.lineTo(0.52, 0.32);
  bc.lineTo(0.52, -0.36);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.14, -0.1, 0.33, 0.05, [
    [0, DK2],
    [0.5, DK],
    [1, "#2e1c4c"],
  ]);
  bc.fill();

  drawGlow(bc, 0.215, -0.21, 0.09, 0.035, 0.95, "120,92,176", 0.52);
  drawGlow(bc, 0.2, 0.1, 0.05, 0.09, 0.2, "104,80,160", 0.32);

  // Swept white snout & cheek mask
  bc.beginPath();
  bc.moveTo(0.32, -0.082);
  bc.bezierCurveTo(0.285, -0.062, 0.228, -0.044, 0.205, 0.008);
  bc.bezierCurveTo(0.192, 0.062, 0.212, 0.145, 0.278, 0.212);
  bc.lineTo(0.34, 0.28);
  bc.lineTo(0.5, 0.28);
  bc.lineTo(0.5, -0.18);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.32, -0.07, 0.34, 0.2, [
    [0, "#ffffff"],
    [0.55, "#f3f6fa"],
    [1, "#cad3e0"],
  ]);
  bc.fill();
  bc.strokeStyle = rgbaHex(DK2, 0.58);
  bc.lineWidth = 0.0044;
  bc.stroke();

  // Chin contour crease
  bc.beginPath();
  bc.moveTo(0.352, 0.038);
  bc.quadraticCurveTo(0.322, 0.07, 0.32, 0.112);
  bc.strokeStyle = "rgba(130, 140, 165, 0.34)";
  bc.lineWidth = 0.004;
  bc.stroke();

  // Bright yellow saddle tucked into concave nasal bridge
  bc.fillStyle = "#f4cb3c";
  bc.beginPath();
  bc.moveTo(0.292, -0.078);
  bc.quadraticCurveTo(0.314, -0.088, 0.338, -0.068);
  bc.quadraticCurveTo(0.315, -0.056, 0.288, -0.064);
  bc.closePath();
  bc.fill();
  bc.strokeStyle = rgbaHex(DK2, 0.45);
  bc.lineWidth = 0.0032;
  bc.stroke();

  // Heavy purple brow ridge & lower eye bag
  const [ex2, ey2, er2] = [0.238, -0.094, 0.038];
  bc.beginPath();
  bc.moveTo(ex2 - er2 * 1.3, ey2 - er2 * 1.02);
  bc.quadraticCurveTo(ex2 + er2 * 0.1, ey2 - er2 * 1.25, ex2 + er2 * 1.55, ey2 - er2 * 0.18);
  bc.strokeStyle = rgbaHex(PUR, 0.95);
  bc.lineWidth = 0.0085;
  bc.stroke();
  bc.beginPath();
  bc.ellipse(ex2, ey2 + 0.006, er2 * 1.18, er2 * 1.12, 0, Math.PI * 0.12, Math.PI * 0.82);
  bc.strokeStyle = rgbaHex(PUR, 0.9);
  bc.lineWidth = 0.0055;
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.004 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;
  const idolSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.058, x1: 0.16, top: true },
      { x0: -0.052, x1: 0.26, top: false },
    ],
    0.024
  );
  const idolSeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const idolMask = (x: number, y: number, z: number) => idolSpineMask(x, y, z) * idolSeamMask(x, y, z);

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 56,
    vSteps: 30,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, idolMask)), makeOutlineMat(0, 0))
  );

  // Bulbous White Arched Upper Beak (unified into cranium) & Concave Lower Chin Jaw
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0038, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.01,
    hy + 0.002,
    "#4a1020",
    "#e8708a",
    [0.028, 0.024, 0.018],
    [0.022, 0.008, 0.012],
    0.032
  );

  // Dark Tail Triangle w/ Cream Base & Purple Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.045, -0.057, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.012, 0.034);
  tailShape.bezierCurveTo(-0.05, 0.062, -0.12, 0.11, -0.18, 0.148);
  tailShape.quadraticCurveTo(-0.186, 0.13, -0.172, 0.112);
  tailShape.bezierCurveTo(-0.128, 0.07, -0.108, 0.03, -0.112, 0.008);
  tailShape.bezierCurveTo(-0.112, -0.02, -0.122, -0.055, -0.136, -0.082);
  tailShape.quadraticCurveTo(-0.118, -0.084, -0.098, -0.07);
  tailShape.bezierCurveTo(-0.06, -0.05, -0.02, -0.036, 0.012, -0.03);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.17, 0, [
        [0, CREAM],
        [0.16, YEL],
        [0.3, DK],
        [1, DK2],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.02, 0],
        [
          [-0.18, 0.12],
          [-0.17, 0.07],
          [-0.15, 0.02],
          [-0.15, -0.03],
          [-0.16, -0.075],
        ],
        rgbaHex(PUR, 0.52),
        0.0038
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Iconic Super-Long Soaring White Dorsal Streamer Whip w/ Dark Ribbon & Soft Yellow Rear Membrane!
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(...to3D(0.158, -0.29));
  dorsalShape.bezierCurveTo(...to3D(0.11, -0.385), ...to3D(0.01, -0.43), ...to3D(-0.085, -0.422));
  dorsalShape.bezierCurveTo(...to3D(-0.21, -0.41), ...to3D(-0.33, -0.365), ...to3D(-0.452, -0.31));
  dorsalShape.bezierCurveTo(...to3D(-0.33, -0.33), ...to3D(-0.22, -0.352), ...to3D(-0.13, -0.35));
  dorsalShape.bezierCurveTo(...to3D(-0.07, -0.348), ...to3D(-0.044, -0.262), ...to3D(-0.04, -0.13));
  dorsalShape.bezierCurveTo(...to3D(-0.07, -0.09), ...to3D(-0.075, -0.04), ...to3D(-0.058, 0.01));
  dorsalShape.lineTo(...to3D(0.06, -0.05));
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.1, 0.2, -0.2, 0.42, [
          [0, WH],
          [0.5, "#fffbe8"],
          [1, "#f4eccc"],
        ]);
        fc.fillRect(-0.6, -0.1, 0.9, 0.65);
        // Soft yellow rear membrane
        fc.fillStyle = rgbaHex(YEL, 0.55);
        fc.beginPath();
        fc.moveTo(...to3D(-0.006, -0.16));
        fc.lineTo(...to3D(-0.1, -0.16));
        fc.lineTo(...to3D(-0.1, 0.05));
        fc.lineTo(...to3D(0.02, 0.05));
        fc.closePath();
        fc.fill();
        // Dark purple-black inner ribbon along underside of whip
        fc.beginPath();
        fc.moveTo(...to3D(0.06, -0.22));
        fc.bezierCurveTo(...to3D(0.034, -0.322), ...to3D(-0.03, -0.376), ...to3D(-0.1, -0.372));
        fc.bezierCurveTo(...to3D(-0.21, -0.362), ...to3D(-0.33, -0.336), ...to3D(-0.452, -0.31));
        fc.bezierCurveTo(...to3D(-0.33, -0.31), ...to3D(-0.22, -0.33), ...to3D(-0.13, -0.33));
        fc.bezierCurveTo(...to3D(-0.05, -0.33), ...to3D(-0.012, -0.26), ...to3D(-0.006, -0.16));
        fc.closePath();
        fc.fillStyle = makeLin(fc, 0, 0.2, -0.3, 0.38, [
          [0, DK2],
          [1, DK],
        ]);
        fc.fill();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Pointed Yellow-Black Anal Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(0.215, 0.262));
  analShape.bezierCurveTo(...to3D(0.17, 0.315), ...to3D(0.1, 0.35), ...to3D(0.03, 0.356));
  analShape.quadraticCurveTo(...to3D(0.012, 0.352), ...to3D(0.014, 0.334));
  analShape.bezierCurveTo(...to3D(0.0, 0.25), ...to3D(-0.032, 0.15), ...to3D(-0.052, 0.074));
  analShape.lineTo(...to3D(0.1, 0.08));
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, -0.1, 0, -0.36, [
          [0, CREAM],
          [1, YEL],
        ]);
        fc.fillRect(-0.2, -0.5, 0.6, 0.5);
        fc.beginPath();
        fc.moveTo(...to3D(0.3, 0.2));
        fc.lineTo(...to3D(0.075, 0.2));
        fc.quadraticCurveTo(...to3D(0.03, 0.26), ...to3D(0.012, 0.37));
        fc.lineTo(...to3D(0.3, 0.4));
        fc.closePath();
        fc.fillStyle = makeLin(fc, 0.05, -0.2, 0.15, -0.36, [
          [0, DK2],
          [1, DK],
        ]);
        fc.fill();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Twin Long Dark Purple-Black Pelvic Spikes
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  for (const [bx0, by0, bx1, by1, tx, ty] of [
    [0.196, 0.262, 0.166, 0.262, 0.156, 0.412],
    [0.25, 0.23, 0.222, 0.248, 0.262, 0.37],
  ] as const) {
    const spShape = new THREE.Shape();
    spShape.moveTo(...to3D(bx0, by0));
    spShape.quadraticCurveTo(...to3D((bx0 + tx) / 2 + 0.016, (by0 + ty) / 2), ...to3D(tx, ty));
    spShape.quadraticCurveTo(...to3D((bx1 + tx) / 2 - 0.004, (by1 + ty) / 2), ...to3D(bx1, by1));
    spShape.closePath();
    pelvicFin.add(
      makeSpineFinMesh(
        ctx,
        spShape,
        0,
        0,
        0.0026,
        0.0007,
        (fc) => {
          fc.fillStyle = makeLin(fc, 0, -(by0 + oy2), 0, -(ty + oy2), [
            [0, DK2],
            [1, PUR],
          ]);
          fc.fillRect(-0.1, -0.5, 0.5, 0.4);
        },
        maxAnisotropy,
        true,
        0.001,
        undefined,
        (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
      ).mesh
    );
  }

  // Long Upward-Swept Dark Blade Pectoral Fin
  const [pecOx, pecOy] = to3D(0.14, 0.1);
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.012, 0.018);
  pecShape.bezierCurveTo(-0.04, 0.082, -0.1, 0.15, -0.166, 0.19);
  pecShape.quadraticCurveTo(-0.166, 0.165, -0.142, 0.122);
  pecShape.bezierCurveTo(-0.1, 0.05, -0.062, -0.002, -0.024, -0.028);
  pecShape.quadraticCurveTo(0.012, -0.022, 0.012, 0.018);
  pecShape.closePath();

  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.0026,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0.18, [
        [0, DK2],
        [0.6, DK],
        [1, PUR],
      ]);
      fc.fillRect(-0.3, -0.1, 0.4, 0.4);
      drawFinRays(
        fc,
        [0, 0],
        [
          [-0.16, 0.18],
          [-0.15, 0.145],
          [-0.12, 0.095],
        ],
        rgbaHex(PUR, 0.75),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.001
  );
  const pecZIdol =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      pecOx,
      pecOy,
      0.22,
      1.0
    ) + 0.009;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, pecZIdol);
  pecLeft.rotation.x = 0.26;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -pecZIdol);
  pecRight.rotation.x = -0.26;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const [ex, ey] = to3D(0.238, -0.094);
  const idolEz = surfaceZAt(evalTop, evalBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), ex, ey);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: idolEz,
    er: 0.038,
    irisColor: pal.iris || "#8a3324",
    rimColor: OL,
    lidColor: "#2f1e4e",
    lidTilt: 0.28,
    happyColor: "#d9ccf5",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#fff0c4", 0.044);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.045,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.84 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.24;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.86, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 8. NAPOLEON WRASSE (Ikan Napoleon — Overhanging Wen, Wide-Open Jaw, Cushion Lips, Clear Eye)
// =====================================================================================
function createParrot3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#093648";
  const B = pal.body; // #18b848
  const D = pal.dark; // #08682c
  const BEL = pal.belly; // #19a858
  const CYAN = pal.stripe || "#14b4d8";
  const CHEV = pal.spot || "#095424";
  const ROYAL = "#0e4eb8";
  const NAVY = "#0d3b82";

  const ctx = createRigContext(OL, "#c0c0c0");
  const { track, uniforms, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.34;
  const xSnout = 0.37;
  // Terminal jaw hinge tucked smoothly into the cheek so chin & belly stay 100% seamless when closed and open wide cleanly!
  const hx = 0.268;
  const hy = -0.032;

  // Monotonically ascending-X dorsal silhouette (bold rounded jenong & concave bridge sculpted cleanly in 3D vertices below)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.056],
          [-0.22, 0.145],
          [-0.02, 0.214],
          [0.105, 0.23],
        ],
        [
          [0.105, 0.23],
          [0.165, 0.246],
          [0.215, 0.238],
          [0.24, 0.158],
        ],
        [
          [0.24, 0.158],
          [0.268, 0.114],
          [0.32, 0.06],
          [xSnout, 0.014],
        ],
      ],
      28
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.056],
          [-0.22, -0.142],
          [-0.02, -0.202],
          [0.12, -0.204],
        ],
        [
          [0.12, -0.204],
          [0.225, -0.194],
          [0.312, -0.128],
          [xSnout, -0.022],
        ],
      ],
      28
    )
  );

  // Mouth parting seam curving gently upward from hinge (hx, hy) to snout front (xSnout, 0.002)
  const mouthSeam = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy + (0.002 - hy) * Math.pow(u, 0.88);
  };

  // Full rounded cheeks & plump broad snout
  const evalZ = (x: number, t: number) => {
    const base = 0.042 + 0.116 * Math.sin(Math.pow(clamp(t, 0, 1), 0.68) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.28, 0.72, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.38, 0.46, -0.29, 0.29, 512);

  // Paint Image 2 Napoleon coat: 10 zigzags first -> seamless Cyan head & wen -> Cobalt chin -> soft brow & curved gill arc
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.23, 0, 0.23, [
    [0, D],
    [0.42, "#18c450"],
    [0.82, B],
    [1, mixHex(D, BEL, 0.45)],
  ]);
  bc.fillRect(-0.44, -0.32, 0.96, 0.64);

  // 10 dark-forest-green wavy vertical zigzag stripes across the emerald body
  bc.strokeStyle = rgbaHex(CHEV, 0.72);
  bc.lineWidth = 0.0076;
  bc.lineCap = "round";
  bc.lineJoin = "round";
  for (let c = 0; c < 10; c++) {
    const cx = 0.155 - c * 0.048;
    bc.beginPath();
    for (let s = 0; s <= 12; s++) {
      const sy = -0.2 + s * 0.034;
      const sx = cx + (s % 2 ? 0.009 : -0.009);
      if (s === 0) bc.moveTo(sx, sy);
      else bc.lineTo(sx, sy);
    }
    bc.stroke();
  }

  // Diagonal curved cyan-turquoise head & forehead dome (painted OVER front stripes so head stays clean!)
  const headDiag = makeLin(bc, 0.03, -0.1, 0.26, 0.04, [
    [0, "rgba(20, 180, 216, 0)"],
    [0.42, "rgba(20, 180, 216, 0.88)"],
    [0.72, CYAN],
    [1, "#1cd0ea"],
  ]);
  bc.fillStyle = headDiag;
  bc.fillRect(-0.02, -0.32, 0.56, 0.64);

  // Extra cyan-cobalt crown coverage over the forward-overhanging wen
  const crownGrad = bc.createRadialGradient(0.23, -0.185, 0.02, 0.21, -0.165, 0.22);
  crownGrad.addColorStop(0, "#18c4e8");
  crownGrad.addColorStop(0.65, "rgba(20, 174, 216, 0.88)");
  crownGrad.addColorStop(1, "rgba(20, 174, 216, 0)");
  bc.fillStyle = crownGrad;
  bc.fillRect(-0.04, -0.32, 0.52, 0.34);

  // Seamless deep royal cobalt-blue along throat, chin & lower cheek
  const chinGrad = bc.createRadialGradient(0.23, 0.14, 0.02, 0.21, 0.12, 0.24);
  chinGrad.addColorStop(0, rgbaHex(ROYAL, 0.94));
  chinGrad.addColorStop(0.54, rgbaHex(ROYAL, 0.68));
  chinGrad.addColorStop(0.84, rgbaHex(ROYAL, 0.16));
  chinGrad.addColorStop(1, rgbaHex(ROYAL, 0));
  bc.fillStyle = chinGrad;
  bc.fillRect(-0.06, -0.28, 0.58, 0.6);

  // Soft volumetric jenong dome highlight + deep underside overhang & eye-socket brow shade (Image 1)
  drawGlow(bc, 0.244, -0.205, 0.072, 0.042, -0.28, "148, 248, 255", 0.3);
  drawGlow(bc, 0.238, -0.145, 0.046, 0.02, -0.35, "6, 66, 110", 0.28);
  drawGlow(bc, 0.222, -0.098, 0.042, 0.032, -0.15, "6, 68, 108", 0.42);
  drawGlow(bc, 0.0, -0.1, 0.16, 0.06, -0.1, "130, 255, 175", 0.16);

  // Two soft parallel dark-teal nose-wrinkle creases tucked behind the upper lip along the 42-deg snout slope
  bc.strokeStyle = rgbaHex("#074462", 0.45);
  bc.lineWidth = 0.0048;
  for (const d of [0, 0.017]) {
    bc.beginPath();
    bc.moveTo(0.312 + d, -0.058 + d * 0.6);
    bc.quadraticCurveTo(0.328 + d, -0.044 + d * 0.5, 0.34 + d, -0.024 + d * 0.4);
    bc.stroke();
  }

  // Gracefully curved soft cobalt operculum (gill cover) arc right in front of the pectoral fin (Image 2)
  bc.beginPath();
  bc.moveTo(0.156, -0.026);
  bc.bezierCurveTo(0.178, 0.026, 0.172, 0.086, 0.126, 0.122);
  bc.strokeStyle = rgbaHex("#0a3b7a", 0.22);
  bc.lineWidth = 0.013;
  bc.stroke();
  bc.strokeStyle = rgbaHex("#09356e", 0.55);
  bc.lineWidth = 0.0052;
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBotFull = (x: number) => interpCurveY(botPts, x);
  const fullBodyZAt = (x: number, y: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const yt = evalTop(x);
    const yb = evalBotFull(x);
    const ym = (yt + yb) * 0.5;
    const hh = Math.max(0.006, (yt - yb) * 0.5);
    const s = clamp((y - ym) / hh, -0.995, 0.995);
    return evalZ(x, t) * Math.sqrt(Math.max(0.01, 1 - s * s)) * (1 - 0.22 * s * s);
  };

  // Build Upper Cranium + Smooth Cheek (-0.34 .. 0.37), keeping full belly down to hx - 0.022 so ZERO chin notch!
  const bodyU = 84;
  const bodyV = 36;
  const bodyRingCols = bodyV + 1;
  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: bodyU,
      vSteps: bodyV,
      evalTopY: evalTop,
      evalBotY: blendBotToPalate(evalBotFull, mouthSeam, hx, 0.022, 0.012),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: false,
    })
  );

  // Sculpt bold rounded overhanging Napoleon jenong + deep concave nose bridge + flush upper cheek down to mouthSeam
  const bPos = bodyGeo.attributes.position;
  const bUv = bodyGeo.attributes.uv;
  for (let i = 0; i <= bodyU; i++) {
    const t = i / bodyU;
    const x = xTail + (xSnout - xTail) * t;
    const kSplit = smoothstep(hx - 0.022, hx + 0.012, x);
    const mY = mouthSeam(x);
    const yt = evalTop(x);

    for (let j = 0; j <= bodyV; j++) {
      const idx = i * bodyRingCols + j;
      let vx = bPos.getX(idx);
      let vy = bPos.getY(idx);
      let vz = bPos.getZ(idx);

      if (kSplit > 0.001) {
        const phi = (j / bodyV) * Math.PI * 2;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const fullCheckY = sinP >= 0 ? mY + (yt - mY) * sinP : mY + 0.004 * Math.abs(sinP);
        const fullW = fullBodyZAt(x, sinP >= 0 ? fullCheckY : mY) * cosP;
        vy = vy * (1 - kSplit) + fullCheckY * kSplit;
        vz = vz * (1 - kSplit) + fullW * kSplit;
      }

      // Bold, broad, rounded overhanging Napoleon jenong dome matching Image 1
      const wenDx = (vx - 0.205) / 0.075;
      const wenDy = clamp((vy - 0.135) / 0.105, 0, 1);
      const wenK = Math.exp(-wenDx * wenDx * 1.15) * Math.sin(wenDy * Math.PI * 0.78);
      if (wenK > 0.001) {
        vx += wenK * 0.044;
        vy += wenK * 0.014;
        vz *= 1 + wenK * 0.24;
      }

      // Concave saddle hollow right below the jenong in front of the eye socket
      const dipY = smoothstep(0.088, 0.125, vy) * (1 - smoothstep(0.148, 0.178, vy));
      const dipX = smoothstep(0.205, 0.238, vx) * (1 - smoothstep(0.27, 0.305, vx));
      const dipK = dipX * dipY;
      if (dipK > 0) {
        vx -= dipK * 0.013;
        vy -= dipK * 0.004;
      }

      bPos.setXYZ(idx, vx, vy, vz);
      const [tu, tv] = mapUV(vx, vy);
      bUv.setXY(idx, tu, tv);
    }
  }
  bPos.needsUpdate = true;
  bUv.needsUpdate = true;
  bodyGeo.computeVertexNormals();

  const bodyMat = makeFishMat(bodyTex, {
    roughness: 0.86,
    clearcoat: 0.03,
    envMapIntensity: 0.06,
    emissiveIntensity: 0.12,
  });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Articulated Lower Jaw & Chin (lGeo) overlapping seamlessly behind hx on fullBodyZ -> ZERO notch when closed, WIDE-OPEN jaw when biting!
  const lowerU = 38;
  const lowerV = 28;
  const lowerRingCols = lowerV + 1;
  const xLowStart = hx - 0.025;
  const evalLowerBot = (x: number) => {
    const b = evalBotFull(x);
    if (x >= hx - 0.01) return b;
    const k = clamp((hx - 0.01 - x) / 0.015, 0, 1);
    return b + 0.014 * k;
  };
  const lGeo = track(
    buildLoftedSurface({
      xStart: xLowStart,
      xEnd: xSnout,
      uSteps: lowerU,
      vSteps: lowerV,
      evalTopY: (x) => mouthSeam(Math.max(x, hx)) - 0.001,
      evalBotY: evalLowerBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: false,
    })
  );
  const lPos = lGeo.attributes.position;
  const lUv = lGeo.attributes.uv;
  for (let i = 0; i <= lowerU; i++) {
    const t = i / lowerU;
    const wx = xLowStart + (xSnout - xLowStart) * t;
    const inset = wx < hx ? 0.8 + 0.195 * clamp((wx - xLowStart) / (hx - xLowStart), 0, 1) : 0.995;
    const topLim = mouthSeam(Math.max(wx, hx)) - 0.001;
    const botLim = evalLowerBot(wx);
    for (let j = 0; j <= lowerV; j++) {
      const idx = i * lowerRingCols + j;
      const phi = (j / lowerV) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const wy = sinP <= 0 ? topLim + (topLim - botLim) * sinP : topLim - 0.004 * sinP;
      const targetZ = fullBodyZAt(wx, sinP <= 0 ? wy : topLim) * inset * cosP;
      lPos.setXYZ(idx, wx - hx, wy - hy, targetZ);
      const [tu, tv] = mapUV(wx, wy);
      lUv.setXY(idx, tu, tv);
    }
  }
  lPos.needsUpdate = true;
  lUv.needsUpdate = true;
  lGeo.computeVertexNormals();

  const lowerMat = makeFishMat(bodyTex, {
    roughness: 0.86,
    clearcoat: 0.03,
    envMapIntensity: 0.06,
    emissiveIntensity: 0.12,
  });
  injectSpineShader(lowerMat, uniforms, hx, hy);

  // Plump Rounded Horseshoe U-Arch Cushion Lips matching Image 2 (NO flat duck-bill planks!)
  const makeArchLipGeo = (
    xFront: number,
    yFront: number,
    xCorner: number,
    yCorner: number,
    zCorner: number,
    rFront: number,
    rCorner: number,
    isUpper: boolean
  ) => {
    const uSegs = 28;
    const vSegs = 16;
    const ring = vSegs + 1;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const cCrest = new THREE.Color(isUpper ? "#72f7ff" : "#56ebfc");
    const cOuter = new THREE.Color(isUpper ? "#18bfe2" : ROYAL);
    const cInner = new THREE.Color("#08486c");
    const tmp = new THREE.Color();

    const archPt = (u: number): [number, number, number] => {
      const s = u * 2 - 1; // -1 .. +1
      const z = s * zCorner;
      const a = 1 - s * s; // 0 at corners, 1 at center front
      const x = xCorner + (xFront - xCorner) * Math.pow(a, 0.82);
      const y = yCorner + (yFront - yCorner) * Math.pow(a, 0.9);
      return [x, y, z];
    };

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const s = u * 2 - 1;
      const archFactor = Math.sqrt(Math.max(0, 1 - s * s));
      const rBase = rCorner + (rFront - rCorner) * Math.pow(archFactor, 0.72);
      const endPinch = i === 0 || i === uSegs ? 0.12 : 1;
      const r = rBase * endPinch;

      const [cx, cy, cz] = archPt(u);
      const u0 = Math.max(0, u - 0.02);
      const u1 = Math.min(1, u + 0.02);
      const [x0, y0, z0] = archPt(u0);
      const [x1, y1, z1] = archPt(u1);
      const tx = x1 - x0;
      const ty = y1 - y0;
      const tz = z1 - z0;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const tux = tx / tLen;
      const tuy = ty / tLen;
      const tuz = tz / tLen;

      // Build orthonormal cross-section frame: N = normalize(Up x T) points outward/forward (+X), B = T x N points upward (+Y)
      const upX = 0;
      const upY = 1;
      const upZ = 0;
      let nx = upY * tuz - upZ * tuy;
      let ny = upZ * tux - upX * tuz;
      let nz = upX * tuy - upY * tux;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
      const bx = tuy * nz - tuz * ny;
      const by = tuz * nx - tux * nz;
      const bz = tux * ny - tuy * nx;

      for (let j = 0; j <= vSegs; j++) {
        const phi = (j / vSegs) * Math.PI * 2;
        const cP = Math.cos(phi);
        const sP = Math.sin(phi);
        // Round plump cross-section (1.02 outward x 1.12 vertical)
        const ox = (nx * cP * 1.02 + bx * sP * 1.12) * r;
        const oy = (ny * cP * 1.02 + by * sP * 1.12) * r;
        const oz = (nz * cP * 1.02 + bz * sP * 1.12) * r;
        positions.push(cx + ox, cy + oy, cz + oz);

        const innerMask = isUpper ? -sP : sP;
        const outerMask = isUpper ? sP : -sP;
        if (innerMask > 0.12) {
          tmp.copy(cCrest).lerp(cInner, clamp((innerMask - 0.12) / 0.88, 0, 1) * 0.86);
        } else if (outerMask > 0.25 || cP < -0.15) {
          const k = clamp(Math.max(outerMask > 0.25 ? (outerMask - 0.25) / 0.75 : 0, cP < -0.15 ? (-cP - 0.15) / 0.85 : 0), 0, 1);
          tmp.copy(cCrest).lerp(cOuter, k * 0.92);
        } else {
          tmp.copy(cCrest);
        }
        colors.push(tmp.r, tmp.g, tmp.b);
      }
    }

    for (let i = 0; i < uSegs; i++) {
      for (let j = 0; j < vSegs; j++) {
        const a = i * ring + j;
        const b = (i + 1) * ring + j;
        const c = (i + 1) * ring + (j + 1);
        const d = i * ring + (j + 1);
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }

    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  const lipMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.76,
      clearcoat: 0.03,
      envMapIntensity: 0.05,
    })
  );

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const upperLipGeo = makeArchLipGeo(0.363 - hx, 0.012 - hy, 0.31 - hx, -0.015 - hy, 0.044, 0.0155, 0.006, true);
  upperJawGroup.add(new THREE.Mesh(upperLipGeo, lipMat));

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  lowerJawGroup.add(new THREE.Mesh(lGeo, lowerMat));

  const lowerLipGeo = makeArchLipGeo(0.367 - hx, -0.009 - hy, 0.311 - hx, -0.02 - hy, 0.043, 0.015, 0.006, false);
  lowerJawGroup.add(new THREE.Mesh(lowerLipGeo, lipMat));

  // Compact recessed oral throat cavern & tongue strictly INSIDE the jaw (never bulges out the snout or sides!)
  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    0.264,
    -0.026,
    "#460e1e",
    "#ec6a8e",
    [0.05, 0.034, 0.036],
    [0.032, 0.01, 0.024],
    0.045
  );
  mouthInterior.position.set(0.258, -0.026, 0);
  tongueMesh.position.set(0.295 - hx, -0.028 - hy, 0);

  // Broad Rounded-Corner Mint-Green Paddle Tail w/ Navy Rim & 5 Horizontal Stripes (Image 2)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.014, 0.054);
  tailShape.bezierCurveTo(-0.04, 0.108, -0.115, 0.114, -0.145, 0.088);
  tailShape.bezierCurveTo(-0.165, 0.048, -0.167, -0.048, -0.145, -0.088);
  tailShape.bezierCurveTo(-0.115, -0.114, -0.04, -0.108, 0.014, -0.054);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0036,
    0.001,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, "#0c6e38"],
        [0.45, "#3ac992"],
        [0.82, "#5ee0aa"],
        [1, NAVY],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      fc.strokeStyle = rgbaHex(NAVY, 0.8);
      fc.lineWidth = 0.013;
      fc.lineCap = "round";
      for (const k of [-0.66, -0.33, 0, 0.33, 0.66]) {
        fc.beginPath();
        fc.moveTo(-0.014, k * 0.045);
        fc.lineTo(-0.15, k * 0.092);
        fc.stroke();
      }
    },
    maxAnisotropy,
    false,
    0
  );
  tailPivot.add(tailFin.mesh);

  // Long Sweeping Rounded Emerald-Teal Dorsal & Anal Fins w/ Cobalt-Navy Outer Margin (Image 2)
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.115, 0.205);
  dorsalShape.bezierCurveTo(-0.04, 0.298, -0.23, 0.298, -0.31, 0.162);
  dorsalShape.quadraticCurveTo(-0.29, 0.095, -0.245, 0.056);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.06, 0.11, -0.14, 0.298, [
          [0, "#129c58"],
          [0.54, "#168ea4"],
          [1, NAVY],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.075 - i * 0.044, 0.275]);
        drawFinRays(fc, [-0.06, 0.11], pts, rgbaHex(NAVY, 0.42), 0.0044);
      },
      maxAnisotropy,
      true,
      0
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.025, -0.175);
  analShape.bezierCurveTo(-0.1, -0.272, -0.225, -0.27, -0.285, -0.158);
  analShape.quadraticCurveTo(-0.265, -0.095, -0.242, -0.056);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.12, -0.11, -0.15, -0.272, [
          [0, "#129c58"],
          [0.54, "#168ea4"],
          [1, NAVY],
        ]);
        fc.fillRect(-0.4, -0.4, 0.5, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 6; i++) pts.push([-0.065 - i * 0.04, -0.252]);
        drawFinRays(fc, [-0.14, -0.11], pts, rgbaHex(NAVY, 0.42), 0.0044);
      },
      maxAnisotropy,
      true,
      0
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Broad Rounded Fan-Paddle Pectoral Fin angled outward via onCustomPose so it NEVER clips into the body (Image 2)
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.024);
  pecShape.bezierCurveTo(-0.042, 0.072, -0.118, 0.062, -0.124, -0.006);
  pecShape.bezierCurveTo(-0.126, -0.07, -0.046, -0.076, 0, -0.024);
  pecShape.closePath();
  const pecX = 0.115;
  const pecY = -0.046;
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecX,
    pecY,
    0.0034,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, "#74e8a8"],
        [0.52, "#2ea888"],
        [1, "#10488a"],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      drawFinRays(
        fc,
        [-0.004, 0],
        [
          [-0.112, 0.036],
          [-0.118, 0.012],
          [-0.118, -0.012],
          [-0.11, -0.038],
        ],
        rgbaHex("#0b3a64", 0.48),
        0.0034
      );
    },
    maxAnisotropy,
    false,
    0
  );
  const pecZ =
    surfaceZAt(evalTop, evalBotFull, (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)), pecX, pecY, 0.22, 1) +
    0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecX, pecY, pecZ);
  pecLeft.add(pecObj.mesh);

  const pecRight = new THREE.Group();
  pecRight.position.set(pecX, pecY, -pecZ);
  const pecMeshR = pecObj.mesh.clone();
  pecRight.add(pecMeshR);
  bodyGroup.add(pecLeft, pecRight);

  // Calm, expressive Image-1 eye nestled cleanly in socket right beneath the jenong overhang + matching cyan upper eyelid fold!
  const napEx = 0.224;
  const napEy = 0.094;
  const napEr = 0.032;
  const parrotEz = surfaceZAt(
    evalTop,
    evalBotFull,
    (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
    napEx,
    napEy,
    0.22,
    0.96
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: napEx,
    ey: napEy,
    ez: parrotEz,
    er: napEr,
    sx: 0.88,
    sy: 0.94,
    yawRot: 0.28,
    irisColor: pal.iris || "#0a2a3c",
    rimColor: "#0a4e70",
  });

  // Seamless turquoise-cyan upper eyelid fold matching the surrounding head tone (Image 1 calm hooded eye)
  const lidGeo = track(new THREE.SphereGeometry(napEr * 1.07, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.38));
  lidGeo.scale(0.9, 0.94, 0.36);
  const lidMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#14a6ca",
      emissive: "#14a6ca",
      emissiveIntensity: 0.14,
      roughness: 0.82,
      clearcoat: 0.02,
      envMapIntensity: 0.05,
    })
  );
  for (let i = 0; i < eyesNormal.length; i++) {
    const side = i === 0 ? 1 : -1;
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.set(0, napEr * 0.1, side * napEr * 0.04);
    lid.rotation.z = -0.18;
    eyesNormal[i].add(lid);
  }

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.032, -0.006, "#5cf2ff", 0.056);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.014,
    skipDefaultFins: true,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.48) : 0;
      upperJawGroup.rotation.z = open * 0.22 - tightClamp * 0.06;
      lowerJawGroup.rotation.z = -open * 1.0 + tightClamp * 0.14;
      const hasMouth = open > 0.05;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.26;
        mouthInterior.scale.set(0.84 + open * 0.18, 0.30 + open * 0.96, 0.54 + open * 0.12);
      }
      tongueMesh.visible = open > 0.08;
      tongueMesh.position.y = -0.028 - hy + open * 0.006;

      const finFlutter = p.wag2 * (p.sucking ? 1.55 : 1.0);
      pecLeft.rotation.y = 0.34 + Math.sin(finFlutter) * 0.16;
      pecLeft.rotation.z = -0.14 + Math.cos(finFlutter) * 0.1;
      pecRight.rotation.y = -0.34 - Math.sin(finFlutter + 0.7) * 0.16;
      pecRight.rotation.z = -0.14 + Math.cos(finFlutter + 0.7) * 0.1;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 9. BUTTERFLY (Koral — Lemon-Gold Disc, Smooth Concave Snout, Eye Band & False Ocellus)
// =====================================================================================
function createButterfly3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const YEL = pal.body || "#ffd426";
  const GOLD = pal.dark || "#d9820a";
  const YEL_L = mixHex(YEL, "#ffffff", 0.38);
  const WH = pal.belly || "#fffef2";
  const BLK = pal.stripe || "#1b1412";
  const OL = pal.outline || "#291806";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.23;
  const hx = 0.328;
  const hy = -0.024;
  const xSnout = 0.434;
  const tipY = -0.02;

  // Exact drawButterfly profile in +Y-up (y3 = -y2)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.23, 0.038],
          [-0.215, 0.17],
          [-0.112, 0.275],
          [0.032, 0.275],
        ],
        [
          [0.032, 0.275],
          [0.142, 0.275],
          [0.228, 0.205],
          [0.272, 0.105],
        ],
        [
          [0.272, 0.105],
          [0.305, 0.032],
          [0.365, 0.008],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.23, -0.045],
          [-0.212, -0.16],
          [-0.145, -0.255],
          [-0.035, -0.265],
        ],
        [
          [-0.035, -0.265],
          [0.082, -0.272],
          [0.185, -0.23],
          [0.245, -0.118],
        ],
        [
          [0.245, -0.118],
          [0.305, -0.068],
          [0.375, -0.048],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.016 + 0.072 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheek = x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.26, 0.62, 1) : base;
    const noseStart = 0.365;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.27, 0.47, -0.3, 0.3, 512);

  // Paint Lemon-Gold Butterfly Coat + Pearly Throat + Tapered Charcoal Eye Band + 4 Stripes + False Ocellus
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.02, -0.27, -0.04, 0.27, [
    [0, YEL_L],
    [0.48, YEL],
    [0.9, GOLD],
    [1, mixHex(GOLD, "#7c2d12", 0.28)],
  ]);
  bc.fillRect(-0.34, -0.34, 0.88, 0.68);

  // Soft pearly-white gill & throat gradient
  bc.fillStyle = makeLin(bc, 0.18, 0.02, 0.42, 0.06, [
    [0, WH],
    [0.65, rgbaHex(WH, 0.85)],
    [1, rgbaHex(YEL, 0)],
  ]);
  bc.beginPath();
  bc.moveTo(0.19, -0.06);
  bc.bezierCurveTo(0.175, 0.05, 0.185, 0.14, 0.235, 0.22);
  bc.lineTo(0.45, 0.12);
  bc.lineTo(0.45, -0.06);
  bc.closePath();
  bc.fill();

  // Smooth tapered charcoal eye-band curving from forehead through eye to cheek
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.moveTo(0.142, -0.265);
  bc.bezierCurveTo(0.205, -0.175, 0.242, -0.075, 0.248, 0.045);
  bc.quadraticCurveTo(0.238, 0.088, 0.202, 0.108);
  bc.bezierCurveTo(0.195, -0.02, 0.155, -0.14, 0.088, -0.275);
  bc.closePath();
  bc.fill();

  // 4 subtle vertical reef stripes
  bc.strokeStyle = rgbaHex(GOLD, 0.34);
  bc.lineWidth = 0.0075;
  for (let i = 0; i < 4; i++) {
    const sx = 0.065 - i * 0.062;
    bc.beginPath();
    bc.moveTo(sx, -0.21);
    bc.quadraticCurveTo(sx + 0.022, 0, sx - 0.005, 0.21);
    bc.stroke();
  }

  // White-ringed black false ocellus near rear dorsal fin
  bc.fillStyle = WH;
  bc.beginPath();
  bc.arc(-0.138, -0.128, 0.04, 0, Math.PI * 2);
  bc.fill();
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.arc(-0.138, -0.128, 0.028, 0, Math.PI * 2);
  bc.fill();

  // Top highlight
  bc.fillStyle = "rgba(255, 255, 255, 0.26)";
  drawBlob(bc, 0.0, -0.205, 0.105, 0.03, -0.06);

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.003 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;
  const butterflySpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.228, x1: 0.11, top: true },
      { x0: -0.225, x1: 0.025, top: false },
    ],
    0.024
  );
  const butterflySeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const butterflyMask = (x: number, y: number, z: number) => butterflySpineMask(x, y, z) * butterflySeamMask(x, y, z);

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 56,
    vSteps: 30,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, butterflyMask)), makeOutlineMat(0, 0))
  );

  // Slender Reef Pincer Jaw (upper beak unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0036, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.01,
    hy + 0.002,
    "#2b0f26",
    "#ec6a8e",
    [0.026, 0.02, 0.016],
    [0.02, 0.008, 0.011],
    0.03
  );

  // Translucent Cream-Gold Rounded Tail Fan w/ 7 Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.228, -0.014, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.018, 0.036);
  tailShape.bezierCurveTo(-0.048, 0.092, -0.122, 0.132, -0.172, 0.1);
  tailShape.bezierCurveTo(-0.19, 0.036, -0.19, -0.046, -0.17, -0.106);
  tailShape.bezierCurveTo(-0.118, -0.134, -0.045, -0.092, 0.018, -0.036);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.175, 0, [
        [0, YEL],
        [0.45, pal.tail || "#fff2a8"],
        [1, "rgba(255, 252, 232, 0.9)"],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.172, -0.084 + i * 0.028]);
      drawFinRays(fc, [0.015, 0], pts, rgbaHex(GOLD, 0.34), 0.0035);
    },
    maxAnisotropy,
    false,
    0.0011,
    { transparent: true, opacity: 0.92 }
  );
  tailPivot.add(tailFin.mesh);

  // Smooth Swept Dorsal (w/ black rear rim & 9 rays) & Anal Fin (8 rays)
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.11, 0.235);
  dorsalShape.bezierCurveTo(0.055, 0.342, -0.045, 0.382, -0.15, 0.33);
  dorsalShape.bezierCurveTo(-0.22, 0.275, -0.245, 0.15, -0.228, 0.045);
  dorsalShape.lineTo(-0.08, 0.155);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.18, -0.08, 0.37, [
          [0, GOLD],
          [0.45, YEL],
          [1, YEL_L],
        ]);
        fc.fillRect(-0.4, 0, 0.6, 0.5);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.075 - i * 0.036, 0.35 - Math.abs(i - 4) * 0.014]);
        drawFinRays(fc, [-0.06, 0.14], pts, rgbaHex(GOLD, 0.36), 0.0036);
        fc.strokeStyle = rgbaHex(BLK, 0.7);
        fc.lineWidth = 0.01;
        fc.beginPath();
        fc.moveTo(-0.148, 0.32);
        fc.quadraticCurveTo(-0.212, 0.255, -0.226, 0.075);
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(0.025, -0.242);
  analShape.bezierCurveTo(-0.045, -0.338, -0.155, -0.332, -0.222, -0.205);
  analShape.quadraticCurveTo(-0.242, -0.13, -0.225, -0.055);
  analShape.lineTo(-0.075, -0.15);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.04, -0.18, -0.12, -0.33, [
          [0, GOLD],
          [0.5, YEL],
          [1, YEL_L],
        ]);
        fc.fillRect(-0.4, -0.5, 0.5, 0.5);
        const pts: Pt[] = [];
        for (let i = 0; i < 8; i++) pts.push([0.0 - i * 0.032, -0.32 + i * 0.013]);
        drawFinRays(fc, [-0.09, -0.14], pts, rgbaHex(GOLD, 0.36), 0.0036);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Delicate White Pectoral Fin
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.01);
  pecShape.bezierCurveTo(-0.04, 0.042, -0.095, 0.035, -0.122, 0.005);
  pecShape.bezierCurveTo(-0.088, -0.032, -0.035, -0.042, 0, -0.015);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.135,
    -0.072,
    0.0024,
    0.0007,
    (fc) => {
      fc.fillStyle = rgbaHex(WH, 0.78);
      fc.fillRect(-0.25, -0.15, 0.4, 0.3);
    },
    maxAnisotropy,
    false,
    0.001,
    { transparent: true, opacity: 0.85 }
  );
  pecObj.mesh.rotation.z = 0.45;
  const pecZButterfly =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      0.135,
      -0.072,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.135, -0.072, pecZButterfly);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.135, -0.072, -pecZButterfly);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const butterflyEz = surfaceZAt(evalTop, evalBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.198, 0.092);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.198,
    ey: 0.092,
    ez: butterflyEz,
    er: 0.046,
    sx: 0.9,
    irisColor: pal.iris || "#1e293b",
    rimColor: "#ffffff",
    happyColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#fff0a8", 0.046);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.228,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.84 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.24;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.86, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 10. SNAPPER (Kakap Merah — Proud Sloped Forehead, Pearl Scales, Two-Lobe Dorsal, V-Fork Tail)
// =====================================================================================
function createSnapper3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const R = pal.body || "#eb404c";
  const DK = pal.dark || "#9e1924";
  const RL = mixHex(R, "#ffad9e", 0.38);
  const BELLY = pal.belly || "#ffece8";
  const FIN = pal.fin || "#ff5c4d";
  const OL = pal.outline || "#3a0b10";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.248;
  const hx = 0.285;
  const hy = -0.046;
  const xSnout = 0.406;
  const tipY = -0.042;

  // Exact drawSnapper profile in +Y-up (y3 = -y2)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.248, 0.028],
          [-0.2, 0.115],
          [-0.085, 0.175],
          [0.055, 0.172],
        ],
        [
          [0.055, 0.172],
          [0.19, 0.168],
          [0.325, 0.088],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.248, -0.024],
          [-0.236, -0.054],
          [-0.205, -0.078],
          [-0.08, -0.148],
        ],
        [
          [-0.08, -0.148],
          [0.05, -0.175],
          [0.165, -0.145],
          [0.24, -0.095],
        ],
        [
          [0.24, -0.095],
          [0.305, -0.088],
          [0.355, -0.074],
          [xSnout, tipY],
        ],
      ],
      22
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.096 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheek = x > 0.25 ? base * clamp(1 - (x - 0.25) / 0.24, 0.58, 1) : base;
    const noseStart = 0.335;
    if (x <= noseStart) return cheek;
    const uNose = clamp((x - noseStart) / (xSnout - noseStart), 0, 1);
    const noseRound = Math.sqrt(clamp(1 - uNose * uNose * 0.996, 0.002, 1));
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return Math.max(cheek * noseRound, Math.min(cheek, hH * 0.78));
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.28, 0.44, -0.2, 0.2, 512);

  // Paint Crimson Snapper -> Warm Pearl Belly + Subtle Overlapping Pearl Scales + Gill Arc
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.05, -0.175, 0.02, 0.175, [
    [0, DK],
    [0.36, R],
    [0.64, RL],
    [0.84, BELLY],
    [1, "#ffd8d2"],
  ]);
  bc.fillRect(-0.34, -0.26, 0.85, 0.52);

  // Subtle pearly scale shimmer arcs
  bc.strokeStyle = "rgba(255, 228, 220, 0.26)";
  bc.lineWidth = 0.0042;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const sx = 0.11 - col * 0.054 - (row % 2) * 0.024;
      const sy = -0.05 + row * 0.048;
      bc.beginPath();
      bc.arc(sx, sy, 0.021, -Math.PI * 0.36, Math.PI * 0.36);
      bc.stroke();
    }
  }

  // Gill operculum curve
  bc.strokeStyle = rgbaHex(DK, 0.74);
  bc.lineWidth = 0.0058;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.215, -0.072);
  bc.bezierCurveTo(0.192, -0.01, 0.195, 0.048, 0.224, 0.095);
  bc.stroke();

  // Specular back sheen
  bc.fillStyle = "rgba(255, 220, 210, 0.28)";
  drawBlob(bc, 0.06, -0.125, 0.135, 0.02, 0.06);

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.004 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;
  const snapperSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.185, x1: 0.145, top: true },
      { x0: -0.182, x1: -0.02, top: false },
    ],
    0.026
  );
  const snapperSeamMask = mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, false);
  const snapperMask = (x: number, y: number, z: number) => snapperSpineMask(x, y, z) * snapperSeamMask(x, y, z);

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 56,
    vSteps: 30,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, snapperMask)), makeOutlineMat(0, 0))
  );

  // Clean Pointed Snapper Jaw (upper snout unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = makeFishMat(bodyTex);
  injectSpineShader(lMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0036, mouthSeamOutlineMask(hx, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(hx, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx + 0.01,
    hy + 0.002,
    "#2b0918",
    "#e05a7e",
    [0.032, 0.026, 0.02],
    [0.026, 0.01, 0.014],
    0.036
  );

  // V-Forked Crimson Snapper Tail w/ 7 Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.242, -0.008, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.015, 0.026);
  tailShape.bezierCurveTo(-0.052, 0.078, -0.125, 0.125, -0.175, 0.135);
  tailShape.quadraticCurveTo(-0.145, 0.042, -0.118, 0);
  tailShape.quadraticCurveTo(-0.145, -0.042, -0.172, -0.132);
  tailShape.bezierCurveTo(-0.122, -0.122, -0.05, -0.075, 0.015, -0.026);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0034,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.17, 0, [
        [0, DK],
        [0.5, pal.tail || "#d92b3a"],
        [1, FIN],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.165, -0.105 + i * 0.035]);
      drawFinRays(fc, [0.015, 0], pts, rgbaHex(DK, 0.36), 0.0036);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  tailPivot.add(tailFin.mesh);

  // Smoothly Webbed Two-Lobe Snapper Dorsal Fin w/ Coral Margin & 9 Rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.145, 0.145);
  dorsalShape.bezierCurveTo(0.118, 0.215, 0.065, 0.242, 0.0, 0.232);
  dorsalShape.bezierCurveTo(-0.068, 0.248, -0.145, 0.235, -0.182, 0.172);
  dorsalShape.quadraticCurveTo(-0.2, 0.118, -0.185, 0.062);
  dorsalShape.lineTo(-0.02, 0.12);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0034,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.14, -0.05, 0.24, [
          [0, DK],
          [0.58, FIN],
          [1, "#ff9e7d"],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.115 - i * 0.036, 0.235]);
        drawFinRays(fc, [-0.01, 0.11], pts, rgbaHex(DK, 0.38), 0.0036);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Clean Crimson Anal Fin w/ Coral Edge
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.02, -0.145);
  analShape.bezierCurveTo(-0.06, -0.218, -0.135, -0.222, -0.18, -0.168);
  analShape.quadraticCurveTo(-0.198, -0.118, -0.182, -0.058);
  analShape.lineTo(-0.065, -0.115);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.06, -0.13, -0.12, -0.22, [
          [0, DK],
          [0.55, FIN],
          [1, "#ff9e7d"],
        ]);
        fc.fillRect(-0.4, -0.4, 0.5, 0.4);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Swept Coral Pectoral Fin
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.009);
  pecShape.bezierCurveTo(-0.042, 0.042, -0.108, 0.036, -0.135, 0.004);
  pecShape.bezierCurveTo(-0.098, -0.034, -0.04, -0.042, 0, -0.015);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.155,
    -0.048,
    0.0028,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.13, 0, [
        [0, R],
        [0.6, FIN],
        [1, "#ffb09c"],
      ]);
      fc.fillRect(-0.25, -0.15, 0.4, 0.3);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  pecObj.mesh.rotation.z = 0.38;
  const pecZSnapper =
    surfaceZAt(
      evalTop,
      evalBot,
      (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
      0.155,
      -0.048,
      0.22,
      1.0
    ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.155, -0.048, pecZSnapper);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.155, -0.048, -pecZSnapper);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const snapperEz = surfaceZAt(evalTop, evalBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.285, 0.038);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.285,
    ey: 0.038,
    ez: snapperEz,
    er: 0.042,
    sx: 0.92,
    irisColor: pal.iris || "#f59e0b",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#ffd8d8", 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.242,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.86 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.25;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.88, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 11. BOXFISH KUNING (Boxfish — Adorable Cube-Shaped Yellow Polka-Dot Reef Fish)
// =====================================================================================
function createBoxfish3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const B = pal.body || "#ffd826";
  const D = pal.dark || "#c78506";
  const BEL = pal.belly || "#fff5b8";
  const FIN = pal.fin || "#ffe978";
  const SPOT = pal.spot || "#1c1510";

  const ctx = createRigContext(D, "#4d4d4d");
  const { track, uniforms, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.22;
  const xSnout = 0.252;
  const hx = 0.224;
  const hy = -0.024;
  const tipY = -0.022;

  // Rounded-corner dice/cube boxfish contour
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.038],
          [-0.195, 0.165],
          [-0.135, 0.205],
          [0.01, 0.205],
        ],
        [
          [0.01, 0.205],
          [0.145, 0.205],
          [0.215, 0.165],
          [xSnout, tipY + 0.008],
        ],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.038],
          [-0.195, -0.175],
          [-0.135, -0.208],
          [0.01, -0.208],
        ],
        [
          [0.01, -0.208],
          [0.148, -0.208],
          [0.22, -0.17],
          [xSnout - 0.003, tipY - 0.01],
        ],
      ],
      24
    )
  );

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (x: number, t: number) => {
    const u = clamp(t, 0, 1);
    const boxEnvelope = Math.pow(Math.sin(Math.pow(u, 0.72) * Math.PI), 0.36);
    const base = 0.028 + 0.158 * boxEnvelope;
    if (x > 0.21) {
      const n = clamp((x - 0.21) / (xSnout - 0.21), 0, 1);
      return base * Math.sqrt(Math.max(0.01, 1 - n * n * 0.94));
    }
    return base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.26, 0.28, -0.24, 0.24, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.21, 0, 0.21, [
    [0, mixHex(D, B, 0.45)],
    [0.22, B],
    [0.68, B],
    [1, mixHex(BEL, B, 0.45)],
  ]);
  bc.fillRect(-0.32, -0.28, 0.68, 0.56);

  // Subtle hexagonal carapace plate lines
  bc.strokeStyle = rgbaHex(D, 0.24);
  bc.lineWidth = 0.0045;
  for (const gx of [-0.1, -0.01, 0.08]) {
    bc.beginPath();
    bc.moveTo(gx, -0.2);
    bc.quadraticCurveTo(gx - 0.02, 0, gx + 0.01, 0.2);
    bc.stroke();
  }

  // Adorable black polka-dots rimmed in golden halo
  const dots: [number, number, number][] = [
    [-0.155, -0.095, 0.018],
    [-0.085, -0.135, 0.022],
    [0.01, -0.145, 0.020],
    [0.095, -0.125, 0.017],
    [-0.145, 0.01, 0.023],
    [-0.06, -0.025, 0.025],
    [0.035, -0.03, 0.022],
    [-0.125, 0.115, 0.019],
    [-0.025, 0.105, 0.024],
    [0.065, 0.125, 0.018],
    [0.145, 0.11, 0.015],
    [-0.185, -0.01, 0.014],
  ];
  for (const [dx, dy, dr] of dots) {
    bc.fillStyle = rgbaHex(BEL, 0.45);
    bc.beginPath();
    bc.arc(dx, dy, dr * 1.24, 0, Math.PI * 2);
    bc.fill();
    bc.fillStyle = SPOT;
    bc.beginPath();
    bc.arc(dx, dy, dr, 0, Math.PI * 2);
    bc.fill();
  }

  // Soft rosy coral cheek blush
  drawGlow(bc, 0.145, 0.065, 0.034, 0.022, 0, "255,120,120", 0.36);

  // Cute pouting mouth corner crease
  bc.strokeStyle = rgbaHex(D, 0.65);
  bc.lineWidth = 0.005;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(xSnout - 0.004, -tipY);
  bc.quadraticCurveTo(hx + 0.012, -hy + 0.004, hx, -hy);
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy + u * (tipY - hy);
  };
  const { bodyGeo, lowerJawGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.003,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
    mapUV,
    uSteps: 48,
    vSteps: 28,
    rearBulge: 0.008,
  });
  track(bodyGeo);
  track(lowerJawGeo);

  const bodyMat = makeFishMat(bodyTex, { roughness: 0.72, emissiveIntensity: 0.16 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const jawMat = makeFishMat(bodyTex, { roughness: 0.72, emissiveIntensity: 0.16 });
  injectSpineShader(jawMat, uniforms, hx, hy);
  lowerJawGroup.add(new THREE.Mesh(lowerJawGeo, jawMat));

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#521224", "#ff7c94", [0.028, 0.024, 0.022], [0.02, 0.009, 0.014], 0.022);

  // Cute tiny translucent yellow dorsal & anal fins + fanned paddle tail
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.08, 0.19);
  dorsalShape.bezierCurveTo(-0.095, 0.265, -0.155, 0.275, -0.175, 0.235);
  dorsalShape.bezierCurveTo(-0.185, 0.205, -0.165, 0.175, -0.14, 0.165);
  dorsalShape.closePath();
  const dorsalFin = makeSpineFinMesh(
    ctx,
    dorsalShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, -0.12, 0.17, -0.14, 0.27, [
        [0, rgbaHex(B, 0.9)],
        [1, rgbaHex(FIN, 0.65)],
      ]);
      fc.fillRect(-0.25, 0.1, 0.2, 0.25);
    },
    maxAnisotropy,
    true,
    0,
    { transparent: true, opacity: 0.86 }
  ).mesh;
  bodyGroup.add(dorsalFin);

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.08, -0.19);
  analShape.bezierCurveTo(-0.095, -0.26, -0.15, -0.268, -0.17, -0.228);
  analShape.bezierCurveTo(-0.18, -0.2, -0.16, -0.175, -0.14, -0.168);
  analShape.closePath();
  const analFin = makeSpineFinMesh(
    ctx,
    analShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, -0.12, -0.17, -0.14, -0.26, [
        [0, rgbaHex(B, 0.9)],
        [1, rgbaHex(FIN, 0.65)],
      ]);
      fc.fillRect(-0.25, -0.32, 0.2, 0.25);
    },
    maxAnisotropy,
    true,
    0,
    { transparent: true, opacity: 0.86 }
  ).mesh;
  bodyGroup.add(analFin);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.006, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.032);
  tailShape.bezierCurveTo(-0.045, 0.095, -0.115, 0.11, -0.132, 0.055);
  tailShape.bezierCurveTo(-0.145, 0.015, -0.145, -0.015, -0.132, -0.055);
  tailShape.bezierCurveTo(-0.115, -0.11, -0.045, -0.095, 0.01, -0.032);
  tailShape.closePath();
  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0034,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.14, 0, [
        [0, B],
        [0.55, FIN],
        [1, rgbaHex(BEL, 0.8)],
      ]);
      fc.fillRect(-0.2, -0.16, 0.25, 0.32);
      drawFinRays(fc, [0, 0], [[-0.125, 0.06], [-0.135, 0.02], [-0.135, -0.02], [-0.125, -0.06]], rgbaHex(D, 0.35), 0.003);
    },
    maxAnisotropy,
    false,
    0,
    { transparent: true, opacity: 0.9 }
  ).mesh;
  tailPivot.add(tailFin);

  // Rapid-fluttering tiny translucent pectoral fins on boxy cheeks
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.032, 0.048, -0.075, 0.036, -0.078, -0.002);
  pecShape.bezierCurveTo(-0.075, -0.038, -0.03, -0.044, 0, -0.012);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.068,
    -0.012,
    0.0025,
    0.0006,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.08, 0, [
        [0, rgbaHex(B, 0.85)],
        [1, rgbaHex(BEL, 0.55)],
      ]);
      fc.fillRect(-0.12, -0.08, 0.16, 0.16);
    },
    maxAnisotropy,
    false,
    0,
    { transparent: true, opacity: 0.78 }
  ).mesh;
  const pecZ = surfaceZAt(evalTop, evalBot, (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)), 0.068, -0.012) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.068, -0.012, pecZ);
  pecLeft.add(pecObj);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.068, -0.012, -pecZ);
  pecRight.add(pecObj.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const boxEz = computeEyeZ(evalTop, evalBot, (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)), 0.156, 0.068, 0.048);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.156,
    ey: 0.068,
    ez: boxEz,
    er: 0.048,
    sx: 0.94,
    sy: 1.0,
    yawRot: 0.22,
    irisColor: pal.iris || "#182b4d",
    rimColor: D,
    happyColor: "#3d2502",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#fff2a8", 0.046);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.006,
    skipDefaultFins: true,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      // Keep boxy carapace crisp and cube-like while fluttering tiny fins super fast!
      uniforms.uSwimAmp.value *= 0.28;
      const fastFlutter = p.wag2 * (p.sucking ? 3.2 : 2.35);
      pecLeft.rotation.y = 0.42 + Math.sin(fastFlutter) * 0.42;
      pecLeft.rotation.z = Math.cos(fastFlutter) * 0.24;
      pecRight.rotation.y = -0.42 - Math.sin(fastFlutter + 0.6) * 0.42;
      pecRight.rotation.z = Math.cos(fastFlutter + 0.6) * 0.24;
      dorsalFin.rotation.y = Math.sin(fastFlutter * 1.1) * 0.24;
      analFin.rotation.y = -Math.sin(fastFlutter * 1.1) * 0.22;
      tailPivot.rotation.y = -Math.sin(fastFlutter * 0.85) * 0.46;

      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.78 + tightClamp * 0.16;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.24;
        mouthInterior.scale.set(0.84 + open * 0.16, 0.28 + open * 0.85, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = -0.002 + open * 0.005;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 12. KUDA LAUT MAHKOTA (Seahorse — Graceful Upright S-Curve, Crowned Head & Curled Tail)
// =====================================================================================
function createSeahorse3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const B = pal.body || "#ff8c9e";
  const D = pal.dark || "#d6456e";
  const BEL = pal.belly || "#ffe49e";
  const FIN = pal.fin || "#ffd15c";
  const STR = pal.stripe || "#ffdf6b";

  const ctx = createRigContext(D, "#4d4d4d");
  const { track, uniforms, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Paint upright ribbed gold & sakura-coral seahorse skin texture
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 256;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 256, 512, [
    [0, FIN],
    [0.25, B],
    [0.65, D],
    [1, mixHex(D, FIN, 0.35)],
  ]);
  bc.fillRect(0, 0, 256, 512);
  // Creamy golden chest/belly highlight along front (v along cross-section)
  const bellyG = bc.createLinearGradient(0, 0, 256, 0);
  bellyG.addColorStop(0, BEL);
  bellyG.addColorStop(0.32, rgbaHex(BEL, 0.5));
  bellyG.addColorStop(0.65, "rgba(255,255,255,0)");
  bellyG.addColorStop(1, rgbaHex(D, 0.45));
  bc.fillStyle = bellyG;
  bc.fillRect(0, 0, 256, 512);
  // Signature bony seahorse body rings
  bc.strokeStyle = rgbaHex(STR, 0.55);
  bc.lineWidth = 5;
  for (let y = 26; y < 492; y += 26) {
    bc.beginPath();
    bc.moveTo(0, y);
    bc.quadraticCurveTo(128, y + 8, 256, y);
    bc.stroke();
  }
  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  // Build custom ringed S-curved seahorse torso + head + tubular snout (x forward, y upright)
  // Spine stations: [x, y, rx (fore-aft thickness), rz (lateral thickness)]
  const spine: [number, number, number, number][] = [
    [-0.085, 0.255, 0.048, 0.036], // back of head
    [-0.025, 0.285, 0.066, 0.052], // domed skull
    [0.038, 0.252, 0.072, 0.056], // cheek & forehead
    [0.022, 0.175, 0.050, 0.042], // slender arched neck
    [-0.010, 0.105, 0.062, 0.048], // upper chest
    [0.015, 0.020, 0.088, 0.062], // proud rounded belly
    [-0.015, -0.072, 0.074, 0.052], // lower belly
    [-0.048, -0.152, 0.048, 0.038], // waist taper
    [-0.052, -0.228, 0.034, 0.028], // upper tail
    [-0.020, -0.292, 0.024, 0.020], // lower tail sweep
    [0.032, -0.324, 0.019, 0.016], // curl bottom
    [0.074, -0.292, 0.015, 0.013], // curl forward-up
    [0.062, -0.246, 0.011, 0.010], // curl inward
    [0.028, -0.256, 0.008, 0.007], // inner spiral tip
  ];

  // Build smooth lofted ring tube along spine
  const radialSegs = 22;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < spine.length; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const tlen = Math.hypot(tx, ty) || 1;
    tx /= tlen;
    ty /= tlen;
    // Normal in XY plane pointing forward (+x roughly)
    const nx = -ty;
    const ny = tx;
    const [cx, cy, rx, rz] = spine[i];
    const vCoord = i / (spine.length - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Slight belly rib ridges along rings
      const ridge = 1 + 0.06 * Math.sin(vCoord * Math.PI * 22);
      const px = cx + nx * ca * rx * ridge;
      const py = cy + ny * ca * rx * ridge;
      const pz = sa * rz * ridge;
      positions.push(px, py, pz);
      uvs.push(Math.abs(ca * 0.5 + 0.5), vCoord);
    }
  }
  const stride = radialSegs + 1;
  for (let i = 0; i < spine.length - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const torsoGeo = track(new THREE.BufferGeometry());
  torsoGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  torsoGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  torsoGeo.setIndex(indices);
  torsoGeo.computeVertexNormals();

  const bodyMat = makeFishMat(bodyTex, { roughness: 0.55, emissiveIntensity: 0.18 });
  bodyGroup.add(new THREE.Mesh(torsoGeo, bodyMat));

  // Signature trumpet snout extending from cheek (0.08, 0.235) out to (0.215, 0.215)
  const snoutGeo = track(new THREE.CylinderGeometry(0.022, 0.036, 0.145, 16));
  snoutGeo.rotateZ(-Math.PI / 2 - 0.14);
  snoutGeo.translate(0.145, 0.228, 0);
  const snoutMat = track(
    new THREE.MeshStandardMaterial({
      color: mixHex(B, BEL, 0.3),
      emissive: B,
      emissiveIntensity: 0.15,
      roughness: 0.52,
    })
  );
  bodyGroup.add(new THREE.Mesh(snoutGeo, snoutMat));

  // Royal 5-point golden coronet crown on top of head
  const crownGroup = new THREE.Group();
  crownGroup.position.set(-0.015, 0.31, 0);
  const crownMat = track(
    new THREE.MeshStandardMaterial({
      color: FIN,
      emissive: FIN,
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.18,
    })
  );
  for (let i = 0; i < 5; i++) {
    const a = -0.58 + i * 0.29;
    const h = i === 2 ? 0.068 : i === 1 || i === 3 ? 0.056 : 0.044;
    const spike = track(new THREE.ConeGeometry(0.015, h, 8));
    spike.rotateZ(-a);
    spike.translate(Math.sin(a) * 0.026, h * 0.4, 0);
    crownGroup.add(new THREE.Mesh(spike, crownMat));
    const pearl = track(new THREE.SphereGeometry(0.011, 8, 6));
    pearl.translate(Math.sin(a) * (0.026 + h * 0.72), h * 0.85, 0);
    crownGroup.add(new THREE.Mesh(pearl, crownMat));
  }
  bodyGroup.add(crownGroup);

  // Articulated flared trumpet mouth rim (snout tip)
  const hx = 0.21;
  const hy = 0.215;
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  const uRim = track(new THREE.TorusGeometry(0.021, 0.008, 8, 14));
  uRim.rotateY(Math.PI / 2);
  upperJawGroup.add(new THREE.Mesh(uRim, crownMat));
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx - 0.005, hy - 0.008, 0);
  const lLip = track(new THREE.SphereGeometry(0.016, 10, 8));
  lLip.scale(1.2, 0.65, 0.9);
  lLip.translate(0.012, -0.004, 0);
  lowerJawGroup.add(new THREE.Mesh(lLip, crownMat));
  bodyGroup.add(lowerJawGroup);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#5c1428", "#ff8da8", [0.018, 0.016, 0.014], [0.012, 0.006, 0.009], 0.01);

  // Rapidly fluttering translucent golden-pink dorsal wing fin on back
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0, 0.068);
  dorsalShape.bezierCurveTo(-0.075, 0.088, -0.145, 0.055, -0.148, 0.0);
  dorsalShape.bezierCurveTo(-0.145, -0.055, -0.075, -0.085, 0, -0.062);
  dorsalShape.closePath();
  const dorsalPivot = new THREE.Group();
  dorsalPivot.position.set(-0.072, 0.018, 0);
  const dorsalMesh = makeSpineFinMesh(
    ctx,
    dorsalShape,
    0,
    0,
    0.0028,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.15, 0, [
        [0, rgbaHex(B, 0.9)],
        [0.55, rgbaHex(FIN, 0.8)],
        [1, rgbaHex(BEL, 0.65)],
      ]);
      fc.fillRect(-0.2, -0.12, 0.25, 0.24);
      drawFinRays(fc, [0, 0], [[-0.13, 0.05], [-0.14, 0.018], [-0.14, -0.018], [-0.13, -0.05]], rgbaHex(D, 0.35), 0.003);
    },
    maxAnisotropy,
    false,
    0,
    { transparent: true, opacity: 0.85 }
  ).mesh;
  dorsalPivot.add(dorsalMesh);
  bodyGroup.add(dorsalPivot);

  // Tiny ear-like pectoral fins behind cheek
  const earShape = new THREE.Shape();
  earShape.moveTo(0, 0.01);
  earShape.bezierCurveTo(-0.032, 0.038, -0.068, 0.025, -0.068, 0.0);
  earShape.bezierCurveTo(-0.068, -0.025, -0.032, -0.036, 0, -0.01);
  earShape.closePath();
  const earMesh = makeSpineFinMesh(
    ctx,
    earShape,
    0,
    0,
    0.0022,
    0.0005,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.07, 0, [
        [0, rgbaHex(FIN, 0.88)],
        [1, rgbaHex(BEL, 0.55)],
      ]);
      fc.fillRect(-0.1, -0.06, 0.14, 0.12);
    },
    maxAnisotropy,
    false,
    0,
    { transparent: true, opacity: 0.8 }
  ).mesh;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.006, 0.195, 0.044);
  pecLeft.add(earMesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.006, 0.195, -0.044);
  pecRight.add(earMesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.03, -0.25, 0);
  bodyGroup.add(tailPivot);
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.062,
    ey: 0.258,
    ez: 0.054,
    er: 0.034,
    sx: 0.96,
    sy: 1.0,
    yawRot: 0.18,
    irisColor: pal.iris || "#1d3557",
    rimColor: D,
    happyColor: "#4a1228",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, hx + 0.025, hy, "#ffe49e", 0.042);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.03,
    isFluke: true,
    skipDefaultFins: true,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      // Graceful upright buoyancy bob & subtle lean into forward swimming
      bodyGroup.position.y = Math.sin(p.tailPh) * 0.018;
      bodyGroup.rotation.z = -p.tilt - clamp(p.swimSpeed, 0, 1.5) * 0.14 + open * 0.1;
      // Buzzing hummingbird-like dorsal & ear-pectoral fin flutter
      const buzz = p.wag2 * (p.sucking ? 3.8 : 2.9);
      dorsalPivot.rotation.y = Math.sin(buzz) * 0.44;
      pecLeft.rotation.y = 0.4 + Math.sin(buzz + 0.5) * 0.38;
      pecRight.rotation.y = -0.4 - Math.sin(buzz + 0.5) * 0.38;
      upperJawGroup.rotation.z = open * 0.22;
      lowerJawGroup.rotation.z = -open * 0.58;
      mouthInterior.visible = open > 0.04;
      if (open > 0.04) {
        mouthInterior.scale.setScalar(0.55 + open * 0.45);
      }
      tongueMesh.visible = false;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 13. NUDIBRANCH PELANGI (Rainbow Sea Slug — Neon Blue, Fiery Orange & Royal Purple)
// =====================================================================================
function createNudibranch3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const BLUE = pal.body || "#1888ff";
  const PURP = pal.dark || "#7c22e8";
  const CYAN = pal.belly || "#38d8ff";
  const ORANGE = pal.fin || "#ff6e14";
  const SPOT = pal.spot || "#b44cff";

  const ctx = createRigContext(PURP, "#424242");
  const { track, uniforms, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.31;
  const xSnout = 0.295;
  const hx = 0.24;
  const hy = -0.045;
  const tipY = -0.045;

  // Sleek arched sea-slug silhouette with flat crawling foot & domed mantle back
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.055],
          [-0.22, 0.058],
          [-0.08, 0.135],
          [0.05, 0.138],
        ],
        [
          [0.05, 0.138],
          [0.165, 0.134],
          [0.255, 0.068],
          [xSnout, tipY + 0.008],
        ],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.072],
          [-0.18, -0.095],
          [-0.02, -0.098],
          [0.1, -0.092],
        ],
        [
          [0.1, -0.092],
          [0.195, -0.086],
          [0.255, -0.068],
          [xSnout - 0.004, tipY - 0.006],
        ],
      ],
      24
    )
  );
  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalZ = (_x: number, t: number) => {
    const u = clamp(t, 0, 1);
    return 0.018 + 0.105 * Math.pow(Math.sin(Math.pow(u, 0.78) * Math.PI), 0.56);
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.34, 0.32, -0.15, 0.18, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  // Rainbow gradient: neon orange crest -> electric ocean blue flank -> royal purple -> cyan skirt
  bc.fillStyle = makeLin(bc, -0.25, -0.14, 0.22, 0.1, [
    [0, ORANGE],
    [0.28, PURP],
    [0.62, BLUE],
    [0.88, CYAN],
    [1, ORANGE],
  ]);
  bc.fillRect(-0.4, -0.2, 0.8, 0.4);

  // Glowing neon orange dorsal stripe & luminous purple-gold speckles
  bc.strokeStyle = ORANGE;
  bc.lineWidth = 0.028;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(-0.24, -0.03);
  bc.quadraticCurveTo(0.0, -0.125, 0.23, -0.045);
  bc.stroke();

  const spots: [number, number, number, string][] = [
    [-0.18, -0.02, 0.016, ORANGE],
    [-0.1, -0.06, 0.02, "#ffdf48"],
    [-0.02, -0.01, 0.022, SPOT],
    [0.06, -0.07, 0.018, ORANGE],
    [0.13, -0.03, 0.016, CYAN],
    [-0.14, 0.04, 0.015, ORANGE],
    [-0.04, 0.05, 0.017, "#ffdf48"],
    [0.08, 0.04, 0.016, SPOT],
  ];
  for (const [sx, sy, sr, col] of spots) {
    bc.fillStyle = rgbaHex(CYAN, 0.42);
    bc.beginPath();
    bc.arc(sx, sy, sr * 1.35, 0, Math.PI * 2);
    bc.fill();
    bc.fillStyle = col;
    bc.beginPath();
    bc.arc(sx, sy, sr, 0, Math.PI * 2);
    bc.fill();
  }
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - hx) / (xSnout - hx), 0, 1);
    return hy + u * (tipY - hy);
  };
  const { bodyGeo, lowerJawGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: hx,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.004,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
    mapUV,
    uSteps: 50,
    vSteps: 26,
  });
  track(bodyGeo);
  track(lowerJawGeo);

  const bodyMat = makeFishMat(bodyTex, { roughness: 0.42, emissiveIntensity: 0.34 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const jawMat = makeFishMat(bodyTex, { roughness: 0.42, emissiveIntensity: 0.34 });
  injectSpineShader(jawMat, uniforms, hx, hy);
  lowerJawGroup.add(new THREE.Mesh(lowerJawGeo, jawMat));

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#3a0e54", "#ff7840", [0.024, 0.018, 0.018], [0.018, 0.008, 0.012], 0.02);

  // Twin curved glowing rhinophores (sensory horns on head)
  const rhinoMat = track(
    new THREE.MeshStandardMaterial({
      color: ORANGE,
      emissive: PURP,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    })
  );
  const rhinophores: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const rGrp = new THREE.Group();
    rGrp.position.set(0.18, 0.088, s * 0.036);
    const stalk = track(new THREE.ConeGeometry(0.017, 0.11, 10));
    stalk.translate(0, 0.048, 0);
    stalk.rotateZ(-0.32);
    stalk.rotateX(s * 0.22);
    const tip = track(new THREE.SphereGeometry(0.014, 8, 6));
    tip.translate(0.034, 0.095, s * 0.02);
    rGrp.add(new THREE.Mesh(stalk, rhinoMat), new THREE.Mesh(tip, rhinoMat));
    bodyGroup.add(rGrp);
    rhinophores.push(rGrp);
  }

  // Crown of feathery fiery-orange gill plumes on rear back (mounted on tailPivot for swaying!)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.155, 0.085, 0);
  bodyGroup.add(tailPivot);
  const gillMat = track(
    new THREE.MeshStandardMaterial({
      color: ORANGE,
      emissive: "#ff8c1a",
      emissiveIntensity: 0.48,
      roughness: 0.4,
    })
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const plume = track(new THREE.ConeGeometry(0.018, 0.095, 7));
    plume.rotateZ(-Math.cos(a) * 0.45 - 0.18);
    plume.rotateX(Math.sin(a) * 0.45);
    plume.translate(Math.cos(a) * 0.022, 0.036, Math.sin(a) * 0.022);
    tailPivot.add(new THREE.Mesh(plume, gillMat));
  }

  // Neon purple & cyan cerata tendrils along mid-back
  const cerataMat = track(
    new THREE.MeshStandardMaterial({
      color: CYAN,
      emissive: SPOT,
      emissiveIntensity: 0.42,
      roughness: 0.38,
    })
  );
  for (let i = 0; i < 4; i++) {
    const cx = 0.08 - i * 0.055;
    for (const s of [-1, 1]) {
      const cer = track(new THREE.ConeGeometry(0.012, 0.068, 7));
      cer.rotateZ(0.32);
      cer.rotateX(s * 0.35);
      cer.translate(cx, 0.125 - i * 0.008, s * 0.042);
      bodyGroup.add(new THREE.Mesh(cer, cerataMat));
    }
  }

  // Ruffled undulating neon skirt lobes on left/right sides (via pecLeft/pecRight)
  const skirtShape = new THREE.Shape();
  skirtShape.moveTo(0.18, 0);
  skirtShape.bezierCurveTo(0.1, 0.05, 0.02, 0.015, -0.04, 0.052);
  skirtShape.bezierCurveTo(-0.12, 0.02, -0.18, 0.045, -0.22, 0);
  skirtShape.lineTo(-0.22, -0.02);
  skirtShape.lineTo(0.18, -0.02);
  skirtShape.closePath();
  const skirtMesh = makeSpineFinMesh(
    ctx,
    skirtShape,
    0,
    0,
    0.0028,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, -0.2, 0.04, 0.18, -0.02, [
        [0, ORANGE],
        [0.5, PURP],
        [1, CYAN],
      ]);
      fc.fillRect(-0.26, -0.06, 0.5, 0.16);
    },
    maxAnisotropy,
    true,
    0,
    { emissiveIntensity: 0.45, transparent: true, opacity: 0.92 }
  ).mesh;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0, -0.068, 0.088);
  pecLeft.rotation.x = Math.PI * 0.38;
  pecLeft.add(skirtMesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0, -0.068, -0.088);
  pecRight.rotation.x = -Math.PI * 0.38;
  pecRight.add(skirtMesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const nudiEz = computeEyeZ(evalTop, evalBot, (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)), 0.215, 0.005, 0.032);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.215,
    ey: 0.005,
    ez: nudiEz,
    er: 0.032,
    sx: 0.95,
    sy: 1.0,
    yawRot: 0.22,
    irisColor: pal.iris || "#ffe14a",
    rimColor: PURP,
    happyColor: "#ff8c1a",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, tipY, "#38d8ff", 0.045);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.155,
    isFluke: true,
    skipDefaultFins: true,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      // Undulating sea-slug glide & swaying rhinophores + dorsal gills
      const wave = p.wag2 * 1.4;
      pecLeft.rotation.x = Math.PI * 0.38 + Math.sin(wave) * 0.24;
      pecRight.rotation.x = -Math.PI * 0.38 + Math.sin(wave + 1.1) * 0.24;
      tailPivot.rotation.z = Math.sin(wave * 0.85) * 0.22;
      tailPivot.rotation.x = Math.cos(wave * 0.7) * 0.16;
      rhinophores[0].rotation.z = Math.sin(wave + 0.4) * 0.16;
      rhinophores[1].rotation.z = Math.sin(wave + 1.0) * 0.16;
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.35) : 0;
      lowerJawGroup.rotation.z = -open * 0.72 + tightClamp * 0.15;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.rotation.z = -open * 0.22;
        mouthInterior.scale.set(0.8 + open * 0.18, 0.3 + open * 0.85, 0.56 + open * 0.14);
      }
      tongueMesh.visible = open > 0.045;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// DISPATCHER
// =====================================================================================
export function createReefFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "minnow":
      return createMinnow3DRig(sp, maxAnisotropy);
    case "pierre":
      return createPierre3DRig(sp, maxAnisotropy);
    case "leon":
      return createLeon3DRig(sp, maxAnisotropy);
    case "peter":
      return createPeter3DRig(sp, maxAnisotropy);
    case "puffer":
      return createPuffer3DRig(sp, maxAnisotropy);
    case "tang":
      return createTang3DRig(sp, maxAnisotropy);
    case "idol":
      return createIdol3DRig(sp, maxAnisotropy);
    case "parrot":
      return createParrot3DRig(sp, maxAnisotropy);
    case "butterfly":
      return createButterfly3DRig(sp, maxAnisotropy);
    case "snapper":
      return createSnapper3DRig(sp, maxAnisotropy);
    case "boxfish":
      return createBoxfish3DRig(sp, maxAnisotropy);
    case "seahorse":
      return createSeahorse3DRig(sp, maxAnisotropy);
    case "nudibranch":
      return createNudibranch3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}
