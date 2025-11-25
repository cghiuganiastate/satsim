// attitude-tab.js
import * as THREE from 'three';
import { FeatureManager } from './featureManager.js';

export class AttitudeTab extends FeatureManager {
    constructor(scene, spacecraftData) {
        // We call super with a dummy dataPath since we're managing two paths.
        super(scene, spacecraftData, 'attitude-controls', 'AttitudeComponent', 'dummy');
        
        // Override the features array with two separate ones
        this.reactionWheels = [];
        this.cmgs = [];
        
        // And two separate visual arrays
        this.rwVisuals = [];
        this.cmgVisuals = [];

        // Separate ID counters for each type
        this.rwIdCounter = 0;
        this.cmgIdCounter = 0;
    }

    /**
     * Adds a new Reaction Wheel feature.
     */
    addReactionWheel() {
        const wheel = {
            id: this.rwIdCounter++,
            name: `RW-X`, // Default name, will be updated by UI
            orientation: { x: 1, y: 0, z: 0 },
            position: { x: 0, y: 0, z: 0 },
            maxAngularMomentum: 15,
            maxTorque: 0.5
        };
        
        this.reactionWheels.push(wheel);
        const visual = this.createVisual(wheel, 'rw');
        this.rwVisuals.push(visual);
        this.scene.add(visual.arrow);
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Adds a new CMG feature.
     */
    addCMG() {
        const cmg = {
            id: this.cmgIdCounter++,
            name: `CMG-1`, // Default name
            gimbalOrientation: { x: 0, y: 0, z: 1 },
            wheelOrientation: { x: 1, y: 0, z: 0 },
            position: { x: 0, y: 0, z: 0 },
            maxAngularMomentum: 50,
            maxTorque: 2
        };

        this.cmgs.push(cmg);
        const visual = this.createVisual(cmg, 'cmg');
        this.cmgVisuals.push(visual);
        this.scene.add(visual.arrow);
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Creates a visual representation (ArrowHelper) for a feature.
     * @param {object} feature - The RW or CMG configuration object.
     * @param {string} type - 'rw' for Reaction Wheel, 'cmg' for Control Moment Gyroscope.
     * @returns {object} An object containing the visual.
     */
    createVisual(feature, type) {
        const dir = new THREE.Vector3(
            type === 'rw' ? feature.orientation.x : feature.gimbalOrientation.x,
            type === 'rw' ? feature.orientation.y : feature.gimbalOrientation.y,
            type === 'rw' ? feature.orientation.z : feature.gimbalOrientation.z
        ).normalize();

        const origin = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
        const length = 2; // Length of the arrow
        const color = type === 'rw' ? 0x00ff00 : 0xff0000; // Green for RW, Red for CMG

        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, color);
        
        return { arrow: arrowHelper };
    }
    
    /**
     * Updates a feature's data and its visual representation.
     * @param {string} type - 'rw' or 'cmg'
     * @param {number} index - The index of the feature in its respective array.
     * @param {string} property - The property to update (e.g., 'position.x').
     * @param {any} value - The new value.
     */
    updateFeature(type, index, property, value) {
        const features = type === 'rw' ? this.reactionWheels : this.cmgs;
        const visuals = type === 'rw' ? this.rwVisuals : this.cmgVisuals;

        if (index < 0 || index >= features.length) return;
        
        const feature = features[index];
        const visual = visuals[index];
        if (!feature || !visual) return;

        const numValue = parseFloat(value);
        
        // Update the data object
        if (property.includes('.')) {
            const [parent, child] = property.split('.');
            feature[parent][child] = isNaN(numValue) ? 0 : numValue;
        } else {
            feature[property] = value;
        }

        // Update the visual if position or orientation changed
        if (property.startsWith('position.') || property.startsWith('orientation.') || property.startsWith('gimbalOrientation.')) {
            const arrow = visual.arrow;
            
            // Update position
            arrow.position.set(feature.position.x, feature.position.y, feature.position.z);
            
            // Update direction
            const dir = new THREE.Vector3();
            if (type === 'rw') {
                dir.set(feature.orientation.x, feature.orientation.y, feature.orientation.z);
            } else {
                dir.set(feature.gimbalOrientation.x, feature.gimbalOrientation.y, feature.gimbalOrientation.z);
            }
            dir.normalize();
            arrow.setDirection(dir);
        }
        
        this.updateSpacecraftData();
        if (property === 'name') {
            this.updateFeaturesList();
        }
    }

    /**
     * Copies a feature.
     * @param {string} type - 'rw' or 'cmg'
     * @param {number} index - The index of the feature to copy.
     */
    copyFeature(type, index) {
        const features = type === 'rw' ? this.reactionWheels : this.cmgs;
        if (index < 0 || index >= features.length) return;

        const originalFeature = features[index];
        const newFeature = JSON.parse(JSON.stringify(originalFeature));
        
        // Assign new ID and name
        if (type === 'rw') {
            newFeature.id = this.rwIdCounter++;
            newFeature.name = `${this.featureType} RW ${newFeature.id}`;
            this.reactionWheels.push(newFeature);
            const visual = this.createVisual(newFeature, 'rw');
            this.rwVisuals.push(visual);
            this.scene.add(visual.arrow);
        } else {
            newFeature.id = this.cmgIdCounter++;
            newFeature.name = `${this.featureType} CMG ${newFeature.id}`;
            this.cmgs.push(newFeature);
            const visual = this.createVisual(newFeature, 'cmg');
            this.cmgVisuals.push(visual);
            this.scene.add(visual.arrow);
        }

        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Deletes a feature.
     * @param {string} type - 'rw' or 'cmg'
     * @param {number} index - The index of the feature to delete.
     */
    deleteFeature(type, index) {
        if (type === 'rw') {
            if (index < 0 || index >= this.reactionWheels.length) return;
            this.scene.remove(this.rwVisuals[index].arrow);
            this.reactionWheels.splice(index, 1);
            this.rwVisuals.splice(index, 1);
        } else {
            if (index < 0 || index >= this.cmgs.length) return;
            this.scene.remove(this.cmgVisuals[index].arrow);
            this.cmgs.splice(index, 1);
            this.cmgVisuals.splice(index, 1);
        }
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Overrides the parent method to update the correct paths in spacecraftData.
     */
    updateSpacecraftData() {
        this.spacecraftData.reactionwheels = { wheels: this.reactionWheels };
        this.spacecraftData.cmg = { cmgs: this.cmgs };
    }

    /**
     * Overrides the parent method to build the UI for both RWs and CMGs.
     */
    updateFeaturesList() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        container.innerHTML = '';

        // Helper function to create a feature element
        const createFeatureElement = (feature, index, type) => {
            const element = document.createElement('div');
            element.className = 'feature-item';
            
            const title = type === 'rw' ? 'Reaction Wheel' : 'CMG';
            
            element.innerHTML = `
                <div class="feature-header">
                    <h4>${feature.name}</h4>
                    <div class="feature-actions">
                        <button class="copy-btn" data-type="${type}" data-index="${index}">Copy</button>
                        <button class="delete-btn" data-type="${type}" data-index="${index}">Delete</button>
                    </div>
                </div>
                <div class="feature-controls">
                    <div class="control-group"><label>Name:</label><input type="text" class="attitude-input" data-type="${type}" data-index="${index}" data-property="name" value="${feature.name}"></div>
                    <div class="control-group"><label>Position X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.x" value="${feature.position.x}" step="0.1"></div>
                    <div class="control-group"><label>Position Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.y" value="${feature.position.y}" step="0.1"></div>
                    <div class="control-group"><label>Position Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.z" value="${feature.position.z}" step="0.1"></div>
                    ${type === 'rw' ? `
                    <div class="control-group"><label>Orientation X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.x" value="${feature.orientation.x}" step="0.1"></div>
                    <div class="control-group"><label>Orientation Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.y" value="${feature.orientation.y}" step="0.1"></div>
                    <div class="control-group"><label>Orientation Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.z" value="${feature.orientation.z}" step="0.1"></div>
                    ` : `
                    <div class="control-group"><label>Gimbal Orient. X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="gimbalOrientation.x" value="${feature.gimbalOrientation.x}" step="0.1"></div>
                    <div class="control-group"><label>Gimbal Orient. Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="gimbalOrientation.y" value="${feature.gimbalOrientation.y}" step="0.1"></div>
                    <div class="control-group"><label>Gimbal Orient. Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="gimbalOrientation.z" value="${feature.gimbalOrientation.z}" step="0.1"></div>
                    <div class="control-group"><label>Wheel Orient. X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="wheelOrientation.x" value="${feature.wheelOrientation.x}" step="0.1"></div>
                    <div class="control-group"><label>Wheel Orient. Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="wheelOrientation.y" value="${feature.wheelOrientation.y}" step="0.1"></div>
                    <div class="control-group"><label>Wheel Orient. Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="wheelOrientation.z" value="${feature.wheelOrientation.z}" step="0.1"></div>
                    `}
                    <div class="control-group"><label>Max Ang. Momentum:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="maxAngularMomentum" value="${feature.maxAngularMomentum}" step="1"></div>
                    <div class="control-group"><label>Max Torque:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="maxTorque" value="${feature.maxTorque}" step="0.1"></div>
                </div>
            `;
            return element;
        };

        // Add RWs to the UI
        if (this.reactionWheels.length > 0) {
            const rwTitle = document.createElement('h3');
            rwTitle.textContent = 'Reaction Wheels';
            container.appendChild(rwTitle);
            this.reactionWheels.forEach((wheel, index) => {
                container.appendChild(createFeatureElement(wheel, index, 'rw'));
            });
        }

        // Add CMGs to the UI
        if (this.cmgs.length > 0) {
            const cmgTitle = document.createElement('h3');
            cmgTitle.textContent = 'Control Moment Gyroscopes (CMGs)';
            container.appendChild(cmgTitle);
            this.cmgs.forEach((cmg, index) => {
                container.appendChild(createFeatureElement(cmg, index, 'cmg'));
            });
        }

        // Add event listeners
        const allInputs = container.querySelectorAll('.attitude-input');
        allInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                const index = parseInt(e.target.dataset.index);
                const property = e.target.dataset.property;
                this.updateFeature(type, index, property, e.target.value);
            });
        });

        const allButtons = container.querySelectorAll('.copy-btn, .delete-btn');
        allButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const index = parseInt(e.target.dataset.index);
                const action = e.target.classList.contains('copy-btn') ? 'copy' : 'delete';
                if (action === 'copy') {
                    this.copyFeature(type, index);
                } else {
                    this.deleteFeature(type, index);
                }
            });
        });
    }

    /**
     * Overrides the parent method to load data for both RWs and CMGs.
     * @param {object} spacecraftData - The main data object.
     */
    loadFromData(spacecraftData) {
        this.clearFeatures();
        
        // Load Reaction Wheels
        if (spacecraftData.reactionwheels && spacecraftData.reactionwheels.wheels) {
            this.reactionWheels = spacecraftData.reactionwheels.wheels;
            if (this.reactionWheels.length > 0) {
                this.rwIdCounter = Math.max(...this.reactionWheels.map(f => f.id || 0)) + 1;
            }
            this.reactionWheels.forEach(wheel => {
                const visual = this.createVisual(wheel, 'rw');
                this.rwVisuals.push(visual);
                this.scene.add(visual.arrow);
            });
        }

        // Load CMGs
        if (spacecraftData.cmg && spacecraftData.cmg.cmgs) {
            this.cmgs = spacecraftData.cmg.cmgs;
            if (this.cmgs.length > 0) {
                this.cmgIdCounter = Math.max(...this.cmgs.map(f => f.id || 0)) + 1;
            }
            this.cmgs.forEach(cmg => {
                const visual = this.createVisual(cmg, 'cmg');
                this.cmgVisuals.push(visual);
                this.scene.add(visual.arrow);
            });
        }
        
        this.updateFeaturesList();
    }

    /**
     * Clears all features and visuals from the scene and data.
     */
    clearFeatures() {
        // Remove RW visuals
        this.rwVisuals.forEach(visual => this.scene.remove(visual.arrow));
        this.reactionWheels = [];
        this.rwVisuals = [];
        
        // Remove CMG visuals
        this.cmgVisuals.forEach(visual => this.scene.remove(visual.arrow));
        this.cmgs = [];
        this.cmgVisuals = [];

        this.updateSpacecraftData();
    }
}