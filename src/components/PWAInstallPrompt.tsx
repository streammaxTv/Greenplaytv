import React, {useState} from 'react';
import {Download, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallPrompt: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        title="Instalar GreenPlay TV como aplicativo"
      >
        <Download className="h-4 w-4 shrink-0" />
        {!compact && <span>Instalar app</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-[#D1DBD5] text-xs font-medium hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-4 w-4 shrink-0 text-emerald-400" />
          {!compact && <span>Instalar</span>}
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0D1210] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-pwa-title" className="text-lg font-semibold text-[#F3F6F4]">
                  Instalar no iPhone ou iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-[#9CA8A2] hover:text-white cursor-pointer"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-[#C3CEC8]">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-emerald-400 font-semibold">1.</span>
                  <span>
                    Toque no botão <strong className="text-white inline-flex items-center gap-1">Compartilhar <Share className="h-3.5 w-3.5 inline" /></strong> na barra do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-emerald-400 font-semibold">2.</span>
                  <span>
                    Role as opções e toque em <strong className="text-white">Adicionar à Tela de Início</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
