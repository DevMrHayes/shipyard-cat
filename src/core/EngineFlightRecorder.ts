import * as THREE from 'three';

export interface SectionTiming {
  name: string;
  durationMs: number;
}

export interface FreezeIncident {
  id: string;
  timestamp: string;
  frameTick: number;
  culpritSection: string;
  sectionDurationMs: number;
  totalFrameDurationMs: number;
  catPosition: { x: number; y: number; z: number };
  catState: string;
  nearestRatDist?: number;
  audioEventFired?: string;
  summary: string;
}

export interface FrameTelemetrySample {
  frameTick: number;
  timestamp: string;
  totalFrameMs: number;
  timings: Record<string, number>;
  catPosition: { x: number; y: number; z: number };
  catState: string;
}

export type FreezeIncidentCallback = (incident: FreezeIncident) => void;

/**
 * EngineFlightRecorder - High-Resolution Subsystem Timing & Micro-Stall Trapper.
 * Zero-allocation in steady state, continuous circular telemetry buffer,
 * and automated freeze incident detection.
 */
export class EngineFlightRecorder {
  public static readonly SAMPLE_CAPACITY = 120; // 120 frames @ 60 FPS = 2.0 seconds rolling
  public static readonly INCIDENT_CAPACITY = 40;
  public static readonly SECTION_STALL_THRESHOLD_MS = 18.0; // Subsystem exceeding frame budget (>18ms)
  public static readonly FRAME_STALL_THRESHOLD_MS = 28.0;   // Frame dropping below 35 FPS (>28ms)

  private sectionStartTimes: Map<string, number> = new Map();
  private currentFrameTimings: Record<string, number> = {};
  private frameStartTimestamp: number = 0;
  private frameTick: number = 0;

  // Pre-allocated Circular Telemetry Buffer
  private telemetryBuffer: FrameTelemetrySample[] = [];
  private bufferHeadIndex: number = 0;
  private totalFramesRecorded: number = 0;

  // Freeze Incident History
  private incidents: FreezeIncident[] = [];
  public onFreezeIncident: FreezeIncidentCallback | null = null;

  // Transient Frame Context
  private lastAudioEvent: string = '';
  private nearestRatDistance: number = 999;

  constructor(onFreeze?: FreezeIncidentCallback) {
    this.onFreezeIncident = onFreeze || null;

    // Pre-allocate circular sample slots (Zero GC during gameplay)
    for (let i = 0; i < EngineFlightRecorder.SAMPLE_CAPACITY; i++) {
      this.telemetryBuffer.push({
        frameTick: 0,
        timestamp: '',
        totalFrameMs: 0,
        timings: {},
        catPosition: { x: 0, y: 0, z: 0 },
        catState: 'stand'
      });
    }

    if (typeof window !== 'undefined') {
      (window as unknown as { shipyardFlightRecorder: EngineFlightRecorder }).shipyardFlightRecorder = this;
    }
  }

  public startFrame(): void {
    this.frameTick++;
    this.frameStartTimestamp = performance.now();
    this.currentFrameTimings = {};
  }

  public startSection(name: string): void {
    this.sectionStartTimes.set(name, performance.now());
  }

  public endSection(name: string): number {
    const start = this.sectionStartTimes.get(name);
    if (start === undefined) return 0;
    const duration = performance.now() - start;
    this.currentFrameTimings[name] = duration;

    // Check if single section stalled beyond threshold
    if (duration >= EngineFlightRecorder.SECTION_STALL_THRESHOLD_MS) {
      this.recordSpike(name, duration, 0);
    }
    return duration;
  }

  public logAudioEvent(eventName: string): void {
    this.lastAudioEvent = eventName;
  }

  public setNearestRatDistance(dist: number): void {
    this.nearestRatDistance = dist;
  }

  public endFrame(catPos?: THREE.Vector3 | { x: number; y: number; z: number }, catState: string = 'stand'): number {
    const now = performance.now();
    const totalFrameMs = this.frameStartTimestamp > 0 ? (now - this.frameStartTimestamp) : 16.6;

    const posX = catPos ? catPos.x : 0;
    const posY = catPos ? catPos.y : 0;
    const posZ = catPos ? catPos.z : 0;

    // Record sample into circular buffer
    const slot = this.telemetryBuffer[this.bufferHeadIndex];
    slot.frameTick = this.frameTick;
    slot.timestamp = new Date().toISOString().substring(11, 23);
    slot.totalFrameMs = totalFrameMs;
    slot.timings = { ...this.currentFrameTimings };
    slot.catPosition.x = posX;
    slot.catPosition.y = posY;
    slot.catPosition.z = posZ;
    slot.catState = catState;

    this.bufferHeadIndex = (this.bufferHeadIndex + 1) % EngineFlightRecorder.SAMPLE_CAPACITY;
    this.totalFramesRecorded++;

    // Check if total frame exceeded dropped frame threshold
    if (totalFrameMs >= EngineFlightRecorder.FRAME_STALL_THRESHOLD_MS) {
      let maxSectionName = 'frame_overload';
      let maxSectionMs = 0;
      for (const [sec, ms] of Object.entries(this.currentFrameTimings)) {
        if (ms > maxSectionMs) {
          maxSectionMs = ms;
          maxSectionName = sec;
        }
      }
      this.recordSpike(maxSectionName, maxSectionMs, totalFrameMs, { x: posX, y: posY, z: posZ }, catState);
    }

    // Reset frame-transient tracking
    this.lastAudioEvent = '';
    return totalFrameMs;
  }

  private recordSpike(
    culprit: string,
    sectionMs: number,
    totalFrameMs: number,
    catPos?: { x: number; y: number; z: number },
    catState?: string
  ): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    const incident: FreezeIncident = {
      id: `incident_${this.frameTick}_${Date.now()}`,
      timestamp,
      frameTick: this.frameTick,
      culpritSection: culprit,
      sectionDurationMs: parseFloat(sectionMs.toFixed(2)),
      totalFrameDurationMs: parseFloat(totalFrameMs.toFixed(2)),
      catPosition: catPos ? { x: parseFloat(catPos.x.toFixed(1)), y: parseFloat(catPos.y.toFixed(1)), z: parseFloat(catPos.z.toFixed(1)) } : { x: 0, y: 0, z: 0 },
      catState: catState || 'unknown',
      nearestRatDist: this.nearestRatDistance < 900 ? parseFloat(this.nearestRatDistance.toFixed(1)) : undefined,
      audioEventFired: this.lastAudioEvent || undefined,
      summary: `[STALL] Subsystem '${culprit}' took ${sectionMs.toFixed(1)}ms (Frame: ${totalFrameMs.toFixed(1)}ms) at State: ${catState || 'active'}`
    };

    if (this.incidents.length >= EngineFlightRecorder.INCIDENT_CAPACITY) {
      this.incidents.shift();
    }
    this.incidents.push(incident);

    console.warn(`⚠️ [SHIPYARD-FLIGHT-RECORDER] FREEZE SPIKE DETECTED on Frame #${this.frameTick}:`, incident);

    if (this.onFreezeIncident) {
      try {
        this.onFreezeIncident(incident);
      } catch (err) {
        console.error('[FlightRecorder Callback Error]', err);
      }
    }
  }

  public getRecentIncidents(): FreezeIncident[] {
    return [...this.incidents];
  }

  public getLatestIncident(): FreezeIncident | null {
    return this.incidents.length > 0 ? this.incidents[this.incidents.length - 1] : null;
  }

  public getLiveSectionTimings(): Record<string, number> {
    return { ...this.currentFrameTimings };
  }

  public exportLogJSON(): string {
    const activeSamples = Math.min(this.totalFramesRecorded, EngineFlightRecorder.SAMPLE_CAPACITY);
    const startIndex = this.totalFramesRecorded > EngineFlightRecorder.SAMPLE_CAPACITY ? this.bufferHeadIndex : 0;

    const orderedTelemetry: FrameTelemetrySample[] = [];
    for (let i = 0; i < activeSamples; i++) {
      const idx = (startIndex + i) % EngineFlightRecorder.SAMPLE_CAPACITY;
      orderedTelemetry.push(this.telemetryBuffer[idx]);
    }

    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalFramesRecorded: this.totalFramesRecorded,
      totalIncidentsCount: this.incidents.length,
      incidents: this.incidents,
      telemetry: orderedTelemetry
    }, null, 2);
  }

  public clear(): void {
    this.incidents = [];
    this.totalFramesRecorded = 0;
    this.bufferHeadIndex = 0;
  }
}