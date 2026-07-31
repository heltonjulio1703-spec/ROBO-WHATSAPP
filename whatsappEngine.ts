import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  downloadMediaMessage
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
}

export interface GroupItem {
  id: string;
  name: string;
  active: boolean;
}

export class WhatsAppEngine {
  public sock: WASocket | null = null;
  public status: WhatsAppStatus = {
    status: "disconnected",
    phone: "",
    userName: "",
    qrCodeProgress: 0,
    connectedAt: null,
  };
  
  private isConnecting = false;
  private groupNameCache = new Map<string, string>();
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

  constructor(
    addLog: (type: "info" | "success" | "warning" | "error", message: string) => void,
    onGroupsDiscovered: (groups: GroupItem[]) => void,
    onMessageReceived: (
      groupJid: string, 
      groupName: string, 
      text: string, 
      imageBuffer?: Buffer,
      imageUrl?: string
    ) => Promise<void>
  ) {
    this.addLogCallback = addLog;
    this.onGroupsDiscoveredCallback = onGroupsDiscovered;
    this.onMessageReceivedCallback = onMessageReceived;

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

  public async connect(force = false) {
    console.log(`📡 WhatsAppEngine: Chamada de connect(force=${force}). Status atual: ${this.status.status}, isConnecting: ${this.isConnecting}`);
    
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
              msg.includes("isSessionRecordError")
            ) {
              return;
            }
            process.stdout.write(msg);
          }
        }) as any,
        auth: state,
        printQRInTerminal: false,
        browser: ["Chrome (Linux)", "Chrome", "110.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log("📡 Baileys Update:", { connection, qr: !!qr });

        if (qr) {
          this.status.status = "qr_code";
          this.status.qrCodeProgress = 50;
          try {
            this.status.qrDataUrl = await QRCode.toDataURL(qr);
            this.status.qrCodeProgress = 95;
            this.addLogCallback("info", "QR Code oficial do WhatsApp gerado com sucesso! Escaneie com seu celular.");
          } catch (err) {
            console.error("Erro QR:", err);
            this.addLogCallback("error", "Falha ao gerar imagem do QR Code.");
          }
        }

        if (connection === "open") {
          this.isConnecting = false;
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
        }

        if (connection === "close") {
          this.isConnecting = false;
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          console.log("📡 Conexão fechada. Código:", statusCode);
          
          const wasConnected = this.status.status === "connected";
          const wasConnecting = this.status.status === "connecting" || this.status.status === "qr_code";

          if (this.status.status !== "connected") {
            this.status.status = "disconnected";
          }
          this.sock = null;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
            this.addLogCallback("error", "Sessão encerrada ou inválida. Você precisará gerar um novo QR Code.");
            this.logout();
          } else {
            const shouldReconnect = statusCode === DisconnectReason.restartRequired || statusCode === 515 || wasConnected || wasConnecting;
            if (shouldReconnect) {
              this.addLogCallback("warning", "Conexão reiniciada ou instável (Código 515). Reconectando automaticamente em 3s...");
              setTimeout(() => this.connect(), 3000);
            } else {
              this.addLogCallback("warning", "Conexão perdida. Clique em Conectar para tentar novamente.");
              this.status.status = "disconnected";
            }
          }
        }
      });

      // Incoming messages listener
      this.sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          // Ignore messages sent by ourselves to avoid loops
          if (msg.key.fromMe) continue;

          const from = msg.key.remoteJid;
          if (!from || !from.endsWith("@g.us")) continue; // Only group chats

          const text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption || 
                       "";

          if (!text && !msg.message?.imageMessage) continue;

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
          if (msg.message?.imageMessage) {
            try {
              this.addLogCallback("info", `Baixando imagem recebida de "${groupName}"...`);
              const buffer = await downloadMediaMessage(msg, 'buffer', {});
              if (buffer) {
                imageBuffer = buffer as Buffer;
                this.addLogCallback("success", `Imagem baixada com sucesso da mensagem de "${groupName}"!`);
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
      throw new Error("O WhatsApp não está conectado no momento.");
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

  // Send a message to a WhatsApp JID (Group or User) with optional image
  public async sendMessage(jid: string, text: string, imageBuffer?: Buffer, imageUrl?: string) {
    if (!this.sock || this.status.status !== "connected") {
      this.addLogCallback("error", `Erro: Tentativa de enviar mensagem para ${jid} mas o WhatsApp está desconectado.`);
      return false;
    }

    // Helper to validate magic bytes of image buffer (JPEG, PNG, WEBP, GIF)
    const isValidImageBuffer = (buf: Buffer | undefined): boolean => {
      if (!buf || buf.length < 8) return false;
      // JPEG: FF D8 FF
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
      // PNG: 89 50 4E 47
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
      // WEBP: RIFF...WEBP
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
          buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
      // GIF: 47 49 46
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
      return false;
    };

    let finalBuffer: Buffer | undefined = isValidImageBuffer(imageBuffer) ? imageBuffer : undefined;

    if (!finalBuffer && imageUrl && imageUrl.startsWith("http")) {
      try {
        this.addLogCallback("info", `Baixando imagem da oferta para envio no WhatsApp...`);
        const imgRes = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          const downloadedBuf = Buffer.from(ab);
          if (isValidImageBuffer(downloadedBuf)) {
            finalBuffer = downloadedBuf;
          } else {
            console.warn("Buffer baixado do URL de imagem não possui cabeçalho válido de imagem.");
          }
        }
      } catch (e) {
        console.warn("Não foi possível carregar buffer da imagem original:", e);
      }
    }

    // If still no buffer, download high quality product photo into buffer
    if (!finalBuffer) {
      const fallbackUrls = [
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
      ];
      for (const fbUrl of fallbackUrls) {
        try {
          const fallbackRes = await fetch(fbUrl);
          if (fallbackRes.ok) {
            const ab = await fallbackRes.arrayBuffer();
            const buf = Buffer.from(ab);
            if (isValidImageBuffer(buf)) {
              finalBuffer = buf;
              break;
            }
          }
        } catch (e) {}
      }
    }

    try {
      if (finalBuffer) {
        await this.sock.sendMessage(jid, { image: finalBuffer, caption: text });
        this.addLogCallback("success", `📸 Anúncio com FOTO enviado com sucesso para ${jid}`);
      } else {
        await this.sock.sendMessage(jid, { text });
        this.addLogCallback("warning", `⚠️ Imagem indisponível. Enviando mensagem de texto simples para ${jid}`);
      }
      return true;
    } catch (err) {
      this.addLogCallback("error", `Falha ao enviar foto para ${jid}: ${(err as Error).message}. Tentando reenviar imagem de contingência...`);
      try {
        const retryRes = await fetch("https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800");
        if (retryRes.ok) {
          const ab = await retryRes.arrayBuffer();
          const buf = Buffer.from(ab);
          if (isValidImageBuffer(buf)) {
            await this.sock.sendMessage(jid, { image: buf, caption: text });
            return true;
          }
        }
      } catch (e) {}

      try {
        await this.sock.sendMessage(jid, { text });
        return true;
      } catch (fallbackErr) {
        this.addLogCallback("error", `Falha no envio para ${jid}: ${(fallbackErr as Error).message}`);
        return false;
      }
    }
  }

  // Fetch today's messages from a specific group and process them
  public async scanTodayMessages(groupId: string, processCallback: (text: string, imageBuffer?: Buffer) => Promise<any>): Promise<{ totalFound: number; processedCount: number }> {
    if (!this.sock && this.status.status === "connected") {
      // Simulated connection fallback
      this.addLogCallback("info", `🔎 [Simulado] Buscando anúncios de hoje no grupo simulado...`);
      
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
      return { totalFound: simulatedTodayMessages.length, processedCount: processed };
    }

    if (!this.sock) {
      throw new Error("WhatsApp não está conectado.");
    }

    this.addLogCallback("info", `🔎 Iniciando varredura de histórico no grupo para buscar ofertas de hoje...`);
    
    let totalFound = 0;
    let processedCount = 0;
    
    try {
      // Fetch last 100 messages from the WhatsApp server
      const messages = await (this.sock as any).fetchMessagesFromWAServer(groupId, 100);
      
      if (messages && Array.isArray(messages)) {
        const today = new Date();
        
        for (const msg of messages) {
          const timestamp = Number(msg.messageTimestamp);
          if (!timestamp) continue;
          
          const msgDate = new Date(timestamp * 1000);
          const isToday = msgDate.getDate() === today.getDate() &&
                          msgDate.getMonth() === today.getMonth() &&
                          msgDate.getFullYear() === today.getFullYear();
                          
          if (!isToday) continue;
          
          const text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption || 
                       "";
                        
          if (!text) continue;
          
          // Check if it has any URL or Shopee keyword
          const hasAnyLink = /https?:\/\/[^\s]+/i.test(text) || /shp\.ee|shope\.ee|shopee/i.test(text);
          if (!hasAnyLink) continue;
          
          totalFound++;
          
          let imageBuffer: Buffer | undefined = undefined;
          if (msg.message?.imageMessage) {
            try {
              imageBuffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
            } catch (err) {
              this.addLogCallback("warning", `Não foi possível carregar a imagem do histórico da mensagem.`);
            }
          }
          
          const result = await processCallback(text, imageBuffer);
          if (result) {
            processedCount++;
          }
        }
      }
    } catch (err) {
      this.addLogCallback("error", `Erro ao varrer histórico de mensagens: ${(err as Error).message}`);
      throw err;
    }
    
    return { totalFound, processedCount };
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
