// File: hudUpdater.js

/**
 * Updates the Heads-Up Display with satellite telemetry data.
 * @param {object} satBody - The satellite's physics body with position, velocity, etc.
 * @param {HTMLElement} hudElement - The DOM element to update with the HUD information.
 * @param {boolean} isPaused - The current simulation state (paused or running).
 */
import * as THREE from 'three';
export function updateHUD(satBody, hudElement, isPaused) {
  // Ensure THREE.js is available in the scope where this is called
  const p = satBody.position, v = satBody.velocity, av = satBody.angularVelocity;
  const q = satBody.quaternion;
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
  const rpy = {
    roll: THREE.MathUtils.radToDeg(euler.z),
    pitch: THREE.MathUtils.radToDeg(euler.x),
    yaw: THREE.MathUtils.radToDeg(euler.y)
  };
  
  hudElement.innerHTML = `
    <strong>Position</strong><br>X: ${p.x.toFixed(2)} Y: ${p.y.toFixed(2)} Z: ${p.z.toFixed(2)}<br><br>
    <strong>Velocity</strong><br>X: ${v.x.toFixed(2)} Y: ${v.y.toFixed(2)} Z: ${v.z.toFixed(2)}<br><br>
    <strong>Angular Vel</strong><br>X: ${av.x.toFixed(2)} Y: ${av.y.toFixed(2)} Z: ${av.z.toFixed(2)}<br><br>
    <strong>Attitude (RPY)</strong><br>
    Roll: ${rpy.roll.toFixed(1)}° Pitch: ${rpy.pitch.toFixed(1)}° Yaw: ${rpy.yaw.toFixed(1)}°<br><br>
    <strong>Status</strong><br>${isPaused ? 'PAUSED' : 'RUNNING'}
  `;
}