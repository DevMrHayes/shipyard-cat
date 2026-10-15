export type AcousticZone =
  | 'OUTDOOR_YARD'
  | 'MACHINE_SHOP'
  | 'DRY_DOCK_BASIN'
  | 'RADIATION_VAULT';

export type SpatialSoundType =
  | 'WELDING_SIZZLE'
  | 'RAT_SQUEAK'
  | 'WATER_LAP'
  | 'MACHINE_HUM';

// Procedural Web Audio Sound Engine for Industrial Atmosphere, Feline Vocalizations & Combat FX
// Zero-Allocation, Non-Blocking, Pre-rendered AudioBuffer Architecture
export class SoundEngine {
  public onAudioEvent?: (eventName: string) => void;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private isMuted: boolean = false;
  private currentRadiation: number = 0;
  private geigerAccumulator: number = 0;
  private nextGeigerInterval: number = 0.5;
  private lastGeigerTimestamp: number = 0;

  // Spatial audio & environmental convolution reverb state
  private impulseCache: Map<AcousticZone, AudioBuffer> = new Map();
  private spatialBufferCache: Map<SpatialSoundType, AudioBuffer> = new Map();
  private currentZone: AcousticZone = 'OUTDOOR_YARD';

  // Dynamic Background Music (BGM) Subsystem
  private musicEnabled: boolean = true;
  private musicVolume: number = 0.22; // Gentle, ambient, non-intrusive
  private bgmExploration: HTMLAudioElement | null = null;
  private bgmBoss: HTMLAudioElement | null = null;
  private isBossMusicActive: boolean = false;
  private musicFadeInterval: any = null;

  // Zone Wet/Dry mix profiles
  private static readonly ZONE_MIX: Record<AcousticZone, { dry: number; wet: number }> = {
    OUTDOOR_YARD: { dry: 0.92, wet: 0.14 },
    MACHINE_SHOP: { dry: 0.72, wet: 0.48 },
    DRY_DOCK_BASIN: { dry: 0.65, wet: 0.60 },
    RADIATION_VAULT: { dry: 0.85, wet: 0.22 },
  };

  // Cached pre-rendered procedural AudioBuffers (Zero per-frame / per-trigger allocation)
  private geigerBuffer: AudioBuffer | null = null;
  private whiskersPingBuffer: AudioBuffer | null = null;
  private meowBuffer: AudioBuffer | null = null;
  private purrBuffer: AudioBuffer | null = null;
  private pawSwipeBuffer: AudioBuffer | null = null;
  private clawComboBuffer: AudioBuffer | null = null;
  private tailSweepBuffer: AudioBuffer | null = null;
  private hissBuffer: AudioBuffer | null = null;
  private waterSplashBuffer: AudioBuffer | null = null;
  private pounceBuffer: AudioBuffer | null = null;
  private ratCatchBuffer: AudioBuffer | null = null;
  private weldingBuffer: AudioBuffer | null = null;
  private hitImpactLightBuffer: AudioBuffer | null = null;
  private hitImpactHeavyBuffer: AudioBuffer | null = null;
  private clawSliceBuffer: AudioBuffer | null = null;
  private ratPanicBuffer: AudioBuffer | null = null;
  private mutantRecoilBuffer: AudioBuffer | null = null;
  private eatSnackBuffer: AudioBuffer | null = null;
  private successBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext initialized on first user interaction or explicit init()
  }

  public init(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 1.0;
      this.masterGain.connect(this.ctx.destination);
    }
    if (!this.dryGain) {
      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = SoundEngine.ZONE_MIX.OUTDOOR_YARD.dry;
      this.dryGain.connect(this.masterGain);
    }
    if (!this.convolver) {
      this.convolver = this.ctx.createConvolver();
    }
    if (!this.wetGain) {
      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = SoundEngine.ZONE_MIX.OUTDOOR_YARD.wet;
      this.convolver.connect(this.wetGain);
      this.wetGain.connect(this.masterGain);
    }
    if (!this.sfxGain) {
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.dryGain);
      this.sfxGain.connect(this.convolver);
    }

    this.bakeImpulseResponses();
    this.bakeSpatialSoundBuffers();
    if (this.convolver) {
      this.convolver.buffer = this.impulseCache.get(this.currentZone) || null;
    }

    this.prewarmAudioBuffers();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1.0, this.ctx.currentTime);
    }
  }

  public dispose(): void {
    if (this.musicFadeInterval) {
      clearInterval(this.musicFadeInterval);
      this.musicFadeInterval = null;
    }
    this.pauseAllMusic();
    this.bgmExploration = null;
    this.bgmBoss = null;

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.impulseCache.clear();
    this.spatialBufferCache.clear();
    this.clearBuffers();
  }

  private clearBuffers(): void {
    this.geigerBuffer = null;
    this.whiskersPingBuffer = null;
    this.meowBuffer = null;
    this.purrBuffer = null;
    this.pawSwipeBuffer = null;
    this.clawComboBuffer = null;
    this.tailSweepBuffer = null;
    this.hissBuffer = null;
    this.waterSplashBuffer = null;
    this.pounceBuffer = null;
    this.ratCatchBuffer = null;
    this.weldingBuffer = null;
    this.hitImpactLightBuffer = null;
    this.hitImpactHeavyBuffer = null;
    this.clawSliceBuffer = null;
    this.ratPanicBuffer = null;
    this.mutantRecoilBuffer = null;
    this.eatSnackBuffer = null;
    this.successBuffer = null;
  }

  public prewarmAudioBuffers(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate || 44100;

    // 1. Geiger Click (0.008s)
    if (!this.geigerBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.008));
      this.geigerBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.geigerBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 1600;
        phase += 2 * Math.PI * freq * (1 / sr);
        const saw = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
        const env = Math.exp(-t / 0.0018) * 0.15;
        data[i] = saw * env;
      }
    }

    // 2. Whiskers Ping (0.46s)
    if (!this.whiskersPingBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.46));
      this.whiskersPingBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.whiskersPingBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let freq: number;
        if (t < 0.18) {
          freq = 880 * Math.pow(1760 / 880, t / 0.18);
        } else {
          freq = 1760 * Math.pow(220 / 1760, (t - 0.18) / 0.27);
        }
        phase += 2 * Math.PI * freq * (1 / sr);
        let env = 0;
        if (t < 0.05) {
          env = 0.01 + (0.2 - 0.01) * (t / 0.05);
        } else {
          env = 0.2 * Math.pow(0.001 / 0.2, (t - 0.05) / 0.40);
        }
        data[i] = Math.sin(phase) * env;
      }
    }

    // 3. Cat Meow (0.50s)
    if (!this.meowBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.50));
      this.meowBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.meowBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let freq: number;
        if (t < 0.15) {
          freq = 580 * Math.pow(840 / 580, t / 0.15);
        } else {
          freq = 840 * Math.pow(420 / 840, (t - 0.15) / 0.30);
        }
        phase += 2 * Math.PI * freq * (1 / sr);
        let env = 0;
        if (t < 0.08) {
          env = 0.01 + (0.18 - 0.01) * (t / 0.08);
        } else {
          env = 0.18 * Math.pow(0.001 / 0.18, (t - 0.08) / 0.40);
        }
        const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
        data[i] = tri * env;
      }
    }

    // 4. Cat Purr (0.65s)
    if (!this.purrBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.65));
      this.purrBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.purrBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        phase += 2 * Math.PI * 32 * (1 / sr);
        const flutter = 0.7 + 0.3 * Math.sin(2 * Math.PI * 25 * t);
        let env = 0;
        if (t < 0.2) {
          env = 0.05 + (0.2 - 0.05) * (t / 0.2);
        } else {
          env = 0.2 + (0.01 - 0.2) * ((t - 0.2) / 0.45);
        }
        data[i] = Math.sin(phase) * env * flutter;
      }
    }

    // 5. Paw Swipe (0.13s)
    if (!this.pawSwipeBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.13));
      this.pawSwipeBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.pawSwipeBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 450 * Math.pow(120 / 450, t / 0.12);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.25 * Math.pow(0.01 / 0.25, t / 0.12);
        const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
        data[i] = tri * env;
      }
    }

    // 6. Claw Combo Finisher (0.19s)
    if (!this.clawComboBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.19));
      this.clawComboBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.clawComboBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 680 * Math.pow(220 / 680, t / 0.18);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.30 * Math.pow(0.01 / 0.30, t / 0.18);
        const saw = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
        data[i] = saw * env;
      }
    }

    // 7. Tail Sweep (0.26s)
    if (!this.tailSweepBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.26));
      this.tailSweepBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.tailSweepBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 160 * Math.pow(60 / 160, t / 0.25);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.35 * Math.pow(0.01 / 0.35, t / 0.25);
        data[i] = Math.sin(phase) * env;
      }
    }

    // 8. Cat Hiss (0.30s)
    if (!this.hissBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.30));
      this.hissBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.hissBuffer.getChannelData(0);
      let b0 = 0, b1 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = (Math.random() * 2 - 1);
        b0 = 0.85 * b0 + 0.15 * white;
        b1 = 0.75 * b1 + 0.25 * b0;
        const b2 = b0 - b1;
        const env = 0.22 * Math.pow(0.01 / 0.22, t / 0.30);
        data[i] = b2 * env;
      }
    }

    // 9. Water Splash (0.31s)
    if (!this.waterSplashBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.31));
      this.waterSplashBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.waterSplashBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 240 * Math.pow(80 / 240, t / 0.30);
        phase += 2 * Math.PI * freq * (1 / sr);
        const noise = (Math.random() * 2 - 1) * 0.2;
        const env = 0.25 * Math.pow(0.01 / 0.25, t / 0.30);
        data[i] = (Math.sin(phase) + noise) * env;
      }
    }

    // 10. Cat Pounce (0.26s)
    if (!this.pounceBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.26));
      this.pounceBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.pounceBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 180 * Math.pow(45 / 180, t / 0.25);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.30 * Math.pow(0.01 / 0.30, t / 0.25);
        data[i] = Math.sin(phase) * env;
      }
    }

    // 11. Rat Catch (0.15s)
    if (!this.ratCatchBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.15));
      this.ratCatchBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.ratCatchBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 2200 * Math.pow(1400 / 2200, t / 0.12);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.15 * Math.pow(0.01 / 0.15, t / 0.14);
        const sq = Math.sin(phase) >= 0 ? 1 : -1;
        data[i] = sq * env;
      }
    }

    // 12. Welding Burst (0.15s)
    if (!this.weldingBuffer) {
      const len = Math.floor(sr * 0.15);
      this.weldingBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.weldingBuffer.getChannelData(0);
      let b0 = 0, b1 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = (Math.random() * 2 - 1);
        b0 = 0.9 * b0 + 0.1 * white;
        b1 = 0.8 * b1 + 0.2 * b0;
        const crackle = (Math.random() < 0.2 ? (Math.random() * 2 - 1) : 0);
        const env = 0.15 * Math.pow(0.001 / 0.15, t / 0.15);
        data[i] = ((b0 - b1) * 1.5 + crackle * 0.5) * env;
      }
    }

    // 13. Hit Impact Light (0.14s)
    if (!this.hitImpactLightBuffer) {
      const len = Math.floor(sr * 0.14);
      this.hitImpactLightBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.hitImpactLightBuffer.getChannelData(0);
      let subPhase = 0, snapPhase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const subFreq = 180 * Math.pow(30 / 180, t / 0.12);
        subPhase += 2 * Math.PI * subFreq * (1 / sr);
        const subEnv = 0.30 * Math.pow(0.001 / 0.30, t / 0.12);
        const sub = (2 / Math.PI) * Math.asin(Math.sin(subPhase)) * subEnv;

        let snap = 0;
        if (t < 0.06) {
          const snapFreq = 950 * Math.pow(120 / 950, t / 0.05);
          snapPhase += 2 * Math.PI * snapFreq * (1 / sr);
          const snapEnv = 0.22 * Math.pow(0.001 / 0.22, t / 0.06);
          snap = (2 * ((snapPhase / (2 * Math.PI)) % 1) - 1) * snapEnv;
        }
        data[i] = sub + snap;
      }
    }

    // 14. Hit Impact Heavy (0.14s)
    if (!this.hitImpactHeavyBuffer) {
      const len = Math.floor(sr * 0.14);
      this.hitImpactHeavyBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.hitImpactHeavyBuffer.getChannelData(0);
      let subPhase = 0, snapPhase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const subFreq = 140 * Math.pow(30 / 140, t / 0.12);
        subPhase += 2 * Math.PI * subFreq * (1 / sr);
        const subEnv = 0.45 * Math.pow(0.001 / 0.45, t / 0.12);
        const sub = (2 / Math.PI) * Math.asin(Math.sin(subPhase)) * subEnv;

        let snap = 0;
        if (t < 0.06) {
          const snapFreq = 950 * Math.pow(120 / 950, t / 0.05);
          snapPhase += 2 * Math.PI * snapFreq * (1 / sr);
          const snapEnv = 0.35 * Math.pow(0.001 / 0.35, t / 0.06);
          snap = (2 * ((snapPhase / (2 * Math.PI)) % 1) - 1) * snapEnv;
        }
        data[i] = sub + snap;
      }
    }

    // 15. Claw Slice (0.10s)
    if (!this.clawSliceBuffer) {
      const len = Math.floor(sr * 0.10);
      this.clawSliceBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.clawSliceBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 1400 * Math.pow(350 / 1400, t / 0.09);
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.28 * Math.pow(0.001 / 0.28, t / 0.09);
        const saw = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
        data[i] = saw * env;
      }
    }

    // 16. Rat Panic (0.16s)
    if (!this.ratPanicBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.16));
      this.ratPanicBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.ratPanicBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let freq: number;
        if (t < 0.06) {
          freq = 2800 + (3500 - 2800) * (t / 0.06);
        } else {
          freq = 3500 + (2100 - 3500) * ((t - 0.06) / 0.08);
        }
        phase += 2 * Math.PI * freq * (1 / sr);
        let env: number;
        if (t < 0.05) {
          env = 0.12 + (0.18 - 0.12) * (t / 0.05);
        } else {
          env = 0.18 * Math.pow(0.001 / 0.18, (t - 0.05) / 0.10);
        }
        const sq = Math.sin(phase) >= 0 ? 1 : -1;
        data[i] = sq * env;
      }
    }

    // 17. Mutant Recoil (0.36s)
    if (!this.mutantRecoilBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.36));
      this.mutantRecoilBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.mutantRecoilBuffer.getChannelData(0);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let freq: number;
        if (t < 0.1) {
          freq = 280 + (450 - 280) * (t / 0.1);
        } else {
          freq = 450 * Math.pow(80 / 450, (t - 0.1) / 0.25);
        }
        phase += 2 * Math.PI * freq * (1 / sr);
        const env = 0.25 * Math.pow(0.01 / 0.25, t / 0.35);
        const saw = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
        data[i] = saw * env;
      }
    }

    // 18. Eat Snack (0.35s)
    if (!this.eatSnackBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.35));
      this.eatSnackBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.eatSnackBuffer.getChannelData(0);
      const chews = [
        { start: 0.0, f0: 600 },
        { start: 0.12, f0: 750 },
        { start: 0.24, f0: 900 }
      ];
      for (const chew of chews) {
        let phase = 0;
        const chewLen = Math.floor(sr * 0.09);
        const startIdx = Math.floor(sr * chew.start);
        for (let i = 0; i < chewLen && startIdx + i < len; i++) {
          const t = i / sr;
          const freq = chew.f0 * Math.pow(200 / chew.f0, t / 0.08);
          phase += 2 * Math.PI * freq * (1 / sr);
          const env = 0.15 * Math.pow(0.001 / 0.15, t / 0.08);
          const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
          data[startIdx + i] += tri * env;
        }
      }
    }

    // 19. Success (0.55s)
    if (!this.successBuffer) {
      const len = Math.max(1, Math.floor(sr * 0.55));
      this.successBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.successBuffer.getChannelData(0);
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        let phase = 0;
        const startIdx = Math.floor(sr * idx * 0.08);
        const noteLen = Math.floor(sr * 0.26);
        for (let i = 0; i < noteLen && startIdx + i < len; i++) {
          const t = i / sr;
          phase += 2 * Math.PI * freq * (1 / sr);
          const env = 0.18 * Math.pow(0.001 / 0.18, t / 0.25);
          data[startIdx + i] += Math.sin(phase) * env;
        }
      });
    }
  }

  /**
   * Generates zero-network procedural Impulse Responses for the 4 Shipyard acoustic zones.
   */
  private bakeImpulseResponses(): void {
    if (!this.ctx) return;

    const configs: Record<AcousticZone, { duration: number; decay: number; metallic: boolean; muffled: boolean }> = {
      OUTDOOR_YARD: { duration: 0.4, decay: 6.5, metallic: false, muffled: false },
      MACHINE_SHOP: { duration: 1.8, decay: 2.6, metallic: true, muffled: false },
      DRY_DOCK_BASIN: { duration: 2.4, decay: 1.8, metallic: false, muffled: false },
      RADIATION_VAULT: { duration: 0.2, decay: 14.0, metallic: false, muffled: true },
    };

    (Object.keys(configs) as AcousticZone[]).forEach((zone) => {
      const cfg = configs[zone];
      const sampleRate = this.ctx!.sampleRate;
      const length = Math.floor(sampleRate * cfg.duration);
      const buffer = this.ctx!.createBuffer(2, length, sampleRate);

      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let prevSample = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          let env = Math.exp(-cfg.decay * t);

          let sample = (Math.random() * 2 - 1) * env;

          // Machine Shop: High-frequency metallic flutter echo
          if (cfg.metallic) {
            const flutter = Math.sin(2 * Math.PI * 38 * t) > 0.7 ? 1.65 : 0.6;
            const ring = Math.sin(2 * Math.PI * (1420 + ch * 110) * t) * 0.35;
            sample = (sample * flutter + ring * env) * 0.75;
          }

          // Dry Dock Basin: Low-end cavernous concrete resonance
          if (zone === 'DRY_DOCK_BASIN') {
            const concreteBoom = Math.sin(2 * Math.PI * 92 * t) * Math.exp(-1.5 * t) * 0.4;
            sample = sample * 0.7 + concreteBoom;
          }

          // Radiation Vault: Heavily dampened lead-shielded low-pass smoothing
          if (cfg.muffled) {
            sample = prevSample * 0.88 + sample * 0.12;
            prevSample = sample;
          }

          data[i] = sample;
        }
      }
      this.impulseCache.set(zone, buffer);
    });
  }

  /**
   * Pre-renders procedural audio buffers for 3D spatial industrial/ambient emitters.
   */
  private bakeSpatialSoundBuffers(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;

    // 1. WELDING_SIZZLE (0.45s high-frequency arc crackle)
    {
      const len = Math.floor(sr * 0.45);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.sin((t / 0.45) * Math.PI);
        const crackle = Math.random() > 0.25 ? (Math.random() * 2 - 1) : 0;
        const buzz = Math.sin(2 * Math.PI * 120 * t) * 0.3;
        data[i] = (crackle * 0.75 + buzz) * env * 0.5;
      }
      this.spatialBufferCache.set('WELDING_SIZZLE', buf);
    }

    // 2. RAT_SQUEAK (0.18s FM high-pitched rodent chirp)
    {
      const len = Math.floor(sr * 0.18);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.sin((t / 0.18) * Math.PI);
        const freq = 2400 + Math.sin(t * 95) * 650;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.45;
      }
      this.spatialBufferCache.set('RAT_SQUEAK', buf);
    }

    // 3. WATER_LAP (0.65s filtered shoreline slosh)
    {
      const len = Math.floor(sr * 0.65);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.sin((t / 0.65) * Math.PI);
        const raw = (Math.random() * 2 - 1) * env;
        lp = lp * 0.92 + raw * 0.08;
        data[i] = lp * 1.8;
      }
      this.spatialBufferCache.set('WATER_LAP', buf);
    }

    // 4. MACHINE_HUM (0.8s 60Hz/120Hz transformer drone pulse)
    {
      const len = Math.floor(sr * 0.8);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.sin((t / 0.8) * Math.PI);
        const hum = Math.sin(2 * Math.PI * 60 * t) * 0.5 + Math.sin(2 * Math.PI * 120 * t) * 0.3;
        data[i] = hum * env * 0.4;
      }
      this.spatialBufferCache.set('MACHINE_HUM', buf);
    }
  }

  /**
   * Updates the 3D Web Audio API Listener to match Alba's world position and camera heading.
   * Zero object allocations per frame.
   */
  public updateListener(x: number, y: number, z: number, forwardX: number, forwardZ: number): void {
    if (!this.ctx || this.isMuted) return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(x, now);
      listener.positionY.setValueAtTime(y, now);
      listener.positionZ.setValueAtTime(z, now);
      listener.forwardX.setValueAtTime(forwardX, now);
      listener.forwardY.setValueAtTime(0, now);
      listener.forwardZ.setValueAtTime(forwardZ, now);
      listener.upX.setValueAtTime(0, now);
      listener.upY.setValueAtTime(1, now);
      listener.upZ.setValueAtTime(0, now);
    } else {
      listener.setPosition(x, y, z);
      listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
    }
  }

  /**
   * Transitions the environmental convolution reverb to the target Shipyard acoustic zone
   * with smooth wet/dry gain crossfading.
   */
  public setAcousticZone(zone: AcousticZone): void {
    if (this.currentZone === zone) return;
    this.currentZone = zone;

    if (!this.ctx || !this.convolver || !this.dryGain || !this.wetGain) return;

    const irBuffer = this.impulseCache.get(zone);
    if (irBuffer) {
      this.convolver.buffer = irBuffer;
    }

    const mix = SoundEngine.ZONE_MIX[zone];
    const now = this.ctx.currentTime;
    this.dryGain.gain.setTargetAtTime(mix.dry, now, 0.18);
    this.wetGain.gain.setTargetAtTime(mix.wet, now, 0.18);
  }

  public getAcousticZone(): AcousticZone {
    return this.currentZone;
  }

  private activeSpatialVoices: number = 0;
  private static readonly MAX_SPATIAL_VOICES: number = 4;

  /**
   * Plays a 3D spatialized sound at world coordinates (x, y, z) using an inverse-distance PannerNode.
   * Self-disconnects on completion for zero memory leaks.
   */
  public playSpatialSound(
    soundType: SpatialSoundType | string,
    x: number,
    y: number,
    z: number,
    volume: number = 1.0
  ): void {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.dryGain || !this.convolver) return;
    if (this.activeSpatialVoices >= SoundEngine.MAX_SPATIAL_VOICES) return;

    const buffer = this.spatialBufferCache.get(soundType as SpatialSoundType);
    if (!buffer) return;

    const now = this.ctx.currentTime;
    this.activeSpatialVoices++;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.01, Math.min(2.0, volume)), now);

    const isLightSfx = soundType === 'RAT_SQUEAK';
    const panner = this.ctx.createPanner();
    panner.panningModel = isLightSfx ? 'equalpower' : 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2.0;
    panner.maxDistance = isLightSfx ? 25.0 : 45.0;
    panner.rolloffFactor = 1.2;

    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, now);
      panner.positionY.setValueAtTime(y, now);
      panner.positionZ.setValueAtTime(z, now);
    } else {
      panner.setPosition(x, y, z);
    }

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.dryGain);
    if (!isLightSfx && this.convolver) {
      panner.connect(this.convolver);
    }

    source.onended = () => {
      this.activeSpatialVoices = Math.max(0, this.activeSpatialVoices - 1);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };

    source.start(now);
  }

  private playBuffer(buffer: AudioBuffer | null, eventName: string = 'SFX'): void {
    if (this.isMuted || !this.ctx || !buffer) return;
    try {
      this.onAudioEvent?.(eventName);
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.sfxGain || this.ctx.destination);
      source.onended = () => {
        try {
          source.disconnect();
        } catch {}
      };
      source.start(0);
    } catch {
      // Audio playback is completely non-blocking
    }
  }

  /**
   * Initializes HTML5 streaming audio background music for exploration & boss encounter.
   */
  public initMusic(enabled?: boolean): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    if (enabled !== undefined) {
      this.musicEnabled = enabled;
      try {
        localStorage.setItem('shipyard_cat_music_enabled', enabled ? 'true' : 'false');
      } catch {}
    } else {
      try {
        const stored = localStorage.getItem('shipyard_cat_music_enabled');
        if (stored !== null) {
          this.musicEnabled = stored === 'true';
        }
      } catch {}
    }

    try {
      const storedVol = localStorage.getItem('shipyard_cat_music_volume');
      if (storedVol !== null) {
        const parsed = parseFloat(storedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1.0) {
          this.musicVolume = parsed;
        }
      }
    } catch {}

    if (!this.bgmExploration) {
      try {
        this.bgmExploration = new Audio('/src/music/Paws_at_the_Pier.mp3');
        this.bgmExploration.loop = true;
        this.bgmExploration.volume = this.musicEnabled ? this.musicVolume : 0;
      } catch {}
    }

    if (!this.bgmBoss) {
      try {
        this.bgmBoss = new Audio('/src/music/Titan_s_Gantry.mp3');
        this.bgmBoss.loop = true;
        this.bgmBoss.volume = 0;
      } catch {}
    }

    if (this.musicEnabled) {
      this.playCurrentMusic();
    }
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    try {
      localStorage.setItem('shipyard_cat_music_enabled', enabled ? 'true' : 'false');
    } catch {}

    if (this.musicEnabled) {
      if (this.musicVolume === 0) {
        this.musicVolume = 0.22;
      }
      this.playCurrentMusic();
    } else {
      this.pauseAllMusic();
    }
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0.0, Math.min(1.0, volume));
    try {
      localStorage.setItem('shipyard_cat_music_volume', this.musicVolume.toString());
    } catch {}
    this.updateBGMVolumes();
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public getVolumePercentage(): number {
    return Math.round(this.musicVolume * 100);
  }

  /**
   * Cycles background music volume level: 25% -> 15% -> 5% -> 0% (OFF) -> 25%
   */
  public cycleVolume(): number {
    const levels = [0.25, 0.15, 0.05, 0.0];
    const currentIndex = levels.findIndex((lvl) => Math.abs(lvl - this.musicVolume) < 0.03);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % levels.length;
    const nextVolume = levels[nextIndex];

    this.musicVolume = nextVolume;
    try {
      localStorage.setItem('shipyard_cat_music_volume', nextVolume.toString());
    } catch {}

    if (nextVolume === 0) {
      this.musicEnabled = false;
      try {
        localStorage.setItem('shipyard_cat_music_enabled', 'false');
      } catch {}
      this.pauseAllMusic();
    } else {
      this.musicEnabled = true;
      try {
        localStorage.setItem('shipyard_cat_music_enabled', 'true');
      } catch {}
      this.updateBGMVolumes();
      this.playCurrentMusic();
    }

    return nextVolume;
  }

  /**
   * Smoothly crossfades between standard yard ambient music ('Paws at the Pier')
   * and Kingpin boss combat music ('Titan's Gantry').
   */
  public updateBGM(isBossActive: boolean): void {
    if (!this.musicEnabled || isBossActive === this.isBossMusicActive) return;
    this.isBossMusicActive = isBossActive;

    if (!this.bgmExploration || !this.bgmBoss) {
      this.initMusic(this.musicEnabled);
    }

    this.playCurrentMusic();

    // Smooth 1.8s crossfade
    if (this.musicFadeInterval) clearInterval(this.musicFadeInterval);
    const steps = 18;
    let step = 0;
    const startExpVol = this.bgmExploration?.volume ?? 0;
    const startBossVol = this.bgmBoss?.volume ?? 0;
    const targetExpVol = isBossActive ? 0 : this.musicVolume;
    const targetBossVol = isBossActive ? this.musicVolume : 0;

    this.musicFadeInterval = setInterval(() => {
      step++;
      const t = Math.min(1.0, step / steps);
      if (this.bgmExploration) {
        this.bgmExploration.volume = Math.max(0, Math.min(1, startExpVol + (targetExpVol - startExpVol) * t));
      }
      if (this.bgmBoss) {
        this.bgmBoss.volume = Math.max(0, Math.min(1, startBossVol + (targetBossVol - startBossVol) * t));
      }
      if (t >= 1.0) {
        clearInterval(this.musicFadeInterval);
        this.musicFadeInterval = null;
        if (isBossActive && this.bgmExploration) {
          this.bgmExploration.pause();
        } else if (!isBossActive && this.bgmBoss) {
          this.bgmBoss.pause();
        }
      }
    }, 100);
  }

  private playCurrentMusic(): void {
    if (!this.musicEnabled) return;
    try {
      if (this.isBossMusicActive) {
        if (this.bgmBoss) {
          this.bgmBoss.volume = this.musicVolume;
          this.bgmBoss.play().catch(() => {});
        }
        if (this.bgmExploration) this.bgmExploration.pause();
      } else {
        if (this.bgmExploration) {
          this.bgmExploration.volume = this.musicVolume;
          this.bgmExploration.play().catch(() => {});
        }
        if (this.bgmBoss) this.bgmBoss.pause();
      }
    } catch {}
  }

  private pauseAllMusic(): void {
    try {
      if (this.bgmExploration) this.bgmExploration.pause();
      if (this.bgmBoss) this.bgmBoss.pause();
    } catch {}
  }

  private updateBGMVolumes(): void {
    if (!this.musicEnabled) {
      if (this.bgmExploration) this.bgmExploration.volume = 0;
      if (this.bgmBoss) this.bgmBoss.volume = 0;
      return;
    }
    if (this.isBossMusicActive) {
      if (this.bgmBoss) this.bgmBoss.volume = this.musicVolume;
      if (this.bgmExploration) this.bgmExploration.volume = 0;
    } else {
      if (this.bgmExploration) this.bgmExploration.volume = this.musicVolume;
      if (this.bgmBoss) this.bgmBoss.volume = 0;
    }
  }

  // Play a procedural Geiger counter click (Zero-allocation, non-blocking)
  public playGeigerClick(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.geigerBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.geigerBuffer);
  }

  // High-Tech Feline Sonar Ping for Whiskers Vision
  public playWhiskersPing(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.whiskersPingBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.whiskersPingBuffer);
  }

  /**
   * Internal Delta-Accumulator Geiger Clock (Zero setInterval / clearInterval churn)
   */
  public updateRadiationLevel(mSv: number, deltaTime?: number): void {
    this.currentRadiation = mSv;

    if (this.currentRadiation <= 0.1 || this.isMuted) {
      this.geigerAccumulator = 0;
      this.lastGeigerTimestamp = 0;
      return;
    }

    let dt = deltaTime;
    if (dt === undefined) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (this.lastGeigerTimestamp === 0) {
        this.lastGeigerTimestamp = now;
        return;
      }
      dt = Math.min(0.1, Math.max(0.001, (now - this.lastGeigerTimestamp) / 1000));
      this.lastGeigerTimestamp = now;
    }

    this.geigerAccumulator += dt;
    if (this.geigerAccumulator >= this.nextGeigerInterval) {
      this.geigerAccumulator = 0;
      const clicksPerSec = Math.min(60, Math.max(1, this.currentRadiation * 8));
      this.nextGeigerInterval = (1.0 / clicksPerSec) * (0.6 + Math.random() * 0.8);
      if (Math.random() < 0.88) {
        this.playGeigerClick();
      }
    }
  }

  // Cat Meow
  public playMeow(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.meowBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.meowBuffer);
  }

  // Feline Purr
  public playPurr(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.purrBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.purrBuffer);
  }

  // Combat: Paw Swipe (Zero-allocation, non-blocking, cached AudioBuffer)
  public playPawSwipe(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.pawSwipeBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.pawSwipeBuffer);
  }

  // Combat: 3-Hit Claw Combo Finisher
  public playClawCombo(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.clawComboBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.clawComboBuffer);
  }

  // Combat: Tail Sweep
  public playTailSweep(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.tailSweepBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.tailSweepBuffer);
  }

  // Feline Hiss (Reuses pre-generated noise buffer)
  public playCatHiss(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.hissBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.hissBuffer);
  }

  // Water Splash (Dry Dock flooding)
  public playWaterSplash(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.waterSplashBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.waterSplashBuffer);
  }

  // Cat Pounce Whoosh (Zero-allocation, non-blocking, cached AudioBuffer)
  public playPounce(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.pounceBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.pounceBuffer);
  }

  // Rat Catch Squeak
  public playRatCatch(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.ratCatchBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.ratCatchBuffer);
  }

  // Industrial Welding Arc Crackle
  public playWeldingBurst(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.weldingBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.weldingBuffer);
  }

  // Meaty Hit-Stop Impact Audio Punch (Light or Heavy)
  public playHitImpact(isHeavy: boolean = false): void {
    if (this.isMuted || !this.ctx) return;
    const targetBuffer = isHeavy ? this.hitImpactHeavyBuffer : this.hitImpactLightBuffer;
    if (!targetBuffer) this.prewarmAudioBuffers();
    this.playBuffer(isHeavy ? this.hitImpactHeavyBuffer : this.hitImpactLightBuffer);
  }

  // Sharp Metallic Claw Slice / Swipe
  public playClawSlice(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.clawSliceBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.clawSliceBuffer);
  }

  // Panicked Rat Scurry & Alarm Squeak
  public playRatPanic(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.ratPanicBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.ratPanicBuffer);
  }

  // Mutant Recoil Snarl & Pain Vocalization
  public playMutantRecoil(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.mutantRecoilBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.mutantRecoilBuffer);
  }

  // Feeding Bowl Snack & Eating Chews
  public playEatSnack(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.eatSnackBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.eatSnackBuffer);
  }

  // Accidental Assistance / Objective Success Jingle
  public playSuccess(): void {
    if (this.isMuted || !this.ctx) return;
    if (!this.successBuffer) this.prewarmAudioBuffers();
    this.playBuffer(this.successBuffer);
  }
}

export const soundEngine = new SoundEngine();

