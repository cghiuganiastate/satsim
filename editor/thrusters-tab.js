//thrusters-tab.js
import * as THREE from 'three';
import { FeatureManager } from './featureManager.js';

// Auto-binding tolerances
const TRANSLATION_ANGLE_DEGREES = 90-15;
const TRANSLATION_TOLERANCE = Math.cos(TRANSLATION_ANGLE_DEGREES * Math.PI / 180);

export class ThrustersTab extends FeatureManager {
    constructor(scene, spacecraftData) {
        super(scene, spacecraftData, 'thrusters-list', 'Thruster', 'thrusters.thrusters');
        this.featureType = 'Thruster';
        this.activeThrusters = new Set(); // Track which thrusters are active
        
        // Setup keyboard listeners for thruster preview
        this.setupKeyboardListeners();
    }
    
    setupKeyboardListeners() {
        // Listen for keyboard events to preview thrusters
        document.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            
            // Only process keys if we're not in an input field
            if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
                // Check if this key corresponds to any thruster
                this.features.forEach((thruster, index) => {
                    // Check if the key is in the thruster's keybind array
                    if (thruster.keybind && thruster.keybind.includes(key)) {
                        this.activateThruster(index);
                    }
                });
            }
        });
        
        document.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();
            
            // Only process keys if we're not in an input field
            if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
                // Check if this key corresponds to any thruster
                this.features.forEach((thruster, index) => {
                    // Check if the key is in the thruster's keybind array
                    if (thruster.keybind && thruster.keybind.includes(key)) {
                        this.deactivateThruster(index);
                    }
                });
            }
        });
    }
    
    createThrusterVisual(pos, dir) {
        const group = new THREE.Group();
        const cone = new THREE.ConeGeometry(0.15/5, 0.4/5, 8); // radius, height, n-sides
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff5500, 
            emissive: 0x000000, 
            metalness: 0.1, 
            roughness: 0.8
        });
        const mesh = new THREE.Mesh(cone, mat);
        mesh.position.copy(pos);
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(dir.x,dir.y,dir.z));
        mesh.quaternion.copy(q);
        mesh.rotateX(Math.PI);
        group.add(mesh);
        return {group, material:mat, mesh:mesh};
    }
    
    // Highlight a thruster visual
    highlightThruster(index) {
        if (index < 0 || index >= this.visuals.length) return;
        const visual = this.visuals[index];
        if (visual && visual.material) {
            visual.material.emissive.setHex(0xffff00); // Bright yellow glow
            visual.material.emissiveIntensity = 1.0;
        }
    }
    
    // Unhighlight a thruster visual
    unhighlightThruster(index) {
        if (index < 0 || index >= this.visuals.length) return;
        const visual = this.visuals[index];
        if (visual && visual.material) {
            visual.material.emissive.setHex(0x000000); // Turn off glow
            visual.material.emissiveIntensity = 1.0;
        }
    }
    
    // Auto-binding logic that returns an array of keys
    autoBindThruster(thruster) {
        const dir = new THREE.Vector3(thruster.direction[0], thruster.direction[1], thruster.direction[2]);
        dir.normalize(); // Add this line to normalize the direction vector
        const pos = new THREE.Vector3(thruster.position[0], thruster.position[1], thruster.position[2]);
        const keys = [];
        
        // Translation: thruster points mostly along one axis
        const dot = (a, b) => a.dot(b);
        if (Math.abs(dot(dir, new THREE.Vector3(0, 0, 1))) > TRANSLATION_TOLERANCE) {
            keys.push(dir.z > 0 ? 'w' : 's');
        }
        if (Math.abs(dot(dir, new THREE.Vector3(1, 0, 0))) > TRANSLATION_TOLERANCE) {
            keys.push(dir.x > 0 ? 'a' : 'd');
        }
        if (Math.abs(dot(dir, new THREE.Vector3(0, 1, 0))) > TRANSLATION_TOLERANCE) {
            keys.push(dir.y > 0 ? 'e' : 'q');
        }
        
        // Rotation: torque = r × F  (lever arm × direction)
        const torque = new THREE.Vector3().crossVectors(pos, dir);

        // Pitch (rotation around X axis)
        if (Math.abs(torque.x) > 0.025) {
            keys.push(torque.x > 0 ? 'k' : 'i'); // pitch up/down
        }

        // Yaw (rotation around Y axis)
        if (Math.abs(torque.y) > 0.025) {
            keys.push(torque.y > 0 ? 'j' : 'l'); // yaw left/right
        }

        // Roll (rotation around Z axis)
        if (Math.abs(torque.z) > 0.025) {
            keys.push(torque.z > 0 ? 'o' : 'u'); // roll left/right
        }
        
        return keys; // Return array of keys
    }
    
    addFeature() {
        const thrusterId = this.featureIdCounter++;
        const thruster = {
            id: thrusterId,
            name: `Thruster ${thrusterId}`,
            position: [0, 0, 0], // Default position at origin
            direction: [-1, 0, 0], // Default direction pointing -X
            thrust: 1, // Default thrust of 1
            isp: 200, // Default ISP of 200
            keybind: [], // No keybinds by default (as an array)
            autoBind: false // Auto-bind disabled by default
        };
        
        this.features.push(thruster);
        
        // Create visual representation
        const pos = new THREE.Vector3(thruster.position[0], thruster.position[1], thruster.position[2]);
        const dir = new THREE.Vector3(thruster.direction[0], thruster.direction[1], thruster.direction[2]);
        const visual = this.createThrusterVisual(pos, dir);
        this.visuals.push(visual);
        
        // Add to scene
        this.scene.add(visual.group);
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        this.updateFeaturesList();
    }
    
    activateThruster(index) {
        if (index < 0 || index >= this.features.length) return;
        
        this.activeThrusters.add(index);
        const visual = this.visuals[index];
        if (visual) {
            visual.material.emissive.setHex(0xff5500); // Make it glow when active
        }
    }
    
    deactivateThruster(index) {
        if (index < 0 || index >= this.features.length) return;
        
        this.activeThrusters.delete(index);
        const visual = this.visuals[index];
        if (visual) {
            visual.material.emissive.setHex(0x000000); // Turn off glow when inactive
        }
    }
    
    createVisual(feature) {
        const pos = new THREE.Vector3(feature.position[0], feature.position[1], feature.position[2]);
        const dir = new THREE.Vector3(feature.direction[0], feature.direction[1], feature.direction[2]);
        return this.createThrusterVisual(pos, dir);
    }
    
    updateVisual(index, feature) {
        if (index < 0 || index >= this.features.length) return;
        
        const visual = this.visuals[index];
        
        if (feature && visual) {
            // Remove old visual
            this.scene.remove(visual.group);
            
            // Create new visual with updated position and direction
            const pos = new THREE.Vector3(feature.position[0], feature.position[1], feature.position[2]);
            const dir = new THREE.Vector3(feature.direction[0], feature.direction[1], feature.direction[2]);
            const newVisual = this.createThrusterVisual(pos, dir);
            
            // Replace old visual
            this.visuals[index] = newVisual;
            this.scene.add(newVisual.group);
            
            // Maintain active state if needed
            if (this.activeThrusters.has(index)) {
                newVisual.material.emissive.setHex(0xff5500);
            }
        }
    }
    
    updateFeature(index, property, value) {
        const feature = this.features[index];
        if (!feature) return;
        
        // Update the property
        if (property.includes('.')) {
            const [parent, child] = property.split('.');
            const childIndex = parseInt(child);
            feature[parent][childIndex] = parseFloat(value);
        } else {
            if (property === 'keybind') {
                // Parse comma-separated string into an array of keys
                feature.keybind = value.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
            } else {
                feature[property] = value;
            }
        }
        
        // Handle auto-binding
        if (property === 'autoBind' && value === true) {
            const autoKeys = this.autoBindThruster(feature);
            if (autoKeys.length > 0) {
                feature.keybind = autoKeys;
            } else {
                // If no auto-binding found, uncheck box
                feature.autoBind = false;
                this.updateFeaturesList();
                return;
            }
        } else if (property === 'autoBind' && value === false) {
            // Clear keybinds when auto-bind is disabled
            feature.keybind = [];
        }
        
        // Update visual if position or direction changed
        if (property.startsWith('position') || property.startsWith('direction')) {
            this.updateVisual(index, feature);
            
            // If auto-bind is enabled, recalculate keybinds
            if (feature.autoBind) {
                const autoKeys = this.autoBindThruster(feature);
                if (autoKeys.length > 0) {
                    feature.keybind = autoKeys;
                } else {
                    feature.autoBind = false;
                }
            }
        }
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        // Refresh UI to show updated keybinds if needed
        if (this.shouldRefreshUI(property, feature)) {
            this.updateFeaturesList();
        }
    }
    
    shouldRefreshUI(property, feature) {
        // Refresh UI if auto-binding changed or if auto-bind is enabled and position/direction changed
        return property === 'autoBind' || property === 'keybind' ||
               (feature.autoBind && (property.startsWith('position') || property.startsWith('direction')));
    }
    
    // Method to auto-bind all thrusters
    autoBindAll() {
        this.features.forEach((thruster, index) => {
            const autoKeys = this.autoBindThruster(thruster);
            if (autoKeys.length > 0) {
                thruster.keybind = autoKeys;
                thruster.autoBind = true;
            }
        });
        
        // Update spacecraft data and refresh UI
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }
    
    // Method to unbind all thrusters
    unbindAll() {
        this.features.forEach((thruster, index) => {
            // Clear all keybinds and disable auto-bind
            thruster.keybind = [];
            thruster.autoBind = false;
        });
        
        // Update spacecraft data and refresh UI
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }
    
    updateFeaturesList() {
        const featuresContainer = document.getElementById(this.containerId);
        featuresContainer.innerHTML = '';
        
        this.features.forEach((thruster, index) => {
            const thrusterElement = document.createElement('div');
            thrusterElement.className = 'feature-item';
            thrusterElement.style.cursor = 'pointer';
            
            // Add hover event listeners
            thrusterElement.addEventListener('mouseenter', () => {
                this.highlightThruster(index);
            });
            thrusterElement.addEventListener('mouseleave', () => {
                this.unhighlightThruster(index);
            });
            
            // Convert keybind array to comma-separated string for display
            const keybindString = thruster.keybind.join(', ');
            
            thrusterElement.innerHTML = `
                <div class="feature-header">
                    <h4>${thruster.name}</h4>
                    <div class="feature-actions">
                        <button class="copy-btn" onclick="thrustersTab.copyFeature(${index})">Copy</button>
                        <button class="delete-btn" onclick="thrustersTab.deleteFeature(${index})">Delete</button>
                    </div>
                </div>
                <div class="feature-controls">
                    <div class="control-group">
                        <label>Name:</label>
                        <input type="text" value="${thruster.name}" 
                            onchange="thrustersTab.updateFeature(${index}, 'name', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Auto-bind:</label>
                        <input type="checkbox" ${thruster.autoBind ? 'checked' : ''} 
                            onchange="thrustersTab.updateFeature(${index}, 'autoBind', this.checked)">
                    </div>
                    <div class="control-group">
                        <label>Keybind:</label>
                        <input type="text" value="${keybindString}" placeholder="e.g., w, k" 
                            onchange="thrustersTab.updateFeature(${index}, 'keybind', this.value)"
                            ${thruster.autoBind ? 'readonly' : ''}>
                    </div>
                    <div class="control-group">
                        <label>Position X (m):</label>
                        <input type="number" value="${thruster.position[0]}" step="0.01" 
                            onchange="thrustersTab.updateFeature(${index}, 'position.0', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Position Y (m):</label>
                        <input type="number" value="${thruster.position[1]}" step="0.01" 
                            onchange="thrustersTab.updateFeature(${index}, 'position.1', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Position Z (m):</label>
                        <input type="number" value="${thruster.position[2]}" step="0.01" 
                            onchange="thrustersTab.updateFeature(${index}, 'position.2', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Direction X:</label>
                        <input type="number" value="${thruster.direction[0]}" step="0.1" 
                            onchange="thrustersTab.updateFeature(${index}, 'direction.0', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Direction Y:</label>
                        <input type="number" value="${thruster.direction[1]}" step="0.1" 
                            onchange="thrustersTab.updateFeature(${index}, 'direction.1', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Direction Z:</label>
                        <input type="number" value="${thruster.direction[2]}" step="0.1" 
                            onchange="thrustersTab.updateFeature(${index}, 'direction.2', this.value)">
                    </div>
                    <div class="control-group">
                        <label>Thrust (N):</label>
                        <input type="number" value="${thruster.thrust}" step="0.1" 
                            onchange="thrustersTab.updateFeature(${index}, 'thrust', this.value)">
                    </div>
                    <div class="control-group">
                        <label>ISP (s):</label>
                        <input type="number" value="${thruster.isp}" step="0.1" 
                            onchange="thrustersTab.updateFeature(${index}, 'isp', this.value)">
                    </div>
                </div>
            `;
            
            featuresContainer.appendChild(thrusterElement);
        });
        
        // Make this instance globally accessible for onclick handlers
        window.thrustersTab = this;
    }
}
