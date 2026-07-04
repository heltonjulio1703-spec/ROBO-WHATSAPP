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
  
  private authStatePath = path.join(process.cwd(), "auth_info_baileys");
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

  public async connect() {
    if (this.sock) {
      this.addLogCallback("warning", "WhatsApp já possui uma tentativa de conexão ativa.");
      return;
    }

    this.status.status = "connecting";
    this.status.qrCodeProgress = 10;
    this.addLogCallback("info", "Carregando credenciais de criptografia do WhatsApp...");

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authStatePath);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }) as any,
        auth: state,
        printQRInTerminal: false,
        mobile: false,
      });

      // Connection event listener
      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status.status = "qr_code";
          this.status.qrCodeProgress = 50;
          try {
            const dataUrl = await QRCode.toDataURL(qr);
            this.status.qrDataUrl = dataUrl;
            this.addLogCallback("info", "Novo QR Code gerado. Aguardando escaneamento no celular...");
          } catch (err) {
            this.addLogCallback("error", "Falha ao gerar imagem do QR Code.");
          }
        }

        if (connection === "connecting") {
          this.status.status = "connecting";
          this.addLogCallback("info", "Estabelecendo handshake com os servidores do WhatsApp...");
        }

        if (connection === "open") {
          const userJid = this.sock?.user?.id || "";
          const userName = this.sock?.user?.name || "Minha Conta WhatsApp";
          const phone = userJid.split(":")[0] || userJid.split("@")[0] || "";

          this.status = {
            status: "connected",
            phone: `+${phone}`,
            userName: userName,
            qrCodeProgress: 100,
            connectedAt: new Date().toLocaleString("pt-BR"),
          };

          this.addLogCallback("success", `🟢 WhatsApp CONECTADO REAL com sucesso! Logado como ${userName} (+${phone})`);
          
          // Fetch groups the user is in
          this.fetchAndRegisterGroups();
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          this.status = {
            status: "disconnected",
            phone: "",
            userName: "",
            qrCodeProgress: 0,
            connectedAt: null,
          };
          this.sock = null;

          this.addLogCallback("warning", `🔴 Conexão encerrada pelo WhatsApp (Código: ${statusCode}).`);

          if (shouldReconnect) {
            this.addLogCallback("info", "Tentando reconectar em 5 segundos...");
            setTimeout(() => this.connect(), 5000);
          } else {
            this.addLogCallback("error", "Sessão deslogada permanentemente pelo celular. Limpando dados da sessão...");
            this.logout();
          }
        }
      });

      // Save credentials callback
      this.sock.ev.on("creds.update", saveCreds);

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
          try {
            const metadata = await this.sock?.groupMetadata(from);
            if (metadata?.subject) {
              groupName = metadata.subject;
            }
          } catch (e) {
            // Ignore metadata fetch errors, use RemoteJid
            groupName = `Grupo (${from.split("@")[0]})`;
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
      this.addLogCallback("error", `Erro crítico na conexão do WhatsApp: ${(error as Error).message}`);
      this.status.status = "disconnected";
      this.sock = null;
    }
  }

  // Fetch groups the logged-in user is currently in and populate them in source/target lists
  public async fetchAndRegisterGroups() {
    if (!this.sock) return;

    try {
      this.addLogCallback("info", "Buscando lista de grupos que você participa no WhatsApp...");
      const participatingGroups = await this.sock.groupFetchAllParticipating();
      
      const discoveredGroups: GroupItem[] = Object.values(participatingGroups).map((g) => ({
        id: g.id,
        name: g.subject || `Grupo (${g.id.split("@")[0]})`,
        active: false, // Default to inactive until selected
      }));

      this.onGroupsDiscoveredCallback(discoveredGroups);
      this.addLogCallback("success", `✨ Sincronizados ${discoveredGroups.length} grupos reais do seu WhatsApp! Vá em 'Grupos e Canais' para ativá-los.`);
    } catch (err) {
      this.addLogCallback("warning", `Não foi possível listar os grupos automaticamente: ${(err as Error).message}`);
    }
  }

  // Send a message to a WhatsApp JID (Group or User) with optional image
  public async sendMessage(jid: string, text: string, imageBuffer?: Buffer, imageUrl?: string) {
    if (!this.sock || this.status.status !== "connected") {
      this.addLogCallback("error", `Erro: Tentativa de enviar mensagem para ${jid} mas o WhatsApp está desconectado.`);
      return false;
    }

    try {
      if (imageBuffer) {
        await this.sock.sendMessage(jid, { image: imageBuffer, caption: text });
      } else if (imageUrl) {
        await this.sock.sendMessage(jid, { image: { url: imageUrl }, caption: text });
      } else {
        await this.sock.sendMessage(jid, { text });
      }
      return true;
    } catch (err) {
      this.addLogCallback("error", `Falha ao enviar mensagem com imagem para ${jid}: ${(err as Error).message}`);
      // Fallback to text-only send if media sending failed
      try {
        await this.sock.sendMessage(jid, { text });
        return true;
      } catch (fallbackErr) {
        this.addLogCallback("error", `Falha no envio de texto (fallback) para ${jid}: ${(fallbackErr as Error).message}`);
        return false;
      }
    }
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
