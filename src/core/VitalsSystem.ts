// Vitals System: Stamina, Hunger, Health and Agility Stats
export class CatVitals {
  public maxHealth: number = 100;
  public currentHealth: number = 100;

  public maxStamina: number = 100;
  public currentStamina: number = 100;

  public maxHunger: number = 100;
  public currentHunger: number = 100;

  public sprintDrainRate: number = 18; // units / second
  public staminaRegenRate: number = 22; // units / second
  public hungerDecayRate: number = 0.08; // units / second (~21 minutes full bar)

  public ratsCaught: number = 0;
  public totalPestControlScore: number = 0;

  constructor(maxStamina: number = 100, maxHunger: number = 100, initialHunger?: number) {
    this.maxStamina = maxStamina;
    this.currentStamina = maxStamina;
    this.maxHunger = maxHunger;
    this.currentHunger = initialHunger !== undefined ? initialHunger : maxHunger;
  }

  public setHunger(amount: number) {
    this.currentHunger = Math.min(this.maxHunger, Math.max(0, amount));
  }

  public whiskersDrainRate: number = 15; // units / second
  public isExhausted: boolean = false;

  public update(deltaTime: number, isSprinting: boolean, isMoving: boolean, isWhiskersActive: boolean = false) {
    // 1. Stamina management
    let isDraining = false;

    if (isSprinting && isMoving && !this.isExhausted) {
      this.currentStamina = Math.max(0, this.currentStamina - this.sprintDrainRate * deltaTime);
      isDraining = true;
    }

    if (isWhiskersActive && !this.isExhausted) {
      this.currentStamina = Math.max(0, this.currentStamina - this.whiskersDrainRate * deltaTime);
      isDraining = true;
    }

    // Exhaustion state: if stamina reaches 0, enter lockout until recharged to 25%
    if (this.currentStamina <= 0.5) {
      this.isExhausted = true;
      this.currentStamina = 0;
    }

    if (!isDraining) {
      this.currentStamina = Math.min(this.maxStamina, this.currentStamina + this.staminaRegenRate * deltaTime);
      if (this.isExhausted && this.currentStamina >= this.maxStamina * 0.25) {
        this.isExhausted = false; // Recovered from exhaustion
      }
    }

    // 2. Hunger decay
    const dynamicDecay = isSprinting ? this.hungerDecayRate * 1.5 : this.hungerDecayRate;
    this.currentHunger = Math.max(0, this.currentHunger - dynamicDecay * deltaTime);

    // 3. Starvation damage if hunger hits zero
    if (this.currentHunger <= 0) {
      this.currentHealth = Math.max(0, this.currentHealth - 2.0 * deltaTime);
    }
  }

  public canSprint(): boolean {
    return !this.isExhausted && this.currentStamina > 8;
  }

  public canUseWhiskers(): boolean {
    return !this.isExhausted && this.currentStamina > 5;
  }

  public consumePounceStamina(amount: number = 25): boolean {
    if (this.currentStamina >= amount) {
      this.currentStamina -= amount;
      return true;
    }
    return false;
  }

  public feed(nutrition: number) {
    this.currentHunger = Math.min(this.maxHunger, this.currentHunger + nutrition);
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + nutrition * 0.4);
    this.ratsCaught += 1;
    this.totalPestControlScore += Math.round(nutrition * 10);
  }

  public takeHazardDamage(amount: number) {
    this.currentHealth = Math.max(0, this.currentHealth - amount);
  }

  public healAtSanctuary() {
    this.currentHealth = this.maxHealth;
    this.currentStamina = this.maxStamina;
    this.currentHunger = this.maxHunger;
  }
}
