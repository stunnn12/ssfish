import * as THREE from 'three';
import { lam } from './materials.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uCloudy;
uniform float uFlash;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uBottom, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float clear = 1.0 - uCloudy * 0.85;
  col += uSunColor * (smoothstep(0.9985, 0.9992, sd) * 2.2 + pow(sd, 10.0) * 0.28) * clear;
  float md = dot(d, normalize(uMoonDir));
  col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9989, 0.9993, md) * uNight * clear;
  col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 40.0) * 0.12 * uNight * clear;
  vec3 cell = floor(d * 170.0);
  float st = step(0.9968, hash(cell)) * smoothstep(0.04, 0.3, h) * uNight * clear;
  col += st * (0.6 + 0.4 * hash(cell + 1.7));
  col += vec3(0.75, 0.8, 1.0) * uFlash * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color('#3f9fe8') },
    uHorizon: { value: new THREE.Color('#c4ebff') },
    uBottom: { value: new THREE.Color('#0f4a66') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff2d0') },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
    uCloudy: { value: 0 },
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Mây low-poly trôi chậm trên trời. */
export function createClouds() {
  const group = new THREE.Group();
  const mat = lam('#ffffff', { fog: false, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(blob, mat);
      const s = 7 + Math.random() * 7;
      m.scale.set(s * 1.4, s * 0.7, s);
      m.position.set((k - n / 2) * 9 + Math.random() * 4, Math.random() * 3, Math.random() * 6 - 3);
      m.rotation.set(Math.random(), Math.random() * 3, Math.random());
      c.add(m);
    }
    const a = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
    const r = 250 + Math.random() * 90;
    c.position.set(Math.cos(a) * r, 55 + Math.random() * 45, Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    group.add(c);
  }
  group.userData.mat = mat;
  return group;
}
