// File: environmentSetup.js
// Static scene decoration extracted from simulation.js: space station model,
// lighting rig, world axes helper, and the eye-chart target plane.
// Each function only needs the THREE scene (and optionally a config path).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Deployed Gateway Core model. (A local 'gatewaycore.glb' can be swapped in for testing.)
const MODEL_PATH = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/Gateway/Gateway%20Core.glb';

// Load the static space station into the scene. Returns the station object once
// loaded (also added to the scene). The caller usually stores it for later use.
export function loadSpaceStation(scene) {
  const loader = new GLTFLoader();
  let station;
  loader.load(MODEL_PATH, gltf => {
    station = gltf.scene;
    station.scale.set(1,1,1);
    const rot1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI/180*-25);
    station.quaternion.multiply(rot1);
    const rot2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/180*-10);
    station.quaternion.multiply(rot2);
    station.position.set(0, 0, 0);
    station.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
    scene.add(station);
  }, undefined, err => console.error('GLTF load error:', err));
  return station;
}

// Add the lighting rig: low ambient, key directional light with high-quality
// shadows, and a soft fill light. Also adds a small world-axes helper.
export function setupLighting(scene) {
  // Reduced ambient light intensity to make shadows appear darker in shadowed areas
  scene.add(new THREE.AmbientLight(0x111111));

  // Enhanced directional light with high-quality shadow casting.
  // Shadow map reduced from 4096² to 2048² — a 4× drop in shadow-fill work
  // with negligible visual difference for this scene's scale.
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(-10, -2, -1);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.normalBias = 0.001;
  dirLight.shadow.radius = 4;
  scene.add(dirLight);

  // Secondary fill light for subtle shadow gradients
  const fillLight = new THREE.DirectionalLight(0x334466, 0.15);
  fillLight.position.set(5, 1, 2);
  scene.add(fillLight);

  scene.add(new THREE.AxesHelper(5));
}

// Add the eye-chart target plane to the scene (loaded from 'eyechart.png').
export function addEyeChart(scene) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load('eyechart.png', (texture) => {
    // Get the aspect ratio of the image
    const aspectRatio = texture.image.width / texture.image.height;

    // Set the longer dimension to 0.5m
    let width, height;
    if (aspectRatio > 1) {
      // Image is wider than tall
      width = 0.5;
      height = 0.5 / aspectRatio;
    } else {
      // Image is taller than wide (typical eye chart)
      height = 0.5;
      width = 0.5 * aspectRatio;
    }

    // Create plane geometry with calculated dimensions
    const eyeChartGeometry = new THREE.PlaneGeometry(width, height);
    const eyeChartMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      metalness: 0,
      roughness: 1
    });
    const eyeChartMesh = new THREE.Mesh(eyeChartGeometry, eyeChartMaterial);

    // Position the eye chart
    eyeChartMesh.position.set(0, 0, 15);
    eyeChartMesh.receiveShadow = true;

    // Explicitly set rotation to face +z direction
    eyeChartMesh.rotation.set(0, 0, 0);

    scene.add(eyeChartMesh);
    console.log('Eye chart added to scene:', { width, height, position: eyeChartMesh.position });
  });
}