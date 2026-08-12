import React from "react";
import { AppConfig, LogItem } from "../types";
import { Sliders, RefreshCw, Trash2, Shield, Target, Play, Square, Settings2, Check, Loader2, Clipboard, ClipboardCheck, Wifi, WifiOff, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";

interface DashboardViewProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  saveConfig: (newConfig: AppConfig) => Promise<void>;
  logs: LogItem[];
  clearLogs: () => Promise<void>;
  whatsappConnected: boolean;
  onRefreshLogs: () => void;
  onOpenShopeePanel?: (e: React.MouseEvent) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  config,
  setConfig,
  saveConfig,
  logs,
  clearLogs,
  whatsappConnected,
  onRefreshLogs,
  onOpenShopeePanel,
}) => {
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "saving" | "unsaved">("saved");
  const [affId, setAffId] = React.useState(config.affiliateId);
  const [intervalTime, setIntervalTime] = React.useState(config.autoPilotInterval);
  const [kw, setKw] = React.useState(config.keywords);
  const [ap, setAp] = React.useState(config.autoPilot);
  const [shopeeAppKey, setShopeeAppKey] = React.useState(config.shopeeAppKey || "");
  const [shopeeAppSecret, setShopeeAppSecret] = React.useState(config.shopeeAppSecret || "");
  const [shopeeAffId, setShopeeAffId] = React.useState(config.shopeeAffiliateId || "");
  const [mlAffId, setMlAffId] = React.useState(config.mercadolivreAffiliateId || config.affiliateId || "heltonjulio1703");
  const [shopeeEnabled, setShopeeEnabled] = React.useState(config.shopeeEnabled ?? true);
  const [mercadolivreEnabled, setMercadolivreEnabled] = React.useState(config.mercadolivreEnabled ?? true);
  const [showAppKey, setShowAppKey] = React.useState(false);
  const [showAppSecret, setShowAppSecret] = React.useState(false);
  const [footer, setFooter] = React.useState(config.customFooter || "");
  const [quietStart, setQuietStart] = React.useState(config.quietStart || "08:00");
  const [quietEnd, setQuietEnd] = React.useState(config.quietEnd || "23:00");

  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  // States for testing Shopee API Connection
  const [testConnectionStatus, setTestConnectionStatus] = React.useState<"idle" | "testing" | "success" | "error">("idle");
  const [testConnectionMessage, setTestConnectionMessage] = React.useState<string>("");

  const handleTestConnection = async () => {
    if (!shopeeAppKey.trim() || !shopeeAppSecret.trim()) {
      setTestConnectionStatus("error");
      setTestConnectionMessage("Preencha o App Key e o App Secret antes de testar a conexão.");
      return;
    }

    setTestConnectionStatus("testing");
    setTestConnectionMessage("");

    try {
      const res = await fetch("/api/shopee/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          shopeeAppKey: shopeeAppKey.trim(), 
          shopeeAppSecret: shopeeAppSecret.trim() 
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestConnectionStatus("success");
        setTestConnectionMessage("Conexão estabelecida com sucesso! Suas credenciais estão ativas e funcionando perfeitamente.");
      } else {
        setTestConnectionStatus("error");
        setTestConnectionMessage(data.error || "Erro ao estabelecer conexão. Verifique suas credenciais.");
      }
    } catch (error: any) {
      setTestConnectionStatus("error");
      setTestConnectionMessage(error?.message || "Erro de rede ao conectar com o servidor.");
    }
  };

  const [clipboardBlocked, setClipboardBlocked] = React.useState(false);

  const handlePasteDirect = async (field: "key" | "secret" | "aff") => {
    try {
      setClipboardBlocked(false);
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
      setClipboardBlocked(true);
      
      // Auto focus the input field directly so the user can just press Ctrl+V / Cmd+V
      const inputId = field === "key" 
        ? "shopee-app-key-input" 
        : field === "secret" 
        ? "shopee-app-secret-input" 
        : "shopee-api-affiliate-id-input";
        
      const inputEl = document.getElementById(inputId);
      if (inputEl) {
        inputEl.focus();
      }
    }
  };

  React.useEffect(() => {
    if (saveStatus !== "unsaved") {
      const initialShopeeAffId = config.shopeeAffiliateId || config.affiliateId || "heltonjulio1703";
      const initialMlAffId = config.mercadolivreAffiliateId || "heltonjulio1703";
      setShopeeAffId(initialShopeeAffId);
      setMlAffId(initialMlAffId);
      setShopeeEnabled(config.shopeeEnabled ?? true);
      setMercadolivreEnabled(config.mercadolivreEnabled ?? true);
      setIntervalTime(config.autoPilotInterval);
      setKw(config.keywords);
      setAp(config.autoPilot);
      setShopeeAppKey(config.shopeeAppKey || "");
      setShopeeAppSecret(config.shopeeAppSecret || "");
      setFooter(config.customFooter || "");
    }
  }, [config, saveStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      const cleanShopeeId = shopeeAffId.trim() || "heltonjulio1703";
      const cleanMlId = mlAffId.trim() || "heltonjulio1703";
      const updatedConfig = {
        ...config,
        affiliateId: cleanShopeeId,
        shopeeAffiliateId: cleanShopeeId,
        mercadolivreAffiliateId: cleanMlId,
        shopeeEnabled,
        mercadolivreEnabled,
        autoPilotInterval: Number(intervalTime),
        keywords: kw,
        autoPilot: ap,
        shopeeAppKey,
        shopeeAppSecret,
        customFooter: footer,
        quietStart: quietStart,
        quietEnd: quietEnd,
      };
      setConfig(updatedConfig);
      await saveConfig(updatedConfig);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Erro ao salvar config:", err);
      setSaveStatus("unsaved");
    }
  };

  const handleAutoPilotToggle = async () => {
    const nextAp = !ap;
    setAp(nextAp);
    setSaveStatus("saving");
    try {
      const updatedConfig = {
        ...config,
        autoPilot: nextAp,
      };
      setConfig(updatedConfig);
      await saveConfig(updatedConfig);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Erro ao salvar piloto automático:", err);
      setSaveStatus("unsaved");
    }
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                ap 
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
            {/* Custom Footer */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Frase do Rodapé (aparecerá nos anúncios)
              </label>
              <input
                id="custom-footer-input"
                type="text"
                value={footer}
                onChange={(e) => {
                  setFooter(e.target.value);
                  setSaveStatus("unsaved");
                }}
                placeholder="Ex: Siga no Instagram @seu.usuario"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Deixe em branco para não exibir rodapé nos anúncios.
              </p>
            </div>

            {/* Shopee API Integration Section */}
            <div id="shopee-api-section" className="border-t border-gray-150 pt-5 mt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-orange-50/70 p-4 rounded-xl border border-orange-200">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">Plataforma Shopee 🧡</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      shopeeEnabled 
                        ? "bg-orange-100 text-orange-900 border-orange-300" 
                        : "bg-gray-100 text-gray-600 border-gray-300"
                    }`}>
                      {shopeeEnabled ? "Shopee Ativada" : "Shopee Desativada"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                    Ative ou desative a captura e conversão de anúncios da Shopee.
                  </span>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShopeeEnabled(!shopeeEnabled);
                    setSaveStatus("unsaved");
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border font-bold text-xs transition-all cursor-pointer shadow-sm shrink-0 ${
                    shopeeEnabled
                      ? "bg-orange-600 hover:bg-orange-700 text-white border-orange-700"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300"
                  }`}
                >
                  <div className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-all ${shopeeEnabled ? "justify-end bg-white/40" : "justify-start bg-slate-400"}`}>
                    <div className="w-3 h-3 bg-white rounded-full shadow-md" />
                  </div>
                  <span>{shopeeEnabled ? "LIGADO (ON)" : "DESLIGADO (OFF)"}</span>
                </button>
              </div>

              {/* Always visible inputs container */}
              <div id="shopee-api-inputs-container" className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                {clipboardBlocked && (
                  <div className="p-3 bg-amber-50 border border-amber-250 text-amber-850 text-xs rounded-lg flex items-start gap-2.5 animate-fadeIn">
                    <span className="text-amber-500 font-bold text-sm">💡</span>
                    <div className="leading-relaxed">
                      <span className="font-bold block mb-0.5">Colagem por botão bloqueada</span>
                      O navegador bloqueou o acesso automático à área de transferência devido às regras de segurança do iframe. 
                      <strong> Clique diretamente no campo desejado e use Ctrl+V (ou Cmd+V) ou clique com o botão direito para colar!</strong> O campo já foi selecionado para você.
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Shopee API App Key (opcional)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="shopee-app-key-input"
                        type={showAppKey ? "text" : "password"}
                        value={shopeeAppKey}
                        onChange={(e) => {
                          setShopeeAppKey(e.target.value);
                          setSaveStatus("unsaved");
                        }}
                        placeholder="Insira seu App Key"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAppKey(!showAppKey)}
                        className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-lg text-xs"
                      >
                        {showAppKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
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
                      Shopee API App Secret (opcional)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="shopee-app-secret-input"
                        type={showAppSecret ? "text" : "password"}
                        value={shopeeAppSecret}
                        onChange={(e) => {
                          setShopeeAppSecret(e.target.value);
                          setSaveStatus("unsaved");
                        }}
                        placeholder="••••••••••••••••"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAppSecret(!showAppSecret)}
                        className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-lg text-xs"
                      >
                        {showAppSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
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
                      required
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
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Insira seu ID de Afiliado. Ele é utilizado para gerar seus links de afiliado diretamente e identificar suas comissões.
                  </p>
                </div>

                  {/* Test Connection Section */}
                  <div className="pt-3 border-t border-dashed border-slate-200 mt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100 p-3 rounded-lg border border-slate-200">
                      <div className="text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700 block mb-0.5">Testar Credenciais da Shopee</span>
                        Clique no botão ao lado para realizar um teste em tempo real de autenticação com a API Oficial da Shopee.
                      </div>
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testConnectionStatus === "testing"}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0"
                      >
                        {testConnectionStatus === "testing" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testando...</span>
                          </>
                        ) : (
                          <>
                            <Wifi className="w-3.5 h-3.5" />
                            <span>Testar Conexão</span>
                          </>
                        )}
                      </button>
                    </div>

                    {testConnectionStatus !== "idle" && (
                      <div className={`mt-3 p-3 rounded-lg border text-xs flex flex-col gap-2.5 animate-fadeIn ${
                        testConnectionStatus === "testing"
                          ? "bg-slate-50 border-slate-200 text-slate-700"
                          : testConnectionStatus === "success"
                          ? "bg-emerald-50 border-emerald-250 text-emerald-850"
                          : "bg-red-50 border-red-250 text-red-850"
                      }`}>
                        <div className="flex gap-2.5 items-start">
                          {testConnectionStatus === "testing" ? (
                            <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0 mt-0.5" />
                          ) : testConnectionStatus === "success" ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 leading-relaxed">
                            <span className="font-bold block mb-0.5">
                              {testConnectionStatus === "testing" && "Enviando requisição de teste para servidores da Shopee..."}
                              {testConnectionStatus === "success" && "API Conectada com Sucesso!"}
                              {testConnectionStatus === "error" && "Falha na Autenticação da API"}
                            </span>
                            <span className="text-[11px] block text-slate-600">{testConnectionMessage}</span>
                          </div>
                        </div>

                        {testConnectionStatus === "error" && (testConnectionMessage.includes("10020") || testConnectionMessage.toLowerCase().includes("credential") || testConnectionMessage.toLowerCase().includes("inativas") || testConnectionMessage.toLowerCase().includes("app")) && (
                          <div className="mt-2 bg-white/70 border border-red-100 rounded p-2.5 space-y-2">
                            <span className="font-bold text-red-950 block text-[11px]">💡 Como resolver este erro?</span>
                            <p className="text-[10.5px] text-red-900 leading-normal">
                              Esse erro (Erro 10020) ocorre porque a Shopee exige que o seu aplicativo na <strong>Shopee Open Platform</strong> seja aprovado manualmente pelo suporte técnico deles e tenha o status <strong>"Active"</strong> do tipo <strong>"Affiliate"</strong> antes de aceitar conexões.
                            </p>
                            <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded border border-slate-150">
                              <strong className="text-slate-700">O que você pode fazer:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li><strong>Modo Automático:</strong> Se a API falhar ou estiver com credenciais incorretas, o robô utilizará automaticamente a conversão direta com o seu ID de Afiliado, garantindo 100% das suas comissões!</li>
                                <li><strong>Para usar a API Oficial:</strong> Acesse o console da Shopee Open Platform, confira se seu App está aprovado e se copiou o App Key e Secret corretamente.</li>
                              </ul>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                              <a
                                href="https://open.shopee.com/"
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded text-[10px] text-center transition-all shrink-0"
                              >
                                Acessar Shopee Open Platform
                              </a>
                            </div>
                          </div>
                        )}

                        {testConnectionStatus === "error" && (testConnectionMessage.toLowerCase().includes("conexão") || testConnectionMessage.toLowerCase().includes("fetch") || testConnectionMessage.toLowerCase().includes("timeout") || testConnectionMessage.toLowerCase().includes("servidor")) && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2.5 space-y-2">
                            <span className="font-bold text-amber-950 block text-[11px]">⚡ Entendendo o Erro de Conexão com a Shopee</span>
                            <p className="text-[10.5px] text-amber-900 leading-normal">
                              Os servidores da Shopee Open API frequentemente bloqueiam ou restringem requisições diretas de ambientes de nuvem (Cloud).
                            </p>
                            <div className="text-[10px] text-slate-600 leading-relaxed bg-white p-2 rounded border border-amber-100">
                              <strong className="text-slate-800">Sua comissão está 100% segura!</strong>
                              <p className="mt-1">
                                Nosso robô possui um sistema automático de contingência: se a API da Shopee estiver inativa ou sem sinal, ele gera automaticamente um <strong>Universal Link oficial com o seu ID de Afiliado</strong>. Todas as vendas enviadas para o WhatsApp continuarão pontuando suas comissões normalmente.
                              </p>
                            </div>
                          </div>
                        )}
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
            </div>

            {/* Mercado Livre Affiliate Section */}
            <div id="mercadolivre-api-section" className="border-t border-gray-150 pt-5 mt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-yellow-950">Plataforma Mercado Livre 💛</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      mercadolivreEnabled 
                        ? "bg-yellow-200 text-yellow-900 border-yellow-300" 
                        : "bg-gray-100 text-gray-600 border-gray-300"
                    }`}>
                      {mercadolivreEnabled ? "Mercado Livre Ativo" : "Mercado Livre Desativado"}
                    </span>
                  </div>
                  <span className="text-xs text-yellow-900/80 mt-0.5 leading-relaxed">
                    Ative ou desative a captura e conversão de anúncios do Mercado Livre (mercadolivre.com.br, meli.li).
                  </span>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    setMercadolivreEnabled(!mercadolivreEnabled);
                    setSaveStatus("unsaved");
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border font-bold text-xs transition-all cursor-pointer shadow-sm shrink-0 ${
                    mercadolivreEnabled
                      ? "bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-600"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300"
                  }`}
                >
                  <div className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-all ${mercadolivreEnabled ? "justify-end bg-slate-900/40" : "justify-start bg-slate-400"}`}>
                    <div className="w-3 h-3 bg-white rounded-full shadow-md" />
                  </div>
                  <span>{mercadolivreEnabled ? "LIGADO (ON)" : "DESLIGADO (OFF)"}</span>
                </button>
              </div>

              <div id="mercadolivre-api-inputs-container" className="p-4 bg-yellow-50/50 border border-yellow-200 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Tag / ID de Afiliado Mercado Livre (obrigatório)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      id="mercadolivre-affiliate-id-input"
                      type="text"
                      value={mlAffId}
                      onChange={(e) => {
                        setMlAffId(e.target.value);
                        setSaveStatus("unsaved");
                      }}
                      placeholder="Ex: heltonjulio1703 ou sua tag de afiliado"
                      className="flex-1 px-3 py-1.5 border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-xs text-slate-800 bg-white"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-yellow-800/80 mt-1.5">
                    Defina sua tag/ID de rastreamento do programa Mercado Livre Afiliados. Ela será aplicada aos links do Mercado Livre e links curtos meli.li.
                  </p>
                </div>
              </div>
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
