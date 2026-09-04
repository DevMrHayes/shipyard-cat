export interface CollectibleItem {
  id: string;
  name: string;
  category: 'RIVET' | 'BADGE' | 'DOROTHY_MEMORABILIA' | 'ISOTOPE_TAG' | 'CONDO_BLUEPRINT';
  position?: { x: number; y: number; z: number };
  isCollected: boolean;
  description: string;
}

export interface MissionObjective {
  id: string;
  description: string;
  isCompleted: boolean;
  requiredCount?: number;
  currentCount?: number;
  targetPosition?: { x: number; y: number; z: number };
  hint?: string;
  zoneName?: string;
  isOptional?: boolean;
  rewardBonusXP?: number;
}

export interface Mission {
  id: number;
  act: 1 | 2 | 3 | 4;
  actTitle: string;
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
  collectibles?: CollectibleItem[];
  miniGameTrigger?: string;
}

export class MissionManager {
  private missions: Mission[] = [
    // ==========================================
    // ACT 1: WHARF RATS & DOROTHY
    // ==========================================
    {
      id: 1,
      act: 1,
      actTitle: "Act 1: Wharf Rats & Dorothy",
      title: "The Rigger's Whistle",
      subtitle: "Historic Dry Dock 1 & Dockyard Kingpin",
      location: "Historic South Yard & Dry Dock 1 Trough",
      briefing: "A notorious wharf rat known as the 'Dockyard Kingpin' has taken refuge down inside Historic Dry Dock 1. Hunt 2 mice near the rail spurs for stamina, head to the river boardwalk, climb down the stacked wooden crates into the sunken dry dock trough, and defeat the Kingpin.",
      dialogueSpeaker: "Mo Kelly (Welder, Dept. 11)",
      dialogueText: "Morning, Alba! Riggers spotted the Dockyard Kingpin down in the Historic Dry Dock 1 trough. Head along the river boardwalk and climb down the wooden crates into the basin!",
      isUnlocked: true,
      isCompleted: false,
      assistIdReward: "DOROTHY_CAPSTAN_UNJAM",
      miniGameTrigger: "RAT_CHASE_RAIL_SPURS",
      collectibles: [
        {
          id: "RIVET_1889_DD1",
          name: "1889 Timber Dry Dock Rivet",
          category: "RIVET",
          position: { x: 30, y: -2.0, z: -25 },
          isCollected: false,
          description: "Forged during the original construction of NNS Dry Dock 1 under founder Collis P. Huntington."
        },
        {
          id: "BADGE_DEPT11_WELD",
          name: "Dept. 11 Welder's Brass Stamp",
          category: "BADGE",
          position: { x: -18, y: 0, z: -18 },
          isCollected: false,
          description: "Mo Kelly's structural welding inspection badge."
        }
      ],
      objectives: [
        {
          id: "hunt_mice",
          description: "Hunt 2 shipyard mice near the rail spurs for stamina",
          isCompleted: false,
          requiredCount: 2,
          currentCount: 0,
          targetPosition: { x: -25, y: 0, z: -15 },
          hint: "Sneak [C/Ctrl] near mice and strike with Paw Swipe [J] or Pounce [F]",
          zoneName: "South Yard Rail Spurs"
        },
        {
          id: "climb_dorothy",
          description: "Go onto the river boardwalk and climb down crates into Dry Dock 1",
          isCompleted: false,
          targetPosition: { x: 41, y: 0.5, z: -22.5 },
          hint: "Walk up the sloped gangway to the boardwalk [X:45], then step down the crates [Y:-2.0m]",
          zoneName: "Historic Dry Dock 1 Rim"
        },
        {
          id: "hunt_kingpin",
          description: "Pounce and defeat the 'Dockyard Kingpin' in Dry Dock 1",
          isCompleted: false,
          targetPosition: { x: 28, y: -2.0, z: -27.5 },
          hint: "Engage the Kingpin inside the trough! Use 3-hit Claw Flurry [J/R] or Pounce [F]",
          zoneName: "Dry Dock 1 Basin Floor"
        }
      ]
    },
    {
      id: 2,
      act: 1,
      actTitle: "Act 1: Wharf Rats & Dorothy",
      title: "Dorothy's Historic Steamline",
      subtitle: "Tugboat Hull No. 1 Restoration & Capstan Assist",
      location: "Tugboat Dorothy Display & Machine Shop No. 1 Yard",
      briefing: "Welders are restoring Tugboat Dorothy (Hull No. 1, built 1891). A tangle of rusted mooring cable has jammed the foredeck capstan winch. Climb aboard Dorothy, clear the vermin nests beneath the wheelhouse, and free the capstan line.",
      dialogueSpeaker: "Mo Kelly (Welder, Dept. 11)",
      dialogueText: "Old Dorothy's been here since 1891, Alba. Show her some love—hop up on the foredeck and clear those wire snarls around the winch!",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "DOROTHY_CAPSTAN_UNJAM",
      miniGameTrigger: "CAPSTAN_WINCH_PUZZLE",
      collectibles: [
        {
          id: "DOROTHY_COMPASS_1891",
          name: "1891 Tugboat Dorothy Brass Compass",
          category: "DOROTHY_MEMORABILIA",
          position: { x: -20, y: 2.2, z: -25 },
          isCollected: false,
          description: "Original navigation compass mounted on Tugboat Dorothy during her maiden voyage."
        }
      ],
      objectives: [
        {
          id: "board_dorothy",
          description: "Climb onto the foredeck of Tugboat Dorothy (Y: +2.2m)",
          isCompleted: false,
          targetPosition: { x: -20, y: 2.2, z: -25 },
          hint: "Leap from the tool chests onto Dorothy's wooden gunwale and foredeck",
          zoneName: "Tugboat Dorothy Foredeck"
        },
        {
          id: "clear_wheelhouse",
          description: "Investigate behind the wheelhouse and clear the cable snarl",
          isCompleted: false,
          targetPosition: { x: -21, y: 2.2, z: -28 },
          hint: "Swipe [J] at the fouled mooring cable to free the capstan drum",
          zoneName: "Dorothy Wheelhouse"
        }
      ]
    },

    // ==========================================
    // ACT 2: GANTRY'S FELINE INSURGENCY & DD12 FLOOD
    // ==========================================
    {
      id: 3,
      act: 2,
      actTitle: "Act 2: Gantry's Feline Insurgency",
      title: "Tide Rising in Dry Dock 12",
      subtitle: "CVN Carrier Keel Flooding & Catwalk Escape",
      location: "Dry Dock 12 Basin (CVN Supercarrier Berth)",
      briefing: "Gantry's insurgents sabotaged the emergency sluice gate! The James River is rushing into Dry Dock 12. Navigate to the rim of Dry Dock 12, leap across floating wooden pallets as water rises, and climb the yellow staging ladder to safety before the basin completely floods.",
      dialogueSpeaker: "Tripod Toby (Colony Veteran Cat)",
      dialogueText: "Listen to that roaring water, Alba! The basin's filling up fast! Keep your paws dry—hop across the floating pallets and climb the staging ladders!",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CRANE_SAFETY_TRIP",
      miniGameTrigger: "FLOOD_PALLET_PARKOUR",
      collectibles: [
        {
          id: "RIVET_CVN_KEEL",
          name: "CVN Supercarrier Keel Plate Rivet",
          category: "RIVET",
          position: { x: 22, y: 1.5, z: 32 },
          isCollected: false,
          description: "High-tensile steel fastener from the nuclear supercarrier modular assembly berth."
        }
      ],
      objectives: [
        {
          id: "reach_drydock",
          description: "Navigate to the rim of Dry Dock 12",
          isCompleted: false,
          targetPosition: { x: 14, y: 0, z: 18 },
          hint: "Head north past the crane staging area towards Big Blue's blue gantry legs",
          zoneName: "Dry Dock 12 South Rim"
        },
        {
          id: "jump_pallets",
          description: "Leap across 3 floating wooden pallets as river water rises",
          isCompleted: false,
          requiredCount: 3,
          currentCount: 0,
          targetPosition: { x: 20, y: 1.5, z: 30 },
          hint: "Time your jumps [Space] across the floating wooden pallets in the flooding basin",
          zoneName: "Flooding Carrier Basin"
        },
        {
          id: "escape_flood",
          description: "Climb the yellow scaffolding staging ladder to safety",
          isCompleted: false,
          targetPosition: { x: 32, y: 3.5, z: 48 },
          hint: "Mantle onto the elevated scaffolding platform on the east wall",
          zoneName: "Big Blue Staging Catwalk"
        }
      ]
    },
    {
      id: 4,
      act: 2,
      actTitle: "Act 2: Gantry's Feline Insurgency",
      title: "Big Blue's High-Wire Superlift",
      subtitle: "200ft Crane Module Lift & Aerial Panorama",
      location: "Goliath Gantry Crane Catwalks (200ft Elevation)",
      briefing: "Big Blue is preparing for a 1,050-ton carrier deckhouse superlift. Climb into the rigger lift basket, ride the hoist to the upper trolley bridge, and trip the emergency brake to prevent a runaway cable snag.",
      dialogueSpeaker: "Frank 'Sarge' Miller (Heavy Rigging Foreman)",
      dialogueText: "Big Blue's hoisting 900 tons of flight deck today, little supervisor! Keep your balance on the catwalk and watch the 480V third rail!",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CRANE_SAFETY_TRIP",
      miniGameTrigger: "CRANE_LIFT_VISTA",
      collectibles: [
        {
          id: "BADGE_RIGGER_GOLD",
          name: "Master Rigger Golden Tag",
          category: "BADGE",
          position: { x: 20, y: 36, z: 25 },
          isCollected: false,
          description: "Foreman Sarge Miller's certified heavy lift rigging inspector badge."
        }
      ],
      objectives: [
        {
          id: "enter_crane_lift",
          description: "Hop into the crane lift staging basket in Dry Dock 12",
          isCompleted: false,
          targetPosition: { x: 18, y: 3.5, z: 35 },
          hint: "Curl up inside the yellow crane lift container to initiate the 200ft ascent",
          zoneName: "Dry Dock 12 Staging Area"
        },
        {
          id: "trip_crane_breaker",
          description: "Mantle onto the upper trolley bridge and trip the emergency safety breaker",
          isCompleted: false,
          targetPosition: { x: 20, y: 36, z: 25 },
          hint: "Walk across the narrow I-beam and swipe [J] the breaker switch",
          zoneName: "Big Blue Trolley Bridge"
        }
      ]
    },

    // ==========================================
    // ACT 3: NUCLEAR SUBMARINE KEEL & LEAD VAULT
    // ==========================================
    {
      id: 5,
      act: 3,
      actTitle: "Act 3: Nuclear Submarine Keel",
      title: "Mutants in the Machine Shop",
      subtitle: "Submarine Nuclear Vault Infiltration",
      location: "Machine Shop No. 1 & Scrap Staging Yard",
      briefing: "Investigate severed fiber optic cables in Machine Shop No. 1. Enter through the roll-up doorway, execute claw swipe combos to defeat Gantry's mutant scout cats, engage Whiskers Vision to scan the radioactive conduit trail, and confront Gantry's vanguard in the staging yard.",
      dialogueSpeaker: "Dr. Elena Vance (EH&S Animal Management)",
      dialogueText: "Alba, look at these bite marks—they aren't from normal rats. Those are six-toed mutant cat claws. Gantry's pack is moving on the machine shop.",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CONDUIT_PULL_STRING",
      miniGameTrigger: "CONDUIT_THREADING_PUZZLE",
      collectibles: [
        {
          id: "RIVET_SUB_BULKHEAD",
          name: "Submarine HY-80 Hull Rivet",
          category: "RIVET",
          position: { x: -30, y: 0, z: 45 },
          isCollected: false,
          description: "High-yield pressure hull fastener from the fast-attack submarine assembly shop."
        }
      ],
      objectives: [
        {
          id: "defeat_mutants",
          description: "Defeat 2 mutant scout cats using paw swipe combos",
          isCompleted: false,
          requiredCount: 2,
          currentCount: 0,
          targetPosition: { x: -34, y: 0, z: -20 },
          hint: "Enter Machine Shop No. 1 and strike mutant cats with Paw Swipes [J] and Tail Sweep [K]",
          zoneName: "Machine Shop No. 1 Interior"
        },
        {
          id: "identify_radioactivity",
          description: "Use Whiskers Vision [Q] to scan the radioactive conduit trail",
          isCompleted: false,
          targetPosition: { x: -30, y: 0, z: 45 },
          hint: "Press [Q] for Whiskers Vision near the Submarine MOF shop to reveal the violet isotopic trace",
          zoneName: "Submarine MOF Yard"
        },
        {
          id: "confront_gantry",
          description: "Survive the clash with Gantry's vanguard in the scrap yard",
          isCompleted: false,
          targetPosition: { x: 38, y: 0, z: -52 },
          hint: "Head to the scrap staging yard near the RCOH vault and defeat Lieutenant Cobalt",
          zoneName: "Scrap Staging Yard"
        }
      ]
    },
    {
      id: 6,
      act: 3,
      actTitle: "Act 3: Nuclear Submarine Keel",
      title: "Shadows in the Shielding",
      subtitle: "RCOH Radiological Overhaul Vault",
      location: "Decommissioned Nuclear Core Containment Zone",
      briefing: "Deep within the lead-shielded RCOH zone, Lieutenant Cobalt is weaponizing spent radioactive isotopes. Use advanced Whiskers Vision to dodge radiation spikes, expose the coolant leak, and shut down their power source.",
      dialogueSpeaker: "Calico Belle (Sanctuary Guard)",
      dialogueText: "Watch your collar dosimeter, little one. The lead tent hides Gantry's most dangerous lieutenant. If you smell ozone, drop low and sneak.",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "RCOH_COOLANT_SENSOR",
      miniGameTrigger: "ISOTOPE_STEALTH_MAZE",
      collectibles: [
        {
          id: "ISOTOPE_TAG_COBALT",
          name: "Decommissioned Co-60 Dosimeter Capsule",
          category: "ISOTOPE_TAG",
          position: { x: 45, y: 0, z: -60 },
          isCollected: false,
          description: "Spent radiological containment badge recovered from the RCOH reactor overhaul vault."
        }
      ],
      objectives: [
        {
          id: "activate_whiskers",
          description: "Engage Whiskers Vision to track radioactive conduit traces",
          isCompleted: false,
          targetPosition: { x: 45, y: 0, z: -60 },
          hint: "Press [Q] to illuminate gamma conduit traces and dosimeter safety corridors",
          zoneName: "RCOH Containment Tent"
        },
        {
          id: "dodge_rad_spikes",
          description: "Cross the containment vault keeping radiation below 5.0 mSv",
          isCompleted: false,
          targetPosition: { x: 45, y: 0, z: -60 },
          hint: "Stay behind lead-shielded barrier blocks and sneak [C/Ctrl] across hotspots",
          zoneName: "Reactor Core Vault"
        },
        {
          id: "defeat_lieutenant",
          description: "Defeat Lieutenant Cobalt and trip the coolant emergency valve",
          isCompleted: false,
          targetPosition: { x: 38, y: 0, z: -52 },
          hint: "Use Tail Sweep [K] to stun Cobalt, then finish with Claw Flurry [J]",
          zoneName: "Coolant Valve Station"
        }
      ]
    },

    // ==========================================
    // ACT 4: 200FT BIG BLUE APEX & CORONATION
    // ==========================================
    {
      id: 7,
      act: 4,
      actTitle: "Act 4: 200ft Big Blue Apex",
      title: "Siege of the Cat Motel Sanctuary",
      subtitle: "Kitten Nursery Rescue & Sanctuary Defense",
      location: "Cat Motel Sanctuary & Clinic Grounds",
      briefing: "Gantry launches his master assault to destroy the Cat Motel clinic and eradicate the feral sanctuary. Stand guard on the clinic porch, defeat the mutant invaders, and check on the orphaned kittens inside the cardboard condos.",
      dialogueSpeaker: "Dr. Elena Vance (EH&S Animal Management)",
      dialogueText: "Alba! Gantry's pack has surrounded the clinic! Hold the front porch until the security team arrives, then chase Gantry to the crane!",
      isUnlocked: false,
      isCompleted: false,
      miniGameTrigger: "CATNIP_OVERCHARGE_SPRINT",
      collectibles: [
        {
          id: "CONDO_BLUEPRINT_DELUXE",
          name: "Insulated Cardboard Condo Blueprint",
          category: "CONDO_BLUEPRINT",
          position: { x: -55, y: 0, z: -60 },
          isCollected: false,
          description: "Dr. Vance's custom winterized feral cat shelter schematic."
        }
      ],
      objectives: [
        {
          id: "defend_motel",
          description: "Defeat 4 mutant invaders attacking the Cat Motel sanctuary",
          isCompleted: false,
          requiredCount: 4,
          currentCount: 0,
          targetPosition: { x: -55, y: 0, z: -65 },
          hint: "Fight off mutant prowlers on the Cat Motel front porch using your full combat arsenal",
          zoneName: "Cat Motel Sanctuary Porch"
        },
        {
          id: "save_kittens",
          description: "Check on the cardboard condo nursery inside the clinic",
          isCompleted: false,
          targetPosition: { x: -55, y: 0, z: -60 },
          hint: "Enter the cardboard condo nests and meow [E] to soothe the orphaned kittens",
          zoneName: "Clinic Nursery"
        }
      ]
    },
    {
      id: 8,
      act: 4,
      actTitle: "Act 4: 200ft Big Blue Apex",
      title: "The Apex Showdown on Big Blue",
      subtitle: "The Master Mouser Coronation & Carrier Save",
      location: "1,050-ton Goliath Crane Catwalks (200ft Elevation)",
      briefing: "Gantry has scaled Big Blue to sever the ceremonial christening launch cables for the new aircraft carrier. Climb the crane hoist elevator, duel Gantry across the 200ft trolley bridge in a sunset storm, and claim your coronation as Master Mouser of Newport News Shipbuilding!",
      dialogueSpeaker: "Tripod Toby & Dr. Elena Vance",
      dialogueText: "This is it, Alba! The entire shipyard is counting on you. Take the fight to the top of Big Blue!",
      isUnlocked: false,
      isCompleted: false,
      assistIdReward: "CARRIER_CHRISTENING_CABLE",
      miniGameTrigger: "CRANE_HIGH_WIRE_SHOWDOWN",
      collectibles: [
        {
          id: "MASTER_MOUSER_CORONATION_MEDAL",
          name: "Solid Brass Master Mouser of NNS Medal",
          category: "BADGE",
          position: { x: 20, y: 36, z: 52.5 },
          isCollected: false,
          description: "Official brass medal awarded by Newport News Shipbuilding for exemplary service."
        }
      ],
      objectives: [
        {
          id: "climb_big_blue_apex",
          description: "Ascend to the top trolley bridge of Big Blue (Y: 36m / 200ft)",
          isCompleted: false,
          targetPosition: { x: 20, y: 36, z: 50 },
          hint: "Climb the east leg maintenance ladder and step onto the high gantry catwalk",
          zoneName: "Big Blue East Catwalk"
        },
        {
          id: "defeat_gantry",
          description: "Defeat Gantry atop Big Blue Gantry crane to save the carrier",
          isCompleted: false,
          targetPosition: { x: 20, y: 36, z: 52.5 },
          hint: "Dodge Gantry's static aura and finish with Claw Flurry [J] or Shadow Finisher [F]!",
          zoneName: "Big Blue Apex Trolley Bridge"
        }
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

  public getMissionsByAct(act: 1 | 2 | 3 | 4): Mission[] {
    return this.missions.filter(m => m.act === act);
  }

  public getCurrentAct(): 1 | 2 | 3 | 4 {
    return this.getCurrentMission().act;
  }

  public getActiveObjective(): MissionObjective | null {
    const current = this.getCurrentMission();
    const active = current.objectives.find(o => !o.isCompleted);
    return active || null;
  }

  public getActiveWaypoint(): { x: number; y: number; z: number; label: string; hint: string; zoneName: string } | null {
    const active = this.getActiveObjective();
    if (active && active.targetPosition) {
      return {
        x: active.targetPosition.x,
        y: active.targetPosition.y,
        z: active.targetPosition.z,
        label: active.description,
        hint: active.hint || '',
        zoneName: active.zoneName || this.getCurrentMission().location
      };
    }
    return null;
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

  public advanceToNextMission(): boolean {
    if (this.currentMissionIndex + 1 < this.missions.length && this.missions[this.currentMissionIndex + 1].isUnlocked) {
      this.currentMissionIndex++;
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

  public collectMissionItem(missionId: number, itemId: string): boolean {
    const mission = this.missions.find(m => m.id === missionId);
    if (mission && mission.collectibles) {
      const item = mission.collectibles.find(c => c.id === itemId);
      if (item && !item.isCollected) {
        item.isCollected = true;
        return true;
      }
    }
    return false;
  }

  public getAllCollectibles(): CollectibleItem[] {
    const list: CollectibleItem[] = [];
    this.missions.forEach(m => {
      if (m.collectibles) {
        list.push(...m.collectibles);
      }
    });
    return list;
  }
}
