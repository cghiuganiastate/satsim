import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CameraSystem } from './CameraSystem.js';
import initializeThrusters, { initializeThrustersWithConfig } from './thrusterSetup.js';
import { 
  initializeUI,
  updateUI,
  toggleUIVisibility,
  updateUIText
} from './hudUpdater.js';
import { loadConvexHulls, toggleHullVisibility } from './hullManager.js';
import { 
  loadSpacecraft, 
  toggleSpacecraftBoundingBoxVisibility, 
  getSpacecraftBody, 
  getSpacecraftMesh, 
  updateSpacecraft,
  updateSatelliteMass,
  consumeFuel,
  getFuelStatus,
  resetFuel,
  setFuelProperties
} from './spacecraftManager.js';
import { AttitudeControlSystem } from './attitudeControl.js';
import { LampManager } from './lampManager.js';
import { StudentController } from './controller.js';
import { createThrusterVisual, setThrusterEffectActive, updateThrusterEffects } from './thrusterEffects.js';
// Extracted modules
import { getConfiguration, getSpacecraftModel } from './configLoader.js';
import { loadSpaceStation, setupLighting, addEyeChart } from './environmentSetup.js';
import { DockingManager } from './dockingManager.js';
import { MissionClock } from './missionClock.js';
import { SoundManager } from './soundManager.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Wait for the startSimulation event before initializing
window.addEventListener('startSimulation', () => {
  initSimulation();
});

function initSimulation() {
  const DEFAULT_MODEL_PATH = 'navion.stl';
  const CONVEX_HULLS_PATH = 'convex-hulls.json';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000011);
  const skyboxLoader = new THREE.CubeTextureLoader();
  const skybox = skyboxLoader.load([
    'right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'
  ]);
  scene.background = skybox;

  const renderer = new THREE.WebGLRenderer({ antialias: true, shadowMap: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft, smoother shadows
  renderer.outputColorSpace = THREE.SRGBColorSpace; // Better color output
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('simulation-container').appendChild(renderer.domElement);

  const world = new CANNON.World();
  world.gravity.set(0, 0, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;

  let satBody;
  let satMesh;
  let camSys;
  let attitudeControl;
  let studentController;
  let lampManager;
  let station;
  let dockingManager;
  let missionClock;
  let soundManager;
  let composer; // EffectComposer used for SSAO ambient occlusion
  let defaultProperties = null;
  
  // Timer for debug output
  let lastInertiaDebugTime = 0;
  const INERTIA_DEBUG_INTERVAL = 10000; // 10 seconds in milliseconds
  
  let showDistanceInfo = false;
  let raycaster = new THREE.Raycaster();
  let maxDistance = 100;
  
  let fineControlMode = false;
  let fineControlKeys = {};
  let fineControlProcessedKeys = {};
  let fineControlKeyStartTimes = {};
  let timedFiringEnabled = false;
  let firingDuration = 5.0;
  let torquePercentage = 50; // Percentage of max torque to use (1-100)
  
  let initialPosition = new CANNON.Vec3(0, -3, 5.5);
  let initialOrientation = new CANNON.Quaternion();
  initialOrientation.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI/2);
  let initialOrientationThree = new THREE.Quaternion();
  initialOrientationThree.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2);
  let isDocked = true; // Start docked
  let canDock = false;
  let hasLeftDockingBoxOnce = false;
  
  let DOCKING_BOX_SIZE = 0.1;
  let DOCKING_ANGLE_THRESHOLD = 3;

  window.scene = scene;
  window.world = world;
  window.renderer = renderer;

  // Sub-systems that were previously inline. Own their own state.
  dockingManager = new DockingManager({ scene, world });
  missionClock = new MissionClock();
  soundManager = new SoundManager();

  async function initializeDefaultSpacecraft() {
    const config = await getConfiguration();
    const modelData = await getSpacecraftModel();
    const modelFile = modelData.file;
    
    // Use centroiding only for default model, not for uploaded models
    const centroidModel = modelData.isDefault;
    
    // DEBUG: Log the loaded configuration
    console.log("DEBUG: Configuration loaded:", config);

    // Load initial position/orientation from uploaded file if available
    if (window.uploadedFiles && window.uploadedFiles.initialPosition) {
      const posData = window.uploadedFiles.initialPosition;
      initialPosition = new CANNON.Vec3(posData.position.x, posData.position.y, posData.position.z);
      initialOrientation = new CANNON.Quaternion(posData.orientation.x, posData.orientation.y, posData.orientation.z, posData.orientation.w);
      initialOrientationThree = new THREE.Quaternion(posData.orientation.x, posData.orientation.y, posData.orientation.z, posData.orientation.w);
      
      // Load docking parameters if available in the file
      if (posData.dockingBoxSize !== undefined) {
        DOCKING_BOX_SIZE = posData.dockingBoxSize;
        console.log("Using imported docking box size:", DOCKING_BOX_SIZE);
      }
      if (posData.dockingAngleThreshold !== undefined) {
        DOCKING_ANGLE_THRESHOLD = posData.dockingAngleThreshold;
        console.log("Using imported docking angle threshold:", DOCKING_ANGLE_THRESHOLD);
      }
      
      console.log("Using imported initial position/orientation:", posData);
    } else {
      console.log("Using default initial position/orientation");
    }

    const rotation = { x: 0, y: 0, z: 0 };

    loadSpacecraft(modelFile, scene, world, rotation, centroidModel, config.spacecraftProperties, (body, mesh) => {
      satBody = body;
      satMesh = mesh;
      
      // DEBUG: Log the inertia of the body immediately after it's returned
      console.log("DEBUG: Inertia on returned satBody:", {
        x: satBody.inertia.x,
        y: satBody.inertia.y,
        z: satBody.inertia.z
      });
      
      // Get centerOfMass offset from the body
      const centerOfMassOffset = satBody.centerOfMassOffset || {x: 0, y: 0, z: 0};
      console.log("DEBUG: Center of mass offset:", centerOfMassOffset);
      
      window.satBody = satBody;
      window.satMesh = satMesh;
      
      satBody.position.copy(initialPosition);
      satBody.quaternion.copy(initialOrientation);
      satMesh.position.copy(initialPosition);
      satMesh.quaternion.copy(initialOrientation);
      
      // Store centerOfMass in spacecraft mesh for cameras to access
      satMesh.userData.centerOfMassOffset = centerOfMassOffset;
      
      // Ensure velocity and angular velocity are zero at start
      satBody.velocity.set(0, 0, 0);
      satBody.angularVelocity.set(0, 0, 0);

      // Play a collision sound whenever the spacecraft physically hits
      // something (docking port, second spacecraft, hulls). The impact
      // velocity along the contact normal drives the volume/brightness so a
      // gentle tap is quiet and a hard slam is loud.
      satBody.addEventListener('collide', (e) => {
        if (!soundManager) return;
        // cannon-es exposes the contact on the event; getImpactVelocityAlongNormal()
        // returns the closing speed (m/s) along the collision normal. Very small
        // values come from resting/sliding contacts and are ignored.
        const contact = e.contact;
        const impactSpeed = contact && contact.getImpactVelocityAlongNormal
          ? Math.abs(contact.getImpactVelocityAlongNormal())
          : 0;
        // Below this closing speed we treat it as a graze, not a hit.
        const COLLISION_THRESHOLD = 0.05; // m/s
        if (impactSpeed <= COLLISION_THRESHOLD) return;
        // Map closing speed to a 0..1 intensity (saturates around 2 m/s).
        const intensity = Math.min(1, impactSpeed / 2);
        soundManager.playCollision(intensity);
      });

      camSys = new CameraSystem(renderer, satMesh);
      window.camSys = camSys;
      
      attitudeControl = new AttitudeControlSystem(satBody, scene);
      attitudeControl.setSatelliteMesh(satMesh);
      attitudeControl.setCenterOfMassOffset(centerOfMassOffset);
      studentController = new StudentController({ satBody });
      
      lampManager = new LampManager(scene, satMesh);
      lampManager.setCenterOfMassOffset(centerOfMassOffset);

      // Give the docking manager the fallback pose/tolerances, then load port + SC2.
      dockingManager.setInitialState({
        position: initialPosition,
        orientationThree: initialOrientationThree,
        dockingBoxSize: DOCKING_BOX_SIZE,
        dockingAngleThreshold: DOCKING_ANGLE_THRESHOLD
      });

      // Load docking port
      dockingManager.loadDockingPort();

      // Register the primary docking zone (original docking port location)
      dockingManager.registerDockingZone({
        position: new CANNON.Vec3(initialPosition.x, initialPosition.y, initialPosition.z),
        orientation: initialOrientationThree,
        dockingBoxSize: DOCKING_BOX_SIZE,
        dockingAngleThreshold: DOCKING_ANGLE_THRESHOLD,
        name: 'primary'
      });

      // Load the second (static) spacecraft + its docking port
      dockingManager.loadSecondSpacecraft();

      main(config);
    });
  }

  // Static environment (space station, lights, eye chart) now lives in environmentSetup.js
  station = loadSpaceStation(scene);
  setupLighting(scene);
  addEyeChart(scene);

  let thrusters = [];
  const keyToThrusterIndices = { w:[],s:[],a:[],d:[],q:[],e:[],i:[],k:[],j:[],l:[],u:[],o:[] };
  const userDisabledThrusterIndices = new Set();
  let highlightedThrusterIndex = null;

  window.thrusters = thrusters;
  window.keyToThrusterIndices = keyToThrusterIndices;

  // createThrusterVisual() now lives in thrusterEffects.js (imported above).
  // Kept on window so modelControls.js can still reach it for live reloads.
  window.createThrusterVisual = createThrusterVisual;

  function getThrusterBaseEmissive(thruster) {
    return thruster?.active ? 0xff5500 : 0x000000;
  }

  function setThrusterEmissive(thruster, color) {
    if (thruster?.material?.emissive) thruster.material.emissive.setHex(color);
  }

  function isSpecialDisabledThruster(index) {
    return specialThrusterModeTriggered && index === disabledThrusterIndex;
  }

  function isThrusterDisabled(index) {
    return userDisabledThrusterIndices.has(index) || isSpecialDisabledThruster(index);
  }

  function setThrusterActive(thruster, active) {
    if (!thruster) return;
    const wasActive = thruster.active;
    thruster.active = !!active;
    // Visual effects (ignition smoke puff + plume fade) live in thrusterEffects.js
    setThrusterEffectActive(thruster, wasActive, !!active);
    // Audio: startup transient on ignition + continuous roar while active.
    if (soundManager) soundManager.setThrusterActive(thruster, wasActive, !!active);
    if (thruster.index !== highlightedThrusterIndex) {
      setThrusterEmissive(thruster, getThrusterBaseEmissive(thruster));
    }
  }

  function highlightThruster(index) {
    if (highlightedThrusterIndex !== null && highlightedThrusterIndex !== index) {
      unhighlightThruster(highlightedThrusterIndex);
    }
    const thruster = thrusters[index];
    if (!thruster) return;
    highlightedThrusterIndex = index;
    setThrusterEmissive(thruster, 0xffff00);
  }

  function unhighlightThruster(index) {
    const thruster = thrusters[index];
    if (thruster) setThrusterEmissive(thruster, getThrusterBaseEmissive(thruster));
    if (highlightedThrusterIndex === index) highlightedThrusterIndex = null;
  }

  function updateThrusterMenuSpecialStates() {
    thrusters.forEach((thruster, index) => {
      const checkbox = document.getElementById(`thruster-enabled-${index}`);
      const row = document.getElementById(`thruster-menu-row-${index}`);
      if (!checkbox || !row) return;
      const specialDisabled = isSpecialDisabledThruster(index);
      checkbox.disabled = specialDisabled;
      if (specialDisabled) {
        checkbox.checked = false;
        setThrusterActive(thruster, false);
      } else {
        checkbox.checked = !userDisabledThrusterIndices.has(index);
      }
      row.classList.toggle('special-disabled', specialDisabled);
      row.title = specialDisabled ? 'Disabled by special mode; this menu cannot re-enable it.' : 'Hover to highlight this thruster in the scene.';
    });
  }

  function initializeControllerMenu() {
    const header = document.getElementById('controller-menu-header');
    const toggle = document.getElementById('controller-menu-toggle');
    const body = document.getElementById('controller-menu-body');
    if (!header || !toggle || !body) return;

    const setCollapsed = (collapsed) => {
      body.style.display = collapsed ? 'none' : 'block';
      toggle.textContent = collapsed ? '+' : '−';
      toggle.setAttribute('aria-label', collapsed ? 'Expand controller menu' : 'Minimize controller menu');
    };
    header.addEventListener('click', () => {
      setCollapsed(body.style.display !== 'none');
    });
  }

  function initializeThrusterMenu() {
    const menu = document.getElementById('thruster-menu');
    const header = document.getElementById('thruster-menu-header');
    const toggle = document.getElementById('thruster-menu-toggle');
    const body = document.getElementById('thruster-menu-body');
    const list = document.getElementById('thruster-menu-list');
    if (!menu || !header || !toggle || !body || !list) return;

    const setCollapsed = (collapsed) => {
      body.style.display = collapsed ? 'none' : 'block';
      toggle.textContent = collapsed ? '+' : '−';
      toggle.setAttribute('aria-label', collapsed ? 'Expand thruster menu' : 'Minimize thruster menu');
    };
    header.addEventListener('click', (event) => {
      event.stopPropagation();
      setCollapsed(body.style.display !== 'none');
    });

    list.innerHTML = '';
    if (thrusters.length === 0) {
      list.textContent = 'No thrusters configured.';
      return;
    }

    thrusters.forEach((thruster, index) => {
      const row = document.createElement('div');
      row.className = 'thruster-menu-row';
      row.id = `thruster-menu-row-${index}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `thruster-enabled-${index}`;
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (isSpecialDisabledThruster(index)) {
          checkbox.checked = false;
          return;
        }
        if (checkbox.checked) userDisabledThrusterIndices.delete(index);
        else {
          userDisabledThrusterIndices.add(index);
          setThrusterActive(thruster, false);
        }
      });

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = thruster.name || `Thruster ${index + 1}`;

      row.addEventListener('mouseenter', () => highlightThruster(index));
      row.addEventListener('mouseleave', () => unhighlightThruster(index));
      row.appendChild(checkbox);
      row.appendChild(label);
      list.appendChild(row);
    });

    updateThrusterMenuSpecialStates();
  }

  const keys = {};               
  let backtickPressed = false;

  document.addEventListener('keydown', e => {
    if (e.key === 'CapsLock') {
      fineControlMode = !fineControlMode;
      fineControlKeys = {};
      fineControlProcessedKeys = {};
      return;
    }
    
    const k = e.key.toLowerCase();
    if (k === '`') backtickPressed = true;
    
    if (fineControlMode && ['w','s','a','d','q','e','i','k','j','l','u','o'].includes(k)) {
      e.preventDefault();
      if (!fineControlProcessedKeys[k]) {
        fineControlKeys[k] = true;
        fineControlProcessedKeys[k] = true;
        // Record the start time for timed firing
        if (timedFiringEnabled && !fineControlKeyStartTimes[k]) {
          fineControlKeyStartTimes[k] = performance.now();
        }
      }
    } else {
      keys[k] = true;
    }

    if (backtickPressed && k === 'r') resetSimulation();
    if (backtickPressed && k === 'p') {
      if (isDocked && paused) {
        // Undocking: record the time when we start
        isDocked = false;
        hasLeftDockingBoxOnce = true;
        canDock = false;
        updateUIText('docking-status', 'NOT DOCKED');
        missionClock.onUndock();
      }
      if (paused) {
        missionClock.onResume();
      } else {
        missionClock.onPause();
      }
      paused = !paused;
    }
    if (backtickPressed && k === 'f') {
      if (isDocked && paused) {
        // Undocking: record the time when we start
        isDocked = false;
        hasLeftDockingBoxOnce = true;
        canDock = false;
        updateUIText('docking-status', 'NOT DOCKED');
        missionClock.onUndock();
      }
      if (paused) {
        missionClock.onResume();
      } else {
        missionClock.onPause();
      }
      paused = !paused;
    }
    if (backtickPressed && k === 'h') {
      toggleHullVisibility();

      // Check the status text to see if hulls are now visible
      const hullStatus = document.getElementById('hull-status').textContent;
      const showHulls = hullStatus === 'Hulls Visible';

      // Manually toggle the docking port collision box to match the hulls
      if (window.dockingPortCollisionMesh) {
        window.dockingPortCollisionMesh.visible = showHulls;
      }

      toggleSpacecraftBoundingBoxVisibility(showHulls);

      // Also toggle the second spacecraft bounding box
      if (dockingManager.secondSpacecraftBoundingBoxMesh) {
        dockingManager.secondSpacecraftBoundingBoxMesh.visible = showHulls;
      }
    }
    if (backtickPressed && k === 'x') {
      showDistanceInfo = !showDistanceInfo;
      toggleUIVisibility('distance-info', showDistanceInfo);
    }
    if (backtickPressed && k === 'b') {
      dockingManager.toggleDockingBoxes();
    }
    if (backtickPressed && k === 'z') {
      // Cycle which docking zone the HUD shows info for
      const selection = dockingManager.cycleSelectedZone();
      if (selection) {
        updateUIText('docking-target-label', selection.label);
      }
    }
    if (k === 'c') camSys.switchCameraMode();
    if (k === ' ') stopEverything();
    if (k === 't' && attitudeControl && attitudeControl.loaded) {
      const newMode = attitudeControl.toggleMode();
      updateUIText('control-mode', 
        newMode === 'thrusters' ? 'Thrusters' : 
        newMode === 'reactionwheels' ? 'Reaction Wheels' : 'CMGs');
      toggleUIVisibility('reaction-wheel-status', newMode === 'reactionwheels');
      toggleUIVisibility('cmg-status', newMode === 'cmgs');
    }
    if (k === 'v' && lampManager) {
      if (backtickPressed) {
        lampManager.toggleHelpers();
      } else {
        const lampsVisible = lampManager.toggleLamps();
        updateUIText('lamp-status-text', lampsVisible ? 'ON' : 'OFF');
      }
    }
  });

  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === '`') backtickPressed = false;
    if (fineControlMode) {
      delete fineControlProcessedKeys[k];
    } else {
      delete keys[k];
    }
  });

  function stopEverything() {
    if (!satBody) return;
    satBody.velocity.set(0,0,0);
    satBody.angularVelocity.set(0,0,0);
    thrusters.forEach(t => {
      if (t.active) {
        setThrusterActive(t, false);
      }
    });
  }
  let paused = true; // Start paused so spacecraft stays docked

  let specialThrusterModeEnabled = false;
  let disabledThrusterIndex = -1;
  let specialThrusterModeTriggered = false;

  function checkSpecialThrusterModeDate() {
    const activationDate = new Date('2031-03-08T00:00:00');
    const currentDate = new Date();
    return currentDate >= activationDate;
  }

  function resetSimulation(){
    if (!satBody || !satMesh) return;
    
    satBody.position.copy(initialPosition);
    satBody.velocity.set(0,0,0);
    satBody.angularVelocity.set(0,0,0);
    
    satBody.quaternion.copy(initialOrientation);
    satMesh.quaternion.copy(initialOrientation);
    
    resetFuel();
    
    if (attitudeControl) {
      attitudeControl.mode = 'thrusters';
      updateUIText('control-mode', 'Thrusters');
      toggleUIVisibility('reaction-wheel-status', false);
      toggleUIVisibility('cmg-status', false);
      attitudeControl.reactionWheels.forEach(wheel => wheel.currentAngularMomentum = 0);
      attitudeControl.cmgs.forEach(cmg => cmg.currentAngularMomentum.set(0, 0, 0));
    }
    
    if (lampManager) {
      lampManager.lampsVisible = true;
      lampManager.lights.forEach(light => light.visible = true);
      updateUIText('lamp-status-text', 'ON');
      lampManager.helpersVisible = false;
      lampManager.lampHelpers.forEach(helper => helper.visible = false);
    }
    
    camSys.reset();
    thrusters.forEach(t => {
      setThrusterActive(t, false);
    });
    if (soundManager) soundManager.stopAll();
    
  
    specialThrusterModeEnabled = checkSpecialThrusterModeDate();
    disabledThrusterIndex = -1;
    specialThrusterModeTriggered = false;
    updateThrusterMenuSpecialStates();
    
    // Reset clock when simulation is reset - reset to docked state
    isDocked = true;
    paused = true;
    canDock = false;
    hasLeftDockingBoxOnce = false;
    updateUIText('docking-status', 'DOCKED');
    missionClock.reset();
  }

  async function main(config) {
    initializeUI();
    
    // Set up event listeners for timed firing controls and torque slider
    const timedFiringToggle = document.getElementById('timed-firing-toggle');
    const firingDurationSlider = document.getElementById('firing-duration-slider');
    const firingDurationValue = document.getElementById('firing-duration-value');
    const torqueSlider = document.getElementById('torque-slider');
    const torqueValue = document.getElementById('torque-value');
    
    if (timedFiringToggle) {
      timedFiringToggle.addEventListener('change', (e) => {
        timedFiringEnabled = e.target.checked;
        // Clear key start times when toggling
        fineControlKeyStartTimes = {};
      });
    }
    
    if (firingDurationSlider && firingDurationValue) {
      // Function to convert slider value (0-100) to actual duration (0-15 seconds)
      // 80% of slider (0-80) maps to 0-2 seconds
      // 20% of slider (80-100) maps to 2-15 seconds
      function sliderToDuration(sliderValue) {
        const value = parseFloat(sliderValue);
        if (value <= 80) {
          // 0-2 seconds range with fine control
          return (value / 80) * 2;
        } else {
          // 2-15 seconds range
          return 2 + ((value - 80) / 20) * 13;
        }
      }
      
      // Function to convert duration (0-15 seconds) back to slider value (0-100)
      function durationToSlider(duration) {
        if (duration <= 2) {
          // Map 0-2 seconds back to 0-80
          return (duration / 2) * 80;
        } else {
          // Map 2-15 seconds back to 80-100
          return 80 + ((duration - 2) / 13) * 20;
        }
      }
      
      // Function to snap duration to appropriate increment based on range
      function snapDuration(duration) {
        if (duration <= 2) {
          // Snap to 0.01 increments for small scale
          return Math.round(duration * 100) / 100;
        } else {
          // Snap to 0.1 increments for large scale
          return Math.round(duration * 10) / 10;
        }
      }
      
      // Set initial slider value to correspond to 1 second
      const initialSliderValue = durationToSlider(1.0);
      firingDurationSlider.value = initialSliderValue;
      firingDuration = 1.0;
      firingDurationValue.textContent = firingDuration.toFixed(2);
      
      firingDurationSlider.addEventListener('input', (e) => {
        let duration = sliderToDuration(e.target.value);
        // Snap to appropriate increment
        duration = snapDuration(duration);
        // Update slider position to reflect snapped value
        firingDurationSlider.value = durationToSlider(duration);
        firingDuration = duration;
        firingDurationValue.textContent = duration.toFixed(2);
      });
    }
    
    // Torque slider event listener
    if (torqueSlider && torqueValue) {
      torqueSlider.addEventListener('input', (e) => {
        torquePercentage = parseInt(e.target.value);
        torqueValue.textContent = torquePercentage;
      });
    }
    
      try {
      // Get centerOfMass offset from spacecraft body
      const centerOfMassOffset = satBody.centerOfMassOffset || {x: 0, y: 0, z: 0};
      
      // Initialize all systems with the combined configuration
      thrusters = await initializeThrustersWithConfig(config.thrusters, CANNON, satMesh, keyToThrusterIndices, createThrusterVisual, centerOfMassOffset);
      window.thrusters = thrusters;
      initializeThrusterMenu();
      initializeControllerMenu();
      
      // Load hulls from the JSON file
      loadConvexHulls(CONVEX_HULLS_PATH, scene, world);
      
      // Load attitude control configuration
      await attitudeControl.initializeWithConfigs(config.reactionwheels, config.cmg);
      
      // Load lamps configuration
      await lampManager.loadLampsWithConfig(config.lamps);
      
      // Load camera configuration
      camSys.loadCamerasWithConfig(config.cameras);
      
      // NEW: Add the docking port collision mesh to the hull system
      if (window.dockingPortBody && window.dockingPortCollisionMesh) {
        addExternalHull(window.dockingPortBody, window.dockingPortCollisionMesh);
      }
      
      if (attitudeControl.loaded) console.log('Attitude control system loaded');
      else console.log('No attitude control systems loaded, using thrusters only');
      
      console.log('Simulation initialized successfully');
      document.getElementById('hull-status').textContent = 'Spacecraft Loaded';
    } catch (error) {
      console.error('Error during initialization:', error);
      document.getElementById('hull-status').textContent = `Error: ${error.message}`;
    }

    // Set up ambient occlusion (SSAO) post-processing following the official
    // three.js pattern: RenderPass (scene->buffer) -> SSAOPass (occlusion) ->
    // OutputPass (final sRGB conversion). All three are required.
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camSys.getCamera()));
    const ssaoPass = new SSAOPass(scene, camSys.getCamera(), window.innerWidth, window.innerHeight);
    // Tuned for the spacecraft's metric scale (model is a few meters across).
    ssaoPass.kernelRadius = 0.5;
    ssaoPass.minDistance = 0.001;
    ssaoPass.maxDistance = 0.05;
    composer.addPass(ssaoPass);
    composer.addPass(new OutputPass());

    animate();
  }

  const clock = new THREE.Clock();
  
  // FPS limiting variables
  const TARGET_FPS = 60;
  const FRAME_DURATION = 1000 / TARGET_FPS;
  let lastFrameTime = performance.now();
  
  function animate(){
    requestAnimationFrame(animate);
    
    // FPS limiting - only update at target FPS
    const currentTime = performance.now();
    const elapsed = currentTime - lastFrameTime;
    
    if (elapsed < FRAME_DURATION) {
      return; // Skip this frame if not enough time has passed
    }
    
    // Update last frame time, accounting for any excess to maintain steady frame rate
    lastFrameTime = currentTime - (elapsed % FRAME_DURATION);
    
    const dt = clock.getDelta();
    
    // Handle timed firing: check if any keys have exceeded their firing duration
    if (fineControlMode && timedFiringEnabled) {
      Object.entries(fineControlKeyStartTimes).forEach(([key, startTime]) => {
        const elapsed = (currentTime - startTime) / 1000; // Convert to seconds
        if (elapsed >= firingDuration) {
          // Remove from fineControlKeys to stop firing
          delete fineControlKeys[key];
          delete fineControlKeyStartTimes[key];
        }
      });
    }
    
    // DEBUG: Print inertia matrix every 10 seconds
    if (satBody && currentTime - lastInertiaDebugTime > INERTIA_DEBUG_INTERVAL) {
      console.log("DEBUG: Inertia Matrix (10s interval):", {
        x: satBody.inertia.x,
        y: satBody.inertia.y,
        z: satBody.inertia.z,
        mass: satBody.mass
      });
      lastInertiaDebugTime = currentTime;
    }
    
    if (!specialThrusterModeEnabled && checkSpecialThrusterModeDate()) {
      specialThrusterModeEnabled = true;
    }
    //specialThrusterModeEnabled = true;
    
    // Check if spacecraft z position is < 2 and trigger special thruster mode.
    // Disable one thruster that is oriented (in WORLD space) toward +Z. If
    // several qualify, pick one at random so the failure is non-deterministic.
    // If none qualify in the current orientation, fall back to a random one.
    if (specialThrusterModeEnabled && !specialThrusterModeTriggered && satBody && thrusters.length > 0 && satBody.position.z < 2) {
      const positiveZDirection = new CANNON.Vec3(0, 0, 1);
      const thrustersFacingPositiveZ = [];

      thrusters.forEach((thruster, index) => {
        // thruster.dir is in the spacecraft's LOCAL frame; rotate it into
        // world space using the current orientation before testing against
        // the world +Z axis.
        const worldDir = satBody.quaternion.vmult(thruster.dir);
        const dotProduct = worldDir.dot(positiveZDirection);
        if (dotProduct > 0) {
          thrustersFacingPositiveZ.push(index);
        }
      });

      // Pick randomly among the +Z-facing thrusters, else a random fallback.
      if (thrustersFacingPositiveZ.length > 0) {
        disabledThrusterIndex = thrustersFacingPositiveZ[
          Math.floor(Math.random() * thrustersFacingPositiveZ.length)
        ];
      } else {
        disabledThrusterIndex = Math.floor(Math.random() * thrusters.length);
      }

      specialThrusterModeTriggered = true;
      setThrusterActive(thrusters[disabledThrusterIndex], false);
      updateThrusterMenuSpecialStates();
    }

    // Helper: a key counts as "pressed" if it's down on the real keyboard OR
    // held by the student controller. The controller drives the exact same
    // thruster/fuel path as a human pilot, so its keys are merged in here.
    const isKeyActive = (key) => {
      if (fineControlMode ? fineControlKeys[key] : keys[key]) return true;
      return studentController ? studentController.getActiveKeys().has(key) : false;
    };

    if (!paused && satBody){
      if (studentController) {
        studentController.update();
      }

      if (attitudeControl && attitudeControl.loaded && attitudeControl.mode !== 'thrusters') {
        const torque = new CANNON.Vec3(0, 0, 0);
        const isCMGMode = attitudeControl.mode === 'cmgs';
        
        // Get max torque from the active attitude control system
        let maxTorque = 0.5; // Default fallback
        if (isCMGMode && attitudeControl.cmgs.length > 0) {
          // Use average max torque from all CMGs
          maxTorque = attitudeControl.cmgs.reduce((sum, cmg) => sum + cmg.maxTorque, 0) / attitudeControl.cmgs.length;
        } else if (!isCMGMode && attitudeControl.reactionWheels.length > 0) {
          // Use average max torque from all reaction wheels
          maxTorque = attitudeControl.reactionWheels.reduce((sum, wheel) => sum + wheel.maxTorque, 0) / attitudeControl.reactionWheels.length;
        }
        
        // Calculate torque per axis based on percentage
        const torquePerAxis = maxTorque * (torquePercentage / 100);
        
        if (fineControlMode) {
          // Swap I and K for CMGs
          if (isCMGMode ? isKeyActive('k') : isKeyActive('i')) torque.x += torquePerAxis;
          if (isCMGMode ? isKeyActive('i') : isKeyActive('k')) torque.x -= torquePerAxis;
          // Swap J and L for CMGs
          if (isCMGMode ? isKeyActive('j') : isKeyActive('l')) torque.y += torquePerAxis;
          if (isCMGMode ? isKeyActive('l') : isKeyActive('j')) torque.y -= torquePerAxis;
          // Swap U and O for CMGs
          if (isCMGMode ? isKeyActive('o') : isKeyActive('u')) torque.z += torquePerAxis;
          if (isCMGMode ? isKeyActive('u') : isKeyActive('o')) torque.z -= torquePerAxis;
        } else {
          // Swap I and K for CMGs
          if (isCMGMode ? isKeyActive('k') : isKeyActive('i')) torque.x += torquePerAxis;
          if (isCMGMode ? isKeyActive('i') : isKeyActive('k')) torque.x -= torquePerAxis;
          // Swap J and L for CMGs
          if (isCMGMode ? isKeyActive('j') : isKeyActive('l')) torque.y += torquePerAxis;
          if (isCMGMode ? isKeyActive('l') : isKeyActive('j')) torque.y -= torquePerAxis;
          // Swap U and O for CMGs
          if (isCMGMode ? isKeyActive('o') : isKeyActive('u')) torque.z += torquePerAxis;
          if (isCMGMode ? isKeyActive('u') : isKeyActive('o')) torque.z -= torquePerAxis;
        }
        if (torque.length() > 0) attitudeControl.applyControlTorque(torque);
      } else {
        Object.entries(keyToThrusterIndices).forEach(([key, indices]) => {
          const keyIsPressed = isKeyActive(key);
          if (keyIsPressed && indices.length && !['w','s','a','d','q','e'].includes(key)) {
            indices.forEach(i => {
              const t = thrusters[i]; if (!t) return;
              if (isThrusterDisabled(i)) { setThrusterActive(t, false); return; }
              const fuelStatus = getFuelStatus();
              if (fuelStatus.fuelMass <= 0) { if (t.active) setThrusterActive(t, false); return; }
              if (!t.thrust || !t.isp || t.isp <= 0 || isNaN(t.thrust) || isNaN(t.isp)) { console.error("Thruster has invalid properties, skipping.", t); if (t.active) setThrusterActive(t, false); return; }
              const forceLocal = t.dir.scale(t.thrust);
              satBody.applyLocalForce(forceLocal, t.pos);
              const fuelConsumptionRate = t.thrust / (t.isp * 9.81);
              const fuelConsumed = fuelConsumptionRate * dt;
              const remainingFuel = consumeFuel(fuelConsumed);
              if (remainingFuel <= 0) { if (t.active) setThrusterActive(t, false); return; }

              // FIX: Visually activate the thruster
              if (!t.active) {
                setThrusterActive(t, true);
              }
            });
          }
        });
      }
      
      Object.entries(keyToThrusterIndices).forEach(([key, indices]) => {
        const keyIsPressed = isKeyActive(key);
        if (keyIsPressed && indices.length && ['w','s','a','d','q','e'].includes(key)) {
          indices.forEach(i => {
            const t = thrusters[i]; if (!t) return;
            if (isThrusterDisabled(i)) { setThrusterActive(t, false); return; }
            const fuelStatus = getFuelStatus();
            if (fuelStatus.fuelMass <= 0) { if (t.active) setThrusterActive(t, false); return; }
            if (!t.thrust || !t.isp || t.isp <= 0 || isNaN(t.thrust) || isNaN(t.isp)) { console.error("Thruster has invalid properties, skipping.", t); if (t.active) setThrusterActive(t, false); return; }
            const forceLocal = t.dir.scale(t.thrust);
            satBody.applyLocalForce(forceLocal, t.pos);
            const fuelConsumptionRate = t.thrust / (t.isp * 9.81);
            const fuelConsumed = fuelConsumptionRate * dt;
            const remainingFuel = consumeFuel(fuelConsumed);
            if (remainingFuel <= 0) { if (t.active) setThrusterActive(t, false); return; }

            // FIX: Visually activate the thruster
            if (!t.active) {
              setThrusterActive(t, true);
            }
          });
        }
      });
      
      world.step(1/60);
    }

    if (getSpacecraftBody()) {
      updateSpacecraft();
    }

    // Animate exhaust plumes + ignition smoke puffs (thrusterEffects.js)
    updateThrusterEffects(thrusters, dt);

    camSys.update();

    if (lampManager) {
      lampManager.updateLamps();
    }

    thrusters.forEach(t => {
      const stillPressed = Object.entries(keyToThrusterIndices).some(([k,ids])=> {
        const keyIsPressed = isKeyActive(k);
        return keyIsPressed && ids.includes(t.index);
      });
      if (t.active && (!stillPressed || isThrusterDisabled(t.index))){
        setThrusterActive(t, false);
      }
    });

    // Only clear fineControlKeys if timed firing is NOT enabled
    // When timed firing is enabled, keys are cleared by the duration check logic
    if (!timedFiringEnabled) {
      fineControlKeys = {};
    }

    // Docking logic — checks ALL zones to determine actual dock state
    const dockingStatus = dockingManager.isInDockingZone(satBody);
    if (!dockingStatus.inBox) hasLeftDockingBoxOnce = true;

    // HUD display — shows info for the SELECTED zone (cycled with ` + z).
    // This is separate from the actual docking logic above.
    const hudStatus = dockingManager.getSelectedDockingZoneStatus(satBody);
    if (hudStatus) {
      updateUIText('dock-distance', hudStatus.distance.toFixed(3));
      updateUIText('angular-diff', hudStatus.angleDiff.toFixed(2));
      updateUIText('docking-speed', hudStatus.speed.toFixed(3));
      updateUIText('docking-angular-speed', hudStatus.angularSpeed.toFixed(3));
      updateUIText('docking-target-label', hudStatus.label);
    } else {
      updateUIText('dock-distance', dockingStatus.distance.toFixed(3));
      updateUIText('angular-diff', dockingStatus.angleDiff.toFixed(2));
      updateUIText('docking-speed', dockingStatus.speed.toFixed(3));
      updateUIText('docking-angular-speed', dockingStatus.angularSpeed.toFixed(3));
    }
    
    if (!isDocked && canDock && hasLeftDockingBoxOnce && dockingStatus.inBox && dockingStatus.inAngle && dockingStatus.withinSpeedLimits && dockingStatus.withinAngularSpeedLimit) {
      isDocked = true; paused = true;
      updateUIText('docking-status', 'DOCKED');
      satBody.velocity.set(0, 0, 0);
      satBody.angularVelocity.set(0, 0, 0);
      // Record the time elapsed when we dock
      missionClock.onDock();
    }
    if (!canDock && !dockingStatus.inBox && hasLeftDockingBoxOnce) {
      canDock = true;
    }

    const fuelStatus = getFuelStatus();
      updateUI({
      satBody,
      hudElement: document.getElementById('status-panel'),
      isPaused: paused,
      fuelMass: fuelStatus.fuelMass,
      maxFuelMass: fuelStatus.maxFuelMass,
      dryMass: fuelStatus.dryMass,
      attitudeControl,
      lampManager,
      station,
      satMesh,
      raycaster,
      maxDistance,
      showDistanceInfo,
      cameraSystem: camSys,
      fineControlMode,
      isDocked,
      dockingStatus: hudStatus || dockingStatus
    });
    
    // Update clock display
    missionClock.update(paused, isDocked);

    // Render through the SSAO composer; fall back to direct rendering if the
    // composer hasn't been initialized yet.
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camSys.getCamera());
    }
  }

  window.addEventListener('resize', ()=>{
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    camSys.handleResize();
  });

  // Export current position and orientation to JSON file.
  // Format is UNCHANGED from the original so the exported file can be re-used
  // as the "Initial Position" file for either spacecraft. To position the
  // second spacecraft, fly SC1 to the desired spot, export, then upload that
  // file as the second spacecraft's position file.
  window.addEventListener('exportPosition', () => {
    if (!satBody) {
      console.error('Spacecraft body not available for export');
      alert('Spacecraft not loaded yet');
      return;
    }

    const positionData = {
      position: {
        x: satBody.position.x,
        y: satBody.position.y,
        z: satBody.position.z
      },
      orientation: {
        x: satBody.quaternion.x,
        y: satBody.quaternion.y,
        z: satBody.quaternion.z,
        w: satBody.quaternion.w
      },
      dockingBoxSize: DOCKING_BOX_SIZE,
      dockingAngleThreshold: DOCKING_ANGLE_THRESHOLD
    };

    // Create a blob and download the file
    const dataStr = JSON.stringify(positionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'spacecraft_position.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Exported position/orientation:', positionData);
  });

  initializeDefaultSpacecraft();
}