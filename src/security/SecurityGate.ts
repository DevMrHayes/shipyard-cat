/**
 * NNS Security Gate Clearance Protocol & Operative Profile Persistence
 * ===================================================================
 * Restricts public access to Newport News Shipbuilding drydock simulation.
 * Intercepts simulation before WebGL allocations until a valid clearance code is provided.
 */

export interface OperativeProfile {
  badgeId: string;
  clearanceLevel: string;
  totalShiftHours: number;
  completedMissions: string[];
  lastPosition?: { x: number; y: number; z: number };
  timestamp: number;
}

export interface SecuritySession {
  authorized: boolean;
  profile: OperativeProfile;
}

export class SecurityGate {
  public static readonly STORAGE_KEY = 'NNS_YARD_OPERATIVE_SESSION_V1';

  // Valid Shipyard Access Codes (supports plain strings and pre-hashed SHA-256)
  public static readonly VALID_CODES = new Set<string>([
    'DRYDOCK-12',
    'NNS-RIGGER-2026',
    'CVN-80-ENTERPRISE',
    'ALBA-SECURITY-01'
  ]);

  private static async sha256(message: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return message;
    }
    const msgBuffer = new TextEncoder().encode(message.trim().toUpperCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  public static getSession(): SecuritySession | null {
    try {
      const raw = localStorage.getItem(SecurityGate.STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SecuritySession;
    } catch {
      return null;
    }
  }

  public static isAuthorized(): boolean {
    const session = SecurityGate.getSession();
    return !!(session && session.authorized);
  }

  public static authorize(badgeId: string, code: string): { success: boolean; message: string; profile?: OperativeProfile } {
    const cleanBadge = (badgeId || 'YARD-CAT-01').trim().toUpperCase();
    const cleanCode = (code || '').trim().toUpperCase();

    if (!cleanCode) {
      return { success: false, message: 'SECURITY CLEARANCE CODE REQUIRED' };
    }

    if (SecurityGate.VALID_CODES.has(cleanCode)) {
      const existing = SecurityGate.getSession();
      const profile: OperativeProfile = (existing && existing.profile && existing.profile.badgeId === cleanBadge)
        ? existing.profile
        : {
            badgeId: cleanBadge,
            clearanceLevel: 'L3-FELINE-OPERATIVE',
            totalShiftHours: 0,
            completedMissions: [],
            timestamp: Date.now()
          };

      const session: SecuritySession = {
        authorized: true,
        profile
      };

      try {
        localStorage.setItem(SecurityGate.STORAGE_KEY, JSON.stringify(session));
      } catch (err) {
        console.warn('[SecurityGate] Storage warning:', err);
      }

      return {
        success: true,
        message: 'CLEARANCE CONFIRMED. LINK INITIALIZED.',
        profile
      };
    }

    return {
      success: false,
      message: 'ACCESS DENIED: INVALID SECURITY CLEARANCE CODE. (Use code: DRYDOCK-12)'
    };
  }

  public static revokeSession(): void {
    try {
      localStorage.removeItem(SecurityGate.STORAGE_KEY);
    } catch {}
  }
}
