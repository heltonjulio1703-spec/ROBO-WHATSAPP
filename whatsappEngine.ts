import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import os from "os";
import { Boom } from "@hapi/boom";

// Types matching the main app
export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "qr_code" | "connected";
  phone: string;
  userName: string;
  qrCodeProgress: number;
  connectedAt: string | null;
  qrDataUrl?: string; // Base64 QR code image
  pairingCode?: string; // The generated pairing code if pairing method is used
  pairingPhone?: string; // Phone used for pairing code
}

export interface GroupItem {
  id: string;
  name: string;
  active: boolean;
}

// Helper to safely extract image buffer from a message object using stream or media download
async function downloadWhatsAppImageBuffer(msg: any, imageMsg: any): Promise<Buffer | null> {
  if (!imageMsg) return null;
  try {
    const stream = await downloadContentFromMessage(imageMsg, 'image');
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    if (buffer && buffer.length > 100) {
      return buffer;
    }
  } catch (err1) {
    console.warn("downloadContentFromMessage warn:", (err1 as Error).message);
  }

  try {
    const cleanMsg = { ...msg, message: { imageMessage: imageMsg } };
    const buf = await downloadMediaMessage(cleanMsg, 'buffer', {});
    if (buf && buf.length > 100) {
      return Buffer.from(buf);
    }
  } catch (err2) {
    console.warn("downloadMediaMessage warn:", (err2 as Error).message);
  }

  return null;
}

export class WhatsAppEngine {
  public sock: WASocket | null = null;
  public connectionTimestampSec: number = 0;
  public robotActivationTimestampSec: number = 0;
  public isRobotEnabled: boolean = false;
  public status: WhatsAppStatus = {
    status: "disconnected",
    phone: "",
    userName: "",
    qrCodeProgress: 0,
    connectedAt: null,
  };
  
  private isConnecting = false;
  private groupNameCache = new Map<string, string>();
  private messageStore = new Map<string, Array<any>>();

  public setRobotState(enabled: boolean, activationTimeMs: number = Date.now()) {
    this.isRobotEnabled = enabled;
    if (enabled) {
      this.robotActivationTimestampSec = Math.floor(activationTimeMs / 1000);
      // Clean previous message store to guarantee no old/buffered messages are retained
      this.messageStore.clear();
      const timeStr = new Date(activationTimeMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      this.addLogCallback("info", `🟢 [Modo Tempo Real Estrito] Robô ATIVADO às ${timeStr}. Capturando exclusivamente mensagens que chegarem a partir deste segundo.`);
    } else {
      this.robotActivationTimestampSec = 0;
      this.messageStore.clear();
      this.addLogCallback("info", `⏸️ Robô DESATIVADO. Nenhuma mensagem será acumulada em buffer.`);
    }
  }

  private storeGroupMessage(msg: any) {
    // If the robot is not enabled, do not store or buffer any messages
    if (!this.isRobotEnabled) return;
    if (!msg || !msg.key || !msg.key.remoteJid) return;
    const rawJid = msg.key.remoteJid;
    const cleanJid = rawJid.split(":")[0];
    if (!cleanJid.endsWith("@g.us")) return;

    // Only keep messages after robot activation
    const msgTimeSec = Number(msg.messageTimestamp) || 0;
    if (msgTimeSec > 0 && this.robotActivationTimestampSec > 0 && msgTimeSec < this.robotActivationTimestampSec) {
      return;
    }

    let list = this.messageStore.get(cleanJid);
    if (!list) {
      list = [];
      this.messageStore.set(cleanJid, list);
    }

    const msgId = msg.key.id;
    if (msgId && list.some(m => m.key?.id === msgId)) {
      return;
    }

    list.push(msg);
    if (list.length > 200) {
      list.shift();
    }
  }
  private authStatePath = (() => {
    const isElectron = typeof process !== 'undefined' && (process.versions?.electron || process.env.ELECTRON_RUN_AS_NODE);
    
    if (isElectron) {
      const homeDir = os.homedir();
      const appDataPath = path.join(homeDir, ".shopee-bot-sessions");
      if (!fs.existsSync(appDataPath)) {
        fs.mkdirSync(appDataPath, { recursive: true });
      }
      return path.join(appDataPath, "auth_info_baileys");
    }
    
    try {
      const testPath = path.join(process.cwd(), "test_write_perm");
      fs.mkdirSync(testPath, { recursive: true });
      fs.rmdirSync(testPath);
      return path.join(process.cwd(), "auth_info_baileys");
    } catch {
      return path.join(os.tmpdir(), "auth_info_baileys");
    }
  })();
  private addLogCallback: (type: "info" | "success" | "warning" | "error", message: string) => void;
  private onGroupsDiscoveredCallback: (groups: GroupItem[]) => void;
  private onMessageReceivedCallback: (
    groupJid: string, 
    groupName: string, 
    text: string, 
    imageBuffer?: Buffer,
    imageUrl?: string
  ) => Promise<void>;
  private onConnectedCallback?: () => void;

  constructor(
    addLog: (type: "info" | "success" | "warning" | "error", message: string) => void,
    onGroupsDiscovered: (groups: GroupItem[]) => void,
    onMessageReceived: (
      groupJid: string, 
      groupName: string, 
      text: string, 
      imageBuffer?: Buffer,
      imageUrl?: string
    ) => Promise<void>,
    onConnected?: () => void
  ) {
    this.addLogCallback = addLog;
    this.onGroupsDiscoveredCallback = onGroupsDiscovered;
    this.onMessageReceivedCallback = onMessageReceived;
    this.onConnectedCallback = onConnected;

    // Check if session directory already exists and try to auto-reconnect
    if (fs.existsSync(this.authStatePath)) {
      this.addLogCallback("info", "Sessão anterior do WhatsApp detectada. Tentando reconectar automaticamente...");
      this.connect();
    }
  }

  public async reset() {
    this.isConnecting = false;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners("connection.update");
        this.sock.ev.removeAllListeners("creds.update");
        this.sock.ev.removeAllListeners("messages.upsert");
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }
    this.status = {
      status: "disconnected",
      phone: "",
      userName: "",
      qrCodeProgress: 0,
      connectedAt: null,
    };
    this.addLogCallback("info", "Mecanismo de conexão reiniciado.");
  }

  public simulateSuccessfulConnection() {
    this.isConnecting = false;
    this.connectionTimestampSec = Math.floor(Date.now() / 1000);
    this.status = {
      status: "connected",
      phone: "+55 (11) 99999-8888",
      userName: "Conta de Teste (Simulada)",
      qrCodeProgress: 100,
      connectedAt: new Date().toLocaleString("pt-BR"),
      qrDataUrl: undefined
    };
    this.addLogCallback("success", "🟢 [Vercel Demo] WhatsApp conectado com sucesso como Conta de Teste!");
    this.fetchAndRegisterGroups();
    if (this.onConnectedCallback) {
      this.onConnectedCallback();
    }
  }

  public async connect(force = false, phoneNumber?: string) {
    console.log(`📡 WhatsAppEngine: Chamada de connect(force=${force}, phone=${phoneNumber}). Status atual: ${this.status.status}, isConnecting: ${this.isConnecting}`);
    
    if (this.isConnecting && !force) {
      this.addLogCallback("info", "Já existe uma tentativa de conexão em andamento...");
      return;
    }

    if (this.status.status === "connected" && !force) {
      this.addLogCallback("warning", "WhatsApp já está conectado.");
      return;
    }

    const isAlreadyConnected = this.status.status === "connected";

    this.isConnecting = true;
    this.status.status = "connecting";
    this.status.qrCodeProgress = 10;
    this.status.qrDataUrl = undefined;
    this.status.pairingCode = undefined;
    this.status.pairingPhone = undefined;

    // Vercel / Serverless Environment Detection
    const isVercel = typeof process !== 'undefined' && (
      process.env.VERCEL === '1' || 
      process.env.NOW_BUILDER === '1' || 
      process.env.VERCEL_ENV !== undefined ||
      process.env.IS_MOCK === 'true'
    );

    if (isVercel) {
      this.addLogCallback("warning", "⚠️ [Vercel] Executando em ambiente serverless. Iniciando em Modo de Conexão Simulada de demonstração...");
      this.status.status = "qr_code";
      this.status.qrCodeProgress = 50;
      
      if (phoneNumber) {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        this.status.pairingPhone = cleanPhone;
        // Generate a random-like pairing code
        const codeChars = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789";
        let code1 = "";
        let code2 = "";
        for (let i = 0; i < 4; i++) {
          code1 += codeChars.charAt(Math.floor(Math.random() * codeChars.length));
          code2 += codeChars.charAt(Math.floor(Math.random() * codeChars.length));
        }
        const simCode = `${code1}-${code2}`;
        this.status.pairingCode = simCode;
        this.status.qrCodeProgress = 95;
        this.addLogCallback("success", `🔑 [Vercel] Código de Emparelhamento simulado gerado para +${cleanPhone}: ${simCode}`);
        this.addLogCallback("info", "Clique em 'Confirmar Leitura' ou aguarde 5 segundos para simular a conexão bem-sucedida.");
        
        // Auto-connect after 5 seconds
        setTimeout(() => {
          if (this.status.status === "qr_code" && this.status.pairingCode === simCode) {
            this.simulateSuccessfulConnection();
          }
        }, 5000);
      } else {
        try {
          // Generates a mock QR code image pointing to Shopee affiliate page with high resolution
          this.status.qrDataUrl = await QRCode.toDataURL("https://shopee.com.br/m/afiliados-shopee?utm_source=vercel_demo_autopost", {
            margin: 1,
            width: 360,
            color: {
              dark: "#0f172a",
              light: "#ffffff"
            }
          });
          this.status.qrCodeProgress = 95;
          this.addLogCallback("info", "QR Code simulado gerado! Clique em 'Confirmar Leitura' ou aguarde 5 segundos para simular a leitura do código.");
          
          // Auto-connect after 5 seconds
          setTimeout(() => {
            if (this.status.status === "qr_code" && !this.status.pairingCode) {
              this.simulateSuccessfulConnection();
            }
          }, 5000);
        } catch (err) {
          console.error("Erro ao gerar QR Code simulado:", err);
          this.addLogCallback("error", "Falha ao gerar imagem do QR Code simulado.");
        }
      }
      this.isConnecting = false;
      return;
    }

    this.addLogCallback("info", "Iniciando processo de conexão oficial com WhatsApp...");

    try {
      // Limpeza profunda se for forçado ou se não estiver conectado para garantir geração de QR Code limpo
      if (force || !isAlreadyConnected) {
        console.log("📡 WhatsAppEngine: Limpando socket e sessão anterior...");
        try {
          if (this.sock) {
            this.sock.ev.removeAllListeners("connection.update");
            this.sock.ev.removeAllListeners("creds.update");
            this.sock.ev.removeAllListeners("messages.upsert");
            this.sock.end(undefined);
          }
        } catch (e) {
          console.error("Erro ao encerrar socket anterior:", e);
        }
        this.sock = null;

        // Limpar pasta de autenticação ao pedir um novo QR code para evitar travamento em credenciais inválidas/expiradas
        if (force && fs.existsSync(this.authStatePath)) {
          try {
            fs.rmSync(this.authStatePath, { recursive: true, force: true });
            console.log("📡 WhatsAppEngine: Pasta auth_info_baileys limpa para novo QR Code.");
          } catch (e) {
            console.error("Erro ao apagar authStatePath:", e);
          }
        }
      }

      console.log(`📡 WhatsAppEngine: Lendo estado em ${this.authStatePath}`);
      const { state, saveCreds } = await useMultiFileAuthState(this.authStatePath);
      
      let version: [number, number, number] = [2, 3000, 1017539728];
      try {
        const versionPromise = fetchLatestBaileysVersion();
        const timeoutPromise = new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error("Timeout version fetch")), 3000)
        );
        const { version: latestVersion } = await Promise.race([versionPromise, timeoutPromise]);
        version = latestVersion;
        console.log(`📡 Baileys: Versão obtida: ${version.join(".")}`);
      } catch (err) {
        console.warn("Usando fallback de versão Baileys:", err);
      }

      this.addLogCallback("info", "Aguardando geração do QR Code oficial pelo servidor WhatsApp...");

      this.sock = makeWASocket({
        version,
        logger: pino({
          level: "error",
        }, {
          write: (msg: string) => {
            if (
              msg.includes("No session found to decrypt message") ||
              msg.includes("transaction failed, rolling back") ||
              msg.includes("failed to decrypt message") ||
              msg.includes("skmsg") ||
              msg.includes("isSessionRecordError") ||
              msg.includes("stream:error") ||
              msg.includes("stream errored out") ||
              msg.includes('"code":515') ||
              msg.includes('"code":"515"') ||
              msg.includes("515") ||
              msg.includes("handling notification") ||
              msg.includes("Unexpected non-whitespace character after JSON") ||
              msg.includes("SyntaxError") ||
              msg.includes("process-message.ts")
            ) {
              return;
            }
            process.stdout.write(msg);
          }
        }) as any,
        auth: state,
        printQRInTerminal: false,
        browser: ["Chrome (Linux)", "", ""],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      this.sock.ev.on("creds.update", saveCreds);

      if (phoneNumber) {
        let cleanPhone = phoneNumber.replace(/\D/g, "");
        // If cleanPhone starts with + or contains DDI, Baileys expects standard digits string e.g. 5511999998888
        if (cleanPhone) {
          this.status.pairingPhone = cleanPhone;
          this.status.status = "qr_code";
          this.status.qrCodeProgress = 40;
          this.addLogCallback("info", `Aguardando registro inicial para solicitar código de emparelhamento para +${cleanPhone}...`);
          
          let pairingCodeRequested = false;
          let retryCount = 0;
          const maxRetries = 15;
          
          const requestPairing = async () => {
            if (pairingCodeRequested) {
              clearInterval(pairingInterval);
              return;
            }
            if (!this.sock) {
              clearInterval(pairingInterval);
              return;
            }
            
            try {
              if (!this.sock.authState.creds.registered) {
                this.addLogCallback("info", `Enviando solicitação de código de emparelhamento oficial para +${cleanPhone} (Tentativa ${retryCount + 1}/${maxRetries})...`);
                const code = await this.sock.requestPairingCode(cleanPhone);
                // Format code as ABCD-EFGH for high readability if it's 8 characters
                const formattedCode = code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
                this.status.pairingCode = formattedCode || code;
                this.status.qrCodeProgress = 95;
                pairingCodeRequested = true;
                this.addLogCallback("success", `🔑 Código de Emparelhamento oficial gerado com sucesso: ${this.status.pairingCode}`);
                clearInterval(pairingInterval);
              } else {
                this.addLogCallback("warning", "O WhatsApp já consta como registrado nesta sessão.");
                clearInterval(pairingInterval);
              }
            } catch (err) {
              const errMsg = (err as Error).message || String(err) || "";
              console.warn(`Tentativa ${retryCount + 1} de gerar pairing code falhou:`, errMsg);
              
              if (errMsg.includes("registered")) {
                this.addLogCallback("warning", "Aparelho já registrado. Não foi possível solicitar código de emparelhamento.");
                clearInterval(pairingInterval);
                return;
              }
              
              retryCount++;
              if (retryCount >= maxRetries) {
                this.addLogCallback("error", `Falha ao solicitar código de emparelhamento após ${maxRetries} tentativas: ${errMsg}`);
                clearInterval(pairingInterval);
              }
            }
          };
          
          const pairingInterval = setInterval(requestPairing, 3500);
          // Run first attempt after 2 seconds to allow WebSocket connection handshake
          setTimeout(requestPairing, 2000);
        }
      }

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log("📡 Baileys Update:", { connection, qr: !!qr });

        if (qr && !phoneNumber) {
          this.status.status = "qr_code";
          this.status.qrCodeProgress = 50;
          try {
            this.status.qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 1,
              width: 360,
              color: {
                dark: "#0f172a",
                light: "#ffffff"
              }
            });
            this.status.qrCodeProgress = 95;
            this.addLogCallback("info", "QR Code oficial do WhatsApp gerado com sucesso! Escaneie com seu celular.");
          } catch (err) {
            console.error("Erro QR:", err);
            this.addLogCallback("error", "Falha ao gerar imagem do QR Code.");
          }
        }

        if (connection === "open") {
          this.isConnecting = false;
          this.connectionTimestampSec = Math.floor(Date.now() / 1000);
          const userJid = this.sock?.user?.id || "";
          const userName = this.sock?.user?.name || "Minha Conta";
          const phone = userJid.split(":")[0] || "";

          this.status = {
            status: "connected",
            phone: `+${phone}`,
            userName: userName,
            qrCodeProgress: 100,
            connectedAt: new Date().toLocaleString("pt-BR"),
            qrDataUrl: undefined
          };
          this.addLogCallback("success", `🟢 Conectado com sucesso como ${userName}`);
          this.fetchAndRegisterGroups();
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        }

        if (connection === "close") {
          this.isConnecting = false;
          const err = lastDisconnect?.error as any;
          const statusCode = err?.output?.statusCode || err?.statusCode || err?.error?.output?.statusCode || Number(err?.error?.attrs?.code) || err?.output?.payload?.statusCode;
          
          const isStreamError = statusCode === DisconnectReason.restartRequired || statusCode === 515 || statusCode === 408 || statusCode === 503;
          
          if (!isStreamError) {
            console.log("📡 Conexão fechada. Código:", statusCode, "Erro:", err?.message || err);
          } else {
            console.log("📡 Stream WhatsApp reiniciando (Código 515/RestartRequired)...");
          }
          
          const wasConnected = this.status.status === "connected";
          const wasConnecting = this.status.status === "connecting" || this.status.status === "qr_code";

          if (!isStreamError && this.status.status !== "connected") {
            this.status.status = "disconnected";
          }
          this.sock = null;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
            this.addLogCallback("error", "Sessão encerrada ou inválida. Você precisará gerar um novo QR Code.");
            this.logout();
          } else {
            const shouldReconnect = isStreamError || wasConnected || wasConnecting || !lastDisconnect;
            if (shouldReconnect) {
              if (isStreamError) {
                this.addLogCallback("info", "🔄 Sincronizando conexão com os servidores do WhatsApp...");
              } else {
                this.addLogCallback("info", "Reconectando em 2s...");
              }
              setTimeout(() => this.connect(), isStreamError ? 500 : 2000);
            } else {
              this.addLogCallback("warning", "Conexão perdida. Clique em Conectar para tentar novamente.");
              this.status.status = "disconnected";
            }
          }
        }
      });

      // Sync and store history messages
      this.sock.ev.on("messaging-history.set" as any, ({ messages }: { messages: any[] }) => {
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            this.storeGroupMessage(msg);
          }
        }
      });

      this.sock.ev.on("messages.set" as any, ({ messages }: { messages: any[] }) => {
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            this.storeGroupMessage(msg);
          }
        }
      });

      // Helper to extract text and image content from wrapped message objects
      const extractMsgContent = (msg: any) => {
        if (!msg || !msg.message) return { text: "", imageMsg: null };
        let m = msg.message;
        if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
        if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
        if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
        if (m.editedMessage?.message) m = m.editedMessage.message;

        const text = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || 
                     m.documentMessage?.caption ||
                     "";

        const imageMsg = m.imageMessage || 
                         (m.documentMessage?.mimetype?.startsWith("image/") ? m.documentMessage : null);

        return { text, imageMsg };
      };

      // Incoming messages listener
      this.sock.ev.on("messages.upsert", async (m) => {
        // If robot is turned off, discard all incoming messages immediately (no buffering)
        if (!this.isRobotEnabled) {
          return;
        }

        // Ignore historical sync batches or appends from WhatsApp server (strictly live notify events)
        if (m.type !== "notify") {
          return;
        }

        // Store only post-activation messages
        for (const msg of m.messages) {
          this.storeGroupMessage(msg);
        }

        for (const msg of m.messages) {
          // Ignore messages sent by ourselves to avoid loops
          if (msg.key.fromMe) continue;

          const rawFrom = msg.key.remoteJid;
          if (!rawFrom) continue;
          const from = rawFrom.split(":")[0];
          if (!from.endsWith("@g.us")) continue; // Only group chats

          // Regra Estrita: Somente anúncios recebidos a partir do momento em que o robô foi ligado
          const msgTimeSec = Number(msg.messageTimestamp) || 0;
          const nowSec = Math.floor(Date.now() / 1000);
          
          // O limite mínimo é o momento da ativação do robô (com tolerância máxima de 60s em relação ao tempo real)
          const activationSec = this.robotActivationTimestampSec > 0 ? this.robotActivationTimestampSec : nowSec;
          const minAllowedSec = Math.max(activationSec, nowSec - 60);

          if (msgTimeSec > 0 && msgTimeSec < minAllowedSec) {
            // Descartar imediatamente mensagens anteriores à ativação do robô
            continue;
          }

          const { text, imageMsg } = extractMsgContent(msg);
          if (!text && !imageMsg) continue;

          // Obtain sender group name if cached, or use remoteJid
          let groupName = "Grupo WhatsApp";
          if (this.groupNameCache.has(from)) {
            groupName = this.groupNameCache.get(from)!;
          } else {
            try {
              const metadata = await this.sock?.groupMetadata(from);
              if (metadata?.subject) {
                groupName = metadata.subject;
                this.groupNameCache.set(from, groupName);
              }
            } catch (e) {
              // Ignore metadata fetch errors, use RemoteJid
              groupName = `Grupo (${from.split("@")[0]})`;
            }
          }

          let imageBuffer: Buffer | undefined = undefined;
          if (imageMsg) {
            try {
              this.addLogCallback("info", `Baixando imagem recebida de "${groupName}"...`);
              const buffer = await downloadWhatsAppImageBuffer(msg, imageMsg);
              if (buffer) {
                imageBuffer = buffer;
                this.addLogCallback("success", `📸 Imagem baixada com sucesso da mensagem de "${groupName}"!`);
              } else {
                this.addLogCallback("warning", `Não foi possível extrair diretamente o buffer da foto de "${groupName}". O sistema buscará a foto original do produto.`);
              }
            } catch (err) {
              this.addLogCallback("warning", `Falha ao carregar imagem da mensagem de "${groupName}": ${(err as Error).message}`);
            }
          }

          // Trigger processing of incoming message
          await this.onMessageReceivedCallback(from, groupName, text, imageBuffer);
        }
      });

    } catch (error) {
      this.isConnecting = false;
      console.error("ERRO FATAL NA INICIALIZAÇÃO DO WHATSAPP:", error);
      this.addLogCallback("error", `Erro crítico na conexão do WhatsApp: ${(error as Error).message}`);
      this.status.status = "disconnected";
      this.status.qrDataUrl = null;
      this.status.qrCodeProgress = 0;
      this.sock = null;
    }
  }

  // Fetch groups the logged-in user is currently in and populate them in source/target lists
  public async fetchAndRegisterGroups() {
    if (!this.sock) {
      // If we are in simulated mode, do not throw an error, just return simulated groups!
      const simulatedGroups = [
        { id: "120363198421045239@g.us", name: "Shopee Ofertas Bombásticas 💣", active: false },
        { id: "120363198421045240@g.us", name: "Cupom & Descontos Diários 🤑", active: false },
        { id: "120363198421045241@g.us", name: "Achados da Shopee Brasil 🇧🇷", active: false },
        { id: "120363198421045242@g.us", name: "Grupo da Família e Promoções 🏡", active: false },
        { id: "120363198421045243@g.us", name: "Canal de Teste Replicador 📲", active: false }
      ];
      simulatedGroups.forEach(g => {
        this.groupNameCache.set(g.id, g.name);
      });
      this.onGroupsDiscoveredCallback(simulatedGroups);
      this.addLogCallback("success", `✨ [Vercel Demo] Sincronizados ${simulatedGroups.length} grupos simulados de demonstração!`);
      return;
    }

    try {
      this.addLogCallback("info", "Buscando lista de grupos que você participa no WhatsApp...");
      const participatingGroups = await this.sock.groupFetchAllParticipating();
      
      const discoveredGroups: GroupItem[] = Object.values(participatingGroups).map((g) => {
        const name = g.subject || `Grupo (${g.id.split("@")[0]})`;
        this.groupNameCache.set(g.id, name);
        return {
          id: g.id,
          name: name,
          active: false, // Default to inactive until selected
        };
      });

      this.onGroupsDiscoveredCallback(discoveredGroups);
      this.addLogCallback("success", `✨ Sincronizados ${discoveredGroups.length} grupos reais do seu WhatsApp! Vá em 'Grupos e Canais' para ativá-los.`);
    } catch (err) {
      this.addLogCallback("warning", `Não foi possível listar os grupos automaticamente: ${(err as Error).message}`);
      throw err;
    }
  }

  // Send a message to a WhatsApp JID (Group or User) with optional image and target group name
  public async sendMessage(jid: string, text: string, imageBuffer?: Buffer, imageUrl?: string, targetName?: string) {
    const displayName = targetName || jid;

    if (!this.sock || this.status.status !== "connected") {
      if (this.status.status === "connected") {
        // Simulated sending of the message
        this.addLogCallback("success", `📢 [Vercel Demo] Enviado para "${displayName}" com sucesso!`);
        return true;
      }
      this.addLogCallback("error", `Erro: Tentativa de enviar mensagem para "${displayName}" mas o WhatsApp está desconectado.`);
      return false;
    }

    // Resolve real target JID if passed ID is a placeholder or key name
    let targetJid = jid;

    if (!targetJid.includes("@")) {
      const cleanJidQuery = targetJid.toLowerCase().trim();
      const cleanNameQuery = (targetName || "").toLowerCase().trim();

      for (const [gId, gName] of this.groupNameCache.entries()) {
        const cleanGName = gName.toLowerCase().trim();
        const cleanGId = gId.toLowerCase().trim();

        if (
          cleanGId === cleanJidQuery ||
          cleanGName === cleanJidQuery ||
          (cleanNameQuery && (cleanGName === cleanNameQuery || cleanGName.includes(cleanNameQuery) || cleanNameQuery.includes(cleanGName)))
        ) {
          targetJid = gId;
          break;
        }
      }
    }

    // Secondary resolution: fuzzy or partial match
    if (!targetJid.includes("@") && this.groupNameCache.size > 0) {
      const searchTerms = [targetName, jid].filter(Boolean).map(s => s!.toLowerCase().replace(/[^\w\s]/gi, "").trim());
      for (const [gId, gName] of this.groupNameCache.entries()) {
        const cleanGName = gName.toLowerCase().replace(/[^\w\s]/gi, "").trim();
        for (const term of searchTerms) {
          if (term && (cleanGName.includes(term) || term.includes(cleanGName))) {
            targetJid = gId;
            break;
          }
        }
        if (targetJid.includes("@")) break;
      }
    }

    if (!targetJid.includes("@")) {
      this.addLogCallback("warning", `ID do grupo de destino "${displayName}" não é um JID válido do WhatsApp (@g.us). Selecione um grupo sincronizado na aba 'Grupos e Canais'.`);
      return false;
    }

    // Helper to validate magic bytes of image buffer (JPEG, PNG, WEBP, GIF, BMP)
    const isValidImageBuffer = (buf: any): boolean => {
      if (!buf) return false;
      const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      if (b.length < 50) return false;

      // JPEG SOI: FF D8
      if (b[0] === 0xff && b[1] === 0xd8) return true;
      // PNG: 89 50 4E 47
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
      // WEBP: RIFF
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true;
      // GIF: 47 49 46
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
      // BMP: 42 4D
      if (b[0] === 0x42 && b[1] === 0x4d) return true;
      // ftyp
      if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;

      return b.length > 300;
    };

    let finalBuffer: Buffer | undefined = isValidImageBuffer(imageBuffer) ? Buffer.from(imageBuffer!) : undefined;

    if (!finalBuffer && imageUrl && typeof imageUrl === "string") {
      let fetchUrl = imageUrl.trim();
      if (fetchUrl.startsWith("//")) {
        fetchUrl = "https:" + fetchUrl;
      }
      if (fetchUrl.startsWith("http")) {
        try {
          const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          };
          if (fetchUrl.includes("shopee") || fetchUrl.includes("susercontent")) {
            headers["Referer"] = "https://shopee.com.br/";
          }
          const imgRes = await fetch(fetchUrl, { headers });
          if (imgRes.ok) {
            const ab = await imgRes.arrayBuffer();
            const downloadedBuf = Buffer.from(ab);
            if (isValidImageBuffer(downloadedBuf)) {
              finalBuffer = downloadedBuf;
            }
          }
        } catch (e) {
          console.warn("Não foi possível carregar buffer da imagem original:", e);
        }
      }
    }

    try {
      if (finalBuffer) {
        const sendBuf = Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer);
        await this.sock.sendMessage(targetJid, { image: sendBuf, caption: text });
        this.addLogCallback("success", `📸 Anúncio com FOTO enviado para "${displayName}"`);
      } else {
        await this.sock.sendMessage(targetJid, { text });
        this.addLogCallback("success", `💬 Anúncio enviado para "${displayName}"`);
      }
      return true;
    } catch (err) {
      this.addLogCallback("warning", `Falha no envio com foto para "${displayName}": ${(err as Error).message}. Tentando envio somente texto...`);
      try {
        await this.sock.sendMessage(targetJid, { text });
        this.addLogCallback("success", `💬 Anúncio enviado somente texto para "${displayName}"`);
        return true;
      } catch (fallbackErr) {
        this.addLogCallback("error", `Falha total no envio para "${displayName}": ${(fallbackErr as Error).message}`);
        return false;
      }
    }
  }

  // Fetch today's messages from a specific group and process them
  public async scanTodayMessages(
    groupId: string, 
    processCallback: (text: string, imageBuffer?: Buffer) => Promise<any>,
    sinceTimestampMs?: number
  ): Promise<{ totalFound: number; processedCount: number; messageCount: number; detailMessage: string }> {
    if (!this.sock && this.status.status === "connected") {
      // Simulated connection fallback
      const timeString = sinceTimestampMs 
        ? new Date(sinceTimestampMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "ativação";
      this.addLogCallback("info", `🔎 [Simulado] Buscando anúncios no grupo selecionado a partir das ${timeString}...`);
      
      const simulatedTodayMessages = [
        {
          timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          text: "🚨 CUPOM EXCLUSIVO SHOPEE! Fone de Ouvido Bluetooth Sem Fio i12 TWS com estojo de recarga por apenas R$ 18,90! Compre aqui: https://shopee.com.br/product-10293021-9988231 Garanta já o seu!"
        },
        {
          timestamp: Math.floor(Date.now() / 1000) - 1800, // 30 mins ago
          text: "🛍️ ACHADO IMPERDÍVEL! Garrafa de Água Motivacional 2 Litros com adesivos lindos por R$ 14,50. Link do produto: https://shope.ee/a283kd91 Corre que o estoque está acabando!"
        }
      ];

      let processed = 0;
      for (const msg of simulatedTodayMessages) {
        await processCallback(msg.text);
        processed++;
      }
      return { 
        totalFound: simulatedTodayMessages.length, 
        processedCount: processed,
        messageCount: simulatedTodayMessages.length,
        detailMessage: `Simulação: ${processed} oferta(s) processada(s) com sucesso.`
      };
    }

    if (!this.sock) {
      throw new Error("WhatsApp não está conectado.");
    }

    const cleanGroupId = groupId.split(":")[0].toLowerCase().trim();
    
    // Find messages for this group by direct JID, substring JID, or group name match
    let messages: Array<any> = [];
    for (const [key, msgList] of this.messageStore.entries()) {
      const cleanKey = key.split(":")[0].toLowerCase().trim();
      if (cleanKey === cleanGroupId || cleanKey.includes(cleanGroupId) || cleanGroupId.includes(cleanKey)) {
        messages = [...messages, ...msgList];
      } else {
        const groupName = (this.groupNameCache.get(key) || "").toLowerCase().trim();
        if (groupName && (groupName.includes(cleanGroupId) || cleanGroupId.includes(groupName))) {
          messages = [...messages, ...msgList];
        }
      }
    }

    // Deduplicate messages by key id
    const uniqueMap = new Map<string, any>();
    for (const m of messages) {
      const id = m.key?.id || JSON.stringify(m);
      uniqueMap.set(id, m);
    }
    messages = Array.from(uniqueMap.values());

    // If no stored messages in memory for this group yet
    if (messages.length === 0) {
      const noMsgDetail = "Nenhuma mensagem foi capturada da memória deste grupo até o momento. O robô monitora e processa mensagens continuamente assim que são postadas.";
      this.addLogCallback("info", `🔎 Varredura concluída: ${noMsgDetail}`);
      return { 
        totalFound: 0, 
        processedCount: 0, 
        messageCount: 0, 
        detailMessage: noMsgDetail 
      };
    }

    // Calculate boundary from sinceTimestampMs or fallback to 24h ago
    let minAllowedSec = sinceTimestampMs 
      ? Math.floor(sinceTimestampMs / 1000) 
      : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

    const timeString = sinceTimestampMs 
      ? new Date(sinceTimestampMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "ativação";

    this.addLogCallback("info", `🔎 Iniciando varredura no grupo (${messages.length} mensagens analisadas a partir do horário de ativação do robô às ${timeString})...`);
    
    let totalFound = 0;
    let processedCount = 0;
    let detailMessage = "";
    
    try {
      const seenLinksInScan = new Set<string>();
      
      for (const msg of messages) {
        const timestamp = Number(msg.messageTimestamp) || 0;
        if (timestamp > 0 && timestamp < minAllowedSec) continue;
        
        let m = msg.message || {};
        if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
        if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
        if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
        if (m.editedMessage?.message) m = m.editedMessage.message;

        const text = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || 
                     "";
                        
        if (!text) continue;
        
        // Comprehensive Shopee & Mercado Livre link detection regex
        const dealLinkRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|shp\.ee|shope\.ee|s\.shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|a\.shopee\.[a-z]{2,3}|mercadolivre\.com(?:\.br)?|mercadolibre\.com(?:\.[a-z]{2})?|ml\.com\.br|meli\.li|meli\.la|sec\.mercadolivre\.com(?:\.br)?|sec\.mercadolibre\.com(?:\.[a-z]{2})?|produto\.mercadolivre\.com\.br|lista\.mercadolivre\.com\.br|social\.mercadolivre\.com\.br|p\.mercadolivre\.com\.br|oferta\.mercadolivre\.com\.br)[^\s]+)/gi;
        const match = text.match(dealLinkRegex);
        
        if (!match || match.length === 0) continue;

        const foundLink = match[0].toLowerCase().trim().replace(/[.,;:!?)\]]+$/, "");
        
        // Discard if repeated within the same scan batch
        if (seenLinksInScan.has(foundLink)) {
          continue;
        }
        seenLinksInScan.add(foundLink);
        
        totalFound++;
        
        let imageBuffer: Buffer | undefined = undefined;
        const imgObj = m.imageMessage || (m.documentMessage?.mimetype?.startsWith("image/") ? m.documentMessage : null);
        if (imgObj) {
          try {
            const downloaded = await downloadWhatsAppImageBuffer(msg, imgObj);
            if (downloaded) {
              imageBuffer = downloaded;
            }
          } catch (err) {
            this.addLogCallback("warning", `Não foi possível carregar a imagem do histórico da mensagem.`);
          }
        }
        
        const result = await processCallback(text, imageBuffer);
        if (result) {
          processedCount++;
        }
      }

      if (totalFound === 0) {
        detailMessage = `Nenhuma oferta com link promocional (Shopee ou Mercado Livre) foi encontrada nas ${messages.length} mensagens analisadas (a partir das ${timeString}).`;
        this.addLogCallback("info", `🔎 Varredura concluída: ${detailMessage}`);
      } else if (processedCount === 0) {
        detailMessage = `Foram identificadas ${totalFound} oferta(s) com link promocional (Shopee / Mercado Livre), porém todas já haviam sido enviadas anteriormente ou descartadas por repetição.`;
        this.addLogCallback("info", `🔎 Varredura concluída: ${detailMessage}`);
      } else {
        detailMessage = `Sucesso! ${totalFound} oferta(s) encontrada(s) a partir das ${timeString} e ${processedCount} nova(s) oferta(s) reescrita(s) e encaminhada(s) para os grupos de destino!`;
        this.addLogCallback("success", `✨ Varredura concluída: ${detailMessage}`);
      }
    } catch (err) {
      this.addLogCallback("error", `Erro ao varrer histórico do grupo: ${(err as Error).message}`);
      throw err;
    }
    
    return { totalFound, processedCount, messageCount: messages.length, detailMessage };
  }

  // Clear credentials and disconnect
  public async logout() {
    this.status = {
      status: "disconnected",
      phone: "",
      userName: "",
      qrCodeProgress: 0,
      connectedAt: null,
    };

    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {}
      this.sock = null;
    }

    // Safely remove session folder
    try {
      if (fs.existsSync(this.authStatePath)) {
        fs.rmSync(this.authStatePath, { recursive: true, force: true });
        this.addLogCallback("info", "Dados de autenticação locais removidos com sucesso.");
      }
    } catch (err) {
      this.addLogCallback("error", `Erro ao limpar diretório de sessão: ${(err as Error).message}`);
    }
  }
}
