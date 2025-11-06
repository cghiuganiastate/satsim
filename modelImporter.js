/**
 * Import a model into the convex hull generator
 * @param {string} modelPath - Path to the GLB/GLTF model file
 * @param {THREE.Scene} scene - Three.js scene to add the model to
 * @param {function} callback - Callback function called when model is loaded
 * @param {function} errorCallback - Callback function called if there's an error
 */
export function importModel(modelPath, scene, callback, errorCallback) {
    import('three').then(THREE => {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
            const loader = new GLTFLoader();
            
            loader.load(modelPath, gltf => {
                const model = gltf.scene;
                model.scale.set(1, 1, 1);
                
                // Apply the same rotations as in the original code
                let rot1 = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(1, 0, 0), 
                    Math.PI/180*-25
                );
                model.quaternion.multiply(rot1);
                
                let rot2 = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0), 
                    Math.PI/180*-10
                );
                model.quaternion.multiply(rot2);
                
                model.position.set(0, 0, 0);
                scene.add(model);
                
                if (callback) callback(model);
            }, undefined, err => {
                console.error('GLTF load error:', err);
                if (errorCallback) errorCallback(err);
            });
        });
    });
}

/**
 * Import a model with custom position and scale
 * @param {string} modelPath - Path to the GLB/GLTF model file
 * @param {THREE.Scene} scene - Three.js scene to add the model to
 * @param {THREE.Vector3} position - Position to place the model
 * @param {THREE.Vector3} scale - Scale of the model
 * @param {function} callback - Callback function called when model is loaded
 * @param {function} errorCallback - Callback function called if there's an error
 */
export function importModelCustom(modelPath, scene, position, scale, callback, errorCallback) {
    import('three').then(THREE => {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
            const loader = new GLTFLoader();
            
            loader.load(modelPath, gltf => {
                const model = gltf.scene;
                model.scale.copy(scale);
                
                // Apply the same rotations as in the original code
                let rot1 = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(1, 0, 0), 
                    Math.PI/180*-25
                );
                model.quaternion.multiply(rot1);
                
                let rot2 = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0), 
                    Math.PI/180*-10
                );
                model.quaternion.multiply(rot2);
                
                model.position.copy(position);
                scene.add(model);
                
                if (callback) callback(model);
            }, undefined, err => {
                console.error('GLTF load error:', err);
                if (errorCallback) errorCallback(err);
            });
        });
    });
}