import React, {useState} from 'react';
import {AlertCircle, Eye, EyeOff, Link2, Loader2, Lock, Server, User} from 'lucide-react';
import {BrandLogo} from '../components/BrandLogo';
import {loginM3U, loginXtream} from '../services/iptvApi';
import type {AuthSessionInfo} from '../types/catalog';

interface LoginPageProps {
  onAuthenticated: (session: AuthSessionInfo) => void;
  onEnterDemo: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({onAuthenticated, onEnterDemo}) => {
  const [authMode, setAuthMode] = useState<'xtream' | 'm3u'>('xtream');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [m3uUrl, setM3uUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrlSyntax = (value: string): boolean => {
    try {
      const parsed = new URL(value.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleXtreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedServer = serverUrl.trim();
    const trimmedUser = username.trim();

    if (!trimmedServer || !trimmedUser || !password) {
      setError('Preencha a URL do servidor, usuário e senha.');
      return;
    }

    if (!validateUrlSyntax(trimmedServer)) {
      setError('Informe uma URL de servidor válida iniciando com http:// ou https://.');
      return;
    }

    setLoading(true);
    try {
      const {session} = await loginXtream({
        serverUrl: trimmedServer,
        username: trimmedUser,
        password,
      });
      onAuthenticated(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível validar suas credenciais IPTV.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleM3USubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedM3U = m3uUrl.trim();
    if (!trimmedM3U) {
      setError('Informe a URL completa da sua lista M3U.');
      return;
    }
    if (!validateUrlSyntax(trimmedM3U)) {
      setError('Informe uma URL M3U válida iniciando com http:// ou https://.');
      return;
    }

    setLoading(true);
    try {
      const {session} = await loginM3U({m3uUrl: trimmedM3U});
      onAuthenticated(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar a lista M3U informada.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#060807] flex flex-col lg:flex-row">
      {/* Left Cinematic Visual Panel (Desktop) */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[54%] overflow-hidden bg-[#090E0C]">
        <img
          src="/src/assets/images/hero_cinema_backdrop_1795629635479.jpg"
          alt="Ambiente cinematográfico GreenPlay TV"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060807] via-[#060807]/50 to-[#060807]/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#060807]" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <BrandLogo size="lg" />

          <div className="max-w-lg">
            <p className="text-xs font-medium tracking-wider uppercase text-emerald-400 mb-3">
              Streaming sob demanda e canais ao vivo
            </p>
            <h1 className="font-display text-4xl xl:text-5xl font-bold tracking-tight text-[#F3F6F4] leading-[1.1] [text-wrap:balance]">
              Sua lista IPTV com experiência de cinema.
            </h1>
            <p className="mt-4 text-base text-[#B7C4BC] leading-relaxed">
              Conecte seu servidor Xtream Codes ou lista M3U para navegar por filmes, séries com temporadas organizadas e canais ao vivo em um player integrado.
            </p>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex-1 flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-14 xl:px-20">
        <div className="w-full max-w-md mx-auto">
          <div className="lg:hidden mb-8">
            <BrandLogo size="lg" />
          </div>

          <div className="mb-7">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F6F4]">
              Conectar lista IPTV
            </h2>
            <p className="mt-2 text-sm text-[#9CA8A2]">
              Insira os dados fornecidos pelo seu provedor para carregar seu catálogo real.
            </p>
          </div>

          {/* Auth Mode Switcher */}
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0D1210] border border-white/[0.07] mb-6"
            role="tablist"
            aria-label="Formato da lista IPTV"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'xtream'}
              onClick={() => {
                setAuthMode('xtream');
                setError(null);
              }}
              className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                authMode === 'xtream'
                  ? 'bg-emerald-500 text-[#04120B] font-semibold'
                  : 'text-[#9CA8A2] hover:text-white'
              }`}
            >
              Xtream Codes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'm3u'}
              onClick={() => {
                setAuthMode('m3u');
                setError(null);
              }}
              className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                authMode === 'm3u'
                  ? 'bg-emerald-500 text-[#04120B] font-semibold'
                  : 'text-[#9CA8A2] hover:text-white'
              }`}
            >
              URL M3U Completa
            </button>
          </div>

          {error && (
            <div
              className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/35 bg-red-500/10 p-3.5 text-sm text-red-200"
              role="alert"
            >
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {authMode === 'xtream' ? (
            <form onSubmit={handleXtreamSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="iptv-server"
                  className="block text-xs font-medium text-[#C3CEC8] mb-1.5"
                >
                  URL do servidor / DNS
                </label>
                <div className="relative">
                  <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
                  <input
                    id="iptv-server"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://servidor-exemplo.com:8080"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    disabled={loading}
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="iptv-username"
                  className="block text-xs font-medium text-[#C3CEC8] mb-1.5"
                >
                  Usuário
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
                  <input
                    id="iptv-username"
                    type="text"
                    autoComplete="username"
                    placeholder="usuário fornecido pelo provedor"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="iptv-password"
                  className="block text-xs font-medium text-[#C3CEC8] mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
                  <input
                    id="iptv-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="senha fornecida pelo provedor"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full min-h-[46px] pl-10 pr-12 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#8C9B93] hover:text-white cursor-pointer"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] font-semibold text-sm transition-colors cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Validando credenciais...</span>
                  </>
                ) : (
                  <span>Entrar</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleM3USubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="iptv-m3u"
                  className="block text-xs font-medium text-[#C3CEC8] mb-1.5"
                >
                  URL completa da playlist M3U / M3U8
                </label>
                <div className="relative">
                  <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
                  <input
                    id="iptv-m3u"
                    type="url"
                    inputMode="url"
                    placeholder="https://servidor-exemplo.com/get.php?username=...&type=m3u_plus"
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    disabled={loading}
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
                  />
                </div>
                <p className="mt-2 text-xs text-[#8C9B93]">
                  Compatível com listas M3U/M3U Plus contendo canais ao vivo, filmes e séries.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] font-semibold text-sm transition-colors cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Carregando playlist M3U...</span>
                  </>
                ) : (
                  <span>Conectar lista M3U</span>
                )}
              </button>
            </form>
          )}

          {/* Demo Showcase Option (strictly separated, no fake streams) */}
          <div className="mt-8 pt-6 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onEnterDemo}
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-[#C3CEC8] hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              Explorar interface em modo demonstração (sem fontes de vídeo)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
