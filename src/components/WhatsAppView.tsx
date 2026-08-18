import React from "react";
import { WhatsAppStatus } from "../types";
import { Wifi, WifiOff, Loader2, ShieldCheck, LogOut, QrCode, Smartphone, RefreshCw, Copy, Check, ArrowRight, PhoneCall } from "lucide-react";
import { motion } from "motion/react";
import { WhatsAppIcon } from "./WhatsAppIcon";

interface WhatsAppViewProps {
  status: WhatsAppStatus;
  onConnect: (phoneNumber?: string) => Promise<void>;
  onConfirmScan?: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  isOffline?: boolean;
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({
  status,
  onConnect,
  onConfirmScan,
  onDisconnect,
  isOffline = false,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState(30);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = React.useState(false);
  const [connectMethod, setConnectMethod] = React.useState<"qr" | "pairing">("pairing");
  const [pairingPhone, setPairingPhone] = React.useState("");
  const [pairingError, setPairingError] = React.useState("");
  const [copiedCode, setCopiedCode] = React.useState(false);

  // Helper to format typed phone number nicely for preview
  const formatPhoneDisplay = (raw: string) => {
    let clean = raw.replace(/\D/g, "");
    clean = clean.replace(/^0+/, "");
    if ((clean.length === 10 || clean.length === 11) && !clean.startsWith("55")) {
      clean = "55" + clean;
    }
    if (clean.startsWith("55")) {
      const ddd = clean.slice(2, 4);
      const rest = clean.slice(4);
      if (rest.length > 5) {
        return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(rest.length - 4)}`;
      } else if (rest.length > 0) {
        return `+55 (${ddd}) ${rest}`;
      } else if (ddd.length > 0) {
        return `+55 (${ddd}`;
      }
    }
    return clean.length > 0 ? `+${clean}` : "";
  };

  const handleCopyPairingCode = () => {
    if (!status.pairingCode) return;
    const cleanCode = status.pairingCode.replace(/-/g, "");
    navigator.clipboard.writeText(cleanCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    }).catch(() => {
      navigator.clipboard.writeText(status.pairingCode || "");
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    });
  };

  // Countdown for QR code expiration & automatic refresh
  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status.status === "qr_code") {
      setCountdown(30);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Auto refresh QR code when countdown reaches 0
            if (!status.pairingCode) {
              onConnect().catch(console.error);
            }
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status.status, status.pairingCode, onConnect]);

  const handleGenerateQR = async () => {
    setLoading(true);
    await onConnect();
    setLoading(false);
  };

  const handleDisconnect = () => {
    setShowConfirmDisconnect(true);
  };

  return (
    <div id="whatsapp-view-container" className="max-w-4xl mx-auto">
      
      {/* Visual Status Indicator Panel */}
      <div id="conn-state-banner" className={`rounded-2xl p-6 border mb-8 flex flex-col md:flex-row items-center justify-between gap-6 ${
        status.status === "connected"
          ? "bg-green-50/70 border-green-200 text-green-900"
          : status.status === "connecting" || status.status === "qr_code"
            ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
            : "bg-gray-50 border-gray-200 text-gray-800"
      }`}>
        <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
          <div className={`p-3 rounded-2xl flex items-center justify-center shrink-0 ${
            status.status === "connected"
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
              : status.status === "connecting" || status.status === "qr_code"
                ? "bg-indigo-50 text-indigo-600 animate-pulse border border-indigo-100"
                : "bg-slate-50 text-slate-400 border border-slate-200"
          }`}>
            <WhatsAppIcon className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {status.status === "connected" && "WhatsApp Conectado"}
              {status.status === "connecting" && "Iniciando Conexão..."}
              {status.status === "qr_code" && (status.pairingCode ? "Código de Pareamento Gerado" : "Aguardando Leitura do QR Code")}
              {status.status === "disconnected" && "WhatsApp Desconectado"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {status.status === "connected" && `Dispositivo pareado como ${status.userName} (${status.phone})`}
              {status.status === "connecting" && "Preparando serviços e aguardando servidor do WhatsApp..."}
              {status.status === "qr_code" && (
                status.pairingCode 
                  ? `Digite o código de pareamento no seu celular WhatsApp para o número +${status.pairingPhone}.`
                  : "Abra o WhatsApp no seu celular e escaneie o código QR oficial abaixo."
              )}
              {status.status === "disconnected" && "Inicie a conexão para que o robô possa ler e reenviar mensagens."}
            </p>
          </div>
        </div>

        {status.status !== "disconnected" && (
          <button
            id="disconnect-session-btn"
            onClick={handleDisconnect}
            disabled={loading}
            className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-4 rounded-xl text-sm border border-red-200 transition-colors flex items-center gap-2 cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
            {status.status === "connected" ? "Desconectar Sessão" : "Cancelar e Limpar Sessão"}
          </button>
        )}
      </div>

      {/* Main Connection Wizards */}
      <div id="conn-main-wizard" className="bg-white rounded-2xl shadow-xs border border-gray-100 p-8">
        
        {/* State: DISCONNECTED */}
        {status.status === "disconnected" && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="bg-gray-100 p-1 rounded-xl inline-flex">
                <button
                  type="button"
                  onClick={() => setConnectMethod("qr")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    connectMethod === "qr"
                      ? "bg-white text-gray-800 shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
                <button
                  type="button"
                  onClick={() => setConnectMethod("pairing")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    connectMethod === "pairing"
                      ? "bg-white text-gray-800 shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  Número de Telefone (Código)
                </button>
              </div>
            </div>

            {connectMethod === "qr" ? (
              <div className="text-center py-6 space-y-4">
                <div className="max-w-md mx-auto">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 font-display">Conectar com Código QR</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Gere o código QR oficial em tempo real para conectar seu celular escaneando com a câmera.
                  </p>
                  <button
                    id="generate-qr-btn"
                    onClick={handleGenerateQR}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-sm shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Iniciando Conexão...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-5 h-5" />
                        Gerar Código QR
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto py-4 space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 font-display">Conectar com Número de Telefone</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Insira seu número com DDD (Ex: <strong>(11) 98765-4321</strong> ou <strong>5511987654321</strong>) para gerar um código oficial de emparelhamento.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                      Número do Celular (com DDD)
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        placeholder="Ex: (11) 98765-4321 ou 5511987654321"
                        value={pairingPhone}
                        onChange={(e) => {
                          setPairingPhone(e.target.value);
                          setPairingError("");
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && !loading && pairingPhone.trim()) {
                            e.preventDefault();
                            document.getElementById("generate-pairing-code-btn")?.click();
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                      />
                    </div>
                    {pairingPhone.trim() && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Formato WhatsApp: <strong>{formatPhoneDisplay(pairingPhone)}</strong></span>
                      </div>
                    )}
                    {pairingError && (
                      <p className="text-xs text-red-500 mt-1">{pairingError}</p>
                    )}
                  </div>

                  <button
                    id="generate-pairing-code-btn"
                    onClick={async () => {
                      if (!pairingPhone.trim()) {
                        setPairingError("Por favor, digite seu número de telefone.");
                        return;
                      }
                      const clean = pairingPhone.replace(/\D/g, "");
                      if (clean.length < 10) {
                        setPairingError("Por favor, digite um número válido com DDD (Ex: 11987654321 ou 5511987654321).");
                        return;
                      }
                      setLoading(true);
                      await onConnect(pairingPhone);
                      setLoading(false);
                    }}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-sm shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Gerando Código de Pareamento...
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-5 h-5" />
                        Gerar Código de Pareamento
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* State: CONNECTING (Loading) */}
        {status.status === "connecting" && (
          <div className="text-center py-16 space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
            <p className="text-gray-600 font-semibold text-sm">Criando sessão segura com o WhatsApp...</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Aguardando os servidores oficiais do WhatsApp gerarem a chave de autenticação.
            </p>
          </div>
        )}

        {/* State: QR_CODE (Scanning Area) */}
        {status.status === "qr_code" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center py-4">
            {/* Left side: Instructions */}
            <div className="space-y-5">
              {status.pairingCode ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                      <Smartphone className="w-5 h-5" />
                    </span>
                    <h3 className="text-lg font-bold text-gray-800">Como Parear com Código no Celular</h3>
                  </div>
                  <ol className="space-y-3.5 text-sm text-gray-600 list-decimal pl-4">
                    <li>Abra o <strong>WhatsApp</strong> no seu celular.</li>
                    <li>Toque nos <strong>Três Pontinhos</strong> (ou <strong>Configurações</strong> no iOS) &gt; <strong>Aparelhos conectados</strong>.</li>
                    <li>Toque no botão <strong>Conectar um aparelho</strong>.</li>
                    <li>Na parte inferior da câmera de escaneamento, toque na opção <strong>Conectar com número de telefone</strong> (ou Conectar usando código).</li>
                    <li>Digite no celular o código de 8 caracteres exibido ao lado.</li>
                  </ol>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-800 mt-4">
                    <p className="font-semibold mb-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      Conexão Oficial Segura
                    </p>
                    <p className="leading-relaxed text-indigo-700">
                      Assim que você digitar o código no celular, a conexão será autenticada e estabelecida automaticamente em tempo real.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-800">Como Parear seu Aparelho</h3>
                  <ol className="space-y-4 text-sm text-gray-600 list-decimal pl-4">
                    <li>Abra o <strong>WhatsApp</strong> no seu celular.</li>
                    <li>Toque em <strong>Mais opções</strong> (três pontinhos) ou <strong>Configurações</strong> e selecione <strong>Aparelhos conectados</strong>.</li>
                    <li>Toque em <strong>Conectar um aparelho</strong>.</li>
                    <li>Aponte a câmera do celular para o código QR à direita para realizar o escaneamento.</li>
                  </ol>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-xs text-emerald-800 mt-6">
                    <p className="font-semibold mb-1">📱 Conexão Oficial via WhatsApp Web</p>
                    <p className="leading-relaxed">
                      O código abaixo é gerado em tempo real. Aponte a câmera do seu aplicativo oficial do WhatsApp no celular para parear a sessão.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Right side: QR Code or Pairing Code Visualizer */}
            <div className="flex flex-col items-center justify-center border-l border-gray-100 md:pl-8">
              
              {status.pairingCode ? (
                /* Pairing Code Graphic Representation */
                <div className="flex flex-col items-center w-full max-w-xs space-y-4">
                  <div className="p-6 bg-gradient-to-b from-indigo-50/80 to-white rounded-2xl border-2 border-indigo-200 text-center space-y-3 w-full shadow-sm">
                    <span className="text-xs font-bold uppercase text-indigo-600 tracking-wider">Código de Conexão</span>
                    <div className="text-3xl md:text-4xl font-extrabold tracking-widest font-mono bg-white text-indigo-700 border-2 border-indigo-300 rounded-2xl px-4 py-4 shadow-inner select-all">
                      {status.pairingCode}
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleCopyPairingCode}
                      className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        copiedCode
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                      }`}
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-4 h-4" />
                          Código Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copiar Código
                        </>
                      )}
                    </button>

                    <div className="text-[11px] text-gray-400 pt-1">
                      Número: <strong className="text-gray-700">+{status.pairingPhone}</strong>
                    </div>
                  </div>

                  <div className="w-full flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConnectMethod("pairing");
                        onConnect(status.pairingPhone || pairingPhone);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Gerar Novo Código
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onDisconnect();
                      }}
                      className="text-gray-500 hover:text-gray-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      Trocar Número
                    </button>
                  </div>

                  {isOffline && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mt-2 max-w-xs text-left shadow-xs">
                      <p className="font-bold mb-1 flex items-center gap-1 text-amber-800">
                        ⚠️ Código de Teste (Simulado)
                      </p>
                      <p className="leading-relaxed text-slate-600">
                        Este site está rodando em modo de demonstração (Vercel sem servidor). O código gerado é <strong>apenas fictício</strong> e não funcionará se digitado no celular real.
                      </p>
                      <p className="leading-relaxed mt-2 text-slate-600 font-medium">
                        Para ativar e testar todas as funcionalidades, use o botão verde abaixo: <strong>"Confirmar Leitura / Simular Conexão"</strong>!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* QR Code Graphic Representation */
                <div className="flex flex-col items-center">
                  <div className="relative p-5 bg-slate-50 rounded-2xl border border-gray-200 flex flex-col items-center">
                    <div className="w-56 h-56 flex flex-col items-center justify-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                      {status.qrDataUrl ? (
                        <>
                          <img
                            src={status.qrDataUrl}
                            alt="WhatsApp QR Code"
                            className="w-50 h-50 object-contain rounded-md"
                            referrerPolicy="no-referrer"
                          />
                          {/* Corner guide markers for camera alignment */}
                          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-indigo-600 rounded-tl-xs pointer-events-none" />
                          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-indigo-600 rounded-tr-xs pointer-events-none" />
                          <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-indigo-600 rounded-bl-xs pointer-events-none" />
                          <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-indigo-600 rounded-br-xs pointer-events-none" />
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-3 space-y-2">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                          <p className="text-xs text-gray-600 font-medium">Gerando QR Code oficial...</p>
                          <p className="text-[10px] text-gray-400">Aguardando resposta do WhatsApp</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateQR}
                      disabled={loading}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer py-1 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                      {loading ? "Atualizando..." : "Gerar Novo QR Code"}
                    </button>
                  </div>

                  {isOffline && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mt-4 max-w-xs text-left shadow-xs">
                      <p className="font-bold mb-1 flex items-center gap-1 text-amber-800">
                        ⚠️ QR Code de Teste (Simulado)
                      </p>
                      <p className="leading-relaxed text-slate-600">
                        Este site está rodando em modo de demonstração (Vercel sem servidor). O QR Code é <strong>apenas fictício</strong> e não funcionará no celular real.
                      </p>
                      <p className="leading-relaxed mt-2 text-slate-600 font-medium">
                        Para ativar e testar todas as funcionalidades, use o botão verde abaixo: <strong>"Confirmar Leitura / Simular Conexão"</strong>!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Count down text */}
              <div className="w-full max-w-[250px] mt-4 text-center">
                {!status.pairingCode && (
                  <>
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-1000"
                        style={{ width: `${(countdown / 30) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      O código expira e renova em <strong className="text-gray-600 font-semibold">{countdown}s</strong>
                    </p>
                  </>
                )}

                {/* Simulated scan confirmation button for easy testing / Vercel compatibility */}
                {onConfirmScan && (
                  <button
                    onClick={async () => {
                      setLoading(true);
                      await onConfirmScan();
                      setLoading(false);
                    }}
                    disabled={loading}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Confirmar Leitura / Simular Conexão
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* State: CONNECTED */}
        {status.status === "connected" && (
          <div className="py-6 max-w-lg mx-auto text-center space-y-6">
            <div className="inline-flex p-4 bg-emerald-50 rounded-full text-emerald-600 border border-emerald-100 shadow-xs">
              <ShieldCheck className="w-12 h-12" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100/70 border border-emerald-200 rounded-full text-emerald-800 text-xs font-bold mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Modo 24/7 Ativo: Conexão Permanente sem Limite de Tempo
              </div>
              <h3 className="text-xl font-bold text-gray-800">Conexão Estabelecida com Sucesso!</h3>
              <p className="text-sm text-gray-500 mt-1">
                Sua conta do WhatsApp está conectada de forma permanente para envio ininterrupto o dia todo.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-5 border border-gray-150 text-left space-y-3 font-mono text-xs text-gray-600">
              <div className="flex justify-between border-b border-gray-200/50 pb-2">
                <span>Usuário Pareado:</span>
                <strong className="text-gray-800">{status.userName}</strong>
              </div>
              <div className="flex justify-between border-b border-gray-200/50 pb-2">
                <span>Número do Telefone:</span>
                <strong className="text-gray-800">{status.phone}</strong>
              </div>
              <div className="flex justify-between border-b border-gray-200/50 pb-2">
                <span>Data de Conexão:</span>
                <strong className="text-gray-800">{status.connectedAt}</strong>
              </div>
              <div className="flex justify-between">
                <span>Status da Conexão:</span>
                <strong className="text-emerald-600 font-bold">🟢 Permanente 24/7 (Keep-Alive Ativo)</strong>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-4 text-xs text-emerald-800 text-left space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Robô Operando sem Limite de Tempo!
              </p>
              <p className="leading-relaxed text-emerald-900">
                O robô manterá a sessão aberta com <strong>keep-alive ativo</strong> e <strong>auto-reconexão imediata</strong>. Você pode deixá-lo trabalhando o dia todo para capturar e enviar todas as ofertas automaticamente.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Custom Confirmation Modal */}
      {showConfirmDisconnect && (
        <div id="confirm-disconnect-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 text-center space-y-4"
          >
            <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Desconectar WhatsApp?</h3>
              <p className="text-sm text-gray-500 mt-2">
                Tem certeza que deseja desconectar e limpar os dados de autenticação? Você precisará ler o QR Code novamente para conectar.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                id="cancel-disconnect-btn"
                type="button"
                onClick={() => setShowConfirmDisconnect(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-sm transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="confirm-disconnect-btn"
                type="button"
                onClick={async () => {
                  setShowConfirmDisconnect(false);
                  setLoading(true);
                  try {
                    await onDisconnect();
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-all cursor-pointer shadow-md shadow-red-600/10"
              >
                Sim, Desconectar
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
