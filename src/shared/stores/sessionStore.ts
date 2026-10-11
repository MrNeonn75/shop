import { create } from 'zustand';
import { AuthUser, UserRole } from '../utils/permissions';
import { DEMO_USERS, DEMO_USERS_LIST } from '../adapters/mock/demoUsers';

export interface UserSessionDevice {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

interface SessionState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  activeBranchId: string;
  isAuthenticated: boolean;

  // Active Sessions
  activeSessions: UserSessionDevice[];
  revokeSession: (sessionId: string) => void;
  revokeAllOtherSessions: () => void;

  // Inactivity & Session Expiry
  inactivityTimeoutMinutes: number;
  lastActivityAt: number;
  isSessionExpiredModalOpen: boolean;
  preservedFormDrafts: Record<string, unknown>;

  // Rate Limiting & Lockout
  failedLoginAttempts: number;
  lockoutUntil: number | null;

  // Actions
  recordActivity: () => void;
  setInactivityTimeoutMinutes: (minutes: number) => void;
  openSessionExpiredModal: () => void;
  closeSessionExpiredModal: () => void;
  saveFormDraft: (formKey: string, draftData: unknown) => void;
  getFormDraft: (formKey: string) => unknown;
  clearFormDraft: (formKey: string) => void;

  setSession: (user: AuthUser, token: string, refreshToken?: string) => void;
  setActiveBranchId: (branchId: string) => void;
  clearSession: () => void;
  logout: () => void;

  // Auth Operations
  loginDemo: (role: UserRole) => void;
  loginWithCredentials: (identifier: string, password: string) => { success: boolean; error?: string; lockoutSeconds?: number };
  switchRoleForDemo: (role: UserRole) => void;
}

const INITIAL_SESSIONS: UserSessionDevice[] = [
  {
    id: 'sess-current',
    deviceName: 'Workstation Admin PC',
    browser: 'Chrome 128 (Windows 11)',
    os: 'Windows 11 Pro 64-bit',
    ipAddress: '185.11.23.45',
    location: 'Bakı, Azərbaycan (Baş Ofis)',
    lastActiveAt: new Date().toISOString(),
    isCurrent: true,
  },
  {
    id: 'sess-pos-01',
    deviceName: 'Zebra TC26 POS Terminal',
    browser: 'Chrome Mobile 126 (Android 13)',
    os: 'Android 13',
    ipAddress: '185.11.23.49',
    location: 'Bakı, 28 May Filialı (Kassa 1)',
    lastActiveAt: '2026-10-10T12:40:00Z',
    isCurrent: false,
  },
  {
    id: 'sess-manager-mac',
    deviceName: 'MacBook Air M2',
    browser: 'Safari 18.0 (macOS Sequoia)',
    os: 'macOS 15.0',
    ipAddress: '82.194.18.102',
    location: 'Bakı, Gənclik Filialı',
    lastActiveAt: '2026-10-09T18:15:00Z',
    isCurrent: false,
  },
];

export const useSessionStore = create<SessionState>((set, get) => ({
  user: DEMO_USERS.superadmin.user,
  token: 'mock-jwt-token-access',
  refreshToken: 'mock-jwt-token-refresh',
  activeBranchId: DEMO_USERS.superadmin.user.branchId || 'branch-1',
  isAuthenticated: true,

  activeSessions: INITIAL_SESSIONS,

  revokeSession: (sessionId: string) => {
    set((state) => ({
      activeSessions: state.activeSessions.filter((s) => s.id !== sessionId),
    }));
  },

  revokeAllOtherSessions: () => {
    set((state) => ({
      activeSessions: state.activeSessions.filter((s) => s.isCurrent),
    }));
  },

  inactivityTimeoutMinutes: 15,
  lastActivityAt: Date.now(),
  isSessionExpiredModalOpen: false,
  preservedFormDrafts: {},

  failedLoginAttempts: 0,
  lockoutUntil: null,

  recordActivity: () => {
    set({ lastActivityAt: Date.now() });
  },

  setInactivityTimeoutMinutes: (minutes: number) => {
    set({ inactivityTimeoutMinutes: minutes });
  },

  openSessionExpiredModal: () => {
    set({ isSessionExpiredModalOpen: true });
  },

  closeSessionExpiredModal: () => {
    set({ isSessionExpiredModalOpen: false });
  },

  saveFormDraft: (formKey: string, draftData: unknown) => {
    set((state) => ({
      preservedFormDrafts: {
        ...state.preservedFormDrafts,
        [formKey]: draftData,
      },
    }));
  },

  getFormDraft: (formKey: string) => {
    return get().preservedFormDrafts[formKey];
  },

  clearFormDraft: (formKey: string) => {
    set((state) => {
      const next = { ...state.preservedFormDrafts };
      delete next[formKey];
      return { preservedFormDrafts: next };
    });
  },

  setSession: (user, token, refreshToken) => {
    set({
      user,
      token,
      refreshToken: refreshToken ?? null,
      isAuthenticated: true,
      activeBranchId: user.branchId || 'branch-1',
      lastActivityAt: Date.now(),
      failedLoginAttempts: 0,
      lockoutUntil: null,
      isSessionExpiredModalOpen: false,
    });
  },

  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),

  clearSession: () => {
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  logout: () => {
    get().clearSession();
  },

  loginDemo: (role: UserRole) => {
    const demo = DEMO_USERS[role];
    if (!demo) return;
    get().setSession(demo.user, `mock-jwt-token-${role}`, `mock-refresh-token-${role}`);
  },

  loginWithCredentials: (identifier: string, password: string) => {
    const state = get();
    const now = Date.now();

    // Check lockout
    if (state.lockoutUntil && state.lockoutUntil > now) {
      const secondsLeft = Math.ceil((state.lockoutUntil - now) / 1000);
      return {
        success: false,
        error: `Çoxsaylı uğursuz cəhd səbəbindən sistem bloklanıb. Zəhmət olmasa ${secondsLeft} saniyə sonra yenidən cəhd edin.`,
        lockoutSeconds: secondsLeft,
      };
    }

    const cleanId = identifier.trim().toLowerCase();
    const matched = DEMO_USERS_LIST.find(
      (d) =>
        d.user.username.toLowerCase() === cleanId ||
        d.user.email.toLowerCase() === cleanId
    );

    if (!matched) {
      const nextFailures = state.failedLoginAttempts + 1;
      if (nextFailures >= 4) {
        const lockoutTime = now + 60 * 1000; // 60 seconds lockout
        set({ failedLoginAttempts: nextFailures, lockoutUntil: lockoutTime });
        return {
          success: false,
          error: 'Təhlükəsizlik xətası: Çox sayda yanlış cəhd! Hesab 60 saniyə müddətinə müvəqqəti bloklandı.',
          lockoutSeconds: 60,
        };
      }
      set({ failedLoginAttempts: nextFailures });
      return {
        success: false,
        error: 'İstifadəçi adı və ya şifrə yanlışdır. Zəhmət olmasa məlumatları yoxlayın.',
      };
    }

    // Check password (accept either exact demo password or universal 'Admin123!')
    if (password !== matched.password && password !== 'Admin123!') {
      const nextFailures = state.failedLoginAttempts + 1;
      if (nextFailures >= 4) {
        const lockoutTime = now + 60 * 1000;
        set({ failedLoginAttempts: nextFailures, lockoutUntil: lockoutTime });
        return {
          success: false,
          error: 'Təhlükəsizlik xətası: Çox sayda yanlış cəhd! Hesab 60 saniyə müddətinə müvəqqəti bloklandı.',
          lockoutSeconds: 60,
        };
      }
      set({ failedLoginAttempts: nextFailures });
      return {
        success: false,
        error: `Şifrə yanlışdır! (Qalan cəhd sayı: ${4 - nextFailures})`,
      };
    }

    // Success
    get().setSession(matched.user, `mock-jwt-token-${matched.user.role}`, `mock-refresh-${matched.user.role}`);
    return { success: true };
  },

  switchRoleForDemo: (role: UserRole) => {
    const demo = DEMO_USERS[role];
    if (!demo) return;
    set({
      user: demo.user,
      activeBranchId: demo.user.branchId || 'branch-1',
    });
  },
}));
