import * as THREE from 'three';
import { EngineFlightRecorder, FreezeIncident } from '../core/EngineFlightRecorder';

export function runFlightRecorderTests(): { passed: boolean; error?: string } {
  try {
    let capturedIncident: FreezeIncident | null = null;
    const recorder = new EngineFlightRecorder((incident) => {
      capturedIncident = incident;
    });

    // 1. Initial State
    if (recorder.getRecentIncidents().length !== 0) {
      return { passed: false, error: 'Initial incidents array must be empty' };
    }

    // 2. Normal Frame Recording
    recorder.startFrame();
    recorder.startSection('physics_kinematics');
    recorder.endSection('physics_kinematics');

    recorder.startSection('webgl_render');
    recorder.endSection('webgl_render');

    const frameMs = recorder.endFrame(new THREE.Vector3(10, 0, -20), 'run');
    if (frameMs < 0) {
      return { passed: false, error: 'Frame duration must be non-negative' };
    }

    // 3. Export JSON Validation
    const jsonStr = recorder.exportLogJSON();
    const parsed = JSON.parse(jsonStr);
    if (!parsed.telemetry || parsed.telemetry.length !== 1) {
      return { passed: false, error: 'exportLogJSON must include recorded telemetry' };
    }
    if (parsed.telemetry[0].catState !== 'run') {
      return { passed: false, error: 'Telemetry sample must record catState correctly' };
    }

    // 4. Section Stall Detection (Simulate spike >= threshold)
    recorder.startFrame();
    recorder.startSection('rats_ai');
    // Artificially simulate 20.0ms section duration by overriding start timestamp
    const startMap = (recorder as unknown as { sectionStartTimes: Map<string, number> }).sectionStartTimes;
    startMap.set('rats_ai', performance.now() - (EngineFlightRecorder.SECTION_STALL_THRESHOLD_MS + 2.0));
    const ratDuration = recorder.endSection('rats_ai');

    if (ratDuration < EngineFlightRecorder.SECTION_STALL_THRESHOLD_MS) {
      return { passed: false, error: `Simulated duration expected >= threshold, got ${ratDuration}` };
    }

    const incidents = recorder.getRecentIncidents();
    if (incidents.length === 0 || !capturedIncident) {
      return { passed: false, error: 'Freeze incident callback must be triggered on section >= threshold' };
    }
    const inc = capturedIncident as FreezeIncident;
    if (inc.culpritSection !== 'rats_ai') {
      return { passed: false, error: `Culprit section expected 'rats_ai', got '${inc.culpritSection}'` };
    }

    return { passed: true };
  } catch (err: any) {
    return { passed: false, error: err.message || String(err) };
  }
}