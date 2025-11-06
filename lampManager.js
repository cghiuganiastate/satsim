import * as THREE from 'three';

export class LampManager {
  constructor(scene, spacecraftMesh) {
    this.scene = scene;
    this.spacecraftMesh = spacecraftMesh;
    this.lamps = [];
    this.lights = [];
    this.lampHelpers = [];
    this.lampsVisible = true;
    this.helpersVisible = false;

    // Create temporary objects for calculations to avoid garbage collection
    this._tempMatrix = new THREE.Matrix4();
    this._tempPos = new THREE.Vector3();
    this._tempDir = new THREE.Vector3();
    this._lampLocalMatrix = new THREE.Matrix4();
    this._combinedMatrix = new THREE.Matrix4();
  }

  toggleHelpers() {
    this.helpersVisible = !this.helpersVisible;
    this.lampHelpers.forEach(helper => {
      helper.visible = this.helpersVisible;
    });

    if (this.helpersVisible) {
      console.log("=== LAMP DEBUGGING INFO (MANUAL UPDATE) ===");
      console.log("Spacecraft position:", this.spacecraftMesh.position);
      console.log("Spacecraft quaternion:", this.spacecraftMesh.quaternion);
      this.lights.forEach((light, index) => {
        console.log(`--- Lamp ${index} ---`);
        console.log("Light world position:", light.position);
        console.log("Light target world position:", light.target.position);
      });
      console.log("=== END DEBUGGING INFO ===");
    }
    return this.helpersVisible;
  }

  async loadLamps(jsonPath) {
    try {
      const response = await fetch(jsonPath);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const lampsConfig = await response.json();

      if (!lampsConfig || !lampsConfig.lamps || !Array.isArray(lampsConfig.lamps)) {
        throw new Error('Invalid lamps configuration format');
      }

      for (const lampConfig of lampsConfig.lamps) {
        this.createLamp(lampConfig);
      }
      console.log(`Successfully loaded ${lampsConfig.lamps.length} lamps`);
      return this.lights;
    } catch (error) {
      console.error('Failed to load lamps:', error);
      throw error;
    }
  }

  createLamp(config) {
    const color = new THREE.Color(config.color || '#ffffff');
    const light = new THREE.SpotLight(
      color,
      config.intensity,
      config.distance || 20,
      config.angle,
      config.penumbra || 0.2
    );

    if (config.castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = config.distance || 20;
    }

    // Add light and its target directly to the scene, NOT to the spacecraft
    this.scene.add(light);
    this.scene.add(light.target);

    // Add helper for visualization
    const helper = new THREE.SpotLightHelper(light);
    helper.visible = this.helpersVisible;
    this.scene.add(helper);

    // Store references
    this.lamps.push(config);
    this.lights.push(light);
    this.lampHelpers.push(helper);

    return light;
  }

  toggleLamps() {
    this.lampsVisible = !this.lampsVisible;
    this.lights.forEach(light => light.visible = this.lampsVisible);
    return this.lampsVisible;
  }

  // This is the critical new method
  updateLamps() {
    // Ensure the spacecraft's world matrix is up-to-date
    this.spacecraftMesh.updateMatrixWorld(true);

    // Copy the spacecraft's world matrix once, as it's the same for all lamps
    this._tempMatrix.copy(this.spacecraftMesh.matrixWorld);

    this.lamps.forEach((config, index) => {
      const light = this.lights[index];
      const helper = this.lampHelpers[index];

      // --- 1. Calculate Light's World Position ---
      // Start with the lamp's local position from the config
      this._tempPos.set(config.position.x, config.position.y, config.position.z);
      // Apply the spacecraft's world transform to get the final world position
      this._tempPos.applyMatrix4(this._tempMatrix);
      // Set the light's position in world space
      light.position.copy(this._tempPos);

      // --- 2. Calculate Light's World Direction ---
      // Create a matrix for the lamp's local rotation
      this._lampLocalMatrix.compose(
        new THREE.Vector3(), // No local position for the direction calculation
        new THREE.Quaternion().setFromEuler(new THREE.Euler(config.rotation.x, config.rotation.y, config.rotation.z, 'XYZ')),
        new THREE.Vector3(1, 1, 1) // No scale
      );
      // Combine the spacecraft's transform with the lamp's local rotation
      this._combinedMatrix.multiplyMatrices(this._tempMatrix, this._lampLocalMatrix);

      // A spotlight's default direction is its local -Z axis
      this._tempDir.set(0, 0, -1);
      // Transform this direction by the combined matrix to get the final world direction
      this._tempDir.transformDirection(this._combinedMatrix);

      // --- 3. Update Target's World Position ---
      const targetDistance = config.distance || 20;
      // Position the target at the light's position, plus the direction vector scaled by distance
      light.target.position.copy(light.position).add(this._tempDir.multiplyScalar(targetDistance));

      // --- 4. Update the Helper ---
      helper.update();
    });
  }

  setLampIntensity(lampId, intensity) {
    const lampIndex = this.lamps.findIndex(lamp => lamp.id === lampId);
    if (lampIndex !== -1 && this.lights[lampIndex]) {
      this.lights[lampIndex].intensity = intensity;
      return true;
    }
    return false;
  }

  getLamps() {
    return this.lights;
  }

  removeAllLamps() {
    this.lights.forEach(light => {
      this.scene.remove(light);
      this.scene.remove(light.target);
    });
    this.lampHelpers.forEach(helper => this.scene.remove(helper));

    this.lamps = [];
    this.lights = [];
    this.lampHelpers = [];
  }
}