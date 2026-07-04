import React from "react";
import { GroupConfig, SandboxResult } from "../types";
import { Sparkles, MessageSquare, ArrowRight, Send, Loader2, Copy, CheckCircle2, Terminal } from "lucide-react";
import { motion } from "motion/react";

interface SandboxViewProps {
  groups: GroupConfig;
  onSimulateIncoming: (sourceGroupId: string, messageText: string) => Promise<void>;
  whatsappConnected: boolean;
}

export const SandboxView: React.FC<SandboxViewProps> = ({
  groups,
  onSimulateIncoming,
  whatsappConnected,
}) => {
  const [sourceGroupId, setSourceGroupId] = React.useState("");
  const [rawMessage, setRawMessage] = React.useState(
    "💥 SUPER PROMOÇÃO DA SHOPEE! Fone de ouvido Redmi Airdots 2 com som espetacular e bluetooth 5.0! De R$ 120 por APENAS R$ 34,90. Promoção válida somente hoje! Garanta o seu: https://shopee.com.br/product-1203921-12039201"
  );
  
  const [loading, setLoading] = React.useState(false);
  const [sandboxResult, setSandboxResult] = React.useState<SandboxResult | null>(null);
  const [customRewrittenMessage, setCustomRewrittenMessage] = React.useState("");
  const [successSent, setSuccessSent] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    if (groups.sources.length > 0 && !sourceGroupId) {
      setSourceGroupId(groups.sources[0].id);
    }
  }, [groups, sourceGroupId]);

  const handleParse = async () => {
    if (!rawMessage.trim()) return;
    setLoading(true);
    setSuccessSent(false);
    setSandboxResult(null);

    try {
      const response = await fetch("/api/sandbox/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: rawMessage }),
      });

      if (!response.ok) {
        throw new Error("Erro ao analisar anúncio");
      }

      const data: SandboxResult = await response.json();
      setSandboxResult(data);
      setCustomRewrittenMessage(data.rewrittenMessage);
    } catch (error) {
      console.error(error);
      alert("Falha ao analisar a mensagem. Detalhes no console.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendToTargets = async () => {
    if (!sandboxResult) return;
    setLoading(true);

    try {
      const response = await fetch("/api/sandbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle: sandboxResult.productTitle,
          rewrittenMessage: customRewrittenMessage,
          originalLink: sandboxResult.originalLink,
          affiliateLink: sandboxResult.affiliateLink || "",
          imageUrl: sandboxResult.imageUrl || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao disparar mensagem");
      }

      const data = await response.json();
      if (data.success) {
        setSuccessSent(true);
        setTimeout(() => setSuccessSent(false), 4000);
      } else {
        alert("Erro: " + (data.error || "Não foi possível disparar. Verifique se há grupos de destino ativos."));
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao disparar mensagens.");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateIncomingFlow = async () => {
    if (!rawMessage.trim() || !sourceGroupId) return;
    setLoading(true);
    setSuccessSent(false);

    try {
      await onSimulateIncoming(sourceGroupId, rawMessage);
      setSuccessSent(true);
      setTimeout(() => setSuccessSent(false), 4000);
    } catch (error) {
      console.error(error);
      alert("Erro ao simular fluxo automático.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(customRewrittenMessage);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const activeTargetsCount = groups.targets.filter(g => g.active).length;

  return (
    <div id="sandbox-view-container" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* Input panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 flex flex-col h-[520px]">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-4 mb-4">
          <Terminal className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-800">Simulador de Entrada de Mensagens</h3>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          Cole aqui uma cópia de um anúncio promocional típico que você receberia em grupos do WhatsApp. O robô analisará o conteúdo usando Inteligência Artificial.
        </p>

        {/* Input Textarea */}
        <div className="flex-1 flex flex-col gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
              Mensagem Bruta do WhatsApp
            </label>
            <textarea
              id="raw-message-input"
              value={rawMessage}
              onChange={(e) => setRawMessage(e.target.value)}
              className="w-full h-full min-h-[180px] p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono leading-relaxed"
              placeholder="Cole a promoção aqui..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            {/* Select simulated source group */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                Simular Recebimento Em:
              </label>
              <select
                id="source-group-select"
                value={sourceGroupId}
                onChange={(e) => setSourceGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold bg-slate-50 cursor-pointer"
              >
                {groups.sources.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} {group.active ? "" : "(Inativo)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Simulated actions */}
            <div className="flex flex-col gap-2 pt-5">
              <button
                id="parse-sandbox-btn"
                onClick={handleParse}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Analisar com Gemini AI
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Simulator full automation trigger */}
        <div className="border-t border-gray-100 pt-4 shrink-0 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Fluxo Completo do Robô</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Executar leitura, conversão de link e reenvio em um clique.</p>
          </div>
          
          <button
            id="simulate-incoming-btn"
            onClick={handleSimulateIncomingFlow}
            disabled={loading || !whatsappConnected}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              !whatsappConnected
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white shadow-xs"
            }`}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Simular Fluxo Completo
              </>
            )}
          </button>
        </div>

      </div>

      {/* Output Panel / Results */}
      <div className="bg-slate-900 rounded-2xl border border-gray-800 text-gray-100 p-6 flex flex-col h-[520px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h3 className="text-lg font-bold text-gray-100">Resultado da Conversão Inteligente</h3>
          </div>
          
          {sandboxResult && (
            <button
              id="copy-to-clipboard-btn"
              onClick={handleCopyToClipboard}
              className="p-1 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Copiar texto gerado"
            >
              {copying ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>

        {!sandboxResult ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500">
            <MessageSquare className="w-12 h-12 text-gray-600 mb-3" />
            <p className="text-sm font-semibold">Painel de Visualização</p>
            <p className="text-xs max-w-xs mt-1">
              Insira uma mensagem no formulário ao lado e clique em "Analisar com Gemini AI" para visualizar a reformulação aqui.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            
            {/* Meta product data */}
            <div className="space-y-3 mb-4 shrink-0 bg-slate-950 p-4 rounded-xl border border-gray-800">
              <div className="flex gap-4 items-start">
                {sandboxResult.imageUrl && (
                  <img 
                    src={sandboxResult.imageUrl} 
                    alt={sandboxResult.productTitle}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 object-cover rounded-lg border border-gray-800 bg-slate-900 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">Produto Identificado</span>
                      <h4 className="text-sm font-bold text-white leading-snug mt-0.5 truncate">{sandboxResult.productTitle}</h4>
                    </div>
                    {sandboxResult.price && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-green-400 font-bold uppercase">Preço Estimado</span>
                        <p className="text-xs font-extrabold text-green-400 mt-0.5">{sandboxResult.price}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-2 grid grid-cols-1 gap-1.5 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Link Original:</span>
                  <span className="text-gray-300 truncate max-w-[280px] text-right">{sandboxResult.originalLink}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-indigo-400">Link Afiliado:</span>
                  <span className="text-indigo-400 font-bold truncate max-w-[280px] text-right">{sandboxResult.affiliateLink}</span>
                </div>
              </div>
            </div>

            {/* Editable final copy */}
            <div className="flex-1 flex flex-col mb-4 overflow-hidden">
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 shrink-0">
                Texto Reformulado pelo Gemini AI (Editável)
              </label>
              <textarea
                id="custom-rewritten-message-input"
                value={customRewrittenMessage}
                onChange={(e) => setCustomRewrittenMessage(e.target.value)}
                className="flex-1 w-full p-4 bg-slate-950 border border-gray-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-gray-200 leading-relaxed overflow-y-auto select-text"
              />
            </div>

            {/* Dispatch manually block */}
            <div className="border-t border-gray-800 pt-4 shrink-0 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Enviar para Canais</span>
                <p className="text-[11px] text-gray-500 mt-0.5">Disparar este anúncio convertido agora.</p>
              </div>

              <button
                id="send-targets-sandbox-btn"
                onClick={handleSendToTargets}
                disabled={loading || activeTargetsCount === 0}
                className={`py-2 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTargetsCount === 0
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                }`}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Enviar para {activeTargetsCount} Grupos Ativos
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* Success alert notification overlay banner */}
        {successSent && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="absolute bottom-6 right-6 left-6 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-bold z-50 border border-green-400"
          >
            <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-white animate-bounce" />
            <span>Simulação realizada com sucesso! Os canais foram notificados.</span>
          </motion.div>
        )}

      </div>

    </div>
  );
};
