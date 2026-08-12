import React from "react";
import { HistoryItem } from "../types";
import { Search, ExternalLink, Calendar, ArrowRight, RefreshCw, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

interface HistoryViewProps {
  history: HistoryItem[];
  clearHistory: () => Promise<void>;
  onRefreshHistory: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  clearHistory,
  onRefreshHistory,
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [storeFilter, setStoreFilter] = React.useState<"all" | "shopee" | "mercadolivre">("all");

  const isMlItem = (item: HistoryItem) => {
    if (item.storeType === "mercadolivre") return true;
    if (item.storeType === "shopee") return false;
    return /mercadolivre|mercadolibre|ml\.com\.br|meli\.li/i.test(item.originalLink);
  };

  const filteredHistory = history.filter((item) => {
    const isMl = isMlItem(item);
    if (storeFilter === "shopee" && isMl) return false;
    if (storeFilter === "mercadolivre" && !isMl) return false;

    const term = searchTerm.toLowerCase();
    if (!term) return true;

    return (
      item.productTitle.toLowerCase().includes(term) ||
      item.sourceGroup.toLowerCase().includes(term) ||
      item.originalMessage.toLowerCase().includes(term) ||
      item.rewrittenMessage.toLowerCase().includes(term) ||
      (isMl ? "mercado livre" : "shopee").includes(term)
    );
  });

  const handleClear = async () => {
    if (window.confirm("Deseja realmente limpar todo o histórico de conversões?")) {
      await clearHistory();
    }
  };

  // Metrics
  const totalConversions = history.length;
  const successfulConversions = history.filter(h => h.status === "success").length;
  const shopeeCount = history.filter(h => !isMlItem(h)).length;
  const mlCount = history.filter(h => isMlItem(h)).length;

  return (
    <div id="history-view-container" className="space-y-6">
      
      {/* Statistics Cards */}
      <div id="history-stats-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Processado</p>
            <h4 className="text-2xl font-bold text-gray-800 mt-1">{totalConversions} anúncios</h4>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] font-semibold">
              <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                🧡 {shopeeCount} Shopee
              </span>
              <span className="text-yellow-800 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200">
                💛 {mlCount} Mercado Livre
              </span>
            </div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Disparos de Sucesso</p>
            <h4 className="text-2xl font-bold text-green-700 mt-1">{successfulConversions} envios</h4>
            <p className="text-[11px] text-gray-400 mt-1.5">Encaminhados para canais de destino</p>
          </div>
          <div className="p-3 bg-green-50 text-green-600 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa de Conversão</p>
            <h4 className="text-2xl font-bold text-indigo-950 mt-1">
              {totalConversions > 0 ? Math.round((successfulConversions / totalConversions) * 100) : 100}%
            </h4>
            <p className="text-[11px] text-gray-400 mt-1.5">Eficiência da automação de afiliados</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-950 rounded-xl">
            <ArrowRight className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Filter and control bar */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input & Platform Tabs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              id="history-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar produto, grupo, link..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
          </div>

          {/* Store Filter Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto shrink-0 border border-gray-200/80">
            <button
              onClick={() => setStoreFilter("all")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                storeFilter === "all"
                  ? "bg-white text-gray-800 shadow-xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Todos ({totalConversions})
            </button>
            <button
              onClick={() => setStoreFilter("shopee")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                storeFilter === "shopee"
                  ? "bg-orange-500 text-white shadow-xs"
                  : "text-gray-600 hover:text-orange-600"
              }`}
            >
              <span>🧡</span> Shopee ({shopeeCount})
            </button>
            <button
              onClick={() => setStoreFilter("mercadolivre")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                storeFilter === "mercadolivre"
                  ? "bg-yellow-400 text-yellow-950 shadow-xs"
                  : "text-gray-600 hover:text-yellow-700"
              }`}
            >
              <span>💛</span> Mercado Livre ({mlCount})
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 w-full md:w-auto justify-end shrink-0">
          <button
            id="refresh-history-btn"
            onClick={onRefreshHistory}
            className="p-2 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            id="clear-history-btn"
            onClick={handleClear}
            className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl border border-red-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <Trash2 className="w-4 h-4" />
            Limpar Tudo
          </button>
        </div>
      </div>

      {/* History List */}
      <div id="history-items-list" className="space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400">
            Nenhum anúncio encontrado para o filtro selecionado.
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isMl = isMlItem(item);
            return (
              <div
                key={item.id}
                id={`history-item-card-${item.id}`}
                className="bg-white border border-gray-100 rounded-2xl shadow-xs overflow-hidden"
              >
                {/* Card Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {/* Platform Badge */}
                    {isMl ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-yellow-100 text-yellow-950 border border-yellow-300 flex items-center gap-1 shadow-2xs">
                        💛 Mercado Livre
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-orange-100 text-orange-950 border border-orange-200 flex items-center gap-1 shadow-2xs">
                        🧡 Shopee
                      </span>
                    )}

                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                      item.status === "success" 
                        ? "bg-green-50 text-green-700 border border-green-100" 
                        : "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                      {item.status === "success" ? "Enviado" : "Falhou"}
                    </span>
                    
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Hoje às {item.time}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Origem:</span>
                    <span className="font-semibold text-gray-700 bg-gray-200/50 px-2 py-0.5 rounded">
                      {item.sourceGroup}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400">Destino:</span>
                    <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {item.targetGroups.length > 0 ? item.targetGroups.join(", ") : "Nenhum ativo"}
                    </span>
                  </div>
                </div>

              {/* Card Body */}
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Product & Link details */}
                <div className="space-y-4 flex flex-col sm:flex-row gap-4 items-start">
                  {item.imageUrl && (
                    <img 
                      src={item.imageUrl} 
                      alt={item.productTitle} 
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 object-cover rounded-xl border border-gray-100 shadow-xs shrink-0 bg-slate-50"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=800";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Produto Identificado</h5>
                      <p className="text-base font-bold text-gray-800 mt-1 leading-snug">{item.productTitle}</p>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-xs font-semibold text-gray-400 block">Link Original Encontrado:</span>
                        <a
                          href={item.originalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all flex items-center gap-1 mt-0.5"
                        >
                          {item.originalLink}
                          <ExternalLink className="w-3 h-3 inline shrink-0" />
                        </a>
                      </div>

                      <div>
                        <span className="text-xs font-semibold text-indigo-400 block">Link de Afiliado Gerado:</span>
                        <a
                          href={item.affiliateLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 font-semibold hover:underline break-all flex items-center gap-1 mt-0.5"
                        >
                          {item.affiliateLink}
                          <ExternalLink className="w-3 h-3 inline shrink-0" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Messages content comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Mensagem Original</span>
                    <div className="text-xs text-gray-500 whitespace-pre-wrap bg-white p-3 rounded-lg border border-gray-150 h-36 overflow-y-auto select-text font-mono leading-relaxed">
                      {item.originalMessage}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1.5">Mensagem com Copie & Cola IA</span>
                    <div className="text-xs text-gray-800 whitespace-pre-wrap bg-indigo-50/20 p-3 rounded-lg border border-indigo-100 h-36 overflow-y-auto select-text font-mono leading-relaxed">
                      {item.rewrittenMessage}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })
      )}
      </div>

    </div>
  );
};
