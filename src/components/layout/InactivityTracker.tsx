import React, { useEffect, useRef } from 'react';
import { useSessionStore } from '../../shared/stores/sessionStore';

/**
 * InactivityTracker monitors user interaction events and automatically
 * triggers session expiry after inactivityTimeoutMinutes of idle time.
 */
export const InactivityTracker: React.FC = () => {
  const {
    isAuthenticated,
    lastActivityAt,
    inactivityTimeoutMinutes,
    recordActivity,
    openSessionExpiredModal,
    isSessionExpiredModalOpen,
  } = useSessionStore();

  const lastRecordedRef = useRef(lastActivityAt);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle activity recording to once every 10 seconds to save state writes
      if (now - lastRecordedRef.current > 10_000) {
        lastRecordedRef.current = now;
        recordActivity();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Periodic check every 15 seconds
    const interval = setInterval(() => {
      if (isSessionExpiredModalOpen) return;

      const idleDurationMs = Date.now() - useSessionStore.getState().lastActivityAt;
      const maxIdleMs = (inactivityTimeoutMinutes || 15) * 60 * 1000;

      if (idleDurationMs >= maxIdleMs) {
        openSessionExpiredModal();
      }
    }, 15_000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, inactivityTimeoutMinutes, recordActivity, openSessionExpiredModal, isSessionExpiredModalOpen]);

  return null;
};

