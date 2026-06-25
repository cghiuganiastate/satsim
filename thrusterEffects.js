import * as THREE from 'three';

/**
 * Creates the visual representation of a single thruster.
 *
 * Builds three meshes grouped together:
 *  1. The thruster nozzle cone (casts/receives shadows, emissive when active).
 *  2. A white transparent exhaust plume cone that fades toward the tip and
 *     receives real shadows via the same shadow map as the spacecraft/station.
 *  3. A short-lived ignition smoke-puff cone that shoots outward from the
 *     nozzle on ignition, using 3D simplex noise (fbm) for billowing detail.
 *
 * @param {{x:number,y:number,z:number}} pos - Thruster position (local frame).
 * @param {{x:number,y:number,z:number}} dir - Exhaust direction (local frame).
 * @returns {{group: THREE.Group, material: THREE.MeshStandardMaterial, plume: THREE.Mesh, smokePuff: THREE.Mesh}}
 */
export function createThrusterVisual(pos, dir) {
  const group = new THREE.Group();
  const cone = new THREE.ConeGeometry(0.15 / 5, 0.4 / 5, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff5500, emissive: 0x000000, metalness: 0.1, roughness: 0.8
  });
  const mesh = new THREE.Mesh(cone, mat);
  mesh.position.copy(pos);
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, dir.z));
  mesh.quaternion.copy(q);
  mesh.rotateX(Math.PI);
  group.add(mesh);

  // White transparent exhaust plume cone that fades toward the tip.
  // Half the radius, twice the length vs. the original cone.
  const plumeHeight = 1.0;
  const plumeGeo = new THREE.ConeGeometry(0.05, plumeHeight, 16, 1, true);
  // The plume material receives real shadows from the same directional-light
  // shadow map that shades the spacecraft/station. It uses the same shadow
  // chunks as THREE.ShadowMaterial (getShadowMask()) so shadowed plumes darken.
  const plumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    lights: true, // required so the shadow/light uniforms are populated by the renderer
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uColor: { value: new THREE.Color(0xffffff) },
        uBaseOpacity: { value: 0.6 }
      }
    ]),
    vertexShader: /* glsl */`
      #include <common>
      #include <shadowmap_pars_vertex>
      varying float vY;
      void main() {
        // ConeGeometry is centered on origin with height along +Y.
        // height = 1.0 => Y in [-0.5, 0.5]; normalize to 0 (base) .. 1 (tip).
        vY = position.y + 0.5;
        // Transform vertex + compute shadow coordinates (needs worldPosition).
        // worldpos_vertex references transformedNormal (for shadowNormalBias),
        // so declare/transform the normal with the standard normal chunks.
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uColor;
      uniform float uBaseOpacity;
      varying float vY;
      void main() {
        // Opaque at the nozzle (tip), fading to transparent at the far end.
        float a = uBaseOpacity * pow(clamp(vY, 0.0, 1.0), 1.5);
        // getShadowMask(): 1.0 = fully lit, 0.0 = fully shadowed.
        float lit = getShadowMask();
        // Darken + thin the plume in shadow, the same way the spacecraft is
        // shaded by the station. A faint glow (0.25) remains in full shadow.
        float vis = mix(0.25, 1.0, lit);
        gl_FragColor = vec4(uColor * vis, a * vis);
      }
    `
  });
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.quaternion.copy(q);
  plume.position.copy(pos).addScaledVector(new THREE.Vector3(dir.x, dir.y, dir.z), -plumeHeight / 2);
  // Plumes RECEIVE shadows from the station/spacecraft (darkened in shadow),
  // but do not CAST shadows (avoids noisy self-shadowing of the exhaust).
  plume.castShadow = false;
  plume.receiveShadow = true;
  // Start invisible; opacity ramps up/down over ~3 frames on fire/stop.
  plume.visible = false;
  plume.material.uniforms.uBaseOpacity.value = 0;
  plume.userData.plumeOpacity = 0;   // current animated opacity
  plume.userData.plumeTarget = 0;    // 0 = off, plumeMax = on
  plume.userData.plumeMax = 0.6;     // peak opacity when fully firing
  group.add(plume);

  // --- Ignition smoke puff ---
  // A short-lived cone-shaped burst that shoots outward from the nozzle the
  // moment the thruster fires, like actual thruster exhaust. Wider than the
  // plume cone, uses 3D simplex noise (fbm) for billowing/flickering detail,
  // and receives real shadows just like the plume. It expands, travels
  // outward, and fades over its lifetime (animated in the render loop).
  const smokeRadius = 0.15;  // wider than the plume cone (radius 0.05)
  const smokeHeight = 0.5;
  const smokeGeo = new THREE.ConeGeometry(smokeRadius, smokeHeight, 16, 1, true);
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    lights: true, // required for the shadow/light uniforms
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.0 },
        uTime: { value: 0.0 }
      }
    ]),
    vertexShader: /* glsl */`
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec3 vLocal;
      void main() {
        // Object-space position for noise sampling (unaffected by scale).
        vLocal = position;
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vLocal;

      // 3D simplex noise (Ashima Arts / Stefan Gustavson).
      vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v){
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
      // Fractal Brownian motion: stacked noise octaves for cloud-like detail.
      float fbm(vec3 p){
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * snoise(p);
          p = p * 2.0 + 0.3;
          a *= 0.5;
        }
        return v;
      }
      void main() {
        // Sample billowing noise in local space, drifting outward (along -Y,
        // the exhaust direction in the cone's local frame).
        vec3 p = vLocal * 8.0 + vec3(0.0, -uTime * 3.0, 0.0);
        float n = fbm(p);
        n = n * 0.5 + 0.5; // -> 0..1
        // ConeGeometry height 0.5 => y in [-0.25, +0.25].
        // Apex (+y) sits at the nozzle; base (-y) extends outward.
        // Hottest/brightest at the nozzle, fading outward like real fire.
        float t = clamp((vLocal.y + 0.25) / 0.5, 0.0, 1.0); // 0=base(out), 1=apex(nozzle)
        float fire = pow(t, 1.3);
        float smoke = n * fire;
        float a = clamp(smoke, 0.0, 1.0) * uOpacity;
        // Real shadows, same as the plume.
        float lit = getShadowMask();
        float vis = mix(0.3, 1.0, lit);
        gl_FragColor = vec4(uColor * vis, a * vis);
        if (a < 0.01) discard;
      }
    `
  });
  const smokePuff = new THREE.Mesh(smokeGeo, smokeMat);
  // Orient the cone like the plume (apex at the nozzle, widening outward
  // along the exhaust direction) and offset it so the apex sits exactly at
  // the nozzle position.
  const smokeExhaustDir = new THREE.Vector3(-dir.x, -dir.y, -dir.z);
  const smokeOrigin = new THREE.Vector3(pos.x, pos.y, pos.z)
    .addScaledVector(smokeExhaustDir, smokeHeight / 2);
  smokePuff.quaternion.copy(q);
  smokePuff.position.copy(smokeOrigin);
  // Puffs receive shadows but do not cast them.
  smokePuff.castShadow = false;
  smokePuff.receiveShadow = true;
  smokePuff.visible = false;
  smokePuff.scale.setScalar(0.001); // start tiny; expanded by the animation
  smokePuff.material.uniforms.uOpacity.value = 0;
  smokePuff.userData.smokeLife = 0;          // remaining seconds (0 = inactive)
  smokePuff.userData.smokeDuration = 0.2;    // total puff lifetime (s)
  smokePuff.userData.smokeStartScale = 1.0;  // ~15cm radius at ignition
  smokePuff.userData.smokeEndScale = 1.8;    // ~27cm radius when dissipated
  smokePuff.userData.smokePeakOpacity = 0.65;
  smokePuff.userData.smokeExhaustDir = smokeExhaustDir; // outward direction (local)
  smokePuff.userData.smokeOrigin = smokeOrigin;         // nozzle-offset start position
  smokePuff.userData.smokeTravel = 0.2;                 // how far it shoots outward (m)
  group.add(smokePuff);

  return { group, material: mat, plume, smokePuff };
}

/**
 * Applies the visual-only effects of activating/deactivating a thruster.
 *
 * - On ignition (off -> on): fires a one-shot smoke puff at the nozzle.
 * - Starts the exhaust plume fade in/out (animated in {@link updateThrusterEffects}).
 *
 * @param {object} thruster - The thruster object (must have `.plume` and `.smokePuff`).
 * @param {boolean} wasActive - Whether the thruster was active *before* this call.
 * @param {boolean} active - Whether the thruster is now active.
 */
export function setThrusterEffectActive(thruster, wasActive, active) {
  // Fire a one-shot smoke puff at the nozzle on ignition (off -> on only).
  if (!wasActive && active && thruster.smokePuff) {
    const sp = thruster.smokePuff;
    const sud = sp.userData;
    sud.smokeLife = sud.smokeDuration;
    sp.scale.setScalar(sud.smokeStartScale);
    if (sud.smokeOrigin) sp.position.copy(sud.smokeOrigin);
    sp.material.uniforms.uOpacity.value = sud.smokePeakOpacity;
    sp.visible = true;
  }
  // Start the plume fade in/out (animated in the render loop).
  if (thruster.plume) {
    thruster.plume.userData.plumeTarget = active ? thruster.plume.userData.plumeMax : 0;
    if (active) thruster.plume.visible = true;
  }
}

/**
 * Animates all thruster exhaust plumes and ignition smoke puffs for one frame.
 *
 * - Ramps each plume's opacity toward its target (~3 frames), hiding it at 0.
 * - Expands, projects outward, and fades each active smoke puff.
 *
 * @param {Array<object>} thrusters - Array of thruster objects.
 * @param {number} dt - Frame delta time in seconds.
 */
export function updateThrusterEffects(thrusters, dt) {
  thrusters.forEach(t => {
    // --- Plume fade in/out ---
    const p = t.plume;
    if (!p) return;
    const ud = p.userData;
    const speed = ud.plumeMax / 3; // ~3 frames to full / to zero
    if (ud.plumeOpacity < ud.plumeTarget) {
      ud.plumeOpacity = Math.min(ud.plumeTarget, ud.plumeOpacity + speed);
    } else if (ud.plumeOpacity > ud.plumeTarget) {
      ud.plumeOpacity = Math.max(ud.plumeTarget, ud.plumeOpacity - speed);
    }
    p.material.uniforms.uBaseOpacity.value = ud.plumeOpacity;
    if (ud.plumeOpacity <= 0 && ud.plumeTarget <= 0) p.visible = false;

    // --- Smoke puff: expand, project outward, and fade ---
    const sp = t.smokePuff;
    if (sp && sp.userData.smokeLife > 0) {
      const sud = sp.userData;
      sud.smokeLife = Math.max(0, sud.smokeLife - dt);
      const lifeT = sud.smokeDuration > 0 ? sud.smokeLife / sud.smokeDuration : 0; // 1 -> 0
      const k = 1.0 - lifeT; // 0 -> 1 over the puff
      const scale = sud.smokeStartScale + (sud.smokeEndScale - sud.smokeStartScale) * k;
      sp.scale.setScalar(scale);
      // Project the cone outward along the exhaust direction.
      if (sud.smokeOrigin && sud.smokeExhaustDir) {
        sp.position.copy(sud.smokeOrigin)
          .addScaledVector(sud.smokeExhaustDir, sud.smokeTravel * k);
      }
      sp.material.uniforms.uOpacity.value = lifeT * sud.smokePeakOpacity;
      sp.material.uniforms.uTime.value += dt;
      if (sud.smokeLife <= 0) {
        sp.visible = false;
        sp.material.uniforms.uOpacity.value = 0;
      }
    }
  });
}