import * as THREE from 'three';
import { CatVitals } from '../VitalsSystem';
import { ShipbuildingAssistEvent } from '../AssistanceEngine';
import { FreezeIncident } from '../EngineFlightRecorder';
import { ContextualPrompt } from '../../game/GameEngine';

/**
 * Event map defining all strongly-typed game event payloads.
 */
export interface GameEventMap {
  'vitals:update': { vitals: CatVitals; radiation: number };
  'assistance:trigger': ShipbuildingAssistEvent;
  'mission:objectiveUpdated': void;
  'mission:completed': { missionId: number; title: string };
  'ui:notification': { title: string; message: string; type: 'info' | 'success' | 'warn' };
  'ui:contextualPrompts': ContextualPrompt[];
  'engine:freezeDetected': FreezeIncident;
  'engine:frameUpdate': { tick: number; deltaTime: number };
  'combat:hit': { position: THREE.Vector3; isHeavy: boolean; targetName?: string };
  'combat:strikeKO': { victimName: string; xpEarned: number; isBoss: boolean };
  'hazard:radiation': { dose: number; position: THREE.Vector3 };
  'location:change': { location: string; isIndoors: boolean };
  'camera:shake': { intensity: number };
  'whiskers:toggle': { active: boolean };
}

export type GameEventType = keyof GameEventMap;
export type GameEventListener<K extends GameEventType> = (data: GameEventMap[K]) => void;

/**
 * GameEventBus: High-speed, zero-runtime-allocation event dispatcher.
 * Preallocates listener arrays and reuses subscriber lists to eliminate GC pressure
 * in 60Hz/120Hz hot gameplay and physics loops.
 */
export class GameEventBus {
  private static readonly MAX_LISTENERS_PER_EVENT = 32;
  private listeners: Map<GameEventType, GameEventListener<any>[]> = new Map();
  private listenerCounts: Map<GameEventType, number> = new Map();

  constructor() {
    // Pre-seed known event types to avoid runtime Map resizing
    const eventTypes: GameEventType[] = [
      'vitals:update',
      'assistance:trigger',
      'mission:objectiveUpdated',
      'mission:completed',
      'ui:notification',
      'ui:contextualPrompts',
      'engine:freezeDetected',
      'engine:frameUpdate',
      'combat:hit',
      'combat:strikeKO',
      'hazard:radiation',
      'location:change',
      'camera:shake',
      'whiskers:toggle'
    ];

    for (const evt of eventTypes) {
      this.listeners.set(evt, new Array(GameEventBus.MAX_LISTENERS_PER_EVENT));
      this.listenerCounts.set(evt, 0);
    }
  }

  /**
   * Subscribe to a typed game event.
   */
  public on<K extends GameEventType>(event: K, listener: GameEventListener<K>): void {
    let list = this.listeners.get(event);
    if (!list) {
      list = new Array(GameEventBus.MAX_LISTENERS_PER_EVENT);
      this.listeners.set(event, list);
      this.listenerCounts.set(event, 0);
    }

    const count = this.listenerCounts.get(event) ?? 0;
    // Prevent duplicate registrations
    for (let i = 0; i < count; i++) {
      if (list[i] === listener) return;
    }

    if (count < list.length) {
      list[count] = listener;
    } else {
      list.push(listener);
    }
    this.listenerCounts.set(event, count + 1);
  }

  /**
   * Unsubscribe from a typed game event.
   */
  public off<K extends GameEventType>(event: K, listener: GameEventListener<K>): void {
    const list = this.listeners.get(event);
    if (!list) return;

    const count = this.listenerCounts.get(event) ?? 0;
    for (let i = 0; i < count; i++) {
      if (list[i] === listener) {
        // Fast swap-with-last removal (zero array reallocation)
        list[i] = list[count - 1];
        list[count - 1] = undefined as any;
        this.listenerCounts.set(event, count - 1);
        return;
      }
    }
  }

  /**
   * Emit a typed event with zero allocations in the hot path.
   */
  public emit<K extends GameEventType>(event: K, data: GameEventMap[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;

    const count = this.listenerCounts.get(event) ?? 0;
    for (let i = 0; i < count; i++) {
      const fn = list[i];
      if (fn) {
        fn(data);
      }
    }
  }

  /**
   * Clear all active listeners for an event or all events.
   */
  public clear(event?: GameEventType): void {
    if (event) {
      const list = this.listeners.get(event);
      if (list) {
        const count = this.listenerCounts.get(event) ?? 0;
        for (let i = 0; i < count; i++) {
          list[i] = undefined as any;
        }
        this.listenerCounts.set(event, 0);
      }
    } else {
      for (const [evt, list] of this.listeners.entries()) {
        const count = this.listenerCounts.get(evt) ?? 0;
        for (let i = 0; i < count; i++) {
          list[i] = undefined as any;
        }
        this.listenerCounts.set(evt, 0);
      }
    }
  }

  /**
   * Get active listener count for diagnostics.
   */
  public getListenerCount(event: GameEventType): number {
    return this.listenerCounts.get(event) ?? 0;
  }
}

/** Global shared instance */
export const gameEventBus = new GameEventBus();
