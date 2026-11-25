import React from 'react';
import {WifiOff} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-5 left-4 right-4 sm:right-auto z-50 flex items-center gap-2.5 rounded-xl border border-amber-500/35 bg-[#121614]/95 backdrop-blur-md px-4 py-2.5 text-xs font-medium text-amber-200 shadow-xl"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
      <span>Sem conexão com a internet. Transmissões ao vivo e catálogos online requerem rede ativa.</span>
    </div>
  );
};
