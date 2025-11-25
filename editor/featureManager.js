//featureManager.js
import * as THREE from 'three';

export class FeatureManager {
    constructor(scene, spacecraftData, containerId, featureType, dataPath) {
        this.scene = scene;
        this.spacecraftData = spacecraftData;
        this.containerId = containerId;
        this.featureType = featureType;
        this.dataPath = dataPath; 
        this.features = [];
        this.featureIdCounter = 0;
        this.visuals = []; 
    }
    
    addFeature() {
        throw new Error('addFeature() must be implemented by subclass');
    }
    
    copyFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        const originalFeature = this.features[index];
        const newFeatureId = this.featureIdCounter++;
        
        // Create a deep copy of the feature
        const newFeature = JSON.parse(JSON.stringify(originalFeature));
        newFeature.id = newFeatureId;
        
        // Update name if applicable
        if (newFeature.name) {
            // Extract number from original name
            const nameMatch = originalFeature.name.match(/(\d+)/);
            const originalNumber = nameMatch ? parseInt(nameMatch[0]) : 0;
            const newNumber = originalNumber + 1;
            newFeature.name = `${this.featureType} ${newNumber}`;
        }
        
        // --- ROBUST FIX FOR KEYBIND ---
        // Clear keybind if applicable, preserving its original type
        if (originalFeature.keybind !== undefined) {
            if (Array.isArray(originalFeature.keybind)) {
                // If it was an array, reset to an empty array
                newFeature.keybind = [];
            } else {
                // Otherwise, assume it's a string or similar primitive and reset to an empty value
                newFeature.keybind = '';
            }
        }
        // --- END OF FIX ---
        
        this.features.push(newFeature);
        
        // Create visual if applicable
        if (this.createVisual) {
            const visual = this.createVisual(newFeature);
            this.visuals.push(visual);
            this.scene.add(visual.group || visual);
        }
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        this.updateFeaturesList();
    }
    
    deleteFeature(index) {
        if (index < 0 || index >= this.features.length) return;
        
        // Remove visual if applicable
        if (this.visuals[index]) {
            const visual = this.visuals[index];
            if (visual.group) {
                this.scene.remove(visual.group);
            } else {
                this.scene.remove(visual);
            }
        }
        
        // Get the ID of the feature being deleted
        const deletedId = this.features[index].id;
        
        // Remove from features array
        this.features.splice(index, 1);
        
        // Remove from visuals array
        this.visuals.splice(index, 1);
        
        // Remove from spacecraft data by filtering out the deleted ID
        this.updateSpacecraftData();
        
        this.updateFeaturesList();
    }
    

    updateFeature(index, property, value) {
        if (index < 0 || index >= this.features.length) return;
        
        const feature = this.features[index];
        if (!feature) return;
        
        // Update the property
        if (property.includes('.')) {
            const [parent, child] = property.split('.');
            const childIndex = parseInt(child);
            feature[parent][childIndex] = parseFloat(value);
        } else {
            feature[property] = property === 'name' || property === 'keybind' || property === 'type' ? value : parseFloat(value);
        }
        
        // Update visual if applicable
        if (this.updateVisual && (property.startsWith('position') || property.startsWith('direction'))) {
            this.updateVisual(index, feature);
        }
        
        // Update spacecraft data
        this.updateSpacecraftData();
        
        // Refresh UI if needed
        if (this.shouldRefreshUI && this.shouldRefreshUI(property, feature)) {
            this.updateFeaturesList();
        }
    }
    
    updateSpacecraftData() {
        const pathParts = this.dataPath.split('.');
        let current = this.spacecraftData;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
            current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = this.features;
    }
    

    loadFromData(spacecraftData) {
        this.clearFeatures();
        
        const pathParts = this.dataPath.split('.');
        let current = spacecraftData;
        
        for (let i = 0; i < pathParts.length; i++) {
            current = current[pathParts[i]];
        }
        if (current && Array.isArray(current)) {
            this.features = current;
            if (this.features.length > 0) {
                this.featureIdCounter = Math.max(...this.features.map(f => f.id || 0)) + 1;
            }
            if (this.createVisual) {
                this.features.forEach(feature => {
                    const visual = this.createVisual(feature);
                    this.visuals.push(visual);
                    this.scene.add(visual.group || visual);
                });
            }
            
            this.updateFeaturesList();
        }
    }

    clearFeatures() {
        this.visuals.forEach(visual => {
            if (visual.group) {
                this.scene.remove(visual.group);
            } else {
                this.scene.remove(visual);
            }
        });
        this.features = [];
        this.visuals = [];
    }
    
    /**
     * Update the UI with the current features
     * Subclasses should override this method
     */
    updateFeaturesList() {
        throw new Error('updateFeaturesList() must be implemented by subclass');
    }
    
    /**
     * Create a visual representation for a feature
     * Subclasses should override this method if needed
     * @param {object} feature - Feature data
     * @returns {object} Visual representation
     */
    createVisual(feature) {
        // Default implementation returns null (no visual)
        return null;
    }
    
    /**
     * Update a visual representation for a feature
     * Subclasses should override this method if needed
     * @param {number} index - Index of the feature
     * @param {object} feature - Updated feature data
     */
    updateVisual(index, feature) {
        // Default implementation does nothing
    }
    
    /**
     * Determine if UI should be refreshed after a property update
     * Subclasses should override this method if needed
     * @param {string} property - Property name that was updated
     * @param {object} feature - Feature that was updated
     * @returns {boolean} Whether UI should be refreshed
     */
    shouldRefreshUI(property, feature) {
        // Default implementation returns false
        return false;
    }
}