// spacecraftManager.js

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Spacecraft-related variables
let spacecraftGroup = null; // We will use a group to contain the model and bounding box
let spacecraftBoundingBoxMesh = null;
let spacecraftBody = null;

// Load spacecraft model from a File object
export function loadSpacecraft(file, scene, world, rotation, centroidModel, properties, onLoaded) {
  // Clean up previous spacecraft if it exists
  if (spacecraftGroup) {
    scene.remove(spacecraftGroup);
    world.removeBody(spacecraftBody);
  }

  const fileName = file.name.toLowerCase();
  const isGLB = fileName.endsWith('.glb') || fileName.endsWith('.gltf');
  const url = URL.createObjectURL(file);

  // Create a group to hold the model and its bounding box
  spacecraftGroup = new THREE.Group();
  spacecraftGroup.position.set(10, 0, 0); // Set initial position
  scene.add(spacecraftGroup);

  if (isGLB) {
    const loader = new GLTFLoader();
    loader.load(
      url,
      gltf => {
        const model = gltf.scene;
        processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded);
      },
      undefined,
      err => console.error('GLTF load error:', err)
    );
  } else { // Assume STL
    const loader = new STLLoader();
    loader.load(
      url,
      geometry => {
        const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const model = new THREE.Mesh(geometry, material);
        processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded);
      },
      undefined,
      error => {
        console.error('Error loading STL model:', error);
        document.getElementById('hull-status').textContent = 'Error: Invalid STL file';
      }
    );
  }
}

// This function handles the common logic after a model (GLB or STL) is loaded
function processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded) {
  // 1. Apply successive rotations FIRST
  if (rotation) {
    // Note: The order of rotations matters. X, then Y, then Z is a common convention.
    if (rotation.x !== 0) {
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(rotation.x));
      model.quaternion.multiply(qx);
    }
    if (rotation.y !== 0) {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rotation.y));
      model.quaternion.multiply(qy);
    }
    if (rotation.z !== 0) {
      const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rotation.z));
      model.quaternion.multiply(qz);
    }
  }

  // 2. Calculate bounding box of the ROTATED model
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // This vector will hold the offset for our collision box and visual helper
  let collisionBoxOffset = new THREE.Vector3(0, 0, 0);

  // 3. Center the model if centroid option is checked
  if (centroidModel) {
    model.position.sub(center);
    // If we center the model, the collision box is already aligned at the origin, so no offset is needed.
  } else {
    // If we DON'T center the model, we need to offset the collision box to match the model's position.
    collisionBoxOffset.copy(center);
  }

  // Add the model to the main group
  spacecraftGroup.add(model);

  // Create physics shape
  const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
  
  // Create the body with custom properties if provided
  const bodyOptions = {
    mass: properties.mass || 10000,
    angularDamping: 0,
    linearDamping: 0,
    allowSleep: false
  };
  
  // Add inertia if provided
  if (properties.inertia) {
    bodyOptions.inertia = new CANNON.Vec3(
      properties.inertia.x || 0,
      properties.inertia.y || 0,
      properties.inertia.z || 0
    );
  }
  
  spacecraftBody = new CANNON.Body(bodyOptions);
  
  // Add the shape with the calculated offset
  spacecraftBody.addShape(shape, new CANNON.Vec3(collisionBoxOffset.x, collisionBoxOffset.y, collisionBoxOffset.z));
  
  // Set the body's position to match the group's position
  spacecraftBody.position.copy(spacecraftGroup.position);
  world.addBody(spacecraftBody);

  // Create visual bounding box that matches the rotated model
  const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const boxMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.2,
    wireframe: true
  });
  spacecraftBoundingBoxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
  spacecraftBoundingBoxMesh.visible = false; // Hidden by default
  
  // Position the visual bounding box with the same offset
  spacecraftBoundingBoxMesh.position.copy(collisionBoxOffset);
  
  spacecraftGroup.add(spacecraftBoundingBoxMesh);

  // Add axes helper to the group
  const satAxes = new THREE.AxesHelper(2);
  spacecraftGroup.add(satAxes);

  // Call the callback with the spacecraft body and the main group
  if (onLoaded) onLoaded(spacecraftBody, spacecraftGroup);
}

// Toggle visibility of the spacecraft bounding box
export function toggleSpacecraftBoundingBoxVisibility(visible) {
  if (spacecraftBoundingBoxMesh) {
    spacecraftBoundingBoxMesh.visible = visible;
  }
}

// Get the spacecraft body
export function getSpacecraftBody() {
  return spacecraftBody;
}

// Get the spacecraft mesh (now returns the group)
export function getSpacecraftMesh() {
  return spacecraftGroup;
}

// Update the spacecraft group to match the physics body
export function updateSpacecraft() {
  if (spacecraftGroup && spacecraftBody) {
    spacecraftGroup.position.copy(spacecraftBody.position);
    spacecraftGroup.quaternion.copy(spacecraftBody.quaternion);
  }
}