```typescript
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
import { EventBus } from '../core/EventBus';
import { EngineFlightRecorder } from '../core/EngineFlightRecorder';
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
      { name: 'Unit: Initial Spawn Clearance & Historic Tugboat Dorothy Isolation (≥ 3.0m clearance)', cat: 'UNIT' as const, fn: TestRunner.testInitialSpawnClearanceAndDorothyIsolation },
      { name: 'Unit: Pier Boardwalk Wall Collision & Boarding Ramp Traversal Elevation (Y=0.0m to Y=1.4m)', cat: 'UNIT' as const, fn: TestRunner.testBoardwalkWallCollisionAndRampElevation },
      { name: 'Unit: Sprint & Pounce Glitch Elimination & Zero-Freeze Benchmark', cat: 'UNIT' as const, fn: TestRunner.testSprintPounceGlitchEliminationAndZeroFreeze },
      { name: 'Unit: Enhanced Visual Architecture & Stylized Welder Entity Integrity', cat: 'UNIT' as const, fn: TestRunner.testEnhancedVisualArchitectureAndShipbuilders },
      { name: 'Unit: Mezzanine Catwalk, Dry Dock Crate Climbing & Collision Airtightness Integrity', cat: 'UNIT' as const, fn: TestRunner.testMezzanineCatwalkAndCrateClimbing },
      { name: 'Unit: Box Collision Airtightness & Big Blue Ground Integrity Verification', cat: 'UNIT' as const, fn: TestRunner.testBoxCollisionAndBigBlueIntegrity },
      { name: 'Unit: 1,500-Tick Deep Dive Frame Freeze & State Machine Deadlock Elimination', cat: 'UNIT' as const, fn: TestRunner.test1500TickDeepDiveFrameFreezeAndDeadlockElimination },
      { name: 'Unit: Engine Flight Recorder Telemetry Buffer & Stall Spike Trapper', cat: 'UNIT' as const, fn: TestRunner.testEngineFlightRecorderAndStallDetection },
      { name: 'Unit: EventBus Zero-Allocation Pub/Sub & Ring Buffer Throughput', cat: 'UNIT' as const, fn: TestRunner.testEventBusZeroAllocationThroughput },
      { name: 'Unit: Swept-Capsule Continuous Collision & Corner Slide Tangents', cat: 'UNIT' as const, fn: TestRunner.testSweptCapsuleCollisionAndCornerTangents },
      { name: 'Unit: Complete Subsystem Teardown, Listener Cleanup & Resource Disposal', cat: 'UNIT' as const, fn: TestRunner.testSubsystemTeardownAndResourceDisposal },
      { name: 'Unit: Kingpin Boss Active Attack Requirement & Contact Damage Feedback', cat: 'UNIT' as const, fn: TestRunner.testKingpinBossActiveAttackAndContactDamage },
      { name: 'Unit: Tiered Crate Mantling & Flush SMOF Ground Elevation Verification', cat: 'UNIT' as const, fn: TestRunner.testTieredCrateMantlingAndSMOFFloorAlignment },
      { name: 'Unit: Industrial Expansion & Visual Integrity (Crane Rails, Buildings, CVN-80, Clipping)', cat: 'UNIT' as const, fn: TestRunner.testIndustrialExpansionAndVisualIntegrity },

      // INTEGRATION TESTS
      { name: 'Integration: Rat Stealth Stalking, Pounce Catch & Accidental Assistance', cat: 'INTEGRATION' as const, fn: TestRunner.testRatHuntingAndAssistanceIntegration },
      { name: 'Integration: RCOH Nuclear Radiation Hotspot Proximity Loop', cat: 'INTEGRATION' as const, fn: TestRunner.testRadiationProximityIntegration },
      { name: 'Integration: Full Mission 1 Completion Unlocks Mission 2', cat: 'INTEGRATION' as const, fn: TestRunner.testFullMission1Lifecycle },
      { name: 'Integration: Mutant Insurgent Combat & Colony NPC Sanctuary Care', cat: 'INTEGRATION' as const, fn: TestRunner.testMutantCombatAndColonyIntegration },
      { name: 'Integration: Active Shipbuilder Tradesmen & Solid Wall Collision Resolver', cat: 'INTEGRATION' as const, fn: TestRunner.testShipbuildersAndCollisionIntegration },
      { name: 'Integration: 3D Asset Loading Fallbacks & Feline Entity Scene Integrity', cat: 'INTEGRATION' as const, fn: TestRunner.testAssetLoadingAndSceneIntegrity },
      { name: 'Integration: Shipyard Feeding Bowls Registration & Sanctuary Nutrition', cat: 'INTEGRATION' as const, fn: TestRunner.testFoodBowlsAndSanctuaryIntegration },

      // PLAYTEST SIMULATION SUITE (21 COMPLETE GAMEPLAY SESSIONS)
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
      { name: 'Playtest Session R: AI-Out-of-Substep Spiral Elimination & Water Vertex CPU Stall Elimination', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionR_AISubstepSpiralAndWaterStallElimination() },
      { name: 'Playtest Session S: Event Bus Throughput & Zero-Drop Stress Benchmark (10,000 events/sec with zero allocations)', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionS_EventBusThroughputAndZeroDropStress() },
      { name: 'Playtest Session T: Swept-Capsule Collision & Ledge Mantling Boundary Integrity (smooth corner sliding, monotonic step-ups)', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionT_SweptCapsuleCollisionAndLedgeMantlingIntegrity() },
      { name: 'Playtest Session U: Zero-GC Memory Allocation & Subsystem Teardown Verification (asserts 100% clean resource disposal and zero memory leaks)', cat: 'PLAYTEST' as const, fn: () => PlaytestHarness.runSessionU_ZeroGCMemoryAllocationAndSubsystemTeardown() }
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
    if ((prog.level as number) !== 4 ||