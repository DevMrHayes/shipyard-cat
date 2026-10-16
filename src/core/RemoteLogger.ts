/**
 * RemoteLogger - Automated Game Runtime Error & Diagnostics Bridge.
 * Transmits runtime errors, WebGL context events, and engine freeze incidents.
 * Routes to local Vite dev server endpoint (/api/log) during local development,
 * and Firebase Firestore REST API telemetry endpoint in production.
 */

export interface RemoteLogPayload {
  type:
    | 'ERROR'
    | 'UNHANDLED_REJECTION'
    | 'WEBGL_CONTEXT_LOST'
    | 'WEBGL_CONTEXT_RESTORED'
    | 'FREEZE_SPIKE'
    | 'SHADER_WARN'
    | 'CLIPPING_ALERT'
    | 'PHYSICS_WARN'
    | 'INFO';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  details?: any;
}

export interface TelemetryStats {
  queueLength: number;
  totalSent: number;
  totalDropped: number;
  lastError: string | null;
}

const MAX_QUEUE_SIZE = 25;
const FLUSH_DEBOUNCE_MS = 500;
const FAILURE_COOLDOWN_MS = 5000;
const DEDUPE_TTL_MS = 5000;

const FIRESTORE_TELEMETRY_ENDPOINT =
  'https://firestore.googleapis.com/v1/projects/shipyard-cat-game/databases/(default)/documents/game_telemetry';
const LOCAL_TELEMETRY_ENDPOINT = '/api/log';

/**
 * Safely extracts human-readable text from arbitrary values without triggering
 * circular structure TypeError exceptions on complex objects or DOM elements.
 */
function safeFormatArg(arg: any): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') return String(arg);
  if (typeof arg === 'symbol') return arg.toString();
  if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`;

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  }

  if (typeof arg === 'object') {
    if (typeof arg.message === 'string') {
      return arg.message;
    }
    try {
      if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
        return arg.toString();
      }
    } catch {
      // Fall through to property scan
    }

    try {
      const keys = Object.keys(arg).slice(0, 8);
      const entries = keys.map((key) => {
        const val = arg[key];
        const valStr =
          typeof val === 'object' && val !== null
            ? (val.message || (Array.isArray(val) ? `[Array(${val.length})]` : '[Object]'))
            : String(val);
        return `${key}: ${valStr}`;
      });
      return `{ ${entries.join(', ')} }`;
    } catch {
      return '[Unserializable Object]';
    }
  }

  return String(arg);
}

/**
 * Safe JSON serializer guarding against circular references, DOM Nodes, and Three.js scenes.
 */
function safeSerialize(data: any): string {
  const seen = new WeakSet();
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
      if (typeof Node !== 'undefined' && value instanceof Node) {
        return `[DOM ${value.nodeName}]`;
      }
      if (typeof Event !== 'undefined' && value instanceof Event) {
        return `[Event ${value.type}]`;
      }
    }
    return value;
  });
}

export class RemoteLogger {
  private static isInitialized = false;
  private static logQueue: RemoteLogPayload[] = [];
  private static isSending = false;
  private static flushTimeout: any = null;
  private static recentMessages = new Set<string>();

  private static cooldownUntil = 0;
  private static totalSent = 0;
  private static totalDropped = 0;
  private static lastError: string | null = null;

  public static init(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Capture Global Runtime Errors
    window.addEventListener('error', (event: ErrorEvent) => {
      this.send({
        type: 'ERROR',
        message: event.message || 'Uncaught Error',
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        details: { filename: event.filename, lineno: event.lineno, colno: event.colno }
      });
    });

    // 2. Capture Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      this.send({
        type: 'UNHANDLED_REJECTION',
        message: reason?.message || String(reason || 'Unhandled Promise Rejection'),
        stack: reason?.stack,
        details: { reason: safeFormatArg(reason) }
      });
    });

    // 3. Intercept Console Errors and Warnings with Safe Sanitization & 5s Deduplication
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      const msg = args.map(safeFormatArg).join(' ');
      const key = `err_${msg.slice(0, 80)}`;
      if (!this.recentMessages.has(key)) {
        this.recentMessages.add(key);
        setTimeout(() => this.recentMessages.delete(key), DEDUPE_TTL_MS);
        this.send({ type: 'ERROR', message: msg });
      }
    };

    const originalConsoleWarn = console.warn;
    console.warn = (...args: any[]) => {
      originalConsoleWarn.apply(console, args);
      const msg = args.map(safeFormatArg).join(' ');
      const key = `warn_${msg.slice(0, 80)}`;
      if (!this.recentMessages.has(key)) {
        this.recentMessages.add(key);
        setTimeout(() => this.recentMessages.delete(key), DEDUPE_TTL_MS);
        this.send({ type: 'SHADER_WARN', message: msg });
      }
    };

    // Initial boot heartbeat
    this.send({
      type: 'INFO',
      message: `Shipyard Cat Runtime Logger initialized (${this.isLocalhost() ? 'Localhost' : 'Production'}).`
    });
  }

  public static bindCanvas(canvas: HTMLCanvasElement): void {
    if (!canvas) return;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.send({
        type: 'WEBGL_CONTEXT_LOST',
        message: 'WebGL context lost detected on canvas! GPU reset or driver crash occurred.',
        details: { status: 'context_lost', time: performance.now() }
      });
    });

    canvas.addEventListener('webglcontextrestored', () => {
      this.send({
        type: 'WEBGL_CONTEXT_RESTORED',
        message: 'WebGL context restored on canvas. Rebuilding pipeline resources.',
        details: { status: 'context_restored', time: performance.now() }
      });
    });
  }

  public static logFreezeIncident(incident: any): void {
    const culprit = incident?.culpritSection ?? 'unknown';
    const tick = incident?.frameTick ?? 0;
    const key = `freeze_${culprit}_${tick}`;
    if (this.recentMessages.has(key)) return;
    this.recentMessages.add(key);
    setTimeout(() => this.recentMessages.delete(key), DEDUPE_TTL_MS);

    this.send({
      type: 'FREEZE_SPIKE',
      message: `[Freeze Spike] Frame #${tick}: '${culprit}' took ${incident?.sectionDurationMs ?? 0}ms (Total Frame: ${incident?.totalFrameMs ?? 0}ms)`,
      details: incident
    });
  }

  /**
   * Logs collision clipping, penetration into obstacles, or floor drop-throughs.
   */
  public static logClippingIncident(incident: {
    type: 'OBSTACLE_PENETRATION' | 'FLOOR_VOID_DROP' | 'PLATFORM_CLIPPING' | 'STUCK_IN_GEOMETRY';
    message: string;
    position: { x: number; y: number; z: number };
    floorElevation?: number;
    obstacleName?: string;
    penetrationDepth?: number;
  }): void {
    const posKey = incident.position
      ? `${Math.round(incident.position.x * 2)}_${Math.round(incident.position.z * 2)}`
      : '0_0';
    const key = `clip_${incident.type}_${incident.obstacleName || 'floor'}_${posKey}`;
    if (this.recentMessages.has(key)) return;
    this.recentMessages.add(key);
    setTimeout(() => this.recentMessages.delete(key), DEDUPE_TTL_MS);

    this.send({
      type: 'CLIPPING_ALERT',
      message: `[Clipping Alert] ${incident.message}`,
      details: incident
    });
  }

  public static log(type: RemoteLogPayload['type'], message: string, details?: any): void {
    this.send({ type, message, details });
  }

  public static getTelemetryStats(): TelemetryStats {
    return {
      queueLength: this.logQueue.length,
      totalSent: this.totalSent,
      totalDropped: this.totalDropped,
      lastError: this.lastError
    };
  }

  private static isLocalhost(): boolean {
    if (typeof window === 'undefined' || !window.location) return false;
    const hostname = window.location.hostname;
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    );
  }

  private static send(payload: RemoteLogPayload): void {
    this.logQueue.push(payload);

    // Hard queue safety cap: max 25 entries. Drop oldest if capacity exceeded.
    if (this.logQueue.length > MAX_QUEUE_SIZE) {
      const droppedCount = this.logQueue.length - MAX_QUEUE_SIZE;
      this.totalDropped += droppedCount;
      this.logQueue.splice(0, droppedCount);
    }

    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS);
    }
  }

  private static async flush(): Promise<void> {
    this.flushTimeout = null;
    if (this.logQueue.length === 0 || this.isSending) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < this.cooldownUntil) {
      const remaining = Math.max(100, Math.ceil(this.cooldownUntil - now));
      this.flushTimeout = setTimeout(() => this.flush(), remaining);
      return;
    }

    // Dequeue batch
    const itemsToSend = [...this.logQueue];
    this.logQueue = [];
    this.isSending = true;

    try {
      if (this.isLocalhost()) {
        await this.sendLocal(itemsToSend);
      } else {
        await this.sendProduction(itemsToSend);
      }
      this.totalSent += itemsToSend.length;
    } catch (err: any) {
      // Cooldown penalty on failure: pause network for 5 seconds
      const errMessage = err?.message || String(err || 'Unknown Network Error');
      this.lastError = errMessage;
      this.totalDropped += itemsToSend.length;
      this.cooldownUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + FAILURE_COOLDOWN_MS;
      // CRITICAL: NEVER unshift failed items back to prevent cascading memory exhaustion
    } finally {
      this.isSending = false;
      if (this.logQueue.length > 0 && !this.flushTimeout) {
        this.flushTimeout = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS);
      }
    }
  }

  private static async sendLocal(items: RemoteLogPayload[]): Promise<void> {
    if (typeof fetch === 'undefined') return;

    const res = await fetch(LOCAL_TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: safeSerialize({ entries: items }),
      keepalive: true
    });

    if (!res.ok) {
      throw new Error(`Local logger responded with status ${res.status}`);
    }
  }

  private static async sendProduction(items: RemoteLogPayload[]): Promise<void> {
    const payloadString = safeSerialize(items);
    const firestoreBody = JSON.stringify({
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        count: { integerValue: String(items.length) },
        entries: { stringValue: payloadString.slice(0, 500000) }
      }
    });

    // Attempt navigator.sendBeacon first (non-blocking transport)
    let beaconSuccess = false;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([firestoreBody], { type: 'application/json' });
        beaconSuccess = navigator.sendBeacon(FIRESTORE_TELEMETRY_ENDPOINT, blob);
      } catch {
        beaconSuccess = false;
      }
    }

    if (beaconSuccess) {
      return;
    }

    // Fall back to safe fetch with keepalive
    if (typeof fetch !== 'undefined') {
      const res = await fetch(FIRESTORE_TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: firestoreBody,
        keepalive: true,
        mode: 'cors'
      });

      if (!res.ok && res.status >= 500) {
        throw new Error(`Production logger responded with status ${res.status}`);
      }
    }
  }
}