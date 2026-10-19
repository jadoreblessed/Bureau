// Vexon's particle orb, rewritten on raw WebGL (no three.js): same shaders,
// same geometry and entrance, fewer particles, capped DPR, and it stops
// rendering whenever it is offscreen or the tab is hidden.

const VS = `
attribute vec3 position; attribute float aScale; attribute float aSeed;
uniform mat4 uProj; uniform mat4 uView;
uniform float uTime, uSize, uPixelRatio, uProgress;
varying float vIntensity; varying vec3 vColor;
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + 2.0 * C.xxx; vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
void main() {
  vec3 pos = position;
  float stagger = aSeed * 0.45;
  float lp = clamp((uProgress - stagger) / 0.55, 0.0, 1.0);
  float entrance = 1.0 - pow(1.0 - lp, 4.0);
  pos.xy *= mix(2.4, 1.0, entrance);
  pos.z += (1.0 - entrance) * 3.4;
  float swirl = (1.0 - entrance) * 4.5;
  pos.xy = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * pos.xy;
  float ang = uTime * 0.05;
  pos.xy = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * pos.xy;
  float t = uTime * 0.18;
  vec3 ni = pos * 1.2 + aSeed * 10.0;
  vec3 turb = vec3(snoise(ni + vec3(t, 0.0, 0.0)), snoise(ni + vec3(0.0, t, 5.0)), snoise(ni + vec3(0.0, 0.0, t + 9.0)));
  pos += turb * 0.22 * mix(3.0, 1.0, entrance);
  pos *= 1.0 + 0.015 * sin(uTime * 0.6 + aSeed * 6.28);
  vec4 mv = uView * vec4(pos, 1.0);
  float vertical = clamp(pos.y * 0.5 + 0.5, 0.0, 1.0);
  float topGlow = smoothstep(0.55, 1.0, vertical);
  vec3 col = mix(vec3(0.05, 0.18, 0.55), vec3(0.20, 0.45, 0.95), smoothstep(0.0, 0.7, vertical));
  col = mix(col, vec3(0.80, 0.92, 1.00), topGlow * 0.9);
  float spark = 0.6 + 0.5 * snoise(pos * 4.0 + aSeed * 3.0);
  vIntensity = (0.35 + 0.65 * vertical) * spark * entrance;
  vColor = col;
  gl_Position = uProj * mv;
  gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -mv.z);
}`;
const FS = `
precision highp float;
varying float vIntensity; varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
  float alpha = smoothstep(0.5, 0.0, d); alpha *= alpha;
  float core = smoothstep(0.18, 0.0, d) * 0.6;
  gl_FragColor = vec4(vColor * (vIntensity + core), (alpha + core) * vIntensity);
}`;

function buffers(count: number) {
  const pos = new Float32Array(count * 3), sc = new Float32Array(count), sd = new Float32Array(count);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const r = 0.95 + Math.abs(gauss()) * 0.9 * 0.55 + Math.random() * 0.15;
    pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = Math.sin(th) * r; pos[i * 3 + 2] = gauss() * 0.18;
    sc[i] = 0.5 + Math.random() * 1.6; sd[i] = Math.random();
  }
  return { pos, sc, sd };
}

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan((fov * Math.PI) / 360), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function view(rx: number, ry: number, z: number) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  // R = Rx * Ry, then translate by -z
  return new Float32Array([cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, -z, 1]);
}

export interface OrbCtl { started: boolean; visible: boolean }

export function initOrb(mount: HTMLElement, ctl: OrbCtl): () => void {
  const canvas = document.createElement("canvas");
  mount.appendChild(canvas);
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  if (!gl) { canvas.remove(); return () => {}; }
  const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return () => {}; }
  gl.useProgram(prog);

  const small = mount.clientWidth < 768;
  const lowCores = (navigator.hardwareConcurrency || 4) <= 4;
  const count = small ? 42000 : lowCores ? 70000 : 110000;
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const { pos, sc, sd } = buffers(count);
  const attr = (name: string, data: Float32Array, size: number) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  const bufs = [attr("position", pos, 3), attr("aScale", sc, 1), attr("aSeed", sd, 1)];
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uProj = U("uProj"), uView = U("uView"), uTime = U("uTime"), uSize = U("uSize"), uPR = U("uPixelRatio"), uProg = U("uProgress");
  gl.uniform1f(uSize, small ? 16 : 14);
  gl.uniform1f(uPR, pr);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniformMatrix4fv(uProj, false, perspective(45, w / Math.max(h, 1), 0.1, 100));
  };
  resize();

  const pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => { target.x = (e.clientX / window.innerWidth - 0.5) * 0.3; target.y = (e.clientY / window.innerHeight - 0.5) * 0.3; };
  window.addEventListener("pointermove", onMove, { passive: true });

  const t0 = performance.now();
  let paused = 0, pausedAt = 0, entranceStart: number | null = null, raf = 0, running = false;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - t0 - paused) / 1000;
    if (entranceStart === null && ctl.started) entranceStart = t;
    const p = entranceStart === null ? 0 : Math.min((t - entranceStart) / 3.2, 1);
    pointer.x += (target.x - pointer.x) * 0.04; pointer.y += (target.y - pointer.y) * 0.04;
    gl.uniform1f(uTime, t); gl.uniform1f(uProg, p);
    gl.uniformMatrix4fv(uView, false, view(pointer.y, pointer.x, 4.2));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  const start = () => { if (running) return; running = true; if (pausedAt) paused += performance.now() - pausedAt; frame(); };
  const stop = () => { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); };
  const sync = () => (ctl.visible && !document.hidden ? start() : stop());
  const iv = setInterval(sync, 250);
  sync();
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", resize);

  return () => {
    stop(); clearInterval(iv);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", sync);
    bufs.forEach((b) => gl.deleteBuffer(b));
    gl.deleteProgram(prog);
    canvas.remove();
  };
}

// 2D dotted sphere used by the preloader and the CTA block.
export function initDotSphere(canvas: HTMLCanvasElement, getProgress: () => number, opts: { count?: number; label?: string } = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const N = opts.count ?? 600;
  const pts = Array.from({ length: N }, (_, i) => {
    const phi = Math.acos(-1 + (2 * i) / N), th = Math.sqrt(N * Math.PI) * phi;
    return { x: Math.cos(th) * Math.sin(phi), y: Math.sin(th) * Math.sin(phi), z: Math.cos(phi), s: Math.random() * 1.5 + 0.3, a: Math.random() * 0.7 + 0.3, c: Math.random() > 0.4 ? "#ffffff" : Math.random() > 0.5 ? "#7fb2ff" : "#3a3f4a" };
  });
  let rot = 0, raf = 0, fin: number | null = null, w = 0, h = 0, visible = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => { const p = canvas.parentElement!; w = canvas.clientWidth || p.clientWidth; h = canvas.clientHeight || p.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; };
  size();
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
  io?.observe(canvas);
  const render = () => {
    raf = requestAnimationFrame(render);
    if (!visible) return;
    const prog = getProgress() / 100;
    let ap = prog;
    if (prog >= 1) { if (!fin) fin = Date.now(); ap = 1 + Math.min((Date.now() - fin) / 1000, 4) * 0.1; }
    rot += Math.max(0.001, 0.006 * (1 + (1 - Math.min(1, ap)) * 0.5));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.35 * (0.2 + Math.min(ap, 1.4) * 0.8);
    ctx.save(); ctx.translate(w / 2, h / 2);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const proj = pts.map((p) => ({ p, rx: p.x * cr - p.z * sr, rz: p.x * sr + p.z * cr })).sort((a, b) => a.rz - b.rz);
    for (const { p, rx, rz } of proj) {
      const per = 1000 / (1000 + rz * R);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a * Math.min(1, prog) * per * (rz < 0 ? 1 : 0.55)));
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(rx * R * per, p.y * R * per, p.s * per, 0, Math.PI * 2); ctx.fill();
    }
    if (opts.label) { ctx.globalAlpha = 0.85; ctx.fillStyle = "#cfe3ff"; ctx.font = "500 11px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.fillText(opts.label, 0, 4); }
    ctx.restore();
  };
  render();
  window.addEventListener("resize", size);
  return () => { cancelAnimationFrame(raf); io?.disconnect(); window.removeEventListener("resize", size); };
}
