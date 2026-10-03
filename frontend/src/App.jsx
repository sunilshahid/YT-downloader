import { useState, useEffect, useRef, Component } from 'react';
import PillNav from './components/PillNav';
import HomeTab from './components/HomeTab';
import DownloadingTab from './components/DownloadingTab';
import SettingsTab from './components/SettingsTab';
import IncognitoIcon from './components/IncognitoIcon';
import useWebSocket from './hooks/useWebSocket';
import useSettings from './hooks/useSettings';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 my-8 rounded-2xl bg-zinc-900 border border-red-500/30 text-center space-y-4">
          <p className="text-base font-semibold text-red-400">Something went wrong rendering this section</p>
          <p className="text-xs text-zinc-400 font-mono max-w-lg mx-auto break-words">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-semibold hover:bg-red-500/30 transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [downloadSubTab, setDownloadSubTab] = useState('running');
  const { downloads, isConnected } = useWebSocket();
  const { settings, updateSetting, refetchSettings, isLoading: settingsLoading, isSaving } = useSettings();

  // Automatically refresh settings when connection is restored
  const prevConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (!prevConnectedRef.current && isConnected) {
      refetchSettings?.();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, refetchSettings]);

  // Apply theme dynamically to documentElement and body
  useEffect(() => {
    const applyTheme = (themeName) => {
      let resolved = themeName || 'dark';
      if (resolved === 'system') {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = isDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      document.body.setAttribute('data-theme', resolved);
    };

    applyTheme(settings?.theme);

    if (settings?.theme === 'system' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        const resolved = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', resolved);
        document.body.setAttribute('data-theme', resolved);
      };
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
  }, [settings?.theme]);

  const handleNavigateToDownloads = (subTab = 'running') => {
    setDownloadSubTab(subTab);
    setActiveTab('downloading');
  };

  return (
    <div className="min-h-screen bg-zinc-950 relative flex flex-col pt-12 sm:pt-8 px-3.5 sm:px-6 lg:px-8">
      {/* Ambient Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40 flex items-center gap-2 sm:gap-3 bg-zinc-900/80 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none px-2.5 sm:px-0 py-1 sm:py-0 rounded-full border border-zinc-800/60 sm:border-transparent">
        {settings?.incognito_mode && (
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] sm:text-xs font-semibold shadow-lg shadow-purple-500/10 backdrop-blur-md animate-fade-in">
            <IncognitoIcon size={13} className="text-purple-400" />
            <span className="hidden xs:inline">Incognito Active</span>
            <span className="xs:hidden">Incognito</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/60' : 'bg-red-500 animate-pulse shadow-sm shadow-red-500/60'}`} />
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide uppercase transition-colors duration-300 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto overflow-y-auto pb-24 hide-scrollbar">
        {/* Tab Content — Kept mounted to preserve state across tab switches */}
        <ErrorBoundary>
          <main className="relative">
            <div className={activeTab === 'home' ? 'block animate-fade-in' : 'hidden'}>
              <HomeTab settings={settings} onNavigate={handleNavigateToDownloads} />
            </div>
            <div className={activeTab === 'downloading' ? 'block animate-fade-in' : 'hidden'}>
              <DownloadingTab 
                downloads={downloads} 
                activeTab={downloadSubTab} 
                onTabChange={setDownloadSubTab} 
                settings={settings}
              />
            </div>
            <div className={activeTab === 'settings' ? 'block animate-fade-in' : 'hidden'}>
              <SettingsTab
                settings={settings}
                updateSetting={updateSetting}
                refetchSettings={refetchSettings}
                isLoading={settingsLoading}
                isSaving={isSaving}
              />
            </div>
          </main>
        </ErrorBoundary>
      </div>

      {/* Floating Pill Navigation */}
      <PillNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
