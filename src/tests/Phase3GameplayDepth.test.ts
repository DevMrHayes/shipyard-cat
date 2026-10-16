import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InteriorSpacesBuilder, InteriorSpaceDefinition } from '../game/InteriorSpacesBuilder';
import { ShipyardEnvironment } from '../game/ShipyardEnvironment';
import { MissionManager, Mission } from '../core/MissionManager';
import { GameEngine } from '../game/GameEngine';
import { MutantCatEntity, MutantCatArchetype } from '../game/MutantCatEntity';

describe('Phase 3: World Interactivity & Gameplay Depth', () => {
  describe('1. Interactive Interior Spaces (JMAF & The Apprentice School)', () => {
    let scene: THREE.Scene;
    let environment: ShipyardEnvironment;
    let interiorBuilder: InteriorSpacesBuilder;

    beforeEach(() => {
      scene = new THREE.Scene();
      environment = new ShipyardEnvironment(scene);
      interiorBuilder = new InteriorSpacesBuilder(scene);
    });

    it('should build interactive interior spaces for JMAF and The Apprentice School with designated coordinates', () => {
      const interiors: InteriorSpaceDefinition[] = interiorBuilder.buildStandardShipyardInteriors();
      
      expect(interiors.length).toBeGreaterThanOrEqual(2);

      const jmaf = interiors.find(i => i.id === 'interior_jmaf');
      expect(jmaf).toBeDefined();
      expect(jmaf!.doorwayPortal.position.x).toBeCloseTo(-52, 1);
      expect(jmaf!.doorwayPortal.position.z).toBeCloseTo(-5, 1);
      expect(jmaf!.walkablePad).toBeDefined();
      expect(jmaf!.workbenches.length).toBeGreaterThan(0);
      expect(jmaf!.collectibleLoreHooks.length).toBeGreaterThan(0);
      expect(jmaf!.interiorLights.some(light => (light as THREE.PointLight).color.getHex() === 0xffd199 || (light as THREE.PointLight).color.getHex() === 0xffaa55)).toBe(true);

      const apprentice = interiors.find(i => i.id === 'interior_apprentice_school');
      expect(apprentice).toBeDefined();
      expect(apprentice!.doorwayPortal.position.x).toBeCloseTo(-54, 1);
      expect(apprentice!.doorwayPortal.position.z).toBeCloseTo(-50, 1);
      expect(apprentice!.walkablePad).toBeDefined();
      expect(apprentice!.workbenches.length).toBeGreaterThan(0);
      expect(apprentice!.collectibleLoreHooks.length).toBeGreaterThan(0);
    });

    it('should register walkable interior pads and door portals into ShipyardEnvironment collision and trigger sets', () => {
      environment.initializeInteriors();
      const interiorPortals = environment.getInteriorPortals();
      const interiorPads = environment.getInteriorWalkablePads();
      const loreHooks = environment.getInteriorLoreHooks();

      expect(interiorPortals.length).toBeGreaterThanOrEqual(2);
      expect(interiorPads.length).toBeGreaterThanOrEqual(2);
      expect(loreHooks.length).toBeGreaterThanOrEqual(2);

      const jmafPortal = interiorPortals.find(p => p.id === 'interior_jmaf');
      expect(jmafPortal).toBeDefined();
      expect(jmafPortal!.portalBounds.containsPoint(new THREE.Vector3(-52, 0.5, -5))).toBe(true);
    });
  });

  describe('2. Carrier & Submarine Mission Objectives & Shift Bonuses', () => {
    let missionManager: MissionManager;
    let gameEngine: GameEngine;

    beforeEach(() => {
      missionManager = new MissionManager();
      gameEngine = new GameEngine();
    });

    it('should provide elevated naval vessel missions targeting CVN-80 Flight Deck and SMOF Upper Catwalk', () => {
      const carrierMission = missionManager.getMissionById('mission_cvn80_flight_deck_recon');
      expect(carrierMission).toBeDefined();
      expect(carrierMission!.targetLocation.x).toBeCloseTo(20, 1);
      expect(carrierMission!.targetLocation.y).toBeCloseTo(3.25, 2);
      expect(carrierMission!.targetLocation.z).toBeCloseTo(44, 1);

      const subMission = missionManager.getMissionById('mission_smof_catwalk_inspection');
      expect(subMission).toBeDefined();
      expect(subMission!.targetLocation.x).toBeCloseTo(-30, 1);
      expect(subMission!.targetLocation.y).toBeCloseTo(4.50, 2);
      expect(subMission!.targetLocation.z).toBeCloseTo(45, 1);
    });

    it('should compute shift-aware completion bonuses correctly based on current shipyard shift', () => {
      // Shift 1: Day (Standard), Shift 2: Swing/Twilight (1.25x), Shift 3: Graveyard/Night (1.5x)
      missionManager.setCurrentShift('graveyard');
      const baseReward = 1000;
      const calculatedReward = missionManager.calculateShiftBonus('mission_cvn80_flight_deck_recon', baseReward);
      expect(calculatedReward).toBe(1500);

      missionManager.setCurrentShift('swing');
      const swingReward = missionManager.calculateShiftBonus('mission_smof_catwalk_inspection', baseReward);
      expect(swingReward).toBe(1250);

      missionManager.setCurrentShift('day');
      const dayReward = missionManager.calculateShiftBonus('mission_smof_catwalk_inspection', baseReward);
      expect(dayReward).toBe(1000);
    });

    it('should activate interactive objective triggers when player reaches naval vessel elevations in GameEngine', () => {
      gameEngine.initializeNavalMissions();
      
      // Player climbs to CVN-80 flight deck
      gameEngine.updatePlayerPosition(new THREE.Vector3(20, 3.25, 44));
      const flightDeckStatus = gameEngine.checkNavalObjectiveTrigger('mission_cvn80_flight_deck_recon');
      expect(flightDeckStatus.triggered).toBe(true);

      // Player navigates to SMOF Submarine Crossover Bridge
      gameEngine.updatePlayerPosition(new THREE.Vector3(-30, 4.50, 45));
      const catwalkStatus = gameEngine.checkNavalObjectiveTrigger('mission_smof_catwalk_inspection');
      expect(catwalkStatus.triggered).toBe(true);
    });
  });

  describe('3. Distinct Mutant Cat Archetype Behaviors & Mechanics', () => {
    let scoutFang: MutantCatEntity;
    let prowlerAlpha: MutantCatEntity;
    let enforcerMezzanine: MutantCatEntity;
    let lieutenantCobalt: MutantCatEntity;

    beforeEach(() => {
      scoutFang = new MutantCatEntity({
        id: 'cat_scout_01',
        archetype: MutantCatArchetype.ScoutFang,
        spawnPosition: new THREE.Vector3(0, 0, 0)
      });

      prowlerAlpha = new MutantCatEntity({
        id: 'cat_prowler_01',
        archetype: MutantCatArchetype.ProwlerAlpha,
        spawnPosition: new THREE.Vector3(10, 0, 10)
      });

      enforcerMezzanine = new MutantCatEntity({
        id: 'cat_enforcer_01',
        archetype: MutantCatArchetype.EnforcerMezzanine,
        spawnPosition: new THREE.Vector3(-15, 0, 15)
      });

      lieutenantCobalt = new MutantCatEntity({
        id: 'cat_boss_cobalt',
        archetype: MutantCatArchetype.LieutenantCobalt,
        spawnPosition: new THREE.Vector3(25, 3.25, 40)
      });
    });

    it('should execute fast ambush dash with visual tell for Mutant Scout Fang', () => {
      const targetPos = new THREE.Vector3(0, 0, 8);
      scoutFang.updateAI(1.0, targetPos);
      
      const profile = scoutFang.getCombatProfile();
      expect(profile.archetype).toBe(MutantCatArchetype.ScoutFang);
      expect(profile.speedMultiplier).toBeGreaterThanOrEqual(1.5);
      expect(profile.isDashing).toBe(true);
      expect(profile.visualTell).toBe('amber_stalker_flare');
    });

    it('should maintain wide perimeter stalking trajectory for Mutant Prowler Alpha', () => {
      const targetPos = new THREE.Vector3(10, 0, 0);
      prowlerAlpha.updateAI(0.5, targetPos);
      
      const profile = prowlerAlpha.getCombatProfile();
      expect(profile.archetype).toBe(MutantCatArchetype.ProwlerAlpha);
      expect(profile.combatState).toBe('flanking_perimeter');
      expect(profile.stalkRadius).toBeGreaterThan(12);
    });

    it('should deliver heavy knockback strike for Mutant Enforcer Mezzanine', () => {
      const targetPos = new THREE.Vector3(-15, 0, 16);
      const attackResult = enforcerMezzanine.executeAttack(targetPos);
      
      expect(attackResult.knockbackApplied).toBe(true);
      expect(attackResult.knockbackVector.length()).toBeGreaterThanOrEqual(8.0);
      expect(attackResult.damage).toBeGreaterThan(25);
    });

    it('should emit radiation pulse aura with damage over time for Lieutenant Cobalt', () => {
      const targetNearby = new THREE.Vector3(26, 3.25, 41);
      const pulseResult = lieutenantCobalt.evaluateRadiationPulse(targetNearby);

      expect(pulseResult.isInAura).toBe(true);
      expect(pulseResult.radiationDps).toBeGreaterThanOrEqual(15);
      expect(pulseResult.pulseVfxActive).toBe(true);
      expect(pulseResult.cobaltCoreIntensity).toBeGreaterThan(0.8);
    });
  });
});