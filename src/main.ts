import './style.css';
import * as THREE from 'three';
import { GameEngine, ContextualPrompt } from './game/GameEngine';
import { CatCharacter } from './game/CatCharacter';
import { RatEntity } from './game/RatEntity';
import { TestRunner, TestResult } from './tests/TestRunner';
import { CatVitals } from './core/VitalsSystem';
import { ShipbuildingAssistEvent } from './core/AssistanceEngine';
import { soundEngine } from './core/SoundEngine';
import { RemoteLogger } from './core/RemoteLogger';
import { SecurityGate } from './security/SecurityGate';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize automated local error logging bridge
  RemoteLogger.init();

  // 0. Security Clearance Protocol Gate
  const securityBarrier = document.getElementById('nns-security-barrier');
  const clearanceForm = document.getElementById('clearance-form') as HTMLFormElement | null;
  const badgeInput = document.getElementById('operator-badge') as HTMLInputElement | null;
  const codeInput = document.getElementById('clearance-code') as HTMLInputElement | null;
  const errorMsg = document.getElementById('security-error-msg') as HTMLElement | null;
  const statusLed = document.getElementById('security-status-led') as HTMLElement | null;

  if (SecurityGate.isAuthorized()) {
    if (securityBarrier) securityBarrier.style.display = 'none';
  } else {
    if (securityBarrier) securityBarrier.style.display = 'flex';
    if (clearanceForm) {
      clearanceForm.onsubmit = (e) => {
        e.preventDefault();
        const badge = badgeInput?.value || 'YARD-CAT-01';
        const code = codeInput?.value || '';
        const res = SecurityGate.authorize(badge, code);
        if (res.success) {
          if (statusLed) {
            statusLed.style.background = '#22c55e';
            statusLed.style.boxShadow = '0 0 10px #22c55e';
          }
          if (errorMsg) {
            errorMsg.style.color = '#4ade80';
            errorMsg.textContent = res.message;
          }
          setTimeout(() => {
            if (securityBarrier) securityBarrier.style.display = 'none';
          }, 350);
        } else {
          if (errorMsg) {
            errorMsg.style.color = '#f87171';
            errorMsg.textContent = res.message;
          }
        }
      };
    }
  }

  const container = document.getElementById('game-container');
  if (!container) return;

  // In development, ensure all service workers are unregistered so Vite dev HMR & requests are never intercepted
  if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.unregister();
      });
    } else if (window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('[SW Registration Note]', err);
      });
    }
  }

  // Loading Screen Elements
  const loadingScreen = document.getElementById('loading-screen') as HTMLElement;
  const loadingProgressBar = document.getElementById('loading-progress-bar') as HTMLElement;
  const loadingStatusText = document.getElementById('loading-status-text') as HTMLElement;
  const btnEnterGame = document.getElementById('btn-enter-game') as HTMLButtonElement;

  if (btnEnterGame) {
    btnEnterGame.disabled = true;
    btnEnterGame.style.display = 'none';
  }

  let game: GameEngine;
  try {
    game = new GameEngine(container);
    (window as any).game = game;
    (window as any).soundEngine = soundEngine;
    (window as any).RemoteLogger = RemoteLogger;
    const chronometerClock = document.getElementById('chronometer-clock');
    const chronometerShift = document.getElementById('chronometer-shift');
    game.onFrameUpdate = () => {
      updatePerformanceProfiler();
      updateSonarDistanceBadge();
      if (chronometerClock && chronometerShift && game.renderSystem.diurnalSystem) {
        const info = game.renderSystem.diurnalSystem.evaluateShift();
        if (chronometerClock.textContent !== info.timeString) {
          chronometerClock.textContent = info.timeString;
        }
        if (chronometerShift.textContent !== info.label) {
          chronometerShift.textContent = info.label;
        }
      }
    };
    game.onFreezeDetected = (incident) => {
      handleFreezeIncidentDetected(incident);
    };

    const setProgress = (pct: number, stage: string) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      if (loadingProgressBar) loadingProgressBar.style.width = `${clamped}%`;
      if (loadingStatusText) loadingStatusText.textContent = `[${clamped}%] ${stage}`;
    };

    // Execute Strict Multi-Stage Pre-Flight Asset & Shader Verification Gate
    (async () => {
      try {
        setProgress(0, 'Initializing WebGL2 Context & Physics World...');

        await game.initPipeline((pct, stage) => {
          setProgress(pct, stage);
        });

        setProgress(100, 'Pre-Flight Verification Complete — Yard Ready');
      } catch (pipelineErr) {
        console.warn('[Engine Warmup Non-Critical Fallback]', pipelineErr);
        setProgress(100, 'Pre-Flight Complete (Fallback Mode Ready)');
      }

      // Soundtrack & Volume preferences
      const btnToggleMusicLoading = document.getElementById('btn-toggle-music-loading') as HTMLButtonElement | null;
      const btnVolumeMusicLoading = document.getElementById('btn-volume-music-loading') as HTMLButtonElement | null;
      const btnMusicToggle = document.getElementById('btn-music-toggle') as HTMLButtonElement | null;
      const btnVolumeToggle = document.getElementById('btn-volume-toggle') as HTMLButtonElement | null;
      const hudMusicLabel = document.getElementById('hud-music-label');
      const hudVolumeLabel = document.getElementById('hud-volume-label');

      let musicPref = true;
      try {
        const stored = localStorage.getItem('shipyard_cat_music_enabled');
        if (stored !== null) musicPref = stored === 'true';
      } catch {}

      const syncVolumeUI = (pct: number) => {
        const volText = pct > 0 ? `VOL: ${pct}%` : 'MUTE';
        if (btnVolumeMusicLoading) {
          btnVolumeMusicLoading.textContent = volText;
          btnVolumeMusicLoading.style.background = pct > 0 ? '#0284c7' : '#64748b';
        }
        if (hudVolumeLabel) {
          hudVolumeLabel.textContent = pct > 0 ? `🔉 Vol: ${pct}%` : '🔇 Vol: OFF';
        }
      };

      const syncMusicButtons = (enabled: boolean) => {
        musicPref = enabled;
        if (btnToggleMusicLoading) {
          btnToggleMusicLoading.textContent = enabled ? 'ON' : 'OFF';
          btnToggleMusicLoading.style.background = enabled ? '#10b981' : '#64748b';
          btnToggleMusicLoading.style.color = enabled ? '#022c22' : '#f8fafc';
        }
        if (hudMusicLabel) {
          hudMusicLabel.textContent = enabled ? '🎵 Music: ON' : '🔇 Music: OFF';
        }
        syncVolumeUI(enabled ? soundEngine.getVolumePercentage() : 0);
      };

      // Initial UI sync
      syncMusicButtons(musicPref);
      syncVolumeUI(musicPref ? soundEngine.getVolumePercentage() : 0);

      // Loading Screen Music Toggle
      if (btnToggleMusicLoading) {
        btnToggleMusicLoading.onclick = (e) => {
          e.stopPropagation();
          const nextState = !musicPref;
          soundEngine.setMusicEnabled(nextState);
          syncMusicButtons(nextState);
        };
      }

      // Loading Screen Volume Cycle
      if (btnVolumeMusicLoading) {
        btnVolumeMusicLoading.onclick = (e) => {
          e.stopPropagation();
          soundEngine.cycleVolume();
          syncMusicButtons(soundEngine.isMusicEnabled());
        };
      }

      // HUD Music Toggle
      if (btnMusicToggle) {
        btnMusicToggle.onclick = () => {
          const nextState = !soundEngine.isMusicEnabled();
          soundEngine.setMusicEnabled(nextState);
          syncMusicButtons(nextState);
        };
      }

      // HUD Volume Cycle
      if (btnVolumeToggle) {
        btnVolumeToggle.onclick = () => {
          soundEngine.cycleVolume();
          syncMusicButtons(soundEngine.isMusicEnabled());
        };
      }

      if (btnEnterGame) {
        btnEnterGame.disabled = false;
        btnEnterGame.style.display = 'inline-block';
        btnEnterGame.onclick = () => {
          btnEnterGame.disabled = true;
          try {
            soundEngine.init();
            soundEngine.prewarmAudioBuffers();
            soundEngine.initMusic(musicPref);
            soundEngine.playPurr();
          } catch (audioErr) {
            console.warn('[Audio Subsystem Non-Critical Note]', audioErr);
          }
          game.startLoop();
          if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
              loadingScreen.style.display = 'none';
            }, 600);
          }
        };
      }
    })();
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
  const btnDismissOnboarding = document.getElementById('btn-dismiss-onboarding') as HTMLButtonElement | null;
  const btnControls = document.getElementById('btn-controls') as HTMLButtonElement;
  const btnWorkorder = document.getElementById('btn-workorder') as HTMLButtonElement;
  const btnNightMode = document.getElementById('btn-night-mode') as HTMLButtonElement | null;
  const hudShiftLabel = document.getElementById('hud-shift-label');
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

  // Compact Toggle Pill for Controls & Protocol (Lead UX Review: Clean screen footprint)
  let controlsPill = document.getElementById('controls-toggle-pill') as HTMLElement | null;
  if (!controlsPill) {
    controlsPill = document.createElement('button');
    controlsPill.id = 'controls-toggle-pill';
    controlsPill.className = 'hud-btn-pill';
    controlsPill.innerHTML = `⌨️ Controls & Protocol <kbd>H</kbd>`;
    controlsPill.style.display = 'none';
    document.body.appendChild(controlsPill);
  }

  function setOnboardingVisibility(visible: boolean) {
    if (onboardingCard) {
      if (visible) {
        onboardingCard.classList.remove('hidden');
        if (controlsPill) controlsPill.style.display = 'none';
      } else {
        onboardingCard.classList.add('hidden');
        if (controlsPill) controlsPill.style.display = 'inline-flex';
      }
    }
  }

  controlsPill?.addEventListener('click', () => {
    setOnboardingVisibility(true);
  });

  // 1. Immediate Non-Blocking Toast Notification System (Zero-Lag Floating Stack)
  interface ActiveToastItem {
    el: HTMLElement;
    key: string;
    timeoutId: number;
  }
  const activeToasts: ActiveToastItem[] = [];
  const MAX_ACTIVE_TOASTS = 3;
  const TOAST_LIFETIME_MS = 2500;

  function showToast(title: string, message: string, type: 'info' | 'success' | 'warn' = 'info') {
    // Record all notifications in dialogueArchive so user can review full history in Logbook modal
    dialogueArchive.unshift({
      speaker: title,
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (dialogueArchive.length > 50) dialogueArchive.pop();

    const key = `${title}:${message}`;
    const existing = activeToasts.find(t => t.key === key);
    if (existing) {
      window.clearTimeout(existing.timeoutId);
      existing.timeoutId = window.setTimeout(() => removeToast(existing), TOAST_LIFETIME_MS);
      return;
    }

    while (activeToasts.length >= MAX_ACTIVE_TOASTS) {
      const oldest = activeToasts.shift();
      if (oldest) {
        window.clearTimeout(oldest.timeoutId);
        oldest.el.remove();
      }
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    toast.innerHTML = `
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    `;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    const item: ActiveToastItem = {
      el: toast,
      key,
      timeoutId: window.setTimeout(() => removeToast(item), TOAST_LIFETIME_MS)
    };
    activeToasts.push(item);
  }

  function removeToast(item: ActiveToastItem) {
    const idx = activeToasts.indexOf(item);
    if (idx !== -1) {
      window.clearTimeout(item.timeoutId);
      activeToasts.splice(idx, 1);
    }
    item.el.style.opacity = '0';
    item.el.style.transform = 'translateY(-8px)';
    window.setTimeout(() => item.el.remove(), 200);
  }

  game.onNotification = showToast;

  // 1B. Faint & Sanctuary Rescue Transition
  const faintOverlay = document.getElementById('faint-blackout-overlay');
  const faintCard = document.getElementById('faint-rescue-card');
  game.onFaintStart = () => {
    if (faintOverlay) {
      faintOverlay.style.display = 'flex';
      requestAnimationFrame(() => {
        faintOverlay.style.opacity = '1';
        faintOverlay.style.pointerEvents = 'auto';
        if (faintCard) {
          faintCard.style.opacity = '1';
          faintCard.style.transform = 'translateY(0)';
        }
      });
    }
  };
  game.onFaintRecover = () => {
    if (faintOverlay) {
      if (faintCard) {
        faintCard.style.opacity = '0';
        faintCard.style.transform = 'translateY(20px)';
      }
      setTimeout(() => {
        faintOverlay.style.opacity = '0';
        faintOverlay.style.pointerEvents = 'none';
        setTimeout(() => {
          faintOverlay.style.display = 'none';
        }, 1200);
      }, 800);
    }
  };

  // 2. Interactive RPG NPC Dialogue Modal & Proximity Prompt
  const dialogueOverlay = document.createElement('div');
  dialogueOverlay.id = 'sc-dialogue-overlay';
  dialogueOverlay.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    width: min(620px, 92vw);
    background: rgba(15, 23, 42, 0.96);
    border: 2px solid #eab308;
    border-radius: 12px;
    padding: 16px 20px;
    color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
    display: none;
    flex-direction: column;
    gap: 8px;
    z-index: 960;
    box-shadow: 0 12px 32px rgba(0,0,0,0.7);
    cursor: pointer;
  `;
  dialogueOverlay.innerHTML = `
    <div style="display: flex; align-items: baseline; justify-content: space-between;">
      <div style="display: flex; align-items: baseline; gap: 8px;">
        <span id="sc-dialogue-speaker" style="font-size: 1.15rem; font-weight: 800; color: #fde047;"></span>
        <span id="sc-dialogue-role" style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;"></span>
      </div>
      <span style="font-size: 0.7rem; color: #cbd5e1; opacity: 0.6;">[CLICK / E / SPACE]</span>
    </div>
    <div id="sc-dialogue-text" style="font-size: 0.95rem; line-height: 1.48; color: #f1f5f9; min-height: 2.2em;"></div>
    <div style="align-self: flex-end; font-size: 0.72rem; color: #eab308; font-weight: 600;">Continue →</div>
  `;
  document.body.appendChild(dialogueOverlay);

  const interactionPrompt = document.createElement('div');
  interactionPrompt.id = 'sc-interaction-prompt';
  interactionPrompt.style.cssText = `
    position: fixed;
    bottom: 175px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.92);
    color: #fde047;
    padding: 6px 16px;
    border-radius: 999px;
    border: 1px solid rgba(253, 224, 71, 0.55);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    z-index: 920;
    display: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.45);
    pointer-events: none;
  `;
  document.body.appendChild(interactionPrompt);

  let isDialogueOpen = false;
  const speakerEl = dialogueOverlay.querySelector('#sc-dialogue-speaker') as HTMLElement;
  const roleEl = dialogueOverlay.querySelector('#sc-dialogue-role') as HTMLElement;
  const textEl = dialogueOverlay.querySelector('#sc-dialogue-text') as HTMLElement;

  function openDialogueModal(speaker: string, role: string, text: string) {
    if (speakerEl) speakerEl.textContent = speaker;
    if (roleEl) roleEl.textContent = role;
    if (textEl) textEl.textContent = text;
    dialogueOverlay.style.display = 'flex';
    isDialogueOpen = true;
    interactionPrompt.style.display = 'none';
  }

  function closeDialogueModal() {
    dialogueOverlay.style.display = 'none';
    isDialogueOpen = false;
  }

  dialogueOverlay.addEventListener('click', () => {
    closeDialogueModal();
  });

  game.onDialogue = (speaker, role, text) => {
    openDialogueModal(speaker, role, text);
  };

  game.onInteractionPrompt = (promptText) => {
    if (!promptText || isDialogueOpen) {
      interactionPrompt.style.display = 'none';
    } else {
      interactionPrompt.textContent = promptText;
      interactionPrompt.style.display = 'block';
    }
  };

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
          if (p.type === 'TALK' || p.type === 'EAT' || p.type === 'SLEEP') {
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
    const firstIncompleteIdx = mission.objectives.findIndex(o => !o.isCompleted);
    mission.objectives.forEach((obj, idx) => {
      const item = document.createElement('div');
      item.className = `objective-item ${obj.isCompleted ? 'done' : ''}`;
      
      let countText = '';
      if (obj.requiredCount) {
        countText = ` (${obj.currentCount || 0}/${obj.requiredCount})`;
      }

      const showActiveHint = !obj.isCompleted && idx === firstIncompleteIdx && obj.hint;
      item.innerHTML = `
        <div class="obj-checkbox">${obj.isCompleted ? '✓' : ''}</div>
        <div>
          <span>${obj.description}${countText}</span>
          ${showActiveHint ? `<div style="font-size: 0.72rem; color: #94a3b8; margin-top: 0.1rem;">💡 ${obj.hint}</div>` : ''}
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
        <button class="hud-btn" data-mission-select="${m.id}" style="width: 100%; justify-content: space-between; font-size: 0.78rem; padding: 0.4rem 0.75rem; background: ${m.id === mission.id ? 'rgba(56, 189