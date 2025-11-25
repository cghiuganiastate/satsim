// lights-tab.js
import * as THREE from 'three';
import { FeatureManager } from './featureManager.js';

export class LightsTab extends FeatureManager {
    // The spacecraftModel is no longer needed.
    constructor(scene, spacecraftData) {
        super(scene, spacecraftData, 'lights-list', 'Light', 'lamps.lamps');
        this.featureType = 'Light';
        this.lightsVisible = true;
        this.helpersVisible = false;
        this.inputElements = []; // Store references to input elements
    }

    /**
     * Adds a new light feature and its corresponding THREE.js objects to the scene.
     */
    addFeature() {
        const lightId = this.featureIdCounter++;
        const lightConfig = {
            id: lightId,
            name: `Light ${lightId}`,
            // These are now absolute world coordinates
            position: { x: 5, y: 5, z: 5 },
            rotation: { x: -Math.PI / 4, y: 0, z: 0 }, // Default pointing down
            color: '#ffffff',
            intensity: 1,
            distance: 20,
            angle: Math.PI / 6,
            penumbra: 0.2,
            castShadow: false
        };
        
        this.features.push(lightConfig);
        
        const visual = this.createVisual(lightConfig);
        this.visuals.push(visual);
        
        this.scene.add(visual.light);
        this.scene.add(visual.light.target);
        this.scene.add(visual.helper);
        
        visual.light.visible = this.lightsVisible;
        visual.helper.visible = this.helpersVisible;
        
        // Update its position and direction in the world
        this.updateSingleLightVisual(this.features.length - 1, lightConfig, visual);

        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Creates the THREE.js SpotLight and its helper from a configuration object.
     * @param {object} config - The light configuration.
     * @returns {object} An object containing the light and its helper.
     */
    createVisual(config) {
        const color = new THREE.Color(config.color);
        const light = new THREE.SpotLight(color, config.intensity, config.distance, config.angle, config.penumbra);
        
        if (config.castShadow) {
            light.castShadow = true;
            light.shadow.mapSize.width = 1024;
            light.shadow.mapSize.height = 1024;
            light.shadow.camera.near = 0.5;
            light.shadow.camera.far = config.distance || 20;
        }
        
        const helper = new THREE.SpotLightHelper(light);
        return { light: light, helper: helper };
    }
    
    /**
     * Copies an existing light feature.
     * @param {number} index - The index of the feature to copy.
     */
    copyFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        const originalFeature = this.features[index];
        const newFeatureId = this.featureIdCounter++;
        const newFeature = JSON.parse(JSON.stringify(originalFeature));
        newFeature.id = newFeatureId;
        newFeature.name = `${this.featureType} ${newFeatureId}`;
        
        this.features.push(newFeature);
        
        const visual = this.createVisual(newFeature);
        this.visuals.push(visual);
        this.scene.add(visual.light);
        this.scene.add(visual.light.target);
        this.scene.add(visual.helper);
        
        visual.light.visible = this.lightsVisible;
        visual.helper.visible = this.helpersVisible;
        
        // Position the new light correctly in the world
        this.updateSingleLightVisual(this.features.length - 1, newFeature, visual);

        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Deletes a light feature and removes its THREE.js objects from the scene.
     * @param {number} index - The index of the feature to delete.
     */
    deleteFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        const visual = this.visuals[index];
        if (visual) {
            this.scene.remove(visual.light);
            this.scene.remove(visual.light.target);
            this.scene.remove(visual.helper);
        }
        
        this.features.splice(index, 1);
        this.visuals.splice(index, 1);
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }
    
    toggleLights() {
        const checkbox = document.getElementById('lights-toggle');
        if (!checkbox) return;
        
        this.lightsVisible = checkbox.checked;
        this.visuals.forEach(visual => {
            if (visual && visual.light) {
                visual.light.visible = this.lightsVisible;
            }
        });
    }

    toggleHelpers() {
        const checkbox = document.getElementById('light-helpers-toggle');
        if (!checkbox) return;
        
        this.helpersVisible = checkbox.checked;
        this.visuals.forEach(visual => {
            if (visual && visual.helper) {
                visual.helper.visible = this.helpersVisible;
            }
        });
    }
    
    /**
     * This is the main update function called when a UI element changes.
     * It updates the data object and then applies the changes to the THREE.js light.
     * @param {number} index - The index of the light to update.
     * @param {string} property - The property being changed (e.g., 'intensity', 'position.x').
     * @param {any} value - The new value from the UI.
     */
    updateFeature(index, property, value) {
        if (index < 0 || index >= this.features.length) return;
        
        const feature = this.features[index];
        const visual = this.visuals[index];
        if (!feature || !visual) return;

        const light = visual.light;
        const numValue = parseFloat(value);
        
        // 1. Update the data object
        if (property.startsWith('position.')) {
            const axis = property.split('.')[1];
            feature.position[axis] = isNaN(numValue) ? 0 : numValue;
        } else if (property.startsWith('rotation.')) {
            const axis = property.split('.')[1];
            feature.rotation[axis] = isNaN(numValue) ? 0 : THREE.MathUtils.degToRad(numValue);
        } else if (property === 'angle') {
            feature.angle = isNaN(numValue) ? Math.PI / 6 : THREE.MathUtils.degToRad(numValue);
            light.angle = feature.angle;
        } else if (property === 'color') {
            feature.color = value;
            light.color = new THREE.Color(value);
        } else if (property === 'intensity') {
            feature.intensity = isNaN(numValue) ? 1 : numValue;
            light.intensity = feature.intensity;
        } else if (property === 'distance') {
            feature.distance = isNaN(numValue) ? 20 : numValue;
            light.distance = feature.distance;
        } else if (property === 'penumbra') {
            feature.penumbra = isNaN(numValue) ? 0.2 : numValue;
            light.penumbra = feature.penumbra;
        } else if (property === 'castShadow') {
            feature.castShadow = !!value;
            light.castShadow = feature.castShadow;
        } else {
            feature[property] = value;
        }
        
        // 2. Re-calculate position and direction in world space
        this.updateSingleLightVisual(index, feature, visual);
        
        this.updateSpacecraftData();
        if (property === 'name') {
            this.updateFeaturesList();
        }
    }

    /**
     * Updates a single light's world position and direction using its own config.
     * It is completely independent of any spacecraft.
     * @param {number} index - The index of the light to update.
     * @param {object} feature - The light's configuration object.
     * @param {object} visual - The object containing the THREE.js light and helper.
     */
    updateSingleLightVisual(index, feature, visual) {
        const light = visual.light;
        const helper = visual.helper;

        // --- Calculate Light's World Position (from its own config) ---
        light.position.set(feature.position.x, feature.position.y, feature.position.z);

        // --- Calculate Light's World Direction (from its own config) ---
        const euler = new THREE.Euler(feature.rotation.x, feature.rotation.y, feature.rotation.z, 'XYZ');
        const direction = new THREE.Vector3(0, 0, -1); // Default spotlight direction
        direction.applyEuler(euler); // Apply the light's own rotation

        // --- Update Target's World Position ---
        const targetDistance = feature.distance || 20;
        light.target.position.copy(light.position).add(direction.multiplyScalar(targetDistance));
        
        // --- Update Helper ---
        helper.update();
    }
    
    /**
     * Updates all lights. This is intended to be called from the main animation loop
     * or whenever lights need to be refreshed. It no longer needs the spacecraft mesh.
     */
    updateLights() {
        this.features.forEach((feature, index) => {
            const visual = this.visuals[index];
            if (visual) {
                this.updateSingleLightVisual(index, feature, visual);
            }
        });
    }

    /**
     * Builds the UI list for all lights and attaches event listeners.
     */
    updateFeaturesList() {
        // ... (This method remains unchanged from the previous version)
        const featuresContainer = document.getElementById(this.containerId);
        if (!featuresContainer) return;
        
        featuresContainer.innerHTML = '';
        this.inputElements = [];

        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginBottom = '10px';
        toggleContainer.style.padding = '10px';
        toggleContainer.style.backgroundColor = '#ddd';
        toggleContainer.style.borderRadius = '5px';
        toggleContainer.innerHTML = `
            <div class="control-group">
                <label><strong>Show Lights:</strong></label>
                <input type="checkbox" id="lights-toggle" ${this.lightsVisible ? 'checked' : ''}>
            </div>
            <div class="control-group">
                <label><strong>Show Light Helpers:</strong></label>
                <input type="checkbox" id="light-helpers-toggle" ${this.helpersVisible ? 'checked' : ''}>
            </div>
        `;
        featuresContainer.appendChild(toggleContainer);
        document.getElementById('lights-toggle').addEventListener('change', () => this.toggleLights());
        document.getElementById('light-helpers-toggle').addEventListener('change', () => this.toggleHelpers());
        
        this.features.forEach((light, index) => {
            const lightElement = document.createElement('div');
            lightElement.className = 'feature-item';
            
            const rotationDegX = THREE.MathUtils.radToDeg(light.rotation.x);
            const rotationDegY = THREE.MathUtils.radToDeg(light.rotation.y);
            const rotationDegZ = THREE.MathUtils.radToDeg(light.rotation.z);
            const angleDeg = THREE.MathUtils.radToDeg(light.angle);
            
            lightElement.innerHTML = `
                <div class="feature-header">
                    <h4>${light.name}</h4>
                    <div class="feature-actions">
                        <button class="copy-btn" data-index="${index}">Copy</button>
                        <button class="delete-btn" data-index="${index}">Delete</button>
                    </div>
                </div>
                <div class="feature-controls">
                    <div class="control-group"><label>Name:</label><input type="text" class="light-name-input" data-index="${index}" data-property="name" value="${light.name}"></div>
                    <div class="control-group"><label>Position X:</label><input type="number" class="light-input" data-index="${index}" data-property="position.x" value="${light.position.x}" step="0.1"></div>
                    <div class="control-group"><label>Position Y:</label><input type="number" class="light-input" data-index="${index}" data-property="position.y" value="${light.position.y}" step="0.1"></div>
                    <div class="control-group"><label>Position Z:</label><input type="number" class="light-input" data-index="${index}" data-property="position.z" value="${light.position.z}" step="0.1"></div>
                    <div class="control-group"><label>Rotation X (deg):</label><input type="number" class="light-input" data-index="${index}" data-property="rotation.x" value="${rotationDegX}" step="1"></div>
                    <div class="control-group"><label>Rotation Y (deg):</label><input type="number" class="light-input" data-index="${index}" data-property="rotation.y" value="${rotationDegY}" step="1"></div>
                    <div class="control-group"><label>Rotation Z (deg):</label><input type="number" class="light-input" data-index="${index}" data-property="rotation.z" value="${rotationDegZ}" step="1"></div>
                    <div class="control-group"><label>Color:</label><input type="color" class="light-input" data-index="${index}" data-property="color" value="${light.color}"></div>
                    <div class="control-group"><label>Intensity:</label><input type="number" class="light-input" data-index="${index}" data-property="intensity" value="${light.intensity}" step="0.1"></div>
                    <div class="control-group"><label>Distance:</label><input type="number" class="light-input" data-index="${index}" data-property="distance" value="${light.distance}" step="1"></div>
                    <div class="control-group"><label>Angle (deg):</label><input type="number" class="light-input" data-index="${index}" data-property="angle" value="${angleDeg}" step="1" min="1" max="179"></div>
                    <div class="control-group"><label>Penumbra:</label><input type="number" class="light-input" data-index="${index}" data-property="penumbra" value="${light.penumbra}" step="0.01" min="0" max="1"></div>
                    <div class="control-group"><label>Cast Shadow:</label><input type="checkbox" class="light-input" data-index="${index}" data-property="castShadow" ${light.castShadow ? 'checked' : ''}></div>
                </div>
            `;
            featuresContainer.appendChild(lightElement);
        });

        const allInputs = featuresContainer.querySelectorAll('.light-input, .light-name-input');
        allInputs.forEach(input => {
            const index = parseInt(input.dataset.index);
            const property = input.dataset.property;
            const eventType = input.type === 'number' ? 'input' : 'change';
            
            input.addEventListener(eventType, (e) => {
                this.updateFeature(index, property, e.target.value);
            });
        });

        const allButtons = featuresContainer.querySelectorAll('.copy-btn, .delete-btn');
        allButtons.forEach(button => {
            const index = parseInt(button.dataset.index);
            button.addEventListener('click', () => {
                if (button.classList.contains('copy-btn')) {
                    this.copyFeature(index);
                } else {
                    this.deleteFeature(index);
                }
            });
        });
    }

    /**
     * Loads light configurations from the main spacecraft data object.
     * @param {object} spacecraftData - The main data object.
     */
    loadFromData(spacecraftData) {
        this.clearFeatures();
        
        if (spacecraftData.lamps && spacecraftData.lamps.lamps) {
            this.features = spacecraftData.lamps.lamps;
            if (this.features.length > 0) {
                this.featureIdCounter = Math.max(...this.features.map(f => f.id || 0)) + 1;
            }
            
            this.features.forEach(feature => {
                const visual = this.createVisual(feature);
                this.visuals.push(visual);
                this.scene.add(visual.light);
                this.scene.add(visual.light.target);
                this.scene.add(visual.helper);
            });
            
            // After creating all lights, update their visuals once
            this.updateLights();
            this.updateFeaturesList();
        }
    }
}