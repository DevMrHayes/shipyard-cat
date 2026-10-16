import * as THREE from 'three';

export interface MinimapEntity {
  pos: THREE.Vector3;
  type: 'ALBA' | 'RAT' | 'KINGPIN' | 'MUTANT' | 'COLONY' | 'OBJECTIVE';
  heading?: number;
  label?: string;
}

export class MinimapSystem {
  private radarCanvas: HTMLCanvasElement | null = null;
  private fullMapCanvas: HTMLCanvasElement | null = null;
  private radarCtx: CanvasRenderingContext2D | null = null;
  private fullMapCtx: CanvasRenderingContext2D | null = null;

  // Cached Static Blueprint Background Layer to prevent GC thrashing & draw spikes
  private staticLayerCanvas: HTMLCanvasElement | null = null;
  private staticLayerCtx: CanvasRenderingContext2D | null = null;
  private staticCacheValid = false;
  private lastMapWidth = 0;
  private lastMapHeight = 0;

  // Expanded Shipyard World Boundaries (-225 to +65 in X, -115 to +305 in Z)
  private readonly worldMinX = -225;
  private readonly worldMaxX = 65;
  private readonly worldMinZ = -115;
  private readonly worldMaxZ = 305;

  constructor() {
    if (typeof document !== 'undefined') {
      this.radarCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      this.fullMapCanvas = document.getElementById('full-map-canvas') as HTMLCanvasElement;

      if (this.radarCanvas) this.radarCtx = this.radarCanvas.getContext('2d', { willReadFrequently: true });
      if (this.fullMapCanvas) this.fullMapCtx = this.fullMapCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  private static readonly CARDINAL_DEFS = [
    { label: 'N', baseAngle: Math.PI, color: '#f59e0b' },
    { label: 'E', baseAngle: Math.PI / 2, color: '#38bdf8' },
    { label: 'S', baseAngle: 0, color: '#94a3b8' },
    { label: 'W', baseAngle: -Math.PI / 2, color: '#94a3b8' }
  ];

  public dispose(): void {
    this.radarCanvas = null;
    this.fullMapCanvas = null;
    this.radarCtx = null;
    this.fullMapCtx = null;
    this.staticLayerCanvas = null;
    this.staticLayerCtx = null;
    this.staticCacheValid = false;
  }

  public update(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], entityCount?: number) {
    const count = entityCount !== undefined ? entityCount : entities.length;
    this.renderCornerRadar(albaPos, albaHeading, entities, count);
    if (this.fullMapCanvas && this.fullMapCanvas.offsetParent !== null) {
      this.renderFullTacticalMap(albaPos, albaHeading, entities, count);
    }
  }

  private renderCornerRadar(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], count: number) {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radarRange = 45; // 45-meter radius radar
    const now = Date.now();

    ctx.clearRect(0, 0, width, height);

    // 1. Radar Circular Background with Brass / Cyan Glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
    ctx.clip();

    // Radar distance concentric rings (15m, 30m, 45m)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, (15 / radarRange) * (cx - 8), 0, Math.PI * 2);
    ctx.arc(cx, cy, (30 / radarRange) * (cx - 8), 0, Math.PI * 2);
    ctx.stroke();

    // Rotating Radar Sweep Line
    const sweepAngle = (now * 0.0025) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * cx, cy + Math.sin(sweepAngle) * cx);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
    ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    ctx.stroke();

    // 2. Rotating Compass Cardinals (N, E, S, W)
    // World coordinates: +X is East (River), -Z is North, +Z is South, -X is West
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cardDist = cx - 8;
    for (let c = 0; c < MinimapSystem.CARDINAL_DEFS.length; c++) {
      const card = MinimapSystem.CARDINAL_DEFS[c];
      const angle = card.baseAngle - albaHeading;
      const cpx = cx + Math.sin(angle) * cardDist;
      const cpy = cy - Math.cos(angle) * cardDist;
      ctx.fillStyle = card.color;
      ctx.fillText(card.label, cpx, cpy);
    }

    // 3. Draw nearby entities relative to Alba (centered)
    let closestObjectiveDist: number | null = null;
    let closestObjectiveAngle: number | null = null;

    for (let i = 0; i < count; i++) {
      const ent = entities[i];
      if (!ent || ent.type === 'ALBA') continue;

      const dx = ent.pos.x - albaPos.x;
      const dz = ent.pos.z - albaPos.z;
      const dist = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz) - albaHeading;

      if (ent.type === 'OBJECTIVE') {
        closestObjectiveDist = dist;
        closestObjectiveAngle = angle;
      }

      if (dist <= radarRange) {
        const screenDist = (dist / radarRange) * (cx - 10);
        const px = cx + Math.sin(angle) * screenDist;
        const py = cy - Math.cos(angle) * screenDist;

        ctx.beginPath();
        if (ent.type === 'RAT') {
          ctx.fillStyle = '#facc15';
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'KINGPIN') {
          // Boss pulsating marker
          const kingpinPulse = 5 + Math.sin(now * 0.008) * 1.5;
          ctx.fillStyle = '#f97316';
          ctx.arc(px, py, kingpinPulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (ent.type === 'MUTANT') {
          ctx.fillStyle = '#c084fc';
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'COLONY') {
          ctx.fillStyle = '#4ade80';
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'OBJECTIVE') {
          // Golden Waypoint Beacon Diamond & Pulsing Sonar Ring
          const pulse = 4 + Math.sin(now * 0.006) * 2;
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.arc(px, py, pulse + 3, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(px, py - 5);
          ctx.lineTo(px + 5, py);
          ctx.lineTo(px, py + 5);
          ctx.lineTo(px - 5, py);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 4. Off-screen Objective Waypoint Edge Pointer
    if (closestObjectiveDist !== null && closestObjectiveAngle !== null && closestObjectiveDist > radarRange) {
      const edgeRadius = cx - 9;
      const epx = cx + Math.sin(closestObjectiveAngle) * edgeRadius;
      const epy = cy - Math.cos(closestObjectiveAngle) * edgeRadius;

      ctx.save();
      ctx.translate(epx, epy);
      ctx.rotate(-closestObjectiveAngle + Math.PI);

      // Gold Arrow
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Distance Text
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(closestObjectiveDist)}m`, cx, cy + cx - 18);
    }

    // 5. Alba Center Indicator with Forward Vision Cone
    // Forward Vision Cone (35-degree field)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 22, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35);
    ctx.closePath();
    ctx.fill();

    // Alba Arrow
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private ensureStaticLayerCache(w: number, h: number): void {
    if (this.staticCacheValid && this.staticLayerCanvas && this.lastMapWidth === w && this.lastMapHeight === h) {
      return;
    }

    if (!this.staticLayerCanvas || !this.staticLayerCtx) {
      this.staticLayerCanvas = document.createElement('canvas');
      this.staticLayerCtx = this.staticLayerCanvas.getContext('2d', { alpha: false });
    }

    this.staticLayerCanvas.width = w;
    this.staticLayerCanvas.height = h;
    const sCtx = this.staticLayerCtx;
    if (!sCtx) return;

    this.lastMapWidth = w;
    this.lastMapHeight = h;
    this.staticCacheValid = true;

    const mapX = (worldX: number) => ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * w;
    const mapZ = (worldZ: number) => ((worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ)) * h;

    // 1. Blueprint Grid & Foundation
    sCtx.fillStyle = '#060e17';
    sCtx.fillRect(0, 0, w, h);

    sCtx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    sCtx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      sCtx.beginPath();
      sCtx.moveTo(x, 0);
      sCtx.lineTo(x, h);
      sCtx.stroke();
    }
    for (let y = 0; y < h; y += 25) {
      sCtx.beginPath();
      sCtx.moveTo(0, y);
      sCtx.lineTo(w, y);
      sCtx.stroke();
    }

    // 2. James River Waterfront (East Pier & Deepwater Basin)
    const riverLeft = mapX(56.5);
    sCtx.fillStyle = '#0369a1';
    sCtx.fillRect(riverLeft, 0, w - riverLeft, h);
    sCtx.fillStyle = '#0284c7';
    sCtx.fillRect(riverLeft - 3, 0, 3, h); // Waterfront bulkheads

    // 2B. Outer Perimeter Security Fence (Dashed Yellow Boundary Line)
    const fenceMinX = mapX(-220);
    const fenceMaxX = mapX(56.5);
    const fenceMinZ = mapZ(-105);
    const fenceMaxZ = mapZ(300);
    sCtx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    sCtx.lineWidth = 1.5;
    sCtx.setLineDash([4, 4]);
    sCtx.strokeRect(fenceMinX, fenceMinZ, fenceMaxX - fenceMinX, fenceMaxZ - fenceMinZ);
    sCtx.setLineDash([]);

    // 3. Complete Yard Facility Polygons
    const facilities = [
      { name: 'DRY DOCK 1 (CVN BASIN)', xMin: 15, xMax: 45, zMin: -35, zMax: -20, fill: 'rgba(180, 83, 9, 0.35)', stroke: '#f59e0b' },
      { name: 'TUGBOAT DOROTHY', xMin: -23, xMax: -17, zMin: -32, zMax: -18, fill: '#991b1b', stroke: '#ef4444' },
      { name: 'DRY DOCK 12 / BIG BLUE', xMin: 3.5, xMax: 36.5, zMin: -10, zMax: 70, fill: 'rgba(71, 85, 105, 0.45)', stroke: '#38bdf8' },
      { name: 'CVN-80 SUPERSTRUCTURE', xMin: 8, xMax: 32, zMin: 10, zMax: 65, fill: 'rgba(59, 130, 246, 0.35)', stroke: '#60a5fa' },
      { name: 'MACHINE SHOP NO. 1', xMin: -56, xMax: -34, zMin: -38, zMax: -2, fill: 'rgba(153, 27, 27, 0.4)', stroke: '#ef4444' },
      { name: 'SUBMARINE MOF FAB', xMin: -45, xMax: -15, zMin: 30, zMax: 65, fill: 'rgba(30, 41, 59, 0.6)', stroke: '#f59e0b' },
      { name: 'RCOH NUCLEAR VAULT', xMin: 37, xMax: 53, zMin: -68, zMax: -52, fill: 'rgba(168, 85, 247, 0.25)', stroke: '#a855f7' },
      { name: 'CAT MOTEL SANCTUARY', xMin: -62, xMax: -48, zMin: -71, zMax: -59, fill: 'rgba(34, 197, 94, 0.25)', stroke: '#22c55e' },
      { name: 'JMAF ASSEMBLY SHOP', xMin: -65, xMax: -45, zMin: -15, zMax: 5, fill: 'rgba(217, 119, 6, 0.35)', stroke: '#d97706' },
      { name: 'THE APPRENTICE SCHOOL', xMin: -65, xMax: -45, zMin: -60, zMax: -40, fill: 'rgba(14, 165, 233, 0.25)', stroke: '#0ea5e9' },
      { name: 'PIPE FAB & SPOOL DEPOT', xMin: -95, xMax: -45, zMin: -95, zMax: -30, fill: 'rgba(100, 116, 139, 0.35)', stroke: '#94a3b8' },
      { name: 'PLATE BENDING & BLAST', xMin: -95, xMax: -50, zMin: -15, zMax: 30, fill: 'rgba(120, 53, 15, 0.35)', stroke: '#b45309' },
      { name: 'GATE 4 BADGE CHECKPOINT', xMin: -108, xMax: -102, zMin: -5, zMax: 5, fill: 'rgba(234, 179, 8, 0.45)', stroke: '#eab308' },
      { name: 'RAIL MARSHALING YARD', xMin: -65, xMax: 30, zMin: 65, zMax: 100, fill: 'rgba(51, 65, 85, 0.45)', stroke: '#64748b' },
      { name: 'DRY DOCK 2 (SSN VIRGINIA)', xMin: -202, xMax: -158, zMin: 40, zMax: 180, fill: 'rgba(15, 43, 53, 0.75)', stroke: '#22d3ee' },
      { name: 'HEAVY STEEL FAB SUPER-SHOP', xMin: -148, xMax: -82, zMin: 190, zMax: 290, fill: 'rgba(88, 28, 135, 0.45)', stroke: '#c084fc' }
    ];

    for (const fac of facilities) {
      const left = mapX(fac.xMin);
      const top = mapZ(fac.zMin);
      const fw = mapX(fac.xMax) - left;
      const fh = mapZ(fac.zMax) - top;

      sCtx.fillStyle = fac.fill;
      sCtx.fillRect(left, top, fw, fh);

      sCtx.strokeStyle = fac.stroke;
      sCtx.lineWidth = 1.5;
      sCtx.strokeRect(left, top, fw, fh);

      sCtx.font = 'bold 8.5px monospace';
      sCtx.fillStyle = '#f8fafc';
      sCtx.fillText(fac.name, left + 4, top + 12);
    }

    sCtx.font = 'bold 10px monospace';
    sCtx.fillStyle = '#bae6fd';
    sCtx.fillText('JAMES RIVER CHANNEL', mapX(58), h * 0.5);
  }

  private renderFullTacticalMap(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], count: number) {
    if (!this.fullMapCtx || !this.fullMapCanvas) return;
    const ctx = this.fullMapCtx;
    const w = this.fullMapCanvas.width;
    const h = this.fullMapCanvas.height;
    const now = Date.now();

    this.ensureStaticLayerCache(w, h);
    if (this.staticLayerCanvas) {
      ctx.drawImage(this.staticLayerCanvas, 0, 0);
    }

    // Coordinate mapping helper
    const mapX = (worldX: number) => ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * w;
    const mapZ = (worldZ: number) => ((worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ)) * h;

    // 3. Render Entities on Map
    for (let i = 0; i < count; i++) {
      const ent = entities[i];
      if (!ent) continue;
      const ex = mapX(ent.pos.x);
      const ey = mapZ(ent.pos.z);

      ctx.beginPath();
      if (ent.type === 'RAT') {
        ctx.fillStyle = '#facc15';
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.type === 'KINGPIN') {
        ctx.fillStyle = '#f97316';
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (ent.type === 'MUTANT') {
        ctx.fillStyle = '#c084fc';
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.type === 'COLONY') {
        ctx.fillStyle = '#4ade80';
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.type === 'OBJECTIVE') {
        // Golden Waypoint Pulsing Target Reticle
        const pulse = 6 + Math.sin(now * 0.005) * 3;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#fef08a';
        ctx.fillText('WAYPOINT', ex + 8, ey + 3);
      }
    }

    // 4. Alba Location Marker with Heading Needle & Field of View
    const ax = mapX(albaPos.x);
    const ay = mapZ(albaPos.z);

    // Alba Pulsing Halo
    ctx.beginPath();
    ctx.arc(ax, ay, 8 + Math.sin(now * 0.005) * 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(albaHeading); // Points directly in Alba's forward direction

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(-6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

