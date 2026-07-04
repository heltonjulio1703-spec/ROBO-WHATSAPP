import React from "react";
import { WhatsAppStatus } from "../types";
import { Wifi, WifiOff, Loader2, CheckCircle2, ShieldCheck, LogOut, QrCode } from "lucide-react";
import { motion } from "motion/react";

interface WhatsAppViewProps {
  status: WhatsAppStatus;
  onConnect: () => Promise<void>;
  onConfirmScan: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({
  status,
  onConnect,
  onConfirmScan,
  onDisconnect,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState(30);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = React.useState(false);

  // Countdown for simulated QR code expiration
  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status.status === "qr_code") {
      setCountdown(30);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            return 30; // resets or simulates new QR code
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status.status]);

  const handleGenerateQR = async () => {
    setLoading(true);
    await onConnect();
    setLoading(false);
  };

  const handleSimulateScan = async () => {
    setLoading(true);
    await onConfirmScan();
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
          <div className={`p-4 rounded-full ${
            status.status === "connected"
              ? "bg-green-100 text-green-600"
              : status.status === "connecting" || status.status === "qr_code"
                ? "bg-indigo-100 text-indigo-600 animate-pulse"
                : "bg-gray-100 text-gray-400"
          }`}>
            {status.status === "connected" ? (
              <Wifi className="w-8 h-8" />
            ) : (
              <WifiOff className="w-8 h-8" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {status.status === "connected" && "WhatsApp Conectado"}
              {status.status === "connecting" && "Iniciando Conexão..."}
              {status.status === "qr_code" && "Aguardando Leitura do QR Code"}
              {status.status === "disconnected" && "WhatsApp Desconectado"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {status.status === "connected" && `Dispositivo pareado como ${status.userName} (${status.phone})`}
              {status.status === "connecting" && "Preparando serviços e gerando token de pareamento..."}
              {status.status === "qr_code" && "Abra o WhatsApp no seu celular e simule o escaneamento abaixo."}
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
          <div className="text-center py-10 space-y-6">
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Conectar Nova Conta</h3>
              <p className="text-sm text-gray-500 mb-6">
                Nosso robô se conecta utilizando a API de simulação de WhatsApp Web. Para começar, clique no botão para gerar um novo código de acesso QR.
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
                    Gerando Token...
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5" />
                    Gerar QR Code de Conexão
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* State: CONNECTING (Loading) */}
        {status.status === "connecting" && (
          <div className="text-center py-16 space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
            <p className="text-gray-600 font-semibold text-sm">Criando sessão segura...</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Estamos configurando um emulador de WhatsApp Web em segundo plano. Isso levará apenas alguns instantes.
            </p>
          </div>
        )}

        {/* State: QR_CODE (Scanning Area) */}
        {status.status === "qr_code" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center py-4">
            {/* Left side: Instructions */}
            <div className="space-y-5">
              <h3 className="text-lg font-bold text-gray-800">Como Parear seu Aparelho</h3>
              
              <ol className="space-y-4 text-sm text-gray-600 list-decimal pl-4">
                <li>Abra o <strong>WhatsApp</strong> no seu celular.</li>
                <li>Toque em <strong>Mais opções</strong> (três pontinhos) ou <strong>Configurações</strong> e selecione <strong>Aparelhos conectados</strong>.</li>
                <li>Toque em <strong>Conectar um aparelho</strong>.</li>
                <li>Aponte a câmera do celular para o código QR à direita para realizar o escaneamento.</li>
              </ol>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 mt-6">
                <p className="font-semibold mb-1">💡 Modo de Demonstração Inteligente</p>
                <p className="leading-relaxed">
                  Para facilitar seu teste sem precisar expor seu WhatsApp real em nosso ambiente de testes, criamos um <strong>Simulador Automático de Leitura</strong>. Clique no botão de confirmação abaixo para simular um pareamento com sucesso imediatamente!
                </p>
              </div>
            </div>

            {/* Right side: QR Code Visualizer */}
            <div className="flex flex-col items-center justify-center border-l border-gray-100 md:pl-8">
              
              {/* QR Code Graphic Representation */}
              <div className="relative p-6 bg-slate-50 rounded-2xl border border-gray-200">
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-1 bg-white p-4 rounded-xl border border-gray-100 shadow-inner">
                  {status.qrDataUrl ? (
                    <img
                      src={status.qrDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-44 h-44 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    /* Styled simulated vector QR code using SVG */
                    <svg viewBox="0 0 100 100" className="w-44 h-44 text-slate-800">
                      {/* Corner squares (Position indicators) */}
                      <rect x="0" y="0" width="25" height="25" fill="currentColor" rx="1" />
                      <rect x="4" y="4" width="17" height="17" fill="white" rx="1" />
                      <rect x="8" y="8" width="9" height="9" fill="currentColor" rx="0.5" />

                      <rect x="75" y="0" width="25" height="25" fill="currentColor" rx="1" />
                      <rect x="79" y="4" width="17" height="17" fill="white" rx="1" />
                      <rect x="83" y="8" width="9" height="9" fill="currentColor" rx="0.5" />

                      <rect x="0" y="75" width="25" height="25" fill="currentColor" rx="1" />
                      <rect x="4" y="79" width="17" height="17" fill="white" rx="1" />
                      <rect x="8" y="83" width="9" height="9" fill="currentColor" rx="0.5" />

                      {/* Fake Data Blocks */}
                      <rect x="35" y="5" width="10" height="5" fill="currentColor" />
                      <rect x="40" y="15" width="20" height="5" fill="currentColor" />
                      <rect x="60" y="5" width="5" height="15" fill="currentColor" />
                      
                      <rect x="5" y="35" width="15" height="5" fill="currentColor" />
                      <rect x="15" y="45" width="10" height="10" fill="currentColor" />
                      <rect x="5" y="60" width="5" height="10" fill="currentColor" />

                      <rect x="35" y="35" width="30" height="30" fill="currentColor" rx="1" />
                      <rect x="40" y="40" width="20" height="20" fill="white" rx="1" />
                      <rect x="45" y="45" width="10" height="10" fill="currentColor" />

                      <rect x="80" y="35" width="10" height="5" fill="currentColor" />
                      <rect x="70" y="45" width="5" height="15" fill="currentColor" />
                      <rect x="85" y="55" width="10" height="10" fill="currentColor" />

                      <rect x="35" y="75" width="15" height="5" fill="currentColor" />
                      <rect x="40" y="85" width="10" height="10" fill="currentColor" />
                      <rect x="55" y="80" width="15" height="15" fill="currentColor" />
                      
                      <rect x="75" y="75" width="5" height="5" fill="currentColor" />
                      <rect x="85" y="80" width="10" height="5" fill="currentColor" />
                      <rect x="80" y="90" width="15" height="5" fill="currentColor" />
                    </svg>
                  )}
                </div>

                {/* Expiration warning block */}
                <div className="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-350 cursor-pointer p-4 text-center">
                  <QrCode className="w-8 h-8 text-indigo-600 mb-2 animate-bounce" />
                  <p className="text-xs font-bold text-gray-700">QR Code Dinâmico</p>
                  <p className="text-[10px] text-gray-400 mt-1">Atualiza a cada 30 segundos para segurança.</p>
                </div>
              </div>

              {/* Progress Count down text */}
              <div className="w-full max-w-[250px] mt-4 text-center">
                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-1000"
                    style={{ width: `${(countdown / 30) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  O código expira e renova em <strong className="text-gray-600 font-semibold">{countdown}s</strong>
                </p>
              </div>

              {/* Scan simulation activation button */}
              <button
                id="simulate-scan-btn"
                onClick={handleSimulateScan}
                disabled={loading}
                className="mt-6 w-full max-w-[250px] bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-green-600/10 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Simular Leitura do QR Code
                  </>
                )}
              </button>

            </div>
          </div>
        )}

        {/* State: CONNECTED */}
        {status.status === "connected" && (
          <div className="py-6 max-w-lg mx-auto text-center space-y-6">
            <div className="inline-flex p-4 bg-green-50 rounded-full text-green-600 border border-green-100">
              <ShieldCheck className="w-12 h-12" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-800">Conexão Estabelecida com Sucesso!</h3>
              <p className="text-sm text-gray-500 mt-1">
                Sua conta do WhatsApp está conectada ao nosso emulador em segundo plano.
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
                <span>ID do Canal de Sessão:</span>
                <strong className="text-gray-400">ch_session_saf_91a03d</strong>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200/50 rounded-xl p-4 text-xs text-green-800 text-left">
              <p className="font-bold mb-1">🚀 Robô em Prontidão!</p>
              <p className="leading-relaxed">
                Agora o robô está ativo e pronto para receber mensagens. Ative o <strong>Piloto Automático</strong> na página inicial para ver simulações de anúncios em tempo real, ou vá para o <strong>Laboratório de Testes</strong> para enviar mensagens manuais.
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
