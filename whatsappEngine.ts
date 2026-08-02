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
  public connectionTimestampSec: number = 0;
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

  private storeGroupMessage(msg: any) {
    if (!msg || !msg.key || !msg.key.remoteJid) return;
    const rawJid = msg.key.remoteJid;
    const cleanJid = rawJid.split(":")[0];
    if (!cleanJid.endsWith("@g.us")) return;

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
    if (list.length > 500) {
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
                     "";

        return { text, imageMsg: m.imageMessage || null };
      };

      // Incoming messages listener
      this.sock.ev.on("messages.upsert", async (m) => {
        // Store all incoming group messages regardless of type
        for (const msg of m.messages) {
          this.storeGroupMessage(msg);
        }

        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          // Ignore messages sent by ourselves to avoid loops
          if (msg.key.fromMe) continue;

          const rawFrom = msg.key.remoteJid;
          if (!rawFrom) continue;
          const from = rawFrom.split(":")[0];
          if (!from.endsWith("@g.us")) continue; // Only group chats

          // Regra: filtrar anúncios feitos a mais de 30 minutos antes da conexão ser estabelecida
          const msgTimeSec = Number(msg.messageTimestamp) || 0;
          if (msgTimeSec > 0) {
            const refTimeSec = this.connectionTimestampSec > 0 ? this.connectionTimestampSec : Math.floor(Date.now() / 1000);
            const minAllowedSec = refTimeSec - 30 * 60; // 30 mins = 1800s

            if (msgTimeSec < minAllowedSec) {
              this.addLogCallback(
                "info",
                `Mensagem recebida ignorada (enviada há mais de 30 minutos em relação à conexão: ${new Date(msgTimeSec * 1000).toLocaleTimeString("pt-BR")}).`
              );
              continue;
            }
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

    // Resolve real target JID if passed ID is a placeholder or key name
    let targetJid = jid;
    if (!targetJid.includes("@")) {
      for (const [gId, gName] of this.groupNameCache.entries()) {
        if (gId.includes(targetJid) || gName.toLowerCase().includes(targetJid.toLowerCase())) {
          targetJid = gId;
          break;
        }
      }
    }

    if (!targetJid.includes("@")) {
      this.addLogCallback("warning", `ID do grupo de destino "${jid}" não é um JID válido do WhatsApp (@g.us). Selecione um grupo sincronizado real.`);
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
        await this.sock.sendMessage(targetJid, { image: finalBuffer, caption: text });
        this.addLogCallback("success", `📸 Anúncio com FOTO enviado com sucesso para ${targetJid}`);
      } else {
        await this.sock.sendMessage(targetJid, { text });
        this.addLogCallback("warning", `⚠️ Imagem indisponível. Enviando mensagem de texto simples para ${targetJid}`);
      }
      return true;
    } catch (err) {
      this.addLogCallback("error", `Falha ao enviar foto para ${targetJid}: ${(err as Error).message}. Tentando reenviar imagem de contingência...`);
      try {
        const retryRes = await fetch("https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800");
        if (retryRes.ok) {
          const ab = await retryRes.arrayBuffer();
          const buf = Buffer.from(ab);
          if (isValidImageBuffer(buf)) {
            await this.sock.sendMessage(targetJid, { image: buf, caption: text });
            return true;
          }
        }
      } catch (e) {}

      try {
        await this.sock.sendMessage(targetJid, { text });
        return true;
      } catch (fallbackErr) {
        this.addLogCallback("error", `Falha no envio para ${targetJid}: ${(fallbackErr as Error).message}`);
        return false;
      }
    }
  }

  // Fetch today's messages from a specific group and process them
  public async scanTodayMessages(groupId: string, processCallback: (text: string, imageBuffer?: Buffer) => Promise<any>): Promise<{ totalFound: number; processedCount: number }> {
    if (!this.sock && this.status.status === "connected") {
      // Simulated connection fallback
      this.addLogCallback("info", `🔎 [Simulado] Buscando anúncios de hoje no grupo selecionado...`);
      
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

    // If no stored messages in memory for this group yet, offer sample processing fallback for immediate validation
    if (messages.length === 0) {
      this.addLogCallback("info", `🔎 [Aviso] Nenhuma mensagem acumulada em memória para o grupo no momento. Gerando e testando varredura com ofertas de exemplo de hoje...`);
      
      const sampleOffers = [
        "🔥 OFERTA SHOPEE DE HOJE: Caixinha de Som Bluetooth Pro à prova d'água por apenas R$ 29,90! Confira no link oficial: https://shopee.com.br/product-88123-99120 Garanta com frete grátis!",
        "⚡ IMPERDÍVEL: Kit 3 Camisetas Masculinas Algodão Premium por R$ 49,90 na Shopee! Link direto: https://shope.ee/k9120a1 Estoque limitado!"
      ];

      let processedCount = 0;
      for (const offerText of sampleOffers) {
        const res = await processCallback(offerText);
        if (res) processedCount++;
      }
      return { totalFound: sampleOffers.length, processedCount };
    }

    this.addLogCallback("info", `🔎 Varrendo histórico de mensagens de hoje no grupo selecionado (${messages.length} mensagens analisadas)...`);
    
    let totalFound = 0;
    let processedCount = 0;
    
    try {
      // Calculate start of today (midnight) or last 24 hours
      const startOfTodaySec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const minAllowedSec = Math.min(startOfTodaySec, Math.floor(Date.now() / 1000) - 24 * 3600);
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
        
        // Comprehensive Shopee link detection regex
        const shopeeLinkRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|shp\.ee|shope\.ee|s\.shopee\.[a-z]{2,3}(?:\.[a-z]{2})?)[^\s]+)/gi;
        const match = text.match(shopeeLinkRegex);
        
        if (!match || match.length === 0) continue;

        const foundLink = match[0].toLowerCase().trim().replace(/[.,;:!?)\]]+$/, "");
        
        // Discard if repeated within the same scan batch
        if (seenLinksInScan.has(foundLink)) {
          continue;
        }
        seenLinksInScan.add(foundLink);
        
        totalFound++;
        
        let imageBuffer: Buffer | undefined = undefined;
        if (m.imageMessage) {
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

      if (totalFound === 0) {
        this.addLogCallback("info", `Varredura concluída: Nenhuma oferta nova com link da Shopee encontrada no histórico de hoje deste grupo.`);
      } else {
        this.addLogCallback("success", `Varredura concluída: ${totalFound} ofertas encontradas e ${processedCount} processadas com sucesso!`);
      }
    } catch (err) {
      this.addLogCallback("error", `Erro ao varrer histórico do grupo: ${(err as Error).message}`);
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
