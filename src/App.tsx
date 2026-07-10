import React from "react";
import { AppConfig, WhatsAppStatus, GroupConfig, LogItem, HistoryItem } from "./types";
import { DashboardView } from "./components/DashboardView";
import { WhatsAppView } from "./components/WhatsAppView";
import { GroupsView } from "./components/GroupsView";
import { HistoryView } from "./components/HistoryView";
import { SandboxView } from "./components/SandboxView";
import { 
  Bot, 
  Smartphone, 
  Layers, 
  History, 
  FlaskConical, 
  Settings, 
  Bell, 
  User, 
  AlertCircle,
  HelpCircle,
  ExternalLink,
  DollarSign
} from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const [activeTab, setActiveTab] = React.useState<"dashboard" | "whatsapp" | "groups" | "history" | "sandbox">("dashboard");
  
  // App States
  const [config, setConfig] = React.useState<AppConfig>({
    affiliateId: "heltonjulio1703",
    autoPilot: true,
    autoPilotInterval: 30,
    rewriteStyle: "excited",
    keywords: "promocao, cupom, desconto, oferta, achado, frete gratis, shopee, shp.ee",
    isTransmissionEnabled: true,
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

  // Initial Data Load
  const fetchAllData = async () => {
    try {
      const [configRes, whatsappRes, groupsRes, logsRes, historyRes] = await Promise.all([
        fetch("/api/config").then(r => r.json()),
        fetch("/api/whatsapp/status").then(r => r.json()),
        fetch("/api/groups").then(r => r.json()),
        fetch("/api/logs").then(r => r.json()),
        fetch("/api/history").then(r => r.json()),
      ]);

      setConfig(configRes);
      setWhatsapp(whatsappRes);
      setGroups(groupsRes);
      setLogs(logsRes);
      setHistory(historyRes);
    } catch (err) {
      console.error("Erro ao carregar dados da API:", err);
    }
  };

  React.useEffect(() => {
    fetchAllData();

    // Set polling for logs, history and WhatsApp status so UI stays fully in sync
    const interval = setInterval(() => {
      fetch("/api/whatsapp/status")
        .then((r) => r.json())
        .then((data) => setWhatsapp(data))
        .catch((e) => console.error(e));

      fetch("/api/logs")
        .then((r) => r.json())
        .then((data) => setLogs(data))
        .catch((e) => console.error(e));

      fetch("/api/history")
        .then((r) => r.json())
        .then((data) => setHistory(data))
        .catch((e) => console.error(e));
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = async (newConfig: AppConfig) => {
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Erro ao salvar config:", err);
    }
  };

  const handleSaveGroups = async (newGroups: GroupConfig) => {
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGroups),
      });
      const data = await response.json();
      if (data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error("Erro ao salvar grupos:", err);
    }
  };

  const handleConnectWhatsApp = async () => {
    try {
      const response = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await response.json();
      setWhatsapp(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmScan = async () => {
    try {
      const response = await fetch("/api/whatsapp/confirm-scan", { method: "POST" });
      const data = await response.json();
      setWhatsapp(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      const response = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const data = await response.json();
      setWhatsapp(data);
      
      // Fetch and update groups and history states to immediately clear UI counts and data
      const [groupsRes, historyRes] = await Promise.all([
        fetch("/api/groups").then(r => r.json()),
        fetch("/api/history").then(r => r.json()),
      ]);
      setGroups(groupsRes);
      setHistory(historyRes);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      setLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch("/api/history/clear", { method: "POST" });
      setHistory([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshLogsOnly = async () => {
    setIsRefreshing(true);
    try {
      const r = await fetch("/api/logs");
      const d = await r.json();
      setLogs(d);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshHistoryOnly = async () => {
    try {
      const r = await fetch("/api/history");
      const d = await r.json();
      setHistory(d);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTransmission = async () => {
    try {
      const response = await fetch("/api/transmission/toggle", { method: "POST" });
      const data = await response.json();
      if (data.success) {
        setConfig(prev => ({ ...prev, isTransmissionEnabled: data.isTransmissionEnabled }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSimulateIncoming = async (sourceGroupId: string, messageText: string) => {
    try {
      await fetch("/api/simulation/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGroupId, messageText }),
      });
      // Fetch latest history/logs immediately
      const [hRes, lRes] = await Promise.all([
        fetch("/api/history").then(r => r.json()),
        fetch("/api/logs").then(r => r.json()),
      ]);
      setHistory(hRes);
      setLogs(lRes);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="app-root-workspace" className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-indigo-600/10 selection:text-indigo-600">
      
      {/* Top Professional Header Bar */}
      <header id="app-workspace-header" className="bg-white border-b border-gray-100 sticky top-0 z-40 shrink-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/10">
              <Bot className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase block">Soluções Afiliados</span>
              <h1 className="text-base font-black text-gray-800 tracking-tight">Robô Shopee Auto-Post</h1>
            </div>
          </div>

          {/* Right quick connection badge */}
          <div className="flex items-center gap-4">
            
            {/* Transmission Toggle Button */}
            <button
              onClick={handleToggleTransmission}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                config.isTransmissionEnabled 
                  ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200" 
                  : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${config.isTransmissionEnabled ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              {config.isTransmissionEnabled ? "ROBÔ LIGADO" : "ROBÔ DESLIGADO"}
            </button>

            {/* Shopee Program Helper */}
            <a 
              href="https://afiliados.shopee.com.br/"
              onClick={handleOpenShopeePanel}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Acessar painel ou copiar link"
            >
              <DollarSign className="w-3.5 h-3.5 text-orange-600" />
              <span className="hidden md:inline">Painel Shopee Afiliados</span>
              <span className="inline md:hidden">Painel Shopee</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
            </a>

            {/* Simulated Session Status Badges */}
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 select-none ${
              whatsapp.status === "connected"
                ? "bg-green-50 text-green-700 border-green-150"
                : "bg-gray-50 text-gray-500 border-gray-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                whatsapp.status === "connected" ? "bg-green-500 animate-pulse" : "bg-gray-400"
              }`} />
              {whatsapp.status === "connected" ? "WhatsApp Conectado" : "WhatsApp Inativo"}
            </div>

            <div className="w-px h-6 bg-gray-200" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs">
                HJ
              </div>
              <span className="hidden md:inline text-xs font-semibold text-gray-600">Helton Julio</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div id="app-workspace-body" className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 flex flex-col gap-6">
        
        {/* Navigation Tabs Bar */}
        <nav id="app-navigation-tabs" className="bg-white p-1 rounded-xl border border-gray-150 flex flex-wrap gap-1 sticky top-18 z-30 shadow-xs">
          {[
            { id: "dashboard", label: "Painel de Controle", icon: Bot },
            { id: "whatsapp", label: "Conexão WhatsApp", icon: Smartphone, badge: whatsapp.status !== "connected" ? "!" : undefined },
            { id: "groups", label: "Grupos e Canais", icon: Layers, badge: `${groups.sources.filter(s => s.active).length}»${groups.targets.filter(t => t.active).length}` },
            { id: "history", label: "Histórico de Envios", icon: History, badge: history.length > 0 ? String(history.length) : undefined },
            { id: "sandbox", label: "Laboratório de Testes", icon: FlaskConical },
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
                <Icon className="w-4 h-4 shrink-0" />
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

          {activeTab === "sandbox" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SandboxView
                groups={groups}
                onSimulateIncoming={handleSimulateIncoming}
                whatsappConnected={whatsapp.status === "connected"}
              />
            </motion.div>
          )}
        </main>

      </div>

      {/* Footer copyright info */}
      <footer id="app-workspace-footer" className="bg-white border-t border-gray-100 py-6 mt-12 text-center text-xs text-gray-400 shrink-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Robô Shopee Afiliados para WhatsApp. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              Desenvolvido com o modelo Gemini 3.5 Flash
            </span>
          </div>
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
