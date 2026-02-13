// cameras-tab.js
import * as THREE from 'three';
import { FeatureManager } from './featureManager.js';

export class CamerasTab extends FeatureManager {
    constructor(scene, spacecraftData) {
        super(scene, spacecraftData, 'cameras-list', 'Camera', 'cameras.cameras');
        this.featureType = 'Camera';
        this.fovConeDistance = 10; // Distance to render the FOV cone
        this.visualsVisible = true; // Track visibility state of all visuals
    }

    addFeature() {
        const cameraId = this.featureIdCounter++;
        const camera = {
            id: cameraId,
            name: `Camera ${cameraId}`,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: Math.PI, z: 0 }, // Default: X=0, Y=180 degrees
            fov: 75 // Field of View in degrees
        };
        
        this.features.push(camera);
        
        // Create visual representation
        const visual = this.createVisual(camera);
        this.visuals.push(visual);
        
        // Set initial visibility based on the toggle state
        visual.group.visible = this.visualsVisible;
        this.scene.add(visual.group);
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        this.updateFeaturesList();
    }

    createVisual(feature) {
        const group = new THREE.Group();

        // Create a small box to represent the camera body
        const cameraBodyGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.05);
        const cameraBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
        const cameraBody = new THREE.Mesh(cameraBodyGeometry, cameraBodyMaterial);
        group.add(cameraBody);

        // Create the FOV cone mesh
        const fovMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        this.originalOpacity = 0.2; // Store original opacity for highlighting
        const fovConeGeometry = this.createFOVCone(feature.fov);
        const fovMesh = new THREE.Mesh(fovConeGeometry, fovMaterial);
        
        // --- CORRECTED FIX: Position and rotate cone correctly ---
        // The default ConeGeometry is centered at the origin. We want its base at the origin.
        const height = this.fovConeDistance;
        
        // 1. Move the cone up by half its height so its base is at y=0.
        fovMesh.position.z = -height / 2;
        
        // 2. Rotate the cone to point along the camera's forward direction (-Z).
        // The default cone points along +Y. A +90 degree rotation on X moves +Y to -Z.
        fovMesh.rotation.x = Math.PI / 2;
        
        group.add(fovMesh);

        // Set initial position and rotation for the entire group
        this.updateVisualTransform(group, feature);

        return { 
            group: group, 
            body: cameraBody, 
            fovCone: fovMesh, 
            fovMaterial: fovMaterial 
        };
    }

    createFOVCone(fov) {
        const fovRad = THREE.MathUtils.degToRad(fov);
        const height = this.fovConeDistance;
        const radius = height * Math.tan(fovRad / 2);
        return new THREE.ConeGeometry(radius, height, 32, 1, true);
    }

    updateVisualTransform(group, feature) {
        group.position.set(feature.position.x, feature.position.y, feature.position.z);
        const euler = new THREE.Euler(feature.rotation.x, feature.rotation.y, feature.rotation.z, 'XYZ');
        group.quaternion.setFromEuler(euler);
    }

    updateVisual(index, feature, oldFov = null) {
        if (index < 0 || index >= this.visuals.length) return;
        
        const visual = this.visuals[index];
        if (!visual) return;

        // Update position and rotation
        this.updateVisualTransform(visual.group, feature);

        // Update FOV cone if it changed
        // Use oldFov parameter if provided, otherwise compare with stored value
        if (oldFov !== null ? oldFov !== feature.fov : this.features[index].fov !== feature.fov) {
            visual.fovCone.geometry.dispose(); // Clean up old geometry
            visual.fovCone.geometry = this.createFOVCone(feature.fov);
        }
    }
    
    // --- NEW: Method to toggle all visuals ---
    toggleVisuals() {
        const checkbox = document.getElementById('camera-visual-toggle');
        this.visualsVisible = checkbox.checked;
        
        this.visuals.forEach(visual => {
            visual.group.visible = this.visualsVisible;
        });
    }
    
    // Highlight a camera visual
    highlightCamera(index) {
        if (index < 0 || index >= this.visuals.length) return;
        const visual = this.visuals[index];
        if (visual && visual.body) {
            visual.body.material.emissive.setHex(0xffff00); // Bright yellow glow
            visual.body.material.emissiveIntensity = 0.5;
        }
        if (visual && visual.fovCone) {
            visual.fovMaterial.opacity = 0.6; // Make cone more visible
        }
    }
    
    // Unhighlight a camera visual
    unhighlightCamera(index) {
        if (index < 0 || index >= this.visuals.length) return;
        const visual = this.visuals[index];
        if (visual && visual.body) {
            visual.body.material.emissive.setHex(0x000000); // Turn off glow
            visual.body.material.emissiveIntensity = 1.0;
        }
        if (visual && visual.fovCone) {
            visual.fovMaterial.opacity = this.originalOpacity || 0.2; // Restore original opacity
        }
    }
    
    // Override updateFeature to handle nested properties correctly
    updateFeature(index, property, value) {
        if (index < 0 || index >= this.features.length) return;
        
        const feature = this.features[index];
        const numValue = parseFloat(value);
        
        // Store old value for FOV to detect changes
        const oldFov = feature.fov;
        
        if (property.startsWith('position.')) {
            const axis = property.split('.')[1];
            feature.position[axis] = numValue;
        } else if (property.startsWith('rotation.')) {
            const axis = property.split('.')[1];
            feature.rotation[axis] = THREE.MathUtils.degToRad(numValue);
        } else {
            feature[property] = isNaN(numValue) ? value : numValue;
        }
        
        // Update the visual representation (pass oldFov if FOV changed)
        if (property === 'fov') {
            this.updateVisual(index, feature, oldFov);
        } else {
            this.updateVisual(index, feature);
        }
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        // Refresh UI if name changed
        if (property === 'name') {
            this.updateFeaturesList();
        }
    }

    updateFeaturesList() {
        const featuresContainer = document.getElementById(this.containerId);
        featuresContainer.innerHTML = '';
        
        // --- NEW: Add the visibility toggle checkbox ---
        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginBottom = '10px';
        toggleContainer.style.padding = '10px';
        toggleContainer.style.backgroundColor = '#ddd';
        toggleContainer.style.borderRadius = '5px';
        toggleContainer.innerHTML = `
            <div class="control-group">
                <label><strong>Show Camera Cones:</strong></label>
                <input type="checkbox" id="camera-visual-toggle" ${this.visualsVisible ? 'checked' : ''} onchange="camerasTab.toggleVisuals()">
            </div>
        `;
        featuresContainer.appendChild(toggleContainer);
        
        this.features.forEach((camera, index) => {
            const cameraElement = document.createElement('div');
            cameraElement.className = 'feature-item';
            cameraElement.style.cursor = 'pointer';
            
            // Add hover event listeners
            cameraElement.addEventListener('mouseenter', () => {
                this.highlightCamera(index);
            });
            cameraElement.addEventListener('mouseleave', () => {
                this.unhighlightCamera(index);
            });
            
            const rotationDegX = THREE.MathUtils.radToDeg(camera.rotation.x);
            const rotationDegY = THREE.MathUtils.radToDeg(camera.rotation.y);
            const rotationDegZ = THREE.MathUtils.radToDeg(camera.rotation.z);
            
            cameraElement.innerHTML = `
                <div class="feature-header">
                    <h4>${camera.name}</h4>
                    <div class="feature-actions">
                        <button class="copy-btn" onclick="camerasTab.copyFeature(${index})">Copy</button>
                        <button class="delete-btn" onclick="camerasTab.deleteFeature(${index})">Delete</button>
                    </div>
                </div>
                <div class="feature-controls">
                    <div class="control-group">
                        <label>Name:</label>
                        <input type="text" value="${camera.name}" 
                            onchange="camerasTab.updateFeature(${index}, 'name', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Position X (m):</label>
                        <input type="number" value="${camera.position.x}" step="0.01" 
                            oninput="camerasTab.updateFeature(${index}, 'position.x', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Position Y (m):</label>
                        <input type="number" value="${camera.position.y}" step="0.01" 
                            oninput="camerasTab.updateFeature(${index}, 'position.y', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Position Z (m):</label>
                        <input type="number" value="${camera.position.z}" step="0.01" 
                            oninput="camerasTab.updateFeature(${index}, 'position.z', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Rotation X (deg):</label>
                        <input type="number" value="${rotationDegX}" step="1" 
                            oninput="camerasTab.updateFeature(${index}, 'rotation.x', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Rotation Y (deg):</label>
                        <input type="number" value="${rotationDegY}" step="1" 
                            oninput="camerasTab.updateFeature(${index}, 'rotation.y', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Rotation Z (deg):</label>
                        <input type="number" value="${rotationDegZ}" step="1" 
                            oninput="camerasTab.updateFeature(${index}, 'rotation.z', this.value)">
                    </div>
                    <div class="control-group">
                        <label>FOV (deg):</label>
                        <input type="number" value="${camera.fov}" step="1" min="1" max="179"
                            oninput="camerasTab.updateFeature(${index}, 'fov', this.value)">
                    </div>
                </div>
            `;
            
            featuresContainer.appendChild(cameraElement);
        });
        
        window.camerasTab = this;
    }

    loadFromData(spacecraftData) {
        this.clearFeatures();
        
        if (spacecraftData.cameras && spacecraftData.cameras.cameras) {
            this.features = spacecraftData.cameras.cameras;
            if (this.features.length > 0) {
                this.featureIdCounter = Math.max(...this.features.map(f => f.id || 0)) + 1;
            }
            
            // Recreate visuals for all loaded features
            this.features.forEach(feature => {
                const visual = this.createVisual(feature);
                visual.group.visible = this.visualsVisible; // Respect current visibility toggle
                this.visuals.push(visual);
                this.scene.add(visual.group);
            });
            
            this.updateFeaturesList();
        }
    }
}
