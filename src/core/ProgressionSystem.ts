export type PerkBranch = 'PARKOUR_AGILITY' | 'PREDATOR_COMBAT' | 'FELINE_SENSES' | 'RADIATION_RESILIENCE';
export type PerkCategory = PerkBranch | 'AGILITY' | 'STEALTH' | 'COMBAT' | 'SENSES' | 'SURVIVAL';

export interface FelinePerk {
  id: string;
  name: string;
  category: PerkCategory;
  branch: PerkBranch;
  tier: number;
  costSP: number;
  unlocked: boolean;
  icon: string;
  description: string;
  loreQuote: string;
  statModifiers?: Record<string, number | boolean>;
}

export class ProgressionSystem {
  public skillPoints: number = 0;
  public totalXPEarned: number = 0;
  public level: number = 1;
  public rankTitle: string = "Yard Kitten";

  public perks: Map<string, FelinePerk> = new Map();

  // Modifiers applied to gameplay
  public jumpMultiplier: number = 1.0;
  public sprintMultiplier: number = 1.0;
  public sneakDetectionReduction: number = 0.5;
  public attackDamageMultiplier: number = 1.0;
  public maxComboHits: number = 1; // 1-hit basic swipe -> 3-hit Claw Flurry -> 4-hit Feline Frenzy

  // Agility & Parkour Perks
  public hasAlwaysLandOnFeet: boolean = false;
  public hasBeamWalker: boolean = false;
  public isCatwalkSprintInfinite: boolean = false;
  public beamBalanceSpeedMultiplier: number = 1.0;

  // Combat Perks
  public hasClawFlurry: boolean = false;
  public hasTailSweep: boolean = false;
  public hasShadowFinisher: boolean = false;
  public hasFelineFrenzy: boolean = false;

  // Tiered Whiskers Senses (0 = Base, 1 = Trails, 2 = Mutants, 3 = Geiger Sonar, 4 = Sixth Sense)
  public whiskersTier: number = 0;
  public hasSixthSenseDodge: boolean = false;

  // Radiation Resilience Perks
  public radResistanceMultiplier: number = 1.0; // 1.0 = normal, 0.65 = 35% dose reduction
  public radDamageReduction: number = 0.0;
  public hasIodineMetabolism: boolean = false;
  public hasDosimeterOvercharge: boolean = false;
  public hasGammaBioResilience: boolean = false;

  // Collectibles Tracking Subsystem
  public collectedRivets: Set<string> = new Set();
  public collectedBadges: Set<string> = new Set();
  public collectedLoreLogs: Set<string> = new Set();

  constructor() {
    this.registerInitialPerks();
  }

  private registerInitialPerks() {
    // ==========================================
    // BRANCH 1: PARKOUR & AGILITY
    // ==========================================
    this.addPerk({
      id: 'SPRING_PAWS',
      name: 'Spring-Steel Paws',
      category: 'PARKOUR_AGILITY',
      branch: 'PARKOUR_AGILITY',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '🐾',
      description: 'Increases vertical jump height by +45% and allows leaping onto tall crates & boat decks.',
      loreQuote: '"Watched her leap right onto a four-foot steel plate like gravity didn\'t apply." - Mo Kelly, Welder',
      statModifiers: { jumpMultiplier: 1.45 }
    });

    this.addPerk({
      id: 'BEAM_WALKER',
      name: 'Beam Walker & Balancer',
      category: 'PARKOUR_AGILITY',
      branch: 'PARKOUR_AGILITY',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '🏗️',
      description: 'Eliminates movement wobble on narrow I-beams and increases walking speed across crane catwalks by +25%.',
      loreQuote: '"Riggers spend years getting their sea legs on crane catwalks. She was born with them."',
      statModifiers: { beamSpeed: 1.25 }
    });

    this.addPerk({
      id: 'ALWAYS_LAND_FEET',
      name: 'Righting Reflex',
      category: 'PARKOUR_AGILITY',
      branch: 'PARKOUR_AGILITY',
      tier: 3,
      costSP: 2,
      unlocked: false,
      icon: '🔄',
      description: 'Always land on your feet! Full immunity to fall damage from high gantry crane catwalks and staging decks.',
      loreQuote: '"Dropped 40 feet off the gantry catwalk, twisted mid-air, and landed on all four paws without a scratch."',
      statModifiers: { fallImmunity: true }
    });

    this.addPerk({
      id: 'APEX_CATWALK_SPRINTER',
      name: 'Apex Catwalk Sprinter',
      category: 'PARKOUR_AGILITY',
      branch: 'PARKOUR_AGILITY',
      tier: 4,
      costSP: 3,
      unlocked: false,
      icon: '⚡',
      description: 'Sprint indefinitely while aloft on elevated structures and crane girders with zero stamina depletion.',
      loreQuote: '"She flies across the top girder of Big Blue faster than the wind off Hampton Roads."',
      statModifiers: { infiniteCatwalkSprint: true }
    });

    // ==========================================
    // BRANCH 2: PREDATOR & COMBAT
    // ==========================================
    this.addPerk({
      id: 'CLAW_FLURRY',
      name: 'Claw Flurry (3-Hit Combo)',
      category: 'PREDATOR_COMBAT',
      branch: 'PREDATOR_COMBAT',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '⚔️',
      description: 'Unlocks a rapid 3-hit paw swipe combo (Left-Right-Bite) dealing +60% attack damage to subdue vermin and scouts.',
      loreQuote: '"Lightning-fast paws. A rat doesn\'t even see the third swipe coming."',
      statModifiers: { comboHits: 3, attackDamage: 1.6 }
    });

    this.addPerk({
      id: 'TAIL_SWEEP',
      name: 'Tail Sweep Stun',
      category: 'PREDATOR_COMBAT',
      branch: 'PREDATOR_COMBAT',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '🌀',
      description: 'Perform a 360° tail sweep spin that knocks back surrounding foes 2.5m and temporarily stuns them for 2.0s.',
      loreQuote: '"A defensive spin learned from wrestling in the tight machine shop crawlspaces."',
      statModifiers: { tailSweepUnlocked: true }
    });

    this.addPerk({
      id: 'SHADOW_FINISHER',
      name: 'Shadow Finisher',
      category: 'PREDATOR_COMBAT',
      branch: 'PREDATOR_COMBAT',
      tier: 3,
      costSP: 3,
      unlocked: false,
      icon: '🗡️',
      description: 'Pouncing from Silent Stalker mode instantly neutralizes prey and deals 4x critical assassination damage to bosses.',
      loreQuote: '"One silent strike from the dark. Over before it started."',
      statModifiers: { stealthDamageMultiplier: 4.0 }
    });

    this.addPerk({
      id: 'FELINE_FRENZY',
      name: 'Feline Frenzy Overcharge',
      category: 'PREDATOR_COMBAT',
      branch: 'PREDATOR_COMBAT',
      tier: 4,
      costSP: 4,
      unlocked: false,
      icon: '🔥',
      description: 'Unlocks a 4-hit devastating claw frenzy that penetrates armored rodent plates and mutant energy auras.',
      loreQuote: '"When cornered, Alba becomes a whirlwind of razor-sharp claws."',
      statModifiers: { comboHits: 4, attackDamage: 2.4 }
    });

    // ==========================================
    // BRANCH 3: FELINE SENSES (WHISKERS VISION)
    // ==========================================
    this.addPerk({
      id: 'WHISKERS_TRAILS',
      name: 'Scent Trail Tracking',
      category: 'FELINE_SENSES',
      branch: 'FELINE_SENSES',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '👣',
      description: 'Upgrades Whiskers Vision to reveal glowing neon scent footprint trails trailing behind rodents and patrols.',
      loreQuote: '"Her whiskers twitch, and suddenly she knows exactly where they walked two minutes ago."',
      statModifiers: { scentTrails: true }
    });

    this.addPerk({
      id: 'WHISKERS_MUTANT_SENSE',
      name: 'Radiation Pheromone Sense',
      category: 'FELINE_SENSES',
      branch: 'FELINE_SENSES',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '☣️',
      description: 'Whiskers Vision highlights radioactive violet auras on Gantry\'s mutant cats through darkness and smoke.',
      loreQuote: '"She can smell the isotope contamination on the rogue cats from twenty yards away."',
      statModifiers: { mutantAuras: true }
    });

    this.addPerk({
      id: 'WHISKERS_GEIGER_SONAR',
      name: 'Geiger Sonar & Structural Vision',
      category: 'FELINE_SENSES',
      branch: 'FELINE_SENSES',
      tier: 3,
      costSP: 3,
      unlocked: false,
      icon: '📡',
      description: 'Max tier Whiskers Vision: Detects radioactive hot zones through ship bulkheads and senses high-voltage rails.',
      loreQuote: '"She feels the entire electrical pulse of Newport News Shipbuilding through her whiskers."',
      statModifiers: { geigerSonar: true }
    });

    this.addPerk({
      id: 'PREDATOR_SIXTH_SENSE',
      name: 'Predator Sixth Sense',
      category: 'FELINE_SENSES',
      branch: 'FELINE_SENSES',
      tier: 4,
      costSP: 4,
      unlocked: false,
      icon: '👁️',
      description: 'Reflexive bullet-time matrix dodge: slows local perceived time by 50% for 1.5s when attacked from blind spots.',
      loreQuote: '"It\'s as if she sees the strike before the enemy even decides to make it."',
      statModifiers: { sixthSenseDodge: true }
    });

    // ==========================================
    // BRANCH 4: RADIATION RESILIENCE
    // ==========================================
    this.addPerk({
      id: 'LEAD_LINED_FUR',
      name: 'Lead-Lined Fur',
      category: 'RADIATION_RESILIENCE',
      branch: 'RADIATION_RESILIENCE',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '🛡️',
      description: 'Dense double-coat traps radioactive slag dust, reducing environmental dosimeter accumulation rate by 35%.',
      loreQuote: '"Dr. Vance noticed Alba\'s dense undercoat traps micro-dust before it reaches her skin."',
      statModifiers: { radDoseReduction: 0.35 }
    });

    this.addPerk({
      id: 'THYROID_IODINE_METABOLISM',
      name: 'Iodine Metabolism',
      category: 'RADIATION_RESILIENCE',
      branch: 'RADIATION_RESILIENCE',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '💧',
      description: 'Restores health +50% faster near sanctuary water troughs and doubles the speed of radiological flushing.',
      loreQuote: '"Clean water and high-potassium clinic tuna keep her thyroid completely resilient."',
      statModifiers: { sanctuaryHealingBonus: 1.5 }
    });

    this.addPerk({
      id: 'DOSIMETER_OVERCHARGE',
      name: 'Dosimeter Overcharge Resonance',
      category: 'RADIATION_RESILIENCE',
      branch: 'RADIATION_RESILIENCE',
      tier: 3,
      costSP: 3,
      unlocked: false,
      icon: '🔋',
      description: 'High radiation exposure (>3.0 mSv/hr) converts into +30% sprint speed and +20% claw attack power.',
      loreQuote: '"Her dosimeter glow isn\'t a warning—it\'s an engine supercharger."',
      statModifiers: { radOvercharge: true }
    });

    this.addPerk({
      id: 'GAMMA_BIO_RESILIENCE',
      name: 'Apex Gamma Bio-Resilience',
      category: 'RADIATION_RESILIENCE',
      branch: 'RADIATION_RESILIENCE',
      tier: 4,
      costSP: 4,
      unlocked: false,
      icon: '🌟',
      description: 'Complete immunity to radiation hazard damage up to 15.0 mSv/hr with glowing bioluminescent whisker tips.',
      loreQuote: '"The living legend of Dry Dock 12. Ionizing particles simply roll off her whiskers."',
      statModifiers: { radImmunityThreshold: 15.0 }
    });
  }

  public addPerk(perk: FelinePerk) {
    this.perks.set(perk.id, perk);
  }

  public addXP(amount: number): boolean {
    this.totalXPEarned += amount;
    const newLevel = Math.floor(this.totalXPEarned / 200) + 1;
    if (newLevel > this.level) {
      const levelsGained = newLevel - this.level;
      this.level = newLevel;
      this.skillPoints += levelsGained;
      this.updateRankTitle();
      return true;
    }
    return false;
  }

  private updateRankTitle() {
    if (this.level >= 8) this.rankTitle = "Grand Master Mouser of Newport News";
    else if (this.level >= 7) this.rankTitle = "Apex Yard Guardian";
    else if (this.level >= 6) this.rankTitle = "Legend of Dry Dock 12";
    else if (this.level >= 5) this.rankTitle = "Lead Containment Specialist";
    else if (this.level >= 4) this.rankTitle = "Senior Rigger Mouser";
    else if (this.level >= 3) this.rankTitle = "Master Mouser";
    else if (this.level >= 2) this.rankTitle = "Apprentice Shipyard Cat";
    else this.rankTitle = "Yard Kitten";
  }

  public setLevel(targetLevel: number) {
    targetLevel = Math.max(1, Math.min(8, Math.floor(targetLevel)));
    this.level = targetLevel;
    this.totalXPEarned = (targetLevel - 1) * 200;
    this.updateRankTitle();

    // Reset and grant SP
    this.skillPoints = targetLevel - 1;
    this.perks.forEach(p => p.unlocked = false);

    // Auto-unlock perks corresponding to progression tier
    if (targetLevel >= 2) {
      this.perks.get('SPRING_PAWS')!.unlocked = true;
      this.perks.get('CLAW_FLURRY')!.unlocked = true;
      this.perks.get('LEAD_LINED_FUR')!.unlocked = true;
    }
    if (targetLevel >= 3) {
      this.perks.get('WHISKERS_TRAILS')!.unlocked = true;
      this.perks.get('TAIL_SWEEP')!.unlocked = true;
      this.perks.get('BEAM_WALKER')!.unlocked = true;
    }
    if (targetLevel >= 4) {
      this.perks.get('WHISKERS_MUTANT_SENSE')!.unlocked = true;
      this.perks.get('ALWAYS_LAND_FEET')!.unlocked = true;
      this.perks.get('THYROID_IODINE_METABOLISM')!.unlocked = true;
    }
    if (targetLevel >= 5) {
      this.perks.get('SHADOW_FINISHER')!.unlocked = true;
      this.perks.get('DOSIMETER_OVERCHARGE')!.unlocked = true;
    }
    if (targetLevel >= 6) {
      this.perks.get('WHISKERS_GEIGER_SONAR')!.unlocked = true;
      this.perks.get('APEX_CATWALK_SPRINTER')!.unlocked = true;
    }
    if (targetLevel >= 7) {
      this.perks.get('FELINE_FRENZY')!.unlocked = true;
      this.perks.get('PREDATOR_SIXTH_SENSE')!.unlocked = true;
    }
    if (targetLevel >= 8) {
      this.perks.get('GAMMA_BIO_RESILIENCE')!.unlocked = true;
    }

    this.recalculateModifiers();
  }

  public toggleAllPerks(unlockAll: boolean) {
    this.perks.forEach(p => p.unlocked = unlockAll);
    if (unlockAll) {
      this.level = 8;
      this.totalXPEarned = 1400;
      this.updateRankTitle();
    }
    this.recalculateModifiers();
  }

  public unlockPerk(perkId: string): boolean {
    const perk = this.perks.get(perkId);
    if (!perk || perk.unlocked || this.skillPoints < perk.costSP) {
      return false;
    }

    this.skillPoints -= perk.costSP;
    perk.unlocked = true;
    this.recalculateModifiers();
    return true;
  }

  public isUnlocked(perkId: string): boolean {
    return this.perks.get(perkId)?.unlocked ?? false;
  }

  public getPerks(): FelinePerk[] {
    return Array.from(this.perks.values());
  }

  public getPerksByBranch(branch: PerkBranch): FelinePerk[] {
    return Array.from(this.perks.values()).filter(p => p.branch === branch);
  }

  public getBranchProgress(branch: PerkBranch): { unlocked: number; total: number } {
    const branchPerks = this.getPerksByBranch(branch);
    const unlocked = branchPerks.filter(p => p.unlocked).length;
    return { unlocked, total: branchPerks.length };
  }

  // Collectibles Management
  public collectRivet(id: string): boolean {
    if (!this.collectedRivets.has(id)) {
      this.collectedRivets.add(id);
      this.addXP(25);
      return true;
    }
    return false;
  }

  public collectBadge(id: string): boolean {
    if (!this.collectedBadges.has(id)) {
      this.collectedBadges.add(id);
      this.addXP(50);
      return true;
    }
    return false;
  }

  public collectLoreLog(id: string): boolean {
    if (!this.collectedLoreLogs.has(id)) {
      this.collectedLoreLogs.add(id);
      this.addXP(35);
      return true;
    }
    return false;
  }

  public getCollectiblesSummary(): { rivets: number; badges: number; loreLogs: number; total: number } {
    return {
      rivets: this.collectedRivets.size,
      badges: this.collectedBadges.size,
      loreLogs: this.collectedLoreLogs.size,
      total: this.collectedRivets.size + this.collectedBadges.size + this.collectedLoreLogs.size
    };
  }

  private recalculateModifiers() {
    // 1. Agility & Parkour Modifiers
    this.jumpMultiplier = this.isUnlocked('SPRING_PAWS') ? 1.45 : 1.0;
    this.hasAlwaysLandOnFeet = this.isUnlocked('ALWAYS_LAND_FEET');
    this.hasBeamWalker = this.isUnlocked('BEAM_WALKER');
    this.beamBalanceSpeedMultiplier = this.hasBeamWalker ? 1.25 : 1.0;
    this.isCatwalkSprintInfinite = this.isUnlocked('APEX_CATWALK_SPRINTER');

    // 2. Combat Modifiers
    if (this.isUnlocked('FELINE_FRENZY')) {
      this.hasFelineFrenzy = true;
      this.hasClawFlurry = true;
      this.maxComboHits = 4;
      this.attackDamageMultiplier = 2.4;
    } else if (this.isUnlocked('CLAW_FLURRY')) {
      this.hasFelineFrenzy = false;
      this.hasClawFlurry = true;
      this.maxComboHits = 3;
      this.attackDamageMultiplier = 1.6;
    } else {
      this.hasFelineFrenzy = false;
      this.hasClawFlurry = false;
      this.maxComboHits = 1;
      this.attackDamageMultiplier = 1.0;
    }

    this.hasTailSweep = this.isUnlocked('TAIL_SWEEP');
    this.hasShadowFinisher = this.isUnlocked('SHADOW_FINISHER');

    // 3. Senses Tier Progression
    this.hasSixthSenseDodge = this.isUnlocked('PREDATOR_SIXTH_SENSE');
    if (this.isUnlocked('PREDATOR_SIXTH_SENSE')) this.whiskersTier = 4;
    else if (this.isUnlocked('WHISKERS_GEIGER_SONAR')) this.whiskersTier = 3;
    else if (this.isUnlocked('WHISKERS_MUTANT_SENSE')) this.whiskersTier = 2;
    else if (this.isUnlocked('WHISKERS_TRAILS')) this.whiskersTier = 1;
    else this.whiskersTier = 0;

    // 4. Radiation Resilience Modifiers
    if (this.isUnlocked('LEAD_LINED_FUR')) {
      this.radResistanceMultiplier = 0.65;
      this.radDamageReduction = 0.35;
    } else {
      this.radResistanceMultiplier = 1.0;
      this.radDamageReduction = 0.0;
    }

    this.hasIodineMetabolism = this.isUnlocked('THYROID_IODINE_METABOLISM');
    this.hasDosimeterOvercharge = this.isUnlocked('DOSIMETER_OVERCHARGE');
    this.hasGammaBioResilience = this.isUnlocked('GAMMA_BIO_RESILIENCE');
  }
}
