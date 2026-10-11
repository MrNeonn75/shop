import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../src/shared/stores/sessionStore';
import { DEMO_USERS } from '../src/shared/adapters/mock/demoUsers';

describe('Authentication & Session Management Unit Tests', () => {
  beforeEach(() => {
    // Reset session store to superadmin initial state
    useSessionStore.getState().setSession(
      DEMO_USERS.superadmin.user,
      'mock-jwt-token-access',
      'mock-jwt-token-refresh'
    );
  });

  describe('Session State & Demo Login', () => {
    it('initializes with authenticated demo superadmin user', () => {
      const state = useSessionStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.role).toBe('superadmin');
      expect(state.user?.name).toBe('Kamran Əliyev');
      expect(state.token).toBeTruthy();
    });

    it('switches demo roles seamlessly', () => {
      useSessionStore.getState().switchRoleForDemo('cashier');
      const state = useSessionStore.getState();
      expect(state.user?.role).toBe('cashier');
      expect(state.user?.name).toBe('Aytən Həsənova');
      expect(state.activeBranchId).toBe('branch-2');
    });

    it('clears session on logout', () => {
      useSessionStore.getState().logout();
      const state = useSessionStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe('Credentials Login & Rate Limiting / Lockout', () => {
    it('authenticates valid credentials successfully', () => {
      const result = useSessionStore
        .getState()
        .loginWithCredentials('admin', 'AdminPassword123!');
      expect(result.success).toBe(true);
      expect(useSessionStore.getState().isAuthenticated).toBe(true);
      expect(useSessionStore.getState().failedLoginAttempts).toBe(0);
    });

    it('rejects invalid password and increments failed attempts count', () => {
      const result = useSessionStore
        .getState()
        .loginWithCredentials('admin', 'WrongPassword!');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Şifrə yanlışdır');
      expect(useSessionStore.getState().failedLoginAttempts).toBe(1);
    });

    it('triggers temporary lockout after 4 consecutive failed attempts', () => {
      // 4 consecutive bad attempts
      useSessionStore.getState().loginWithCredentials('admin', 'Bad1');
      useSessionStore.getState().loginWithCredentials('admin', 'Bad2');
      useSessionStore.getState().loginWithCredentials('admin', 'Bad3');
      const fourth = useSessionStore.getState().loginWithCredentials('admin', 'Bad4');

      expect(fourth.success).toBe(false);
      expect(fourth.lockoutSeconds).toBe(60);
      expect(fourth.error).toContain('bloklandı');
      expect(useSessionStore.getState().lockoutUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('Preserved Form Drafts on Expiry', () => {
    it('saves, retrieves, and clears form drafts during session transitions', () => {
      const testDraft = {
        branchName: 'Gənclik Filialı Yeni Korpus',
        code: 'BH-GM-2',
        cashRegisters: 5,
      };

      // Save draft
      useSessionStore.getState().saveFormDraft('branch-create-form', testDraft);
      expect(useSessionStore.getState().getFormDraft('branch-create-form')).toEqual(testDraft);

      // Clear draft
      useSessionStore.getState().clearFormDraft('branch-create-form');
      expect(useSessionStore.getState().getFormDraft('branch-create-form')).toBeUndefined();
    });
  });

  describe('Active Sessions Management', () => {
    it('lists initial active devices', () => {
      const sessions = useSessionStore.getState().activeSessions;
      expect(sessions.length).toBeGreaterThan(1);
      const current = sessions.find((s) => s.isCurrent);
      expect(current).toBeDefined();
    });

    it('revokes a specific device session', () => {
      const initialCount = useSessionStore.getState().activeSessions.length;
      useSessionStore.getState().revokeSession('sess-pos-01');

      const nextSessions = useSessionStore.getState().activeSessions;
      expect(nextSessions.length).toBe(initialCount - 1);
      expect(nextSessions.some((s) => s.id === 'sess-pos-01')).toBe(false);
    });

    it('revokes all other sessions leaving only the current one', () => {
      useSessionStore.getState().revokeAllOtherSessions();
      const sessions = useSessionStore.getState().activeSessions;
      expect(sessions.length).toBe(1);
      expect(sessions[0].isCurrent).toBe(true);
    });
  });

  describe('Inactivity & Session Expiry Modal', () => {
    it('records activity and updates lastActivityAt', () => {
      const prev = useSessionStore.getState().lastActivityAt;
      useSessionStore.getState().recordActivity();
      expect(useSessionStore.getState().lastActivityAt).toBeGreaterThanOrEqual(prev);
    });

    it('toggles session expired modal open and close', () => {
      useSessionStore.getState().openSessionExpiredModal();
      expect(useSessionStore.getState().isSessionExpiredModalOpen).toBe(true);

      useSessionStore.getState().closeSessionExpiredModal();
      expect(useSessionStore.getState().isSessionExpiredModalOpen).toBe(false);
    });
  });
});

