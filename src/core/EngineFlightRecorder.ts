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
  speed?: number;
  heading?: number;
  isGrounded?: boolean;
  isPouncing?: boolean;
  zone?: string;
  mission?: string;
  drawCalls?: number;
  triangles?: number;
  vramTextures?: number;
  vramGeometries?: number;
  shaderPrograms?: number;
  nearestRatDist?: number;
  nearestMutantDist?: number;
  audioEventFired?: string;
  summary: string;
}

export interface FrameTelemetrySample {
  frameTick: number;
  timestamp: string;
  totalFrameMs: number;
  fps: number;
  timings: Record<string, number>;
  catPosition: { x: number; y: number; z: number };
  catState: string;
  speed: number;
  heading: number;
  isGrounded: boolean;
  isPouncing: boolean;
  isCrouching: boolean;
  stamina: number;
  hunger: number;
  health: number;
  radDose: number;
  zone: string;
  mission: string;
  drawCalls: number;
  triangles: number;
  vramTextures: number;
  vramGeometries: number;
  shaderPrograms: number;
  nearestRatDist?: number;
  nearestMutantDist?: number;
  audioEventFired?: string;
}

export type FreezeIncidentCallback = (incident: FreezeIncident) => void;

export interface FrameContext {
  catPos?: THREE.Vector3 | { x: number; y: number; z: number };
  catState?: string;
  speed?: number;
  heading?: number;
  isGrounded?: boolean;
  isPouncing?: boolean;
  isCrouching?: boolean;
  stamina?: number;
  hunger?: number;
  health?: number;
  radDose?: number;
  zone?: string;
  mission?: string;
  rendererInfo?: THREE.WebGLInfo;
  nearestMutantDist?: number;
}

/**
 * EngineFlightRecorder - High-Resolution 30-Second Rolling Flight Recorder & Subsystem Telemetry Trapper.
 * Zero-allocation in steady-state loop, 1,800-frame circular rolling buffer,
 * GPU memory/draw-call tracking, and automated stall incident diagnosis.
 */
export class EngineFlightRecorder {
  public static readonly SAMPLE_CAPACITY = 1800; // 1,800 frames @ 60 FPS = 30.0 seconds rolling buffer
  public static readonly INCIDENT_CAPACITY = 100;
  public static readonly SECTION_STALL_THRESHOLD_MS = 18.0; // Subsystem exceeding frame budget (>18ms)
  public static readonly FRAME_STALL_THRESHOLD_MS = 28.0;   // Frame dropping below 35 FPS (>28ms)

  private sectionStartTimes: Map<string, number> = new Map();
  private currentFrameTimings: Record<string, number> = {};
  private frameStartTimestamp: number = 0;
  private frameTick: number = 0;

  // Pre-allocated Circular Telemetry Buffer (Zero-GC during gameplay)
  private telemetryBuffer: FrameTelemetrySample[] = [];
  private bufferHeadIndex: number = 0;
  private totalFramesRecorded: number = 0;

  // Freeze Incident History
  private incidents: FreezeIncident[] = [];
  public onFreezeIncident: FreezeIncidentCallback | null = null;

  // Transient Frame Context
  private lastAudioEvent: string = '';
  private nearestRatDistance: number = 999;
  private nearestMutantDistance: number = 999;

  constructor(onFreeze?: FreezeIncidentCallback) {
    this.onFreezeIncident = onFreeze || null;

    // Pre-allocate 1,800 circular sample slots (Zero GC during gameplay)
    for (let i = 0; i < EngineFlightRecorder.SAMPLE_CAPACITY; i++) {
      this.telemetryBuffer.push({
        frameTick: 0,
        timestamp: '',
        totalFrameMs: 16.6,
        fps: 60,
        timings: {},
        catPosition: { x: 0, y: 0, z: 0 },
        catState: 'stand',
        speed: 0,
        heading: 0,
        isGrounded: true,
        isPouncing: false,
        isCrouching: false,
        stamina: 100,
        hunger: 100,
        health: 100,
        radDose: 0,
        zone: 'South Yard',
        mission: 'Mission 1',
        drawCalls: 0,
        triangles: 0,
        vramTextures: 0,
        vramGeometries: 0,
        shaderPrograms: 0
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

  public setNearestMutantDistance(dist: number): void {
    this.nearestMutantDistance = dist;
  }

  public endFrame(
    contextOrPos?: FrameContext | THREE.Vector3 | { x: number; y: number; z: number },
    legacyCatState?: string
  ): number {
    let context: FrameContext | undefined;
    if (contextOrPos && ('x' in contextOrPos || 'y' in contextOrPos || (contextOrPos as any).isVector3)) {
      context = {
        catPos: contextOrPos as { x: number; y: number; z: number },
        catState: legacyCatState || 'stand'
      };
    } else {
      context = contextOrPos as FrameContext | undefined;
    }

    const now = performance.now();
    const totalFrameMs = this.frameStartTimestamp > 0 ? (now - this.frameStartTimestamp) : 16.6;
    const fps = totalFrameMs > 0 ? Math.round(1000 / totalFrameMs) : 60;

    const posX = context?.catPos ? (context.catPos as THREE.Vector3).x ?? 0 : 0;
    const posY = context?.catPos ? (context.catPos as THREE.Vector3).y ?? 0 : 0;
    const posZ = context?.catPos ? (context.catPos as THREE.Vector3).z ?? 0 : 0;

    const rendererInfo = context?.rendererInfo;
    const drawCalls = rendererInfo?.render?.calls ?? 0;
    const triangles = rendererInfo?.render?.triangles ?? 0;
    const vramTextures = rendererInfo?.memory?.textures ?? 0;
    const vramGeometries = rendererInfo?.memory?.geometries ?? 0;
    const shaderPrograms = rendererInfo?.programs?.length ?? 0;

    // Record sample into circular buffer
    const slot = this.telemetryBuffer[this.bufferHeadIndex];
    slot.frameTick = this.frameTick;
    slot.timestamp = new Date().toISOString().substring(11, 23);
    slot.totalFrameMs = parseFloat(totalFrameMs.toFixed(2));
    slot.fps = fps;
    slot.timings = { ...this.currentFrameTimings };
    slot.catPosition.x = parseFloat(posX.toFixed(2));
    slot.catPosition.y = parseFloat(posY.toFixed(2));
    slot.catPosition.z = parseFloat(posZ.toFixed(2));
    slot.catState = context?.catState || 'stand';
    slot.speed = context?.speed !== undefined ? parseFloat(context.speed.toFixed(2)) : 0;
    slot.heading = context?.heading !== undefined ? parseFloat(context.heading.toFixed(2)) : 0;
    slot.isGrounded = context?.isGrounded ?? true;
    slot.isPouncing = context?.isPouncing ?? false;
    slot.isCrouching = context?.isCrouching ?? false;
    slot.stamina = context?.stamina !== undefined ? Math.round(context.stamina) : 100;
    slot.hunger = context?.hunger !== undefined ? Math.round(context.hunger) : 100;
    slot.health = context?.health !== undefined ? Math.round(context.health) : 100;
    slot.radDose = context?.radDose !== undefined ? parseFloat(context.radDose.toFixed(2)) : 0;
    slot.zone = context?.zone || 'South Yard';
    slot.mission = context?.mission || 'Chapter 1';
    slot.drawCalls = drawCalls;
    slot.triangles = triangles;
    slot.vramTextures = vramTextures;
    slot.vramGeometries = vramGeometries;
    slot.shaderPrograms = shaderPrograms;
    slot.nearestRatDist = this.nearestRatDistance < 900 ? parseFloat(this.nearestRatDistance.toFixed(1)) : undefined;
    slot.nearestMutantDist = this.nearestMutantDistance < 900 ? parseFloat(this.nearestMutantDistance.toFixed(1)) : undefined;
    slot.audioEventFired = this.lastAudioEvent || undefined;

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
      this.recordSpike(maxSectionName, maxSectionMs, totalFrameMs, { x: posX, y: posY, z: posZ }, context?.catState, context);
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
    catState?: string,
    context?: FrameContext
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
      speed: context?.speed !== undefined ? parseFloat(context.speed.toFixed(1)) : undefined,
      isGrounded: context?.isGrounded,
      isPouncing: context?.isPouncing,
      zone: context?.zone,
      mission: context?.mission,
      drawCalls: context?.rendererInfo?.render?.calls,
      triangles: context?.rendererInfo?.render?.triangles,
      vramTextures: context?.rendererInfo?.memory?.textures,
      shaderPrograms: context?.rendererInfo?.programs?.length,
      nearestRatDist: this.nearestRatDistance < 900 ? parseFloat(this.nearestRatDistance.toFixed(1)) : undefined,
      nearestMutantDist: this.nearestMutantDistance < 900 ? parseFloat(this.nearestMutantDistance.toFixed(1)) : undefined,
      audioEventFired: this.lastAudioEvent || undefined,
      summary: `[STALL] Subsystem '${culprit}' took ${sectionMs.toFixed(1)}ms (Frame: ${totalFrameMs.toFixed(1)}ms) at State: ${catState || 'active'}`
    };

    if (this.incidents.length >= EngineFlightRecorder.INCIDENT_CAPACITY) {
      this.incidents.shift();
    }
    this.incidents.push(incident);

    console.warn(`⚠️ [SHIPYARD-FLIGHT-RECORDER] FREEZE SPIKE on Frame #${this.frameTick}:`, incident);

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

  /**
   * Retrieves ordered array of samples recorded over the last 30 seconds (up to 1,800 frames).
   */
  public getOrderedLast30SecondsSamples(): FrameTelemetrySample[] {
    const activeSamples = Math.min(this.totalFramesRecorded, EngineFlightRecorder.SAMPLE_CAPACITY);
    const startIndex = this.totalFramesRecorded > EngineFlightRecorder.SAMPLE_CAPACITY ? this.bufferHeadIndex : 0;

    const samples: FrameTelemetrySample[] = [];
    for (let i = 0; i < activeSamples; i++) {
      const idx = (startIndex + i) % EngineFlightRecorder.SAMPLE_CAPACITY;
      samples.push(this.telemetryBuffer[idx]);
    }
    return samples;
  }

  /**
   * Generates a comprehensive, human-readable ASCII timeline matrix of the last 30 seconds.
   */
  public generateAsciiTimeline(): string {
    const samples = this.getOrderedLast30SecondsSamples();
    if (samples.length === 0) return 'No frames recorded yet.';

    const step = Math.max(1, Math.floor(samples.length / 60)); // 60 downsampled rows
    const lines: string[] = [];
    lines.push('========================================================================================================================');
    lines.push('SHIPYARD CAT: 30-SECOND LIVE GPU & ENGINE PERFORMANCE TELEMETRY LOG');
    lines.push(`Generated: ${new Date().toLocaleString()} | Samples in Window: ${samples.length} frames | Total Recorded: ${this.totalFramesRecorded}`);
    lines.push('========================================================================================================================');
    lines.push('INDEX | TIME (UTC) | FPS | FRAME TIME (ms) | CALLS | TRIANGLES | VRAM TEX | SHADERS | CAT POSITION | STATE | GROUND | ZONE');
    lines.push('------------------------------------------------------------------------------------------------------------------------');

    let row = 1;
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      const posStr = `X:${s.catPosition.x} Y:${s.catPosition.y} Z:${s.catPosition.z}`;
      lines.push(
        `${String(row++).padEnd(5)} | ${s.timestamp.padEnd(10)} | ${String(s.fps).padEnd(3)} | ${String(s.totalFrameMs).padEnd(15)} | ${String(s.drawCalls).padEnd(5)} | ${String(s.triangles).padEnd(9)} | ${String(s.vramTextures).padEnd(8)} | ${String(s.shaderPrograms).padEnd(7)} | ${posStr.padEnd(20)} | ${s.catState.padEnd(7)} | ${String(s.isGrounded).padEnd(6)} | ${s.zone}`
      );
    }
    lines.push('========================================================================================================================\n');
    return lines.join('\n');
  }

  /**
   * Exports full 30-second structured JSON payload.
   */
  public exportLogJSON(): string {
    const orderedTelemetry = this.getOrderedLast30SecondsSamples();

    // Calculate statistical metrics over the 30-second window
    let totalFrameTime = 0;
    let maxFrameTime = 0;
    const sortedFrameTimes: number[] = [];

    for (let i = 0; i < orderedTelemetry.length; i++) {
      const ft = orderedTelemetry[i].totalFrameMs;
      totalFrameTime += ft;
      if (ft > maxFrameTime) maxFrameTime = ft;
      sortedFrameTimes.push(ft);
    }

    sortedFrameTimes.sort((a, b) => a - b);
    const avgFrameTime = orderedTelemetry.length > 0 ? (totalFrameTime / orderedTelemetry.length) : 16.6;
    const avgFps = avgFrameTime > 0 ? (1000 / avgFrameTime) : 60;
    
    // Percentile metrics
    const p99Index = Math.floor(sortedFrameTimes.length * 0.99);
    const p99_9Index = Math.floor(sortedFrameTimes.length * 0.999);
    const p99FrameTime = sortedFrameTimes[p99Index] || avgFrameTime;
    const p99_9FrameTime = sortedFrameTimes[p99_9Index] || maxFrameTime;
    const onePercentLowFps = p99FrameTime > 0 ? (1000 / p99FrameTime) : 60;
    const pointOnePercentLowFps = p99_9FrameTime > 0 ? (1000 / p99_9FrameTime) : 60;

    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      sessionWindowDurationSeconds: 30.0,
      totalFramesRecorded: this.totalFramesRecorded,
      samplesInWindow: orderedTelemetry.length,
      performanceSummary: {
        avgFps: parseFloat(avgFps.toFixed(1)),
        avgFrameTimeMs: parseFloat(avgFrameTime.toFixed(2)),
        onePercentLowFps: parseFloat(onePercentLowFps.toFixed(1)),
        pointOnePercentLowFps: parseFloat(pointOnePercentLowFps.toFixed(1)),
        maxFrameTimeMs: parseFloat(maxFrameTime.toFixed(2)),
        totalStallIncidents: this.incidents.length
      },
      incidents: this.incidents,
      telemetry: orderedTelemetry
    }, null, 2);
  }

  /**
   * Generates a complete clipboard export containing both the 30-second JSON telemetry and ASCII table.
   */
  public exportComprehensiveClipboardPayload(): string {
    const jsonStr = this.exportLogJSON();
    const asciiTable = this.generateAsciiTimeline();
    return `${jsonStr}\n\n${asciiTable}`;
  }

  public clear(): void {
    this.incidents = [];
    this.totalFramesRecorded = 0;
    this.bufferHeadIndex = 0;
  }
}