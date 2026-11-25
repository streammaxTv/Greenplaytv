import React from 'react';
import {
  Bookmark,
  Film,
  Home,
  Radio,
  Search,
  Tv,
  User,
} from 'lucide-react';
import type {AuthSessionInfo} from '../types/catalog';
import {BrandLogo} from './BrandLogo';
import {PWAInstallPrompt} from './PWAInstallPrompt';

export type AppRoute =
  | 'home'
  | 'movies'
  | 'series'
  | 'live'
  | 'mylist'
  | 'search'
  | 'detail';

interface HeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  session: AuthSessionInfo;
  onOpenAccount: () => void;
}

const NAV_ITEMS: {route: AppRoute; label: string; icon: React.ComponentType<{className?: string}>}[] = [
  {route: 'home', label: 'Início', icon: Home},
  {route: 'movies', label: 'Filmes', icon: Film},
  {route: 'series', label: 'Séries', icon: Tv},
  {route: 'live', label: 'TV ao vivo', icon: Radio},
  {route: 'mylist', label: 'Minha lista', icon: Bookmark},
];

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  session,
  onOpenAccount,
}) => {
  return (
    <>
      {/* Desktop & Mobile Top Navigation */}
      <header className="sticky top-0 z-40 w-full bg-[#060807]/85 backdrop-blur-md border-b border-white/[0.06]">
        {/* Desktop Top Bar (3-zone contract) */}
        <div className="hidden md:flex items-center justify-between gap-8 max-w-[1440px] mx-auto h-16 px-6 lg:px-10">
          {/* Zone 1: Brand Wordmark */}
          <BrandLogo onClick={() => onNavigate('home')} />

          {/* Zone 2: Primary Navigation Links */}
          <nav className="flex items-center gap-7" aria-label="Navegação principal">
            {NAV_ITEMS.map((item) => {
              const isActive = activeRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded ${
                    isActive
                      ? 'text-[#F3F6F4]'
                      : 'text-[#9CA8A2] hover:text-[#F3F6F4]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-emerald-400 rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search, Install & Account Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('search')}
              className={`inline-flex items-center gap-2 min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeRoute === 'search'
                  ? 'bg-white/10 text-emerald-300'
                  : 'text-[#C3CEC8] hover:text-white hover:bg-white/[0.06]'
              }`}
              aria-label="Buscar catálogo"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">Buscar</span>
            </button>

            <PWAInstallPrompt />

            <button
              type="button"
              onClick={onOpenAccount}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[120px] truncate">
                {session.mode === 'demo' ? 'Conectar IPTV' : session.accountLabel}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Compact Top Bar (48px) */}
        <div className="flex md:hidden items-center justify-between h-12 px-4">
          <BrandLogo size="sm" onClick={() => onNavigate('home')} />
          <div className="flex items-center gap-1">
            <PWAInstallPrompt compact />
            <button
              type="button"
              onClick={() => onNavigate('search')}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeRoute === 'search' ? 'text-emerald-400' : 'text-[#C3CEC8]'
              }`}
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onOpenAccount}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-emerald-400 cursor-pointer"
              aria-label="Conta e conexão IPTV"
            >
              <User className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation (60px + safe area) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#060807]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
        aria-label="Navegação móvel"
      >
        <div className="grid grid-cols-5 h-[60px] items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  isActive ? 'text-emerald-400' : 'text-[#88968E]'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[10px] font-medium leading-none tracking-tight truncate max-w-[68px]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
