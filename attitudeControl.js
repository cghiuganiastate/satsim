// attitudeControl.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Attitude control system manager
class AttitudeControlSystem {
    constructor(satBody, scene) {
        this.satBody = satBody;
        this.scene = scene;
        this.mode = 'thrusters'; // 'thrusters', 'reactionwheels', or 'cmgs'
        this.reactionWheels = [];
        this.cmgs = [];
        this.loaded = false;
        this.desaturationActive = false;
    }

    // Dummy method to maintain compatibility with existing code
    setSatelliteMesh(satMesh) {
        // No visualization code needed since we've removed all visuals
    }

    async initialize() {
        try {
            await this.loadReactionWheels();
            console.log('Reaction wheels loaded successfully');
        } catch (error) {
            console.warn('Failed to load reaction wheels:', error);
        }

        try {
            await this.loadCMGs();
            console.log('CMGs loaded successfully');
        } catch (error) {
            console.warn('Failed to load CMGs:', error);
        }

        this.loaded = this.reactionWheels.length > 0 || this.cmgs.length > 0;
        return this.loaded;
    }

    async loadReactionWheels() {
        const response = await fetch('reactionwheels.json');
        if (!response.ok) throw new Error('Reaction wheels file not found');
        
        const data = await response.json();
        
        data.wheels.forEach((wheelConfig, index) => {
            const rawOrientation = new CANNON.Vec3(
                wheelConfig.orientation.x ?? 0,
                wheelConfig.orientation.y ?? 0,
                wheelConfig.orientation.z ?? 1
            );
            const normalizedOrientation = rawOrientation.unit();

            const wheel = {
                index: index,
                name: wheelConfig.name || `RW${index}`,
                orientation: normalizedOrientation,
                position: new CANNON.Vec3(
                    wheelConfig.position.x ?? 0,
                    wheelConfig.position.y ?? 0,
                    wheelConfig.position.z ?? 0
                ),
                maxAngularMomentum: wheelConfig.maxAngularMomentum ?? 10,
                maxTorque: wheelConfig.maxTorque ?? 0.5,
                currentAngularMomentum: 0
            };
            
            this.reactionWheels.push(wheel);
        });
    }

    async loadCMGs() {
        const response = await fetch('cmg.json');
        if (!response.ok) throw new Error('CMG file not found');
        
        const data = await response.json();
        
        data.cmgs.forEach((cmgConfig, index) => {
            const cmg = {
                index: index,
                name: cmgConfig.name || `CMG${index}`,
                gimbalOrientation: new CANNON.Vec3(
                    cmgConfig.gimbalOrientation.x ?? 0,
                    cmgConfig.gimbalOrientation.y ?? 0,
                    cmgConfig.gimbalOrientation.z ?? 1
                ).unit(),
                wheelOrientation: new CANNON.Vec3(
                    cmgConfig.wheelOrientation.x ?? 0,
                    cmgConfig.wheelOrientation.y ?? 0,
                    cmgConfig.wheelOrientation.z ?? 1
                ).unit(),
                position: new CANNON.Vec3(
                    cmgConfig.position.x ?? 0,
                    cmgConfig.position.y ?? 0,
                    cmgConfig.position.z ?? 0
                ),
                maxAngularMomentum: cmgConfig.maxAngularMomentum ?? 50,
                maxTorque: cmgConfig.maxTorque ?? 2,
                currentAngularMomentum: (cmgConfig.maxAngularMomentum ?? 50) * 0.8,
                gimbalAngle: 0,
                gimbalAngularVelocity: 0,
                maxGimbalRate: 1.5
            };
            
            this.cmgs.push(cmg);
        });
    }

    toggleMode() {
        if (!this.loaded) {
            console.warn('No attitude control systems loaded');
            return 'thrusters';
        }
        
        if (this.mode === 'thrusters') {
            this.mode = 'reactionwheels';
        } else if (this.mode === 'reactionwheels' && this.cmgs.length > 0) {
            this.mode = 'cmgs';
        } else {
            this.mode = 'thrusters';
        }
        
        return this.mode;
    }

    applyControlTorque(torque) {
        if (this.mode === 'reactionwheels') {
            this.applyReactionWheelControl(torque);
        } else if (this.mode === 'cmgs') {
            this.applyCMGControl(torque);
        }
    }

    applyReactionWheelControl(torque) {
        // Apply torque using reaction wheels
        this.reactionWheels.forEach(wheel => {
            const wheelAxis = wheel.orientation;
            const requestedTorqueAlongWheel = wheelAxis.dot(torque);

            // Determine how much torque the wheel can actually apply before saturating
            let actualTorqueApplied = 0;
            const dt = 1/60; // Time step

            if (requestedTorqueAlongWheel > 0) {
                // Requesting positive torque, check against max momentum
                const momentumCapacity = wheel.maxAngularMomentum - wheel.currentAngularMomentum;
                const maxPossibleTorque = momentumCapacity / dt;
                actualTorqueApplied = Math.min(requestedTorqueAlongWheel, maxPossibleTorque);
            } else if (requestedTorqueAlongWheel < 0) {
                // Requesting negative torque, check against min momentum
                const momentumCapacity = wheel.currentAngularMomentum - (-wheel.maxAngularMomentum);
                const maxPossibleTorque = momentumCapacity / dt;
                actualTorqueApplied = Math.max(requestedTorqueAlongWheel, -maxPossibleTorque);
            }

            // Update the wheel's angular momentum based on the ACTUAL torque applied
            const deltaMomentum = actualTorqueApplied * dt;
            wheel.currentAngularMomentum += deltaMomentum;
            
            // Apply reaction torque to the satellite (opposite to the ACTUAL torque applied to the wheel)
            const reactionTorque = wheelAxis.scale(-actualTorqueApplied);

            // Convert local torque to world coordinates correctly
            const worldTorque = new CANNON.Vec3();
            this.satBody.quaternion.vmult(reactionTorque, worldTorque);
            this.satBody.applyTorque(worldTorque);
        });
    }

    applyCMGControl(torque) {
        const dt = 1/60; // Physics timestep
        const desiredLocalTorque = torque;

        // --- 1. Control Allocation: Calculate required gimbal rates ---
        // CMG-1 controls X-axis torque
        const cmg1 = this.cmgs.find(c => c.name === 'CMG-1');
        if (cmg1 && cmg1.currentAngularMomentum > 0.1) {
            cmg1.gimbalAngularVelocity = -desiredLocalTorque.x / cmg1.currentAngularMomentum;
        } else if (cmg1) {
            cmg1.gimbalAngularVelocity = 0;
        }

        // CMG-2 controls Y-axis torque
        const cmg2 = this.cmgs.find(c => c.name === 'CMG-2');
        if (cmg2 && cmg2.currentAngularMomentum > 0.1) {
            cmg2.gimbalAngularVelocity = -desiredLocalTorque.y / cmg2.currentAngularMomentum;
        } else if (cmg2) {
            cmg2.gimbalAngularVelocity = 0;
        }

        // CMG-3 controls Z-axis torque
        const cmg3 = this.cmgs.find(c => c.name === 'CMG-3');
        if (cmg3 && cmg3.currentAngularMomentum > 0.1) {
            cmg3.gimbalAngularVelocity = -desiredLocalTorque.z / cmg3.currentAngularMomentum;
        } else if (cmg3) {
            cmg3.gimbalAngularVelocity = 0;
        }
        
        // For simple inputs, command the skew CMG (CMG-4) to a neutral angle (zero rate)
        const cmg4 = this.cmgs.find(c => c.name === 'CMG-4');
        if (cmg4) {
            cmg4.gimbalAngularVelocity = 0;
        }

        // --- 2. Update CMG State: Integrate gimbal rates to get new angles ---
        this.cmgs.forEach(cmg => {
            // Clamp the gimbal velocity to its maximum physical speed
            cmg.gimbalAngularVelocity = Math.max(-cmg.maxGimbalRate, Math.min(cmg.maxGimbalRate, cmg.gimbalAngularVelocity));
            
            // Update the angle based on the velocity
            cmg.gimbalAngle += cmg.gimbalAngularVelocity * dt;
        });

        // --- 3. Torque Application: Calculate the actual torque from the new gimbal rates ---
        let totalOutputTorqueLocal = new CANNON.Vec3(0, 0, 0);

        this.cmgs.forEach(cmg => {
            const wheelAxis = cmg.wheelOrientation;
            const gimbalAxis = wheelAxis.cross(cmg.gimbalOrientation).unit();
            
            // The momentum change rate (ḣ) is the key. This is what produces the torque.
            const h_dot = gimbalAxis.scale(cmg.gimbalAngularVelocity).cross(wheelAxis.scale(cmg.currentAngularMomentum));
            
            // Sum the momentum change rate from each CMG
            totalOutputTorqueLocal.vadd(h_dot, totalOutputTorqueLocal);
        });

        // The torque on the satellite body is the negative of the total momentum change rate
        totalOutputTorqueLocal.scale(1, totalOutputTorqueLocal);
        
        // Convert the total local torque to world coordinates and apply it
        const worldTorque = new CANNON.Vec3();
        this.satBody.quaternion.vmult(totalOutputTorqueLocal, worldTorque);
        this.satBody.applyTorque(worldTorque);
    }

    desaturateWithThrusters(thrusters, keyToThrusterIndices) {
        if (this.mode === 'reactionwheels') {
            this.desaturationActive = true;
            
            let totalMomentum = new CANNON.Vec3(0, 0, 0);
            this.reactionWheels.forEach(wheel => {
                const momentum = wheel.orientation.scale(wheel.currentAngularMomentum);
                totalMomentum.vadd(momentum, totalMomentum);
            });
            
            if (totalMomentum.length() > 0.1) {
                const thrustDirection = totalMomentum.unit().scale(-1);
                
                thrusters.forEach((thruster, index) => {
                    const torqueDirection = thruster.pos.cross(thruster.dir);
                    const alignment = torqueDirection.dot(thrustDirection);
                    
                    if (alignment > 0.5) {
                        const force = thruster.dir.scale(thruster.thrust * 0.5);
                        this.satBody.applyLocalForce(force, thruster.pos);
                        
                        this.reactionWheels.forEach(wheel => {
                            const reduction = wheel.orientation.scale(alignment * 0.01);
                            const newMomentum = wheel.currentAngularMomentum - reduction.length();
                            wheel.currentAngularMomentum = Math.max(
                                -wheel.maxAngularMomentum,
                                Math.min(wheel.maxAngularMomentum, newMomentum)
                            );
                        });
                    }
                });
            }
            
            let maxMomentum = 0;
            this.reactionWheels.forEach(wheel => {
                maxMomentum = Math.max(maxMomentum, Math.abs(wheel.currentAngularMomentum));
            });
            
            if (maxMomentum < 0.5) {
                this.desaturationActive = false;
            }
        } else if (this.mode === 'cmgs') {
            this.desaturationActive = true;
            
            let nearSingularity = false;
            this.cmgs.forEach(cmg => {
                if (Math.abs(Math.sin(cmg.gimbalAngle)) > 0.95) {
                    nearSingularity = true;
                }
            });
            
            if (nearSingularity) {
                thrusters.forEach((thruster, index) => {
                    if (index % 3 === 0) {
                        const force = thruster.dir.scale(thruster.thrust * 0.2);
                        this.satBody.applyLocalForce(force, thruster.pos);
                    }
                });
                
                this.cmgs.forEach(cmg => {
                    if (Math.abs(Math.sin(cmg.gimbalAngle)) > 0.95) {
                        cmg.gimbalAngle += 0.1;
                    }
                });
            }
            
            let stillNearSingularity = false;
            this.cmgs.forEach(cmg => {
                if (Math.abs(Math.sin(cmg.gimbalAngle)) > 0.95) {
                    stillNearSingularity = true;
                }
            });
            
            if (!stillNearSingularity) {
                this.desaturationActive = false;
            }
        }
    }

    getStatus() {
        const status = {
            mode: this.mode,
            loaded: this.loaded,
            desaturationActive: this.desaturationActive
        };
        
        if (this.mode === 'reactionwheels' && this.reactionWheels.length > 0) {
            status.reactionWheels = this.reactionWheels.map(wheel => ({
                name: wheel.name,
                momentum: wheel.currentAngularMomentum,
                maxMomentum: wheel.maxAngularMomentum,
                percentage: (wheel.currentAngularMomentum / wheel.maxAngularMomentum * 100).toFixed(1)
            }));
        } else if (this.mode === 'cmgs' && this.cmgs.length > 0) {
            status.cmgs = this.cmgs.map(cmg => ({
                name: cmg.name,
                momentum: cmg.currentAngularMomentum,
                maxMomentum: cmg.maxAngularMomentum,
                gimbalAngle: (cmg.gimbalAngle * 180 / Math.PI).toFixed(1),
                nearSingularity: Math.abs(Math.sin(cmg.gimbalAngle)) > 0.95
            }));
        }
        
        return status;
    }
}

export { AttitudeControlSystem };