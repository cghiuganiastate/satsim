// File: missionClock.js
// Mission elapsed-time clock extracted from simulation.js.
// Tracks the spacecraft's free-flight time: starts when the craft undocks,
// pauses while paused, freezes at the value when it re-docks, and resets to 0.
// The simulation drives state transitions via onUndock/onPause/onResume/onDock/reset.

export class MissionClock {
  constructor() {
    this.undockTime = null;          // performance.now() when undocked
    this.pausedStartTime = null;     // performance.now() when current pause began
    this.accumulatedPausedTime = 0;  // ms spent paused since undock
    this.lastDockedTime = 0;         // ms elapsed when last docked
    this.clockDisplay = null;        // cached DOM element
  }

  // Lazily resolve the #clock-display element.
  _ensureDisplay() {
    if (!this.clockDisplay) {
      this.clockDisplay = document.getElementById('clock-display');
    }
    return this.clockDisplay;
  }

  // Call when the spacecraft undocks (begins free flight).
  onUndock() {
    this.undockTime = performance.now();
    this.accumulatedPausedTime = 0;
  }

  // Call when the simulation is paused.
  onPause() {
    this.pausedStartTime = performance.now();
  }

  // Call when the simulation is resumed from pause.
  onResume() {
    if (this.pausedStartTime !== null) {
      this.accumulatedPausedTime += (performance.now() - this.pausedStartTime);
      this.pausedStartTime = null;
    }
  }

  // Call when the spacecraft docks. `paused` is whether the sim simultaneously
  // pauses on dock (it always does in this codebase).
  onDock(paused = true) {
    if (this.undockTime !== null) {
      let currentTime = performance.now();
      if (this.pausedStartTime !== null) {
        currentTime = this.pausedStartTime;
      }
      this.lastDockedTime = currentTime - this.undockTime - this.accumulatedPausedTime;
    }
  }

  // Full reset to the initial docked state.
  reset() {
    this.undockTime = null;
    this.pausedStartTime = null;
    this.accumulatedPausedTime = 0;
    this.lastDockedTime = 0;
    if (this._ensureDisplay()) {
      this.clockDisplay.textContent = '0:00:00.000';
    }
  }

  // Format ms as H:MM:SS.mmm.
  _format(elapsedMilliseconds) {
    const elapsedSeconds = elapsedMilliseconds / 1000;
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = Math.floor(elapsedSeconds % 60);
    const milliseconds = Math.floor(elapsedMilliseconds % 1000);
    const hoursStr = hours.toString();
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');
    const millisecondsStr = milliseconds.toString().padStart(3, '0');
    return `${hoursStr}:${minutesStr}:${secondsStr}.${millisecondsStr}`;
  }

  // Redraw the clock. `paused` and `isDocked` mirror the simulation's flags so
  // this module doesn't need to own the broader simulation state.
  update(paused, isDocked) {
    if (!this._ensureDisplay()) return;

    // If never undocked, show 0:00:00.000
    if (this.undockTime === null) {
      this.clockDisplay.textContent = '0:00:00.000';
      return;
    }

    // If docked, show the time at which we docked (frozen)
    if (isDocked) {
      this.clockDisplay.textContent = this._format(this.lastDockedTime);
      return;
    }

    // Calculate elapsed time since undock, accounting for paused time
    let currentTime = performance.now();
    // If currently paused, subtract the current pause duration from the calc
    if (paused && this.pausedStartTime !== null) {
      currentTime = this.pausedStartTime;
    }
    const elapsedMilliseconds = currentTime - this.undockTime - this.accumulatedPausedTime;
    this.clockDisplay.textContent = this._format(elapsedMilliseconds);
  }
}