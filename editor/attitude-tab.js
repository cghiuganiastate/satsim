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
     * CMGs work like reaction wheels but only have maxAngularMomentum and maxTorque settings.
     */
    addCMG() {
        const cmg = {
            id: this.cmgIdCounter++,
            name: `CMG-${this.cmgIdCounter}`,
            maxAngularMomentum: 200,
            maxTorque: 5
        };

        this.cmgs.push(cmg);
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }

    /**
     * Creates a visual representation (ArrowHelper) for a feature.
     * @param {object} feature - The RW or CMG configuration object.
     * @param {string} type - 'rw' for Reaction Wheel, 'cmg' for Control Moment Gyroscope.
     * @returns {object} An object containing the visual.
     * Note: CMGs no longer have visual representation in the simplified model.
     */
    createVisual(feature, type) {
        const dir = new THREE.Vector3(
            type === 'rw' ? feature.orientation.x : 0,
            type === 'rw' ? feature.orientation.y : 0,
            type === 'rw' ? feature.orientation.z : 1
        ).normalize();

        const origin = new THREE.Vector3(
            type === 'rw' ? feature.position.x : 0,
            type === 'rw' ? feature.position.y : 0,
            type === 'rw' ? feature.position.z : 0
        );
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
        // CMGs don't have visuals, so only check visual for RWs
        if (!feature || (type === 'rw' && !visual)) return;

        console.log('DEBUG: updateFeature - type:', type, 'index:', index, 'property:', property, 'value:', value);
        console.log('DEBUG: Feature before update:', JSON.stringify(feature));

        const numValue = parseFloat(value);
        
        // Update the data object
        if (property.includes('.')) {
            const [parent, child] = property.split('.');
            feature[parent][child] = isNaN(numValue) ? 0 : numValue;
        } else {
            // Use parsed number for numeric properties, original string for others (like name)
            feature[property] = isNaN(numValue) ? value : numValue;
        }

        console.log('DEBUG: Feature after update:', JSON.stringify(feature));
        console.log('DEBUG: this.cmgs === spacecraftData.cmg.cmgs:', this.cmgs === this.spacecraftData.cmg.cmgs);
        console.log('DEBUG: spacecraftData.cmg.cmgs[index]:', JSON.stringify(this.spacecraftData.cmg.cmgs[index]));

        // Update the visual if position or orientation changed (only for RWs)
        if (type === 'rw' && (property.startsWith('position.') || property.startsWith('orientation.'))) {
            const arrow = visual.arrow;
            
            // Update position
            arrow.position.set(feature.position.x, feature.position.y, feature.position.z);
            
            // Update direction
            const dir = new THREE.Vector3(
                feature.orientation.x,
                feature.orientation.y,
                feature.orientation.z
            );
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
            newFeature.name = `RW-${newFeature.id}`;
            this.reactionWheels.push(newFeature);
            const visual = this.createVisual(newFeature, 'rw');
            this.rwVisuals.push(visual);
            this.scene.add(visual.arrow);
        } else {
            newFeature.id = this.cmgIdCounter++;
            newFeature.name = `CMG-${newFeature.id}`;
            this.cmgs.push(newFeature);
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
        console.log('DEBUG: updateSpacecraftData called - cmgs length:', this.cmgs.length, 'cmgs:', JSON.stringify(this.cmgs));
        this.spacecraftData.reactionwheels = { wheels: this.reactionWheels };
        // CMG format: same as reaction wheels - store as array in cmgs property
        // CRITICAL: Assign this.cmgs directly to maintain reference
        // Do NOT use deep copy here as it breaks the reference!
        this.spacecraftData.cmg = { cmgs: this.cmgs };
        console.log('DEBUG: Updated spacecraftData.cmg:', JSON.stringify(this.spacecraftData.cmg));
        console.log('DEBUG: this.cmgs === spacecraftData.cmg.cmgs:', this.cmgs === this.spacecraftData.cmg.cmgs);
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
                    ${type === 'rw' ? `
                    <div class="control-group"><label>Position X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.x" value="${feature.position.x}" step="0.1"></div>
                    <div class="control-group"><label>Position Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.y" value="${feature.position.y}" step="0.1"></div>
                    <div class="control-group"><label>Position Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="position.z" value="${feature.position.z}" step="0.1"></div>
                    <div class="control-group"><label>Orientation X:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.x" value="${feature.orientation.x}" step="0.1"></div>
                    <div class="control-group"><label>Orientation Y:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.y" value="${feature.orientation.y}" step="0.1"></div>
                    <div class="control-group"><label>Orientation Z:</label><input type="number" class="attitude-input" data-type="${type}" data-index="${index}" data-property="orientation.z" value="${feature.orientation.z}" step="0.1"></div>
                    ` : ''}
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
            cmgTitle.textContent = 'Control Moment Gyroscope (CMG) System';
            container.appendChild(cmgTitle);
            this.cmgs.forEach((cmg, index) => {
                container.appendChild(createFeatureElement(cmg, index, 'cmg'));
            });
        }

        // Add event listeners
        const allInputs = container.querySelectorAll('.attitude-input');
        console.log('DEBUG: Found inputs to attach listeners to:', allInputs.length);
        allInputs.forEach((input, i) => {
            console.log('DEBUG: Input', i, 'type:', input.dataset.type, 'index:', input.dataset.index, 'property:', input.dataset.property);
            input.addEventListener('input', (e) => {
                console.log('DEBUG: Input event fired! value:', e.target.value);
                const type = e.target.dataset.type;
                const index = parseInt(e.target.dataset.index);
                const property = e.target.dataset.property;
                console.log('DEBUG: Calling updateFeature with', type, index, property, e.target.value);
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
     * Overrides parent method to load data for both RWs and CMGs.
     * @param {object} spacecraftData - The main data object.
     */
    loadFromData(spacecraftData) {
        console.log('DEBUG: loadFromData called - spacecraftData.cmg:', JSON.stringify(spacecraftData.cmg));
        
        // Load Reaction Wheels - direct assignment to maintain reference
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

        // Load CMGs - direct assignment to maintain reference
        console.log('DEBUG: Loading CMGs from spacecraftData:', JSON.stringify(spacecraftData.cmg));
        if (spacecraftData.cmg && spacecraftData.cmg.cmgs) {
            // Direct reference assignment - same as reaction wheels
            console.log('DEBUG: Assigning spacecraftData.cmg.cmgs directly to this.cmgs');
            this.cmgs = spacecraftData.cmg.cmgs;
            console.log('DEBUG: Copied cmgs to this.cmgs:', JSON.stringify(this.cmgs));
            if (this.cmgs.length > 0) {
                this.cmgIdCounter = Math.max(...this.cmgs.map(f => f.id || 0)) + 1;
            }
        } else {
            // No CMG data - initialize empty
            console.log('DEBUG: No CMG data found, initializing empty array');
            this.cmgs = [];
        }
        console.log('DEBUG: Finished loading CMGs, this.cmgs length:', this.cmgs.length);
        
        this.updateFeaturesList();
    }

    /**
     * Clears all features and visuals from the scene and data.
     */
    clearFeatures() {
        console.log('DEBUG: clearFeatures called - will clear arrays in place');
        // Remove RW visuals
        this.rwVisuals.forEach(visual => this.scene.remove(visual.arrow));
        this.rwVisuals = [];
        
        // Clear RW array in place (don't replace with new array)
        this.reactionWheels.length = 0;
        
        // Remove CMG visuals
        this.cmgVisuals.forEach(visual => this.scene.remove(visual.arrow));
        this.cmgVisuals = [];
        
        // Clear CMG array in place (don't replace with new array!)
        this.cmgs.length = 0;

        this.updateSpacecraftData();
    }
}
