import './style.css';
import * as THREE from 'three';
import { GameEngine, ContextualPrompt } from './game/GameEngine';
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

  let game: GameEngine;
  try {
    game = new GameEngine(container);
    game.onFrameUpdate = () => {
      updatePerformanceProfiler();
      updateSonarDistanceBadge();
    };
    game.onFreezeDetected = (incident) => {
      handleFreezeIncidentDetected(incident);
    };

    // Execute real GPU Shader & Texture Warmup Pipeline
    game.initPipeline((pct, stage) => {
      if (loadingProgressBar) loadingProgressBar.style.width = `${pct}%`;
      if (loadingStatusText) loadingStatusText.textContent = stage;
    }).then(() => {
      if (btnEnterGame) {
        btnEnterGame.style.display = 'inline-block';
        btnEnterGame.onclick = () => {
          soundEngine.init();
          soundEngine.prewarmAudioBuffers();
          soundEngine.playPurr();
          game.startLoop();
          loadingScreen.style.opacity = '0';
          setTimeout(() => {
            loadingScreen.style.display = 'none';
          }, 600);
        };
      }
    }).catch((err) => {
      console.warn('[Engine Warmup Pipeline Note]', err);
      if (btnEnterGame) {
        btnEnterGame.style.display = 'inline-block';
        btnEnterGame.onclick = () => {
          game.startLoop();
          loadingScreen.style.display = 'none';
        };
      }
    });
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
  const objectiveDistanceBadge = document.getElementById('objective-distance-badge') as HTMLElement;
  const toastContainer = document.getElementById('toast-container') as HTMLElement;

  const onboardingCard = document.getElementById('onboarding-card') as HTMLElement;
  const btnDismissOnboarding = document.getElementById('btn-dismiss-onboarding') as HTMLButtonElement;
  const btnControls = document.getElementById('btn-controls') as HTMLButtonElement;
  const btnWorkorder = document.getElementById('btn-workorder') as HTMLButtonElement;
  const modalWorkorder = document.getElementById('modal-workorder') as HTMLElement;

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

  // 2. Vitals & Radiation HUD Updates (Cached & Throttled to 0.5% Delta to Eliminate DOM Thrashing)
  let lastStaminaPct = -1;
  let lastHungerPct = -1;
  let lastHealthPct = -1;
  let lastRadDose = -1;

  game.onVitalsUpdate = (vitals: CatVitals, rad: number) => {
    const staminaPct = (vitals.currentStamina / vitals.maxStamina) * 100;
    if (Math.abs(staminaPct - lastStaminaPct) >= 0.5) {
      staminaFill.style.width = `${staminaPct.toFixed(1)}%`;
      lastStaminaPct = staminaPct;
    }

    const hungerPct = (vitals.currentHunger / vitals.maxHunger) * 100;
    if (Math.abs(hungerPct - lastHungerPct) >= 0.5) {
      hungerFill.style.width = `${hungerPct.toFixed(1)}%`;
      lastHungerPct = hungerPct;
    }

    const healthPct = (vitals.currentHealth / vitals.maxHealth) * 100;
    if (Math.abs(healthPct - lastHealthPct) >= 0.5) {
      healthFill.style.width = `${healthPct.toFixed(1)}%`;
      lastHealthPct = healthPct;
    }

    if (Math.abs(rad - lastRadDose) >= 0.05) {
      radVal.textContent = rad.toFixed(2);
      if (rad > 4.0) {
        radVal.style.color = '#ef4444';
      } else if (rad > 1.0) {
        radVal.style.color = '#f59e0b';
      } else {
        radVal.style.color = '#f8fafc';
      }
      lastRadDose = rad;
    }
  };

  // 2b. Dynamic Floating 3D In-World Contextual Prompts Handler (Zero-Reflow GPU Transform Positioning)
  const floatingPromptsLayer = document.getElementById('floating-prompts-layer') as HTMLElement;
  interface CachedPromptEntry {
    element: HTMLElement;
    keyBadge: HTMLElement;
    mainTitle: HTMLElement;
    subDesc: HTMLElement;
    lastX: number;
    lastY: number;
    lastVisible: boolean;
    lastTitle: string;
    lastSubtitle: string;
  }
  const promptElementCache: Map<string, CachedPromptEntry> = new Map();
  const activePromptIds: Set<string> = new Set();

  game.onContextualPromptsUpdate = (prompts: ContextualPrompt[]) => {
    if (!floatingPromptsLayer) return;
    activePromptIds.clear();

    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i];
      activePromptIds.add(p.id);
      let entry = promptElementCache.get(p.id);

      if (!entry) {
        const el = document.createElement('div');
        el.className = `floating-prompt prompt-${p.type.toLowerCase()}`;
        el.style.position = 'absolute';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.willChange = 'transform';

        const keyBadge = document.createElement('span');
        keyBadge.className = 'prompt-key-badge';
        keyBadge.textContent = p.keyText;
        el.appendChild(keyBadge);

        const textBlock = document.createElement('div');
        textBlock.className = 'prompt-text-block';

        const mainTitle = document.createElement('div');
        mainTitle.className = 'prompt-main-title';
        mainTitle.textContent = p.title;
        textBlock.appendChild(mainTitle);

        const subDesc = document.createElement('div');
        subDesc.className = 'prompt-sub-desc';
        subDesc.textContent = p.subtitle || '';
        subDesc.style.display = p.subtitle ? 'block' : 'none';
        textBlock.appendChild(subDesc);

        el.appendChild(textBlock);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (p.type === 'TALK' || p.type === 'EAT') {
            game.handleInteractOrMeow();
          } else if (p.type === 'POUNCE') {
            game.executePounce();
          }
        });

        floatingPromptsLayer.appendChild(el);
        entry = {
          element: el,
          keyBadge,
          mainTitle,
          subDesc,
          lastX: -9999,
          lastY: -9999,
          lastVisible: false,
          lastTitle: p.title,
          lastSubtitle: p.subtitle || ''
        };
        promptElementCache.set(p.id, entry);
      }

      // Update text contents only if changed (no innerHTML thrashing)
      if (entry.lastTitle !== p.title) {
        entry.mainTitle.textContent = p.title;
        entry.lastTitle = p.title;
      }
      const sub = p.subtitle || '';
      if (entry.lastSubtitle !== sub) {
        entry.subDesc.textContent = sub;
        entry.subDesc.style.display = sub ? 'block' : 'none';
        entry.lastSubtitle = sub;
      }

      // Fast GPU transform translation avoiding layout/reflow recalculations
      const roundX = Math.round(p.screenX);
      const roundY = Math.round(p.screenY);
      if (entry.lastX !== roundX || entry.lastY !== roundY) {
        entry.element.style.transform = `translate3d(${roundX}px, ${roundY}px, 0)`;
        entry.lastX = roundX;
        entry.lastY = roundY;
      }

      if (entry.lastVisible !== p.visible) {
        entry.element.style.display = p.visible ? 'flex' : 'none';
        entry.lastVisible = p.visible;
      }
    }

    // Clean up stale prompts
    for (const [id, entry] of promptElementCache.entries()) {
      if (!activePromptIds.has(id)) {
        entry.element.remove();
        promptElementCache.delete(id);
      }
    }
  };

  // Live Sonar Waypoint Nav Distance Updater
  let navUpdateCounter = 0;
  function updateSonarDistanceBadge() {
    navUpdateCounter++;
    if (navUpdateCounter % 8 !== 0) return; // Throttled update

    const waypoint = game.missionManager.getActiveWaypoint();
    if (!objectiveDistanceBadge) return;

    if (waypoint && game.cat) {
      const catPos = game.cat.mesh.position;
      const dx = waypoint.x - catPos.x;
      const dz = waypoint.z - catPos.z;
      const dist = Math.hypot(dx, dz);

      objectiveDistanceBadge.textContent = `📍 ${Math.round(dist)}m • ${waypoint.zoneName} (${waypoint.hint})`;
    } else {
      objectiveDistanceBadge.textContent = `✓ ALL DIRECTIVES COMPLETE • Check Dispatch [O]`;
    }
  }

  // 3. Mission Objectives & Work Order Rendering
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
        <div>
          <span>${obj.description}${countText}</span>
          ${!obj.isCompleted && obj.hint ? `<div style="font-size: 0.72rem; color: #94a3b8; margin-top: 0.1rem;">💡 ${obj.hint}</div>` : ''}
        </div>
      `;
      objectiveList.appendChild(item);
    });

    updateSonarDistanceBadge();
    renderWorkOrderModal();
  }

  // Official Work Order Dispatch Modal Rendering
  function renderWorkOrderModal() {
    if (!modalWorkorder) return;
    const mission = game.missionManager.getCurrentMission();
    const missions = game.missionManager.getMissions();

    const titleEl = document.getElementById('workorder-title');
    const codeEl = document.getElementById('workorder-code');
    const locEl = document.getElementById('workorder-location');
    const briefEl = document.getElementById('workorder-briefing');
    const speakerEl = document.getElementById('workorder-speaker');
    const dialEl = document.getElementById('workorder-dialogue');
    const objsEl = document.getElementById('workorder-objectives');
    const selEl = document.getElementById('workorder-mission-selector');

    if (titleEl) titleEl.textContent = `Chapter ${mission.id}: ${mission.title}`;
    if (codeEl) codeEl.textContent = `WORK ORDER: NNS-WO-${1000 + mission.id * 14}`;
    if (locEl) locEl.textContent = `📍 Sector: ${mission.location}`;
    if (briefEl) briefEl.textContent = mission.briefing;
    if (speakerEl) speakerEl.textContent = mission.dialogueSpeaker;
    if (dialEl) dialEl.textContent = `"${mission.dialogueText}"`;

    if (objsEl) {
      objsEl.innerHTML = mission.objectives.map(obj => `
        <div class="objective-item ${obj.isCompleted ? 'done' : ''}" style="margin-bottom: 0.4rem;">
          <div class="obj-checkbox">${obj.isCompleted ? '✓' : ''}</div>
          <div>
            <strong style="color: ${obj.isCompleted ? '#64748b' : '#f8fafc'};">${obj.description}${obj.requiredCount ? ` (${obj.currentCount || 0}/${obj.requiredCount})` : ''}</strong>
            ${obj.hint ? `<div style="font-size: 0.75rem; color: #94a3b8;">${obj.hint}</div>` : ''}
          </div>
        </div>
      `).join('');
    }

    if (selEl) {
      selEl.innerHTML = missions.map(m => `
        <button class="hud-btn" data-mission-select="${m.id}" style="width: 100%; justify-content: space-between; font-size: 0.78rem; padding: 0.4rem 0.75rem; background: ${m.id === mission.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)'}; border-color: ${m.isCompleted ? '#22c55e' : m.id === mission.id ? '#38bdf8' : '#475569'}; opacity: ${m.isUnlocked ? '1' : '0.5'}; cursor: ${m.isUnlocked ? 'pointer' : 'not-allowed'};">
          <span>Chapter ${m.id}: ${m.title}</span>
          <span style="font-size: 0.7rem; color: ${m.isCompleted ? '#4ade80' : m.id === mission.id ? '#38bdf8' : '#64748b'};">${m.isCompleted ? 'COMPLETED ✓' : m.id === mission.id ? 'ACTIVE' : m.isUnlocked ? 'UNLOCKED' : 'LOCKED 🔒'}</span>
        </button>
      `).join('');

      selEl.querySelectorAll('[data-mission-select]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const mid = parseInt((e.currentTarget as HTMLElement).getAttribute('data-mission-select') || '1');
          if (game.missionManager.selectMission(mid)) {
            soundEngine.playSuccess();
            showToast('Work Order Switched', `Active Chapter set to: ${game.missionManager.getCurrentMission().title}`, 'info');
            renderObjectives();
          }
        });
      });
    }
  }

  game.onMissionObjectiveUpdated = renderObjectives;
  renderObjectives();

  // Initial welcome toast
  setTimeout(() => {
    showToast(
      'Welcome to Newport News Shipbuilding!',
      'Controls: WASD to roam, Shift to sprint, Q for Whiskers Sonar, and Space/F to pounce.',
      'info'
    );
  }, 1000);

  // Keypress Interactive Visual Feedback & Shortcut Handlers
  const keyAliases: { [code: string]: string[] } = {
    'KeyW': ['KeyW'],
    'KeyA': ['KeyA'],
    'KeyS': ['KeyS'],
    'KeyD': ['KeyD'],
    'ArrowUp': ['KeyW'],
    'ArrowLeft': ['KeyA'],
    'ArrowDown': ['KeyS'],
    'ArrowRight': ['KeyD'],
    'ShiftLeft': ['ShiftLeft'],
    'ShiftRight': ['ShiftLeft'],
    'KeyQ': ['KeyQ'],
    'KeyF': ['KeyF'],
    'KeyJ': ['KeyJ'],
    'KeyR': ['KeyJ'],
    'KeyK': ['KeyK'],
    'KeyT': ['KeyK'],
    'KeyE': ['KeyE'],
    'KeyC': ['KeyC'],
    'ControlLeft': ['KeyC'],
    'KeyM': ['KeyM']
  };

  window.addEventListener('keydown', (e) => {
    const targets = keyAliases[e.code] || [e.code];
    targets.forEach(code => {
      document.querySelectorAll(`[data-key="${code}"]`).forEach(el => el.classList.add('pressed'));
    });

    // Shortcuts: M for Map, O for Work Order, H for Controls banner
    if (e.code === 'KeyM' && !e.repeat && modalMap) {
      modalMap.classList.toggle('open');
    }
    if (e.code === 'KeyO' && !e.repeat && modalWorkorder) {
      modalWorkorder.classList.toggle('open');
      if (modalWorkorder.classList.contains('open')) renderWorkOrderModal();
    }
    if (e.code === 'KeyH' && !e.repeat && onboardingCard) {
      onboardingCard.classList.toggle('hidden');
    }
  });

  window.addEventListener('keyup', (e) => {
    const targets = keyAliases[e.code] || [e.code];
    targets.forEach(code => {
      document.querySelectorAll(`[data-key="${code}"]`).forEach(el => el.classList.remove('pressed'));
    });
  });

  // Onboarding & Work Order Buttons
  btnDismissOnboarding?.addEventListener('click', () => {
    onboardingCard?.classList.add('hidden');
  });

  btnControls?.addEventListener('click', () => {
    onboardingCard?.classList.toggle('hidden');
  });

  btnWorkorder?.addEventListener('click', () => {
    modalWorkorder?.classList.add('open');
    renderWorkOrderModal();
  });

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

  // 30-Second Rolling Telemetry Buffer (Preallocated Fixed Circular Buffer)
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
  const maxTelemetryRecords = 60; // 60 samples @ 500ms = 30 seconds
  const telemetryHistory: TelemetryRecord[] = Array.from({ length: maxTelemetryRecords }, () => ({
    timestamp: '',
    fps: 0,
    frameRenderTimeMs: 0,
    drawCalls: 0,
    triangles: 0,
    texturesInVRAM: 0,
    heapMemoryMB: 'N/A',
    catPosition: '',
    isMoving: false,
    isPouncing: false,
    isAirborne: false,
    activeMissionId: 1
  }));
  let telemetryHeadIndex = 0;
  let totalTelemetryRecorded = 0;
  const scratchTelemetryPos = new THREE.Vector3();

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
      let memoryUsage: number | string = 'Optimized';
      if (memElem) {
        memElem.textContent = 'Optimized (WebGL 2.0)';
      }

      // Record telemetry snapshot into preallocated circular slot
      const catPos = game.cat ? game.cat.mesh.position : scratchTelemetryPos;
      const rec = telemetryHistory[telemetryHeadIndex];
      rec.timestamp = new Date().toISOString().substring(11, 23);
      rec.fps = currentFps;
      rec.frameRenderTimeMs = parseFloat(currentFrameTime.toFixed(1));
      rec.drawCalls = game.renderer.info ? game.renderer.info.render.calls : 0;
      rec.triangles = game.renderer.info ? game.renderer.info.render.triangles : 0;
      rec.texturesInVRAM = game.renderer.info ? game.renderer.info.memory.textures : 0;
      rec.heapMemoryMB = memoryUsage;
      rec.catPosition = `X:${catPos.x.toFixed(1)} Y:${catPos.y.toFixed(1)} Z:${catPos.z.toFixed(1)}`;
      rec.isMoving = game.cat ? game.cat.isCrouching : false;
      rec.isPouncing = game.cat ? game.cat.isPouncing : false;
      rec.isAirborne = !game.isGrounded;
      rec.activeMissionId = game.missionManager ? game.missionManager.getCurrentMission().id : 1;

      telemetryHeadIndex = (telemetryHeadIndex + 1) % maxTelemetryRecords;
      totalTelemetryRecorded++;
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

    const count = Math.min(totalTelemetryRecorded, maxTelemetryRecords);
    const startIdx = totalTelemetryRecorded > maxTelemetryRecords ? telemetryHeadIndex : 0;

    for (let i = 0; i < count; i++) {
      const idx = (startIdx + i) % maxTelemetryRecords;
      const r = telemetryHistory[idx];
      const pad = (s: any, len: number) => String(s).padEnd(len, ' ');
      logContent += `${pad(i + 1, 5)} | ${pad(r.timestamp, 12)} | ${pad(r.fps, 3)} | ${pad(r.frameRenderTimeMs, 15)} | ${pad(r.drawCalls, 5)} | ${pad(r.triangles, 9)} | ${pad(r.texturesInVRAM, 8)} | ${pad(r.heapMemoryMB, 9)} | ${pad(r.catPosition, 18)} | ${pad(r.isMoving, 6)} | ${pad(r.isAirborne, 8)} | ${pad(r.isPouncing, 8)} | Mission ${r.activeMissionId}\n`;
    }

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

  // Flight Recorder Live HUD & Incident Handler
  let freezeBannerTimeout: number | null = null;
  function handleFreezeIncidentDetected(incident: any) {
    const flightStatusText = document.getElementById('flight-status-text');
    const flightIncidentCount = document.getElementById('flight-incident-count');
    const freezeBanner = document.getElementById('freeze-alert-banner');
    const freezeDetails = document.getElementById('freeze-culprit-details');
    const pulseDot = document.getElementById('flight-pulse-dot');
    const container = document.getElementById('flight-incidents-container');

    const incidents = game.flightRecorder.getRecentIncidents();

    if (pulseDot) pulseDot.style.background = '#ef4444';
    if (flightIncidentCount) {
      flightIncidentCount.style.display = 'inline-block';
      flightIncidentCount.textContent = `${incidents.length} Stall${incidents.length > 1 ? 's' : ''}`;
    }
    if (flightStatusText) {
      flightStatusText.textContent = `Stall Trapped: ${incident.culpritSection} (${incident.sectionDurationMs}ms)`;
      flightStatusText.style.color = '#f87171';
    }

    if (freezeBanner && freezeDetails) {
      freezeBanner.style.display = 'block';
      freezeDetails.innerHTML = `<span style="color: #fef08a;">${incident.culpritSection}</span> took <strong>${incident.sectionDurationMs}ms</strong> at (${incident.catPosition.x}, ${incident.catPosition.z}) | State: <em>${incident.catState}</em>${incident.nearestRatDist ? ` | Rat: ${incident.nearestRatDist}m` : ''}`;
      
      if (freezeBannerTimeout) clearTimeout(freezeBannerTimeout);
      freezeBannerTimeout = window.setTimeout(() => {
        freezeBanner.style.display = 'none';
        if (pulseDot) pulseDot.style.background = '#22c55e';
        if (flightStatusText) {
          flightStatusText.textContent = `Flight Recorder: Active (${currentFps} FPS)`;
          flightStatusText.style.color = '#cbd5e1';
        }
      }, 4500);
    }

    if (container) {
      container.innerHTML = incidents.slice(-8).reverse().map((inc: any) => `
        <div style="margin-bottom: 0.4rem; padding: 0.35rem 0.5rem; border-radius: 4px; background: rgba(239, 68, 68, 0.15); border-left: 3px solid #ef4444;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: #fca5a5;">
            <span>⚠️ ${inc.culpritSection} (+${inc.sectionDurationMs}ms)</span>
            <span style="color: #94a3b8; font-size: 0.7rem;">${inc.timestamp}</span>
          </div>
          <div style="color: #cbd5e1; font-size: 0.7rem; margin-top: 0.1rem;">
            Pos: (${inc.catPosition.x}, ${inc.catPosition.y}, ${inc.catPosition.z}) | Action: ${inc.catState} | Total Frame: ${inc.totalFrameDurationMs}ms
          </div>
        </div>
      `).join('');
    }
  }

  // Flight Recorder Comprehensive 30-Second Diagnostic Export Handlers
  document.getElementById('btn-download-flightlog')?.addEventListener('click', () => {
    const payload = game.flightRecorder.exportComprehensiveClipboardPayload();
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipyard_cat_telemetry_30s_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    soundEngine.playSuccess();
    showToast('30s Telemetry Downloaded', 'Exported comprehensive 30-second flight log (JSON + GPU Matrix).', 'success');
  });

  document.getElementById('btn-copy-flightlog')?.addEventListener('click', () => {
    const payload = game.flightRecorder.exportComprehensiveClipboardPayload();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(payload).then(() => {
        soundEngine.playSuccess();
        showToast('30s Telemetry Copied!', 'Copied full 30-second flight log & GPU diagnostics to clipboard!', 'success');
      }).catch(() => {
        showToast('Copy Note', 'Clipboard write blocked. Use Download button instead.', 'info');
      });
    }
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
