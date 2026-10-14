import { useState } from 'react';

/**
 * Modal open/close state for the app-level modals (search, data export/import
 * and quick add). Extracted from App.tsx; behaviour is unchanged.
 */
export function useAppModals() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  return {
    isSearchOpen,
    setIsSearchOpen,
    isDataModalOpen,
    setIsDataModalOpen,
    isQuickAddOpen,
    setIsQuickAddOpen,
  };
}
