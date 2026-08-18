import React from "react";
import { GroupConfig } from "../types";
import { 
  Trash2, 
  RefreshCw, 
  Smartphone, 
  Search, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Activity, 
  Play, 
  Sparkles, 
  Clock, 
  ShieldCheck 
} from "lucide-react";

interface GroupsViewProps {
  groups: GroupConfig;
  saveGroups: (newGroups: GroupConfig) => Promise<void>;
  whatsappConnected?: boolean;
  onRefreshHistory?: () => Promise<void>;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ groups, saveGroups, whatsappConnected = false, onRefreshHistory }) => {
  const [activeTab, setActiveTab] = React.useState<"sources" | "targets" | "scan">("sources");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [scanningGroupId, setScanningGroupId] = React.useState<string | null>(null);
  
  // Dynamic scanning progress state
  const [scanProgress, setScanProgress] = React.useState<number>(0);
  const [scanStage, setScanStage] = React.useState<string>("");
  const [currentScanningName, setCurrentScanningName] = React.useState<string>("");

  const [scanResult, setScanResult] = React.useState<{ 
    groupId: string; 
    groupName: string;
    message: string; 
    success: boolean;
    totalFound?: number;
    processedCount?: number;
    messageCount?: number;
    timestamp?: string;
  } | null>(null);

  const [lastScanInfo, setLastScanInfo] = React.useState<{
    groupId?: string;
    groupName: string;
    timestamp: string;
    success: boolean;
    message: string;
    totalFound?: number;
    processedCount?: number;
    messageCount?: number;
  } | null>(null);

  // Show synchronized WhatsApp groups (@g.us) or all available groups
  const displayedSources = groups.sources.some((g) => g.id.endsWith("@g.us"))
    ? groups.sources.filter((g) => g.id.endsWith("@g.us"))
    : groups.sources;

  const displayedTargets = groups.targets.some((g) => g.id.endsWith("@g.us"))
    ? groups.targets.filter((g) => g.id.endsWith("@g.us"))
    : groups.targets;

  // Automatic group synchronization routine
  React.useEffect(() => {
    let isMounted = true;

    const performAutoSync = async () => {
      try {
        const response = await fetch("/api/whatsapp/sync-groups", { method: "POST" });
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
          return;
        }
        const data = await response.json();
        if (isMounted && data.success && data.groups) {
          await saveGroups(data.groups);
        }
      } catch (err) {
        // Silent catch for background auto-sync
      }
    };

    // Initial sync on component mount
    performAutoSync();

    // Periodic auto-sync every 15 seconds
    const interval = setInterval(performAutoSync, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleToggleActive = async (id: string, type: "sources" | "targets") => {
    const listToUpdate = [...groups[type]];
    const updatedList = listToUpdate.map((g) => {
      if (g.id === id) {
        return { ...g, active: !g.active };
      }
      return g;
    });

    const newGroups = {
      ...groups,
      [type]: updatedList,
    };
    await saveGroups(newGroups);
  };

  const handleSyncWhatsAppGroups = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/whatsapp/sync-groups", {
        method: "POST",
      });
      const contentType = response.headers.get("content-type");
      if (!response.ok || !contentType || !contentType.includes("application/json")) {
        setSyncMessage("Erro na resposta do servidor.");
        return;
      }
      const data = await response.json();
      if (data.success) {
        await saveGroups(data.groups);
        setSyncMessage("Lista atualizada!");
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage(data.error || "Erro ao atualizar.");
      }
    } catch (err) {
      console.warn("Aviso ao sincronizar:", err);
      setSyncMessage("Erro na conexão.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteItem = async (id: string, type: "sources" | "targets") => {
    const filteredList = groups[type].filter((g) => g.id !== id);
    const newGroups = {
      ...groups,
      [type]: filteredList,
    };
    await saveGroups(newGroups);
  };

  // Perform single group scan with realistic progression steps
  const handleScanToday = async (groupId: string) => {
    const targetGroup = groups.sources.find((g) => g.id === groupId);
    const groupName = targetGroup ? targetGroup.name : "Grupo de Origem";

    setScanningGroupId(groupId);
    setCurrentScanningName(groupName);
    setScanResult(null);
    setScanProgress(15);
    setScanStage("Iniciando conexão com o chat do WhatsApp...");

    // Simulated smooth progress updates while server processes
    const p1 = setTimeout(() => {
      setScanProgress(40);
      setScanStage("Lendo mensagens a partir do horário de ativação do robô...");
    }, 350);

    const p2 = setTimeout(() => {
      setScanProgress(70);
      setScanStage("Identificando links da Shopee e capturando dados...");
    }, 850);

    const p3 = setTimeout(() => {
      setScanProgress(90);
      setScanStage("Reescrevendo texto com IA e verificando duplicações...");
    }, 1450);

    try {
      const response = await fetch("/api/whatsapp/scan-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const contentType = response.headers.get("content-type");
      let data: any = {};
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = { success: false, error: "Servidor retornou resposta inválida." };
      }

      clearTimeout(p1);
      clearTimeout(p2);
      clearTimeout(p3);

      setScanProgress(100);
      setScanStage("Varredura concluída!");

      const scanData = {
        groupId,
        groupName,
        message: data.message || (data.processedCount > 0 
          ? `Sucesso! ${data.processedCount} oferta(s) encaminhada(s).`
          : `Nenhuma oferta nova encontrada.`),
        success: !!data.success,
        totalFound: data.totalFound ?? 0,
        processedCount: data.processedCount ?? 0,
        messageCount: data.messageCount ?? 0,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      };

      if (data.success) {
        setScanResult(scanData);
        setLastScanInfo(scanData);
        if (onRefreshHistory) {
          await onRefreshHistory();
        }
      } else {
        const errorData = {
          groupId,
          groupName,
          message: data.error || "Erro ao buscar mensagens do grupo.",
          success: false,
          timestamp: new Date().toLocaleTimeString("pt-BR"),
        };
        setScanResult(errorData);
        setLastScanInfo(errorData);
      }
    } catch (err) {
      clearTimeout(p1);
      clearTimeout(p2);
      clearTimeout(p3);
      console.error(err);
      const errData = {
        groupId,
        groupName,
        message: "Erro de conexão com o servidor ao realizar varredura.",
        success: false,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      };
      setScanResult(errData);
      setLastScanInfo(errData);
      setScanProgress(100);
      setScanStage("Falha na varredura");
    } finally {
      setTimeout(() => {
        setScanningGroupId(null);
      }, 400);
    }
  };

  // Perform bulk scan on all active source groups sequentially
  const handleScanAllSources = async () => {
    const activeSources = displayedSources.filter((s) => s.active);
    if (activeSources.length === 0) {
      setLastScanInfo({
        groupName: "Todos os Grupos Ativos",
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        success: false,
        message: "Nenhum grupo de origem está marcado como ativo. Ative ao menos um grupo para realizar a varredura.",
      });
      setActiveTab("scan");
      return;
    }

    setActiveTab("scan");
    setScanResult(null);

    for (let i = 0; i < activeSources.length; i++) {
      const g = activeSources[i];
      await handleScanToday(g.id);
    }
  };

  return (
    <div id="groups-view-container" className="space-y-6">
      {/* WhatsApp Groups Sincronizador Card */}
      <div id="whatsapp-sync-control-card" className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl flex items-center justify-center">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-800 text-sm">Integração com Grupos do WhatsApp</h4>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sincronização Automática Ativa
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Os grupos do seu WhatsApp são detectados e sincronizados automaticamente em segundo plano. Utilize o botão ao lado caso queira forçar a atualização imediata.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
          {syncMessage && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
              {syncMessage}
            </span>
          )}
          <button
            id="sync-wa-groups-btn"
            type="button"
            onClick={handleSyncWhatsAppGroups}
            disabled={isSyncing}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer ${
              isSyncing 
                ? "bg-emerald-400 cursor-not-allowed" 
                : "bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/10"
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Atualizando..." : "Atualizar Grupos"}
          </button>
        </div>
      </div>

      {/* Tabs navigation for searching, sending, and dedicated scan monitor */}
      <div id="groups-subtabs-navigation" className="flex border-b border-gray-200 bg-white rounded-t-2xl overflow-hidden shadow-xs border-x border-t">
        <button
          id="tab-search-announcements"
          type="button"
          onClick={() => setActiveTab("sources")}
          className={`flex-1 py-4 px-4 text-center border-b-2 font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-2 ${
            activeTab === "sources"
              ? "border-indigo-600 text-indigo-600 bg-indigo-50/30"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
          }`}
        >
          <Search className={`w-4 h-4 ${activeTab === "sources" ? "text-indigo-600" : "text-gray-400"}`} />
          <div className="flex flex-col items-start sm:items-center">
            <span className="text-xs sm:text-sm">1. Buscar Anúncios (Origens)</span>
            <span className="text-[10px] text-indigo-500 font-medium">
              {displayedSources.filter(g => g.active).length} de {displayedSources.length} ativos
            </span>
          </div>
        </button>

        <button
          id="tab-send-announcements"
          type="button"
          onClick={() => setActiveTab("targets")}
          className={`flex-1 py-4 px-4 text-center border-b-2 font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-2 ${
            activeTab === "targets"
              ? "border-emerald-600 text-emerald-600 bg-emerald-50/30"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
          }`}
        >
          <Send className={`w-4 h-4 ${activeTab === "targets" ? "text-emerald-600" : "text-gray-400"}`} />
          <div className="flex flex-col items-start sm:items-center">
            <span className="text-xs sm:text-sm">2. Mandar Anúncios (Destinos)</span>
            <span className="text-[10px] text-emerald-500 font-medium">
              {displayedTargets.filter(g => g.active).length} de {displayedTargets.length} ativos
            </span>
          </div>
        </button>

        <button
          id="tab-scan-status-monitor"
          type="button"
          onClick={() => setActiveTab("scan")}
          className={`flex-1 py-4 px-4 text-center border-b-2 font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-2 ${
            activeTab === "scan"
              ? "border-amber-600 text-amber-700 bg-amber-50/40"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
          }`}
        >
          <Activity className={`w-4 h-4 ${scanningGroupId ? "text-amber-600 animate-spin" : activeTab === "scan" ? "text-amber-600" : "text-gray-400"}`} />
          <div className="flex flex-col items-start sm:items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm">3. Painel de Varredura</span>
              {scanningGroupId && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </div>
            <span className="text-[10px] text-amber-600 font-medium">
              {scanningGroupId ? "Em andamento..." : lastScanInfo ? "Resultado disponível" : "Status & Progresso"}
            </span>
          </div>
        </button>
      </div>

      {/* Tab Panels */}
      <div id="groups-panels-container" className="bg-white rounded-b-2xl border-x border-b border-gray-150 p-6 min-h-[420px] flex flex-col">
        {activeTab === "sources" && (
          /* Source Groups Panel */
          <div id="source-groups-panel" className="flex flex-col flex-1">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 pb-4 mb-4 gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                <h3 className="text-lg font-bold text-gray-800">Grupos de Origem para Buscar Anúncios</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="scan-all-active-btn"
                  type="button"
                  onClick={handleScanAllSources}
                  disabled={!whatsappConnected || !!scanningGroupId}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-amber-700 text-amber-700" />
                  <span>Varrer Todos os Grupos Ativos</span>
                </button>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-bold">
                  {displayedSources.filter(g => g.active).length} ativos
                </span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-900">
                <span className="flex h-2 w-2 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-bold">Modo Tempo Real:</span>
                <span className="text-emerald-800">
                  O robô monitora e processa as mensagens <strong>ao vivo no momento exato em que são postadas</strong> nos grupos de origem ativos abaixo.
                </span>
              </div>
              <span className="bg-emerald-200 text-emerald-900 font-bold px-2.5 py-0.5 rounded-full text-[10px] shrink-0 border border-emerald-300">
                Live Push Ativo
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1 max-h-[420px]">
              {displayedSources.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl border border-dashed border-gray-200">
                  <Search className="w-8 h-8 text-slate-300" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-600">Nenhum grupo de monitoramento sincronizado</span>
                    <span className="text-xs text-slate-400 max-w-sm mt-1 mx-auto">
                      Clique no botão "Sincronizar Grupos do WhatsApp" acima para carregar e ativar seus canais reais de chat de origem.
                    </span>
                  </div>
                </div>
              ) : (
                displayedSources.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1">
                    <div
                      id={`source-group-${group.id}`}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                        group.active
                          ? "bg-indigo-50/20 border-indigo-150"
                          : "bg-gray-50/50 border-gray-100 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          id={`checkbox-source-${group.id}`}
                          checked={group.active}
                          onChange={() => handleToggleActive(group.id, "sources")}
                          className="w-4.5 h-4.5 text-indigo-600 border-gray-300 rounded-sm focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <label
                            htmlFor={`checkbox-source-${group.id}`}
                            className="text-sm font-semibold text-gray-700 cursor-pointer select-none truncate"
                          >
                            {group.name}
                          </label>
                          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0 animate-pulse" />
                            Grupo WhatsApp Real
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          id={`scan-today-btn-${group.id}`}
                          type="button"
                          onClick={() => handleScanToday(group.id)}
                          disabled={!whatsappConnected || scanningGroupId === group.id}
                          title={!whatsappConnected ? "Conecte o WhatsApp para buscar ofertas" : "Buscar e encaminhar ofertas a partir da ativação do robô sem repetição"}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            scanningGroupId === group.id
                              ? "bg-amber-100 text-amber-800 cursor-wait border border-amber-200"
                              : !whatsappConnected
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-60"
                                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${scanningGroupId === group.id ? "animate-spin text-amber-600" : ""}`} />
                          <span>{scanningGroupId === group.id ? "Varrendo..." : "Buscar Ofertas (Ativação)"}</span>
                        </button>

                        <button
                          id={`delete-source-btn-${group.id}`}
                          type="button"
                          onClick={() => handleDeleteItem(group.id, "sources")}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Active Progress Bar Container for this specific item */}
                    {scanningGroupId === group.id && (
                      <div className="mt-2.5 p-4 bg-amber-50/95 border border-amber-200/90 rounded-2xl space-y-2.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                          <span className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-amber-700 animate-spin" />
                            <span>Buscando ofertas em "{group.name}"...</span>
                          </span>
                          <span className="bg-amber-200/80 px-2 py-0.5 rounded-md text-[11px] font-mono text-amber-900">
                            {scanProgress}%
                          </span>
                        </div>

                        {/* Animated Progress Bar */}
                        <div className="w-full bg-amber-200/60 rounded-full h-3.5 overflow-hidden border border-amber-300/60 shadow-inner">
                          <div 
                            className="bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 h-full transition-all duration-300 ease-out shadow-sm flex items-center justify-end pr-1.5"
                            style={{ width: `${scanProgress}%` }}
                          >
                            <span className="text-[9px] font-black text-white">{scanProgress}%</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-amber-800 font-medium pt-0.5">
                          <span>{scanStage}</span>
                          <span className="text-[10px] text-amber-700 opacity-80">Filtro: Ativação do Robô</span>
                        </div>
                      </div>
                    )}

                    {/* Scan Result Response Box printed on screen */}
                    {scanResult && scanResult.groupId === group.id && scanningGroupId !== group.id && (
                      <div className={`text-xs p-4 rounded-2xl mt-2.5 border flex items-start gap-3 transition-all animate-fade-in shadow-xs ${
                        scanResult.processedCount && scanResult.processedCount > 0
                          ? "bg-emerald-50 text-emerald-950 border-emerald-200"
                          : scanResult.success
                            ? "bg-amber-50/95 text-amber-950 border-amber-200"
                            : "bg-red-50 text-red-950 border-red-200"
                      }`}>
                        {scanResult.processedCount && scanResult.processedCount > 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : scanResult.success ? (
                          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs uppercase tracking-wider opacity-90">
                              {scanResult.processedCount && scanResult.processedCount > 0
                                ? "Ofertas Encaminhadas com Sucesso!"
                                : scanResult.success
                                  ? "Resultado da Varredura no Grupo"
                                  : "Falha na Varredura"}
                            </span>
                            {scanResult.timestamp && (
                              <span className="text-[10px] font-mono text-slate-500 bg-white/70 px-2 py-0.5 rounded border border-slate-200/60">
                                {scanResult.timestamp}
                              </span>
                            )}
                          </div>
                          
                          {/* Printed Message Text */}
                          <div className="p-3 bg-white/80 rounded-xl border border-slate-200/70 text-slate-700 leading-relaxed font-medium text-xs mt-1">
                            {scanResult.message}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                              Mensagens lidas: {scanResult.messageCount || 0}
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-200">
                              Ofertas achadas: {scanResult.totalFound || 0}
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 font-bold text-[10px] border border-emerald-200">
                              Enviadas: {scanResult.processedCount || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "targets" && (
          /* Target Groups Panel */
          <div id="target-groups-panel" className="flex flex-col flex-1">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-lg font-bold text-gray-800">Grupos de Destino para Mandar Anúncios</h3>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold">
                {displayedTargets.filter(g => g.active).length} grupos ativos
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              O robô irá disparar de forma totalmente automática os anúncios com o seu link de afiliado reescritos para cada um destes grupos ativos e configurados.
            </p>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1 max-h-[340px]">
              {displayedTargets.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl border border-dashed border-gray-200">
                  <Send className="w-8 h-8 text-slate-300" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-600">Nenhum grupo de destino sincronizado</span>
                    <span className="text-xs text-slate-400 max-w-sm mt-1 mx-auto">
                      Clique no botão "Sincronizar Grupos do WhatsApp" acima para carregar e ativar seus canais reais de chat de destino.
                    </span>
                  </div>
                </div>
              ) : (
                displayedTargets.map((group) => (
                  <div
                    key={group.id}
                    id={`target-group-${group.id}`}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      group.active
                        ? "bg-emerald-50/20 border-emerald-150"
                        : "bg-gray-50/50 border-gray-100 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        id={`checkbox-target-${group.id}`}
                        checked={group.active}
                        onChange={() => handleToggleActive(group.id, "targets")}
                        className="w-4.5 h-4.5 text-indigo-600 border-gray-300 rounded-sm focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <label
                          htmlFor={`checkbox-target-${group.id}`}
                          className="text-sm font-semibold text-gray-700 cursor-pointer select-none truncate"
                        >
                          {group.name}
                        </label>
                        <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0 animate-pulse" />
                          Grupo WhatsApp Real
                        </span>
                      </div>
                    </div>

                    <button
                      id={`delete-target-btn-${group.id}`}
                      type="button"
                      onClick={() => handleDeleteItem(group.id, "targets")}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "scan" && (
          /* Dedicated Scan Progress & Screen Response Panel */
          <div id="scan-status-panel" className="flex flex-col flex-1 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 pb-4 gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-lg font-bold text-gray-800">Painel de Varredura de Ofertas</h3>
              </div>
              <button
                id="run-full-scan-now-btn"
                type="button"
                onClick={handleScanAllSources}
                disabled={!whatsappConnected || !!scanningGroupId}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-white text-white" />
                <span>{scanningGroupId ? "Varredura Em Andamento..." : "Executar Varredura Geral Agora"}</span>
              </button>
            </div>

            {/* Live Scanning Progress Bar Card */}
            {scanningGroupId ? (
              <div className="p-6 bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-indigo-50/40 border border-amber-200 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-950 text-sm">Varredura em Andamento</h4>
                      <p className="text-xs text-amber-800 font-medium">
                        Analisando grupo de origem: <span className="font-bold underline">{currentScanningName}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-black font-mono text-amber-900 bg-amber-200/90 px-3 py-1 rounded-xl border border-amber-300">
                    {scanProgress}%
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="space-y-1.5">
                  <div className="w-full bg-amber-200/70 rounded-full h-4 overflow-hidden border border-amber-300/80 shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 h-full transition-all duration-300 ease-out shadow-sm flex items-center justify-end pr-2"
                      style={{ width: `${scanProgress}%` }}
                    >
                      <span className="text-[10px] font-black text-white">{scanProgress}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                    <span>Etapa: {scanStage}</span>
                    <span className="text-[11px] text-amber-700 font-normal">Filtro: Ativação do Robô</span>
                  </div>
                </div>

                <div className="p-3 bg-white/80 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    O sistema busca ofertas recentes nos grupos ativos, passa pela Inteligência Artificial e encaminha para os grupos de destino.
                  </span>
                </div>
              </div>
            ) : (
              /* Display Printed Screen Response Card when completed or idle */
              <div className="space-y-4">
                {lastScanInfo ? (
                  <div className={`p-6 rounded-2xl border transition-all shadow-xs space-y-4 ${
                    lastScanInfo.processedCount && lastScanInfo.processedCount > 0
                      ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
                      : lastScanInfo.success
                        ? "bg-amber-50/90 border-amber-200 text-amber-950"
                        : "bg-red-50/90 border-red-200 text-red-950"
                  }`}>
                    <div className="flex items-start justify-between gap-3 border-b pb-3.5 border-slate-200/60">
                      <div className="flex items-center gap-3">
                        {lastScanInfo.processedCount && lastScanInfo.processedCount > 0 ? (
                          <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        ) : lastScanInfo.success ? (
                          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
                            <Info className="w-6 h-6" />
                          </div>
                        ) : (
                          <div className="p-2.5 bg-red-500 text-white rounded-xl shadow-xs">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-base">
                            {lastScanInfo.processedCount && lastScanInfo.processedCount > 0
                              ? "✨ Varredura Concluída: Ofertas Enviadas!"
                              : lastScanInfo.success
                                ? "🔎 Resultado da Varredura: Nenhuma Oferta para Enviar"
                                : "⚠️ Falha ao Realizar Varredura"}
                          </h4>
                          <p className="text-xs opacity-80 mt-0.5">
                            Grupo analisado: <span className="font-bold">{lastScanInfo.groupName}</span>
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-mono font-bold bg-white/80 px-3 py-1 rounded-lg border border-slate-200 shrink-0">
                        {lastScanInfo.timestamp}
                      </span>
                    </div>

                    {/* Primary Print Output Screen */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                        Resposta Impressa na Tela:
                      </span>
                      <div className="p-4 bg-white/95 rounded-xl border border-slate-200/80 text-slate-800 leading-relaxed font-semibold text-sm shadow-2xs">
                        {lastScanInfo.message}
                      </div>
                    </div>

                    {/* Stat Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="p-3 bg-white/80 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Mensagens no Grupo</span>
                        <span className="text-lg font-black text-slate-700">{lastScanInfo.messageCount || 0}</span>
                      </div>
                      <div className="p-3 bg-white/80 rounded-xl border border-amber-200 text-center">
                        <span className="text-[10px] uppercase font-bold text-amber-600 block">Ofertas Shopee Achadas</span>
                        <span className="text-lg font-black text-amber-800">{lastScanInfo.totalFound || 0}</span>
                      </div>
                      <div className="p-3 bg-white/80 rounded-xl border border-emerald-200 text-center">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 block">Encaminhadas p/ Destino</span>
                        <span className="text-lg font-black text-emerald-800">{lastScanInfo.processedCount || 0}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-400 text-sm flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                    <Activity className="w-10 h-10 text-slate-300" />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-700 text-base">Nenhuma varredura recente executada</span>
                      <span className="text-xs text-slate-400 max-w-md mt-1 mx-auto leading-relaxed">
                        Clique em "Executar Varredura Geral Agora" acima ou acione o botão "Buscar Ofertas" em um grupo de origem especifico para acompanhar o progresso em tempo real nesta aba.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


