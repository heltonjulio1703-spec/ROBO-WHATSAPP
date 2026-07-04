import React from "react";
import { GroupConfig } from "../types";
import { Trash2, ArrowRightLeft, RefreshCw, Smartphone, Search, Send } from "lucide-react";

interface GroupsViewProps {
  groups: GroupConfig;
  saveGroups: (newGroups: GroupConfig) => Promise<void>;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ groups, saveGroups }) => {
  const [activeTab, setActiveTab] = React.useState<"sources" | "targets">("sources");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);

  // Filter only groups that are synchronized from a connected WhatsApp (id ending in @g.us)
  const displayedSources = groups.sources.filter((g) => g.id.endsWith("@g.us"));
  const displayedTargets = groups.targets.filter((g) => g.id.endsWith("@g.us"));

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
      const data = await response.json();
      if (data.success) {
        await saveGroups(data.groups);
        setSyncMessage("Grupos atualizados!");
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage("Erro na sincronização.");
      }
    } catch (err) {
      console.error("Erro ao sincronizar:", err);
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

  return (
    <div id="groups-view-container" className="space-y-6">
      {/* Informative banner */}
      <div id="groups-info-banner" className="bg-indigo-50 border border-indigo-150 rounded-2xl p-5 flex items-start gap-4 text-indigo-950">
        <ArrowRightLeft className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-base">Filtro de Fluxo de Grupos</h3>
          <p className="text-sm text-indigo-700 mt-1 leading-relaxed">
            Configure quais chats ou grupos o robô deve monitorar para coletar links da Shopee e para quais grupos você deseja enviar as mensagens formatadas com seu ID de afiliado.
          </p>
        </div>
      </div>

      {/* WhatsApp Groups Sincronizador Card */}
      <div id="whatsapp-sync-control-card" className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl flex items-center justify-center">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Integração com Grupos do WhatsApp</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Sincronize automaticamente os grupos que você participa do WhatsApp. Marque-os para monitorar ofertas de origem ou replicar anúncios de destino.
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
            {isSyncing ? "Buscando Grupos..." : "Sincronizar Grupos do WhatsApp"}
          </button>
        </div>
      </div>

      {/* Tabs navigation for searching and sending */}
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
      </div>

      {/* Tab Panels */}
      <div id="groups-panels-container" className="bg-white rounded-b-2xl border-x border-b border-gray-150 p-6 min-h-[420px] flex flex-col">
        {activeTab === "sources" ? (
          /* Source Groups Panel */
          <div id="source-groups-panel" className="flex flex-col flex-1">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                <h3 className="text-lg font-bold text-gray-800">Grupos de Origem para Buscar Anúncios</h3>
              </div>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold">
                {displayedSources.filter(g => g.active).length} grupos ativos
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              O robô irá monitorar as mensagens de novos links da Shopee nestes canais. Quando encontrar um anúncio ou oferta, ele enviará para a Inteligência Artificial reescrever de forma atraente.
            </p>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1 max-h-[340px]">
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
                  <div
                    key={group.id}
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
                    
                    <button
                      id={`delete-source-btn-${group.id}`}
                      type="button"
                      onClick={() => handleDeleteItem(group.id, "sources")}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
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
      </div>
    </div>
  );
};

