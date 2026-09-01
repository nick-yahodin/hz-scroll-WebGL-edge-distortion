import * as THREE from "three";
import { CARDS, DESIGN, TEXT_TILES, type TextTile } from "../design";

// Exact flat colors / WYSIWYG textures — no color-management conversions.
THREE.ColorManagement.enabled = false;

const SS = 4; // text supersample factor (crisp when the rail is scaled up)

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

type Tile = { mesh: THREE.Mesh; x: number; y: number; w: number; h: number };

/**
 * Horizontal rail of image/text tiles rendered into an offscreen target, then
 * drawn full-screen through an edge-warp shader.
 *
 * Mechanics (studied from system.studio's OGL build, reimplemented):
 *  - The centre stays flat; only a narrow band at the left/right edges warps.
 *  - The warp is VERTICAL: content fans from a shared centerline as it nears an
 *    edge, so it appears to roll/peel while the rail scrolls sideways.
 *  - Chromatic aberration is VERTICAL too, growing toward the bent edge.
 *  - Everything (images AND text) lives in the target, so all of it warps.
 */
export class DistortionGallery {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;

  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private group = new THREE.Group();
  private tiles: Tile[] = [];

  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  private scale = 1;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private scrollX = 0;
  private center: number;

  reducedMotion = false;

  constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");
    canvas.className = "gl";
    container.appendChild(canvas);
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(new THREE.Color(DESIGN.bg), 1);

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Shared vertical centerline of the card band (uv-from-bottom space).
    const bandTop = Math.min(...CARDS.map((c) => c.y));
    const bandBottom = Math.max(...CARDS.map((c) => c.y + c.h));
    this.center = 1 - (bandTop + bandBottom) / 2 / DESIGN.height;

    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // y-up ortho camera; design's y-down coords are converted in resize().
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);
    this.scene.add(this.group);

    const geo = new THREE.PlaneGeometry(1, 1);
    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Image / color cards (renderOrder 0).
    for (const c of CARDS) {
      let mat: THREE.MeshBasicMaterial;
      if (c.src) {
        const tex = loader.load(c.src, (t) => this.applyCover(t, c.w, c.h));
        tex.anisotropy = maxAniso;
        mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      } else {
        mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(c.color ?? "#cccccc"),
          side: THREE.DoubleSide,
        });
      }
      mat.depthTest = false;
      mat.depthWrite = false;
      this.addTile(geo, mat, c, 0);
    }

    // Text (renderOrder 1 — sits above the imagery).
    for (const t of TEXT_TILES) {
      const tex = makeTextTexture(t);
      tex.anisotropy = maxAniso;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
      });
      mat.depthTest = false;
      mat.depthWrite = false;
      this.addTile(geo, mat, t, 1);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uEdgeZone: { value: 0.11 },
        uEdgePow: { value: 2.6 },
        uFan: { value: 0.45 },
        uChroma: { value: 0.02 },
        uCenter: { value: this.center },
        uLeftGate: { value: 0 },
        uRightGate: { value: 0 },
        uReduced: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    this.resize();
  }

  private addTile(
    geo: THREE.PlaneGeometry,
    mat: THREE.Material,
    box: { x: number; y: number; w: number; h: number },
    order: number,
  ) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // group is translated far; keep tiles drawable
    mesh.renderOrder = order;
    this.group.add(mesh);
    this.tiles.push({ mesh, x: box.x, y: box.y, w: box.w, h: box.h });
  }

  // object-fit: cover — crop the texture to the card's aspect ratio.
  private applyCover(tex: THREE.Texture, w: number, h: number) {
    const img = tex.image as { width: number; height: number };
    if (!img?.width) return;
    const cardA = w / h;
    const imgA = img.width / img.height;
    if (imgA > cardA) {
      const s = cardA / imgA;
      tex.repeat.set(s, 1);
      tex.offset.set((1 - s) / 2, 0);
    } else {
      const s = imgA / cardA;
      tex.repeat.set(1, s);
      tex.offset.set(0, (1 - s) / 2);
    }
    tex.needsUpdate = true;
  }

  get totalWidth() {
    return DESIGN.width * this.scale;
  }
  get maxScroll() {
    return Math.max(0, this.totalWidth - this.width);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = this.height / DESIGN.height;

    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.rt.setSize(this.width * this.dpr, this.height * this.dpr);

    this.camera.left = 0;
    this.camera.right = this.width;
    this.camera.top = this.height;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();

    const s = this.scale;
    for (const t of this.tiles) {
      t.mesh.scale.set(t.w * s, t.h * s, 1);
      // convert design (y-down from top) to world (y-up)
      t.mesh.position.set(
        (t.x + t.w / 2) * s,
        (DESIGN.height - (t.y + t.h / 2)) * s,
        0,
      );
    }
  }

  setScroll(scrollX: number) {
    this.scrollX = scrollX;
  }

  render() {
    const u = this.material.uniforms;
    const gatePx = this.width * u.uEdgeZone.value;
    u.uLeftGate.value = smoothstep(0, gatePx, this.scrollX);
    u.uRightGate.value = smoothstep(0, gatePx, this.maxScroll - this.scrollX);
    u.uReduced.value = this.reducedMotion ? 1 : 0;

    this.group.position.x = -this.scrollX;

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    for (const t of this.tiles) {
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    (this.tiles[0]?.mesh.geometry as THREE.BufferGeometry)?.dispose();
    this.rt.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

// ---- Text → canvas texture (so copy warps with the rail) ----

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makeTextTexture(tile: TextTile): THREE.CanvasTexture {
  const cvs = document.createElement("canvas");
  cvs.width = Math.max(1, Math.round(tile.w * SS));
  cvs.height = Math.max(1, Math.round(tile.h * SS));
  const ctx = cvs.getContext("2d")!;

  const fs = DESIGN.fontSize * SS;
  const lh = DESIGN.lineHeight * SS;
  ctx.font = `${fs}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000000";
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${DESIGN.tracking * SS}px`;
  } catch {
    /* letterSpacing unsupported — negligible */
  }

  let y = 0;
  for (const run of tile.runs) {
    y += (run.marginTop ?? 0) * SS;
    ctx.globalAlpha = run.opacity ?? 1;
    const lines = tile.nowrap ? [run.text] : wrapLines(ctx, run.text, cvs.width);
    for (const line of lines) {
      ctx.fillText(line, 0, y + fs * 0.82);
      y += lh;
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uEdgeZone;
  uniform float uEdgePow;
  uniform float uFan;
  uniform float uChroma;
  uniform float uCenter;
  uniform float uLeftGate;
  uniform float uRightGate;
  uniform float uReduced;

  void main() {
    vec2 uv = vUv;

    // Edge factor: 0 through the centre, ramping up only inside the edge band.
    float sx = uv.x;
    float dist = min(sx, 1.0 - sx);                 // 0 at edges, .5 at centre
    float edge = pow(smoothstep(uEdgeZone, 0.0, dist), uEdgePow);
    edge *= mix(uLeftGate, uRightGate, step(0.5, sx));
    edge *= (1.0 - uReduced);

    // Vertical fan: inverse-sample a band compressed toward the centerline, so
    // content near the edge magnifies/rolls vertically. Horizontal is untouched.
    float sampleY = uCenter + (uv.y - uCenter) / (1.0 + uFan * edge);

    // Vertical chromatic aberration, strongest at the bent edge.
    float ca = uChroma * edge * (0.4 + edge);

    float r = texture2D(tDiffuse, vec2(uv.x, sampleY + ca)).r;
    float g = texture2D(tDiffuse, vec2(uv.x, sampleY)).g;
    float b = texture2D(tDiffuse, vec2(uv.x, sampleY - ca)).b;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;
