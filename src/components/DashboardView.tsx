import React from "react";
import { AppConfig, LogItem } from "../types";
import { Sliders, RefreshCw, Trash2, Shield, Flame, Target, Play, Square, Settings2, Check, Loader2, Clipboard, ClipboardCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";

interface DashboardViewProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  saveConfig: (newConfig: AppConfig) => Promise<void>;
  logs: LogItem[];
  clearLogs: () => Promise<void>;
  whatsappConnected: boolean;
  onRefreshLogs: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  config,
  setConfig,
  saveConfig,
  logs,
  clearLogs,
  whatsappConnected,
  onRefreshLogs,
}) => {
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "saving" | "unsaved">("saved");
  const [affId, setAffId] = React.useState(config.affiliateId);
  const [intervalTime, setIntervalTime] = React.useState(config.autoPilotInterval);
  const [kw, setKw] = React.useState(config.keywords);
  const [ap, setAp] = React.useState(config.autoPilot);
  const [styleSetting, setStyleSetting] = React.useState(config.rewriteStyle);
  const [useShopeeApi, setUseShopeeApi] = React.useState(config.useShopeeApi || false);
  const [shopeeAppKey, setShopeeAppKey] = React.useState(config.shopeeAppKey || "");
  const [shopeeAppSecret, setShopeeAppSecret] = React.useState(config.shopeeAppSecret || "");
  const [shopeeAffId, setShopeeAffId] = React.useState(config.shopeeAffiliateId || "");

  const [smartPasteText, setSmartPasteText] = React.useState("");
  const [smartPasteStatus, setSmartPasteStatus] = React.useState<{ success: boolean; message: string } | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleSmartPaste = (text: string) => {
    if (!text.trim()) {
      setSmartPasteStatus({ success: false, message: "Por favor, cole algum texto contendo as credenciais." });
      return;
    }

    let parsedKey = "";
    let parsedSecret = "";
    let parsedAff = "";
    let method = "";

    // 1. Try JSON parsing
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const data = JSON.parse(trimmed);
        parsedKey = data.app_key || data.appKey || data.appkey || data.key || "";
        parsedSecret = data.app_secret || data.appSecret || data.appsecret || data.secret || "";
        parsedAff = data.affiliate_id || data.affiliateId || data.shopeeAffiliateId || data.affiliate || "";
        method = "Formato JSON";
      }
    } catch (e) {
      // Ignore JSON error and try text
    }

    // 2. Try label parsing (Key: Value or key = value)
    if (!parsedKey || !parsedSecret) {
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split(/[:=]/);
        if (parts.length >= 2) {
          const fieldName = parts[0].trim().toLowerCase();
          const fieldValue = parts.slice(1).join(":").trim();

          if (fieldName.includes("key") || fieldName.includes("chave") || fieldName.includes("appkey") || fieldName.includes("app_key")) {
            parsedKey = fieldValue.replace(/['"‘“’”’]/g, "").trim();
          } else if (fieldName.includes("secret") || fieldName.includes("segredo") || fieldName.includes("appsecret") || fieldName.includes("app_secret")) {
            parsedSecret = fieldValue.replace(/['"‘“’”’]/g, "").trim();
          } else if (fieldName.includes("affiliate") || fieldName.includes("afiliado") || fieldName.includes("id")) {
            parsedAff = fieldValue.replace(/['"‘“’”’]/g, "").trim();
          }
        }
      }
      if (parsedKey || parsedSecret) {
        method = "Linha de Texto (Chave/Segredo)";
      }
    }

    // 3. Regex block parsing - look for hex codes, alphanumeric strings, numbers
    if (!parsedKey || !parsedSecret) {
      const tokens = text.match(/[a-zA-Z0-9_\-]+/g) || [];
      // Shopee Secret key is generally a 32 character alphanumeric
      const secretCandidate = tokens.find(t => t.length === 32);
      // App Key is usually a number or short string
      const keyCandidate = tokens.find(t => t !== secretCandidate && t.length >= 5 && t.length <= 15 && /^\d+$/.test(t));

      if (secretCandidate && keyCandidate) {
        parsedKey = keyCandidate;
        parsedSecret = secretCandidate;
        method = "Associação de Padrões";
      }
    }

    if (parsedKey || parsedSecret || parsedAff) {
      if (parsedKey) setShopeeAppKey(parsedKey);
      if (parsedSecret) setShopeeAppSecret(parsedSecret);
      if (parsedAff) setShopeeAffId(parsedAff);
      
      setSaveStatus("unsaved");
      setSmartPasteStatus({
        success: true,
        message: `Importado via ${method}! ${parsedKey ? "✅ Chave detectada" : ""} ${parsedSecret ? "✅ Segredo detectado" : ""} ${parsedAff ? "✅ ID Afiliado" : ""}`.trim()
      });
      setSmartPasteText("");
    } else {
      setSmartPasteStatus({
        success: false,
        message: "Não conseguimos identificar credenciais válidas. Tente colar uma por uma ou use formato JSON."
      });
    }
  };

  const handlePasteDirect = async (field: "key" | "secret" | "aff") => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      
      const cleanText = text.trim();
      if (field === "key") {
        setShopeeAppKey(cleanText);
      } else if (field === "secret") {
        setShopeeAppSecret(cleanText);
      } else if (field === "aff") {
        setShopeeAffId(cleanText);
      }
      
      setSaveStatus("unsaved");
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.warn("Direct clipboard paste failed:", err);
      setSmartPasteStatus({
        success: false,
        message: "O navegador bloqueou a colagem automática neste modo iframe. Use a área de texto abaixo!"
      });
    }
  };

  React.useEffect(() => {
    if (saveStatus !== "unsaved") {
      const initialAffId = config.affiliateId || config.shopeeAffiliateId || "";
      const initialShopeeAffId = config.shopeeAffiliateId || config.affiliateId || "";
      setAffId(initialAffId);
      setIntervalTime(config.autoPilotInterval);
      setKw(config.keywords);
      setAp(config.autoPilot);
      setStyleSetting(config.rewriteStyle);
      setUseShopeeApi(config.useShopeeApi || false);
      setShopeeAppKey(config.shopeeAppKey || "");
      setShopeeAppSecret(config.shopeeAppSecret || "");
      setShopeeAffId(initialShopeeAffId);
    }
  }, [config, saveStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      const resolvedAffId = useShopeeApi ? shopeeAffId : affId;
      const updatedConfig = {
        ...config,
        affiliateId: resolvedAffId,
        autoPilotInterval: Number(intervalTime),
        keywords: kw,
        autoPilot: ap,
        rewriteStyle: styleSetting,
        useShopeeApi,
        shopeeAppKey,
        shopeeAppSecret,
        shopeeAffiliateId: resolvedAffId,
      };
      setConfig(updatedConfig);
      await saveConfig(updatedConfig);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Erro ao salvar config:", err);
      setSaveStatus("unsaved");
    }
  };

  const handleStyleChange = (newStyle: AppConfig["rewriteStyle"]) => {
    setStyleSetting(newStyle);
    setSaveStatus("unsaved");
  };

  const handleAutoPilotToggle = () => {
    setAp(!ap);
    setSaveStatus("unsaved");
  };

  return (
    <div id="dashboard-view-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Configuration column (2/3 width on large screens) */}
      <div id="dashboard-config-section" className="lg:col-span-2 space-y-6">
        
        {/* Connection Notice banner */}
        {!whatsappConnected && (
          <div id="dashboard-conn-notice" className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">WhatsApp Desconectado</p>
              <p className="text-sm text-amber-700 mt-0.5">
                O robô não processará anúncios automaticamente enquanto o WhatsApp estiver desconectado. Vá para a aba <strong>Conexão WhatsApp</strong> para iniciar uma sessão.
              </p>
            </div>
          </div>
        )}

        {/* Configurations Form */}
        <div id="config-card" className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-gray-800">Parâmetros do Robô</h2>
            </div>
            <button
              id="autopilot-toggle-btn"
              onClick={handleAutoPilotToggle}
              disabled={!whatsappConnected}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                !whatsappConnected 
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : ap 
                    ? "bg-green-100 text-green-700 hover:bg-green-200" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {ap ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-green-600 animate-pulse" />
                  Piloto Automático Ativo
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-gray-500" />
                  Simulação Pausada
                </>
              )}
            </button>
          </div>

          <form id="config-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Affiliate ID */}
              {!useShopeeApi && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    ID de Afiliado Shopee (obrigatório)
                  </label>
                  <input
                    id="affiliate-id-input"
                    type="text"
                    value={affId}
                    onChange={(e) => {
                      setAffId(e.target.value);
                      setSaveStatus("unsaved");
                    }}
                    placeholder="Ex: heltonjulio1703"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    required={!useShopeeApi}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Seus links convertidos serão redirecionados usando este ID de rastreamento.
                  </p>
                </div>
              )}

              {/* Autopilot Interval */}
              <div className={useShopeeApi ? "md:col-span-2" : ""}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Intervalo de Simulação (segundos)
                </label>
                <input
                  id="autopilot-interval-input"
                  type="number"
                  min="10"
                  max="3600"
                  value={intervalTime}
                  onChange={(e) => {
                    setIntervalTime(Number(e.target.value));
                    setSaveStatus("unsaved");
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Frequência com que o simulador gera e encaminha novos anúncios de teste.
                </p>
              </div>
            </div>

            {/* Keyword Filters (Disabled per user request) */}
            <div className="opacity-60 pointer-events-none">
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Filtro de Palavras-Chave (DESABILITADO)
              </label>
              <textarea
                id="keywords-input"
                value={kw}
                disabled
                rows={2}
                placeholder="Filtro desabilitado. O robô agora processa todas as mensagens de forma direta."
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-400 rounded-lg focus:outline-none text-sm cursor-not-allowed"
              />
              <p className="text-xs text-red-500 mt-1 font-semibold">
                ⚠️ Filtro de palavra-chave desabilitado por padrão. Todos os anúncios com links da Shopee serão processados e encaminhados sem necessidade de palavras-chave.
              </p>
            </div>

            {/* Shopee API Integration Section */}
            <div id="shopee-api-section" className="border-t border-gray-150 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-800">Conectar via API Oficial da Shopee</span>
                  <span className="text-xs text-gray-400">Converta anúncios usando suas credenciais da Shopee Open Platform</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="use-shopee-api-toggle"
                    type="checkbox"
                    checked={useShopeeApi}
                    onChange={(e) => {
                      setUseShopeeApi(e.target.checked);
                      setSaveStatus("unsaved");
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {useShopeeApi && (
                <div id="shopee-api-inputs-container" className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Shopee API App Key (Chave do Aplicativo)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="shopee-app-key-input"
                          type="text"
                          value={shopeeAppKey}
                          onChange={(e) => {
                            setShopeeAppKey(e.target.value);
                            setSaveStatus("unsaved");
                          }}
                          placeholder="Insira seu App Key"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs text-slate-800"
                          required={useShopeeApi}
                        />
                        <button
                          type="button"
                          onClick={() => handlePasteDirect("key")}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-250 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                          title="Colar da área de transferência"
                        >
                          {copiedField === "key" ? (
                            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                          ) : (
                            <Clipboard className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedField === "key" ? "Pronto!" : "Colar"}</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Shopee API App Secret (Segredo do Aplicativo)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="shopee-app-secret-input"
                          type="password"
                          value={shopeeAppSecret}
                          onChange={(e) => {
                            setShopeeAppSecret(e.target.value);
                            setSaveStatus("unsaved");
                          }}
                          placeholder="••••••••••••••••"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs text-slate-800"
                          required={useShopeeApi}
                        />
                        <button
                          type="button"
                          onClick={() => handlePasteDirect("secret")}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-250 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                          title="Colar da área de transferência"
                        >
                          {copiedField === "secret" ? (
                            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                          ) : (
                            <Clipboard className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedField === "secret" ? "Pronto!" : "Colar"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                   <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      ID de Afiliado Shopee (obrigatório)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="shopee-api-affiliate-id-input"
                        type="text"
                        value={shopeeAffId}
                        onChange={(e) => {
                          setShopeeAffId(e.target.value);
                          setSaveStatus("unsaved");
                        }}
                        placeholder="Ex: heltonjulio1703"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs text-slate-800"
                        required={useShopeeApi}
                      />
                      <button
                        type="button"
                        onClick={() => handlePasteDirect("aff")}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-250 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                        title="Colar da área de transferência"
                      >
                        {copiedField === "aff" ? (
                          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                        ) : (
                          <Clipboard className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedField === "aff" ? "Pronto!" : "Colar"}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Insira seu ID de Afiliado. Ele será usado para identificar suas conversões ou como reserva (fallback) direta caso a chamada da API falhe ou as credenciais estejam inativas.
                    </p>
                  </div>

                  {/* Smart Paste Box */}
                  <div className="border-t border-slate-200 pt-3 mt-3 space-y-2">
                    <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                      Área de Importação Rápida (Colar bloco inteiro de dados)
                    </span>
                    <p className="text-[10.5px] text-gray-500 leading-relaxed">
                      Cole qualquer bloco de texto ou JSON copiado da plataforma Shopee abaixo para extrair e preencher todos os dados da API de uma só vez.
                    </p>
                    <textarea
                      rows={2}
                      value={smartPasteText}
                      onChange={(e) => {
                        setSmartPasteText(e.target.value);
                        if (e.target.value.length > 5) {
                          handleSmartPaste(e.target.value);
                        }
                      }}
                      onPaste={(e) => {
                        const pastedData = e.clipboardData.getData("text");
                        if (pastedData) {
                          handleSmartPaste(pastedData);
                        }
                      }}
                      placeholder="Cole o JSON ou texto corrido das credenciais aqui..."
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white placeholder-gray-400 font-mono text-slate-800"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleSmartPaste(smartPasteText)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        Analisar e Preencher Dados
                      </button>
                      {smartPasteText && (
                        <button
                          type="button"
                          onClick={() => setSmartPasteText("")}
                          className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                        >
                          Limpar campo
                        </button>
                      )}
                    </div>
                    {smartPasteStatus && (
                      <div className={`p-2 rounded text-[10.5px] font-semibold ${
                        smartPasteStatus.success
                          ? "bg-emerald-50 border border-emerald-150 text-emerald-800"
                          : "bg-amber-50 border border-amber-150 text-amber-800"
                      }`}>
                        {smartPasteStatus.message}
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-150 p-2.5 rounded-md text-[11px] text-blue-800 flex gap-2">
                    <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Como conseguir estas credenciais oficiais?</span>
                      Acesse a plataforma <a href="https://open.shopee.com/" target="_blank" rel="noreferrer" className="underline font-bold text-blue-950">Shopee Open Platform</a>, crie um aplicativo de desenvolvedor de tipo Afiliado e aguarde a aprovação técnica para visualizar seu App Key e App Secret.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400">
                {saveStatus === "saved" && (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Alterações salvas!
                  </span>
                )}
                {saveStatus === "saving" && (
                  <span className="text-indigo-600 font-semibold flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Sincronizando com o servidor...
                  </span>
                )}
                {saveStatus === "unsaved" && (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">
                    ⚠️ Alterações pendentes. Clique em Salvar.
                  </span>
                )}
              </div>
              <button
                id="save-config-btn"
                type="submit"
                disabled={saveStatus === "saving"}
                className={`font-semibold py-2 px-5 rounded-lg text-sm transition-all cursor-pointer flex items-center gap-2 ${
                  saveStatus === "saved"
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    : saveStatus === "saving"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10"
                }`}
              >
                {saveStatus === "saving" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : saveStatus === "saved" ? (
                  <>
                    <Check className="w-4 h-4" />
                    Salvo!
                  </>
                ) : (
                  "Salvar Configurações"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* AI Rewrite Style Selection */}
        <div id="style-card" className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-4 mb-4">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold text-gray-800">Estilo de Escrita do Gemini AI</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Escolha como a Inteligência Artificial deve reformular a mensagem promocional antes de reenviar para os seus grupos.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: "excited", label: "Super Empolgado 🔥", desc: "Cheio de emojis, foco em urgência e promoções imperdíveis." },
              { id: "minimal", label: "Minimalista 🎯", desc: "Direto ao ponto, focado estritamente no preço e link." },
              { id: "creative", label: "Criativo/Amistoso 💡", desc: "Texto dinâmico, chamativo com casos de uso práticos." },
              { id: "direct", label: "Profissional 💼", desc: "Formatação limpa, tom informativo e amigável." },
            ].map((style) => (
              <button
                key={style.id}
                id={`style-btn-${style.id}`}
                onClick={() => handleStyleChange(style.id as AppConfig["rewriteStyle"])}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all h-32 cursor-pointer ${
                  styleSetting === style.id
                    ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20"
                    : "border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200"
                }`}
              >
                <span className={`text-sm font-bold block ${styleSetting === style.id ? "text-indigo-700" : "text-gray-800"}`}>
                  {style.label}
                </span>
                <span className="text-xs text-gray-400 mt-1 line-clamp-3 leading-snug">
                  {style.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Logs/Terminal column (1/3 width) */}
      <div id="dashboard-logs-section" className="bg-gray-900 rounded-xl shadow-xs border border-gray-800 overflow-hidden flex flex-col h-[520px]">
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-750 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-gray-200">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider">Monitor em Tempo Real</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="refresh-logs-btn"
              onClick={onRefreshLogs}
              title="Atualizar Logs"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              id="clear-logs-btn"
              onClick={clearLogs}
              title="Limpar Logs"
              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Logs terminal container */}
        <div id="logs-terminal-body" className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 select-text custom-scrollbar bg-slate-950">
          {logs.length === 0 ? (
            <div className="text-gray-600 text-center py-10">
              Nenhuma atividade registrada ainda.
            </div>
          ) : (
            logs.map((log, index) => {
              let typeClass = "text-gray-400";
              let prefix = "[INFO]";
              if (log.type === "success") {
                typeClass = "text-green-400";
                prefix = "[SUCESSO]";
              } else if (log.type === "warning") {
                typeClass = "text-yellow-400";
                prefix = "[ALERTA]";
              } else if (log.type === "error") {
                typeClass = "text-red-400";
                prefix = "[ERRO]";
              }

              return (
                <motion.div
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  key={index}
                  className="border-b border-gray-900/30 pb-1 text-gray-300"
                >
                  <span className="text-gray-500 mr-2">{log.time}</span>
                  <span className={`${typeClass} font-semibold mr-1.5`}>{prefix}</span>
                  <span>{log.message}</span>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
