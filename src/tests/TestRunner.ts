import * as THREE from 'three';
import { CatVitals } from '../core/VitalsSystem';
import { RadiationSystem } from '../core/RadiationSystem';
import { AssistanceEngine } from '../core/AssistanceEngine';
import { MissionManager } from '../core/MissionManager';
import { ProgressionSystem } from '../core/ProgressionSystem';
import { ColonyCatEntity } from '../game/ColonyCatEntity';
import { MutantCatEntity } from '../game/MutantCatEntity';
import { ShipbuilderEntity } from '../game/ShipbuilderEntity';
import { ShipyardEnvironment } from '../game/ShipyardEnvironment';
import { RatEntity } from '../game/RatEntity';
import { CatCharacter } from '../game/CatCharacter';

export interface TestResult {
  name: string;
  category: 'UNIT' | 'INTEGRATION';
  passed: boolean;
  durationMs: number;
  error?: string;
}

export class TestRunner {
  public static runAllTests(): TestResult[] {
    const results: TestResult[] = [];

    const tests = [
      // UNIT TESTS
      { name: 'Unit: Radiation Dose Inverse-Square Falloff Math', cat: 'UNIT' as const, fn: TestRunner.testRadiationDoseFalloff },
      { name: 'Unit: CatVitals Stamina Sprint Consumption & Zero-Clamp', cat: 'UNIT' as const, fn: TestRunner.testVitalsStaminaDrain },
      { name: 'Unit: CatVitals Hunger Decay & Feeding Max Cap', cat: 'UNIT' as const, fn: TestRunner.testVitalsHungerAndFeeding },
      { name: 'Unit: AssistanceEngine Event Registration & Notification Dispatch', cat: 'UNIT' as const, fn: TestRunner.testAssistanceEngineDispatch },
      { name: 'Unit: MissionManager Objective Progression & Unlocking', cat: 'UNIT' as const, fn: TestRunner.testMissionManagerProgression },
      { name: 'Unit: ProgressionSystem XP Level-Ups & Perk Stat Modifiers', cat: 'UNIT' as const, fn: TestRunner.testProgressionSystem },
      { name: 'Unit: Combat Claw Flurry & Tiered Whiskers Senses', cat: 'UNIT' as const, fn: TestRunner.testCombatAndWhiskersProgression },
      { name: 'Unit: Level Testing Sandbox Dynamic Overrides (Level 1 vs Level 6)', cat: 'UNIT' as const, fn: TestRunner.testSandboxLevelOverrides },
      { name: 'Unit: Alba Cat Character Mesh Render Graph & Active Visibility', cat: 'UNIT' as const, fn: TestRunner.testAlbaVisibilityAndRenderGraph },

      // INTEGRATION TESTS
      { name: 'Integration: Rat Stealth Stalking, Pounce Catch & Accidental Assistance', cat: 'INTEGRATION' as const, fn: TestRunner.testRatHuntingAndAssistanceIntegration },
      { name: 'Integration: RCOH Nuclear Radiation Hotspot Proximity Loop', cat: 'INTEGRATION' as const, fn: TestRunner.testRadiationProximityIntegration },
      { name: 'Integration: Full Mission 1 Completion Unlocks Mission 2', cat: 'INTEGRATION' as const, fn: TestRunner.testFullMission1Lifecycle },
      { name: 'Integration: Mutant Insurgent Combat & Colony NPC Sanctuary Care', cat: 'INTEGRATION' as const, fn: TestRunner.testMutantCombatAndColonyIntegration },
      { name: 'Integration: Active Shipbuilder Tradesmen & Solid Wall Collision Resolver', cat: 'INTEGRATION' as const, fn: TestRunner.testShipbuildersAndCollisionIntegration },
      { name: 'Integration: 3D Asset Loading Fallbacks & Feline Entity Scene Integrity', cat: 'INTEGRATION' as const, fn: TestRunner.testAssetLoadingAndSceneIntegrity }
    ];

    for (const t of tests) {
      const start = performance.now();
      try {
        t.fn();
        const duration = Math.round((performance.now() - start) * 100) / 100;
        results.push({ name: t.name, category: t.cat, passed: true, durationMs: duration });
      } catch (err: unknown) {
        const duration = Math.round((performance.now() - start) * 100) / 100;
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name: t.name, category: t.cat, passed: false, durationMs: duration, error: msg });
      }
    }

    return results;
  }

  // --- UNIT TESTS ---
  private static testRadiationDoseFalloff() {
    const radSystem = new RadiationSystem();
    
    // Epicenter of RCOH vault at (45, 0, -60)
    const epicenter = new THREE.Vector3(45, 0, -60);
    const doseAtEpicenter = radSystem.calculateRadiationAtPoint(epicenter);
    if (doseAtEpicenter.totalDose < 10.0) {
      throw new Error(`Expected high dose at epicenter, got ${doseAtEpicenter.totalDose} mSv`);
    }

    // Far away outside decay radius (150, 0, 150)
    const farPoint = new THREE.Vector3(150, 0, 150);
    const doseFar = radSystem.calculateRadiationAtPoint(farPoint);
    if (doseFar.totalDose > 0.1) {
      throw new Error(`Expected background radiation outside radius, got ${doseFar.totalDose} mSv`);
    }
  }

  private static testVitalsStaminaDrain() {
    const vitals = new CatVitals(100, 100);
    vitals.update(2.0, true, true); // Sprint for 2s at 18 drain/s = 36 drain
    if (Math.abs(vitals.currentStamina - 64) > 0.1) {
      throw new Error(`Expected 64 stamina, got ${vitals.currentStamina}`);
    }

    vitals.update(10.0, true, true); // Drain remaining
    if (vitals.currentStamina < 0) {
      throw new Error(`Stamina dropped below 0: ${vitals.currentStamina}`);
    }
  }

  private static testVitalsHungerAndFeeding() {
    const vitals = new CatVitals(100, 100);
    vitals.update(50.0, false, false); // Decay 50s * 0.08 = 4 decay -> 96 left
    if (Math.abs(vitals.currentHunger - 96) > 0.5) {
      throw new Error(`Expected ~96 hunger, got ${vitals.currentHunger}`);
    }

    vitals.setHunger(60);
    vitals.feed(25);
    if (Math.abs(vitals.currentHunger - 85) > 0.5) {
      throw new Error(`Expected ~85 hunger after feeding, got ${vitals.currentHunger}`);
    }

    vitals.feed(50); // Overflows 100
    if (vitals.currentHunger > 100) {
      throw new Error(`Hunger exceeded max 100: ${vitals.currentHunger}`);
    }
  }

  private static testAssistanceEngineDispatch() {
    const engine = new AssistanceEngine();
    let callbackFired = false;
    let receivedId = '';

    engine.onAssist((evt) => {
      callbackFired = true;
      receivedId = evt.id;
    });

    const triggered = engine.triggerAssist('DOROTHY_CAPSTAN_UNJAM');
    if (!triggered) throw new Error('Assistance trigger returned false');
    if (!callbackFired) throw new Error('Assistance listener callback was not called');
    if (receivedId !== 'DOROTHY_CAPSTAN_UNJAM') throw new Error(`Wrong event ID received: ${receivedId}`);
    if (!engine.isCompleted('DOROTHY_CAPSTAN_UNJAM')) throw new Error('Event was not marked completed in engine');
  }

  private static testMissionManagerProgression() {
    const mm = new MissionManager();
    const m1 = mm.getCurrentMission();
    if (m1.id !== 1) throw new Error(`Expected Mission 1, got ${m1.id}`);

    mm.completeObjective('climb_dorothy');
    const obj = m1.objectives.find(o => o.id === 'climb_dorothy');
    if (!obj?.isCompleted) throw new Error('Objective was not marked completed');
  }

  private static testProgressionSystem() {
    const prog = new ProgressionSystem();
    if ((prog.level as number) !== 1 || prog.rankTitle !== 'Yard Kitten') {
      throw new Error(`Expected Level 1 Yard Kitten, got Level ${prog.level} ${prog.rankTitle}`);
    }

    // Award 450 XP -> reaches Level 3 (200 XP/level), unlocks 2 Skill Points
    const leveledUp = prog.addXP(450);
    if (!leveledUp || (prog.level as number) !== 3) {
      throw new Error(`Expected Level 3 after 450 XP, got Level ${prog.level}`);
    }
    if ((prog.skillPoints as number) !== 2) {
      throw new Error(`Expected 2 Skill Points, got ${prog.skillPoints}`);
    }

    // Unlock 'Spring-Steel Paws' (Cost: 1 SP)
    const unlockSuccess = prog.unlockPerk('SPRING_PAWS');
    if (!unlockSuccess || !prog.isUnlocked('SPRING_PAWS')) {
      throw new Error('Failed to unlock SPRING_PAWS perk');
    }
    if (prog.jumpMultiplier < 1.4) {
      throw new Error(`Jump multiplier did not increase: ${prog.jumpMultiplier}`);
    }
    if ((prog.skillPoints as number) !== 1) {
      throw new Error(`SP did not decrement to 1: ${prog.skillPoints}`);
    }
  }

  private static testCombatAndWhiskersProgression() {
    const prog = new ProgressionSystem();
    prog.addXP(800); // 4 Skill Points earned

    // Unlock Claw Flurry
    prog.unlockPerk('CLAW_FLURRY');
    if (!prog.hasClawFlurry || prog.maxComboHits !== 3 || prog.attackDamageMultiplier < 1.5) {
      throw new Error('Claw Flurry perk did not set 3-hit combo and attack damage multiplier');
    }

    // Unlock Whiskers Trail Sense (Tier 1)
    prog.unlockPerk('WHISKERS_TRAILS');
    if (prog.whiskersTier < 1) {
      throw new Error(`Expected Whiskers Tier 1, got ${prog.whiskersTier}`);
    }

    // Unlock Whiskers Mutant Sense (Tier 2)
    prog.unlockPerk('WHISKERS_MUTANT_SENSE');
    if (prog.whiskersTier < 2) {
      throw new Error(`Expected Whiskers Tier 2, got ${prog.whiskersTier}`);
    }
  }

  private static testSandboxLevelOverrides() {
    const prog = new ProgressionSystem();

    // Set Level 1
    prog.setLevel(1);
    if ((prog.level as number) !== 1 || prog.rankTitle !== 'Yard Kitten' || prog.jumpMultiplier !== 1.0 || prog.maxComboHits !== 1) {
      throw new Error('Level 1 sandbox override failed default constraints');
    }

    // Override to Level 4 (Senior Rigger Mouser)
    prog.setLevel(4);
    if ((prog.level as number) !== 4 || prog.jumpMultiplier <= 1.2 || (prog.maxComboHits as number) !== 3 || prog.whiskersTier < 2) {
      throw new Error(`Level 4 sandbox override did not unlock expected stats (jump: ${prog.jumpMultiplier}, combo: ${prog.maxComboHits}, whiskers: ${prog.whiskersTier})`);
    }

    // Toggle All Perks (Max Sandbox)
    prog.toggleAllPerks(true);
    if ((prog.level as number) !== 6 || (prog.whiskersTier as number) !== 3 || !prog.hasAlwaysLandOnFeet) {
      throw new Error('Max Sandbox toggle did not grant full Tier 3 perks');
    }
  }

  private static testAlbaVisibilityAndRenderGraph() {
    const cat = new CatCharacter();
    if (!cat.mesh) {
      throw new Error('Alba root mesh is undefined');
    }
    if (!cat.mesh.visible) {
      throw new Error('Alba root mesh is set to visible = false');
    }

    // Count visible child meshes in render hierarchy
    let visibleMeshCount = 0;
    cat.mesh.traverse((obj) => {
      if (obj.visible && (obj as THREE.Mesh).isMesh) {
        visibleMeshCount++;
      }
    });

    if (visibleMeshCount === 0) {
      throw new Error('Alba has 0 visible renderable meshes attached to scene graph');
    }

    // Verify Alba bounding box volume is non-zero
    const bbox = new THREE.Box3().setFromObject(cat.mesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      throw new Error(`Alba bounding box has invalid degenerate dimensions: (${size.x}, ${size.y}, ${size.z})`);
    }
  }

  // --- INTEGRATION TESTS ---
  private static testRatHuntingAndAssistanceIntegration() {
    const vitals = new CatVitals(100, 100, 50); // Cat has max 100, initial 50 hunger
    const assistEngine = new AssistanceEngine();
    const kingpin = new RatEntity(new THREE.Vector3(0, 0, 0), true);

    // 1. Cat pounces
    vitals.consumePounceStamina(25);
    if (vitals.currentStamina !== 75) throw new Error('Pounce stamina not consumed');

    // 2. Kingpin is caught & consumed
    kingpin.state = 'CAUGHT';
    vitals.feed(kingpin.nutritionValue); // +65 hunger -> 50 + 65 clamped to 100
    if (vitals.currentHunger !== 100) throw new Error(`Feeding did not restore hunger to max cap (got ${vitals.currentHunger})`);
    if (vitals.ratsCaught !== 1) throw new Error('Rats caught counter not incremented');

    // 3. Dorothy capstan unjam assist triggered
    const assistSuccess = assistEngine.triggerAssist('DOROTHY_CAPSTAN_UNJAM');
    if (!assistSuccess) throw new Error('Failed to trigger Dorothy capstan assistance');
    if (!assistEngine.isCompleted('DOROTHY_CAPSTAN_UNJAM')) throw new Error('Dorothy assist not marked complete');
  }

  private static testRadiationProximityIntegration() {
    const radSystem = new RadiationSystem();
    const vitals = new CatVitals(100, 100);

    // Cat steps directly into RCOH Vault hotspot
    const insideVault = new THREE.Vector3(45, 0, -60);
    const radData = radSystem.calculateRadiationAtPoint(insideVault);

    if (radData.totalDose <= 5.0) {
      throw new Error(`Expected intense radiation inside vault, got ${radData.totalDose}`);
    }

    // High radiation deals hazard damage
    vitals.takeHazardDamage(radData.totalDose * 0.5);
    if (vitals.currentHealth >= 100) {
      throw new Error('Cat did not take hazard damage in high radiation zone');
    }
  }

  private static testFullMission1Lifecycle() {
    const mm = new MissionManager();
    const assistEngine = new AssistanceEngine();

    // Complete all objectives for Mission 1
    mm.updateCountObjective('hunt_mice', 2);
    mm.completeObjective('climb_dorothy');
    mm.completeObjective('hunt_kingpin');

    if (!mm.getCurrentMission().isCompleted) {
      throw new Error('Mission 1 did not auto-complete after finishing all objectives');
    }

    // Verify Mission 2 is now unlocked
    const missions = mm.getMissions();
    if (!missions[1].isUnlocked) {
      throw new Error('Mission 2 was not unlocked upon completing Mission 1');
    }

    // Trigger Mission 1 assistance reward
    assistEngine.triggerAssist('DOROTHY_CAPSTAN_UNJAM');
    if (!assistEngine.isCompleted('DOROTHY_CAPSTAN_UNJAM')) {
      throw new Error('Mission 1 assist reward not complete');
    }
  }

  private static testMutantCombatAndColonyIntegration() {
    const mutant = new MutantCatEntity('Mutant Scout Fang', new THREE.Vector3(0, 0, 0));
    const vitals = new CatVitals(100, 100, 30); // 30 health remaining
    
    // 1. Alba deals damage with claw attacks
    const defeated = mutant.takeDamage(65);
    if (!defeated || !mutant.isDefeated || mutant.state !== 'DEFEATED') {
      throw new Error('Mutant cat was not defeated after fatal damage');
    }

    // 2. Colony NPC (Dr. Elena Vance) interacts and heals Alba
    const elenaDialogue = [
      { speaker: 'Dr. Elena Vance', role: 'EH&S', text: 'Careful Alba!', actionReward: { type: 'HEAL' as const, amount: 100 } }
    ];
    const elena = new ColonyCatEntity('Dr. Elena Vance', 'EH&S', new THREE.Vector3(0, 0, 0), 0xffffff, elenaDialogue, true);
    const d = elena.getNextDialogue();
    if (d.actionReward?.type === 'HEAL') {
      vitals.feed(40);
    }
    if (vitals.currentHunger <= 30) {
      throw new Error('Colony sanctuary feeding did not restore vitals');
    }
  }

  private static testShipbuildersAndCollisionIntegration() {
    const env = new ShipyardEnvironment();
    
    // 1. Test solid collision on Machine Shop North Wall (bounds -34.5 to -33.5 in X, -38 to -22 in Z)
    const outsidePos = new THREE.Vector3(-32.0, 0, -30.0);
    const movingInsideWallPos = new THREE.Vector3(-34.0, 0, -30.0);
    const resolvedPos = env.resolveCollision(movingInsideWallPos, 0.35, outsidePos);
    
    if (resolvedPos.x <= -33.5 && resolvedPos.x >= -34.5) {
      throw new Error(`Collision resolver failed: entity penetrated solid Machine Shop North Wall (${resolvedPos.x}, ${resolvedPos.z})`);
    }

    // 2. Verify Doorway / Cat Flap passage at (-34, 0, -20) allows entry
    const doorwayPos = new THREE.Vector3(-34, 0, -20);
    const resolvedDoorwayPos = env.resolveCollision(doorwayPos, 0.35);
    if (Math.abs(resolvedDoorwayPos.x - doorwayPos.x) > 1.0) {
      throw new Error('Cat flap entrance was blocked by false positive collision');
    }

    // Verify Active Shipbuilder dialogue
    const moDialogues = [
      { speaker: 'Mo Kelly', department: 'Dept. 11', trade: 'WELDER' as const, text: 'Keep old Dorothy running!' }
    ];
    const builder = new ShipbuilderEntity('Mo Kelly', 'Dept. 11', 'WELDER', new THREE.Vector3(0, 0, 0), 0, moDialogues);
    const d = builder.getNextDialogue();
    if (d.speaker !== 'Mo Kelly' || d.trade !== 'WELDER') {
      throw new Error('Shipbuilder entity dialogue mismatch');
    }
  }

  private static testAssetLoadingAndSceneIntegrity() {
    // 1. Verify Cat Character Object Graph
    const cat = new CatCharacter();
    if (!cat.mesh || cat.mesh.children.length === 0) {
      throw new Error('CatCharacter mesh hierarchy is empty or uninitialized');
    }

    // 2. Verify Rat Entity
    const rat = new RatEntity(new THREE.Vector3(10, 0, 10));
    if (!rat.mesh || rat.mesh.children.length === 0) {
      throw new Error('RatEntity mesh hierarchy is empty or uninitialized');
    }

    // 3. Verify Shipyard Environment key structures
    const env = new ShipyardEnvironment();
    if (!env.group || env.group.children.length < 5) {
      throw new Error('ShipyardEnvironment missing foundational geometry and structures');
    }

    // 4. Verify Pier Platform height registration
    const pierPlatform = env.platforms.find(p => p.minX >= 40 && p.height === 1.4);
    if (!pierPlatform) {
      throw new Error('Waterfront pier elevated walking surface missing from platform collision table');
    }
  }
}
