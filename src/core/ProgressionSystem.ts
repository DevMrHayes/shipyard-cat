export interface FelinePerk {
  id: string;
  name: string;
  category: 'AGILITY' | 'STEALTH' | 'COMBAT' | 'SENSES' | 'SURVIVAL';
  tier: number;
  costSP: number;
  unlocked: boolean;
  icon: string;
  description: string;
  loreQuote: string;
}

export class ProgressionSystem {
  public skillPoints: number = 0;
  public totalXPEarned: number = 0;
  public level: number = 1 as number;
  public rankTitle: string = "Yard Kitten";

  public perks: Map<string, FelinePerk> = new Map();

  // Modifiers applied to gameplay
  public jumpMultiplier: number = 1.0;
  public sprintMultiplier: number = 1.0;
  public sneakDetectionReduction: number = 0.5;
  public attackDamageMultiplier: number = 1.0;
  public maxComboHits: number = 1; // 1-hit basic swipe -> 3-hit Claw Flurry

  // Abilities unlocked
  public hasAlwaysLandOnFeet: boolean = false;
  public hasClawFlurry: boolean = false;
  public hasTailSweep: boolean = false;
  public hasShadowFinisher: boolean = false;

  // Tiered Whiskers Senses (0 = Base, 1 = Trails, 2 = Mutants, 3 = Geiger Sonar)
  public whiskersTier: number = 0;

  constructor() {
    this.registerInitialPerks();
  }

  private registerInitialPerks() {
    // TIER 1 PERKS
    this.addPerk({
      id: 'SPRING_PAWS',
      name: 'Spring-Steel Paws',
      category: 'AGILITY',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '🐾',
      description: 'Increases vertical jump height by +45% and allows leaping onto tall crates & boat decks.',
      loreQuote: '"Watched her leap right onto a four-foot steel plate like gravity didn\'t apply." - Mo Kelly, Welder'
    });

    this.addPerk({
      id: 'CLAW_FLURRY',
      name: 'Claw Flurry (3-Hit Combo)',
      category: 'COMBAT',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '⚔️',
      description: 'Unlocks a rapid 3-hit paw swipe combo (Left-Right-Bite) to quickly subdue aggressive pests and mutant scouts.',
      loreQuote: '"Lightning-fast paws. A rat doesn\'t even see the third swipe coming."'
    });

    this.addPerk({
      id: 'WHISKERS_TRAILS',
      name: 'Scent Trail Tracking',
      category: 'SENSES',
      tier: 1,
      costSP: 1,
      unlocked: false,
      icon: '👣',
      description: 'Upgrades Whiskers Vision to reveal glowing neon scent footprint trails trailing behind rodents.',
      loreQuote: '"Her whiskers twitch, and suddenly she knows exactly where they walked two minutes ago."'
    });

    // TIER 2 PERKS
    this.addPerk({
      id: 'TAIL_SWEEP',
      name: 'Tail Sweep Stun',
      category: 'COMBAT',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '🌀',
      description: 'Perform a 360° tail sweep spin that knocks back and temporarily stuns surrounding rodents & mutant cats.',
      loreQuote: '"A defensive spin learned from wrestling in the tight machine shop crawlspaces."'
    });

    this.addPerk({
      id: 'WHISKERS_MUTANT_SENSE',
      name: 'Radiation Pheromone Sense',
      category: 'SENSES',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '☣️',
      description: 'Whiskers Vision highlights radioactive violet auras on Gantry\'s mutant cats, distinguishing friend from foe.',
      loreQuote: '"She can smell the isotope contamination on the rogue cats from twenty yards away."'
    });

    this.addPerk({
      id: 'ALWAYS_LAND_FEET',
      name: 'Righting Reflex',
      category: 'SURVIVAL',
      tier: 2,
      costSP: 2,
      unlocked: false,
      icon: '🔄',
      description: 'Always land on your feet! Full immunity to fall damage from high gantry crane catwalks.',
      loreQuote: '"Dropped 40 feet off the gantry catwalk, twisted mid-air, and landed on all four paws without a scratch."'
    });

    // TIER 3 PERKS
    this.addPerk({
      id: 'SHADOW_FINISHER',
      name: 'Shadow Finisher',
      category: 'COMBAT',
      tier: 3,
      costSP: 3,
      unlocked: false,
      icon: '⚡',
      description: 'Pouncing from Silent Stalker mode instantly neutralizes prey and deals massive critical damage to bosses.',
      loreQuote: '"One silent strike from the dark. Over before it started."'
    });

    this.addPerk({
      id: 'WHISKERS_GEIGER_SONAR',
      name: 'Geiger Sonar & Structural Vision',
      category: 'SENSES',
      tier: 3,
      costSP: 3,
      unlocked: false,
      icon: '📡',
      description: 'Max tier Whiskers Vision: Detects radioactive hot zones through ship bulkheads and senses high-voltage current.',
      loreQuote: '"She feels the entire electrical pulse of Newport News Shipbuilding through her whiskers."'
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
    if (this.level >= 6) this.rankTitle = "Legend of Dry Dock 12";
    else if (this.level >= 4) this.rankTitle = "Senior Rigger Mouser";
    else if (this.level >= 3) this.rankTitle = "Master Mouser";
    else if (this.level >= 2) this.rankTitle = "Apprentice Shipyard Cat";
    else this.rankTitle = "Yard Kitten";
  }

  public setLevel(targetLevel: number) {
    targetLevel = Math.max(1, Math.min(6, Math.floor(targetLevel)));
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
    }
    if (targetLevel >= 3) {
      this.perks.get('WHISKERS_TRAILS')!.unlocked = true;
      this.perks.get('TAIL_SWEEP')!.unlocked = true;
    }
    if (targetLevel >= 4) {
      this.perks.get('WHISKERS_MUTANT_SENSE')!.unlocked = true;
      this.perks.get('ALWAYS_LAND_FEET')!.unlocked = true;
    }
    if (targetLevel >= 5) {
      this.perks.get('SHADOW_FINISHER')!.unlocked = true;
    }
    if (targetLevel >= 6) {
      this.perks.get('WHISKERS_GEIGER_SONAR')!.unlocked = true;
    }

    this.recalculateModifiers();
  }

  public toggleAllPerks(unlockAll: boolean) {
    this.perks.forEach(p => p.unlocked = unlockAll);
    if (unlockAll) {
      this.level = 6;
      this.totalXPEarned = 1200;
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

  private recalculateModifiers() {
    this.jumpMultiplier = this.isUnlocked('SPRING_PAWS') ? 1.45 : 1.0;
    this.hasAlwaysLandOnFeet = this.isUnlocked('ALWAYS_LAND_FEET');
    
    // Combat perks
    if (this.isUnlocked('CLAW_FLURRY')) {
      this.hasClawFlurry = true;
      this.maxComboHits = 3;
      this.attackDamageMultiplier = 1.6;
    } else {
      this.hasClawFlurry = false;
      this.maxComboHits = 1;
      this.attackDamageMultiplier = 1.0;
    }

    this.hasTailSweep = this.isUnlocked('TAIL_SWEEP');
    this.hasShadowFinisher = this.isUnlocked('SHADOW_FINISHER');

    // Senses Tier Progression
    if (this.isUnlocked('WHISKERS_GEIGER_SONAR')) this.whiskersTier = 3;
    else if (this.isUnlocked('WHISKERS_MUTANT_SENSE')) this.whiskersTier = 2;
    else if (this.isUnlocked('WHISKERS_TRAILS')) this.whiskersTier = 1;
    else this.whiskersTier = 0;
  }
}
