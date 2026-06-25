// File: configLoader.js
// Configuration and spacecraft model loading helpers, extracted from simulation.js.
// Reads from window.uploadedFiles (when present) or falls back to default files.

const DEFAULT_MODEL_PATH = 'navion.stl';

// Helper function to normalize configuration to unified format
export function normalizeConfiguration(config) {
  const normalized = {
    spacecraftProperties: config.spacecraftProperties || { dryMass: 5, fuelMass: 5, maxFuelMass: 5, inertia: { x: 3, y: 3, z: 3 } },
    cameras: Array.isArray(config.cameras) ? config.cameras : (config.cameras?.cameras || []),
    cmg: { cmgs: Array.isArray(config.cmg) ? config.cmg : (config.cmg?.cmgs || []) },
    lamps: { lamps: Array.isArray(config.lamps) ? config.lamps : (config.lamps?.lamps || []) },
    reactionwheels: { wheels: Array.isArray(config.reactionwheels) ? config.reactionwheels : (config.reactionwheels?.wheels || []) },
    thrusters: { thrusters: Array.isArray(config.thrusters) ? config.thrusters : (config.thrusters?.thrusters || []) }
  };

  // Handle CMG format: if config.cmg has a 'cmg' property (single CMG object), convert to cmgs array
  if (config.cmg && config.cmg.cmg) {
    normalized.cmg = { cmgs: [config.cmg.cmg] };
  }

  // Preserve model data if present (for editor compatibility)
  if (config.model) {
    normalized.model = config.model;
  }

  return normalized;
}

// Helper function to get configuration from uploaded files or defaults
export async function getConfiguration() {
  if (window.uploadedFiles && window.uploadedFiles.config) {
    console.log('Using uploaded configuration');
    return normalizeConfiguration(window.uploadedFiles.config);
  }

  // Load default configuration if no uploaded config
  try {
    const response = await fetch('config.json');
    if (!response.ok) {
      throw new Error(`Failed to load default config: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('Using default configuration');
    return normalizeConfiguration(data);
  } catch (error) {
    console.error('Error loading default configuration:', error);
    // Return minimal default configuration
    return {
      cameras: [],
      cmg: { cmgs: [] },
      spacecraftProperties: { dryMass: 5, fuelMass: 5, maxFuelMass: 5, inertia: { x: 3, y: 3, z: 3 } },
      lamps: { lamps: [] },
      reactionwheels: { wheels: [] },
      thrusters: { thrusters: [] }
    };
  }
}

// Helper function to get spacecraft model.
// Returns { file, isDefault } where isDefault flags whether centroiding applies.
export async function getSpacecraftModel() {
  if (window.uploadedFiles && window.uploadedFiles.spacecraftModel) {
    console.log('Using uploaded spacecraft model - centroiding disabled');
    // Create a File object from the uploaded model data
    const blob = new Blob([window.uploadedFiles.spacecraftModel], { type: 'model/stl' });
    return {
      file: new File([blob], 'custom.stl', { type: 'model/stl' }),
      isDefault: false
    };
  }

  // Load default model
  try {
    const response = await fetch(DEFAULT_MODEL_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch default model: ${response.statusText}`);
    }
    const blob = await response.blob();
    console.log('Using default spacecraft model - centroiding enabled');
    return {
      file: new File([blob], DEFAULT_MODEL_PATH, { type: 'model/stl' }),
      isDefault: true
    };
  } catch (error) {
    console.error('Error loading default model:', error);
    throw error;
  }
}