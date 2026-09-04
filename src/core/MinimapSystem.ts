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

  // Shipyard World Boundaries (-110 to +65 in X, -100 to +90 in Z)
  private readonly worldMinX = -110;
  private readonly worldMaxX = 65;
  private readonly worldMinZ = -100;
  private readonly worldMaxZ = 90;

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

  private renderFullTacticalMap(albaPos: THREE.Vector3, albaHeading: number, entities: MinimapEntity[], count: number) {
    if (!this.fullMapCtx || !this.fullMapCanvas) return;
    const ctx = this.fullMapCtx;
    const w = this.fullMapCanvas.width;
    const h = this.fullMapCanvas.height;
    const now = Date.now();

    ctx.clearRect(0, 0, w, h);

    // Coordinate mapping helper
    const mapX = (worldX: number) => ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * w;
    const mapZ = (worldZ: number) => ((worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ)) * h;

    // 1. Blueprint Grid Background
    ctx.fillStyle = '#09131e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 25) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 2. Facility Zones & Polygons

    // James River Waterfront (East Pier)
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(mapX(55), 0, w - mapX(55), h);

    // Historic Dry Dock 1 (Perpendicular Basin Trough X:15 to 45, Z:-35 to -20)
    ctx.fillStyle = 'rgba(180, 83, 9, 0.35)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    const dd1Left = mapX(15);
    const dd1Top = mapZ(-35);
    const dd1W = mapX(45) - dd1Left;
    const dd1H = mapZ(-20) - dd1Top;
    ctx.fillRect(dd1Left, dd1Top, dd1W, dd1H);
    ctx.strokeRect(dd1Left, dd1Top, dd1W, dd1H);

    // Tugboat Dorothy Dry Mount
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(mapX(-23), mapZ(-32), mapX(-17) - mapX(-23), mapZ(-18) - mapZ(-32));

    // Dry Dock 12 / Big Blue Gantry Basin (North)
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

    // Submarine MOF Fabrication Shop
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#f59e0b';
    ctx.fillRect(mapX(-45), mapZ(30), mapX(-15) - mapX(-45), mapZ(65) - mapZ(30));
    ctx.strokeRect(mapX(-45), mapZ(30), mapX(-15) - mapX(-45), mapZ(65) - mapZ(30));

    // RCOH Nuclear Overhaul Vault
    ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
    ctx.strokeStyle = '#a855f7';
    ctx.fillRect(mapX(37), mapZ(-68), mapX(53) - mapX(37), mapZ(-52) - mapZ(-68));
    ctx.strokeRect(mapX(37), mapZ(-68), mapX(53) - mapX(37), mapZ(-52) - mapZ(-68));

    // Cat Motel Sanctuary
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.strokeStyle = '#22c55e';
    ctx.fillRect(mapX(-62), mapZ(-71), mapX(-48) - mapX(-62), mapZ(-59) - mapZ(-71));
    ctx.strokeRect(mapX(-62), mapZ(-71), mapX(-48) - mapX(-62), mapZ(-59) - mapZ(-71));

    // Facility Labels with Diegetic Badges
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('DRY DOCK 12 / BIG BLUE', ddLeft + 4, ddTop + 14);
    ctx.fillText('HISTORIC DRY DOCK 1', dd1Left + 4, dd1Top + 12);
    ctx.fillText('TUGBOAT DOROTHY', mapX(-30), mapZ(-24));
    ctx.fillText('MACHINE SHOP NO. 1', msLeft + 4, msTop + 14);
    ctx.fillText('SUBMARINE FAB (MOF)', mapX(-44), mapZ(34));
    ctx.fillText('RCOH NUCLEAR VAULT', mapX(38), mapZ(-60));
    ctx.fillText('CAT MOTEL HUB', mapX(-60), mapZ(-67));
    ctx.fillText('JAMES RIVER', mapX(58), h / 2);

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

