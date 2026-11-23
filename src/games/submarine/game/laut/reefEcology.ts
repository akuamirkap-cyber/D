import * as T from "three";
import type { Formation } from "../ocean";
import { SHARED, coralMaterial } from "./glsl";
import {
  mulberry32,
  normalizeGeo,
  sampleSdf,
  solidToGeometry,
  sharedGeo,
  type Relief,
} from "./geometry";
import { meshChunk } from "../penyelam/world.js";
import {
  BedSurface,
  makeButtresses,
  makeLimestoneCrown,
  makeSandTerrace,
  sandHeight,
  type SurfaceHit,
} from "./geology";
import { reefForm, REEF_KINDS, STAG, FAN, SPONGE, PORITES, PLATE, KELP, BUBBLE, WHIP, ANEMONE, ORGAN, LETTUCE, TURF, FANALGAE } from "./reefForms";
import { placeReefLife } from "../reefInhabitants";

const TAU = Math.PI * 2,
  up = new T.Vector3(0, 1, 0),
  identity = new T.Matrix4();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type RGB = [number, number, number];
const hues: RGB[][] = [
  [
    [0.96, 0.31, 0.26],
    [1.0, 0.55, 0.29],
    [0.94, 0.32, 0.52],
    [1.0, 0.66, 0.48],
  ],
  [
    [0.82, 0.42, 1.0],
    [0.98, 0.39, 0.79],
    [0.5, 0.57, 1.0],
    [0.72, 0.6, 1.0],
  ],
  [
    [1.0, 0.82, 0.18],
    [1.0, 0.51, 0.23],
    [0.89, 0.95, 0.36],
    [0.98, 0.67, 0.35],
  ],
  [
    [0.38, 0.88, 0.74],
    [0.48, 0.8, 1.0],
    [0.97, 0.66, 0.82],
    [0.86, 0.96, 0.51],
  ],
  [
    [0.35, 0.91, 1.0],
    [0.59, 0.72, 1.0],
    [0.98, 0.55, 0.72],
    [0.38, 0.95, 0.81],
  ],
  [
    [0.58, 0.83, 0.19],
    [0.42, 0.76, 0.25],
    [0.72, 0.89, 0.31],
    [0.34, 0.78, 0.53],
  ],
  [[0.84, 0.61, 1], [1, 0.72, 0.89], [0.77, 0.84, 1], [0.84, 0.69, 0.98]],
  [[0.86, 0.39, 1], [0.48, 0.69, 1], [1, 0.47, 0.77], [0.67, 0.44, 0.95]],
  [[1, 0.58, 0.31], [0.99, 0.43, 0.55], [0.82, 0.63, 1], [0.42, 0.88, 0.85]],
  [[0.96, 0.45, 0.56], [1, 0.6, 0.37], [0.66, 0.54, 0.96], [0.48, 0.87, 0.84]],
  [[0.42, 0.88, 0.93], [0.58, 0.65, 1], [0.7, 0.97, 0.72], [0.96, 0.63, 0.82]],
  [[0.22, 0.78, 0.44], [0.36, 0.85, 0.34], [0.16, 0.72, 0.56], [0.48, 0.86, 0.38]],
  [[0.46, 0.74, 0.42], [0.32, 0.78, 0.62], [0.62, 0.74, 0.36], [0.28, 0.68, 0.54]],
];
const habitatNames = [
  "Teras bercahaya",
  "Dinding berarus",
  "Taman spons",
  "Lereng terlindung",
];

function mineralScans() {
  const loader = new T.TextureLoader(),
    ready = { value: 0 };
  let loaded = 0,
    failed = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const finish = () => {
    if (++loaded === 4) {
      ready.value = failed ? 0 : 1;
      resolve();
    }
  };
  const map = (name: string) => {
    const texture = loader.load(
      `/images/materials/${name}.webp`,
      finish,
      undefined,
      () => {
        failed = true;
        finish();
      },
    );
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 4;
    return { value: texture };
  };
  const uniforms = {
    uStone: map("weathered-stone"),
    uStoneNormal: map("stone-normal"),
    uCrust: map("reef-crust"),
    uSilt: map("sediment"),
    uMapsReady: ready,
  };
  return {
    uniforms,
    done,
    dispose() {
      for (const u of [
        uniforms.uStone,
        uniforms.uStoneNormal,
        uniforms.uCrust,
        uniforms.uSilt,
      ])
        u.value.dispose();
    },
  };
}
function limestone(
  zone: number,
  scans: ReturnType<typeof mineralScans>,
  sand = false,
  edge = false,
) {
  const tones: RGB[] = [
    [0.15, 0.43, 0.52],
    [0.16, 0.29, 0.5],
    [0.14, 0.18, 0.43],
    [0.12, 0.2, 0.34],
  ];
  return new T.ShaderMaterial({
    uniforms: {
      ...SHARED,
      ...scans.uniforms,
      uRock: { value: new T.Vector3(...tones[zone]) },
      uDepth: { value: zone },
      uSand: { value: sand ? 1 : 0 },
      uEdge: { value: edge ? 1 : 0 },
    },
    side: T.DoubleSide,
    transparent: edge,
    depthWrite: !edge,
    vertexShader: `attribute float aShelter;attribute float aLip;attribute float aMouth;uniform vec2 uReefView;varying float occ;varying float lip;varying float mouth;varying vec3 wp;varying vec3 wn;
      void main(){mat4 M=modelMatrix;
      #ifdef USE_INSTANCING
        M=modelMatrix*instanceMatrix;
      #endif
      vec4 w=M*vec4(position,1.);wp=w.xyz;wn=normalize(transpose(inverse(mat3(M)))*normal);occ=aShelter;lip=aLip;mouth=aMouth;w.xy+=uReefView*w.z;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform vec3 uRock;uniform float uDepth,uSand,uEdge,uTime;uniform int uLampCount;uniform vec4 uLampOrigin[7],uLampAxis[7];
      varying float occ;varying float lip;varying float mouth;varying vec3 wp;varying vec3 wn;
      uniform sampler2D uStone,uStoneNormal,uCrust,uSilt,uNoiseTex;uniform float uMapsReady;
      vec3 triplanar(sampler2D t,vec3 p,vec3 blend){return texture2D(t,p.zy).rgb*blend.x+texture2D(t,p.xz).rgb*blend.y+texture2D(t,p.xy).rgb*blend.z;}
      float noise3(vec3 p){
        vec2 uv = (p.xy + vec2(p.z * 0.618, p.z * 0.382)) * 0.0625;
        return texture2D(uNoiseTex, uv).r;
      }
      void main(){if(uEdge>.5&&lip<.09)discard;
        vec3 n=normalize(wn),L=normalize(vec3(-.48,.86,.47));
        float weather=texture2D(uNoiseTex, (wp.xy + wp.z * 0.43) * 0.0015).a * 0.72 + noise3(wp * .071 + 17.) * .28;
        float bed=wp.y*.142+wp.x*.015+wp.z*.008+weather*1.92;
        float seam=(1.-smoothstep(.021,.119,abs(fract(bed)-.48)))*smoothstep(.42,.77,weather);
        float stepBank=smoothstep(.38,.60,weather);
        float fine=noise3(wp*.48+13.);float pit=smoothstep(.67,.84,noise3(wp*.14+6.));
        vec3 stone=uRock*(.74+.72*weather+.16*fine)*(1.-.14*seam)*(1.-.20*pit);
        stone=mix(stone,vec3(.15,.58,.64),smoothstep(.31,.90,n.y)*stepBank*.40*(1.-uDepth*.19));
        float sandCover=uSand>.5?1.:smoothstep(.76,.99,n.y)*(.08+.15*(1.-stepBank))*(1.-occ);
        float wave=sin(wp.x*.10+wp.z*.18+3.*noise3(wp*.013))*.5+.5;
        vec3 silt=mix(vec3(.58,.55,.43),vec3(.82,.78,.62),.48*weather+.39*wave+.12*fine);
        vec3 weights=pow(abs(n),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        vec3 uvw=wp*.0093+vec3(.19,.61,.37);
        vec3 alb;
        if (uMapsReady > .5) {
          vec3 strata=triplanar(uStone,uvw,weights);
          float chalk=dot(strata,vec3(.299,.587,.114));strata=mix(vec3(chalk),strata,.44)*vec3(.99,1.01,.96);
          vec3 mineral=sandCover > .01 ? mix(strata,texture2D(uCrust,wp.xz*.015+wp.y*.0019).rgb,sandCover*.48) : strata;
          vec3 coolMineral=mix(vec3(.075,.28,.40),vec3(.22,.51,.58),dot(mineral,vec3(.299,.587,.114)));
          coolMineral*=.77+.46*weather;coolMineral=mix(coolMineral,coolMineral*vec3(.65,1.16,1.18),stepBank*max(0.,n.y)*.35);
          alb=mix(mix(stone,silt,sandCover),coolMineral,.86);
          if(uSand>.5){vec3 grain=texture2D(uSilt,wp.xz*.0081).rgb;alb=(grain*.69+vec3(.23,.24,.20))*(.85+.21*wave+.06*weather);}
          vec3 tx=texture2D(uStoneNormal,uvw.zy).xyz*2.-1.,ty=texture2D(uStoneNormal,uvw.xz).xyz*2.-1.,tz=texture2D(uStoneNormal,uvw.xy).xyz*2.-1.;
          vec3 mapped=vec3(tx.z*sign(n.x),tx.y,tx.x)*weights.x+vec3(ty.x,ty.z*sign(n.y),ty.y)*weights.y+vec3(tz.x,tz.y,tz.z*sign(n.z))*weights.z;
          n=normalize(mix(n,normalize(mapped),mix(.67,.13,uSand)));
        } else {
          alb = uSand > .5 ? vec3(.65,.64,.50)*(.85+.21*wave+.06*weather) : mix(stone,silt,sandCover);
        }
        float beam=pow(.5+.5*sin(wp.x*.048+wp.z*.033+sin(wp.z*.078+uTime*.34)+weather*6.+uTime*.38),12.);
        float lit=max(dot(n,L),0.);float ao=clamp(1.-occ*.45-.19*(1.-smoothstep(-.55,.42,n.y)),.40,1.);
        vec3 ambient=mix(vec3(.09,.24,.34),vec3(.34,.60,.69),clamp(n.y*.5+.5,0.,1.));
        vec3 c=alb*(ambient+vec3(.77,.96,1.07)*lit*(.88+.21*beam))*ao;
        if(uSand<.5){
          float shelf=smoothstep(.16,.81,n.y)*(1.-occ*.6);
          float caustic=pow(.5+.5*sin(wp.x*.13+wp.z*.08+uTime*.68+3.*noise3(wp*.018)),11.);
          c+=vec3(.06,.19,.23)*caustic*shelf*(1.-uDepth*.16);
          float crackW=1.-abs(2.*noise3(wp*.085+vec3(2.,5.,9.))-1.);
          float crackF=1.-abs(2.*noise3(wp*.18+vec3(11.,3.,7.))-1.);
          float fissure=max(smoothstep(.88,.985,crackW),smoothstep(.90,.99,crackF)*.72)+seam*.65;
          float bioHue=noise3(wp*.022+vec3(4.,1.,8.));
          vec3 bioTint=bioHue<.35
            ? mix(vec3(.12,.94,.62),vec3(.10,.92,1.),smoothstep(.12,.35,bioHue))
            : mix(vec3(.10,.92,1.),vec3(.70,.36,1.),smoothstep(.35,.78,bioHue));
          float bioWave=.55+.45*sin(uTime*1.15+wp.x*.028+wp.y*.024+bioHue*6.28);
          float depthDim=.24+.32*uDepth+smoothstep(300.,1350.,-wp.y)*.55;
          float moss=smoothstep(.38,.88,n.y)*smoothstep(.58,.86,weather)*(1.-occ*.4);
          c=mix(c,c+vec3(.08,.36,.22),.32*moss);
          float rim=smoothstep(.09,.77,lip);
          c+=vec3(.10,.47,.63)*rim*(.42+.14*sin(uTime*1.3+wp.x*.043));
          c+=vec3(.07,.40,.61)*mouth*(.66+.17*sin(uTime*.71+wp.x*.045));
          c=mix(c,vec3(.011,.078,.15)+c*.22,mouth*(1.-max(0.,n.y))*.30);
          c+=bioTint*clamp(fissure,0.,1.2)*(pit*.65+occ*.5+.35)*depthDim*bioWave*.58;
          c+=bioTint*moss*bioWave*depthDim*.16;
          float under=1.-smoothstep(-.10,.30,n.y);
          c=mix(c,vec3(.014,.088,.17)+alb*.14,under*.57);
        }
        if(uLampCount>0){for(int i=0;i<7;i++){if(i>=uLampCount)break;vec3 d=wp-uLampOrigin[i].xyz,axis=uLampAxis[i].xyz;float x=dot(d,axis),reach=uLampOrigin[i].w;
          if(x>0.&&x<reach){vec3 v=d-axis*x;float r=2.+x*abs(uLampAxis[i].w);vec3 lt=uLampAxis[i].w>0.?vec3(1.,.85,.61):vec3(.62,.88,1.);c+=alb*lt*exp(-2.*dot(v,v)/(r*r))*(1.-x/reach)*.67;}}}
        float fog=clamp(.018+uDepth*.062+smoothstep(-8.,-330.,wp.z)*.17,0.,.36);
        c=mix(c,vec3(.055,.28,.39),fog);c+=vec3(.03,.16,.21)*pow(1.-abs(n.z),2.4);
        gl_FragColor=vec4(c,uEdge>.5?smoothstep(.09,.58,lip):1.);}`,
  });
}

export type Attachment = {
  x: number;
  y: number;
  z: number;
  support: string;
  penetration: number;
  point: number[];
  normal: number[];
  patch: number;
  kind: number;
  size: number;
  footprint: number;
};
export type RockBoulderSpot = {
  x: number;
  y: number;
  z: number;
  tilt: number;
  radius: number;
};
type Plant = {
  matrix: T.Matrix4;
  kind: number;
  variant: number;
  color: RGB;
  phase: number;
  maturity: number;
};

export class ReefGarden {
  readonly scans = mineralScans();
  readonly materials = [0, 1, 2, 3].map((i) => limestone(i, this.scans));
  readonly caveMats = [0, 1, 2, 3].map((i) =>
    limestone(i, this.scans, false, true),
  );
  private sand = limestone(2, this.scans, true);
  private growth = coralMaterial({ fog: 0.008, sway: 0.72, double: true });
  private geos = Array.from({ length: REEF_KINDS }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => reefForm(i, 733 + i * 117 + j * 73)),
  );
  private boulders = Array.from({ length: 5 }, (_, i) => {
    const g = normalizeGeo(
      solidToGeometry(meshChunk(23 + i * 41, 2, true).build()),
      "radius",
    );
    g.setAttribute(
      "aShelter",
      new T.Float32BufferAttribute(
        new Float32Array(g.attributes.position.count).fill(0.18),
        1,
      ),
    );
    g.setAttribute(
      "aLip",
      new T.Float32BufferAttribute(
        new Float32Array(g.attributes.position.count),
        1,
      ),
    );
    return g;
  });
  private owned = new Set<{ dispose: () => void }>();

  private stoneBatch(
    parent: T.Group,
    stones: T.Matrix4[],
    zone: number,
    surfaces: BedSurface[],
    prefix: string,
  ) {
    for (let v = 0; v < this.boulders.length; v++) {
      const list = stones.filter((_, i) => i % this.boulders.length === v);
      if (!list.length) continue;
      const mesh = new T.InstancedMesh(
        this.boulders[v],
        this.materials[zone],
        list.length,
      );
      mesh.name = `${prefix}-${v}`;
      list.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        if (prefix === "ledge")
          surfaces.push(
            new BedSurface(this.boulders[v], m, `${mesh.name}:${i}`),
          );
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      this.owned.add(mesh);
    }
  }
  private colonies(group: T.Group, plants: Plant[], zone: number) {
    for (let kind = 0; kind < REEF_KINDS; kind++)
      for (let variant = 0; variant < 3; variant++) {
        const list = plants.filter(
          (p) => p.kind === kind && p.variant === variant,
        );
        if (!list.length) continue;
        const geom = sharedGeo(this.geos[kind][variant]),
          tints = new Float32Array(list.length * 4),
          data = new Float32Array(list.length * 2);
        const mesh = new T.InstancedMesh(geom, this.growth, list.length);
        mesh.name = `colony-${kind}-${variant}`;
        list.forEach((p, i) => {
          mesh.setMatrixAt(i, p.matrix);
          tints.set([...p.color, p.phase], i * 4);
          data.set(
            [
              kind === KELP ? 0.047 : kind === TURF ? 0.068 : kind === FANALGAE ? 0.036 : kind === FAN || kind === WHIP || kind === ANEMONE ? 0.018 : 0.002,
              zone > 1 ? 0.28 : 0,
            ],
            i * 2,
          );
        });
        geom.setAttribute("iTint", new T.InstancedBufferAttribute(tints, 4));
        geom.setAttribute("iData", new T.InstancedBufferAttribute(data, 2));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        this.owned.add(geom);
        this.owned.add(mesh);
      }
  }

  private grotto(root: T.Group, f: Formation, halfZ: number) {
    if (!f.cave) return;
    const cave = f.cave;
    const rng = mulberry32(f.seed ^ 9517),
      points: number[] = [],
      indices: number[] = [];
    for (let k = 0; k < 9; k++) {
      const x = cave.x + (k / 8 - 0.5) * cave.rx * 1.6;
      let y = cave.y;
      if (sampleSdf(f.sdfCave, f.x, f.y, x, y) < 1) continue;
      while (y > cave.y - cave.ry * 2.2 && sampleSdf(f.sdfCave, f.x, f.y, x, y) > 0) y -= 2;
      if (y <= cave.y - cave.ry * 2.2) continue;
      const z = halfZ * (0.12 + rng() * 0.15),
        len = Math.min(cave.ry * 0.28, 3 + rng() * 7);
      const width = 1.2 + rng() * 1.7,
        base = points.length / 3;
      points.push(
        x - width,
        -y - 2,
        z - width,
        x + width,
        -y - 2,
        z - width,
        x + width,
        -y - 2,
        z + width,
        x - width,
        -y - 2,
        z + width,
        x + (rng() - 0.5) * width,
        -y - len,
        z + width * 0.08,
      );
      for (let j = 0; j < 4; j++) indices.push(base + j, base + ((j + 1) % 4), base + 4);
    }
    if (indices.length) {
      const teeth = new T.BufferGeometry();
      teeth.setAttribute("position", new T.Float32BufferAttribute(points, 3));
      teeth.setIndex(indices);
      teeth.computeVertexNormals();
      const n = points.length / 3;
      teeth.setAttribute("aShelter", new T.Float32BufferAttribute(new Float32Array(n), 1));
      teeth.setAttribute("aLip", new T.Float32BufferAttribute(new Float32Array(n).fill(0.18), 1));
      teeth.setAttribute("aMouth", new T.Float32BufferAttribute(new Float32Array(n).fill(0.12), 1));
      const formation = new T.Mesh(teeth, this.materials[f.zone]);
      formation.name = "grotto-ceiling";
      root.add(formation);
      this.owned.add(teeth);
    }
  }

  formation(f: Formation) {
    const root = new T.Group(),
      crown = new T.Group(),
      base = new T.Group();
    root.name = `Terumbu ${f.seed}`;
    crown.name = "living-crown";
    base.name = "limestone-foot";
    root.add(base, crown);
    const { geometry, halfZ } = makeLimestoneCrown(f);
    const rock = new T.Mesh(geometry, this.materials[f.zone]);
    rock.name = "reef";
    crown.add(rock);
    this.owned.add(geometry);
    const foot = makeButtresses(f);
    base.add(new T.Mesh(foot, this.materials[f.zone]));
    this.owned.add(foot);
    this.grotto(crown, f, halfZ);
    const substrate = new BedSurface(geometry, identity, "reef"),
      surfaces = [substrate],
      rng = mulberry32(f.seed * 7 + 911),
      cx = f.x + f.cxl;
    const cliff = new BedSurface(
      geometry,
      new T.Matrix4().makeRotationX(-Math.PI / 2),
      "face",
    );
    const wind = rng() < 0.5 ? -1 : 1;
    const stones: T.Matrix4[] = [],
      toe: T.Matrix4[] = [];
    const at = (x: number, z: number) => {
      let h: SurfaceHit | null = null;
      for (const s of surfaces) {
        const hit = s.top(x, z);
        if (hit && (!h || h.point.y < hit.point.y)) h = hit;
      }
      return h;
    };
    for (const side of [-1, 1]) {
      const center = cx + side * f.rx * (0.41 + rng() * 0.2),
        z0 = (rng() - 0.3) * halfZ * 0.84;
      for (let n = 0; n < 8; n++) {
        const a = n * 2.399 + side,
          step = Math.sqrt(n) * 7,
          x = center + Math.cos(a) * step,
          z = z0 + Math.sin(a) * step;
        const h = substrate.top(x, z);
        if (!h) continue;
        const rad = (n === 0 ? 24 : 6 + rng() * 13) * (f.rx / 192) ** 0.4,
          sy = 0.41 + rng() * 0.24;
        const pos = h.point.clone().addScaledVector(h.normal, -rad * 0.17);
        const quat = new T.Quaternion().setFromEuler(
          new T.Euler(0.15 * rng(), rng() * TAU, 0.2 * (rng() - 0.5)),
        );
        stones.push(
          new T.Matrix4().compose(
            pos,
            quat,
            new T.Vector3(rad * (1.15 + rng() * 0.5), rad * sy, rad * 0.94),
          ),
        );
      }
    }
    const terraces: { x: number; z: number; radius: number; kind: number }[] = [];
    for (let j = 0; j < 6; j++) {
      const side = j % 2 ? 1 : -1,
        x0 = cx + side * f.rx * (0.29 + 0.45 * rng()),
        y0 = f.y + f.cyl + f.ry * (j < 2 ? -0.45 : j < 4 ? 0.48 : 0.78);
      if (
        f.cave &&
        Math.abs(x0 - f.cave.x) < f.cave.rx + 15 &&
        Math.abs(y0 - f.cave.y) < f.cave.ry + 9
      )
        continue;
      const wall = cliff.top(x0, y0);
      if (!wall) continue;
      for (let k = 0; k < 3; k++) {
        const xx = x0 + (k - 1) * f.rx * 0.095,
          yy = y0 + (k - 1) * 4,
          contact = cliff.top(xx, yy);
        if (!contact) continue;
        const rr = f.rx * (0.114 + rng() * 0.052),
          z = contact.point.y + rr * 0.07;
        stones.push(
          new T.Matrix4().compose(
            new T.Vector3(xx, -yy, z),
            new T.Quaternion().setFromEuler(
              new T.Euler(
                -0.18 + rng() * 0.15,
                0.1 + rng() * 0.31,
                side * 0.085,
              ),
            ),
            new T.Vector3(rr * 1.5, rr * (0.38 + rng() * 0.09), rr * 1.09),
          ),
        );
        terraces.push({
          x: xx,
          z: z + rr * 0.51,
          radius: rr,
          kind: j > 3 ? SPONGE : j % 3 === 0 ? FAN : PLATE,
        });
      }
    }
    this.stoneBatch(crown, stones, f.zone, surfaces, "ledge");
    for (let k = 0; k < 26; k++) {
      const side = k % 2 ? 1 : -1,
        a = rng() * TAU,
        d = f.rx * (0.55 + 0.68 * rng()),
        x = cx + side * d,
        z = -f.rx * 0.5 + Math.sin(a) * f.rx * 0.55;
      const r = 5 + (1 - Math.min(1, d / (f.rx * 1.35))) * 34 * rng();
      toe.push(
        new T.Matrix4().compose(
          new T.Vector3(x, sandHeight(x, z) + r * 0.14, z),
          new T.Quaternion().setFromEuler(
            new T.Euler(0.3 * rng(), a, 0.18 * rng()),
          ),
          new T.Vector3(r * 1.4, r * (0.45 + rng() * 0.23), r),
        ),
      );
    }
    this.stoneBatch(base, toe, Math.max(f.zone, 2), [], "talus");
    const attachments: Attachment[] = [],
      plants: Plant[] = [];
    const inlet = cx + wind * f.rx * (0.05 + rng() * 0.13),
      gap = f.rx * (0.092 + rng() * 0.058);
    const place = (
      site: SurfaceHit,
      kind: number,
      size: number,
      color: RGB,
      patch: number,
      heading: number,
      variant: number,
    ) => {
      if (
        site.normal.y < (kind === FAN || kind === SPONGE ? 0.15 : 0.37) ||
        Math.abs(site.point.x - inlet) < gap
      )
        return false;
      if (
        f.cave &&
        Math.abs(-site.point.y - f.cave.y) < f.cave.ry + 4 &&
        Math.abs(site.point.x - f.cave.x) < f.cave.rx * 0.91
      )
        return false;
      const rad = size * [0.42, 0.51, 0.36, 0.57, 0.83, 0.22, 0.48, 0.23, 0.58, 0.46, 0.76, 0.16, 0.20][kind];
      for (const other of attachments) {
        const dx = site.point.x - other.x,
          dz = site.point.z - other.z,
          dy = site.point.y + other.y;
        if (
          dx * dx + dz * dz + dy * dy * 0.44 <
          (other.footprint + rad) ** 2 * 0.64
        )
          return false;
      }
      const bury = clamp(size * (0.095 + (1 - site.normal.y) * 0.14), 0.9, 6.2),
        p = site.point.clone().addScaledVector(site.normal, -bury);
      const direction = up
        .clone()
        .lerp(
          site.normal,
          kind === FAN || kind === WHIP
            ? 0.67
            : kind === PORITES || kind === PLATE
              ? 0.48
              : 0.27,
        )
        .normalize();
      const aim = new T.Quaternion()
        .setFromUnitVectors(up, direction)
        .multiply(new T.Quaternion().setFromAxisAngle(up, heading));
      const tall = size * (0.89 + rng() * 0.19),
        wide = size * (0.91 + rng() * 0.19);
      plants.push({
        matrix: new T.Matrix4().compose(
          p,
          aim,
          new T.Vector3(wide, tall, wide),
        ),
        kind,
        variant,
        color,
        phase: rng() * TAU,
        maturity: size,
      });
      attachments.push({
        x: p.x,
        y: -p.y,
        z: p.z,
        support: site.support,
        point: site.point.toArray(),
        normal: site.normal.toArray(),
        penetration: bury,
        patch,
        kind,
        size,
        footprint: rad,
      });
      return true;
    };
    const theme = [
      [STAG, PLATE],
      [FAN, SPONGE],
      [FAN, PORITES],
      [SPONGE, PORITES],
    ][f.zone];
    const extraKinds = [BUBBLE, WHIP, ANEMONE, ORGAN, LETTUCE];
    const patches = 10 + Math.floor(rng() * 2);
    for (let j = 0; j < patches; j++) {
      const side = j % 3 === 0 ? wind : -wind;
      const centerX = cx + side * f.rx * (0.22 + 0.51 * rng());
      const centerZ =
        halfZ * (j < 3 ? -0.46 + rng() * 0.5 : 0.12 + rng() * 0.6);
      const primary =
        j >= 5
          ? extraKinds[(j - 5 + f.zone) % extraKinds.length]
          : j < 2
            ? theme[0]
            : j === 2
              ? theme[1]
              : j === 3
                ? PORITES
                : j === 4 && f.zone === 0
                  ? KELP
                  : theme[j % 2];
      const radius = f.rx * (0.16 + rng() * 0.115),
        angle = rng() * TAU,
        hueRoll = rng(),
        hue = f.zone === 0 ? [0, 2, 3, 1, 2, 0, 1, 3, 2, 0, 1][j] : (hueRoll * 4) | 0,
        variant = (rng() * 3) | 0;
      const maxH =
        (primary === BUBBLE
          ? 36
          : primary === WHIP
            ? 68
            : primary === ANEMONE
              ? 32
              : primary === ORGAN
                ? 43
                : primary === LETTUCE
                  ? 38
                  : primary === KELP
                    ? 82
                    : primary === FAN
                      ? 76
                      : primary === PLATE
                        ? 49
                        : primary === PORITES
                          ? 29
                          : 68) *
        (0.9 + rng() * 0.43);
      const count = primary === KELP ? 6 : primary === FAN ? 9 : 11;
      let planted = 0;
      for (let n = 0; n < count * 4 && planted < count; n++) {
        const u = n === 0 ? 0 : Math.sqrt(rng()),
          a = angle + n * 2.39996;
        const x = centerX + Math.cos(a) * radius * u,
          z = centerZ + Math.sin(a) * radius * 0.73 * u;
        const h = at(x, z);
        if (!h) continue;
        const kind =
          n === 0 || rng() < 0.77
            ? primary
            : primary === FAN
              ? SPONGE
              : primary === KELP
                ? PORITES
                : primary === PLATE
                  ? STAG
                  : PORITES;
        const height =
          maxH *
          (1 - 0.59 * u) *
          (0.86 + rng() * 0.31) *
          (kind === primary ? 1 : 0.63);
        const baseColor = hues[kind][hue],
          shade = 0.93 + rng() * 0.13;
        const color: RGB = [
          baseColor[0] * shade,
          baseColor[1] * shade,
          baseColor[2] * shade,
        ];
        if (
          place(
            h,
            kind,
            height,
            color,
            j,
            (kind === FAN ? wind * 0.31 : angle) +
              (rng() - 0.5) * (kind === FAN ? 0.46 : 1.5),
            rng() < 0.74 ? variant : (rng() * 3) | 0,
          )
        )
          planted++;
      }
    }
    terraces.forEach((t, j) => {
      const hue = (j % 3) + 1;
      for (let k = 0; k < 7; k++) {
        const a = k * 2.399 + f.seed,
          u = k / 7,
          xx = t.x + Math.cos(a) * t.radius * u * 0.86,
          zz = t.z + Math.sin(a) * t.radius * u * 0.48;
        const h = at(xx, zz);
        if (!h || h.support === "reef") continue;
        const kind = k === 6 ? PORITES : t.kind,
          sz =
            (kind === FAN ? 41 : kind === PLATE ? 23 : 16) *
            (1 - 0.57 * u) *
            (0.85 + rng() * 0.37);
        place(
          h,
          kind,
          sz,
          hues[kind][hue],
          patches + 22 + j,
          kind === FAN ? wind * 0.36 : 0.5 + a,
          j % 3,
        );
      }
    });
    // Carpet upper rock crowns with swaying short turf seagrass & pleated fan algae
    for (let k = 0; k < 22; k++) {
      const tx = cx + (rng() - 0.5) * f.rx * 1.48;
      const tz = (rng() - 0.5) * halfZ * 1.05;
      const h = at(tx, tz);
      if (!h || h.normal.y < 0.48) continue;
      const tk = rng() < 0.68 ? TURF : FANALGAE;
      const tsz = (tk === TURF ? 7.5 + rng() * 6.5 : 10 + rng() * 8) * (f.zone > 1 ? 0.85 : 1);
      place(h, tk, tsz, hues[tk][(k + f.zone) % 4], patches + 40 + (k % 5), TAU * rng(), k % 3);
    }
    for (let k = 0; k < stones.length; k++) {
      const m = stones[k].elements,
        w = 4.5 + rng() * 5.8;
      const h = at(m[12], m[14]);
      if (!h || h.support === "reef") continue;
      place(
        h,
        k % 3 ? PORITES : SPONGE,
        w,
        hues[k % 3 ? PORITES : SPONGE][(k + f.zone) % 4],
        patches + k,
        TAU * rng(),
        k % 3,
      );
    }
    const p = geometry.attributes.position,
      shade = geometry.attributes.aShelter;
    for (let i = 0; i < p.count; i++) {
      let dark = 0;
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      for (const a of attachments) {
        const sq = (x - a.x) ** 2 + (y + a.y) ** 2 + (z - a.z) ** 2,
          r = Math.max(5, a.footprint * 1.67);
        if (sq < r * r * 3) dark = Math.max(dark, Math.exp(-sq / (r * r)));
      }
      shade.setX(i, dark);
    }
    this.colonies(crown, plants, f.zone);
    root.userData.attachments = attachments;
    root.userData.fauna = placeReefLife(attachments, f.seed);
    root.userData.habitat = {
      name: habitatNames[f.zone],
      inlet,
      gap,
      patches,
      halfZ,
      wind,
    };
    root.userData.foundation = "closed-buttress";
    return { root, geometry, crown, base, frontSurface: cliff };
  }

  seabed(
    left: number,
    right: number,
    index: number,
    clear: (x: number) => boolean,
  ) {
    const root = new T.Group(),
      g = makeSandTerrace(left, right);
    root.name = `sand-bed-${index}`;
    root.add(new T.Mesh(g, this.sand));
    this.owned.add(g);
    const ground = new BedSurface(g, identity, "sand", 30),
      rng = mulberry32(index * 711 + 702),
      rocks: T.Matrix4[] = [];
    const surfaces: BedSurface[] = [];
    for (let j = 0; j < 3; j++) {
      const x = left + (right - left) * (0.15 + j * 0.32 + (rng() - 0.5) * 0.1),
        z = -162 + rng() * 235;
      for (let k = 0; k < 16; k++) {
        const a = k * 2.399 + rng() * 0.35,
          sw = Math.sqrt(k) * 10,
          xx = x + Math.cos(a) * sw,
          zz = z + Math.sin(a) * sw * 0.76;
        if (!clear(xx) || xx < left + 9 || xx > right - 9) continue;
        const h = ground.top(xx, zz);
        if (!h) continue;
        const r = 28 / (1 + 0.2 * k) + 3 * rng();
        rocks.push(
          new T.Matrix4().compose(
            h.point.clone().addScaledVector(h.normal, -r * 0.09),
            new T.Quaternion().setFromEuler(
              new T.Euler(0.08, rng() * TAU, 0.09),
            ),
            new T.Vector3(r * 1.42, r * 0.67, r),
          ),
        );
      }
    }
    this.stoneBatch(root, rocks, 3, surfaces, "ledge");
    const plants: Plant[] = [];
    const attachments: Attachment[] = [];
    rocks.forEach((m, k) => {
      if (k % 3 === 0) return;
      const x = m.elements[12],
        z = m.elements[14];
      let hit: SurfaceHit | null = null;
      for (const s of surfaces) {
        const p = s.top(x, z);
        if (p && (!hit || p.point.y > hit.point.y)) hit = p;
      }
      if (!hit) return;
      const kind = index % 2 ? SPONGE : FAN,
        sz = (5 + rng() * 14) * (k % 5 ? 1 : 1.32),
        p = hit.point.clone().addScaledVector(hit.normal, -1.2),
        q = new T.Quaternion().setFromUnitVectors(
          up,
          up.clone().lerp(hit.normal, 0.4).normalize(),
        );
      plants.push({
        kind,
        variant: k % 3,
        phase: k * 0.6,
        maturity: sz,
        color: hues[kind][index % 4],
        matrix: new T.Matrix4().compose(p, q, new T.Vector3(sz, sz, sz)),
      });
      attachments.push({
        x: p.x,
        y: -p.y,
        z: p.z,
        support: hit.support,
        point: hit.point.toArray(),
        normal: hit.normal.toArray(),
        penetration: 1.2,
        patch: k,
        kind,
        size: sz,
        footprint: sz * 0.48,
      });
    });
    this.colonies(root, plants, 3);
    root.userData.fauna = placeReefLife(attachments, 900 + index);
    return root;
  }

  /**
   * Place Game 2 procedural coral colonies cleanly onto Game 1's original rock relief,
   * flanks, and crown boulders, adjusting height, tilt, and Z depth to match the rock geometry.
   */
  formationOnGame1Rock(
    f: Formation,
    rel: Relief,
    boulderSpots: RockBoulderSpot[],
    mixSparse = false,
  ) {
    const group = new T.Group();
    group.name = `g2-on-g1-${f.seed}`;
    const rng = mulberry32(f.seed * 19 + 911);
    const W = f.w;
    let first = -1,
      last = -1;
    for (let x = 0; x < W; x++) {
      if (f.top[x] >= 0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    const attachments: Attachment[] = [];
    const plants: Plant[] = [];
    const scale = clamp((f.rx / 145) ** 0.38, 0.72, 1.15);
    const footprints = [0.42, 0.51, 0.36, 0.57, 0.83, 0.22, 0.48, 0.23, 0.58, 0.46, 0.76, 0.16, 0.20];
    const wind = rng() < 0.5 ? -1 : 1;
    const inlet = f.x + f.cxl + wind * f.rx * (0.06 + rng() * 0.14);
    const gap = f.rx * (0.07 + rng() * 0.04);

    const surfaceAt = (wx: number, wy: number, bias?: T.Vector3): SurfaceHit | null => {
      if (sampleSdf(f.sdfSolid, f.x, f.y, wx, wy) > -1.0) return null;
      if (f.cave && sampleSdf(f.sdfCave, f.x, f.y, wx, wy) > -3.5) return null;
      const z = rel.zAt(wx, wy);
      if (z <= 0.8) return null;
      const dzdx = (rel.zAt(wx + 3, wy) - rel.zAt(wx - 3, wy)) / 6;
      const dzdyUp = (rel.zAt(wx, wy - 3) - rel.zAt(wx, wy + 3)) / 6;
      const n = new T.Vector3(-dzdx, -dzdyUp, 1).normalize();
      if (bias) n.multiplyScalar(0.55).addScaledVector(bias, 0.65).normalize();
      return { point: new T.Vector3(wx, -wy, z), normal: n, support: "g1-relief" };
    };

    const place = (
      site: SurfaceHit,
      kind: number,
      size: number,
      color: RGB,
      patch: number,
      heading: number,
      variant: number,
      normalBlend?: number,
      minNy = 0.08,
    ) => {
      if (site.normal.y < minNy) return false;
      const rad = size * footprints[kind];
      for (const other of attachments) {
        const dx = site.point.x - other.x,
          dz = site.point.z - other.z,
          dy = site.point.y + other.y;
        if (dx * dx + dz * dz + dy * dy * 0.45 < (other.footprint + rad) ** 2 * 0.58) {
          return false;
        }
      }
      const bury = clamp(size * (0.11 + (1 - Math.abs(site.normal.y)) * 0.11), 1.4, 5.5);
      const p = site.point.clone().addScaledVector(site.normal, -bury);
      const blend =
        normalBlend ??
        (kind === FAN || kind === WHIP
          ? 0.64
          : kind === PORITES || kind === PLATE || kind === LETTUCE
            ? 0.52
            : 0.34);
      const dir = up.clone().lerp(site.normal, blend).normalize();
      const aim = new T.Quaternion()
        .setFromUnitVectors(up, dir)
        .multiply(new T.Quaternion().setFromAxisAngle(up, heading));
      const tall = size * (0.88 + rng() * 0.2),
        wide = size * (0.9 + rng() * 0.2);
      plants.push({
        matrix: new T.Matrix4().compose(p, aim, new T.Vector3(wide, tall, wide)),
        kind,
        variant,
        color,
        phase: rng() * TAU,
        maturity: size,
      });
      attachments.push({
        x: p.x,
        y: -p.y,
        z: p.z,
        support: site.support,
        point: site.point.toArray(),
        normal: site.normal.toArray(),
        penetration: bury,
        patch,
        kind,
        size,
        footprint: rad,
      });
      return true;
    };

    const theme = [
      [STAG, PLATE],
      [FAN, SPONGE],
      [FAN, PORITES],
      [SPONGE, PORITES],
    ][f.zone];
    const extraKinds = [BUBBLE, WHIP, ANEMONE, ORGAN, LETTUCE];
    const span = last - first;
    if (first >= 0 && span > 18) {
      const patches = mixSparse
        ? Math.max(4, Math.min(8, Math.round(span / 46)))
        : Math.max(6, Math.min(12, Math.round(span / 32)));
      const pad = Math.min(14, span * 0.12);
      for (let j = 0; j < patches; j++) {
        const uCenter = (j + 0.25 + rng() * 0.5) / patches;
        const centerX = f.x + first + pad + uCenter * (span - pad * 2);
        if (Math.abs(centerX - inlet) < gap * 0.72) continue;
        const primary =
          j >= 5
            ? extraKinds[(j - 5 + f.zone) % extraKinds.length]
            : j < 2
              ? theme[0]
              : j === 2
                ? theme[1]
                : j === 3
                  ? PORITES
                  : j === 4 && f.zone <= 1
                    ? KELP
                    : theme[j % 2];
        const radius = Math.max(24, (span / patches) * 0.95);
        const angle = rng() * TAU;
        const hue = f.zone === 0 ? [0, 2, 3, 1, 2, 0, 1, 3, 2, 0, 1][j % 11] : (rng() * 4) | 0;
        const variant = (rng() * 3) | 0;
        const maxH =
          (primary === BUBBLE
            ? 31
            : primary === WHIP
              ? 60
              : primary === ANEMONE
                ? 27
                : primary === ORGAN
                  ? 38
                  : primary === LETTUCE
                    ? 34
                    : primary === KELP
                      ? 72
                      : primary === FAN
                        ? 66
                        : primary === PLATE
                          ? 43
                          : primary === PORITES
                            ? 26
                            : 58) *
          scale *
          (0.88 + rng() * 0.34);
        const targetCount = mixSparse
          ? primary === KELP
            ? 3
            : 5
          : primary === KELP
            ? 5
            : primary === FAN
              ? 7
              : 9;
        let planted = 0;
        for (let n = 0; n < targetCount * 4 && planted < targetCount; n++) {
          const u = n === 0 ? 0 : Math.sqrt(rng());
          const a = angle + n * 2.39996;
          const wx = centerX + Math.cos(a) * radius * u;
          const xi = Math.round(wx - f.x);
          if (xi < first + 5 || xi > last - 5) continue;
          const ty = f.top[xi];
          if (ty < 0) continue;
          const leftY = f.top[Math.max(0, xi - 6)],
            rightY = f.top[Math.min(W - 1, xi + 6)];
          if (leftY < 0 || rightY < 0) continue;
          const sideDrop = Math.max(0, leftY - ty, rightY - ty);
          if (sideDrop > 15) continue;
          if (Math.abs(wx - inlet) < gap * 0.55) continue;

          const kind =
            n === 0 || rng() < 0.76
              ? primary
              : primary === FAN
                ? SPONGE
                : primary === KELP
                  ? PORITES
                  : primary === PLATE
                    ? STAG
                    : PORITES;
          const crestBias =
            kind === KELP || kind === WHIP || kind === STAG || kind === ORGAN ? 6.5 : 13.5;
          const depthIn = 3.5 + rng() * crestBias + sideDrop * 0.35;
          const wy = f.y + ty + depthIn;
          const crownBias = new T.Vector3(rightY - leftY, 12, 4.2).normalize();
          const site = surfaceAt(wx, wy, crownBias);
          if (!site) continue;

          const height =
            maxH * (1 - 0.5 * u) * (0.86 + rng() * 0.28) * (kind === primary ? 1 : 0.65);
          const baseColor = hues[kind][hue],
            shade = 0.92 + rng() * 0.14;
          const color: RGB = [
            baseColor[0] * shade,
            baseColor[1] * shade,
            baseColor[2] * shade,
          ];
          if (
            place(
              site,
              kind,
              height,
              color,
              j,
              (kind === FAN ? wind * 0.31 : angle) +
                (rng() - 0.5) * (kind === FAN ? 0.45 : 1.4),
              rng() < 0.74 ? variant : (rng() * 3) | 0,
            )
          ) {
            planted++;
          }
        }
      }
    }

    // Flank & overhang corals seated into the sculpted left/right walls of Game 1 rock
    const caveCy = f.cave ? f.cave.y - f.y : -999;
    const caveRy = f.cave ? f.cave.ry : 0;
    const flankKinds = [FAN, PLATE, SPONGE, BUBBLE, LETTUCE];
    for (const fy of [-0.42, -0.14, 0.16, 0.42]) {
      const yy = Math.round(f.cyl + f.ry * fy);
      let xl = 0;
      while (xl < W && !(f.top[xl] >= 0 && yy >= f.top[xl] && yy <= f.bot[xl])) xl++;
      let xr = W - 1;
      while (xr > 0 && !(f.top[xr] >= 0 && yy >= f.top[xr] && yy <= f.bot[xr])) xr--;
      if (xl + 14 >= xr) continue;
      const inMouth = Math.abs(yy - caveCy) < caveRy + 10;
      const openL = f.cave && (f.cave.kind === "tunnel" || f.cave.dir === -1);
      const openR = f.cave && (f.cave.kind === "tunnel" || f.cave.dir === 1);

      for (const side of [-1, 1] as const) {
        if ((side < 0 && inMouth && openL) || (side > 0 && inMouth && openR)) continue;
        if (rng() > (mixSparse ? 0.55 : 0.85)) continue;
        const wx = f.x + (side < 0 ? xl + 6 + rng() * 5 : xr - 6 - rng() * 5);
        const wy = f.y + yy + (rng() - 0.5) * 8;
        const flankBias = new T.Vector3(side * 0.82, 0.44, 0.36).normalize();
        const site = surfaceAt(wx, wy, flankBias);
        if (!site) continue;
        const kind = flankKinds[(rng() * flankKinds.length) | 0];
        const hue = ((f.zone + (side > 0 ? 1 : 2)) % 4);
        const sz = (kind === FAN ? 38 : kind === PLATE ? 30 : 24) * scale * (0.85 + rng() * 0.35);
        place(
          site,
          kind,
          sz,
          hues[kind][hue],
          40 + (side > 0 ? 1 : 0),
          side * 0.38 + (rng() - 0.5) * 0.6,
          (rng() * 3) | 0,
          0.78,
          -0.1,
        );
      }
    }

    // Short turf seagrass & fan algae tufting across upper Game 1 stone ridge
    if (first >= 0 && span > 18) {
      const turfStep = mixSparse ? 20 : 12;
      for (let x = first + 6; x < last - 6; x += turfStep + rng() * 8) {
        const xi = Math.round(x);
        const ty = f.top[xi];
        if (ty < 0) continue;
        const leftY = f.top[Math.max(0, xi - 5)],
          rightY = f.top[Math.min(W - 1, xi + 5)];
        if (leftY < 0 || rightY < 0) continue;
        if (Math.max(0, leftY - ty, rightY - ty) > 13) continue;
        const wx = f.x + xi;
        const wy = f.y + ty + 2.5;
        const crownBias = new T.Vector3(rightY - leftY, 14, 3.6).normalize();
        const site = surfaceAt(wx, wy, crownBias);
        if (!site) continue;
        const tk = rng() < 0.66 ? TURF : FANALGAE;
        const tsz = (tk === TURF ? 7 + rng() * 6 : 9 + rng() * 7) * scale;
        place(site, tk, tsz, hues[tk][(xi + f.zone) % 4], 95 + (xi % 6), TAU * rng(), xi % 3, 0.65, 0.35);
      }
    }

    // Game 2 corals perched directly on Game 1 crown boulders
    boulderSpots.forEach((bs, k) => {
      if (mixSparse && k % 2 === 1) return;
      const kinds = [PORITES, SPONGE, FAN, PLATE, ANEMONE, BUBBLE];
      const kind = kinds[(k + f.zone) % kinds.length];
      const sz = clamp(bs.radius * (0.85 + rng() * 0.45), 11, 28) * scale;
      const n = new T.Vector3(-Math.sin(bs.tilt) * 0.82, Math.cos(bs.tilt), 0.32).normalize();
      const site: SurfaceHit = {
        point: new T.Vector3(bs.x, -bs.y, bs.z),
        normal: n,
        support: "g1-boulder",
      };
      place(site, kind, sz, hues[kind][(k + f.zone) % 4], 80 + k, TAU * rng(), k % 3, 0.6, 0.1);
    });

    this.colonies(group, plants, f.zone);
    return { group, fauna: placeReefLife(attachments, f.seed) };
  }

  /**
   * Place Game 2 procedural corals & kelp across Game 1's rippled sand floor and floor boulders.
   */
  seabedOnGame1Floor(
    worldW: number,
    floorTopY: (x: number) => number,
    floorZ: (x: number, y: number) => number,
    clear: (x: number) => boolean,
    boulderSpots: RockBoulderSpot[],
    mixSparse = false,
  ) {
    const group = new T.Group();
    group.name = "g2-on-g1-floor";
    const rng = mulberry32(4815);
    const plants: Plant[] = [];
    const attachments: Attachment[] = [];
    const floorKinds = [FAN, SPONGE, PORITES, PLATE, BUBBLE, WHIP, ANEMONE, ORGAN, LETTUCE];
    const footprints = [0.42, 0.51, 0.36, 0.57, 0.83, 0.22, 0.48, 0.23, 0.58, 0.46, 0.76, 0.16, 0.20];

    const addFloorPlant = (
      x: number,
      wy: number,
      wz: number,
      nx: number,
      ny: number,
      kind: number,
      sz: number,
      hueIdx: number,
      patch: number,
    ) => {
      const n = new T.Vector3(nx, ny, 0.24).normalize();
      const rad = sz * footprints[kind];
      for (const o of attachments) {
        const dx = x - o.x,
          dz = wz - o.z;
        if (dx * dx + dz * dz < (o.footprint + rad) ** 2 * 0.56) return false;
      }
      const p = new T.Vector3(x, -wy, wz).addScaledVector(n, -clamp(sz * 0.12, 1.4, 4.5));
      const dir = up.clone().lerp(n, 0.42).normalize();
      const q = new T.Quaternion()
        .setFromUnitVectors(up, dir)
        .multiply(new T.Quaternion().setFromAxisAngle(up, rng() * TAU));
      plants.push({
        kind,
        variant: (rng() * 3) | 0,
        phase: rng() * TAU,
        maturity: sz,
        color: hues[kind][hueIdx % 4],
        matrix: new T.Matrix4().compose(p, q, new T.Vector3(sz, sz, sz)),
      });
      attachments.push({
        x: p.x,
        y: -p.y,
        z: p.z,
        support: "g1-floor",
        point: [x, -wy, wz],
        normal: n.toArray(),
        penetration: 2,
        patch,
        kind,
        size: sz,
        footprint: rad,
      });
      return true;
    };

    // Clustered Game 2 coral patches along Game 1 sand bed
    const stepX = mixSparse ? 42 : 24;
    for (let x = 28; x < worldW - 28; x += stepX + rng() * 30) {
      if (!clear(x)) continue;
      const clusterKind = floorKinds[(rng() * floorKinds.length) | 0];
      const hue = (rng() * 4) | 0;
      const count = mixSparse ? 2 : 2 + Math.floor(rng() * 3);
      for (let c = 0; c < count; c++) {
        const cx = x + (rng() - 0.5) * 34;
        if (cx < 16 || cx > worldW - 16 || !clear(cx)) continue;
        const wy = floorTopY(cx) + 2;
        const wz = floorZ(cx, wy + 2) + 2 + (rng() - 0.4) * 14;
        const sl = (floorTopY(cx + 6) - floorTopY(cx - 6)) / 12;
        const kind = c === 0 || rng() < 0.7 ? clusterKind : floorKinds[(rng() * floorKinds.length) | 0];
        const sz =
          (kind === KELP
            ? 68
            : kind === WHIP
              ? 52
              : kind === FAN
                ? 48
                : kind === PLATE
                  ? 34
                  : kind === ORGAN
                    ? 32
                    : 24) *
          (0.8 + rng() * 0.45);
        addFloorPlant(cx, wy, wz, sl, 1, kind, sz, hue, Math.floor(x));
      }
    }

    // Swaying Game 2 kelp groves rising between the deep formations
    for (let gx = 160 + rng() * 140; gx < worldW - 140; gx += (mixSparse ? 440 : 280) + rng() * 220) {
      if (!clear(gx)) continue;
      const nK = mixSparse ? 3 : 4 + Math.floor(rng() * 3);
      for (let k = 0; k < nK; k++) {
        const kx = gx + (rng() - 0.5) * 60;
        if (!clear(kx)) continue;
        const wy = floorTopY(kx) + 2;
        const wz = floorZ(kx, wy + 2) + (rng() - 0.5) * 16;
        addFloorPlant(kx, wy, wz, 0, 1, KELP, 58 + rng() * 34, k % 4, Math.floor(gx));
      }
    }

    // Game 2 corals perched on Game 1 floor boulders
    boulderSpots.forEach((bs, k) => {
      if (mixSparse && k % 2 === 1) return;
      const kinds = [FAN, SPONGE, PORITES, PLATE, BUBBLE, ANEMONE];
      const kind = kinds[k % kinds.length];
      const sz = clamp(bs.radius * (0.78 + rng() * 0.42), 11, 28);
      addFloorPlant(
        bs.x,
        bs.y,
        bs.z,
        -Math.sin(bs.tilt) * 0.8,
        Math.cos(bs.tilt),
        kind,
        sz,
        k % 4,
        1000 + k,
      );
    });

    this.colonies(group, plants, 3);
    return { group, fauna: placeReefLife(attachments, 905) };
  }

  dispose() {
    this.owned.forEach((x) => x.dispose());
    this.geos.flat().forEach((x) => x.dispose());
    this.boulders.forEach((x) => x.dispose());
    [...this.materials, ...this.caveMats, this.growth, this.sand].forEach((m) =>
      m.dispose(),
    );
    this.scans.dispose();
  }
}
