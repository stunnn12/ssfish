import * as THREE from 'three';

// Sóng bằng vertex shader (tổng các hàm sin), pháp tuyến tính bằng đạo hàm màn hình
// để có mặt nước low-poly, không phản chiếu thật.
const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec2 uOffset;
varying vec3 vWorld;
varying float vH;
float wave(vec2 p) {
  float t = uTime;
  return (sin(p.x * 0.11 + t * 0.8) * 0.45
        + sin(p.y * 0.14 - t * 1.0 + p.x * 0.04) * 0.35
        + sin((p.x + p.y) * 0.23 + t * 1.6) * 0.16
        + sin((p.x - p.y * 0.7) * 0.41 - t * 2.2) * 0.07) * uAmp;
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = wave(w.xz + uOffset);
  w.y += h;
  vH = h;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAmp;
uniform float uTime;
uniform vec3 uIsland;
uniform float uFoamShore;
varying vec3 vWorld;
varying float vH;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  float crest = clamp(vH / max(uAmp, 0.05) * 0.55 + 0.5, 0.0, 1.0);
  vec3 base = mix(uDeep, uShallow, crest * 0.55);
  float di = length(vWorld.xz - uIsland.xy) - uIsland.z;
  float shore = 1.0 - smoothstep(0.0, 16.0, di);
  base = mix(base, uShallow, shore * 0.85);
  float ring = 1.0 - smoothstep(0.0, 1.6, abs(di - 0.6 - sin(uTime * 1.3 + vWorld.x * 0.25 + vWorld.z * 0.2) * 0.7));
  float foam = ring * uFoamShore;
  vec3 L = normalize(uSunDir);
  float diff = max(dot(n, L), 0.0);
  vec3 col = base * (uAmbient + uSunColor * diff * 0.7);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 220.0);
  col += uSunColor * spec * 0.45;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col = mix(col, uFogColor, fres * 0.18);
  col = mix(col, (uAmbient + uSunColor * 0.6) * 0.95, foam);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const WATER_SIZE = 560;
export const WATER_SEGS = 150;

export function createWater() {
  const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGS, WATER_SEGS);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.6 },
    uOffset: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Color('#0f6a90') },
    uShallow: { value: new THREE.Color('#5fe0d0') },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color('#ffffff') },
    uAmbient: { value: new THREE.Color('#888888') },
    uFogColor: { value: new THREE.Color('#cfefff') },
    uFogNear: { value: 80 },
    uFogFar: { value: 320 },
    uIsland: { value: new THREE.Vector3(0, 0, 20) },
    uFoamShore: { value: 0.9 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return { mesh, uniforms, cell: WATER_SIZE / WATER_SEGS };
}

/** Cùng công thức với shader, để phao/thuyền nổi đúng mặt sóng. */
export function waveHeight(x, z, t, amp, ox = 0, oz = 0) {
  const px = x + ox, pz = z + oz;
  return (
    (Math.sin(px * 0.11 + t * 0.8) * 0.45 +
      Math.sin(pz * 0.14 - t * 1.0 + px * 0.04) * 0.35 +
      Math.sin((px + pz) * 0.23 + t * 1.6) * 0.16 +
      Math.sin((px - pz * 0.7) * 0.41 - t * 2.2) * 0.07) *
    amp
  );
}
