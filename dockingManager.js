// File: dockingManager.js
// Full docking system extracted from simulation.js: docking port, second
// (static) spacecraft, multi-zone docking logic, and HUD selection.
//
// Coupling notes:
//  - Reads window.uploadedFiles for optional model/position overrides.
//  - Publishes dockingPort/secondSpacecraft refs onto window.* for legacy code.
//  - Exposes secondSpacecraftBoundingBoxMesh so the ` + h hull toggle can match it.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Speed/angle limits for a "successful" dock. Kept here because only the
// docking logic consumes them.
const MAX_ANGULAR_SPEED = 1.0; // deg/s
const MAX_XZ_SPEED = 0.1;       // m/s
const MAX_Z_SPEED = 1.0;        // m/s

export class DockingManager {
  constructor({ scene, world }) {
    this.scene = scene;
    this.world = world;

    this.dockingZones = [];
    this.dockingBoxVisuals = [];
    this.dockingBoxesVisible = false;
    this.selectedDockingZoneIndex = 0;

    // Second spacecraft state
    this.secondSpacecraftBody = null;
    this.secondSpacecraftMesh = null;
    this.secondSpacecraftBoundingBoxMesh = null;
    this.secondSpacecraftLoaded = false;

    // Initial state used only by the (normally unreachable) no-zones fallback.
    this.initialPosition = null;
    this.initialOrientationThree = null;
    this.dockingBoxSize = 0.1;
    this.dockingAngleThreshold = 3;
  }

  // Capture the primary spacecraft's initial pose + docking tolerances. Used by
  // the fallback path in isInDockingZone() when no zones are registered.
  setInitialState({ position, orientationThree, dockingBoxSize, dockingAngleThreshold } = {}) {
    if (position) this.initialPosition = position;
    if (orientationThree) this.initialOrientationThree = orientationThree;
    if (dockingBoxSize !== undefined) this.dockingBoxSize = dockingBoxSize;
    if (dockingAngleThreshold !== undefined) this.dockingAngleThreshold = dockingAngleThreshold;
  }

  getZoneCount() {
    return this.dockingZones.length;
  }

  getSelectedZoneLabel() {
    if (this.dockingZones.length === 0) return null;
    const zone = this.dockingZones[this.selectedDockingZoneIndex % this.dockingZones.length];
    return zone.name === 'primary' ? 'Station' : 'Spacecraft 2';
  }

  // ===========================================================================
  // PRIMARY DOCKING PORT
  // ===========================================================================

  loadDockingPort() {
    // Check if user uploaded a docking port model
    if (window.uploadedFiles && window.uploadedFiles.dockingPort) {
      // Use uploaded file
      const blob = new Blob([window.uploadedFiles.dockingPort], { type: 'model/stl' });
      const file = new File([blob], 'dockingport.stl', { type: 'model/stl' });
      const reader = new FileReader();
      reader.onload = (e) => {
        const geometry = new STLLoader().parse(e.target.result);
        this.createDockingPort(geometry);
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Create default docking port if no file is provided
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      this.createDockingPort(geometry);
    }
  }

  createDockingPort(geometry) {
    // Create the visual mesh (the solid model you see)
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      metalness: 0.7,
      roughness: 0.3
    });
    const dockingPortMesh = new THREE.Mesh(geometry, material);
    dockingPortMesh.position.set(0, -2, 5.5);
    dockingPortMesh.castShadow = true;
    dockingPortMesh.receiveShadow = true;
    this.scene.add(dockingPortMesh);

    // --- Create a simple bounding box for collision ---

    // 1. Calculate the bounding box of the loaded geometry
    geometry.computeBoundingBox();
    const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);

    // 2. Get the size of the box
    const size = new THREE.Vector3();
    box.getSize(size);

    // 3. Get the center of the geometry to calculate the offset
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 4. Calculate the offset position: desired world position + geometry center offset
    const offsetX = 0 + center.x;  // 0 is the desired world X position
    const offsetY = -2 + center.y; // -2 is the desired world Y position
    const offsetZ = 5.5 + center.z; // 5.5 is the desired world Z position

    // 5. Create the CANNON.Box shape using the box's half-extents
    const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const boxShape = new CANNON.Box(halfExtents);

    // 6. Create the physics body at the offset position
    const dockingPortBody = new CANNON.Body({
      mass: 0, // static
      position: new CANNON.Vec3(offsetX, offsetY, offsetZ)
    });
    dockingPortBody.addShape(boxShape);
    this.world.addBody(dockingPortBody);

    // 7. Create the visual representation of the collision box (the red wireframe)
    const collisionGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const collisionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    const dockingPortCollisionMesh = new THREE.Mesh(collisionGeometry, collisionMaterial);
    dockingPortCollisionMesh.position.set(offsetX, offsetY, offsetZ);
    dockingPortCollisionMesh.visible = false; // Initially hidden
    dockingPortCollisionMesh.castShadow = false;
    dockingPortCollisionMesh.receiveShadow = false;
    this.scene.add(dockingPortCollisionMesh);

    // Store references globally
    window.dockingPortMesh = dockingPortMesh; // The green model
    window.dockingPortBody = dockingPortBody; // The physics body
    window.dockingPortCollisionMesh = dockingPortCollisionMesh; // The red wireframe box
  }

  // ===========================================================================
  // SECOND SPACECRAFT (STATIC TARGET)
  // ===========================================================================
  // The second spacecraft uses the SAME position/orientation file format as the
  // primary spacecraft. The docking port is part of its model STL, so SC2's
  // docking zone is simply its position + orientation. There is no separate
  // second docking port upload.

  loadSecondSpacecraft() {
    // Default placement if no file uploaded
    let pos = new CANNON.Vec3(10, 0, -10);
    let quat = new CANNON.Quaternion(0, 0, 0, 1);
    let quatThree = new THREE.Quaternion(0, 0, 0, 1);
    let dockingBoxSize = 0.1;
    let dockingAngleThreshold = 3;

    // The exported position file format (identical to SC1) is reused here.
    if (window.uploadedFiles && window.uploadedFiles.secondPosition) {
      const posData = window.uploadedFiles.secondPosition;
      pos = new CANNON.Vec3(posData.position.x, posData.position.y, posData.position.z);
      quat = new CANNON.Quaternion(posData.orientation.x, posData.orientation.y, posData.orientation.z, posData.orientation.w);
      quatThree = new THREE.Quaternion(posData.orientation.x, posData.orientation.y, posData.orientation.z, posData.orientation.w);
      if (posData.dockingBoxSize !== undefined) dockingBoxSize = posData.dockingBoxSize;
      if (posData.dockingAngleThreshold !== undefined) dockingAngleThreshold = posData.dockingAngleThreshold;
      console.log("Second spacecraft placement loaded:", posData);
    } else {
      console.log("No second spacecraft position file — using default placement");
    }

    const stlLoader = new STLLoader();

    const buildBody = (geometry) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x9966ff, metalness: 0.6, roughness: 0.4 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(pos);
      mesh.quaternion.copy(quatThree);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.secondSpacecraftMesh = mesh;

      // Compute bounding box for a simple static collision box
      geometry.computeBoundingBox();
      const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
      const shape = new CANNON.Box(halfExtents);

      const body = new CANNON.Body({
        mass: 0, // STATIC
        position: new CANNON.Vec3(pos.x + center.x, pos.y + center.y, pos.z + center.z)
      });
      body.quaternion.copy(quat);
      body.addShape(shape);
      this.world.addBody(body);
      this.secondSpacecraftBody = body;

      // Create visual bounding box wireframe (same style as primary spacecraft)
      const bboxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const bboxMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.2,
        wireframe: true
      });
      this.secondSpacecraftBoundingBoxMesh = new THREE.Mesh(bboxGeometry, bboxMaterial);
      this.secondSpacecraftBoundingBoxMesh.visible = false;
      // Position the bounding box at the same offset as the mesh
      this.secondSpacecraftBoundingBoxMesh.position.copy(pos).add(center);
      this.scene.add(this.secondSpacecraftBoundingBoxMesh);

      // Helpful axes
      const axes = new THREE.AxesHelper(2);
      axes.position.copy(pos);
      axes.quaternion.copy(quatThree);
      this.scene.add(axes);

      this.secondSpacecraftLoaded = true;
      window.secondSpacecraftBody = this.secondSpacecraftBody;
      window.secondSpacecraftMesh = this.secondSpacecraftMesh;

      // The docking port is part of SC2's model. By default the docking zone
      // is 2 meters below SC2's position (so SC1 isn't trying to dock inside
      // SC2's collision box). A separate "docking location" file (same format
      // as the position files) can override where SC1 must be to dock to SC2.
      let zonePos = new CANNON.Vec3(pos.x, pos.y - 2, pos.z);
      let zoneQuatThree = quatThree;
      let zoneBoxSize = dockingBoxSize;
      let zoneAngleThreshold = dockingAngleThreshold;

      if (window.uploadedFiles && window.uploadedFiles.secondDockingLocation) {
        const dockData = window.uploadedFiles.secondDockingLocation;
        zonePos = new CANNON.Vec3(dockData.position.x, dockData.position.y, dockData.position.z);
        zoneQuatThree = new THREE.Quaternion(
          dockData.orientation.x, dockData.orientation.y, dockData.orientation.z, dockData.orientation.w
        );
        if (dockData.dockingBoxSize !== undefined) zoneBoxSize = dockData.dockingBoxSize;
        if (dockData.dockingAngleThreshold !== undefined) zoneAngleThreshold = dockData.dockingAngleThreshold;
        console.log("Second spacecraft docking location loaded:", dockData);
      } else {
        console.log("No second spacecraft docking location file — defaulting to 2 meters below SC2 position");
      }

      this.registerDockingZone({
        position: zonePos,
        orientation: zoneQuatThree,
        dockingBoxSize: zoneBoxSize,
        dockingAngleThreshold: zoneAngleThreshold,
        name: 'secondSpacecraft'
      });

      console.log("Second spacecraft loaded at", pos);
    };

    if (window.uploadedFiles && window.uploadedFiles.secondSpacecraftModel) {
      try {
        const geometry = stlLoader.parse(window.uploadedFiles.secondSpacecraftModel);
        buildBody(geometry);
      } catch (err) {
        console.error("Failed to parse second spacecraft STL, using fallback box:", err);
        buildBody(new THREE.BoxGeometry(1, 1, 1));
      }
    } else {
      // No model uploaded — use a simple fallback box so the feature still works
      console.log("No second spacecraft model uploaded — using fallback box");
      buildBody(new THREE.BoxGeometry(1, 1, 1));
    }
  }

  // ===========================================================================
  // DOCKING ZONE REGISTRY & VISUALS
  // ===========================================================================

  // Register a docking zone (the spacecraft can dock at any registered zone)
  registerDockingZone(zone) {
    this.dockingZones.push(zone);
    console.log(`Registered docking zone "${zone.name}" at`, zone.position);
  }

  // Lazily build a wireframe box for each registered docking zone.
  // The box represents the acceptance volume the spacecraft must occupy to dock
  // (dockingBoxSize is a half-extent, so the full box is dockingBoxSize * 2).
  ensureDockingBoxVisuals() {
    if (this.dockingBoxVisuals.length > 0 || this.dockingZones.length === 0) return;
    this.dockingZones.forEach(zone => {
      const fullSize = (zone.dockingBoxSize || 0.1) * 2;
      const geo = new THREE.BoxGeometry(fullSize, fullSize, fullSize);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(zone.position.x, zone.position.y, zone.position.z);
      if (zone.orientation) mesh.quaternion.copy(zone.orientation);
      mesh.visible = false;
      this.scene.add(mesh);
      this.dockingBoxVisuals.push(mesh);
    });
  }

  // Toggle visibility of the docking zone acceptance boxes (` + b)
  toggleDockingBoxes() {
    this.ensureDockingBoxVisuals();
    this.dockingBoxesVisible = !this.dockingBoxesVisible;
    for (const mesh of this.dockingBoxVisuals) {
      mesh.visible = this.dockingBoxesVisible;
    }
    console.log(`Docking bounding boxes ${this.dockingBoxesVisible ? 'shown' : 'hidden'} (${this.dockingBoxVisuals.length} zone(s))`);
  }

  // Cycle which docking zone the HUD shows info for (` + z). Returns the new
  // selection so the caller can update the HUD label.
  cycleSelectedZone() {
    if (this.dockingZones.length === 0) return null;
    this.selectedDockingZoneIndex = (this.selectedDockingZoneIndex + 1) % this.dockingZones.length;
    const label = this.getSelectedZoneLabel();
    console.log(`HUD docking info now showing: ${label} (zone ${this.selectedDockingZoneIndex + 1}/${this.dockingZones.length})`);
    return { label, index: this.selectedDockingZoneIndex, total: this.dockingZones.length };
  }

  // ===========================================================================
  // DOCKING STATE QUERIES
  // ===========================================================================

  // Multi-zone docking logic.
  // Checks every registered docking zone and returns the closest qualifying
  // status. Keeps the same return-object shape as the original for HUD
  // compatibility, plus a `zoneName` identifying which zone matched.
  isInDockingZone(satBody) {
    if (!satBody) return { inBox: false };

    const currentOrientationThree = new THREE.Quaternion(
      satBody.quaternion.x, satBody.quaternion.y, satBody.quaternion.z, satBody.quaternion.w
    );

    const speed = satBody.velocity.length();
    const xzSpeed = Math.sqrt(satBody.velocity.x ** 2 + satBody.velocity.z ** 2);
    const zSpeed = satBody.velocity.z;
    const withinSpeedLimits = xzSpeed <= MAX_XZ_SPEED && zSpeed <= MAX_Z_SPEED;

    const angularSpeed = satBody.angularVelocity.length() * (180 / Math.PI);
    const withinAngularSpeedLimit = angularSpeed <= MAX_ANGULAR_SPEED;

    // If no zones registered (shouldn't happen), fall back to primary defaults
    if (this.dockingZones.length === 0) {
      const positionDiff = {
        x: satBody.position.x - (this.initialPosition?.x || 0),
        y: satBody.position.y - (this.initialPosition?.y || 0),
        z: satBody.position.z - (this.initialPosition?.z || 0)
      };
      const distance = Math.sqrt(positionDiff.x ** 2 + positionDiff.y ** 2 + positionDiff.z ** 2);
      const inBox = Math.abs(positionDiff.x) <= this.dockingBoxSize &&
                    Math.abs(positionDiff.y) <= this.dockingBoxSize &&
                    Math.abs(positionDiff.z) <= this.dockingBoxSize;
      const angleDiff = this.initialOrientationThree
        ? currentOrientationThree.angleTo(this.initialOrientationThree) * (180 / Math.PI)
        : 0;
      return {
        inBox,
        inAngle: angleDiff <= this.dockingAngleThreshold,
        withinSpeedLimits,
        withinAngularSpeedLimit,
        angleDiff,
        distance,
        speed,
        angularSpeed,
        zoneName: 'primary'
      };
    }

    // Evaluate every zone and pick the closest one
    let best = null;
    for (const zone of this.dockingZones) {
      const dx = satBody.position.x - zone.position.x;
      const dy = satBody.position.y - zone.position.y;
      const dz = satBody.position.z - zone.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const inBox = Math.abs(dx) <= zone.dockingBoxSize &&
                    Math.abs(dy) <= zone.dockingBoxSize &&
                    Math.abs(dz) <= zone.dockingBoxSize;

      const angleDiff = currentOrientationThree.angleTo(zone.orientation) * (180 / Math.PI);
      const inAngle = angleDiff <= zone.dockingAngleThreshold;

      // A zone is a candidate if we're within its box OR it's the closest seen
      const candidate = {
        inBox,
        inAngle,
        withinSpeedLimits,
        withinAngularSpeedLimit,
        angleDiff,
        distance,
        speed,
        angularSpeed,
        zoneName: zone.name
      };

      if (best === null || distance < best.distance) {
        best = candidate;
      }
    }

    return best;
  }

  // Compute docking status relative to a SPECIFIC zone (for HUD display).
  // Unlike isInDockingZone() which returns the closest, this lets the user
  // select which target they want to monitor.
  getSelectedDockingZoneStatus(satBody) {
    if (!satBody || this.dockingZones.length === 0) return null;
    const zone = this.dockingZones[this.selectedDockingZoneIndex % this.dockingZones.length];

    const currentOrientationThree = new THREE.Quaternion(
      satBody.quaternion.x, satBody.quaternion.y, satBody.quaternion.z, satBody.quaternion.w
    );

    const dx = satBody.position.x - zone.position.x;
    const dy = satBody.position.y - zone.position.y;
    const dz = satBody.position.z - zone.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const inBox = Math.abs(dx) <= zone.dockingBoxSize &&
                  Math.abs(dy) <= zone.dockingBoxSize &&
                  Math.abs(dz) <= zone.dockingBoxSize;
    const angleDiff = currentOrientationThree.angleTo(zone.orientation) * (180 / Math.PI);

    const speed = satBody.velocity.length();
    const xzSpeed = Math.sqrt(satBody.velocity.x ** 2 + satBody.velocity.z ** 2);
    const zSpeed = satBody.velocity.z;
    const withinSpeedLimits = xzSpeed <= MAX_XZ_SPEED && zSpeed <= MAX_Z_SPEED;
    const angularSpeed = satBody.angularVelocity.length() * (180 / Math.PI);
    const withinAngularSpeedLimit = angularSpeed <= MAX_ANGULAR_SPEED;

    const label = zone.name === 'primary' ? 'Station' : 'Spacecraft 2';

    return {
      inBox,
      inAngle: angleDiff <= zone.dockingAngleThreshold,
      withinSpeedLimits,
      withinAngularSpeedLimit,
      angleDiff,
      distance,
      speed,
      angularSpeed,
      zoneName: zone.name,
      label
    };
  }
}