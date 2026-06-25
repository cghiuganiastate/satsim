import * as THREE from 'three';

const STARTER_CODE = `// ===== STUDENT AUTOPILOT CONTROLLER =====
// This is just an example to get you started
// Edit this code and click Apply. Code updates instantly upon apply button press.
// Press 1 to toggle this controller on/off.

// ── SENSOR FRAMES ──────────────────────────────────────────────────
// Every motion sensor is provided in BOTH coordinate frames:
//
//   GLOBAL (inertial) — matches the HUD numbers
//     state.position, state.velocity, state.orientation, state.gyro
//
//   BODY-FIXED — what the spacecraft "feels" along its own x/y/z axes.
//     state.velocityBody, state.gyroBody

let lastPrintTime = 0;

function computeControl(state, inputs) {
  // Body-fixed sensors (orientation-independent — use these for PID).
  const vb = state.velocityBody;   // m/s  along body x/y/z
  const gb = state.gyroBody;       // deg/s around body x/y/z

  // Global sensors (match the HUD — use for navigation/docking).
  const position    = state.position;
  const velocity    = state.velocity;
  const orientation = state.orientation;
  const message = inputs.text;

  // ── PRINT (twice per second) ──────────────────────────────────────
  if (state.time - lastPrintTime > 0.5) {
    log('Input box says: ' + message) //you can maybe use this to do something fun
    log('velBody  x=' + vb.x.toFixed(2) + ' y=' + vb.y.toFixed(2) + ' z=' + vb.z.toFixed(2));
    log('gyroBody x=' + gb.x.toFixed(2) + ' y=' + gb.y.toFixed(2) + ' z=' + gb.z.toFixed(2));
    lastPrintTime = state.time; //i gave you your states, rest is up to you :^)
  }
  //Last thing I will show you is how to push buttons
  const keys = [];
  keys.push('i'); // apply −X rotation
  keys.push('d');   // apply −X translation
  //just put as many button pushes as you want and its like you are pressing the keyboard
  return { keys: keys };// push both keys at the same time
}

function onKeyPress(key, action) {
  // Keybind example: press 1 to turn this controller on/off
  if (key === '1' && action === 'down') {
    setControllerEnabled(!isControllerEnabled());
    log('Controller is now ' + (isControllerEnabled() ? 'ON' : 'OFF'));
  }
}`;

function vecToPlain(v) {
  return { x: v?.x || 0, y: v?.y || 0, z: v?.z || 0 };
}

export class StudentController {
  constructor({ satBody }) {
    this.satBody = satBody;
    this.enabled = false;
    this.computeControl = () => ({});
    this.onKeyPress = null;
    this.keyStates = {};
    this.activeKeys = new Set();
    this.outputLines = [];
    this.maxOutputLines = 80;
    this.startTime = performance.now();

    this.editor = document.getElementById('controller-code');
    this.output = document.getElementById('controller-output');
    this.input = document.getElementById('controller-input');
    this.applyButton = document.getElementById('controller-apply');
    this.clearButton = document.getElementById('controller-clear-output');
    this.toggle = document.getElementById('controller-enabled');
    this.status = document.getElementById('controller-status');
    this.exportButton = document.getElementById('controller-export');
    this.loadButton = document.getElementById('controller-load');
    this.loadFileInput = document.getElementById('controller-load-file');
    this.dropZone = document.getElementById('controller-drop-zone');

    if (this.editor && !this.editor.value.trim()) this.editor.value = STARTER_CODE;
    this.attachUI();
    this.applyCode();
  }

  attachUI() {
    if (this.applyButton) this.applyButton.addEventListener('click', () => this.applyCode());
    if (this.clearButton) this.clearButton.addEventListener('click', () => this.clearOutput());
    if (this.toggle) {
      this.toggle.checked = this.enabled;
      this.toggle.addEventListener('change', () => this.setEnabled(this.toggle.checked));
    }

    // Export button
    if (this.exportButton) {
      this.exportButton.addEventListener('click', () => this.exportProgram());
    }

    // Load button
    if (this.loadButton) {
      this.loadButton.addEventListener('click', () => {
        if (this.loadFileInput) {
          this.loadFileInput.click();
        }
      });
    }

    // Load file input
    if (this.loadFileInput) {
      this.loadFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
          this.loadProgramFromFile(file);
          event.target.value = ''; // Reset input
        }
      });
    }

    // Drag and drop on the controller panel
    if (this.editor) {
      this.setupDragAndDrop();
    }

    [this.editor, this.input].forEach(element => {
      if (!element) return;
      element.addEventListener('keydown', event => event.stopPropagation());
      element.addEventListener('keyup', event => event.stopPropagation());
    });

    window.addEventListener('keydown', (event) => this.handleKey(event.key.toLowerCase(), 'down'));
    window.addEventListener('keyup', (event) => this.handleKey(event.key.toLowerCase(), 'up'));
  }

  handleKey(key, action) {
    if (!key) return;
    const wasDown = !!this.keyStates[key];
    if (action === 'down') this.keyStates[key] = true;
    if (action === 'up') delete this.keyStates[key];

    // Avoid repeated keydown events spamming student callbacks.
    if (action === 'down' && wasDown) return;

    if (typeof this.onKeyPress === 'function') {
      try {
        this.onKeyPress(key, action);
      } catch (error) {
        this.log('onKeyPress error: ' + error.message);
      }
    }
  }

  applyCode() {
    const code = this.editor?.value || STARTER_CODE;
    const api = {
      log: (message) => this.log(message),
      setControllerEnabled: (enabled) => this.setEnabled(enabled),
      isControllerEnabled: () => this.enabled
    };

    try {
      const factory = new Function(
        'log',
        'setControllerEnabled',
        'isControllerEnabled',
        `${code}\nreturn {\n  computeControl: (typeof computeControl === 'function') ? computeControl : null,\n  onKeyPress: (typeof onKeyPress === 'function') ? onKeyPress : null\n};`
      );
      const result = factory(api.log, api.setControllerEnabled, api.isControllerEnabled);
      if (typeof result.computeControl !== 'function') throw new Error('Code must define function computeControl(state, inputs).');
      this.computeControl = result.computeControl;
      this.onKeyPress = result.onKeyPress;
      this.log('Controller code applied');
      this.updateStatus();
      return true;
    } catch (error) {
      this.log('Apply error: ' + error.message);
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    // Clear any held controller keys immediately when disabled so thrusters
    // don't keep firing after the autopilot is turned off.
    if (!this.enabled) this.activeKeys.clear();
    if (this.toggle) this.toggle.checked = this.enabled;
    this.updateStatus();
  }

  updateStatus() {
    if (!this.status) return;
    this.status.textContent = this.enabled ? 'ON' : 'OFF';
    this.status.style.color = this.enabled ? '#0f0' : '#f66';
  }

  clearOutput() {
    this.outputLines = [];
    if (this.output) this.output.value = '';
  }

  log(message) {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    this.outputLines.push(text);
    if (this.outputLines.length > this.maxOutputLines) this.outputLines.shift();
    if (this.output) {
      this.output.value = this.outputLines.join('\n');
      this.output.scrollTop = this.output.scrollHeight;
    }
  }

  buildState() {
    const q = this.satBody.quaternion;
    const threeQ = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    // q rotates body->world, so its inverse (== conjugate for a unit
    // quaternion) rotates world->body. We use it to convert the physics
    // engine's world-frame velocity/angular velocity into the spacecraft's
    // body-fixed frame so the controller can read "body" rates.
    const invQ = threeQ.clone().invert();
    // IMPORTANT: must use 'YXZ' to match the HUD's decomposition order, or the
    // roll/pitch/yaw shown here will differ from the HUD for the same attitude.
    const euler = new THREE.Euler().setFromQuaternion(threeQ, 'YXZ');
    const radToDeg = 180 / Math.PI;

    // World-frame (global/inertial) motion from the physics body.
    const worldVel = this.satBody.velocity;
    const worldAngVel = this.satBody.angularVelocity;

    // Body-fixed motion: rotate the world vectors into the spacecraft frame.
    const localVel = new THREE.Vector3(worldVel.x, worldVel.y, worldVel.z).applyQuaternion(invQ);
    const localAngVel = new THREE.Vector3(worldAngVel.x, worldAngVel.y, worldAngVel.z).applyQuaternion(invQ);

    return {
      // Global (inertial) frame quantities.
      position: vecToPlain(this.satBody.position),
      velocity: vecToPlain(worldVel),
      orientation: {
        roll: euler.z * radToDeg,
        pitch: euler.x * radToDeg,
        yaw: euler.y * radToDeg
      },
      attitude: {
        roll: euler.z * radToDeg,
        pitch: euler.x * radToDeg,
        yaw: euler.y * radToDeg
      },
      gyro: {
        x: worldAngVel.x * radToDeg,
        y: worldAngVel.y * radToDeg,
        z: worldAngVel.z * radToDeg
      },
      angularVelocity: {
        x: worldAngVel.x * radToDeg,
        y: worldAngVel.y * radToDeg,
        z: worldAngVel.z * radToDeg
      },
      // Body-fixed frame quantities (what the spacecraft "feels").
      velocityBody: vecToPlain(localVel),
      gyroBody: {
        x: localAngVel.x * radToDeg,
        y: localAngVel.y * radToDeg,
        z: localAngVel.z * radToDeg
      },
      angularVelocityBody: {
        x: localAngVel.x * radToDeg,
        y: localAngVel.y * radToDeg,
        z: localAngVel.z * radToDeg
      },
      time: (performance.now() - this.startTime) / 1000
    };
  }

  // Keys the controller is allowed to "press." These are exactly the keys the
  // keyboard uses to fire thrusters, so the controller drives the same
  // (fuel-burning, thruster-activating) code path as a human pilot.
  static get VALID_KEYS() {
    return new Set(['w', 's', 'a', 'd', 'q', 'e', 'i', 'k', 'j', 'l', 'u', 'o']);
  }

  // Run the student's control law for this frame. Instead of applying forces or
  // torques directly to the physics body, the law returns the keys it wants
  // held down. Those keys are merged with the real keyboard state in
  // simulation.js and fired through the normal thruster/fuel path.
  update() {
    if (!this.enabled || !this.satBody) {
      this.activeKeys.clear();
      return;
    }

    let output;
    try {
      output = this.computeControl(this.buildState(), {
        text: this.input?.value || '',
        keyStates: { ...this.keyStates }
      }) || {};
    } catch (error) {
      this.log('computeControl error: ' + error.message);
      this.activeKeys.clear();
      return;
    }

    // The controller "presses keys" instead of applying forces directly. Only
    // control keys are accepted; anything else is ignored. Returning no keys
    // (or an empty/invalid result) means "release everything" this frame.
    this.activeKeys.clear();
    if (Array.isArray(output.keys)) {
      for (const raw of output.keys) {
        const k = String(raw).toLowerCase();
        if (StudentController.VALID_KEYS.has(k)) this.activeKeys.add(k);
      }
    }
  }

  // Returns the set of keys the controller is currently holding down, so the
  // simulation can merge them with the real keyboard state and fire thrusters
  // through the normal fuel-consuming path. Returns a fresh Set each call.
  getActiveKeys() {
    return this.enabled ? new Set(this.activeKeys) : new Set();
  }

  // Export the current controller program to a file
  exportProgram() {
    const code = this.editor?.value || '';
    if (!code.trim()) {
      this.log('No code to export');
      return;
    }

    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autopilot-program.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.log('Program exported successfully');
  }

  // Load a controller program from a file
  loadProgramFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      if (this.editor) {
        this.editor.value = content;
        this.log(`Program loaded: ${file.name}`);
      }
    };
    reader.onerror = () => {
      this.log(`Error loading file: ${file.name}`);
    };
    reader.readAsText(file);
  }

  // Set up drag and drop functionality for the controller panel
  setupDragAndDrop() {
    const dropZone = this.dropZone;
    const editor = this.editor;
    
    if (!dropZone || !editor) return;

    // Show drop zone when dragging over the controller panel
    editor.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.display = 'block';
    });

    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.background = 'rgba(0, 255, 0, 0.2)';
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.background = 'rgba(0, 255, 0, 0.1)';
      dropZone.style.display = 'none';
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.background = 'rgba(0, 255, 0, 0.1)';
      dropZone.style.display = 'none';

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        // Accept .js, .txt files, or any text file
        if (file.name.endsWith('.js') || file.name.endsWith('.txt') || file.type.startsWith('text/')) {
          this.loadProgramFromFile(file);
        } else {
          this.log(`Unsupported file type: ${file.name}`);
        }
      }
    });
  }
}
