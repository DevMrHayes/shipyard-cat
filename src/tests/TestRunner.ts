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
import { TextureGenerator } from '../core/TextureGenerator';
import { PlaytestHarness, PlaytestSessionResult } from './PlaytestHarness';
import { runFlightRecorderTests } from './FlightRecorder.test';

export interface TestResult {
  name: string;
  category: 'UNIT' | 'INTEGRATION' | 'PLAYTEST';
  passed: boolean;
  durationMs: number;
  error?: string;
  telemetry?: { [key: string]: number | string | boolean };
  observations?: string[];
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
      { name: 'Unit: Feline Agile Acceleration, Braking & Turning Arc Kinematics', cat: 'UNIT' as const, fn: TestRunner.testFelineAccelerationAndTurning },
      { name: 'Unit: Trajectory-Locked Pounce Target Parabolic Leap Math', cat: 'UNIT' as const, fn: TestRunner.testPounceTrajectoryMath },
      { name: 'Unit: Rat Panic Adrenaline Burst & Panicked Scamper Flee', cat: 'UNIT' as const, fn: TestRunner.testRatPanicMechanics },
      { name: 'Unit: Mutant Cat Stagger State, Knockback & Combat Recovery', cat: 'UNIT' as const, fn: TestRunner.testMutantStaggerAndRecoil },
      { name: 'Unit: Cat Heading & Quaternion Slerp Motion Remainder Interpolation', cat: 'UNIT' as const, fn: TestRunner.testRotationInterpolationAndSlerp },
      { name: 'Unit: Smooth Vertical Floor Damping over Small Ballast & Seam Steps', cat: 'UNIT' as const, fn: TestRunner.testVerticalFloorDamping },
      { name: 'Unit: CatCharacter Locomotion Hysteresis & Minimum 150ms Dwell Time', cat: 'UNIT' as const, fn: TestRunner.testAnimationHysteresisAndDwellTime },
      { name: 'Unit: Camera Spring-Arm LookAt Exponential Damping & Smooth Tracking', cat: 'UNIT' as const, fn: TestRunner.testCameraLookAtDamping },
      { name: 'Unit: Texture Generator Cache Memoization & Mipmap Generation', cat: 'UNIT' as const, fn: TestRunner.testTextureGeneratorCachingAndMipmaps },
      { name: 'Unit: InstancedMesh Batching for Railway Ties, Plates & Barrels', cat: 'UNIT' as const, fn: TestRunner.testInstancedPropsAndDrawCalls },
      { name: 'Unit: Welding Sparks Zero-Allocation Fixed Circular Buffer Physics', cat: 'UNIT' as const, fn: TestRunner.testWeldingSparksParticleBuffer },
      { name: 'Unit: 4-Branch Ability Skill Tree Structure & Branch Filtering', cat: 'UNIT' as const, fn: TestRunner.testFourBranchSkillTree },
      { name: 'Unit: Radiation Resilience & Lead-Lined Fur Modifiers', cat: 'UNIT' as const, fn: TestRunner.testRadiationResiliencePerks },
      { name: 'Unit: Collectibles Subsystem (Rivets, Badges, Lore Logs)', cat: 'UNIT' as const, fn: TestRunner.testCollectiblesSubsystem },
      { name: 'Unit: 4-Act Story Narrative Structure & Mission Filtering', cat: 'UNIT' as const, fn: TestRunner.testFourActNarrativeMissions },
      { name: 'Unit: Feline Animation Fidelity & Skeletal Mixer Weights (run, walk, stand, pounce, attack)', cat: 'UNIT' as const, fn: TestRunner.testFelineAnimationActionWeights },
      { name: 'Unit: Dry Dock 1 & Dry Dock 12 Terrain Mesh Cutout & Basin Elevation Visibility', cat: 'UNIT' as const, fn: TestRunner.testDryDockBasinVisibilityAndCutouts },
      { name: 'Unit: 1,000-Cycle Compound Motion State Recovery & Freeze Immunity', cat: 'UNIT' as const, fn: TestRunner.test1000CycleCompoundMotionAndFreezeImmunity },
      { name: 'Unit: Initial Spawn Clearance & Industrial Fuel Tank Isolation (≥ 3.0m clearance)', cat: 'UNIT' as const, fn: TestRunner.testInitialSpawnClearanceAndTankIsolation },
      { name: 'Unit: Pier Boardwalk Wall Collision & Boarding Ramp Traversal Elevation (Y=0.0m to Y=1.4m)', cat: 'UNIT' as const, fn: TestRunner.testBoardwalkWallCollisionAndRampElevation },
      { name: 'Unit: Sprint & Pounce Glitch Elimination & Zero-Freeze Benchmark', cat: 'UNIT' as const, fn: TestRunner.testSprintPounceGlitchEliminationAndZeroFreeze },
      { name: 'Unit: Enhanced Visual Architecture & Stylized Welder Entity Integrity', cat: 'UNIT' as const, fn: TestRunner.testEnhancedVisualArchitectureAndShipbuilders },
      { name: 'Unit: Mezzanine Catwalk, Dry Dock Crate Climbing & Collision Airtightness Integrity', cat: 'UNIT' as const, fn: TestRunner.testMezzanineCatwalkAndCrateClimbing },
      { name: 'Unit: Box Collision Airtightness & Big Blue Ground Integrity Verification', cat: 'UNIT' as const, fn: TestRunner.testBoxCollisionAndBigBlueIntegrity },
      { name: 'Unit: 1,500-Tick Deep Dive Frame Freeze & State Machine Deadlock Elimination', cat: 'UNIT' as const, fn: TestRunner.test1500TickDeepDiveFrameFreezeAndDeadlockElimination },
      { name: 'Unit: Engine Flight Recorder Telemetry Buffer & Stall Spike Trapper', cat: 'UNIT' as const, fn: TestRunner.testEngineFlightRecorderAndStallDetection },

      // INTEGRATION TESTS
      { name: 'Integration: Rat Stealth Stalking, Pounce Catch & Accidental Assistance', cat: 'INTEGRATION' as const, fn: TestRunner.testRatHuntingAndAssistanceIntegration },
      { name: 'Integration: RCOH Nuclear Radiation Hotspot Proximity Loop', cat: 'INTEGRATION' as const, fn: TestRunner.testRadiationProximityIntegration },
      { name: 'Integration: Full Mission 1 Completion Unlocks Mission 2', cat: 'INTEGRATION' as const, fn: TestRunner.testFullMission1Lifecycle },
      { name: 'Integration: Mutant Insurgent Combat & Colony NPC Sanctuary Care', cat: 'INTEGRATION' as const, fn: TestRunner.testMutantCombatAndColonyIntegration },
      { name: 'Integration: Active Shipbuilder Tradesmen & Solid Wall Collision Resolver', cat: 'INTEGRATION' as const, fn: TestRunner.testShipbuildersAndCollisionIntegration },
      { name: 'Integration: 3D Asset Loading Fallbacks & Feline Entity Scene Integrity', cat: 'INTEGRATION' as const, fn: TestRunner.testAssetLoadingAndSceneIntegrity },
      { name: 'Integration: Shipyard Feeding Bowls Registration & Sanctuary Nutrition', cat: 'INTEGRATION' as const, fn: TestRunner.testFoodBowlsAndSanctuaryIntegration },

      // PLAYTEST SIMULATION SUITE (17 COMPLETE GAMEPLAY SESSIONS)
      { name: 'Playtest Session A: Idle Stability & Camera Calmness (0 Angular Drift over 500 ticks)', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionA_IdleCalmness() },
      { name: 'Playtest Session B: 8-Direction Locomotion, Sprinting & Braking Arc Kinematics', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionB_LocomotionAndBraking() },
      { name: 'Playtest Session C: Solid Wall Collisions, Sliding Tangents & Corner Resolution', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionC_WallCollisionAndSliding() },
      { name: 'Playtest Session D: 3D Platforming, Ballast Damping & Crate Mantling', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionD_PlatformingAndMantling() },
      { name: 'Playtest Session E: Whiskers Sonar, Pounce Trajectory Locking & Claw Combos', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionE_CombatAndPounceLocking() },
      { name: 'Playtest Session F: 4-Act Story Missions Progression & Colony NPC Dialogues', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionF_NarrativeProgressionAndNPCs() },
      { name: 'Playtest Session G: Sprint + Lunge + Swipe Compound Stress Test & Lag Spike Profiling', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionG_CompoundActionStressTest() },
      { name: 'Playtest Session H: Feline Animation Fidelity & Action Weight Integrity Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionH_FelineAnimationFidelityAndActionWeights() },
      { name: 'Playtest Session I: Dry Dock 1 & Dry Dock 12 Basin Visibility & Cutout Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionI_DryDockBasinVisibilityAndCutouts() },
      { name: 'Playtest Session J: 1,000-Cycle Compound Stress & Freeze Immunity Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionJ_1000CycleCompoundStressAndFreezeImmunity() },
      { name: 'Playtest Session K: Initial Spawn Clearance & Tank Isolation Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionK_InitialSpawnClearanceAndTankIsolation() },
      { name: 'Playtest Session L: Boardwalk Wall & Ramp Traversal Collision Integrity Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionL_BoardwalkWallAndRampTraversal() },
      { name: 'Playtest Session M: Sprint & Pounce Glitch Elimination & Zero-Freeze Benchmark', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionM_SprintPounceZeroFreezeBenchmark() },
      { name: 'Playtest Session N: Enhanced Visual Architecture & Stylized Shipbuilder Integrity Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionN_EnhancedVisualArchitectureAndShipbuilders() },
      { name: 'Playtest Session O: Mezzanine Catwalk, Dry Dock Crate Climbing & Collision Airtightness Integrity Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionO_MezzanineCatwalkAndCrateClimbing() },
      { name: 'Playtest Session P: Box Collision Airtightness & Big Blue Ground Integrity Verification', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionP_BoxCollisionAndBigBlueIntegrity() },
      { name: 'Playtest Session Q: 1,500-Tick Deep Dive Frame Freeze & State Machine Deadlock Elimination Test', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionQ_1500TickDeepDiveFrameFreezeAndDeadlockElimination() },
      { name: 'Playtest Session R: AI-Out-of-Substep Spiral Elimination & Water Vertex CPU Stall Elimination', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionR_AISubstepSpiralAndWaterStallElimination() }
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

    // Verify active waypoint for first objective (hunt_mice)
    const wp1 = mm.getActiveWaypoint();
    if (!wp1 || wp1.x !== -25 || !wp1.hint) {
      throw new Error(`Expected active waypoint for hunt_mice, got ${JSON.stringify(wp1)}`);
    }

    mm.completeObjective('hunt_mice');
    const wp2 = mm.getActiveWaypoint();
    if (!wp2 || wp2.x !== 41) {
      throw new Error(`Expected active waypoint for climb_dorothy, got ${JSON.stringify(wp2)}`);
    }

    mm.completeObjective('climb_dorothy');
    const obj = m1.objectives.find(o => o.id === 'climb_dorothy');
    if (!obj?.isCompleted) throw new Error('Objective was not marked completed');

    mm.completeObjective('hunt_kingpin');
    if (!m1.isCompleted) throw new Error('Mission 1 was not marked completed');

    const advanced = mm.advanceToNextMission();
    if (!advanced || mm.getCurrentMission().id !== 2) {
      throw new Error('Failed to advance to Mission 2');
    }
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

  private static testFourBranchSkillTree() {
    const prog = new ProgressionSystem();
    const perks = prog.getPerks();
    if (perks.length !== 16) {
      throw new Error(`Expected 16 total perks across 4 branches, got ${perks.length}`);
    }

    const branches = ['PARKOUR_AGILITY', 'PREDATOR_COMBAT', 'FELINE_SENSES', 'RADIATION_RESILIENCE'] as const;
    for (const b of branches) {
      const branchPerks = prog.getPerksByBranch(b);
      if (branchPerks.length !== 4) {
        throw new Error(`Expected 4 perks in branch ${b}, got ${branchPerks.length}`);
      }
      const progress = prog.getBranchProgress(b);
      if (progress.total !== 4 || progress.unlocked !== 0) {
        throw new Error(`Invalid branch progress for ${b}: ${JSON.stringify(progress)}`);
      }
    }
  }

  private static testRadiationResiliencePerks() {
    const prog = new ProgressionSystem();
    prog.addXP(600); // 3 SP

    // Check baseline radiation resistance
    if (prog.radResistanceMultiplier !== 1.0 || prog.radDamageReduction !== 0.0) {
      throw new Error('Baseline radiation resistance should be 1.0 multiplier with 0 reduction');
    }

    // Unlock Lead-Lined Fur (Cost: 1 SP)
    const success = prog.unlockPerk('LEAD_LINED_FUR');
    if (!success || !prog.isUnlocked('LEAD_LINED_FUR')) {
      throw new Error('Failed to unlock LEAD_LINED_FUR perk');
    }
    if (prog.radResistanceMultiplier > 0.7 || prog.radDamageReduction < 0.3) {
      throw new Error(`Lead-Lined Fur did not reduce radiation dose: multiplier ${prog.radResistanceMultiplier}`);
    }
  }

  private static testCollectiblesSubsystem() {
    const prog = new ProgressionSystem();
    const initial = prog.getCollectiblesSummary();
    if (initial.total !== 0) throw new Error('Initial collectibles should be 0');

    // Collect 1 Rivet (+25 XP)
    const rivetCollected = prog.collectRivet('RIVET_1889_DD1');
    if (!rivetCollected || !prog.collectedRivets.has('RIVET_1889_DD1')) {
      throw new Error('Failed to collect rivet');
    }

    // Attempt duplicate collection
    if (prog.collectRivet('RIVET_1889_DD1')) {
      throw new Error('Duplicate rivet collection should return false');
    }

    // Collect Badge & Lore Log
    prog.collectBadge('BADGE_DEPT11_WELD');
    prog.collectLoreLog('LORE_DOROTHY_1891');

    const summary = prog.getCollectiblesSummary();
    if (summary.rivets !== 1 || summary.badges !== 1 || summary.loreLogs !== 1 || summary.total !== 3) {
      throw new Error(`Collectibles summary mismatch: ${JSON.stringify(summary)}`);
    }
  }

  private static testFourActNarrativeMissions() {
    const mm = new MissionManager();
    const allMissions = mm.getMissions();
    if (allMissions.length !== 8) {
      throw new Error(`Expected 8 story missions across 4 acts, got ${allMissions.length}`);
    }

    // Verify Act partitioning
    for (let act = 1; act <= 4; act++) {
      const actMissions = mm.getMissionsByAct(act as 1 | 2 | 3 | 4);
      if (actMissions.length !== 2) {
        throw new Error(`Expected 2 missions in Act ${act}, got ${actMissions.length}`);
      }
    }

    // Verify collectibles registry on missions
    const collectibles = mm.getAllCollectibles();
    if (collectibles.length < 5) {
      throw new Error(`Expected at least 5 collectibles registered in mission data, got ${collectibles.length}`);
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

    // Toggle All Perks (Max Sandbox - Level 8 Grand Master Mouser)
    prog.toggleAllPerks(true);
    if ((prog.level as number) !== 8 || (prog.whiskersTier as number) !== 4 || !prog.hasAlwaysLandOnFeet || !prog.hasFelineFrenzy) {
      throw new Error('Max Sandbox toggle did not grant full Tier 4 perks');
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

    // 2. Test sliding vector mechanics (moving diagonally (-34, 0, -32) from outside (-32, 0, -28))
    const diagOutside = new THREE.Vector3(-32.0, 0, -28.0);
    const diagTarget = new THREE.Vector3(-34.0, 0, -32.0);
    const diagResolved = env.resolveCollision(diagTarget, 0.35, diagOutside);
    if (diagResolved.x < -33.15 || Math.abs(diagResolved.z - (-32.0)) > 0.01) {
      throw new Error(`Sliding vector failed: entity did not slide smoothly along wall Z tangent (${diagResolved.x}, ${diagResolved.z})`);
    }

    // 3. Test 90-degree corner resolution (Machine Shop back wall & left wall corner at -56, 0, -38)
    const cornerInside = new THREE.Vector3(-56.0, 0, -38.0);
    const cornerPrev = new THREE.Vector3(-54.0, 0, -36.0);
    const cornerResolved = env.resolveCollision(cornerInside, 0.35, cornerPrev);
    if (cornerResolved.x < -55.15 || cornerResolved.z < -37.15) {
      throw new Error(`Corner resolver failed: entity penetrated corner intersection (${cornerResolved.x}, ${cornerResolved.z})`);
    }

    // 4. Verify Doorway / Cat Flap passage at (-34, 0, -20) allows entry
    const doorwayPos = new THREE.Vector3(-34, 0, -20);
    const resolvedDoorwayPos = env.resolveCollision(doorwayPos, 0.35);
    if (Math.abs(resolvedDoorwayPos.x - doorwayPos.x) > 1.0) {
      throw new Error('Cat flap entrance was blocked by false positive collision');
    }

    // 5. Test Platform Floor Detection & Step-Up Tolerance
    const pierFloor = env.getPlatformFloor(50.0, 0.0, 1.2);
    if (pierFloor !== 1.4) {
      throw new Error(`Expected pier floor height 1.4, got ${pierFloor}`);
    }

    // Exact Ramp Platform Floor Tracking (X: 38.0 to 45.5, Y: 0.0 to 1.4m)
    const rampBottomFloor = env.getPlatformFloor(38.0, 20.0, 0.0);
    if (Math.abs(rampBottomFloor - 0.0) > 0.01) {
      throw new Error(`Expected ramp bottom floor 0.0, got ${rampBottomFloor}`);
    }
    const rampMidFloor = env.getPlatformFloor(41.75, 20.0, 0.5);
    if (Math.abs(rampMidFloor - 0.70) > 0.01) {
      throw new Error(`Expected ramp mid floor 0.70, got ${rampMidFloor}`);
    }
    const rampTopFloor = env.getPlatformFloor(45.5, 20.0, 1.2);
    if (Math.abs(rampTopFloor - 1.40) > 0.01) {
      throw new Error(`Expected ramp top floor 1.40, got ${rampTopFloor}`);
    }

    const dorothyDeckFloor = env.getPlatformFloor(-20.0, -25.0, 2.0);
    if (dorothyDeckFloor !== 2.2) {
      throw new Error(`Expected Dorothy deck floor height 2.2, got ${dorothyDeckFloor}`);
    }

    const drydockBasinFloor = env.getPlatformFloor(30.0, -32.0, -1.8);
    if (drydockBasinFloor !== -2.0) {
      throw new Error(`Expected Drydock 1 basin floor height -2.0, got ${drydockBasinFloor}`);
    }

    const keelBlockFloor = env.getPlatformFloor(30.0, -27.5, -1.8);
    if (keelBlockFloor !== -1.5) {
      throw new Error(`Expected Keel Block floor height -1.5, got ${keelBlockFloor}`);
    }

    // 6. Test Pier Boardwalk West Wall & Boarding Ramp Collisions
    // Running from ground (Y=0) into boardwalk wall at X=45.5, Z=0 must be blocked
    const groundMoveToPier = env.resolveCollision(new THREE.Vector3(45.5, 0.0, 0.0), 0.35, new THREE.Vector3(44.0, 0.0, 0.0));
    if (groundMoveToPier.x > 44.7) {
      throw new Error(`Ground entity clipped through Pier boardwalk west wall (X=${groundMoveToPier.x})`);
    }

    // Walking through ramp side triangular edge at X=42.0, Z=16.0 (Z=20 ramp south barrier) must be blocked
    const groundMoveToRampSide = env.resolveCollision(new THREE.Vector3(42.0, 0.0, 16.0), 0.35, new THREE.Vector3(42.0, 0.0, 15.0));
    if (groundMoveToRampSide.z > 15.7) {
      throw new Error(`Ground entity clipped through ramp side barrier (Z=${groundMoveToRampSide.z})`);
    }

    // Walking onto ramp through open corridor at X=38.5, Z=20.0 must be allowed
    const rampEntryMove = env.resolveCollision(new THREE.Vector3(38.5, 0.1, 20.0), 0.35, new THREE.Vector3(37.5, 0.0, 20.0));
    if (Math.abs(rampEntryMove.x - 38.5) > 0.1) {
      throw new Error(`Ramp open passageway was blocked incorrectly (X=${rampEntryMove.x})`);
    }

    // 7. Verify Key Solid Obstacles are Registered
    const requiredObstacles = [
      'Machine Shop - North Wall',
      'Industrial Fuel Tank',
      'Tugboat Dorothy Keel & Hull',
      'Tugboat Dorothy Wheelhouse',
      'Submarine Hull Module',
      'RCOH Radiological Vault',
      'Cat Motel Hub',
      'Big Blue Crane West Leg',
      'Big Blue Crane East Leg',
      'West Yard Security Fence',
      'Pier Boardwalk West Wall (-56 to 16)',
      'Boarding Ramp South Barrier (Z=20)',
      'Boarding Ramp North Barrier (Z=20)'
    ];
    for (const name of requiredObstacles) {
      const found = env.solidObstacles.some(o => o.name === name);
      if (!found) {
        throw new Error(`Required solid obstacle '${name}' not found in registered obstacles`);
      }
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

  private static testFelineAccelerationAndTurning() {
    // 1. Verify Acceleration Kinetics
    let currentSpeed = 0;
    const targetSprintSpeed = 9.2;
    const accelRate = 22.0;
    const dt = 1 / 60;

    // After 10 ticks (0.167s), speed should ramp up smoothly
    for (let i = 0; i < 10; i++) {
      const diff = targetSprintSpeed - currentSpeed;
      currentSpeed += Math.sign(diff) * Math.min(Math.abs(diff), accelRate * dt);
    }
    if (currentSpeed <= 3.0 || currentSpeed >= 9.2) {
      throw new Error(`Expected smooth feline sprint acceleration curve (~3.6 m/s), got ${currentSpeed}`);
    }

    // 2. Verify Deceleration / Braking
    const brakeRate = 28.0;
    const brakeDiff = 0 - currentSpeed;
    currentSpeed += Math.sign(brakeDiff) * Math.min(Math.abs(brakeDiff), brakeRate * 0.2); // 200ms brake
    if (currentSpeed > 0.5) {
      throw new Error(`Feline braking did not stop quickly, remaining speed: ${currentSpeed}`);
    }

    // 3. Verify Sneak vs Sprint Turn Rate Agility
    const sneakTurnRate = 3.4;
    const sprintTurnRate = 2.6;
    if (sneakTurnRate <= sprintTurnRate) {
      throw new Error('Sneak stalk turning agility must be tighter than high-speed sprint arc');
    }
  }

  private static testPounceTrajectoryMath() {
    const catPos = new THREE.Vector3(0, 0, 0);
    const preyPos = new THREE.Vector3(0, 0, 5.0); // 5m in front of cat
    const dist = catPos.distanceTo(preyPos);

    const flightTime = Math.max(0.32, Math.min(0.55, dist / 11.5));
    const gravity = 18.0;
    const dy = preyPos.y - catPos.y;
    const initialVy = (dy + 0.5 * gravity * flightTime * flightTime) / flightTime;
    const horizSpeed = dist / flightTime;

    // Verify Parabolic equation lands accurately on prey at t = flightTime
    const landedY = catPos.y + initialVy * flightTime - 0.5 * gravity * flightTime * flightTime;
    if (Math.abs(landedY - preyPos.y) > 0.001) {
      throw new Error(`Pounce parabolic trajectory failed landing accuracy (expected Y=${preyPos.y}, got ${landedY})`);
    }

    const landedZ = catPos.z + horizSpeed * flightTime;
    if (Math.abs(landedZ - preyPos.z) > 0.001) {
      throw new Error(`Pounce horizontal displacement mismatch (expected Z=${preyPos.z}, got ${landedZ})`);
    }
  }

  private static testRatPanicMechanics() {
    const rat = new RatEntity(new THREE.Vector3(0, 0, 0));
    if ((rat.state as string) !== 'FORAGING') {
      throw new Error(`Expected initial FORAGING state, got ${rat.state}`);
    }

    // Cat closes in within panic trigger range (< 3.2m)
    const catNear = new THREE.Vector3(0, 0, 2.5);
    rat.update(1 / 60, catNear, false);

    if ((rat.state as string) !== 'FLEEING') {
      throw new Error(`Expected rat to enter FLEEING panic state when cat approaches, got ${rat.state}`);
    }

    // Update for 1 second of pursuit
    const prevRatZ = rat.mesh.position.z;
    rat.update(1.0, catNear, false);

    // Rat should scurry away along -Z (away from cat at +Z)
    if (rat.mesh.position.z >= prevRatZ) {
      throw new Error(`Rat did not flee away from cat position (Z moved from ${prevRatZ} to ${rat.mesh.position.z})`);
    }
  }

  private static testMutantStaggerAndRecoil() {
    const mutant = new MutantCatEntity('Test Mutant Insurgent', new THREE.Vector3(0, 0, 5));
    const catHitPos = new THREE.Vector3(0, 0, 4);

    // Deal non-lethal claw strike
    const defeated = mutant.takeDamage(25, catHitPos, false);
    if (defeated || (mutant.state as string) !== 'STAGGER' || mutant.staggerTimer <= 0) {
      throw new Error(`Mutant did not enter STAGGER state with recoil timer (state: ${mutant.state}, timer: ${mutant.staggerTimer})`);
    }

    // Update through stagger
    const prevZ = mutant.mesh.position.z;
    mutant.update(0.2, new THREE.Vector3(0, 0, 0));
    if (mutant.mesh.position.z <= prevZ) {
      throw new Error('Mutant was not knocked back away from strike position');
    }

    // Complete stagger recovery
    mutant.update(0.5, new THREE.Vector3(0, 0, 0));
    if ((mutant.state as string) !== 'HOSTILE') {
      throw new Error(`Mutant failed to recover from stagger back to HOSTILE (got ${mutant.state})`);
    }
  }

  private static testFoodBowlsAndSanctuaryIntegration() {
    const env = new ShipyardEnvironment();
    if (!env.foodBowls || env.foodBowls.length < 3) {
      throw new Error(`Expected at least 3 registered food bowls in shipyard, found ${env.foodBowls?.length}`);
    }

    const motelBowl = env.foodBowls.find(b => b.position.x <= -50 && b.position.z <= -55);
    if (!motelBowl) {
      throw new Error('Cat Motel sanctuary food bowl station missing from registered bowls');
    }

    const dorothyBowl = env.foodBowls.find(b => b.name.includes("Mo's Welder"));
    if (!dorothyBowl) {
      throw new Error('Dorothy tugboat staging food bowl missing from registered bowls');
    }

    const vitals = new CatVitals(100, 100, 40); // 40 health remaining
    vitals.feed(35);
    if (vitals.currentHunger < 70) {
      throw new Error('Feeding at food bowl did not replenish hunger vitals');
    }
  }

  private static testRotationInterpolationAndSlerp() {
    const qPrev = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    const qTarget = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    const qMid = new THREE.Quaternion().slerpQuaternions(qPrev, qTarget, 0.5);
    const euler = new THREE.Euler().setFromQuaternion(qMid);
    if (Math.abs(euler.y - Math.PI / 4) > 0.001) {
      throw new Error(`Quaternion slerp midpoint angle expected ${Math.PI / 4}, got ${euler.y}`);
    }

    // Test shortest-angle yaw remainder interpolation across angle boundary
    const hPrev = 3.10; // near +PI
    const hTarget = -3.10; // near -PI (delta is +0.083 rad, not -6.20 rad)
    let headingDiff = hTarget - hPrev;
    headingDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff));
    const hInterp = hPrev + headingDiff * 0.5;
    if (Math.abs(Math.abs(hInterp) - Math.PI) > 0.1) {
      throw new Error(`Shortest angle wrap calculation error: got ${hInterp}`);
    }
  }

  private static testVerticalFloorDamping() {
    let catY = 0.0;
    let isGrounded = true;
    const dt = 1 / 60;

    // 1. Step up onto small railway tie / ballast step (+0.08m <= 0.15m)
    const tieFloor = 0.08;
    const heightDiffUp = tieFloor - catY;
    if (isGrounded && Math.abs(heightDiffUp) <= 0.15) {
      const dampFactor = 1.0 - Math.exp(-22.0 * dt);
      catY = THREE.MathUtils.lerp(catY, tieFloor, dampFactor);
    }
    if (catY <= 0 || catY > 0.08 || !isGrounded) {
      throw new Error(`Small ballast step up did not damp smoothly while grounded (catY: ${catY})`);
    }

    // Complete damping over 200ms
    for (let i = 0; i < 15; i++) {
      const dampFactor = 1.0 - Math.exp(-22.0 * dt);
      catY = THREE.MathUtils.lerp(catY, tieFloor, dampFactor);
    }
    if (Math.abs(catY - tieFloor) > 0.01) {
      throw new Error(`Floor height damping did not converge to tieFloor (catY: ${catY}, expected ~0.08)`);
    }

    // 2. Step down off railway tie back to ground (-0.08m >= -0.15m)
    const groundFloor = 0.0;
    const heightDiffDown = groundFloor - catY;
    let becameAirborne = false;
    if (isGrounded && Math.abs(heightDiffDown) <= 0.15) {
      const dampFactor = 1.0 - Math.exp(-22.0 * dt);
      catY = THREE.MathUtils.lerp(catY, groundFloor, dampFactor);
    } else if (!isGrounded || catY > groundFloor + 0.15) {
      becameAirborne = true;
    }
    if (becameAirborne) {
      throw new Error('Stepping down <= 0.15m ballast step caused false positive mid-air drop');
    }

    // 3. Fall off a high boardwalk (> 0.15m step drop)
    const highDropFloor = -1.2;
    let fellAirborne = false;
    if (catY > highDropFloor + 0.15) {
      fellAirborne = true;
    }
    if (!fellAirborne) {
      throw new Error('High ledge drop (>0.15m) did not trigger airborne state');
    }
  }

  private static testAnimationHysteresisAndDwellTime() {
    const cat = new CatCharacter();
    if (CatCharacter.MIN_ACTION_DWELL_TIME !== 0.15) {
      throw new Error(`Expected minimum action dwell time of 0.15s (150ms), got ${CatCharacter.MIN_ACTION_DWELL_TIME}`);
    }

    cat.currentActionName = 'stand';
    cat.actionDwellTime = 0.0;

    // 1. Minor speed noise (< 0.20 m/s) does not leave stand
    cat.animate(0.016, 0.12, true, 0);
    if (cat.currentActionName !== 'stand') {
      throw new Error(`Minor speed wobble (0.12 m/s) prematurely broke stand state (got ${cat.currentActionName})`);
    }

    // 2. Walk speed (2.5 m/s) enters walk after 150ms dwell
    cat.animate(0.16, 2.5, true, 0); // 160ms elapsed > 150ms
    cat.currentActionName = 'walk_straight';
    cat.actionDwellTime = 0.0;

    // 3. Speed near run threshold (5.0 m/s) does not enter run until > 5.2 m/s
    cat.animate(0.16, 5.0, true, 0);
    if (cat.currentActionName === 'run') {
      throw new Error('Entered run state prematurely at 5.0 m/s (expected > 5.2 m/s run threshold)');
    }

    // 4. Combat attack triggers immediately regardless of dwell timer
    cat.actionDwellTime = 0.01; // Only 10ms into current animation
    cat.triggerSwipe(false);
    cat.animate(0.016, 2.0, true, 0);
    if (cat.attackTimer <= 0) {
      throw new Error('Combat attack did not trigger immediately');
    }
  }

  private static testCameraLookAtDamping() {
    const currentLookAt = new THREE.Vector3(0, 0.4, 0);
    const rawTarget = new THREE.Vector3(10, 0.4, 10);
    const dt = 1 / 60;

    // First frame tracking
    const lookLerpFactor = 1.0 - Math.exp(-16.0 * dt);
    currentLookAt.lerp(rawTarget, Math.min(1.0, lookLerpFactor));

    // Must be smoothly interpolating towards rawTarget without snapping immediately to 10
    if (currentLookAt.x <= 0 || currentLookAt.x >= 10) {
      throw new Error(`Camera lookAt did not exponentially damp smoothly (got X: ${currentLookAt.x})`);
    }

    // Converge over 300ms
    for (let i = 0; i < 20; i++) {
      currentLookAt.lerp(rawTarget, Math.min(1.0, 1.0 - Math.exp(-16.0 * dt)));
    }
    if (currentLookAt.distanceTo(rawTarget) > 0.2) {
      throw new Error(`Camera lookAt did not converge cleanly to target (remaining distance: ${currentLookAt.distanceTo(rawTarget)})`);
    }
  }

  private static testTextureGeneratorCachingAndMipmaps() {
    const tex1 = TextureGenerator.createBrickTexture();
    const tex2 = TextureGenerator.createBrickTexture();
    if (tex1 !== tex2) {
      throw new Error('TextureGenerator failed to return cached texture instance');
    }
    if (!tex1.generateMipmaps) {
      throw new Error('Texture missing generateMipmaps flag');
    }
    if (tex1.minFilter !== THREE.LinearMipmapLinearFilter) {
      throw new Error('Texture missing trilinear LinearMipmapLinearFilter');
    }
    if (tex1.magFilter !== THREE.LinearFilter) {
      throw new Error('Texture missing LinearFilter');
    }
  }

  private static testInstancedPropsAndDrawCalls() {
    const env = new ShipyardEnvironment();
    let instancedCount = 0;
    let totalInstanceDraws = 0;
    env.group.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        instancedCount++;
        totalInstanceDraws += (obj as THREE.InstancedMesh).count;
      }
    });
    if (instancedCount < 5) {
      throw new Error(`Expected at least 5 InstancedMesh prop groups in environment, found ${instancedCount}`);
    }
    if (totalInstanceDraws < 100) {
      throw new Error(`Expected >100 instanced prop instances batched across environment, found ${totalInstanceDraws}`);
    }
  }

  private static testWeldingSparksParticleBuffer() {
    const env = new ShipyardEnvironment();
    if (!env.weldingSparkParticles) {
      throw new Error('Welding spark particle system is missing');
    }
    const posAttr = env.weldingSparkParticles.geometry.getAttribute('position');
    if (!posAttr || posAttr.count < 100) {
      throw new Error(`Expected at least 100 particles in circular buffer, found ${posAttr?.count}`);
    }
    const colAttr = env.weldingSparkParticles.geometry.getAttribute('color');
    if (!colAttr || colAttr.count < 100) {
      throw new Error('Welding spark particle system missing dynamic color gradient attribute');
    }
    env.update(0.016);
  }

  private static testFelineAnimationActionWeights() {
    const cat = new CatCharacter();
    const mixer = cat.getMixer();
    if (!mixer) {
      throw new Error('CatCharacter mixer is null');
    }

    const clips = ['stand', 'walk', 'run', 'pounce', 'attack'];
    for (const clipName of clips) {
      const act = cat.getAnimationAction(clipName);
      if (!act) {
        throw new Error(`Missing animation clip action: ${clipName}`);
      }
    }

    // 1. Stand (Speed = 0)
    cat.animate(0.016, 0.0, true, 0);
    const standAct = cat.getAnimationAction('stand')!;
    if (cat.getCurrentActionName() !== 'stand' || !standAct.isRunning() || standAct.getEffectiveWeight() <= 0) {
      throw new Error('Stand animation clip failed weight or execution test');
    }

    // 2. Walk (Speed = 3.5, dwell elapsed)
    cat.animate(0.16, 3.5, true, 0);
    const walkAct = cat.getAnimationAction('walk_straight') || cat.getAnimationAction('walk')!;
    if ((cat.getCurrentActionName() !== 'walk_straight' && cat.getCurrentActionName() !== 'walk') || !walkAct.isRunning() || walkAct.getEffectiveWeight() <= 0) {
      throw new Error('Walk animation clip failed weight or execution test');
    }

    // 3. Run (Speed = 9.2, dwell elapsed)
    cat.animate(0.16, 9.2, true, 0);
    const runAct = cat.getAnimationAction('run')!;
    if (cat.getCurrentActionName() !== 'run' || !runAct.isRunning() || runAct.getEffectiveWeight() <= 0) {
      throw new Error('Run animation clip failed weight or execution test');
    }

    // 4. Pounce
    cat.isPouncing = true;
    cat.animate(0.016, 8.0, false, 0);
    const pounceAct = cat.getAnimationAction('pounce')!;
    if (cat.getCurrentActionName() !== 'pounce' || !pounceAct.isRunning() || pounceAct.getEffectiveWeight() <= 0) {
      throw new Error('Pounce animation clip failed weight or execution test');
    }
    cat.isPouncing = false;

    // 5. Attack
    cat.triggerSwipe(false);
    cat.animate(0.016, 2.0, true, 0);
    const attackAct = cat.getAnimationAction('attack')!;
    if (cat.getCurrentActionName() !== 'attack' || !attackAct.isRunning() || attackAct.getEffectiveWeight() <= 0) {
      throw new Error('Attack animation clip failed weight or execution test');
    }
  }

  private static testDryDockBasinVisibilityAndCutouts() {
    const env = new ShipyardEnvironment();
    if (!env.groundMesh || !env.dd1BasinFloor) {
      throw new Error('ShipyardEnvironment missing groundMesh or dd1BasinFloor');
    }
    env.group.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);

    // 1. Dry Dock 1 Cutout Point (28, 5, -27.5)
    raycaster.set(new THREE.Vector3(28, 5.0, -27.5), down);
    const groundHitsDD1 = raycaster.intersectObject(env.groundMesh, false);
    if (groundHitsDD1.length > 0) {
      throw new Error(`Ground plane unexpectedly covered Dry Dock 1 at Y=${groundHitsDD1[0].point.y}`);
    }
    const basinHitsDD1 = raycaster.intersectObject(env.dd1BasinFloor, false);
    if (basinHitsDD1.length === 0 || Math.abs(basinHitsDD1[0].point.y - (-2.0)) > 0.01) {
      throw new Error(`Failed to intersect Dry Dock 1 basin floor at Y=-2.0m (got ${basinHitsDD1[0]?.point.y})`);
    }

    // 2. Dry Dock 12 Cutout Point (20, 5, 50.0)
    raycaster.set(new THREE.Vector3(20, 5.0, 50.0), down);
    const groundHitsDD12 = raycaster.intersectObject(env.groundMesh, false);
    if (groundHitsDD12.length > 0) {
      throw new Error(`Ground plane unexpectedly covered Dry Dock 12 at Y=${groundHitsDD12[0].point.y}`);
    }

    // 3. Solid Ground Point (-15, 5, -10.0)
    raycaster.set(new THREE.Vector3(-15, 5.0, -10.0), down);
    const solidHits = raycaster.intersectObject(env.groundMesh, false);
    if (solidHits.length === 0 || Math.abs(solidHits[0].point.y) > 0.01) {
      throw new Error('Solid ground surface missing or misaligned outside cutouts');
    }
  }

  private static test1000CycleCompoundMotionAndFreezeImmunity() {
    const env = new ShipyardEnvironment();
    const cat = new CatCharacter();
    const vitals = new CatVitals(100, 100);
    const prog = new ProgressionSystem();
    prog.setLevel(8);
    prog.unlockPerk('CLAW_FLURRY');
    prog.unlockPerk('SPRING_PAWS');

    const dt = 1 / 60;
    const catPos = new THREE.Vector3(-15, 0, -10);
    let catSpeed = 0.0;
    let heading = 0.0;
    let frozenViolations = 0;

    for (let c = 0; c < 1000; c++) {
      // 1. Sprint
      const targetSpeed = 9.2 * prog.sprintMultiplier;
      heading += Math.sin(c * 0.1) * 0.05;
      catSpeed = targetSpeed;
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const targetPos = catPos.clone().addScaledVector(forward, catSpeed * dt);
      const resolved = env.resolveCollision(targetPos, 0.35, catPos);
      catPos.copy(resolved);

      // 2. Pounce
      cat.isPouncing = true;
      cat.animate(dt, catSpeed, false, 0);
      const floor = env.getPlatformFloor(catPos.x, catPos.z, catPos.y);
      catPos.y = floor;
      cat.isPouncing = false;

      // 3. Attack
      cat.triggerSwipe(c % 2 === 0);
      cat.animate(dt, 2.0, true, 0);

      // Invariant checks
      if (!Number.isFinite(catPos.x) || !Number.isFinite(catPos.y) || !Number.isFinite(catPos.z) ||
          cat.isPouncing || cat.attackTimer > 0.5) {
        frozenViolations++;
      }
    }

    if (frozenViolations > 0) {
      throw new Error(`1,000-cycle test failed: detected ${frozenViolations} frozen input states`);
    }
  }

  private static testInitialSpawnClearanceAndTankIsolation() {
    const env = new ShipyardEnvironment();
    const spawnPos = new THREE.Vector3(-10.0, 0.0, -20.0);
    const catRadius = 0.35;
    const requiredClearance = 3.0;

    // 1. Validate Clearance from all solid obstacles >= 3.0m
    for (const obs of env.solidObstacles) {
      const dx = Math.max(0, obs.min.x - spawnPos.x, spawnPos.x - obs.max.x);
      const dz = Math.max(0, obs.min.z - spawnPos.z, spawnPos.z - obs.max.z);
      const dist = Math.hypot(dx, dz);
      if (dist < requiredClearance) {
        throw new Error(`Obstacle "${obs.name}" within ${dist.toFixed(2)}m of spawn coordinate (min ${requiredClearance}m required)`);
      }
    }

    // 2. Specific Verification for Red Fuel Pressure Vessel & Concrete Saddle Piers
    const tankObs = env.solidObstacles.find(o => o.name.toLowerCase().includes('fuel tank'));
    if (!tankObs) throw new Error('Industrial Fuel Tank obstacle missing');
    const tankDx = Math.max(0, tankObs.min.x - spawnPos.x, spawnPos.x - tankObs.max.x);
    const tankDz = Math.max(0, tankObs.min.z - spawnPos.z, spawnPos.z - tankObs.max.z);
    const tankDist = Math.hypot(tankDx, tankDz);
    if (tankDist < 3.0) {
      throw new Error(`Fuel Tank clearance insufficient: ${tankDist.toFixed(2)}m`);
    }

    // Saddle piers check (closest saddle pier at X: -15, Z: -8)
    const saddleDx = Math.max(0, -15.6 - spawnPos.x, spawnPos.x - (-14.4));
    const saddleDz = Math.max(0, -10.0 - spawnPos.z, spawnPos.z - (-6.0));
    const saddleDist = Math.hypot(saddleDx, saddleDz);
    if (saddleDist < 3.0) {
      throw new Error(`Concrete saddle pier clearance insufficient: ${saddleDist.toFixed(2)}m`);
    }

    // 3. Collision displacement check at spawn
    const resolved = env.resolveCollision(spawnPos.clone(), catRadius);
    if (resolved.distanceTo(spawnPos) > 1e-5) {
      throw new Error(`Spawn position experienced non-zero collision displacement: ${resolved.distanceTo(spawnPos)}`);
    }
  }

  private static testBoardwalkWallCollisionAndRampElevation() {
    const env = new ShipyardEnvironment();
    const catRadius = 0.35;

    // 1. Wall Collision at X = 45.0 (outside ramp zone, e.g. at Z = 0.0)
    const startPos = new THREE.Vector3(43.5, 0.0, 0.0);
    const moveTarget = new THREE.Vector3(47.0, 0.0, 0.0);
    const resolved = env.resolveCollision(moveTarget, catRadius, startPos);
    if (resolved.x > 45.0 - catRadius + 1e-4) {
      throw new Error(`Pier boardwalk wall at X=45.0 permitted penetration: resolved.x = ${resolved.x.toFixed(3)} (max ${(45.0 - catRadius).toFixed(3)})`);
    }

    // 2. Boarding Ramp Elevation (Z = 20.0, X: 37.5 to 46.0)
    let curX = 37.5;
    let prevY = 0.0;
    while (curX <= 46.0) {
      const floor = env.getPlatformFloor(curX, 20.0, prevY);
      if (floor < prevY - 1e-4) {
        throw new Error(`Ramp elevation drop detected at X=${curX.toFixed(2)}: Y=${floor.toFixed(3)} < prevY=${prevY.toFixed(3)}`);
      }
      prevY = floor;
      curX += 0.2;
    }
    if (Math.abs(prevY - 1.4) > 0.01) {
      throw new Error(`Ramp did not achieve full 1.4m boardwalk elevation: final Y = ${prevY.toFixed(3)}m`);
    }

    // 3. Elevated Locomotion on Boardwalk surface at Y = 1.4m
    const elevatedFloor = env.getPlatformFloor(48.0, 0.0, 1.4);
    if (Math.abs(elevatedFloor - 1.4) > 0.01) {
      throw new Error(`Elevated boardwalk floor at X=48.0, Y=1.4 returned invalid height: ${elevatedFloor}`);
    }
  }

  private static testSprintPounceGlitchEliminationAndZeroFreeze() {
    const env = new ShipyardEnvironment();
    const cat = new CatCharacter();
    const vitals = new CatVitals(100, 100);
    const prog = new ProgressionSystem();
    prog.setLevel(6);
    prog.unlockPerk('SPRING_PAWS');
    prog.unlockPerk('CLAW_FLURRY');

    const dt = 1 / 60;
    const catPos = new THREE.Vector3(-10.0, 0.0, -20.0);
    const catVelocity = new THREE.Vector3(0, 0, 0);
    let isGrounded = true;
    let isPouncing = false;
    let pounceTimer = 0.0;
    let currentSpeed = 0.0;
    let heading = 0.0;

    // 1. High-Speed Sprint Test (9.2 m/s)
    const targetSprint = 9.2 * prog.sprintMultiplier;
    for (let i = 0; i < 60; i++) {
      const diff = targetSprint - currentSpeed;
      currentSpeed += Math.sign(diff) * Math.min(Math.abs(diff), 24.0 * dt);
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      catPos.addScaledVector(forward, currentSpeed * dt);
      cat.animate(dt, currentSpeed, isGrounded, 0);
    }
    if (Math.abs(currentSpeed - targetSprint) > 0.1) {
      throw new Error(`Sprint speed failed to reach 9.2 m/s target: got ${currentSpeed.toFixed(2)} m/s`);
    }

    // 2. Trajectory Pounce Leap Test
    const preyPos = new THREE.Vector3(-10.0, 0.0, -15.0); // 5m distance
    const dist = catPos.distanceTo(preyPos);
    const flightTime = Math.max(0.28, Math.min(0.55, dist / 11.5));
    const gravity = 18.0;
    const dy = preyPos.y - catPos.y;
    const initialVy = (dy + 0.5 * gravity * flightTime * flightTime) / flightTime;
    const horizSpeed = dist / flightTime;
    const dirZ = (preyPos.z - catPos.z) / dist;

    catVelocity.set(0, initialVy, dirZ * horizSpeed);
    isPouncing = true;
    isGrounded = false;
    cat.isPouncing = true;
    pounceTimer = flightTime;

    while (pounceTimer > 0) {
      const step = Math.min(dt, pounceTimer);
      catVelocity.y -= gravity * step;
      catPos.addScaledVector(catVelocity, step);
      pounceTimer -= step;
      const floorY = env.getPlatformFloor(catPos.x, catPos.z, catPos.y);
      if (catPos.y <= floorY || pounceTimer <= 0) {
        catPos.y = floorY;
        catVelocity.set(0, 0, 0);
        isGrounded = true;
        isPouncing = false;
        cat.isPouncing = false;
        pounceTimer = 0;
        break;
      }
    }

    if (!isGrounded || isPouncing || cat.isPouncing || pounceTimer > 0) {
      throw new Error('Trajectory pounce landing failed to cleanly restore grounded state');
    }

    // 3. Free Pounce Leap Test
    catVelocity.set(0, 5.5, 10.5);
    isPouncing = true;
    isGrounded = false;
    cat.isPouncing = true;
    pounceTimer = 0.45;

    while (pounceTimer > 0) {
      const step = Math.min(dt, pounceTimer);
      catVelocity.y -= gravity * step;
      catPos.addScaledVector(catVelocity, step);
      pounceTimer -= step;
      const floorY = env.getPlatformFloor(catPos.x, catPos.z, catPos.y);
      if (catPos.y <= floorY || pounceTimer <= 0) {
        catPos.y = floorY;
        catVelocity.set(0, 0, 0);
        isGrounded = true;
        isPouncing = false;
        cat.isPouncing = false;
        pounceTimer = 0;
        break;
      }
    }

    if (!isGrounded || isPouncing) {
      throw new Error('Free pounce landing failed to cleanly restore grounded state');
    }

    // 4. Combat Claw Swipe & Zero Hit-Stop Test
    cat.triggerSwipe(false);
    cat.animate(dt, 2.0, true, 0);
    if (cat.attackTimer <= 0 || !Number.isFinite(cat.attackTimer)) {
      throw new Error('Claw swipe attack animation failed to activate');
    }

    // 5. Camera LookAt Tracking Smoothness Test (Frame-by-Frame Tracking)
    const currentLookAt = new THREE.Vector3(catPos.x, catPos.y + 0.45, catPos.z);
    for (let c = 0; c < 30; c++) {
      // Cat moves frame-by-frame at sprint speed 9.2 m/s
      catPos.z += 9.2 * dt;
      const rawTarget = new THREE.Vector3(catPos.x, catPos.y + 0.45, catPos.z);
      const prev = currentLookAt.clone();
      currentLookAt.lerp(rawTarget, 1.0 - Math.exp(-16.0 * dt));
      const lookDelta = currentLookAt.distanceTo(prev);
      if (!Number.isFinite(currentLookAt.x) || lookDelta > 0.5) {
        throw new Error(`Camera lookAt tracking discontinuity detected: delta=${lookDelta}`);
      }
    }
  }

  private static testEnhancedVisualArchitectureAndShipbuilders() {
    // 1. Welder entity mesh hierarchy validation
    const welderDialogues = [
      { speaker: 'Mo Kelly', department: 'Dept. 11 Welding', trade: 'WELDER' as const, text: 'Keep old Dorothy running!' }
    ];
    const welder = new ShipbuilderEntity('Mo Kelly', 'Dept. 11', 'WELDER', new THREE.Vector3(-18, 0, -18), 0, welderDialogues);
    if (!welder.mesh || welder.mesh.children.length === 0) {
      throw new Error('Welder entity mesh hierarchy is uninitialized');
    }

    let hasBoots = false;
    let hasVest = false;
    let hasHead = false;
    let hasHelmet = false;
    let hasTorch = false;
    let hasSparkLight = false;

    welder.mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

        if (mesh.geometry instanceof THREE.BoxGeometry && (mesh.position.y < -0.3 || (mat instanceof THREE.MeshStandardMaterial && mat.color.getHex() === 0x27272a))) {
          hasBoots = true;
        }
        if (mesh.geometry instanceof THREE.CylinderGeometry && Math.abs((mesh.geometry as THREE.CylinderGeometry).parameters.height - 0.58) < 0.05) {
          hasVest = true;
        }
        if (mesh.geometry instanceof THREE.SphereGeometry && Math.abs((mesh.geometry as THREE.SphereGeometry).parameters.radius - 0.18) < 0.05) {
          hasHead = true;
        }
        if (mesh.geometry instanceof THREE.CylinderGeometry && Math.abs((mesh.geometry as THREE.CylinderGeometry).parameters.height - 0.36) < 0.05) {
          hasHelmet = true;
        }
        if (mesh.geometry instanceof THREE.CylinderGeometry && Math.abs((mesh.geometry as THREE.CylinderGeometry).parameters.height - 0.32) < 0.05) {
          hasTorch = true;
        }
      }
      if ((obj as THREE.PointLight).isPointLight) hasSparkLight = true;
    });

    if (!hasBoots || !hasVest || !hasHead || !hasHelmet || !hasTorch || !hasSparkLight) {
      throw new Error(`Welder missing key visual components: boots=${hasBoots}, vest=${hasVest}, head=${hasHead}, helmet=${hasHelmet}, torch=${hasTorch}, spark=${hasSparkLight}`);
    }

    // 2. Machine Shop windows & relief signage
    const env = new ShipyardEnvironment();
    env.group.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    let windowFramesCount = 0;
    let reliefSignFound = false;
    let stoneAltarsCount = 0;

    env.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.getWorldPosition(worldPos);
        if (Math.abs(worldPos.x - (-34)) < 0.6 && Math.abs(worldPos.y - 5.5) < 0.6 && mesh.geometry instanceof THREE.BoxGeometry) {
          windowFramesCount++;
        }
        if (Math.abs(worldPos.x - (-33.4)) < 0.3 && Math.abs(worldPos.y - 6.2) < 0.3) {
          reliefSignFound = true;
        }
        if (mesh.geometry instanceof THREE.BoxGeometry) {
          const geo = mesh.geometry as THREE.BoxGeometry;
          if (geo.parameters && Math.abs(geo.parameters.width - 29) < 2.0 && Math.abs(geo.parameters.height - 0.4) < 0.1) {
            stoneAltarsCount++;
          }
        }
      }
    });

    if (windowFramesCount < 3) throw new Error(`Machine Shop arched window frames insufficient: ${windowFramesCount}`);
    if (stoneAltarsCount < 4) throw new Error(`Dry Dock 1 stone altars insufficient: ${stoneAltarsCount}`);

    // 3. Performance & resource teardown
    env.dispose();
    TextureGenerator.disposeAll();
  }

  private static testMezzanineCatwalkAndCrateClimbing() {
    const env = new ShipyardEnvironment();
    env.group.updateMatrixWorld(true);

    // 1. Mezzanine Catwalk Mesh & Platform Verification
    if (!env.mezzanineCatwalk) {
      throw new Error('Mezzanine catwalk mesh is uninitialized');
    }
    const catwalkElev = env.getPlatformFloor(-52.0, -23.0, 3.5);
    if (Math.abs(catwalkElev - 3.5) > 0.01) {
      throw new Error(`Mezzanine catwalk elevation expected 3.5m, got ${catwalkElev}`);
    }

    // 2. Staircase Ascent Verification
    const step0 = env.getPlatformFloor(-36.2, -17.5, 0.1);
    const step5 = env.getPlatformFloor(-36.2, -25.5, 1.8);
    const step10 = env.getPlatformFloor(-36.2, -33.5, 3.5);
    if (step0 !== 0.0 || step5 < 1.5 || Math.abs(step10 - 3.5) > 0.01) {
      throw new Error(`Mezzanine staircase steps misaligned: s0=${step0}, s5=${step5}, s10=${step10}`);
    }

    // 3. Dry Dock 1 & Dry Dock 12 Crate Mantling & Basin Climbing
    const dd1Basin = env.getPlatformFloor(30.0, -32.0, -2.0);
    const dd1Top = env.getPlatformFloor(43.4, -22.5, -0.3);
    const dd12Basin = env.getPlatformFloor(20.0, 45.0, -2.5);
    const dd12Top = env.getPlatformFloor(5.7, 16.5, -0.2);
    if (dd1Basin !== -2.0 || dd1Top !== 0.0 || dd12Basin !== -2.5 || dd12Top !== 0.0) {
      throw new Error(`Dry Dock crate climbing platforms invalid: dd1Basin=${dd1Basin}, dd1Top=${dd1Top}, dd12Basin=${dd12Basin}, dd12Top=${dd12Top}`);
    }

    // 4. Collision Airtightness: Gas Carts, Lathe Bench, Tool Cabinet, Mezzanine Support Column
    const catRadius = 0.35;
    const cartCollision = env.resolveCollision(new THREE.Vector3(-32.0, 0, -23.5), catRadius, new THREE.Vector3(-32.0, 0, -26.0));
    if (cartCollision.distanceTo(new THREE.Vector3(-32.0, 0, -23.5)) < 0.40) {
      throw new Error('Gas cart collision hull penetrated');
    }

    const colCollision = env.resolveCollision(new THREE.Vector3(-48.9, 0, -26.0), catRadius, new THREE.Vector3(-46.0, 0, -26.0));
    if (colCollision.x < -48.6 + catRadius - 1e-4) {
      throw new Error('Mezzanine support column collision penetrated');
    }

    env.dispose();
    TextureGenerator.disposeAll();
  }

  private static testBoxCollisionAndBigBlueIntegrity() {
    const env = new ShipyardEnvironment();
    env.group.updateMatrixWorld(true);
    const catRadius = 0.35;

    // 1. Direct frontal, lateral, and diagonal collision probes into Sarah Jenkins pallet crate (-32, 0.6, -14)
    const jenkinsMin = new THREE.Vector3(-33.2, 0.0, -15.2);
    const jenkinsMax = new THREE.Vector3(-30.8, 1.2, -12.8);

    // North probe
    const jNorth = env.resolveCollision(new THREE.Vector3(-32.0, 0.0, -13.5), catRadius, new THREE.Vector3(-32.0, 0.0, -11.0));
    if (jNorth.z < jenkinsMax.z + catRadius - 1e-4) {
      throw new Error(`Sarah Jenkins crate North breach: resolved Z=${jNorth.z}`);
    }

    // South probe
    const jSouth = env.resolveCollision(new THREE.Vector3(-32.0, 0.0, -14.5), catRadius, new THREE.Vector3(-32.0, 0.0, -17.0));
    if (jSouth.z > jenkinsMin.z - catRadius + 1e-4) {
      throw new Error(`Sarah Jenkins crate South breach: resolved Z=${jSouth.z}`);
    }

    // East probe
    const jEast = env.resolveCollision(new THREE.Vector3(-31.5, 0.0, -14.0), catRadius, new THREE.Vector3(-29.0, 0.0, -14.0));
    if (jEast.x < jenkinsMax.x + catRadius - 1e-4) {
      throw new Error(`Sarah Jenkins crate East breach: resolved X=${jEast.x}`);
    }

    // West probe
    const jWest = env.resolveCollision(new THREE.Vector3(-32.5, 0.0, -14.0), catRadius, new THREE.Vector3(-35.0, 0.0, -14.0));
    if (jWest.x > jenkinsMin.x - catRadius + 1e-4) {
      throw new Error(`Sarah Jenkins crate West breach: resolved X=${jWest.x}`);
    }

    // 2. Direct collision probes into South Yard crates (-15, -20) and (-15, -23)
    const sy1North = env.resolveCollision(new THREE.Vector3(-15.0, 0.0, -19.5), catRadius, new THREE.Vector3(-15.0, 0.0, -17.0));
    if (sy1North.z < -19.0 + catRadius - 1e-4) {
      throw new Error(`South Yard Crate 1 North breach: resolved Z=${sy1North.z}`);
    }

    const sy2South = env.resolveCollision(new THREE.Vector3(-15.0, 0.0, -23.5), catRadius, new THREE.Vector3(-15.0, 0.0, -26.0));
    if (sy2South.z > -23.9 - catRadius + 1e-4) {
      throw new Error(`South Yard Crate 2 South breach: resolved Z=${sy2South.z}`);
    }

    // 3. Ground traversal in front of Big Blue gantry (X: -5 to 45, Z: 45 to 65) at Y = 0.0m
    for (let gx = -5.0; gx <= 45.0; gx += 2.0) {
      for (let gz = 45.0; gz <= 65.0; gz += 2.0) {
        const floor = env.getPlatformFloor(gx, gz, 0.0);
        if (!Number.isFinite(floor) || floor < -2.5) {
          throw new Error(`Big Blue gantry ground void drop at (${gx}, ${gz}): Y=${floor}`);
        }
        if ((gx < 5.0 || gx > 35.0) && floor < 0.0) {
          throw new Error(`Big Blue yard apron elevation error at (${gx}, ${gz}): Y=${floor}`);
        }
      }
    }

    // 4. Monotonic crate climbing and clean leap-out in Dry Dock 1 and Dry Dock 12
    const dd1Basin = env.getPlatformFloor(30.0, -32.0, -2.0);
    const dd1Step1 = env.getPlatformFloor(40.6, -22.5, -1.8);
    const dd1Step2 = env.getPlatformFloor(42.0, -22.5, -1.0);
    const dd1Step3 = env.getPlatformFloor(43.4, -22.5, -0.3);
    const dd1Rim = env.getPlatformFloor(46.0, -22.5, 0.0);

    if (dd1Basin !== -2.0 || dd1Step1 !== -1.4 || dd1Step2 !== -0.7 || dd1Step3 !== 0.0 || dd1Rim !== 0.0) {
      throw new Error(`Dry Dock 1 climb sequence mismatch: basin=${dd1Basin}, s1=${dd1Step1}, s2=${dd1Step2}, s3=${dd1Step3}, rim=${dd1Rim}`);
    }

    const dd12Basin = env.getPlatformFloor(12.0, 16.5, -2.5);
    const dd12Step1 = env.getPlatformFloor(9.9, 16.5, -2.5);
    const dd12Step2 = env.getPlatformFloor(8.5, 16.5, -1.8);
    const dd12Step3 = env.getPlatformFloor(7.1, 16.5, -1.0);
    const dd12Step4 = env.getPlatformFloor(5.7, 16.5, -0.4);
    const dd12Rim = env.getPlatformFloor(3.0, 16.5, 0.0);

    if (dd12Basin !== -2.5 || dd12Step1 !== -1.9 || dd12Step2 !== -1.3 || dd12Step3 !== -0.65 || dd12Step4 !== 0.0 || dd12Rim !== 0.0) {
      throw new Error(`Dry Dock 12 climb sequence mismatch: basin=${dd12Basin}, s1=${dd12Step1}, s2=${dd12Step2}, s3=${dd12Step3}, s4=${dd12Step4}, rim=${dd12Rim}`);
    }

    env.dispose();
    TextureGenerator.disposeAll();
  }

  private static test1500TickDeepDiveFrameFreezeAndDeadlockElimination() {
    const env = new ShipyardEnvironment();
    env.group.updateMatrixWorld(true);
    const cat = new CatCharacter();
    const dt = 1 / 60;
    const catRadius = 0.35;

    // Test multi-elevation airborne jump action states across 5 key elevations:
    // 1. Ground level (Y = 0.0m)
    // 2. Mezzanine Catwalk (Y = 3.5m)
    // 3. Historic Dry Dock 1 (Y = -2.0m)
    // 4. Dry Dock 12 Deep Basin (Y = -2.5m)
    // 5. Pier Boardwalk (Y = 1.4m)
    const elevationsToTest = [
      { name: 'Ground Level', x: 0.0, z: 0.0, expectedFloor: 0.0 },
      { name: 'Mezzanine Catwalk', x: -52.0, z: -23.0, expectedFloor: 3.5 },
      { name: 'Historic Dry Dock 1 Basin', x: 28.0, z: -27.5, expectedFloor: -2.0 },
      { name: 'Dry Dock 12 Deep Basin', x: 20.0, z: 45.0, expectedFloor: -2.5 },
      { name: 'Pier Boardwalk', x: 50.0, z: 0.0, expectedFloor: 1.4 }
    ];

    for (const elev of elevationsToTest) {
      const floor = env.getPlatformFloor(elev.x, elev.z, elev.expectedFloor);
      if (Math.abs(floor - elev.expectedFloor) > 0.01) {
        throw new Error(`Elevation probe mismatch for ${elev.name}: expected ${elev.expectedFloor}, got ${floor}`);
      }

      // Simulate jump at this elevation
      cat.mesh.position.set(elev.x, elev.expectedFloor + 0.5, elev.z);
      cat.animate(dt, 0.0, false, 0); // isGrounded = false

      if (cat.getCurrentActionName() !== 'jump') {
        throw new Error(`Airborne jump state machine failed for ${elev.name} (Y=${cat.mesh.position.y}): current action is '${cat.getCurrentActionName()}' (expected 'jump')`);
      }

      const action = cat.getCurrentAction();
      if (!action || !action.isRunning() || action.getEffectiveWeight() <= 0) {
        throw new Error(`Airborne jump animation action not running or zero-weighted for ${elev.name}`);
      }

      // Land cat
      cat.mesh.position.set(elev.x, elev.expectedFloor, elev.z);
      cat.animate(0.2, 0.0, true, 0); // isGrounded = true (0.2s satisfies minimum 150ms dwell time)
      if (cat.getCurrentActionName() !== 'stand') {
        throw new Error(`Grounded landing recovery failed for ${elev.name}: current action is '${cat.getCurrentActionName()}' (expected 'stand')`);
      }
    }

    env.dispose();
    TextureGenerator.disposeAll();
  }

  private static testEngineFlightRecorderAndStallDetection() {
    const res = runFlightRecorderTests();
    if (!res.passed) {
      throw new Error(res.error || 'Flight recorder unit test failed');
    }
  }

}

