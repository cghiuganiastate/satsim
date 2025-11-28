// model-tab.js
import * as THREE from 'three';
import { FeatureManager } from './featureManager.js';

export class ModelTab extends FeatureManager {
    constructor(scene, model, spacecraftData) {
        // We still extend FeatureManager for the basic structure, but will override key methods
        super(scene, spacecraftData, 'model-features', 'Model', 'model.features');
        this.model = model;

        // Store the initial state of the model
        this.initialPosition = new THREE.Vector3();
        this.initialQuaternion = new THREE.Quaternion();
        
        // Setup event listeners for this tab
        this.setupEventListeners();
    }
    
    setModel(model) {
        this.model = model;
        if (model) {
            // Store the initial state of the newly loaded model
            this.initialPosition.copy(model.position);
            this.initialQuaternion.copy(model.quaternion);
        } else {
            this.initialPosition.set(0,0,0);
            this.initialQuaternion.identity();
        }
        
        // REMOVED: this.features = [];
        // We no longer clear the features when a new model is loaded.
        // This allows existing transformations to be applied to the new model.
        
        this.updateSpacecraftData();
        this.updateFeaturesList();
    }
    
    setupEventListeners() {
        // Add rotation button
        document.getElementById('add-rotation').addEventListener('click', () => {
            this.addRotation();
        });
        
        // Add translation button
        document.getElementById('add-translation').addEventListener('click', () => {
            this.addTranslation();
        });
    }
    
    addRotation() {
        const featureId = this.featureIdCounter++;
        const feature = {
            id: featureId,
            type: 'rotation',
            axis: { x: 0, y: 0, z: 1 }, // Default to Z-axis
            angle: 0
        };
        
        this.features.push(feature);
        this.updateSpacecraftData(); // This now applies and saves
        this.updateFeaturesList();
    }

    addTranslation() {
        const featureId = this.featureIdCounter++;
        const feature = {
            id: featureId,
            type: 'translation',
            vector: { x: 0, y: 0, z: 0 }
        };
        
        this.features.push(feature);
        this.updateSpacecraftData(); // This now applies and saves
        this.updateFeaturesList();
    }
    
    // --- CORE TRANSFORMATION LOGIC ---

    updateSpacecraftData() {
        // This method OVERRIDES the parent's version to prevent it from overwriting our data.
        if (!this.model) return;
        
        // 1. Reset the model to its original state
        this.model.position.copy(this.initialPosition);
        this.model.quaternion.copy(this.initialQuaternion);
        
        // 2. Apply each transformation in sequence
        this.features.forEach(feature => {
            if (feature.type === 'rotation') {
                const axis = new THREE.Vector3(feature.axis.x, feature.axis.y, feature.axis.z).normalize();
                const angle = THREE.MathUtils.degToRad(feature.angle);
                const rotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                this.model.quaternion.multiply(rotation);
            } else if (feature.type === 'translation') {
                this.model.position.add(new THREE.Vector3(feature.vector.x, feature.vector.y, feature.vector.z));
            }
        });
        
        // 3. Update the spacecraft data with the COMPLETE state (position, quaternion, AND features)
        this.spacecraftData.model = {
            position: { x: this.model.position.x, y: this.model.position.y, z: this.model.position.z },
            quaternion: { x: this.model.quaternion.x, y: this.model.quaternion.y, z: this.model.quaternion.z, w: this.model.quaternion.w },
            features: this.features
        };
    }
    
    // --- OVERRIDDEN METHODS TO ENSURE CORRECT BEHAVIOR ---

    // Override deleteFeature to re-apply transformations after deletion
    deleteFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        this.features.splice(index, 1);
        this.updateSpacecraftData(); // This now applies and saves
        this.updateFeaturesList();   // Refresh the UI
    }

    // Override copyFeature to use the new updateSpacecraftData
    copyFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        const originalFeature = this.features[index];
        const newFeatureId = this.featureIdCounter++;
        
        const newFeature = JSON.parse(JSON.stringify(originalFeature));
        newFeature.id = newFeatureId;
        
        this.features.push(newFeature);
        this.updateSpacecraftData(); // This now applies and saves
        this.updateFeaturesList();
    }

    // Simplify updateFeature
    updateFeature(index, property, value) {
        if (index < 0 || index >= this.features.length) return;
        
        const feature = this.features[index];
        const numValue = parseFloat(value);
        
        if (property.startsWith('axis.')) {
            const axis = property.split('.')[1];
            feature.axis[axis] = numValue;
        } else if (property.startsWith('vector.')) {
            const vector = property.split('.')[1];
            feature.vector[vector] = numValue;
        } else {
            feature[property] = isNaN(numValue) ? value : numValue;
        }
        
        // After updating the data, re-apply all transformations and save
        this.updateSpacecraftData();
    }
    
    updateFeaturesList() {
        const featuresContainer = document.getElementById(this.containerId);
        featuresContainer.innerHTML = '';
        
        this.features.forEach((feature, index) => {
            const featureElement = document.createElement('div');
            featureElement.className = 'feature-item';
            
            let controlsHtml = '';
            
            if (feature.type === 'rotation') {
                controlsHtml = `
                    <div class="feature-controls">
                        <div class="control-group">
                            <label>Axis X:</label>
                            <input type="number" value="${feature.axis.x}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'axis.x', this.value)">
                        </div>
                        <div class="control-group">
                            <label>Axis Y:</label>
                            <input type="number" value="${feature.axis.y}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'axis.y', this.value)">
                        </div>
                        <div class="control-group">
                            <label>Axis Z:</label>
                            <input type="number" value="${feature.axis.z}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'axis.z', this.value)">
                        </div>
                        <div class="control-group">
                            <label>Angle (deg):</label>
                            <input type="number" value="${feature.angle}" step="1" 
                                oninput="modelTab.updateFeature(${index}, 'angle', this.value)">
                        </div>
                    </div>
                `;
            } else if (feature.type === 'translation') {
                controlsHtml = `
                    <div class="feature-controls">
                        <div class="control-group">
                            <label>X:</label>
                            <input type="number" value="${feature.vector.x}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'vector.x', this.value)">
                        </div>
                        <div class="control-group">
                            <label>Y:</label>
                            <input type="number" value="${feature.vector.y}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'vector.y', this.value)">
                        </div>
                        <div class="control-group">
                            <label>Z:</label>
                            <input type="number" value="${feature.vector.z}" step="0.1" 
                                oninput="modelTab.updateFeature(${index}, 'vector.z', this.value)">
                        </div>
                    </div>
                `;
            }
            
            featureElement.innerHTML = `
                <div class="feature-header">
                    <h4>${feature.type.charAt(0).toUpperCase() + feature.type.slice(1)}</h4>
                    <div class="feature-actions">
                        <button class="copy-btn" onclick="modelTab.copyFeature(${index})">Copy</button>
                        <button class="delete-btn" onclick="modelTab.deleteFeature(${index})">Delete</button>
                    </div>
                </div>
                ${controlsHtml}
            `;
            
            featuresContainer.appendChild(featureElement);
        });
        
        window.modelTab = this;
    }

    loadFromData(spacecraftData) {
        if (spacecraftData.model && spacecraftData.model.features) {
            this.features = spacecraftData.model.features;
            if (this.features.length > 0) {
                this.featureIdCounter = Math.max(...this.features.map(f => f.id || 0)) + 1;
            }
            this.updateSpacecraftData();
            this.updateFeaturesList();
        }
    }
}