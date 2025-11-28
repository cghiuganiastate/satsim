// File: thrusterSetup.js

/**
 * Initializes all thrusters based on a configuration file.
 * It creates physics objects, visual representations, and automatically
 * maps them to keyboard controls for translation and rotation.
 *
 * @param {string} configUrl - The URL or path to thruster configuration JSON file.
 * @param {object} CANNON - The Cannon.js physics engine instance.
 * @param {object3D} satMesh - The Three.js (or other) mesh of the satellite to which thrusters will be added.
 * @param {object} keyToThrusterIndices - An object that will be populated with key-to-thruster mappings.
 * @param {function} createThrusterVisual - A function that creates visual representation of a single thruster.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of thruster objects.
 */
export default async function initializeThrusters(configUrl, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual) {
  try {
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const config = await response.json();
    
    return processThrusterConfig(config, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual);
  } catch (error) {
    console.error("Failed to initialize thrusters:", error);
    return []; // Return an empty array on failure
  }
}

/**
 * Initializes all thrusters based on a configuration object (for uploaded files).
 * It creates physics objects, visual representations, and automatically
 * maps them to keyboard controls for translation and rotation.
 *
 * @param {object} config - The thruster configuration object.
 * @param {object} CANNON - The Cannon.js physics engine instance.
 * @param {object3D} satMesh - The Three.js (or other) mesh of the satellite to which thrusters will be added.
 * @param {object} keyToThrusterIndices - An object that will be populated with key-to-thruster mappings.
 * @param {function} createThrusterVisual - A function that creates visual representation of a single thruster.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of thruster objects.
 */
export async function initializeThrustersWithConfig(config, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual) {
  try {
    return processThrusterConfig(config, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual);
  } catch (error) {
    console.error("Failed to initialize thrusters with config:", error);
    return []; // Return an empty array on failure
  }
}

/**
 * Common function to process thruster configuration and create thruster objects.
 * This is used by both initializeThrusters and initializeThrustersWithConfig.
 *
 * @param {object} config - The thruster configuration object.
 * @param {object} CANNON - The Cannon.js physics engine instance.
 * @param {object3D} satMesh - The Three.js (or other) mesh of the satellite to which thrusters will be added.
 * @param {object} keyToThrusterIndices - An object that will be populated with key-to-thruster mappings.
 * @param {function} createThrusterVisual - A function that creates visual representation of a single thruster.
 * @returns {Array<object>} An array of thruster objects.
 */
function processThrusterConfig(config, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual) {
  const thrusters = config.thrusters.map((t, i) => {
    const pos = new CANNON.Vec3(t.position[0], t.position[1], t.position[2]);
    const dir = new CANNON.Vec3(t.direction[0], t.direction[1], t.direction[2]).unit();
    const { group: visual, material } = createThrusterVisual(pos, dir);
    satMesh.add(visual);

    // --- DATA SANITIZATION ---
    // This is critical fix. We ensure thrust and isp are valid numbers.

    // Sanitize thrust value
    let thrust = t.thrust || 50; // Default to 50N if not specified
    if (typeof thrust !== 'number' || isNaN(thrust) || thrust < 0) {
      console.warn(`Invalid thrust value for thruster "${t.name || i}": ${t.thrust}. Defaulting to 50N.`);
      thrust = 50;
    }

    // Sanitize ISP value
    let isp = t.isp || 300; // Default to 300s if not specified
    if (typeof isp !== 'number' || isNaN(isp) || isp <= 0) {
      console.warn(`Invalid ISP value for thruster "${t.name || i}": ${t.isp}. Defaulting to 300s.`);
      isp = 300;
    }
    // --- END SANITIZATION ---

    // ---------- AUTO-MAPPING ----------
    // Translation: thruster points mostly along one axis
    const dot = (a, b) => a.dot(b);
    if (Math.abs(dot(dir, new CANNON.Vec3(0, 0, 1))) > 0.7) keyToThrusterIndices[dir.z > 0 ? 'w' : 's'].push(i);
    if (Math.abs(dot(dir, new CANNON.Vec3(1, 0, 0))) > 0.7) keyToThrusterIndices[dir.x > 0 ? 'a' : 'd'].push(i);
    if (Math.abs(dot(dir, new CANNON.Vec3(0, 1, 0))) > 0.7) keyToThrusterIndices[dir.y > 0 ? 'e' : 'q'].push(i);

    // Rotation: torque = r × F  (lever arm × direction)
    const lever = pos;
    const torque = lever.cross(dir);

    // Pitch (rotation around X axis)
    if (Math.abs(torque.x) > 0.1) {
      if (torque.x > 0) keyToThrusterIndices['k'].push(i); // pitch up
      else keyToThrusterIndices['i'].push(i); // pitch down
    }

    // Yaw (rotation around Y axis)
    if (Math.abs(torque.y) > 0.1) {
      if (torque.y > 0) keyToThrusterIndices['j'].push(i); // yaw left
      else keyToThrusterIndices['l'].push(i); // yaw right
    }

    // Roll (rotation around Z axis)
    if (Math.abs(torque.z) > 0.1) {
      if (torque.z > 0) keyToThrusterIndices['o'].push(i); // roll left
      else keyToThrusterIndices['u'].push(i); // roll right
    }
    // ----------------------------------

    // Return sanitized thruster object
    return { pos, dir, thrust, isp, visual, material, active: false, index: i };
  });

  return thrusters;
}