/**
 * RemoteLogger - Automated Local Game Runtime Error & Diagnostics Bridge.
 * Transmits runtime errors, WebGL context events, and engine freeze incidents
 * directly to the local Vite dev server, which writes them to .agents/logs/game_runtime.log.
 */

export interface RemoteLogPayload {
  type: 'ERROR' | 'UNHANDLED_REJECTION' | 'WEBGL_CONTEXT_LOST' | 'WEBGL_CONTEXT_RESTORED' | 'FREEZE_SPIKE' | 'SHADER_WARN' | 'CLIPPING_ALERT' | 'PHYSICS_WARN' | 'INFO';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  details?: any;
}

export class RemoteLogger {
  private static endpoint = '/api/log';
  private static isInitialized = false;
  private static logQueue: RemoteLogPayload[] = [];
  private static isSending = false;
  private static flushTimeout: any = null;
  private static recentMessages = new Set<string>();

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
        details: { reason: String(reason) }
      });
    });

    // 3. Intercept Console Errors and Warnings for Real-Time Runtime Auditing
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
      const key = `err_${msg.slice(0, 60)}`;
      if (!this.recentMessages.has(key)) {
        this.recentMessages.add(key);
        setTimeout(() => this.recentMessages.delete(key), 3000);
        this.send({ type: 'ERROR', message: msg });
      }
    };

    const originalConsoleWarn = console.warn;
    console.warn = (...args: any[]) => {
      originalConsoleWarn.apply(console, args);
      const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
      const key = `warn_${msg.slice(0, 60)}`;
      if (!this.recentMessages.has(key)) {
        this.recentMessages.add(key);
        setTimeout(() => this.recentMessages.delete(key), 3000);
        this.send({ type: 'SHADER_WARN', message: msg });
      }
    };

    // Initial boot heartbeat
    this.send({
      type: 'INFO',
      message: 'Shipyard Cat Runtime Logger initialized on client. Local logging active.'
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
    // Deduplicate repetitive freeze spikes within 2 seconds
    const key = `${incident.culpritSection}_${incident.frameTick}`;
    if (this.recentMessages.has(key)) return;
    this.recentMessages.add(key);
    setTimeout(() => this.recentMessages.delete(key), 2000);

    this.send({
      type: 'FREEZE_SPIKE',
      message: `[Freeze Spike] Frame #${incident.frameTick}: '${incident.culpritSection}' took ${incident.sectionDurationMs}ms (Total Frame: ${incident.totalFrameMs}ms)`,
      details: incident
    });
  }

  /**
   * Logs collision clipping, penetration into obstacles, or floor drop-throughs
   */
  public static logClippingIncident(incident: {
    type: 'OBSTACLE_PENETRATION' | 'FLOOR_VOID_DROP' | 'PLATFORM_CLIPPING' | 'STUCK_IN_GEOMETRY';
    message: string;
    position: { x: number; y: number; z: number };
    floorElevation?: number;
    obstacleName?: string;
    penetrationDepth?: number;
  }): void {
    const key = `${incident.type}_${incident.obstacleName || 'floor'}_${Math.round(incident.position.x * 2)}_${Math.round(incident.position.z * 2)}`;
    if (this.recentMessages.has(key)) return;
    this.recentMessages.add(key);
    setTimeout(() => this.recentMessages.delete(key), 2500);

    this.send({
      type: 'CLIPPING_ALERT',
      message: `[Clipping Alert] ${incident.message}`,
      details: incident
    });
  }

  public static log(type: RemoteLogPayload['type'], message: string, details?: any): void {
    this.send({ type, message, details });
  }

  private static send(payload: RemoteLogPayload): void {
    this.logQueue.push(payload);
    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), 80);
    }
  }

  private static async flush(): Promise<void> {
    this.flushTimeout = null;
    if (this.logQueue.length === 0 || this.isSending) return;

    const itemsToSend = [...this.logQueue];
    this.logQueue = [];
    this.isSending = true;

    try {
      if (typeof fetch !== 'undefined') {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: itemsToSend }),
          keepalive: true
        });
      }
    } catch {
      // If server is unreachable or offline, re-enqueue
      this.logQueue.unshift(...itemsToSend);
    } finally {
      this.isSending = false;
      if (this.logQueue.length > 0) {
        this.flushTimeout = setTimeout(() => this.flush(), 250);
      }
    }
  }
}
