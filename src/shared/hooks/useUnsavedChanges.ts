import { useEffect } from 'react';

/**
 * Hook to guard against accidental page unload or navigation when form has unsaved modifications.
 */
export function useUnsavedChanges(isDirty: boolean, message?: string): void {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = message || 'Yadda saxlanılmamış dəyişikliklər var. Səhifəni tərk etmək istədiyinizə əminsiniz?';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, message]);
}
