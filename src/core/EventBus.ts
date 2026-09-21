/**
 * Shipyard Cat - High-Performance Zero-Allocation Typed Event Bus
 * Designed for decoupled 60fps real-time subsystem communication.
 */

export type EventType =
  | 'VITALS_CHANGED'
  | 'RADIATION_UPDATE'
  | 'MISSION_OBJECTIVE'
  | 'COMBAT_HIT'
  | 'ASSIST_TRIGGERED'
  | 'ZONE_CHANGED'
  | 'CAT_STATE_CHANGED'
  | 'COLLECTIBLE_PICKED'
  | 'SOUND_TRIGGER'
  | 'MINIMAP_UPDATE';

export interface EventPayloadMap {
  VITALS_CHANGED: { health: number; stamina: number; hunger: number; speedModifier: number };
  RADIATION_UPDATE: { zone: string; doseRate: number; totalDose: number; inHotspot: boolean };
  MISSION_OBJECTIVE: { missionId: string; objectiveIndex: number; completed: boolean };
  COMBAT_HIT: { attackerId: string; targetId: string; damage: number; hitLocation: { x: number; y: number; z: number } };
  ASSIST_TRIGGERED: { assistId: string; department: string; rewardXP: number };
  ZONE_CHANGED: { zoneName: string; elevation: number };
  CAT_STATE_CHANGED: { action: string; grounded: boolean; speed: number; x: number; y: number; z: number };
  COLLECTIBLE_PICKED: { type: string; id: string; totalCount: number };
  SOUND_TRIGGER: { soundId: string; volume: number; pitch?: number };
  MINIMAP_UPDATE: { entityId: string; x: number; z: number; icon: string; visible: boolean };
}

export type EventCallback<T extends EventType> = (payload: EventPayloadMap[T]) => void;

interface QueuedEvent<T extends EventType = EventType> {
  type: T;
  payload: EventPayloadMap[T];
}

export class EventBus {
  private static instance: EventBus | null = null;
  private listeners: Map<EventType, EventCallback<any>[]> = new Map();
  
  // Preallocated Ring Buffer for Queued Events to achieve Zero-GC allocations during 60Hz gameplay
  private queueCapacity: number;
  private queue: QueuedEvent[];
  private queueHead: number = 0;
  private queueTail: number = 0;
  private queueCount: number = 0;

  // Performance telemetry counters
  public totalDispatched: number = 0;
  public totalDelivered: number = 0;
  public totalQueued: number = 0;
  public totalFlushed: number = 0;
  public totalDropped: number = 0;

  constructor(queueCapacity: number = 2048) {
    this.queueCapacity = queueCapacity;
    this.queue = new Array<QueuedEvent>(queueCapacity);
    for (let i = 0; i < queueCapacity; i++) {
      this.queue[i] = {
        type: 'VITALS_CHANGED',
        payload: null as any
      };
    }
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public static resetInstance(): void {
    if (EventBus.instance) {
      EventBus.instance.dispose();
      EventBus.instance = null;
    }
  }

  /**
   * Subscribe a callback to an event channel.
   * Returns an unsubscribe function for clean cleanup.
   */
  public subscribe<T extends EventType>(type: T, callback: EventCallback<T>): () => void {
    let list = this.listeners.get(type);
    if (!list) {
      list = [];
      this.listeners.set(type, list);
    }
    if (!list.includes(callback)) {
      list.push(callback);
    }

    return () => this.unsubscribe(type, callback);
  }

  /**
   * Unsubscribe a callback from an event channel.
   */
  public unsubscribe<T extends EventType>(type: T, callback: EventCallback<T>): boolean {
    const list = this.listeners.get(type);
    if (!list) return false;
    const index = list.indexOf(callback);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Immediate synchronous event publish. Dispatches directly to all active listeners.
   */
  public publish<T extends EventType>(type: T, payload: EventPayloadMap[T]): number {
    this.totalDispatched++;
    const list = this.listeners.get(type);
    if (!list || list.length === 0) {
      return 0;
    }

    const count = list.length;
    for (let i = 0; i < count; i++) {
      try {
        list[i](payload);
        this.totalDelivered++;
      } catch (err) {
        console.error(`Error in EventBus listener for ${type}:`, err);
      }
    }
    return count;
  }

  /**
   * Enqueue an event into the preallocated ring buffer without GC allocation.
   */
  public enqueue<T extends EventType>(type: T, payload: EventPayloadMap[T]): boolean {
    if (this.queueCount >= this.queueCapacity) {
      this.totalDropped++;
      return false; // Queue full
    }

    const slot = this.queue[this.queueTail];
    slot.type = type;
    slot.payload = payload;

    this.queueTail = (this.queueTail + 1) % this.queueCapacity;
    this.queueCount++;
    this.totalQueued++;
    return true;
  }

  /**
   * Flush all queued events in the ring buffer, dispatching them to subscribers.
   */
  public flush(): number {
    const count = this.queueCount;
    for (let i = 0; i < count; i++) {
      const item = this.queue[this.queueHead];
      this.publish(item.type, item.payload);
      this.queueHead = (this.queueHead + 1) % this.queueCapacity;
      this.totalFlushed++;
    }
    this.queueCount = 0;
    return count;
  }

  /**
   * Returns current subscriber count for a channel
   */
  public getListenerCount(type: EventType): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  /**
   * Returns total listener count across all channels
   */
  public getTotalListenerCount(): number {
    let total = 0;
    for (const list of this.listeners.values()) {
      total += list.length;
    }
    return total;
  }

  /**
   * Returns current pending queue length
   */
  public getQueueLength(): number {
    return this.queueCount;
  }

  /**
   * Complete disposal and teardown of event bus resources
   */
  public dispose(): void {
    this.listeners.clear();
    this.queueHead = 0;
    this.queueTail = 0;
    this.queueCount = 0;
    this.totalDispatched = 0;
    this.totalDelivered = 0;
    this.totalQueued = 0;
    this.totalFlushed = 0;
    this.totalDropped = 0;
  }
}
