import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface BusinessAccount {
  id: string;
  name: string;
  waba_id: string;
  phone_number_id: string;
  is_active: boolean;
  last_synced_at: string | null;
}

interface BusinessAccountContextValue {
  accounts: BusinessAccount[];
  selectedId: string | null;
  selected: BusinessAccount | null;
  setSelectedId: (id: string | null) => void;
  isLoading: boolean;
}

const BusinessAccountContext = createContext<BusinessAccountContextValue>({
  accounts: [],
  selectedId: null,
  selected: null,
  setSelectedId: () => {},
  isLoading: false,
});

const STORAGE_KEY = 'selectedBusinessAccountId';

export function BusinessAccountProvider({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');

  const { data, isLoading } = useQuery({
    queryKey: ['wa-cloud-accounts'],
    queryFn: () => api.get('/whatsapp-cloud/accounts').then(r => r.data.data as BusinessAccount[]),
    enabled: !!token,
    staleTime: 60_000,
  });

  const accounts = (data ?? []).filter(a => a.is_active);

  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? null;
  });

  // Auto-select first account when accounts load and nothing is stored
  useEffect(() => {
    if (!isLoading && accounts.length > 0 && !selectedId) {
      setSelectedIdState(accounts[0].id);
    }
    // If stored selection no longer exists in list, clear it
    if (!isLoading && selectedId && accounts.length > 0) {
      const stillExists = accounts.some(a => a.id === selectedId);
      if (!stillExists) setSelectedIdState(null);
    }
  }, [isLoading, accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSelectedId(id: string | null) {
    setSelectedIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }

  const selected = accounts.find(a => a.id === selectedId) ?? null;

  return (
    <BusinessAccountContext.Provider value={{ accounts, selectedId, selected, setSelectedId, isLoading }}>
      {children}
    </BusinessAccountContext.Provider>
  );
}

export const useBusinessAccount = () => useContext(BusinessAccountContext);
