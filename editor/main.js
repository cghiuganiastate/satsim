//main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ModelTab } from './model-tab.js';
import { ThrustersTab } from './thrusters-tab.js';
import { CamerasTab } from './cameras-tab.js';
import { AttitudeTab } from './attitude-tab.js';
import { LightsTab } from './lights-tab.js';

// Global variables
let scene, camera, renderer, controls;
let spacecraftModel = null;
let spacecraftData = {
    "cameras": {
        "cameras": []
    },
    "model": {
        "position": { x: 0, y: 0, z: 0 },
        "quaternion": { x: 0, y: 0, z: 0, w: 1 },
        "features": []
    },
    "cmg": {
        "cmgs": []
    },
    "spacecraftProperties": {
        "dryMass": 5,
        "fuelMass": 5,
        "maxFuelMass": 5,
        "inertia": {
            "x": 3,
            "y": 3,
            "z": 3
        },
        "name": "Custom Spacecraft",
        "description": "A custom spacecraft with specific properties"
    },
    "lamps": {
        "lamps": []
    },
    "reactionwheels": {
        "wheels": []
    },
    "thrusters": {
        "thrusters": []
    }
};
// Tab instances
let modelTab, thrustersTab, camerasTab, attitudeTab, lightsTab;

// Initialize the application
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    
    // Get container dimensions for proper aspect ratio
    const container = document.getElementById('scene-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Create camera with proper FOV and aspect ratio
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);
    
    // Add grid helper for reference at y=-2
    const gridHelper = new THREE.GridHelper(10, 10);
    gridHelper.position.y = -2; // Move grid down to y=-2
    scene.add(gridHelper);
    
    // Add axes helper for reference
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    
    // Initialize tabs
    modelTab = new ModelTab(scene, spacecraftModel, spacecraftData);
    thrustersTab = new ThrustersTab(scene, spacecraftData);
    camerasTab = new CamerasTab(scene, spacecraftData);
    attitudeTab = new AttitudeTab(scene, spacecraftData);
    lightsTab = new LightsTab(scene, spacecraftData);
    
    // Setup event listeners
    setupEventListeners();
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabName = tab.getAttribute('data-tab');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // Toggle right panel
    const togglePanelBtn = document.getElementById('toggle-panel');
    const rightPanel = document.getElementById('right-panel');
    
    togglePanelBtn.addEventListener('click', () => {
        rightPanel.classList.toggle('visible');
        togglePanelBtn.classList.toggle('panel-hidden');
    });
    
    // Import model button
    document.getElementById('import-model').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gltf,.glb,.stl';
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const fileExtension = file.name.split('.').pop().toLowerCase();
                    
                    if (fileExtension === 'stl') {
                        // Load STL file
                        const loader = new STLLoader();
                        const geometry = loader.parse(e.target.result);
                        
                        // Create material for the STL mesh
                        const material = new THREE.MeshPhongMaterial({ 
                            color: 0x888888,
                            specular: 0x111111,
                            shininess: 200
                        });
                        
                        // Remove existing model if any
                        if (spacecraftModel) {
                            scene.remove(spacecraftModel);
                        }
                        
                        // Create mesh and add to scene (no centering)
                        spacecraftModel = new THREE.Mesh(geometry, material);
                        scene.add(spacecraftModel);
                        
                        // Update model tab with new model
                        modelTab.setModel(spacecraftModel);
                        //lightsTab.setSpacecraftMesh(spacecraftModel);
                        
                        // Show notification
                        showNotification('STL model imported successfully!');
                    } else {
                        // Load GLTF/GLB file
                        const loader = new GLTFLoader();
                        loader.parse(e.target.result, '', (gltf) => {
                            // Remove existing model if any
                            if (spacecraftModel) {
                                scene.remove(spacecraftModel);
                            }
                            
                            // Add new model (no centering)
                            spacecraftModel = gltf.scene;
                            scene.add(spacecraftModel);
                            
                            // Update model tab with new model
                            modelTab.setModel(spacecraftModel);
                            
                            // Show notification
                            showNotification('GLTF/GLB model imported successfully!');
                        });
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    });
    
    // Import configuration button
    document.getElementById('import-config').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        
                        // Update spacecraft data
                        spacecraftData = importedData;
                        
                        // Update UI with spacecraft properties
                        document.getElementById('spacecraft-name').value = spacecraftData.spacecraftProperties.name;
                        document.getElementById('spacecraft-description').value = spacecraftData.spacecraftProperties.description;
                        document.getElementById('dry-mass').value = spacecraftData.spacecraftProperties.dryMass;
                        document.getElementById('fuel-mass').value = spacecraftData.spacecraftProperties.fuelMass;
                        document.getElementById('max-fuel-mass').value = spacecraftData.spacecraftProperties.maxFuelMass;
                        document.getElementById('inertia-x').value = spacecraftData.spacecraftProperties.inertia.x;
                        document.getElementById('inertia-y').value = spacecraftData.spacecraftProperties.inertia.y;
                        document.getElementById('inertia-z').value = spacecraftData.spacecraftProperties.inertia.z;
                        
                        // Update tabs with imported data
                        modelTab.loadFromData(spacecraftData);
                        thrustersTab.loadFromData(spacecraftData);
                        camerasTab.loadFromData(spacecraftData);
                        attitudeTab.loadFromData(spacecraftData);
                        lightsTab.loadFromData(spacecraftData);
                        
                        // Show notification
                        showNotification('Configuration imported successfully!');
                    } catch (error) {
                        showNotification('Error importing configuration: ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    });
    
    // Export configuration button (renamed from export-model)
    document.getElementById('export-config').addEventListener('click', () => {
        // Update spacecraft properties from form
        spacecraftData.spacecraftProperties.name = document.getElementById('spacecraft-name').value;
        spacecraftData.spacecraftProperties.description = document.getElementById('spacecraft-description').value;
        spacecraftData.spacecraftProperties.dryMass = parseFloat(document.getElementById('dry-mass').value);
        spacecraftData.spacecraftProperties.fuelMass = parseFloat(document.getElementById('fuel-mass').value);
        spacecraftData.spacecraftProperties.maxFuelMass = parseFloat(document.getElementById('max-fuel-mass').value);
        spacecraftData.spacecraftProperties.inertia.x = parseFloat(document.getElementById('inertia-x').value);
        spacecraftData.spacecraftProperties.inertia.y = parseFloat(document.getElementById('inertia-y').value);
        spacecraftData.spacecraftProperties.inertia.z = parseFloat(document.getElementById('inertia-z').value);
        
        //modelTab.applyTransformations();
        // Export as JSON
        const dataStr = JSON.stringify(spacecraftData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = 'spacecraft-config.json';
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showNotification('Configuration exported successfully!');
    });
    document.getElementById('add-thruster').addEventListener('click', () => {
        thrustersTab.addFeature();
    });

    document.getElementById('add-camera').addEventListener('click', () => {
        camerasTab.addFeature();
    });

    document.getElementById('add-cmg').addEventListener('click', () => {
        attitudeTab.addCMG();
    });

    document.getElementById('add-reaction-wheel').addEventListener('click', () => {
        attitudeTab.addReactionWheel();
    });

    document.getElementById('add-light').addEventListener('click', () => {
        lightsTab.addFeature();
    });
}

// Show notification
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('scene-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // FIX: No longer pass spacecraftModel to updateLights
    if (lightsTab) {
        lightsTab.updateLights();
    }
    
    renderer.render(scene, camera);
}


// Start the application
init();