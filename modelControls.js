// Model loading controls
const loadModelButton = document.getElementById('load-model');
const loadPropertiesButton = document.getElementById('load-properties');
const modelFileInput = document.getElementById('model-file');
const propertiesFileInput = document.getElementById('properties-file');
const rotXSlider = document.getElementById('rot-x');
const rotYSlider = document.getElementById('rot-y');
const rotZSlider = document.getElementById('rot-z');
const centroidCheckbox = document.getElementById('centroid-model');

// Store spacecraft properties
let spacecraftProperties = {
  mass: 10000,
  inertia: null // Will use default if not provided
};

// Add snapping behavior to sliders
[rotXSlider, rotYSlider, rotZSlider].forEach(slider => {
  slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    const snappedValue = Math.round(value / 90) * 90;
    e.target.value = snappedValue;
    document.getElementById(`${e.target.id}-value`).textContent = `${snappedValue}°`;
  });
});

loadModelButton.addEventListener('click', () => {
  modelFileInput.click();
});

loadPropertiesButton.addEventListener('click', () => {
  propertiesFileInput.click();
});

propertiesFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const properties = JSON.parse(e.target.result);
      spacecraftProperties.mass = properties.mass || 10000;
      spacecraftProperties.inertia = properties.inertia || null;
      document.getElementById('hull-status').textContent = 'Properties loaded successfully';
      console.log('Properties loaded:', spacecraftProperties);
    } catch (error) {
      console.error('Error parsing properties file:', error);
      document.getElementById('hull-status').textContent = 'Error loading properties file';
    }
  };
  reader.readAsText(file);
});

modelFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  // Get rotation values from sliders
  const rotation = {
    x: parseInt(rotXSlider.value, 10),
    y: parseInt(rotYSlider.value, 10),
    z: parseInt(rotZSlider.value, 10)
  };
  
  // Get centroid option
  const centroidModel = centroidCheckbox.checked;
  
  // Remove old spacecraft
  if (window.satMesh) window.scene.remove(window.satMesh);
  if (window.satBody) window.world.removeBody(window.satBody);
  
  // Load new spacecraft by passing the file object, rotation, and centroid option
  loadSpacecraft(file, window.scene, window.world, rotation, centroidModel, spacecraftProperties, (body, mesh) => {
    window.satBody = body;
    window.satMesh = mesh;
    window.camSys = new CameraSystem(window.renderer, window.satMesh);
    
    // Reinitialize thrusters
    initializeThrusters(
      THRUSTER_CONFIG,
      CANNON,
      window.satMesh,
      window.keyToThrusterIndices,
      window.createThrusterVisual
    ).then(newThrusters => {
      window.thrusters = newThrusters;
    });
  });
});

// Export the spacecraft properties so it can be accessed by other scripts
export { spacecraftProperties };