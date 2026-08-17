export class TouchController {
  private joystickZone: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private activeTouchId: number | null = null;

  public moveVector = { x: 0, y: 0 }; // Normalized (-1 to 1)
  public isTouching = false;
  public isSprinting = false;

  // Touch Camera drag state
  private cameraTouchId: number | null = null;
  private lastCameraTouch = { x: 0, y: 0 };
  public cameraDelta = { x: 0, y: 0 };

  // Action Callback Hooks
  public onPounce: (() => void) | null = null;
  public onAttack: (() => void) | null = null;
  public onWhiskers: (() => void) | null = null;
  public onMeow: (() => void) | null = null;
  public onToggleMap: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    this.joystickZone = document.getElementById('virtual-joystick-zone');
    this.joystickThumb = document.getElementById('virtual-joystick-thumb');

    if (!this.joystickZone || !this.joystickThumb) return;

    // Joystick Touch Listeners
    this.joystickZone.addEventListener('touchstart', this.handleJoystickStart.bind(this), { passive: false });
    window.addEventListener('touchmove', this.handleJoystickMove.bind(this), { passive: false });
    window.addEventListener('touchend', this.handleJoystickEnd.bind(this), { passive: false });
    window.addEventListener('touchcancel', this.handleJoystickEnd.bind(this), { passive: false });

    // Camera Swipe Gesture on Viewport
    const viewport = document.getElementById('game-container');
    if (viewport) {
      viewport.addEventListener('touchstart', this.handleCameraStart.bind(this), { passive: true });
      viewport.addEventListener('touchmove', this.handleCameraMove.bind(this), { passive: true });
      viewport.addEventListener('touchend', this.handleCameraEnd.bind(this), { passive: true });
      viewport.addEventListener('touchcancel', this.handleCameraEnd.bind(this), { passive: true });
    }

    // Connect Action Touch Buttons
    this.bindActionButton('touch-btn-pounce', () => this.onPounce?.());
    this.bindActionButton('touch-btn-attack', () => this.onAttack?.());
    this.bindActionButton('touch-btn-whiskers', () => this.onWhiskers?.());
    this.bindActionButton('touch-btn-meow', () => this.onMeow?.());
    this.bindActionButton('touch-btn-map', () => this.onToggleMap?.());
  }

  private bindActionButton(id: string, callback: () => void) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('active');
        callback();
      }, { passive: false });

      btn.addEventListener('touchend', () => {
        btn.classList.remove('active');
      });
      btn.addEventListener('touchcancel', () => {
        btn.classList.remove('active');
      });
    }
  }

  private handleJoystickStart(e: TouchEvent) {
    if (this.activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.activeTouchId = touch.identifier;
    this.isTouching = true;

    const rect = this.joystickZone!.getBoundingClientRect();
    this.joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    this.updateThumb(touch.clientX, touch.clientY);
  }

  private handleJoystickMove(e: TouchEvent) {
    if (this.activeTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouchId) {
        this.updateThumb(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  private updateThumb(clientX: number, clientY: number) {
    const maxRadius = 48; // Max thumb travel distance
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);

    const angle = Math.atan2(dy, dx);
    const clampedDist = Math.min(maxRadius, dist);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;

    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }

    // Normalized drive vector (-1 to 1)
    this.moveVector.x = clampedDist > 6 ? thumbX / maxRadius : 0;
    this.moveVector.y = clampedDist > 6 ? -thumbY / maxRadius : 0; // Positive Y is forward (North)

    // Sprint when dragged past 80% boundary
    this.isSprinting = dist > maxRadius * 0.85;
  }

  private handleJoystickEnd(e: TouchEvent) {
    if (this.activeTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.activeTouchId) {
        this.activeTouchId = null;
        this.isTouching = false;
        this.isSprinting = false;
        this.moveVector = { x: 0, y: 0 };
        if (this.joystickThumb) {
          this.joystickThumb.style.transform = 'translate(0px, 0px)';
        }
        break;
      }
    }
  }

  // Camera Swipe Handlers
  private handleCameraStart(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Only track touch if it's not the joystick and right half of screen
      if (touch.identifier !== this.activeTouchId && touch.clientX > window.innerWidth * 0.35) {
        this.cameraTouchId = touch.identifier;
        this.lastCameraTouch = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  }

  private handleCameraMove(e: TouchEvent) {
    if (this.cameraTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.cameraTouchId) {
        const dx = touch.clientX - this.lastCameraTouch.x;
        const dy = touch.clientY - this.lastCameraTouch.y;

        this.cameraDelta.x += dx * 0.005;
        this.cameraDelta.y += dy * 0.005;

        this.lastCameraTouch = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  }

  private handleCameraEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.cameraTouchId) {
        this.cameraTouchId = null;
        break;
      }
    }
  }

  public consumeCameraDelta() {
    const delta = { ...this.cameraDelta };
    this.cameraDelta = { x: 0, y: 0 };
    return delta;
  }
}
