// hullManager.js

// Import necessary libraries directly into this module
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Hull-related variables
let hulls = [];
let hullMeshes = [];
let hullBodies = [];
let showHulls = false; // Hulls are hidden by default

// Load convex hulls from JSON file
export function loadConvexHulls(CONVEX_HULLS_PATH, scene, world) {
  fetch(CONVEX_HULLS_PATH)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load convex hulls: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (!data.hulls || data.hulls.length === 0) {
        console.warn('No hulls found in the convex hulls file');
        return;
      }
      
      console.log(`Loading ${data.hulls.length} convex hulls`);
      
      // Clear existing hulls
      clearHulls(scene, world);
      
      // Create physics bodies and visual representations for each hull
      data.hulls.forEach((hullData, index) => {
        if (hullData.type === 'box') {
          createBoxHull(hullData, index, scene, world);
        } else if (hullData.type === 'convex') {
          createConvexHull(hullData, index, scene, world);
        }
      });
      
      // Update hull info display
      document.getElementById('hull-status').textContent = 'Hulls Loaded';
      document.getElementById('hull-count').textContent = `Hull Count: ${hullBodies.length}`;
    })
    .catch(error => {
      console.error('Error loading convex hulls:', error);
      document.getElementById('hull-status').textContent = 'Error Loading Hulls';
    });
}

function clearHulls(scene, world) {
  // Remove visual representations
  hullMeshes.forEach(mesh => {
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  
  // Remove physics bodies
  hullBodies.forEach(body => {
    world.removeBody(body);
  });
  
  // Clear arrays
  hullMeshes = [];
  hullBodies = [];
  hulls = [];
}

function createBoxHull(hullData, index, scene, world) {
  // Create physics body
  const shape = new CANNON.Box(new CANNON.Vec3(
    hullData.size.x/2, 
    hullData.size.y/2, 
    hullData.size.z/2
  ));
  
  const body = new CANNON.Body({ mass: 0 }); // Static body
  body.addShape(shape);
  body.position.set(
    hullData.position.x,
    hullData.position.y,
    hullData.position.z
  );
  world.addBody(body);
  hullBodies.push(body);
  
  // Create visual representation
  const geometry = new THREE.BoxGeometry(
    hullData.size.x,
    hullData.size.y,
    hullData.size.z
  );
  
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.3,
    wireframe: true
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    hullData.position.x,
    hullData.position.y,
    hullData.position.z
  );
  mesh.visible = showHulls;
  scene.add(mesh);
  hullMeshes.push(mesh);
  
  // Store hull data
  hulls.push({
    type: 'box',
    body: body,
    mesh: mesh,
    data: hullData
  });
}

function createConvexHull(hullData, index, scene, world) {
  // Convert vertices to CANNON.Vec3
  const vertices = hullData.vertices.map(v => 
    new CANNON.Vec3(v.x, v.y, v.z)
  );
  
  // Create physics body
  const shape = new CANNON.ConvexPolyhedron({
    vertices: vertices,
    faces: hullData.faces
  });
  
  const body = new CANNON.Body({ mass: 0 }); // Static body
  body.addShape(shape);
  world.addBody(body);
  hullBodies.push(body);
  
  // Create visual representation
  const geometry = new THREE.BufferGeometry();
  
  // Add vertices to geometry
  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach((v, i) => {
    positions[i*3] = v.x;
    positions[i*3+1] = v.y;
    positions[i*3+2] = v.z;
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  // Add faces to geometry
  const indices = [];
  hullData.faces.forEach(face => {
    indices.push(...face);
  });
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.3,
    wireframe: true
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = showHulls;
  scene.add(mesh);
  hullMeshes.push(mesh);
  
  // Store hull data
  hulls.push({
    type: 'convex',
    body: body,
    mesh: mesh,
    data: hullData
  });
}

export function toggleHullVisibility() {
  showHulls = !showHulls;
  hullMeshes.forEach(mesh => {
    mesh.visible = showHulls;
  });
  document.getElementById('hull-status').textContent = showHulls ? 'Hulls Visible' : 'Hulls Hidden';
} 