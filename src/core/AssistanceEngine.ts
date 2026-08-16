export interface ShipbuildingAssistEvent {
  id: string;
  title: string;
  department: string;
  realWorldContext: string;
  description: string;
  completed: boolean;
  rewardXP: number;
}

export type AssistanceCallback = (event: ShipbuildingAssistEvent) => void;

export class AssistanceEngine {
  private events: Map<string, ShipbuildingAssistEvent> = new Map();
  private listeners: AssistanceCallback[] = [];

  constructor() {
    this.registerInitialEvents();
  }

  private registerInitialEvents() {
    this.addEvent({
      id: 'DOROTHY_CAPSTAN_UNJAM',
      title: 'Mooring Winch Restoration',
      department: 'Dept. 03 (Rigging & Preservation)',
      realWorldContext: 'Tugboat Dorothy (NNS Hull No. 1, built 1891, restored on Washington Ave)',
      description: 'Chasing the Dockyard Kingpin rat dislodged a 1980s rusted spanner wrench from the Dorothy\'s capstan gear, restoring historical display operation!',
      completed: false,
      rewardXP: 150
    });

    this.addEvent({
      id: 'CONDUIT_PULL_STRING',
      title: 'Virginia-Class Sonar Pilot Line',
      department: 'Dept. 19 (Electrical & Outfitting)',
      realWorldContext: 'Submarine Outfitting Facility (MOF) 4-inch cable raceway',
      description: 'Squeezing through a narrow 150ft conduit trailing a loose wire tag ran the sonar array pilot pull-line 3 days ahead of schedule!',
      completed: false,
      rewardXP: 250
    });

    this.addEvent({
      id: 'CRANE_SAFETY_TRIP',
      title: 'Big Blue Emergency Line Clear',
      department: 'Dept. 01 (Heavy Lift Operations)',
      realWorldContext: 'Dry Dock 12 Goliath 1,050-Metric-Ton Gantry Crane',
      description: 'Knocked away a snagged rigger tag line on the 200-ton flight-deck block hoist, preventing a high-tension cable snap!',
      completed: false,
      rewardXP: 400
    });

    this.addEvent({
      id: 'RCOH_COOLANT_SENSOR',
      title: 'Reactor Shielding Interlock Reset',
      department: 'Dept. 08 (Nuclear Propulsion Quality)',
      realWorldContext: 'Refueling and Complex Overhaul (RCOH) Containment Enclosure',
      description: 'Batted a contaminated sensor calibration float into the receiver, resetting the safety interlock and alerting technicians to a secondary valve leak!',
      completed: false,
      rewardXP: 500
    });
  }

  public addEvent(event: ShipbuildingAssistEvent) {
    this.events.set(event.id, event);
  }

  public triggerAssist(id: string): boolean {
    const event = this.events.get(id);
    if (event && !event.completed) {
      event.completed = true;
      this.notify(event);
      return true;
    }
    return false;
  }

  public isCompleted(id: string): boolean {
    return this.events.get(id)?.completed ?? false;
  }

  public getEvent(id: string): ShipbuildingAssistEvent | undefined {
    return this.events.get(id);
  }

  public getAllEvents(): ShipbuildingAssistEvent[] {
    return Array.from(this.events.values());
  }

  public onAssist(callback: AssistanceCallback) {
    this.listeners.push(callback);
  }

  private notify(event: ShipbuildingAssistEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error executing assist listener', err);
      }
    }
  }
}
