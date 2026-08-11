// essay-bg.js — WebGL generative background for the essay page.
//
// Implementation approach parsed from https://www.northgarden.com (Three.js r180):
//   - a single <canvas data-engine="three.js"> driven by an OrthographicCamera
//     full-screen quad (PlaneGeometry 2x2) + procedural ShaderMaterial
//   - clock-driven idle animation + pointer parallax
//
// Reused here with the project's local Three.js (assets/vendor/three.module.min.js,
// resolved via importmap) and graceful degradation: if Three.js fails to load, the
// static CSS background (ng-pattern.svg over the dark base) remains visible.

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Dark generative field: fbm domain-warp -> contour lines, faint northgarden cyan.
const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform vec2 u_mouse;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= u_res.x / u_res.y;
    p += (u_mouse - 0.5) * 0.06;            // pointer parallax

    float t = u_time * 0.05;
    vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 5.2));
    float f = fbm(p * 2.2 + q * 1.5 + t * 0.5);

    float lines = abs(sin(f * 18.0 + t * 2.0));
    lines = pow(1.0 - lines, 8.0);

    vec3 base = vec3(0.055, 0.063, 0.078);  // ~ #0e1014
    vec3 cyan = vec3(0.24, 0.95, 0.95);      // northgarden cyan hint (0x3fffff)

    vec3 col = base;
    col += cyan * lines * 0.10;
    col += cyan * f * 0.04;

    float vig = smoothstep(1.15, 0.25, length(uv - 0.5));
    col *= mix(0.68, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

async function init() {
  const canvas = document.getElementById('essay-bg');
  if (!canvas) return;

  let THREE;
  try {
    THREE = await import('three');
  } catch (err) {
    // Graceful degrade: leave the static CSS background in place.
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
  } catch (err) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    u_time: { value: 0 },
    u_res: { value: new THREE.Vector2(1, 1) },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.u_res.value.set(w, h);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const target = { x: 0.5, y: 0.5 };
  window.addEventListener('pointermove', (e) => {
    target.x = e.clientX / window.innerWidth;
    target.y = 1 - e.clientY / window.innerHeight;
  }, { passive: true });

  const clock = new THREE.Clock();
  let raf = null;
  let running = true;

  function frame() {
    if (!running) return;
    uniforms.u_time.value += clock.getDelta();
    uniforms.u_mouse.value.x += (target.x - uniforms.u_mouse.value.x) * 0.05;
    uniforms.u_mouse.value.y += (target.y - uniforms.u_mouse.value.y) * 0.05;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  if (REDUCE) {
    uniforms.u_time.value = 12.0;
    renderer.render(scene, camera);
  } else {
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    } else if (!REDUCE) {
      running = true;
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  });
}

init();
