import React from "react";
import { AppConfig, WhatsAppStatus, GroupConfig, LogItem, HistoryItem } from "./types";
import { DashboardView } from "./components/DashboardView";
import { WhatsAppView } from "./components/WhatsAppView";
import { GroupsView } from "./components/GroupsView";
import { HistoryView } from "./components/HistoryView";
import { WhatsAppIcon } from "./components/WhatsAppIcon";
import { 
  Bot, 
  Smartphone, 
  Layers, 
  History, 
  Settings, 
  Bell, 
  User, 
  AlertCircle,
  HelpCircle,
  ExternalLink,
  DollarSign,
  Laptop,
  Monitor,
  Wifi,
  Signal,
  Battery,
  Menu,
  Download
} from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const [activeTab, setActiveTab] = React.useState<"dashboard" | "whatsapp" | "groups" | "history">("dashboard");
  
  // Platform Detection & Layout Customization
  const [detectedPlatform, setDetectedPlatform] = React.useState<"mobile" | "desktop">("desktop");
  const [layoutMode, setLayoutMode] = React.useState<"auto" | "mobile" | "desktop">("mobile");

  // Android Simulated Status Bar clock and PWA install states
  const [statusBarTime, setStatusBarTime] = React.useState("21:00");
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = React.useState(false);

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setStatusBarTime(now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation response: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  React.useEffect(() => {
    const detect = () => {
      const ua = navigator.userAgent;
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      
      if (isSmallScreen || isMobileUA || (isTouch && isSmallScreen)) {
        setDetectedPlatform("mobile");
      } else {
        setDetectedPlatform("desktop");
      }
    };

    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, []);

  const isMobileLayout = layoutMode === "mobile" || (layoutMode === "auto" && detectedPlatform === "mobile");

  // App States
  const [config, setConfig] = React.useState<AppConfig>({
    affiliateId: "heltonjulio1703",
    shopeeAffiliateId: "heltonjulio1703",
    mercadolivreAffiliateId: "heltonjulio1703",
    autoPilot: true,
    autoPilotInterval: 30,
    rewriteStyle: "excited",
    keywords: "promocao, cupom, desconto, oferta, achado, frete gratis, shopee, shp.ee",
    isTransmissionEnabled: true,
    shopeeEnabled: true,
    mercadolivreEnabled: true,
  });

  const [whatsapp, setWhatsapp] = React.useState<WhatsAppStatus>({
    status: "disconnected",
    phone: "",
    userName: "",
    qrCodeProgress: 0,
    connectedAt: null,
  });

  const [groups, setGroups] = React.useState<GroupConfig>({
    sources: [],
    targets: [],
  });

  const [logs, setLogs] = React.useState<LogItem[]>([]);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(window.isOfflineMode);

  // Toast State for iframe-safe external link guidance
  const [showToast, setShowToast] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState("");

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    // Dismiss after 7 seconds for optimal reading
    setTimeout(() => {
      setShowToast(false);
    }, 7000);
  };

  const handleOpenShopeePanel = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://afiliados.shopee.com.br/";
    
    // 1. Copy URL to clipboard immediately (requires user-initiated event context to work reliably)
    let copiedSuccessfully = false;
    try {
      const tempInput = document.createElement("textarea");
      tempInput.value = url;
      tempInput.setAttribute("readonly", "");
      tempInput.style.position = "absolute";
      tempInput.style.left = "-9999px";
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);
      copiedSuccessfully = true;
    } catch (err) {
      console.warn("Legacy copy failed, trying navigator API:", err);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url)
          .then(() => {
            triggerToast("🔗 Link copiado! Se o navegador bloqueou o painel devido ao sandbox, cole o link (Ctrl+V) em uma nova aba.");
          })
          .catch(() => {
            triggerToast("Copie o link manualmente: https://afiliados.shopee.com.br/");
          });
        return;
      }
    }

    // 2. Try to open the URL in a new window/tab
    try {
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (newWindow) {
        newWindow.focus();
        if (copiedSuccessfully) {
          triggerToast("🚀 Tentando abrir o Painel da Shopee em nova aba! O link também foi copiado (Ctrl+V) de forma segura.");
        }
      } else {
        triggerToast("🔗 Link copiado! O navegador bloqueou a abertura automática da janela por segurança (sandbox). Cole o link (Ctrl+V) em uma nova aba.");
      }
    } catch (err) {
      if (copiedSuccessfully) {
        triggerToast("🔗 Link copiado! O navegador bloqueou a abertura automática da janela por segurança (sandbox). Cole o link (Ctrl+V) em uma nova aba.");
      } else {
        triggerToast("Copie o link manualmente: https://afiliados.shopee.com.br/");
      }
    }
  };

  // Safe API Fetch Helper to guard against non-JSON/HTML error responses
  const safeJsonFetch = async <T = any>(url: string, init?: RequestInit): Promise<T | null> => {
    try {
      const r = await fetch(url, init);
      const contentType = r.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return null;
      }
      return await r.json();
    } catch (e) {
      return null;
    }
  };

  // Initial Data Load
  const fetchAllData = async () => {
    try {
      const [configRes, whatsappRes, groupsRes, logsRes, historyRes] = await Promise.all([
        safeJsonFetch<AppConfig>("/api/config"),
        safeJsonFetch<WhatsAppStatus>("/api/whatsapp/status"),
        safeJsonFetch<GroupConfig>("/api/groups"),
        safeJsonFetch<LogItem[]>("/api/logs"),
        safeJsonFetch<HistoryItem[]>("/api/history"),
      ]);

      if (configRes) setConfig(configRes);
      if (whatsappRes) setWhatsapp(whatsappRes);
      if (groupsRes) setGroups(groupsRes);
      if (logsRes) setLogs(logsRes);
      if (historyRes) setHistory(historyRes);
    } catch (err) {
      console.warn("Aviso ao carregar dados da API:", err);
    }
  };

  React.useEffect(() => {
    fetchAllData();

    // Check for offline/Vercel simulation mode
    const offlineTimer = setInterval(() => {
      setIsOffline(window.isOfflineMode);
    }, 500);

    // If actual backend is subsequently detected, disable offline/simulation and reload real data
    const handleBackendDetected = () => {
      setIsOffline(false);
      fetchAllData();
    };
    window.addEventListener("backend-detected", handleBackendDetected);

    // Set polling for logs, history and WhatsApp status so UI stays fully in sync
    const interval = setInterval(() => {
      safeJsonFetch<WhatsAppStatus>("/api/whatsapp/status").then((data) => {
        if (data) setWhatsapp(data);
      });

      safeJsonFetch<LogItem[]>("/api/logs").then((data) => {
        if (data) setLogs(data);
      });

      safeJsonFetch<HistoryItem[]>("/api/history").then((data) => {
        if (data) setHistory(data);
      });
    }, 1500);

    return () => {
      clearInterval(interval);
      clearInterval(offlineTimer);
      window.removeEventListener("backend-detected", handleBackendDetected);
    };
  }, []);

  const handleSaveConfig = async (newConfig: AppConfig) => {
    try {
      const data = await safeJsonFetch<any>("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (data && data.success) {
        setConfig(data.config);
        if (data.historyCleared || data.history) {
          setHistory(data.history || []);
        }
      }
    } catch (err) {
      console.warn("Aviso ao salvar config:", err);
    }
  };

  const handleSaveGroups = async (newGroups: GroupConfig) => {
    try {
      const data = await safeJsonFetch<any>("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGroups),
      });
      if (data && data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.warn("Aviso ao salvar grupos:", err);
    }
  };

  const handleConnectWhatsApp = async (phoneNumber?: string) => {
    try {
      const data = await safeJsonFetch<WhatsAppStatus>("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      if (data) setWhatsapp(data);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleConfirmScan = async () => {
    try {
      const data = await safeJsonFetch<WhatsAppStatus>("/api/whatsapp/confirm-scan", { method: "POST" });
      if (data) setWhatsapp(data);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      const data = await safeJsonFetch<WhatsAppStatus>("/api/whatsapp/disconnect", { method: "POST" });
      if (data) setWhatsapp(data);
      
      // Fetch and update groups and history states to immediately clear UI counts and data
      const [groupsRes, historyRes] = await Promise.all([
        safeJsonFetch<GroupConfig>("/api/groups"),
        safeJsonFetch<HistoryItem[]>("/api/history"),
      ]);
      if (groupsRes) setGroups(groupsRes);
      if (historyRes) setHistory(historyRes);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await safeJsonFetch("/api/logs/clear", { method: "POST" });
      setLogs([]);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleClearHistory = async () => {
    try {
      await safeJsonFetch("/api/history/clear", { method: "POST" });
      setHistory([]);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleRefreshLogsOnly = async () => {
    setIsRefreshing(true);
    try {
      const d = await safeJsonFetch<LogItem[]>("/api/logs");
      if (d) setLogs(d);
    } catch (err) {
      console.warn(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshHistoryOnly = async () => {
    try {
      const d = await safeJsonFetch<HistoryItem[]>("/api/history");
      if (d) setHistory(d);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleToggleTransmission = async () => {
    try {
      const data = await safeJsonFetch<any>("/api/transmission/toggle", { method: "POST" });
      if (data && data.success) {
        setConfig(prev => ({ ...prev, isTransmissionEnabled: data.isTransmissionEnabled }));
        if (data.historyCleared || !data.isTransmissionEnabled) {
          setHistory([]);
        } else if (data.history) {
          setHistory(data.history);
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const handleSimulateIncoming = async (sourceGroupId: string, messageText: string) => {
    try {
      await safeJsonFetch("/api/simulation/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGroupId, messageText }),
      });
      // Fetch latest history/logs immediately
      const [hRes, lRes] = await Promise.all([
        safeJsonFetch<HistoryItem[]>("/api/history"),
        safeJsonFetch<LogItem[]>("/api/logs"),
      ]);
      if (hRes) setHistory(hRes);
      if (lRes) setLogs(lRes);
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <div id="app-root-workspace" className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-indigo-600/10 selection:text-indigo-600">
      
      {/* Android Simulated Status Bar */}
      {isMobileLayout && (
        <div className="bg-indigo-700 text-white px-4 py-1.5 flex items-center justify-between text-[10px] font-bold tracking-wide select-none z-50 shrink-0">
          <div className="flex items-center gap-1.5">
            <span>{statusBarTime}</span>
            <div className={`w-1 h-1 rounded-full ${whatsapp.status === "connected" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
            <span className="text-[9px] font-black opacity-90">Robô Ativo</span>
          </div>
          <div className="flex items-center gap-2">
            <Signal className="w-3 h-3 opacity-90" />
            <Wifi className="w-3 h-3 opacity-90" />
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] font-bold opacity-90">100%</span>
              <Battery className="w-3.5 h-3.5 rotate-90 origin-center scale-90 opacity-90" />
            </div>
          </div>
        </div>
      )}

      {/* Top Professional Header Bar */}
      <header id="app-workspace-header" className={`${isMobileLayout ? "bg-indigo-600 text-white shadow-md border-none" : "bg-white border-b border-gray-100"} sticky top-0 z-40 shrink-0 transition-all`}>
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`${isMobileLayout ? "bg-white/15 text-white" : "bg-indigo-600 text-white"} p-2 rounded-xl flex items-center justify-center shadow-md shrink-0`}>
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              {!isMobileLayout && (
                <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase block truncate">Soluções Afiliados</span>
              )}
              <h1 className={`text-sm sm:text-base font-black tracking-tight truncate ${isMobileLayout ? "text-white" : "text-gray-800"}`}>Auto-Post Afiliados</h1>
            </div>
          </div>

          {/* Right quick connection badge */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Install Button for PWA on Android */}
            {showInstallBtn && isMobileLayout && (
              <button
                onClick={handleInstallApp}
                className="bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-600 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </button>
            )}

            {/* Transmission Toggle Button */}
            <button
              onClick={handleToggleTransmission}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                isMobileLayout 
                  ? config.isTransmissionEnabled 
                    ? "bg-white/15 text-white hover:bg-white/25 border border-white/10"
                    : "bg-red-500/80 text-white hover:bg-red-600/80 border border-red-400/20"
                  : config.isTransmissionEnabled 
                    ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200" 
                    : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${config.isTransmissionEnabled ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
              <span>{config.isTransmissionEnabled ? (isMobileLayout ? "LIGADO" : "ROBÔ LIGADO") : (isMobileLayout ? "DESLIGADO" : "ROBÔ DESLIGADO")}</span>
            </button>

            {/* Simulated Session Status Badges */}
            <div className={`px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 select-none ${
              isMobileLayout 
                ? whatsapp.status === "connected"
                  ? "bg-white/10 text-white border-white/10"
                  : "bg-white/5 text-white/70 border-white/5"
                : whatsapp.status === "connected"
                  ? "bg-green-50 text-green-700 border-green-150"
                  : "bg-gray-50 text-gray-500 border-gray-200"
            }`}>
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                whatsapp.status === "connected" ? "bg-green-400 animate-pulse" : "bg-gray-400"
              }`} />
              <span className={isMobileLayout ? "hidden xs:inline" : ""}>
                {whatsapp.status === "connected" ? "WhatsApp Conectado" : "WhatsApp Inativo"}
              </span>
              {isMobileLayout && whatsapp.status !== "connected" && <span className="xs:hidden">Off</span>}
              {isMobileLayout && whatsapp.status === "connected" && <span className="xs:hidden">On</span>}
            </div>

            {!isMobileLayout && (
              <>
                <div className="w-px h-6 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs">
                    HJ
                  </div>
                  <span className="hidden md:inline text-xs font-semibold text-gray-600">Helton Julio</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div 
        id="app-workspace-body" 
        className={`flex-1 max-w-7xl w-full mx-auto flex flex-col gap-5 ${
          isMobileLayout ? "px-2 py-4 pb-28" : "px-4 lg:px-6 py-6"
        }`}
      >
        {/* Platform Control Panel */}
        <div className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-semibold">
                {detectedPlatform === "mobile" ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Plataforma: </span>
                <span className="font-bold text-indigo-600 bg-indigo-50/50 px-2.5 py-0.5 rounded-full capitalize">
                  {detectedPlatform === "mobile" ? "📱 Celular Detectado" : "💻 Computador Detectado"}
                </span>
              </div>
            </div>
            {isOffline && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-amber-800 bg-amber-50 border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                <span className="font-bold">Modo de Demonstração (Vercel) Ativo</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
            <button
              onClick={() => setLayoutMode("auto")}
              className={`px-2.5 py-1.5 rounded-md font-bold text-[11px] transition-all cursor-pointer ${
                layoutMode === "auto"
                  ? "bg-white text-slate-800 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setLayoutMode("desktop")}
              className={`px-2.5 py-1.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                layoutMode === "desktop"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-indigo-600"
              }`}
            >
              <Laptop className="w-3 h-3" />
              Desktop
            </button>
            <button
              onClick={() => setLayoutMode("mobile")}
              className={`px-2.5 py-1.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                layoutMode === "mobile"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-indigo-600"
              }`}
            >
              <Smartphone className="w-3 h-3" />
              Mobile
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar - Top for Desktop, Bottom Fixed for Mobile */}
        {!isMobileLayout ? (
          <nav id="app-navigation-tabs" className="bg-white p-1 rounded-xl border border-gray-150 flex flex-wrap gap-1 sticky top-18 z-30 shadow-xs">
            {[
              { id: "dashboard", label: "Painel de Controle", icon: Bot },
              { id: "whatsapp", label: "Conexão WhatsApp", customIcon: <WhatsAppIcon className="w-4 h-4 shrink-0" />, badge: whatsapp.status !== "connected" ? "!" : undefined },
              { id: "groups", label: "Grupos e Canais", icon: Layers, badge: `${groups.sources.filter(s => s.active).length}»${groups.targets.filter(t => t.active).length}` },
              { id: "history", label: "Histórico de Envios", icon: History, badge: history.length > 0 ? String(history.length) : undefined },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/10"
                      : "text-gray-500 hover:text-gray-800 hover:bg-slate-50"
                  }`}
                >
                  {tab.customIcon ? tab.customIcon : Icon && <Icon className="w-4 h-4 shrink-0" />}
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide ${
                      isActive 
                        ? "bg-indigo-800 text-indigo-100" 
                        : tab.badge === "!"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          /* High-Fidelity Fixed Mobile Bottom Navigation Tab bar - Material Design 3 Android compliant */
          <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-150 py-3 pb-safe-bottom px-3 z-50 flex items-center justify-around shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            {[
              { id: "dashboard", label: "Painel", icon: Bot },
              { id: "whatsapp", label: "WhatsApp", customIcon: <WhatsAppIcon className="w-5 h-5 transition-transform group-active:scale-95" />, badge: whatsapp.status !== "connected" ? "!" : undefined },
              { id: "groups", label: "Grupos", icon: Layers, badge: `${groups.sources.filter(s => s.active).length}»${groups.targets.filter(t => t.active).length}` },
              { id: "history", label: "Histórico", icon: History, badge: history.length > 0 ? String(history.length) : undefined },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className="flex flex-col items-center justify-center flex-1 relative cursor-pointer group"
                >
                  <div className={`px-5 py-1 rounded-full transition-all duration-200 flex items-center justify-center relative ${
                    isActive ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:text-slate-800"
                  }`}>
                    {tab.customIcon ? tab.customIcon : Icon && <Icon className="w-5 h-5 transition-transform group-active:scale-95" />}
                    {tab.badge && (
                      <span className={`absolute -top-1 -right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold leading-none ${
                        isActive 
                          ? "bg-indigo-600 text-white" 
                          : tab.badge === "!"
                            ? "bg-amber-500 text-white animate-pulse"
                            : "bg-indigo-600 text-white"
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold mt-1 tracking-tight transition-colors duration-200 ${
                    isActive ? "text-indigo-700 font-extrabold" : "text-slate-500"
                  }`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Tab View Switcher with animations */}
        <main id="app-view-viewport" className="flex-1 min-h-[500px]">
          {activeTab === "dashboard" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardView
                config={config}
                setConfig={setConfig}
                saveConfig={handleSaveConfig}
                logs={logs}
                clearLogs={handleClearLogs}
                whatsappConnected={whatsapp.status === "connected"}
                onRefreshLogs={handleRefreshLogsOnly}
                onOpenShopeePanel={handleOpenShopeePanel}
              />
            </motion.div>
          )}

          {activeTab === "whatsapp" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <WhatsAppView
                status={whatsapp}
                onConnect={handleConnectWhatsApp}
                onConfirmScan={handleConfirmScan}
                onDisconnect={handleDisconnectWhatsApp}
                isOffline={isOffline}
              />
            </motion.div>
          )}

          {activeTab === "groups" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <GroupsView
                groups={groups}
                saveGroups={handleSaveGroups}
                whatsappConnected={whatsapp.status === "connected"}
                onRefreshHistory={handleRefreshHistoryOnly}
              />
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HistoryView
                history={history}
                clearHistory={handleClearHistory}
                onRefreshHistory={handleRefreshHistoryOnly}
              />
            </motion.div>
          )}
        </main>

      </div>

      {/* Footer copyright info */}
      <footer id="app-workspace-footer" className="bg-white border-t border-gray-100 py-6 mt-12 text-center text-xs text-gray-400 shrink-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026. Todos os direitos reservados.</p>
          {config.customFooter && (
            <div className="flex gap-4">
              <span className="flex items-center gap-1 font-medium text-purple-600">
                {config.customFooter}
              </span>
            </div>
          )}
        </div>
      </footer>

      {/* Toast Notification for Link Copy / Actions (Iframe-safe) */}
      {showToast && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 max-w-sm bg-slate-900/95 backdrop-blur text-white p-4 rounded-xl shadow-2xl border border-slate-800 flex gap-3 items-start"
        >
          <div className="p-1 bg-orange-500 rounded-lg text-white shrink-0 mt-0.5">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="flex-1 space-y-1">
            <span className="font-bold text-xs block text-orange-400">Painel Shopee Afiliados</span>
            <p className="text-[11px] text-slate-300 leading-normal">{toastMessage}</p>
          </div>
          <button 
            onClick={() => setShowToast(false)} 
            className="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 hover:bg-slate-800 rounded transition-colors"
          >
            ×
          </button>
        </motion.div>
      )}

    </div>
  );
}
