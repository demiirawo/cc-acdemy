
import { useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const updateStatus = (status: SaveStatus) => {
    setSaveStatus(status);
    if (status === 'saved') {
      setLastSaved(new Date());
    }
  };

  return {
    saveStatus,
    lastSaved,
    updateStatus,
    setSaving: () => updateStatus('saving'),
    setSaved: () => updateStatus('saved'),
    setError: () => updateStatus('error'),
    setIdle: () => updateStatus('idle')
  };
}
