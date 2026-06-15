// ── PIXEL TRANSITION ──
(function () {
  const overlay = document.getElementById("pixel-overlay");
  const SIZE = 40;
  const cols = Math.ceil(window.innerWidth / SIZE) + 1;
  const rows = Math.ceil(window.innerHeight / SIZE) + 1;
  const total = cols * rows;

  overlay.style.gridTemplateColumns = `repeat(${cols}, ${SIZE}px)`;
  overlay.style.gridTemplateRows = `repeat(${rows}, ${SIZE}px)`;

  for (let i = 0; i < total; i++) {
    const b = document.createElement("div");
    b.className = "pixel-block";
    overlay.appendChild(b);
  }

  const blocks = overlay.querySelectorAll(".pixel-block");

  function dissolve() {
    const indices = Array.from({ length: total }, (_, i) => i);
    // Shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let done = 0;
    const batch = Math.ceil(total / 40);

    indices.forEach((idx, pos) => {
      const delay = Math.floor(pos / batch) * 30;
      setTimeout(() => {
        blocks[idx].style.transition = "opacity 0.2s, transform 0.3s";
        blocks[idx].style.opacity = "0";
        blocks[idx].style.transform = "scale(0)";
        done++;
        if (done === total) {
          setTimeout(() => {
            overlay.style.display = "none";
          }, 300);
        }
      }, delay);
    });
  }

  window.addEventListener("load", () => setTimeout(dissolve, 200));
})();

// ── FERROFLUID WEBGL BACKGROUND ──
(function () {
  const canvas = document.getElementById("ferrofluid-canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
  });
  if (!gl) {
    console.warn("WebGL not supported");
    return;
  }

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // ── CONFIG (matching Ferrofluid props) ──
  const CFG = {
    colors: ["#000000", "#334727", "#fcfcfb", "#34d399"],
    speed: 0.1,
    scale: 1.6,
    turbulence: 1.0,
    fluidity: 0.1,
    rimWidth: 0.22,
    sharpness: 2.5,
    shimmer: 1.5,
    glow: 2.2,
    flowDirection: "down",
    opacity: 1.0,
    mouseStrength: 1.0,
    mouseRadius: 0.35,
    mouseDampening: 0.15,
  };

  const MAX_COLORS = 8;
  const hexToRGB = (hex) => {
    const c = hex.replace("#", "").padEnd(6, "0");
    return [
      parseInt(c.slice(0, 2), 16) / 255,
      parseInt(c.slice(2, 4), 16) / 255,
      parseInt(c.slice(4, 6), 16) / 255,
    ];
  };
  const prepColors = (inp) => {
    const base = (inp && inp.length ? inp : ["#4F46E5"]).slice(0, MAX_COLORS);
    const arr = [];
    for (let i = 0; i < MAX_COLORS; i++)
      arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
    return { arr, count: base.length };
  };
  const flowVec = (d) =>
    ({ up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] })[d] || [0, -1];

  // ── VERTEX SHADER ──
  const vsSource = `
        attribute vec2 aPosition;
        varying vec2 vUv;
        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;

  // ── FRAGMENT SHADER (direct port from Ferrofluid) ──
  const fsSource = `
        precision highp float;
        uniform vec3  iResolution;
        uniform vec2  iMouse;
        uniform float iTime;
        uniform vec3  uColor0; uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
        uniform vec3  uColor4; uniform vec3 uColor5; uniform vec3 uColor6; uniform vec3 uColor7;
        uniform int   uColorCount;
        uniform vec2  uFlow;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uTurbulence;
        uniform float uFluidity;
        uniform float uRimWidth;
        uniform float uSharpness;
        uniform float uShimmer;
        uniform float uGlow;
        uniform float uOpacity;
        uniform float uMouseEnabled;
        uniform float uMouseStrength;
        uniform float uMouseRadius;
        varying vec2 vUv;

        #define PI 3.14159265

        vec3 palette(float h) {
          int cnt = uColorCount; if (cnt < 1) cnt = 1;
          int idx = int(floor(clamp(h, 0.0, 0.999999) * float(cnt)));
          if (idx <= 0) return uColor0;
          if (idx == 1) return uColor1;
          if (idx == 2) return uColor2;
          if (idx == 3) return uColor3;
          if (idx == 4) return uColor4;
          if (idx == 5) return uColor5;
          if (idx == 6) return uColor6;
          return uColor7;
        }

        float hash(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float smin(float a, float b, float k) {
          float r = exp2(-a/k) + exp2(-b/k);
          return -k * log2(r);
        }

        float sinlerp(float a, float b, float w) {
          return mix(a, b, (sin(w * PI - PI/2.0) + 1.0) / 2.0);
        }

        float vn(vec2 p, float s, float seed) {
          vec2 cellp = floor(p/s);
          vec2 relp  = mod(p, s);
          float g1 = hash(vec3(cellp, seed));
          float g2 = hash(vec3(cellp.x+1.0, cellp.y, seed));
          float g3 = hash(vec3(cellp.x+1.0, cellp.y+1.0, seed));
          float g4 = hash(vec3(cellp.x, cellp.y+1.0, seed));
          float bx = sinlerp(g1, g2, relp.x/s);
          float tx = sinlerp(g4, g3, relp.x/s);
          return sinlerp(bx, tx, relp.y/s);
        }

        float dbn(vec2 p, float s, float seed) {
          float o = s/2.0;
          float n0 = vn(p, s, seed);
          float n1 = vn(p+vec2(o,o),   s, seed+0.1);
          float n2 = vn(p+vec2(-o,o),  s, seed+0.2);
          float n3 = vn(p+vec2(o,-o),  s, seed+0.3);
          float n4 = vn(p+vec2(-o,-o), s, seed+0.4);
          return (2.0*n0 + 1.5*n1 + 1.25*n2 + 1.125*n3 + n4) / 7.0;
        }

        void main() {
          float ref = 700.0 / max(uScale, 0.05);
          vec2 p = vUv * iResolution.xy / iResolution.y * ref;
          float spd = 200.0 * uSpeed;
          float t = iTime;
          vec2 dir = uFlow;
          vec2 perp = vec2(-dir.y, dir.x);

          float d1 = vn(p + perp*(t*spd), 60.0, 10.0) * 50.0 * uTurbulence;
          float d2 = vn(p - perp*(t*spd), 120.0, 15.0) * 100.0 * uTurbulence;

          float peaks  = dbn(p + d1 + dir*(t*spd*0.5), 40.0, 1.0);
          float peaks2 = dbn(p + d2 - dir*(t*spd*0.5), 40.0, 0.0);

          float mapeaks = smin(peaks, peaks2, max(uFluidity, 0.001));

          float mGlow = 0.0;
          if (uMouseEnabled > 0.5) {
            vec2 mp = iMouse / iResolution.y * ref;
            float md = length(p - mp) / ref;
            float rr = max(uMouseRadius, 0.02);
            mGlow = exp(-md*md/(rr*rr)) * uMouseStrength;
          }

          float band = (uRimWidth - abs((mapeaks - 0.4) * 2.0)) * 5.0;
          float ltn  = clamp(band - vn(p + dir*(t*spd*0.5), 60.0, 12.0)*uShimmer, 0.0, 1.0);
          ltn = pow(ltn, uSharpness) * uGlow;
          ltn *= clamp(1.0 - mGlow, 0.0, 1.0);

          float h = clamp(0.5 + (peaks - peaks2)*0.8, 0.0, 1.0);
          vec3 col = palette(h);
          vec3 outc = col * ltn;
          float a = clamp(max(outc.r, max(outc.g, outc.b)), 0.0, 1.0);
          gl_FragColor = vec4(outc, a * uOpacity);
        }
      `;

  // ── COMPILE SHADERS ──
  function makeShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = makeShader(gl.VERTEX_SHADER, vsSource);
  const fs = makeShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // ── FULLSCREEN TRIANGLE ──
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "aPosition");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // ── UNIFORMS ──
  const U = (name) => gl.getUniformLocation(prog, name);
  const uLocs = {
    iResolution: U("iResolution"),
    iMouse: U("iMouse"),
    iTime: U("iTime"),
    uColor0: U("uColor0"),
    uColor1: U("uColor1"),
    uColor2: U("uColor2"),
    uColor3: U("uColor3"),
    uColor4: U("uColor4"),
    uColor5: U("uColor5"),
    uColor6: U("uColor6"),
    uColor7: U("uColor7"),
    uColorCount: U("uColorCount"),
    uFlow: U("uFlow"),
    uSpeed: U("uSpeed"),
    uScale: U("uScale"),
    uTurbulence: U("uTurbulence"),
    uFluidity: U("uFluidity"),
    uRimWidth: U("uRimWidth"),
    uSharpness: U("uSharpness"),
    uShimmer: U("uShimmer"),
    uGlow: U("uGlow"),
    uOpacity: U("uOpacity"),
    uMouseEnabled: U("uMouseEnabled"),
    uMouseStrength: U("uMouseStrength"),
    uMouseRadius: U("uMouseRadius"),
  };

  const { arr, count } = prepColors(CFG.colors);
  const flow = flowVec(CFG.flowDirection);

  function setUniforms() {
    for (let i = 0; i < MAX_COLORS; i++) {
      gl.uniform3fv(uLocs["uColor" + i], arr[i]);
    }
    gl.uniform1i(uLocs.uColorCount, count);
    gl.uniform2fv(uLocs.uFlow, flow);
    gl.uniform1f(uLocs.uSpeed, CFG.speed);
    gl.uniform1f(uLocs.uScale, CFG.scale);
    gl.uniform1f(uLocs.uTurbulence, CFG.turbulence);
    gl.uniform1f(uLocs.uFluidity, CFG.fluidity);
    gl.uniform1f(uLocs.uRimWidth, CFG.rimWidth);
    gl.uniform1f(uLocs.uSharpness, CFG.sharpness);
    gl.uniform1f(uLocs.uShimmer, CFG.shimmer);
    gl.uniform1f(uLocs.uGlow, CFG.glow);
    gl.uniform1f(uLocs.uOpacity, CFG.opacity);
    gl.uniform1f(uLocs.uMouseEnabled, 1.0);
    gl.uniform1f(uLocs.uMouseStrength, CFG.mouseStrength);
    gl.uniform1f(uLocs.uMouseRadius, CFG.mouseRadius);
  }
  setUniforms();

  // ── RESIZE ──
  let W = 0,
    H = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = Math.floor(window.innerWidth * dpr);
    H = Math.floor(window.innerHeight * dpr);
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener("resize", resize);

  // ── MOUSE ──
  const mouse = { cur: [0, 0], target: [0, 0] };
  let lastMT = 0;
  window.addEventListener("mousemove", (e) => {
    const dpr = window.devicePixelRatio || 1;
    mouse.target[0] = e.clientX * dpr;
    mouse.target[1] = (window.innerHeight - e.clientY) * dpr;
  });

  // ── RENDER LOOP ──
  function loop(t) {
    requestAnimationFrame(loop);
    const secs = t * 0.001;
    if (!lastMT) lastMT = secs;
    const dt = secs - lastMT;
    lastMT = secs;
    const tau = Math.max(1e-4, CFG.mouseDampening);
    const f = Math.min(1, 1 - Math.exp(-dt / tau));
    mouse.cur[0] += (mouse.target[0] - mouse.cur[0]) * f;
    mouse.cur[1] += (mouse.target[1] - mouse.cur[1]) * f;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform3f(uLocs.iResolution, W, H, 1);
    gl.uniform2f(uLocs.iMouse, mouse.cur[0], mouse.cur[1]);
    gl.uniform1f(uLocs.iTime, secs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(loop);
})();

// ── CURSOR ──
(function () {
  const dot = document.getElementById("cursor");
  const ring = document.getElementById("cursor-ring");
  let mx = -100,
    my = -100,
    rx = -100,
    ry = -100;

  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  function updateRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    dot.style.left = mx + "px";
    dot.style.top = my + "px";
    ring.style.left = rx + "px";
    ring.style.top = ry + "px";
    requestAnimationFrame(updateRing);
  }
  updateRing();

  document
    .querySelectorAll("a, button, .project-card, .masonry-item")
    .forEach((el) => {
      el.addEventListener("mouseenter", () => {
        ring.style.width = "52px";
        ring.style.height = "52px";
        ring.style.opacity = "0.6";
      });
      el.addEventListener("mouseleave", () => {
        ring.style.width = "32px";
        ring.style.height = "32px";
        ring.style.opacity = "1";
      });
    });
})();

// ── MOBILE MENU ──
const hamburger = document.getElementById("hamburger");
const mobileMenu = document.getElementById("mobile-menu");
let menuOpen = false;

hamburger.addEventListener("click", () => {
  menuOpen = !menuOpen;
  mobileMenu.classList.toggle("open", menuOpen);
  document.body.style.overflow = menuOpen ? "hidden" : "";
});

mobileMenu.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    menuOpen = false;
    mobileMenu.classList.remove("open");
    document.body.style.overflow = "";
  }),
);

// ── SKILLS MARQUEE ──
const row1Skills = [
  { name: "React", icon: "fab fa-react" },
  { name: "Node.js", icon: "fab fa-node-js" },
  { name: "TypeScript", icon: "fab fa-js-square" },
  { name: "Python", icon: "fab fa-python" },
  { name: "Fastify", icon: "fas fa-rocket" },
  { name: "Expo", icon: "fas fa-mobile-alt" },
  { name: "Laravel", icon: "fab fa-laravel" },
  { name: "Flutter", icon: "fas fa-mobile" },
];
const row2Skills = [
  { name: "Figma", icon: "fas fa-pencil-ruler" },
  { name: "MongoDB", icon: "fas fa-database" },
  { name: "Tailwind CSS", icon: "fas fa-palette" },
  { name: "Git", icon: "fab fa-git-alt" },
  { name: "Socket.io", icon: "fas fa-bolt" },
  { name: "Docker", icon: "fab fa-docker" },
];

function makePill(s) {
  return `<div class="skill-pill"><i class="${s.icon}"></i>${s.name}</div>`;
}

document.getElementById("row1").innerHTML = [
  ...row1Skills,
  ...row1Skills,
  ...row1Skills,
  ...row1Skills,
]
  .map(makePill)
  .join("");
document.getElementById("row2").innerHTML = [
  ...row2Skills,
  ...row2Skills,
  ...row2Skills,
  ...row2Skills,
]
  .map(makePill)
  .join("");

// ── GSAP ANIMATIONS ──
gsap.registerPlugin(ScrollTrigger);

// Navbar slide in
gsap.from("nav", {
  y: -80,
  opacity: 0,
  duration: 0.8,
  ease: "power3.out",
  delay: 0.5,
});

// Hero stagger reveal
gsap.utils.toArray(".hero .reveal").forEach((el, i) => {
  gsap.to(el, {
    y: 0,
    opacity: 1,
    duration: 0.9,
    delay: 0.8 + i * 0.1,
    ease: "power3.out",
  });
});

gsap.to(".hero .reveal-right", {
  x: 0,
  opacity: 1,
  duration: 1,
  delay: 0.9,
  ease: "power3.out",
});

// Scroll-triggered reveals
gsap.utils.toArray(".reveal").forEach((el) => {
  if (el.closest(".hero")) return;
  gsap.to(el, {
    scrollTrigger: { trigger: el, start: "top 85%" },
    y: 0,
    opacity: 1,
    duration: 0.8,
    ease: "power3.out",
  });
});

gsap.utils.toArray(".reveal-left").forEach((el) => {
  gsap.to(el, {
    scrollTrigger: { trigger: el, start: "top 80%" },
    x: 0,
    opacity: 1,
    duration: 0.9,
    ease: "power3.out",
  });
});

gsap.utils.toArray(".reveal-right").forEach((el) => {
  if (el.closest(".hero")) return;
  gsap.to(el, {
    scrollTrigger: { trigger: el, start: "top 80%" },
    x: 0,
    opacity: 1,
    duration: 0.9,
    ease: "power3.out",
  });
});

gsap.utils.toArray(".reveal-scale").forEach((el, i) => {
  gsap.to(el, {
    scrollTrigger: { trigger: el, start: "top 88%" },
    scale: 1,
    opacity: 1,
    duration: 0.7,
    delay: (i % 4) * 0.08,
    ease: "back.out(1.4)",
  });
});

// Section titles scrub
gsap.utils.toArray(".section-title").forEach((el) => {
  gsap.fromTo(
    el,
    { backgroundPositionX: "0%" },
    {
      scrollTrigger: {
        trigger: el,
        start: "top 80%",
        end: "bottom 20%",
        scrub: 1,
      },
      backgroundPositionX: "100%",
    },
  );
});
