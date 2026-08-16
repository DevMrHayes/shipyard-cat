export interface MissionObjective {
  id: string;
  description: string;
  isCompleted: boolean;
  requiredCount?: number;
  currentCount?: number;
}

export interface Mission {
  id: number;
  title: string;
  subtitle: string;
  location: string;
  briefing: string;
  dialogueSpeaker: string;
  dialogueText: string;
  objectives: MissionObjective[];
  isUnlocked: boolean;
  isCompleted: boolean;
  assistIdReward?: string;
}

export class MissionManager {
  private missions: Mission[] = [
    {
      id: 1,
      title: "The Rigger's Whistle",
      subtitle: "South Yard & Historic Dorothy Tugboat",
      location: "Washington Ave & Pier 3 Staging Yard",
      briefing: "A giant wharf rat named the 'Dockyard Kingpin' is gnawing on electrical harnesses inside the 1891 Tugboat Dorothy. Stalk through the brick machine shop alleys, practice climbing crates, and hunt it down to help the welders.",
      dialogueSpeaker: "Mo Kelly (Welder, Dept. 11)",
      dialogueText: "Morning, Alba! Eat up that tuna. Keep an eye on the old Dorothy for me—riggers say something big is chewing up the winch harnesses again.",
      isUnlocked: true,
      isCompleted: false,
      assistIdReward: "DOROTHY_CAPSTAN_UNJAM",
      objectives: [
        { id: "hunt_mice", description: "Hunt 2 shipyard mice near the rail spurs for stamina", isCompleted: false, requiredCount: 2, currentCount: 0 },
        { id: "climb_dorothy", description: "Jump and climb the wooden crates onto Tugboat Dorothy's deck", isCompleted: false },
        { id: "hunt_kingpin", description: "Pounce and defeat the 'Dockyard Kingpin' inside the capstan housing", isCompleted: false }
      ]
    },
    {
      id: 2,
      title: "Tide Rising in Dry Dock 12",
      subtitle: "The Flooding Sluice Gate Escape",
      location: "Dry Dock 12 Basin (CVN Carrier Dock)",
      briefing: "Gantry's insurgents sabotaged the emergency sluice gate! The James River is rushing into Dry Dock 12. Jump across floating wooden pallets, steel bulkheads, and scaffolding catwalks to escape before the basin completely submerges.",
      dialogueSpeaker: "Tripod Toby (Colony Veteran Cat)",
      dialogueText: "Listen to that roaring water, Alba! The basin's filling up fast! Keep your paws dry—hop across the floating pallets and climb the staging ladders!",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CRANE_SAFETY_TRIP",
      objectives: [
        { id: "reach_drydock", description: "Navigate to the rim of Dry Dock 12", isCompleted: false },
        { id: "jump_pallets", description: "Leap across 3 floating wooden pallets as river water rises", isCompleted: false, requiredCount: 3, currentCount: 0 },
        { id: "escape_flood", description: "Climb the yellow scaffolding ladder to safety", isCompleted: false }
      ]
    },
    {
      id: 3,
      title: "Mutants in the Machine Shop",
      subtitle: "First Confrontation with Gantry",
      location: "Machine Shop No. 1 & Scrap Staging Yard",
      briefing: "Investigate severed fiber optic cables in Machine Shop No. 1. Encounter Gantry's mutant scout cats, execute claw swipe combos to defend the machinery, and come face-to-face with the monstrous 24-pound kingpin cat Gantry himself!",
      dialogueSpeaker: "Dr. Elena Vance (EH&S Animal Management)",
      dialogueText: "Alba, look at these bite marks—they aren't from normal rats. Those are six-toed mutant cat claws. Gantry's pack is moving on the machine shop.",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CONDUIT_PULL_STRING",
      objectives: [
        { id: "defeat_mutants", description: "Defeat 2 mutant scout cats using paw swipe combos", isCompleted: false, requiredCount: 2, currentCount: 0 },
        { id: "identify_radioactivity", description: "Use Whiskers Vision to spot the radioactive trail", isCompleted: false },
        { id: "confront_gantry", description: "Survive the initial clash with Gantry in the scrap yard", isCompleted: false }
      ]
    },
    {
      id: 4,
      title: "Shadows in the Shielding",
      subtitle: "RCOH Radiological Overhaul Vault",
      location: "Decommissioned Nuclear Core Containment Zone",
      briefing: "Deep within the lead-shielded RCOH zone, Lieutenant Cobalt is weaponizing spent radioactive isotopes. Use advanced Whiskers Vision to dodge radiation spikes, expose the coolant leak, and shut down their power source.",
      dialogueSpeaker: "Calico Belle (Sanctuary Guard)",
      dialogueText: "Watch your collar dosimeter, little one. The lead tent hides Gantry's most dangerous lieutenant. If you smell ozone, drop low and sneak.",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "RCOH_COOLANT_SENSOR",
      objectives: [
        { id: "activate_whiskers", description: "Engage Whiskers Vision to track radioactive conduit traces", isCompleted: false },
        { id: "dodge_rad_spikes", description: "Cross the containment vault keeping radiation below 5.0 mSv", isCompleted: false },
        { id: "defeat_lieutenant", description: "Defeat Lieutenant Cobalt and trip the coolant emergency valve", isCompleted: false }
      ]
    },
    {
      id: 5,
      title: "Siege of the Cat Motel & Carrier Launch",
      subtitle: "The Final Showdown for Newport News",
      location: "Cat Motel Sanctuary & Big Blue Gantry Catwalk",
      briefing: "Gantry launches his master assault to destroy the Cat Motel clinic and sever the CVN carrier christening cable. Defend the kitten nursery, rally your colony allies, and defeat Gantry atop the 1,050-ton gantry crane!",
      dialogueSpeaker: "Dr. Elena Vance (EH&S Animal Management)",
      dialogueText: "Alba! Gantry's pack has surrounded the clinic! Hold the front porch until the security team arrives, then chase Gantry to the crane!",
      isUnlocked: false,
      isCompleted: false,
      objectives: [
        { id: "defend_motel", description: "Defeat 4 mutant invaders attacking the Cat Motel sanctuary", isCompleted: false, requiredCount: 4, currentCount: 0 },
        { id: "save_kittens", description: "Check on the cardboard condo nursery inside the clinic", isCompleted: false },
        { id: "defeat_gantry", description: "Defeat Gantry atop Big Blue Gantry crane to save the carrier", isCompleted: false }
      ]
    }
  ];

  private currentMissionIndex: number = 0;

  public getCurrentMission(): Mission {
    return this.missions[this.currentMissionIndex];
  }

  public getMissions(): Mission[] {
    return this.missions;
  }

  public updateCountObjective(objectiveId: string, delta: number = 1): boolean {
    const current = this.getCurrentMission();
    const obj = current.objectives.find(o => o.id === objectiveId);
    if (obj && !obj.isCompleted && obj.requiredCount) {
      obj.currentCount = Math.min(obj.requiredCount, (obj.currentCount || 0) + delta);
      if (obj.currentCount >= obj.requiredCount) {
        obj.isCompleted = true;
      }
      this.checkMissionCompletion();
      return true;
    }
    return false;
  }

  public completeObjective(objectiveId: string): boolean {
    const current = this.getCurrentMission();
    const obj = current.objectives.find(o => o.id === objectiveId);
    if (obj && !obj.isCompleted) {
      obj.isCompleted = true;
      if (obj.requiredCount) {
        obj.currentCount = obj.requiredCount;
      }
      this.checkMissionCompletion();
      return true;
    }
    return false;
  }

  public checkMissionCompletion(): boolean {
    const current = this.getCurrentMission();
    const allDone = current.objectives.every(o => o.isCompleted);
    if (allDone && !current.isCompleted) {
      current.isCompleted = true;
      // Unlock next mission
      if (this.currentMissionIndex + 1 < this.missions.length) {
        this.missions[this.currentMissionIndex + 1].isUnlocked = true;
      }
      return true;
    }
    return false;
  }

  public selectMission(missionId: number): boolean {
    const idx = this.missions.findIndex(m => m.id === missionId);
    if (idx !== -1 && this.missions[idx].isUnlocked) {
      this.currentMissionIndex = idx;
      return true;
    }
    return false;
  }
}
