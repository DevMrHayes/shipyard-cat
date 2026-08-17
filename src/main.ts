import './style.css';
import * as THREE from 'three';
import { GameEngine } from './game/GameEngine';
import { CatCharacter } from './game/CatCharacter';
import { RatEntity } from './game/RatEntity';
import { TestRunner, TestResult } from './tests/TestRunner';
import { CatVitals } from './core/VitalsSystem';
import { ShipbuildingAssistEvent } from './core/AssistanceEngine';
import { soundEngine } from './core/SoundEngine';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) return;

  // Register High-Performance Asset Cache Service Worker
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[SW Registration Note]', err);
    });
  }

  // Loading Screen Elements
  const loadingScreen = document.getElementById('loading-screen') as HTMLElement;
  const loadingProgressBar = document.getElementById('loading-progress-bar') as HTMLElement;
  const loadingStatusText = document.getElementById('loading-status-text') as HTMLElement;
  const btnEnterGame = document.getElementById('btn-enter-game') as HTMLButtonElement;

  // Simulate smooth asset staging progress
  let loadProgress = 20;
  const loadInterval = setInterval(() => {
    loadProgress += 25;
    if (loadingProgressBar) loadingProgressBar.style.width = `${Math.min(100, loadProgress)}%`;
    
    if (loadProgress === 45 && loadingStatusText) {
      loadingStatusText.textContent = 'Rigging Alba (Master Mouser) & Shipyard Vermin...';
    } else if (loadProgress === 70 && loadingStatusText) {
      loadingStatusText.textContent = 'Calibrating Dosimeter & Historic Dry Docks...';
    } else if (loadProgress >= 100) {
      clearInterval(loadInterval);
      if (loadingStatusText) loadingStatusText.textContent = 'Ready to Patrol the Yard!';
      if (btnEnterGame) {
        btnEnterGame.style.display = 'inline-block';
        btnEnterGame.onclick = () => {
          soundEngine.playPurr();
          loadingScreen.style.opacity = '0';
          setTimeout(() => {
            loadingScreen.style.display = 'none';
          }, 800);
        };
      }
    }
  }, 250);

  let game: GameEngine;
  try {
    game = new GameEngine(container);
    game.onFrameUpdate = () => {
      updatePerformanceProfiler();
    };
  } catch (err: any) {
    console.error('[Shipyard Cat Fatal Init]', err);
    const fallback = document.getElementById('engine-error-fallback');
    if (fallback) {
      fallback.style.display = 'flex';
      const msgEl = document.getElementById('engine-error-msg');
      if (msgEl) msgEl.textContent = 'Engine WebGL initialization failed: ' + (err.message || String(err));
    }
    return;
  }

  // UI Element References
  const staminaFill = document.getElementById('stamina-fill') as HTMLElement;
  const hungerFill = document.getElementById('hunger-fill') as HTMLElement;
  const healthFill = document.getElementById('health-fill') as HTMLElement;
  const radVal = document.getElementById('rad-val') as HTMLElement;
  const missionTitle = document.getElementById('mission-title') as HTMLElement;
  const missionSubtitle = document.getElementById('mission-subtitle') as HTMLElement;
  const objectiveList = document.getElementById('objective-list') as HTMLElement;
  const toastContainer = document.getElementById('toast-container') as HTMLElement;

  const btnWhiskers = document.getElementById('btn-whiskers') as HTMLButtonElement;
  const btnMeow = document.getElementById('btn-meow') as HTMLButtonElement;
  const btnPounce = document.getElementById('btn-pounce') as HTMLButtonElement;
  const btnGallery = document.getElementById('btn-gallery') as HTMLButtonElement;
  const btnTests = document.getElementById('btn-tests') as HTMLButtonElement;
  const btnRerunTests = document.getElementById('btn-rerun-tests') as HTMLButtonElement;

  const modalTests = document.getElementById('modal-tests') as HTMLElement;
  const modalGallery = document.getElementById('modal-gallery') as HTMLElement;
  const testResultsList = document.getElementById('test-results-list') as HTMLElement;
  const commsLogList = document.getElementById('comms-log-list') as HTMLElement;

  const dialogueArchive: { speaker: string; text: string; time: string }[] = [];

  // 1. Toast Notification System with Stacking Queue (No Overlaps)
  interface QueuedToast {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warn';
  }
  const toastQueue: QueuedToast[] = [];
  let isToastDisplaying = false;

  function showToast(title: string, message: string, type: 'info' | 'success' | 'warn' = 'info') {
    // Record all notifications in dialogueArchive so user can review full history in Logbook modal
    dialogueArchive.unshift({
      speaker: title,
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (dialogueArchive.length > 50) dialogueArchive.pop();
    renderCommsLog();

    toastQueue.push({ title, message, type });
    processToastQueue();
  }

  function processToastQueue() {
    if (isToastDisplaying || toastQueue.length === 0) return;
    isToastDisplaying = true;

    const next = toastQueue.shift()!;
    const toast = document.createElement('div');
    toast.className = `toast ${next.type}`;
    toast.innerHTML = `
      <div class="toast-title">${next.title}</div>
      <div class="toast-message">${next.message}</div>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        toast.remove();
        isToastDisplaying = false;
        processToastQueue();
      }, 300);
    }, 3800);
  }

  game.onNotification = showToast;

  // 2. Vitals & Radiation HUD Updates
  game.onVitalsUpdate = (vitals: CatVitals, rad: number) => {
    staminaFill.style.width = `${(vitals.currentStamina / vitals.maxStamina) * 100}%`;
    hungerFill.style.width = `${(vitals.currentHunger / vitals.maxHunger) * 100}%`;
    healthFill.style.width = `${(vitals.currentHealth / vitals.maxHealth) * 100}%`;

    radVal.textContent = rad.toFixed(2);
    if (rad > 4.0) {
      radVal.style.color = '#ef4444';
    } else if (rad > 1.0) {
      radVal.style.color = '#f59e0b';
    } else {
      radVal.style.color = '#f8fafc';
    }
  };

  // 3. Mission Objectives Rendering
  function renderObjectives() {
    const mission = game.missionManager.getCurrentMission();
    missionTitle.textContent = mission.title;
    missionSubtitle.textContent = `MISSION ${mission.id}: ${mission.subtitle.toUpperCase()}`;

    objectiveList.innerHTML = '';
    mission.objectives.forEach(obj => {
      const item = document.createElement('div');
      item.className = `objective-item ${obj.isCompleted ? 'done' : ''}`;
      
      let countText = '';
      if (obj.requiredCount) {
        countText = ` (${obj.currentCount || 0}/${obj.requiredCount})`;
      }

      item.innerHTML = `
        <div class="obj-checkbox">${obj.isCompleted ? '✓' : ''}</div>
        <span>${obj.description}${countText}</span>
      `;
      objectiveList.appendChild(item);
    });
  }

  game.onMissionObjectiveUpdated = renderObjectives;
  renderObjectives();

  // Initial welcome toast
  setTimeout(() => {
    showToast(
      'Welcome to Newport News Shipbuilding!',
      'Use WASD to roam, Shift to sprint, Ctrl to crouch/stalk, and Space/F to pounce on rats.',
      'info'
    );
  }, 1000);

  const btnSwipe = document.getElementById('btn-swipe') as HTMLButtonElement;
  const btnTailSweep = document.getElementById('btn-tailsweep') as HTMLButtonElement;

  // 4. Button Controls
  btnSwipe?.addEventListener('click', () => {
    game.executePawSwipe();
  });

  btnTailSweep?.addEventListener('click', () => {
    game.executeTailSweep();
  });

  btnWhiskers.addEventListener('click', () => {
    const active = game.toggleWhiskersMode();
    btnWhiskers.classList.toggle('active', active);
  });

  btnMeow.addEventListener('click', () => {
    game.handleInteractOrMeow();
  });

  btnPounce.addEventListener('click', () => {
    game.executePounce();
  });

  const btnAbilities = document.getElementById('btn-abilities') as HTMLButtonElement;
  const modalAbilities = document.getElementById('modal-abilities') as HTMLElement;
  const spBadge = document.getElementById('sp-badge') as HTMLElement;
  const rankTitle = document.getElementById('rank-title') as HTMLElement;
  const xpText = document.getElementById('xp-text') as HTMLElement;
  const spCount = document.getElementById('sp-count') as HTMLElement;
  const perksGrid = document.getElementById('perks-grid') as HTMLElement;

  // Render Abilities / Perks Grid
  function renderPerks() {
    spBadge.textContent = `${game.progression.skillPoints} SP`;
    spCount.textContent = `${game.progression.skillPoints} SP`;
    rankTitle.textContent = `${game.progression.rankTitle} (Level ${game.progression.level})`;
    
    const xpInCurrentLevel = game.progression.totalXPEarned % 200;
    xpText.textContent = `${xpInCurrentLevel} / 200 XP to next level`;

    perksGrid.innerHTML = '';
    game.progression.getPerks().forEach(perk => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: ${perk.unlocked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(30, 41, 59, 0.7)'};
        border: 1px solid ${perk.unlocked ? '#22c55e' : 'var(--panel-border)'};
        border-radius: 10px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      `;

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem;">
            <span style="font-size: 1.5rem;">${perk.icon}</span>
            <span style="font-size: 0.7rem; font-family: var(--font-tech); padding: 0.15rem 0.4rem; border-radius: 4px; background: ${perk.unlocked ? '#15803d' : '#334155'}; color: #fff;">
              ${perk.unlocked ? 'UNLOCKED ✓' : `TIER ${perk.tier} • ${perk.costSP} SP`}
            </span>
          </div>
          <h4 style="font-family: var(--font-tech); color: #fff; font-size: 0.95rem; margin-bottom: 0.3rem;">${perk.name}</h4>
          <p style="font-size: 0.8rem; color: #cbd5e1; line-height: 1.4; margin-bottom: 0.5rem;">${perk.description}</p>
          <em style="font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 0.75rem;">${perk.loreQuote}</em>
        </div>
        ${!perk.unlocked ? `
          <button class="hud-btn" data-perk="${perk.id}" style="width: 100%; justify-content: center; background: ${game.progression.skillPoints >= perk.costSP ? '#f59e0b' : '#334155'}; color: ${game.progression.skillPoints >= perk.costSP ? '#000' : '#94a3b8'};">
            Unlock Perk (${perk.costSP} SP)
          </button>
        ` : `
          <div style="font-family: var(--font-tech); font-size: 0.8rem; color: #4ade80; text-align: center; font-weight: 700;">ACTIVE IN FIELD</div>
        `}
      `;

      const unlockBtn = card.querySelector('[data-perk]');
      if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
          if (game.progression.unlockPerk(perk.id)) {
            soundEngine.playSuccess();
            showToast('Ability Unlocked!', `Alba mastered: ${perk.name}`, 'success');
            renderPerks();
          } else {
            showToast('Need More SP', `Catch more rats or complete assists to earn ${perk.costSP} Skill Points.`, 'warn');
          }
        });
      }

      perksGrid.appendChild(card);
    });
  }

  btnAbilities.addEventListener('click', () => {
    modalAbilities.classList.add('open');
    renderPerks();
  });

  // Sandbox & Logbook Modal Elements
  const btnSandbox = document.getElementById('btn-sandbox') as HTMLButtonElement;
  const modalSandbox = document.getElementById('modal-sandbox') as HTMLElement;
  const btnLogbook = document.getElementById('btn-logbook') as HTMLButtonElement;
  const modalLogbook = document.getElementById('modal-logbook') as HTMLElement;
  const logbookChaptersList = document.getElementById('logbook-chapters-list') as HTMLElement;

  const statJump = document.getElementById('stat-jump') as HTMLElement;
  const statSprint = document.getElementById('stat-sprint') as HTMLElement;
  const statDetection = document.getElementById('stat-detection') as HTMLElement;
  const statCombo = document.getElementById('stat-combo') as HTMLElement;
  const statWhiskers = document.getElementById('stat-whiskers') as HTMLElement;
  const statRighting = document.getElementById('stat-righting') as HTMLElement;

  function renderCommsLog() {
    if (!commsLogList) return;
    if (dialogueArchive.length === 0) {
      commsLogList.innerHTML = '<div style="color: #94a3b8; font-style: italic;">Talk with colony cats (Calico Belle, Tripod Toby, Dr. Vance) or shipbuilders (Mo Kelly, Frank Miller, Dave O\'Connor) to record entries...</div>';
      return;
    }

    commsLogList.innerHTML = dialogueArchive.map(entry => `
      <div style="margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(148, 163, 184, 0.15);">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: #facc15; font-size: 0.75rem; margin-bottom: 0.2rem;">
          <span>${entry.speaker}</span>
          <span style="color: #64748b;">${entry.time}</span>
        </div>
        <div style="color: #e2e8f0; font-size: 0.8rem;">${entry.text}</div>
      </div>
    `).join('');
  }

  function renderSandboxMetrics() {
    const p = game.progression;
    statJump.textContent = `${p.jumpMultiplier.toFixed(2)}x (${(6.2 * p.jumpMultiplier).toFixed(1)} m/s)`;
    statSprint.textContent = `${(8.8 * p.sprintMultiplier).toFixed(1)} m/s`;
    statDetection.textContent = p.hasShadowFinisher ? '1.2 m (Ghost)' : '1.8 m (Silent)';
    statCombo.textContent = `${p.maxComboHits}-Hit (${p.hasClawFlurry ? 'Claw Flurry' : 'Basic Swipe'})`;
    statWhiskers.textContent = `Tier ${p.whiskersTier} (${p.whiskersTier === 3 ? 'Geiger Sonar' : p.whiskersTier === 2 ? 'Mutant Auras' : p.whiskersTier === 1 ? 'Scent Trails' : 'Prey'})`;
    statRighting.textContent = p.hasAlwaysLandOnFeet ? 'Active (Immune)' : 'Normal';

    updatePerformanceProfiler();
  }

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 60;
  let currentFrameTime = 16.6;

  // 30-Second Rolling Telemetry Buffer (Sampled twice per second)
  interface TelemetryRecord {
    timestamp: string;
    fps: number;
    frameRenderTimeMs: number;
    drawCalls: number;
    triangles: number;
    texturesInVRAM: number;
    heapMemoryMB: number | string;
    catPosition: string;
    isMoving: boolean;
    isPouncing: boolean;
    isAirborne: boolean;
    activeMissionId: number;
  }
  const telemetryHistory: TelemetryRecord[] = [];
  const maxTelemetryRecords = 60; // 60 samples @ 500ms = 30 seconds

  function updatePerformanceProfiler() {
    const now = performance.now();
    frameCount++;

    if (now - lastFpsTime >= 500) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      currentFrameTime = ((now - lastFpsTime) / frameCount);
      frameCount = 0;
      lastFpsTime = now;

      const badge = document.getElementById('perf-fps-badge');
      const ftElem = document.getElementById('perf-frametime');
      const dcElem = document.getElementById('perf-drawcalls');
      const triElem = document.getElementById('perf-triangles');
      const texElem = document.getElementById('perf-textures');
      const memElem = document.getElementById('perf-memory');

      if (badge) {
        badge.textContent = `${currentFps} FPS`;
        badge.style.background = currentFps >= 50 ? '#059669' : currentFps >= 30 ? '#d97706' : '#dc2626';
      }
      if (ftElem) {
        ftElem.textContent = `${currentFrameTime.toFixed(1)} ms`;
      }
      if (dcElem && game.renderer.info) {
        dcElem.textContent = `${game.renderer.info.render.calls} calls / frame`;
      }
      if (triElem && game.renderer.info) {
        triElem.textContent = `${game.renderer.info.render.triangles.toLocaleString()} Polys`;
      }
      if (texElem && game.renderer.info) {
        texElem.textContent = `${game.renderer.info.memory.textures} Textures in VRAM`;
      }
      let memoryUsage: number | string = 'N/A';
      if (memElem) {
        if ((performance as any).memory) {
          const usedMB = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
          memoryUsage = usedMB;
          memElem.textContent = `${usedMB} MB / Heap`;
        } else {
          memElem.textContent = `Optimized (WebGL 2.0)`;
        }
      }

      // Record telemetry snapshot
      const catPos = game.cat ? game.cat.mesh.position : new THREE.Vector3();
      telemetryHistory.push({
        timestamp: new Date().toISOString().substring(11, 23),
        fps: currentFps,
        frameRenderTimeMs: parseFloat(currentFrameTime.toFixed(1)),
        drawCalls: game.renderer.info ? game.renderer.info.render.calls : 0,
        triangles: game.renderer.info ? game.renderer.info.render.triangles : 0,
        texturesInVRAM: game.renderer.info ? game.renderer.info.memory.textures : 0,
        heapMemoryMB: memoryUsage,
        catPosition: `X:${catPos.x.toFixed(1)} Y:${catPos.y.toFixed(1)} Z:${catPos.z.toFixed(1)}`,
        isMoving: game.cat ? game.cat.isCrouching : false,
        isPouncing: game.cat ? game.cat.isPouncing : false,
        isAirborne: !game.isGrounded,
        activeMissionId: game.missionManager ? game.missionManager.getCurrentMission().id : 1
      });

      if (telemetryHistory.length > maxTelemetryRecords) {
        telemetryHistory.shift();
      }
    }
  }

  // Telemetry Log Download Handler
  document.getElementById('btn-download-telemetry')?.addEventListener('click', () => {
    let logContent = `=========================================================================\n`;
    logContent += `SHIPYARD CAT: 30-SECOND LIVE GPU & ENGINE PERFORMANCE TELEMETRY LOG\n`;
    logContent += `Generated: ${new Date().toLocaleString()} | User Agent: ${navigator.userAgent}\n`;
    logContent += `=========================================================================\n\n`;
    logContent += `INDEX | TIME (UTC) | FPS | FRAME TIME (ms) | CALLS | TRIANGLES | VRAM TEX | HEAP (MB) | CAT POSITION | MOVING | AIRBORNE | POUNCING | MISSION\n`;
    logContent += `--------------------------------------------------------------------------------------------------------------------------------------------\n`;

    telemetryHistory.forEach((r, idx) => {
      const pad = (s: any, len: number) => String(s).padEnd(len, ' ');
      logContent += `${pad(idx + 1, 5)} | ${pad(r.timestamp, 12)} | ${pad(r.fps, 3)} | ${pad(r.frameRenderTimeMs, 15)} | ${pad(r.drawCalls, 5)} | ${pad(r.triangles, 9)} | ${pad(r.texturesInVRAM, 8)} | ${pad(r.heapMemoryMB, 9)} | ${pad(r.catPosition, 18)} | ${pad(r.isMoving, 6)} | ${pad(r.isAirborne, 8)} | ${pad(r.isPouncing, 8)} | Mission ${r.activeMissionId}\n`;
    });

    logContent += `\n=========================================================================\n`;
    logContent += `END OF TELEMETRY LOG\n`;

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipyard_cat_telemetry_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    soundEngine.playSuccess();
    showToast('Telemetry Downloaded', 'Saved 30-second rolling engine performance log to your device.', 'success');
  });

  // Graphics Quality Preset Buttons
  document.getElementById('btn-perf-high')?.addEventListener('click', () => {
    game.renderer.shadowMap.enabled = true;
    game.renderer.shadowMap.needsUpdate = true;
    const shadowLabel = document.getElementById('perf-shadows');
    if (shadowLabel) shadowLabel.textContent = '1024x1024 (High Performance)';
    soundEngine.playSuccess();
    showToast('Graphics Preset: High Performance', 'Dynamic sun shadow mapping active at locked 60 FPS', 'success');
  });

  document.getElementById('btn-perf-ultra')?.addEventListener('click', () => {
    game.renderer.shadowMap.enabled = true;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    game.renderer.shadowMap.needsUpdate = true;
    const shadowLabel = document.getElementById('perf-shadows');
    if (shadowLabel) shadowLabel.textContent = '2048x2048 (Ultra Soft Shadows)';
    soundEngine.playSuccess();
    showToast('Graphics Preset: Ultra Fidelity', 'Soft PCF contact shadows and atmospheric haze active', 'info');
  });

  document.getElementById('btn-perf-mobile')?.addEventListener('click', () => {
    game.renderer.shadowMap.enabled = false;
    const shadowLabel = document.getElementById('perf-shadows');
    if (shadowLabel) shadowLabel.textContent = 'OFF (Mobile Battery Saver)';
    soundEngine.playSuccess();
    showToast('Graphics Preset: Battery Saver', 'Dynamic shadows disabled for max framerate and cool battery', 'warn');
  });

  // Rat Diagnostic Buttons
  document.getElementById('btn-rat-gltf')?.addEventListener('click', () => {
    RatEntity.diagnosticFlags.activeMode = 'GLTF';
    game.rats.forEach(r => {
      if (r.gltfModel) r.gltfModel.visible = true;
      if (r.proceduralGroup) r.proceduralGroup.visible = false;
    });
    soundEngine.playSuccess();
    showToast('Rat Diagnostic', 'Forced 3D Animated Skeletal GLTF Rats', 'info');
  });

  document.getElementById('btn-rat-procedural')?.addEventListener('click', () => {
    RatEntity.diagnosticFlags.activeMode = 'PROCEDURAL';
    game.rats.forEach(r => {
      if (r.gltfModel) r.gltfModel.visible = false;
      if (r.proceduralGroup) r.proceduralGroup.visible = true;
    });
    soundEngine.playSuccess();
    showToast('Rat Diagnostic', 'Forced High-Visibility Geometric Mice', 'warn');
  });

  document.getElementById('btn-rat-magenta')?.addEventListener('click', () => {
    RatEntity.diagnosticFlags.forcedMagenta = !RatEntity.diagnosticFlags.forcedMagenta;
    const magentaMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
    game.rats.forEach(r => {
      if (r.gltfModel) {
        r.gltfModel.traverse((child: any) => {
          if (child.isMesh) child.material = magentaMat;
        });
      }
    });
    soundEngine.playMeow();
    showToast('Rat Diagnostic', RatEntity.diagnosticFlags.forcedMagenta ? 'Forced Bright Magenta Shader on Rats' : 'Restored Natural Fur', 'info');
  });

  document.getElementById('btn-rat-scale')?.addEventListener('click', () => {
    RatEntity.diagnosticFlags.scaleMultiplier = RatEntity.diagnosticFlags.scaleMultiplier === 1.0 ? 2.5 : 1.0;
    game.rats.forEach(r => {
      if (r.gltfModel) {
        const base = r.isKingpin ? 0.024 : 0.014;
        const s = base * RatEntity.diagnosticFlags.scaleMultiplier;
        r.gltfModel.scale.set(s, s, s);
      }
    });
    soundEngine.playSuccess();
    showToast('Rat Diagnostic', `Set Rat Scale to ${RatEntity.diagnosticFlags.scaleMultiplier}x`, 'info');
  });

  function renderLogbookChapters() {
    const missions = game.missionManager.getMissions();
    const currentId = game.missionManager.getCurrentMission().id;

    logbookChaptersList.innerHTML = missions.map(m => `
      <div style="margin-bottom: 0.6rem; padding: 0.4rem; border-radius: 4px; background: ${m.id === currentId ? 'rgba(56, 189, 248, 0.15)' : 'transparent'}; border-left: 3px solid ${m.isCompleted ? '#22c55e' : m.id === currentId ? '#38bdf8' : '#475569'};">
        <div style="display: flex; justify-content: space-between;">
          <strong style="color: ${m.isCompleted ? '#4ade80' : m.id === currentId ? '#38bdf8' : '#94a3b8'};">Chapter ${m.id}: ${m.title}</strong>
          <span style="font-size: 0.7rem; color: ${m.isCompleted ? '#4ade80' : m.id === currentId ? '#facc15' : '#64748b'};">${m.isCompleted ? 'COMPLETED' : m.id === currentId ? 'IN PROGRESS' : 'LOCKED'}</span>
        </div>
        <div style="font-size: 0.75rem; color: #94a3b8;">${m.subtitle}</div>
      </div>
    `).join('');
  }

  // Sandbox Level Button Clicks
  document.querySelectorAll('.sandbox-level-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lvl = parseInt((e.currentTarget as HTMLElement).getAttribute('data-level') || '1');
      game.progression.setLevel(lvl);
      soundEngine.playSuccess();
      showToast(`Sandbox Override: Level ${lvl}`, `Alba set to ${game.progression.rankTitle} with unlocked stats!`, 'success');
      renderSandboxMetrics();
      renderPerks();
    });
  });

  document.getElementById('btn-sandbox-unlock-all')?.addEventListener('click', () => {
    game.progression.toggleAllPerks(true);
    soundEngine.playSuccess();
    showToast('Max Capabilities Active!', 'All perks, combat flurries, and Max Geiger Sonar unlocked.', 'success');
    renderSandboxMetrics();
    renderPerks();
  });

  document.getElementById('btn-sandbox-reset')?.addEventListener('click', () => {
    game.progression.setLevel(1);
    soundEngine.playMeow();
    showToast('Reset to Level 1', 'Alba is back to a young Yard Kitten.', 'info');
    renderSandboxMetrics();
    renderPerks();
  });

  btnSandbox.addEventListener('click', () => {
    modalSandbox.classList.add('open');
    renderSandboxMetrics();
  });

  btnLogbook.addEventListener('click', () => {
    modalLogbook.classList.add('open');
    renderLogbookChapters();
    renderCommsLog();
  });

  // Map Modal Elements
  const btnMap = document.getElementById('btn-map') as HTMLButtonElement;
  const modalMap = document.getElementById('modal-map') as HTMLElement;
  const minimapContainer = document.getElementById('minimap-container') as HTMLElement;

  if (btnMap && modalMap) {
    btnMap.addEventListener('click', () => modalMap.classList.add('open'));
  }
  if (minimapContainer && modalMap) {
    minimapContainer.addEventListener('click', () => modalMap.classList.add('open'));
  }

  // Bind Touch Controller Action Hooks
  game.touchController.onPounce = () => game.executePounce();
  game.touchController.onAttack = () => game.executePawSwipe();
  game.touchController.onWhiskers = () => game.toggleWhiskersMode();
  game.touchController.onMeow = () => game.handleInteractOrMeow();
  game.touchController.onToggleMap = () => {
    if (modalMap) {
      if (modalMap.classList.contains('open')) {
        modalMap.classList.remove('open');
      } else {
        modalMap.classList.add('open');
      }
    }
  };

  // Modal Handlers
  btnGallery.addEventListener('click', () => modalGallery.classList.add('open'));
  btnTests.addEventListener('click', () => {
    modalTests.classList.add('open');
    runAndDisplayTests();
  });
  btnRerunTests.addEventListener('click', runAndDisplayTests);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = (e.currentTarget as HTMLElement).getAttribute('data-close');
      if (modalId) {
        document.getElementById(modalId)?.classList.remove('open');
      }
    });
  });

  // 5. Test Suite Execution & GUI Display
  function runAndDisplayTests() {
    testResultsList.innerHTML = '<div style="color: #94a3b8; font-family: var(--font-tech);">Running test harness...</div>';
    setTimeout(() => {
      const results: TestResult[] = TestRunner.runAllTests();
      testResultsList.innerHTML = '';

      let passedCount = 0;
      results.forEach(res => {
        if (res.passed) passedCount++;
        const item = document.createElement('div');
        item.className = `test-item ${res.passed ? 'passed' : 'failed'}`;
        item.innerHTML = `
          <div>
            <span style="font-size: 0.7rem; color: #94a3b8; font-family: var(--font-tech); text-transform: uppercase;">[${res.category}]</span>
            <strong style="margin-left: 0.4rem; color: #f1f5f9;">${res.name}</strong>
            ${res.error ? `<div style="color: #f87171; font-size: 0.75rem; margin-top: 0.2rem;">Error: ${res.error}</div>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="color: #64748b; font-size: 0.75rem;">${res.durationMs}ms</span>
            <span class="test-status ${res.passed ? 'pass' : 'fail'}">${res.passed ? 'PASS ✓' : 'FAIL ✗'}</span>
          </div>
        `;
        testResultsList.appendChild(item);
      });

      showToast(
        'Test Suite Executed',
        `${passedCount} of ${results.length} Unit & Integration tests passed in ${(results.reduce((a, b) => a + b.durationMs, 0)).toFixed(1)}ms.`,
        passedCount === results.length ? 'success' : 'warn'
      );
    }, 100);
  }

  // Pre-run tests in background for initial verification
  const initialTestResults = TestRunner.runAllTests();
  console.log('Shipyard Cat Test Suite Results:', initialTestResults);
});
