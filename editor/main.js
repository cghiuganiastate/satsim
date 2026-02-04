//main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
// NEW: Import STLExporter
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ModelTab } from './model-tab.js';
import { ThrustersTab } from './thrusters-tab.js';
import { CamerasTab } from './cameras-tab.js';
import { AttitudeTab } from './attitude-tab.js';
import { LightsTab } from './lights-tab.js';

// Global variables
let scene, camera, renderer, controls;
let spacecraftModel = null;
let cgVisualizer; // NEW: Global variable for the CG visualizer sphere
let axisLabels = []; // Store axis labels for cleanup

// MODIFIED: Updated spacecraftData to include the new centerOfMass structure
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
        "maxFuelMass":5,
        "inertia": {
            "x": 3,
            "y": 3,
            "z": 3
        },
        "name": "Custom Spacecraft",
        "description": "A custom spacecraft with specific properties",
        "centerOfMass": { // NEW: Added centerOfMass with the requested structure
            "x": 0,
            "y": 0,
            "z": 0
        }
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

// DEBUG: Add proxy to track modifications to spacecraftData.cmg
const cmgHandler = {
    set: function(target, prop, value) {
        console.log('DEBUG: spacecraftData.cmg being modified - prop:', prop, 'value:', JSON.stringify(value));
        return Reflect.set(target, prop, value);
    }
};
spacecraftData.cmg = new Proxy(spacecraftData.cmg, cmgHandler);
// Tab instances
let modelTab, thrustersTab, camerasTab, attitudeTab, lightsTab;

// Function to create text sprite
function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 48;
    
    canvas.width = 256;
    canvas.height = 128;
    
    context.font = `Bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(1, 0.5, 1);
    return sprite;
}

// Function to add axis labels
function addAxisLabels(scene, axisLength) {
    const labelOffset = axisLength + 0.5;
    const labelScale = 0.8;
    
    // X axis label (red)
    const xLabel = createTextSprite('X', '#ff0000');
    xLabel.position.set(labelOffset, 0, 0);
    xLabel.scale.set(labelScale, labelScale, labelScale);
    scene.add(xLabel);
    axisLabels.push(xLabel);
    
    // Y axis label (green)
    const yLabel = createTextSprite('Y', '#00ff00');
    yLabel.position.set(0, labelOffset, 0);
    yLabel.scale.set(labelScale, labelScale, labelScale);
    scene.add(yLabel);
    axisLabels.push(yLabel);
    
    // Z axis label (blue)
    const zLabel = createTextSprite('Z', '#0000ff');
    zLabel.position.set(0, 0, labelOffset);
    zLabel.scale.set(labelScale, labelScale, labelScale);
    scene.add(zLabel);
    axisLabels.push(zLabel);
}

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
    // Set default camera rotation: X=0, Y=180 degrees (π radians)
    camera.rotation.x = 0;
    camera.rotation.y = Math.PI;
    
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
    // Set default light position: (0, 0, 0)
    directionalLight.position.set(0, 0, 0);
    scene.add(directionalLight);
    
    // Add ambient lights along x, y, z axes (2 meters away, intensity 3)
    // X-axis lights
    const xLight1 = new THREE.PointLight(0xffffff, 3);
    xLight1.position.set(2, 0, 0);
    scene.add(xLight1);
    
    const xLight2 = new THREE.PointLight(0xffffff, 3);
    xLight2.position.set(-2, 0, 0);
    scene.add(xLight2);
    
    // Y-axis lights
    const yLight1 = new THREE.PointLight(0xffffff, 3);
    yLight1.position.set(0, 2, 0);
    scene.add(yLight1);
    
    const yLight2 = new THREE.PointLight(0xffffff, 3);
    yLight2.position.set(0, -2, 0);
    scene.add(yLight2);
    
    // Z-axis lights
    const zLight1 = new THREE.PointLight(0xffffff, 3);
    zLight1.position.set(0, 0, 2);
    scene.add(zLight1);
    
    const zLight2 = new THREE.PointLight(0xffffff, 3);
    zLight2.position.set(0, 0, -2);
    scene.add(zLight2);
    
    // Add grid helper for reference at y=-2
    const gridHelper = new THREE.GridHelper(10, 10);
    gridHelper.position.y = -2; // Move grid down to y=-2
    scene.add(gridHelper);
    
    // Add axes helper for reference
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    
    // Add axis labels
    addAxisLabels(scene, 5);

    // NEW: Create and add the CG visualizer sphere to the scene
    const cgGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const cgMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    cgVisualizer = new THREE.Mesh(cgGeometry, cgMaterial);
    cgVisualizer.visible = false; // Initially hidden
    scene.add(cgVisualizer);
    
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
    // Drag and drop support for JSON files
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        
        const file = files[0];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        // Check if it's a JSON file
        if (fileExtension !== 'json') {
            showNotification('Please drop a JSON file!', 'error');
            return;
        }
        
        // Read and load the JSON file
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                let importedData = JSON.parse(event.target.result);
                
                // Transform the imported data to match our internal structure
                // Convert direct arrays back to nested objects
                const transformedData = {
                    spacecraftProperties: importedData.spacecraftProperties,
                    model: importedData.model || { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, features: [] },
                    cameras: {
                        cameras: importedData.cameras || []
                    },
                    cmg: {
                        cmgs: importedData.cmg?.cmgs || []
                    },
                    lamps: {
                        lamps: importedData.lamps || []
                    },
                    reactionwheels: {
                        wheels: importedData.reactionwheels || []
                    },
                    thrusters: {
                        thrusters: importedData.thrusters || []
                    }
                };
                
                // The centerOfMass field in the file is our offset metadata.
                const cgOffset = transformedData.spacecraftProperties.centerOfMass || { x: 0, y: 0, z: 0 };
                
                // If the offset is not zero, we need to restore the original positions.
                if (cgOffset.x !== 0 || cgOffset.y !== 0 || cgOffset.z !== 0) {
                    
                    // Function to restore positions by adding the offset back
                    function restorePosition(position) {
                        if (!position) return;
                        position.x += cgOffset.x;
                        position.y += cgOffset.y;
                        position.z += cgOffset.z;
                    }
                    
                    // Restore all positions to their original editor coordinates
                    if (transformedData.model?.position) restorePosition(transformedData.model.position);
                    transformedData.thrusters?.thrusters?.forEach(t => restorePosition(t.position));
                    transformedData.cameras?.cameras?.forEach(c => restorePosition(c.position));
                    transformedData.cmg?.cmgs?.forEach(c => restorePosition(c.position));
                    transformedData.reactionwheels?.wheels?.forEach(w => restorePosition(w.position));
                    transformedData.lamps?.lamps?.forEach(l => restorePosition(l.position));
                }
                
                // Update the main spacecraft data object with the transformed data
                spacecraftData = transformedData;
                
                // Update all UI elements with the transformed data
                const props = spacecraftData.spacecraftProperties;
                document.getElementById('spacecraft-name').value = props.name;
                document.getElementById('spacecraft-description').value = props.description;
                document.getElementById('dry-mass').value = props.dryMass;
                document.getElementById('fuel-mass').value = props.fuelMass;
                document.getElementById('max-fuel-mass').value = props.maxFuelMass;
                document.getElementById('inertia-xx').value = props.inertia.x;
                document.getElementById('inertia-yy').value = props.inertia.y;
                document.getElementById('inertia-zz').value = props.inertia.z;
                
                const cg = props.centerOfMass || { x: 0, y: 0, z: 0 };
                document.getElementById('cg-x').value = cg.x;
                document.getElementById('cg-y').value = cg.y;
                document.getElementById('cg-z').value = cg.z;
                if (cgVisualizer) cgVisualizer.position.set(cg.x, cg.y, cg.z);
                
                // Reload all tabs
                modelTab.loadFromData(spacecraftData);
                thrustersTab.loadFromData(spacecraftData);
                camerasTab.loadFromData(spacecraftData);
                attitudeTab.loadFromData(spacecraftData);
                lightsTab.loadFromData(spacecraftData);
                
                showNotification(`Configuration "${file.name}" imported successfully!`);
            } catch (error) {
                showNotification('Error importing configuration: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    });

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
    const sceneContainer = document.getElementById('scene-container');
    
    togglePanelBtn.addEventListener('click', () => {
        console.log('=== PANEL TOGGLE DEBUG ===');
        console.log('Before toggle:');
        console.log('  rightPanel.classList:', rightPanel.className);
        console.log('  sceneContainer.classList:', sceneContainer.className);
        console.log('  sceneContainer.clientWidth:', sceneContainer.clientWidth);
        console.log('  sceneContainer.clientHeight:', sceneContainer.clientHeight);
        
        rightPanel.classList.toggle('hidden');
        togglePanelBtn.classList.toggle('panel-visible');
        togglePanelBtn.classList.toggle('panel-hidden');
        sceneContainer.classList.toggle('right-panel-hidden');
        
        console.log('After toggle:');
        console.log('  rightPanel.classList:', rightPanel.className);
        console.log('  sceneContainer.classList:', sceneContainer.className);
        console.log('  sceneContainer.clientWidth:', sceneContainer.clientWidth);
        console.log('  sceneContainer.clientHeight:', sceneContainer.clientHeight);
        
        // Force resize after panel toggle - wait for CSS transition to complete
        setTimeout(() => {
            // Force a layout recalculation (reflow) to ensure margin changes are applied
            void sceneContainer.offsetHeight;
            
            console.log('=== RESIZE CALLED ===');
            console.log('  Before resize - sceneContainer.clientWidth:', sceneContainer.clientWidth);
            console.log('  Before resize - sceneContainer.clientHeight:', sceneContainer.clientHeight);
            onWindowResize();
            console.log('  After resize - sceneContainer.clientWidth:', sceneContainer.clientWidth);
            console.log('  After resize - sceneContainer.clientHeight:', sceneContainer.clientHeight);
        }, 310); // Wait for 300ms transition + 10ms buffer
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
                        
                        // Apply scale if enabled
                        applyScaleToModel();
                        
                        // Update model tab with new model
                        modelTab.setModel(spacecraftModel);
                        
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
                            
                            // Apply scale if enabled
                            applyScaleToModel();
                            
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
    
    // NEW: Event listeners for scale controls
    const enableScaleCheckbox = document.getElementById('enable-scale');
    const modelScaleInput = document.getElementById('model-scale');
    
    function applyScaleToModel() {
        if (!spacecraftModel) return;
        
        const enableScale = enableScaleCheckbox.checked;
        const scale = parseFloat(modelScaleInput.value) || 1;
        
        if (enableScale) {
            spacecraftModel.scale.set(scale, scale, scale);
        } else {
            spacecraftModel.scale.set(1, 1, 1);
        }
        
        spacecraftModel.updateMatrixWorld();
    }
    
    enableScaleCheckbox.addEventListener('change', applyScaleToModel);
    modelScaleInput.addEventListener('input', applyScaleToModel);
    
    // --- EXPORT (CORRECTED) ---
    document.getElementById('export-config').addEventListener('click', () => {
        // Update spacecraft properties from form
        spacecraftData.spacecraftProperties.name = document.getElementById('spacecraft-name').value;
        spacecraftData.spacecraftProperties.description = document.getElementById('spacecraft-description').value;
        spacecraftData.spacecraftProperties.dryMass = parseFloat(document.getElementById('dry-mass').value);
        spacecraftData.spacecraftProperties.fuelMass = parseFloat(document.getElementById('fuel-mass').value);
        spacecraftData.spacecraftProperties.maxFuelMass = parseFloat(document.getElementById('max-fuel-mass').value);
        spacecraftData.spacecraftProperties.inertia.x = parseFloat(document.getElementById('inertia-xx').value);
        spacecraftData.spacecraftProperties.inertia.y = parseFloat(document.getElementById('inertia-yy').value);
        spacecraftData.spacecraftProperties.inertia.z = parseFloat(document.getElementById('inertia-zz').value);
        
        // DEBUG: Print spacecraftData.cmg before export
        console.log('DEBUG: spacecraftData.cmg before export:', JSON.stringify(spacecraftData.cmg, null, 2));
        
        // Get the current CG values from the UI. This is our offset.
        const cgX = parseFloat(document.getElementById('cg-x').value) || 0;
        const cgY = parseFloat(document.getElementById('cg-y').value) || 0;
        const cgZ = parseFloat(document.getElementById('cg-z').value) || 0;
        
        // DEBUG: Log spacecraftData state before export
        console.log('DEBUG: spacecraftData BEFORE deep copy:', JSON.stringify(spacecraftData, null, 2));
        console.log('DEBUG: spacecraftData.cmg.cmgs length:', spacecraftData.cmg?.cmgs?.length || 0);
        
        // Create a deep copy for exporting
        const exportData = JSON.parse(JSON.stringify(spacecraftData));
        
        // DEBUG: Print exportData.cmg after deep copy
        console.log('DEBUG: exportData.cmg after deep copy:', JSON.stringify(exportData.cmg, null, 2));
        console.log('DEBUG: exportData.cmg.cmgs length:', exportData.cmg?.cmgs?.length || 0);
        
        // DO NOT modify the centerOfMass field. It serves as metadata for re-importing.
        
        // Function to offset positions by the negative of the CG
        function offsetPosition(position) {
            if (!position) return;
            position.x -= cgX;
            position.y -= cgY;
            position.z -= cgZ;
        }
        
        // Offset all component positions in the export data
        if (exportData.model?.position) offsetPosition(exportData.model.position);
        exportData.thrusters?.thrusters?.forEach(t => offsetPosition(t.position));
        exportData.cameras?.cameras?.forEach(c => offsetPosition(c.position));
        
        // Handle CMG: CMGs are in array format and don't have position
        // Note: Simplified CMG format doesn't have position, so no offset needed
        console.log('DEBUG: Exporting CMG array with length:', exportData.cmg?.cmgs?.length || 0);
        
        exportData.reactionwheels?.wheels?.forEach(w => offsetPosition(w.position));
        exportData.lamps?.lamps?.forEach(l => offsetPosition(l.position));
        
        // Create a new object with the structure expected by the validation function
        // CORRECTED: Explicitly include the model and its features
        const formattedExportData = {
            spacecraftProperties: exportData.spacecraftProperties,
            model: exportData.model, // This now correctly includes the features
            // Transform nested arrays to direct arrays as expected by validation
            cameras: exportData.cameras?.cameras || [],
            // Handle CMG: export as array format
            cmg: { cmgs: exportData.cmg?.cmgs || [] },
            lamps: exportData.lamps?.lamps || [],
            reactionwheels: exportData.reactionwheels?.wheels || [],
            thrusters: exportData.thrusters?.thrusters || []
        };
        
        // DEBUG: Print formattedExportData.cmg after formatting
        console.log('DEBUG: formattedExportData.cmg after formatting:', JSON.stringify(formattedExportData.cmg, null, 2));
        
        // Export as JSON
        const dataStr = JSON.stringify(formattedExportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', 'spacecraft-config.json');
        linkElement.click();
        
        showNotification('Configuration exported successfully!');
    });
    
    // --- EXPORT MODEL (CORRECTED) ---
    document.getElementById('export-model').addEventListener('click', () => {
        if (!spacecraftModel) {
            showNotification('No model to export!', 'error');
            return;
        }

        // Get the current CG values from the UI. This is our offset.
        const cgOffset = new THREE.Vector3(
            parseFloat(document.getElementById('cg-x').value) || 0,
            parseFloat(document.getElementById('cg-y').value) || 0,
            parseFloat(document.getElementById('cg-z').value) || 0
        );
        
        // Save the original position of the model
        const originalPosition = spacecraftModel.position.clone();
        
        // CORRECTED: Temporarily move the model by offsetting it from its current position.
        // This correctly accounts for any manual positioning of the model in the editor.
        spacecraftModel.position.sub(cgOffset);
        
        // Update the scene matrix world to reflect the change before exporting
        spacecraftModel.updateMatrixWorld();
        
        // Create the exporter and parse the model
        const exporter = new STLExporter();
        const stlString = exporter.parse(spacecraftModel);
        
        // Restore the model's original position
        spacecraftModel.position.copy(originalPosition);
        spacecraftModel.updateMatrixWorld();
        
        // Create a blob from the STL string
        const blob = new Blob([stlString], { type: 'text/plain' });
        
        // Create a link to download the blob
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'spacecraft-model.stl';
        link.click();
        
        // Clean up the object URL
        URL.revokeObjectURL(link.href);
        
        showNotification('Model exported successfully!');
    });
    
    // --- IMPORT ---
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
                        let importedData = JSON.parse(e.target.result);
                        
                        // Transform the imported data to match our internal structure
                        // Convert direct arrays back to nested objects
                        const transformedData = {
                            spacecraftProperties: importedData.spacecraftProperties,
                            model: importedData.model || { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, features: [] },
                            cameras: {
                                cameras: importedData.cameras || []
                            },
                            cmg: {
                                cmgs: importedData.cmg?.cmgs || []
                            },
                            lamps: {
                                lamps: importedData.lamps || []
                            },
                            reactionwheels: {
                                wheels: importedData.reactionwheels || []
                            },
                            thrusters: {
                                thrusters: importedData.thrusters || []
                            }
                        };
                        
                        // The centerOfMass field in the file is our offset metadata.
                        const cgOffset = transformedData.spacecraftProperties.centerOfMass || { x: 0, y: 0, z: 0 };
                        
                        // If the offset is not zero, we need to restore the original positions.
                        if (cgOffset.x !== 0 || cgOffset.y !== 0 || cgOffset.z !== 0) {
                            
                            // Function to restore positions by adding the offset back
                            function restorePosition(position) {
                                if (!position) return;
                                position.x += cgOffset.x;
                                position.y += cgOffset.y;
                                position.z += cgOffset.z;
                            }
                            
                            // Restore all positions to their original editor coordinates
                            if (transformedData.model?.position) restorePosition(transformedData.model.position);
                            transformedData.thrusters?.thrusters?.forEach(t => restorePosition(t.position));
                            transformedData.cameras?.cameras?.forEach(c => restorePosition(c.position));
                            transformedData.cmg?.cmgs?.forEach(c => restorePosition(c.position));
                            transformedData.reactionwheels?.wheels?.forEach(w => restorePosition(w.position));
                            transformedData.lamps?.lamps?.forEach(l => restorePosition(l.position));
                        }
                        
                        // Update the main spacecraft data object with the transformed data
                        spacecraftData = transformedData;
                        
                        // Update all UI elements with the transformed data
                        const props = spacecraftData.spacecraftProperties;
                        document.getElementById('spacecraft-name').value = props.name;
                        document.getElementById('spacecraft-description').value = props.description;
                        document.getElementById('dry-mass').value = props.dryMass;
                        document.getElementById('fuel-mass').value = props.fuelMass;
                        document.getElementById('max-fuel-mass').value = props.maxFuelMass;
        document.getElementById('inertia-xx').value = props.inertia.x;
        document.getElementById('inertia-yy').value = props.inertia.y;
        document.getElementById('inertia-zz').value = props.inertia.z;
                        
                        const cg = props.centerOfMass || { x: 0, y: 0, z: 0 };
                        document.getElementById('cg-x').value = cg.x;
                        document.getElementById('cg-y').value = cg.y;
                        document.getElementById('cg-z').value = cg.z;
                        if (cgVisualizer) cgVisualizer.position.set(cg.x, cg.y, cg.z);
                        
                        // Reload all tabs
                        modelTab.loadFromData(spacecraftData);
                        thrustersTab.loadFromData(spacecraftData);
                        camerasTab.loadFromData(spacecraftData);
                        attitudeTab.loadFromData(spacecraftData);
                        lightsTab.loadFromData(spacecraftData);
                        
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

    // Event listener for "Autobind All" button
    document.getElementById('autobind-all').addEventListener('click', () => {
        thrustersTab.autoBindAll();
    });

    // Event listener for "Unbind All" button
    document.getElementById('unbind-all').addEventListener('click', () => {
        thrustersTab.unbindAll();
    });

    // NEW: Event listeners for the Center of Mass controls
    const cgCheckbox = document.getElementById('toggle-cg-visual');
    const cgXInput = document.getElementById('cg-x');
    const cgYInput = document.getElementById('cg-y');
    const cgZInput = document.getElementById('cg-z');

    // Function to update CG position from input fields
    function updateCGPosition() {
        const x = parseFloat(cgXInput.value) || 0;
        const y = parseFloat(cgYInput.value) || 0;
        const z = parseFloat(cgZInput.value) || 0;

        if (cgVisualizer) {
            cgVisualizer.position.set(x, y, z);
        }
        // Also update the data object
        spacecraftData.spacecraftProperties.centerOfMass = { x, y, z };
    }

    cgCheckbox.addEventListener('change', () => {
        if (cgVisualizer) {
            cgVisualizer.visible = cgCheckbox.checked;
        }
    });

    cgXInput.addEventListener('input', updateCGPosition);
    cgYInput.addEventListener('input', updateCGPosition);
    cgZInput.addEventListener('input', updateCGPosition);
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Set background color based on type
    if (type === 'error') {
        notification.style.backgroundColor = '#f44336';
    } else {
        notification.style.backgroundColor = '#4CAF50';
    }
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('scene-container');
    const contentContainer = document.getElementById('content-container');
    const rightPanel = document.getElementById('right-panel');
    
    // Calculate width manually based on container dimensions and panel state
    // This accounts for flexbox and margin transitions properly
    const leftPanelWidth = 300; // Fixed left panel width
    const rightPanelWidth = rightPanel.classList.contains('hidden') ? 0 : 250;
    const contentWidth = contentContainer.clientWidth;
    
    // Scene width = content width - left panel - right panel
    const width = contentWidth - leftPanelWidth - rightPanelWidth;
    const height = container.clientHeight;
    
    console.log('onWindowResize: contentWidth=' + contentWidth + ', leftPanelWidth=' + leftPanelWidth + ', rightPanelWidth=' + rightPanelWidth + ', calculated width=' + width + ', height=' + height);
    
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
