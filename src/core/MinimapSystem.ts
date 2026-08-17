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

  // Shipyard World Boundaries (-100 to +60 in X, -90 to +80 in Z)
  private readonly worldMinX = -110;
  private readonly worldMaxX = 65;
  private readonly worldMinZ = -100;
  private readonly worldMaxZ = 90;

  constructor() {
    if (typeof document !== 'undefined') {
      this.radarCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      this.fullMapCanvas = document.getElementById('full-map-canvas') as HTMLCanvasElement;

      if (this.radarCanvas) this.radarCtx = this.radarCanvas.getContext('2d');
      if (this.fullMapCanvas) this.fullMapCtx = this.fullMapCanvas.getContext('2d');
    }
  }

  public update(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[]) {
    this.renderCornerRadar(albaPos, albaHeading, entities);
    if (this.fullMapCanvas && this.fullMapCanvas.offsetParent !== null) {
      this.renderFullTacticalMap(albaPos, albaHeading, entities);
    }
  }

  private renderCornerRadar(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[]) {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radarRange = 45; // 45-meter radius radar

    ctx.clearRect(0, 0, width, height);

    // 1. Radar Circular Background
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
    ctx.clip();

    // Radar distance concentric rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.35, 0, Math.PI * 2);
    ctx.arc(cx, cy, cx * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
    ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    ctx.stroke();

    // 2. Draw nearby entities relative to Alba (centered)
    entities.forEach(ent => {
      if (ent.type === 'ALBA') return;

      const dx = ent.pos.x - albaPos.x;
      const dz = ent.pos.z - albaPos.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= radarRange) {
        // Rotate points with Alba's heading so radar is forward-oriented
        const angle = Math.atan2(dx, dz) - albaHeading;
        const screenDist = (dist / radarRange) * (cx - 8);
        const px = cx + Math.sin(angle) * screenDist;
        const py = cy - Math.cos(angle) * screenDist;

        ctx.beginPath();
        if (ent.type === 'RAT') {
          ctx.fillStyle = '#facc15';
          ctx.arc(px, py, 3, 0, Math.PI * 2);
        } else if (ent.type === 'KINGPIN') {
          ctx.fillStyle = '#f97316';
          ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        } else if (ent.type === 'MUTANT') {
          ctx.fillStyle = '#c084fc';
          ctx.arc(px, py, 4, 0, Math.PI * 2);
        } else if (ent.type === 'COLONY') {
          ctx.fillStyle = '#4ade80';
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        } else if (ent.type === 'OBJECTIVE') {
          ctx.fillStyle = '#38bdf8';
          ctx.arc(px, py, 5, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    });

    // 3. Alba Center Indicator (🐾 with forward heading cone)
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

  private renderFullTacticalMap(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[]) {
    if (!this.fullMapCtx || !this.fullMapCanvas) return;
    const ctx = this.fullMapCtx;
    const w = this.fullMapCanvas.width;
    const h = this.fullMapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Coordinate mapping helper
    const mapX = (worldX: number) => ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * w;
    const mapZ = (worldZ: number) => ((worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ)) * h;

    // 1. Shipyard Blueprint Background & Facility Polygons
    ctx.fillStyle = '#09131e';
    ctx.fillRect(0, 0, w, h);

    // James River Waterfront (East Pier)
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(mapX(55), 0, w - mapX(55), h);

    // Dry Dock 12 (North)
    ctx.fillStyle = 'rgba(71, 85, 105, 0.45)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    const ddLeft = mapX(3.5);
    const ddTop = mapZ(-10);
    const ddW = mapX(36.5) - ddLeft;
    const ddH = mapZ(70) - ddTop;
    ctx.fillRect(ddLeft, ddTop, ddW, ddH);
    ctx.strokeRect(ddLeft, ddTop, ddW, ddH);

    // Red Brick Machine Shop No. 1
    ctx.fillStyle = 'rgba(153, 27, 27, 0.4)';
    ctx.strokeStyle = '#ef4444';
    const msLeft = mapX(-56);
    const msTop = mapZ(-38);
    const msW = mapX(-34) - msLeft;
    const msH = mapZ(-2) - msTop;
    ctx.fillRect(msLeft, msTop, msW, msH);
    ctx.strokeRect(msLeft, msTop, msW, msH);

    // Submarine MOF Shop
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#f59e0b';
    ctx.fillRect(mapX(-45), mapZ(30), mapX(-15) - mapX(-45), mapZ(65) - mapZ(30));
    ctx.strokeRect(mapX(-45), mapZ(30), mapX(-15) - mapX(-45), mapZ(65) - mapZ(30));

    // Cat Motel Sanctuary
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.strokeStyle = '#22c55e';
    ctx.fillRect(mapX(-62), mapZ(-71), mapX(-48) - mapX(-62), mapZ(-59) - mapZ(-71));
    ctx.strokeRect(mapX(-62), mapZ(-71), mapX(-48) - mapX(-62), mapZ(-59) - mapZ(-71));

    // Facility Labels
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('DRY DOCK 12 / BIG BLUE', ddLeft + 4, ddTop + 14);
    ctx.fillText('MACHINE SHOP NO. 1', msLeft + 4, msTop + 14);
    ctx.fillText('SUBMARINE FAB (MOF)', mapX(-44), mapZ(34));
    ctx.fillText('CAT MOTEL HUB', mapX(-60), mapZ(-67));
    ctx.fillText('JAMES RIVER', mapX(58), h / 2);

    // 2. Render Entities on Map
    entities.forEach(ent => {
      const ex = mapX(ent.pos.x);
      const ey = mapZ(ent.pos.z);

      ctx.beginPath();
      if (ent.type === 'RAT') {
        ctx.fillStyle = '#facc15';
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      } else if (ent.type === 'KINGPIN') {
        ctx.fillStyle = '#f97316';
        ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
      } else if (ent.type === 'MUTANT') {
        ctx.fillStyle = '#c084fc';
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      } else if (ent.type === 'COLONY') {
        ctx.fillStyle = '#4ade80';
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      } else if (ent.type === 'OBJECTIVE') {
        ctx.fillStyle = '#38bdf8';
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      }
      ctx.fill();
    });

    // 3. Alba Location Marker with Heading Needle
    const ax = mapX(albaPos.x);
    const ay = mapZ(albaPos.z);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(albaHeading); // Points directly in Alba's true forward direction

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(-6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Alba Pulsing Halo
    ctx.beginPath();
    ctx.arc(ax, ay, 8 + Math.sin(Date.now() * 0.005) * 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
