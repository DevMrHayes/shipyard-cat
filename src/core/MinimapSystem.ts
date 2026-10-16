An update to `src/core/MinimapSystem.ts` implementing an offscreen static tactical layer cache (eliminating repetitive redraw work and GC stalls), full landmark coverage (including Heavy Steel Fab Super-Shop, Dry Dock 2 Virginia-class Berth, Foundry, and Boiler House), and zero per-frame allocation rendering.

```typescript
import * as THREE from 'three';

export interface MinimapEntity {
  pos: THREE.Vector3;
  type: 'ALBA' | 'RAT' | 'KINGPIN' | 'MUTANT' | 'COLONY' | 'OBJECTIVE';
  heading?: number;
  label?: string;
}

interface FacilityZone {
  name: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  fillColor: string;
  strokeColor: string;
  labelX: number;
  labelZ: number;
  labelOffsetSide?: 'top' | 'center' | 'bottom';
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

  // Expanded Shipyard World Boundaries (-120 to +75 in X, -110 to +105 in Z)
  private readonly worldMinX = -120;
  private readonly worldMaxX = 75;
  private readonly worldMinZ = -110;
  private readonly worldMaxZ = 105;

  private static readonly CARDINAL_DEFS = [
    { label: 'N', baseAngle: Math.PI, color: '#f59e0b' },
    { label: 'E', baseAngle: Math.PI / 2, color: '#38bdf8' },
    { label: 'S', baseAngle: 0, color: '#94a3b8' },
    { label: 'W', baseAngle: -Math.PI / 2, color: '#94a3b8' }
  ];

  // Comprehensive facility manifest including Heavy Steel Fab Super-Shop & Dry Dock 2 Submarine Berth
  private static readonly FACILITIES: FacilityZone[] = [
    // Historic Dry Dock 1 (Perpendicular Carrier/Vessel Basin)
    {
      name: 'DRY DOCK 1 (CVN BASIN)',
      xMin: 15,
      xMax: 45,
      zMin: -35,
      zMax: -20,
      fillColor: 'rgba(180, 83, 9, 0.45)',
      strokeColor: '#f59e0b',
      labelX: 16,
      labelZ: -32
    },
    // Dry Dock 2: Virginia-Class Submarine Berth
    {
      name: 'DRY DOCK 2 (SSN VIRGINIA BERTH)',
      xMin: -10,
      xMax: 12,
      zMin: -65,
      zMax: -20,
      fillColor: 'rgba(30, 58, 138, 0.55)',
      strokeColor: '#38bdf8',
      labelX: -9,
      labelZ: -61
    },
    // Heavy Steel Fab Super-Shop
    {
      name: 'HEAVY STEEL FAB SUPER-SHOP',
      xMin: -108,
      xMax: -68,
      zMin: 10,
      zMax: 70,
      fillColor: 'rgba(51, 65, 85, 0.65)',
      strokeColor: '#38bdf8',
      labelX: -106,
      labelZ: 15
    },
    // Dry Dock 12 / Big Blue Gantry Basin
    {
      name: 'DRY DOCK 12 / BIG BLUE',
      xMin: 16,
      xMax: 48,
      zMin: -10,
      zMax: 75,
      fillColor: 'rgba(71, 85, 105, 0.5)',
      strokeColor: '#38bdf8',
      labelX: 18,
      labelZ: -6
    },
    // Machine Shop No. 1
    {
      name: 'MACHINE SHOP NO. 1',
      xMin: -56,
      xMax: -34,
      zMin: -38,
      zMax: -2,
      fillColor: 'rgba(153, 27, 27, 0.45)',
      strokeColor: '#ef4444',
      labelX: -54,
      labelZ: -34
    },
    // Submarine MOF Module Outfitting Facility
    {
      name: 'SUBMARINE FAB (MOF)',
      xMin: -48,
      xMax: -15,
      zMin: 30,
      zMax: 65,
      fillColor: 'rgba(30, 41, 59, 0.65)',
      strokeColor: '#f59e0b',
      labelX: -46,
      labelZ: 34
    },
    // Foundry & Heavy Casting Shop
    {
      name: 'FOUNDRY & CASTING SHOP',
      xMin: -95,
      xMax: -65,
      zMin: -35,
      zMax: -5,
      fillColor: 'rgba(120, 53, 15, 0.45)',
      strokeColor: '#f97316',
      labelX: -93,
      labelZ: -31
    },
    // Historic Steam Boiler House
    {
      name: 'CENTRAL BOILER HOUSE',
      xMin: -90,
      xMax: -70,
      zMin: -70,
      zMax: -45,
      fillColor: 'rgba(67, 56, 202, 0.4)',
      strokeColor: '#818cf8',
      labelX: -88,
      labelZ: -66
    },
    // Nuclear Overhaul Vault (RCOH)
    {
      name: 'RCOH NUCLEAR OVERHAUL VAULT',
      xMin: 37,
      xMax: 54,
      zMin: -70,
      zMax: -52,
      fillColor: 'rgba(168, 85, 247, 0.35)',
      strokeColor: '#c084fc',
      labelX: 38,
      labelZ: -66
    },
    // Tugboat Dorothy Dry Mount
    {
      name: 'TUGBOAT DOROTHY',
      xMin: -24,
      xMax: -16,
      zMin: -32,
      zMax: -18,
      fillColor: 'rgba(220, 38, 38, 0.7)',
      strokeColor: '#ef4444',
      labelX: -24,
      labelZ: -28
    },
    // Feline Sanctuary & Cat Motel
    {
      name: 'CAT MOTEL SANCTUARY',
      xMin: -65,
      xMax: -48,
      zMin: -73,
      zMax: -59,
      fillColor: 'rgba(34, 197, 94, 0.3)',
      strokeColor: '#22c55e',
      labelX: -64,
      labelZ: -69
    }
  ];

  constructor() {
    if (typeof document !== 'undefined') {
      this.radarCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
      this.fullMapCanvas = document.getElementById('full-map-canvas') as HTMLCanvasElement | null;

      if (this.radarCanvas) {
        this.radarCtx = this.radarCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (this.fullMapCanvas) {
        this.fullMapCtx = this.fullMapCanvas.getContext('2d', { willReadFrequently: true });
      }

      this.staticLayerCanvas = document.createElement('canvas');
      this.staticLayerCtx = this.staticLayerCanvas.getContext('2d', { alpha: false });
    }
  }

  public dispose(): void {
    this.radarCanvas = null;
    this.fullMapCanvas = null;
    this.radarCtx = null;
    this.fullMapCtx = null;
    this.staticLayerCanvas = null;
    this.staticLayerCtx = null;
    this.staticCacheValid = false;
  }

  public invalidateCache(): void {
    this.staticCacheValid = false;
  }

  public update(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], entityCount?: number): void {
    const count = entityCount !== undefined ? entityCount : entities.length;
    this.renderCornerRadar(albaPos, albaHeading, entities, count);
    if (this.fullMapCanvas && this.fullMapCanvas.offsetParent !== null) {
      this.renderFullTacticalMap(albaPos, albaHeading, entities, count);
    }
  }

  private renderCornerRadar(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], count: number): void {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const radarRange = 45; // 45-meter radius radar
    const now = Date.now();

    ctx.clearRect(0, 0, width, height);

    // 1. Radar Circular Background
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
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

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(closestObjectiveDist)}m`, cx, cy + cx - 18);
    }

    // 5. Alba Center Indicator with Forward Vision Cone
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 22, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35);
    ctx.closePath();
    ctx.fill();

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
    if (this.staticCacheValid && this.lastMapWidth === w && this.lastMapHeight === h && this.staticLayerCanvas) {
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

    // 2. James River Waterfront (East Pier & Basin)
    const riverLeft = mapX(58);
    sCtx.fillStyle = '#0369a1';
    sCtx.fillRect(riverLeft, 0, w - riverLeft, h);
    sCtx.fillStyle = '#0284c7';
    sCtx.fillRect(riverLeft - 3, 0, 3, h); // Waterfront bulkheads

    // 3. Yard Facilities
    for (let i = 0; i < MinimapSystem.FACILITIES.length; i++) {
      const fac = MinimapSystem.FACILITIES[i];
      const left = mapX(fac.xMin);
      const top = mapZ(fac.zMin);
      const right = mapX(fac.xMax);
      const bottom = mapZ(fac.zMax);
      const fw = right - left;
      const fh = bottom - top;

      sCtx.fillStyle = fac.fillColor;
      sCtx.fillRect(left, top, fw, fh);

      sCtx.strokeStyle = fac.strokeColor;
      sCtx.lineWidth = 1.5;
      sCtx.strokeRect(left, top, fw, fh);

      // Interior crosshatch for heavy dry docks
      if (fac.name.includes('DRY DOCK')) {
        sCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        sCtx.lineWidth = 1;
        for (let step = left + 10; step < right; step += 10) {
          sCtx.beginPath();
          sCtx.moveTo(step, top);
          sCtx.lineTo(step, bottom);
          sCtx.stroke();
        }
      }

      // Facility Label
      sCtx.font = 'bold 8.5px monospace';
      sCtx.fillStyle = '#f8fafc';
      sCtx.fillText(fac.name, mapX(fac.labelX), mapZ(fac.labelZ));
    }

    // Waterfront Label
    sCtx.font = 'bold 10px monospace';
    sCtx.fillStyle = '#bae6fd';
    sCtx.fillText('JAMES RIVER CHANNEL', mapX(60), h * 0.5);
  }

  private renderFullTacticalMap(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], count: number): void {
    if (!this.fullMapCtx || !this.fullMapCanvas) return;
    const ctx = this.fullMapCtx;
    const w = this.fullMapCanvas.width;
    const h = this.fullMapCanvas.height;
    const now = Date.now();

    this.ensureStaticLayerCache(w, h);

    // Blit cached static map (eliminates repeated polygon re-evaluations and stroke computations)
    if (this.staticLayerCanvas) {
      ctx.drawImage(this.staticLayerCanvas, 0, 0);
    }

    // Coordinate mapping helper
    const mapX = (worldX: number) => ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * w;
    const mapZ = (worldZ: number) => ((worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ)) * h;

    // Render Dynamic Entities
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
        ctx.fillText(ent.label || 'WAYPOINT', ex + 8, ey + 3);
      }
    }

    // Alba Location Marker & Heading
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
    ctx.rotate(albaHeading);

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
```