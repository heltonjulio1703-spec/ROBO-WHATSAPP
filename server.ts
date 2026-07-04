import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { WhatsAppEngine, GroupItem } from "./whatsappEngine";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Storage
const state = {
  config: {
    affiliateId: "heltonjulio1703",
    autoPilot: true,
    autoPilotInterval: 30, // seconds
    rewriteStyle: "excited", // "excited", "minimal", "creative", "direct"
    keywords: "promocao, cupom, desconto, oferta, achado, frete gratis, shopee, shp.ee",
    shopeeAppKey: "",
    shopeeAppSecret: "",
    shopeeAffiliateId: "",
    useShopeeApi: false,
  },
  whatsapp: {
    status: "disconnected", // "disconnected", "connecting", "qr_code", "connected"
    phone: "",
    userName: "",
    qrCodeProgress: 0,
    connectedAt: null as string | null,
  },
  groups: {
    sources: [
      { id: "src_1", name: "Achadinhos Shopee Brasil 🇧🇷", active: true },
      { id: "src_2", name: "Ofertas e Cupons Relâmpago ⚡", active: true },
      { id: "src_3", name: "Shopee Achados do Dia 🛒", active: false },
      { id: "src_4", name: "Descontos da China 🇨🇳", active: true },
    ],
    targets: [
      { id: "tgt_1", name: "Meus Achados Shopee - Helton 🛍️", active: true },
      { id: "tgt_2", name: "Grupo da Família Descontos 🏠", active: false },
      { id: "tgt_3", name: "Ofertas Exclusivas Afiliado 💎", active: true },
    ],
  },
  logs: [] as Array<{ time: string; type: "info" | "success" | "warning" | "error"; message: string }>,
  history: [] as Array<{
    id: string;
    time: string;
    sourceGroup: string;
    targetGroups: string[];
    productTitle: string;
    originalLink: string;
    affiliateLink: string;
    originalMessage: string;
    rewrittenMessage: string;
    status: "success" | "failed";
    imageUrl?: string;
  }>,
};

// State Persistence Helper Functions
const STATE_FILE_PATH = (() => {
  const isProd = process.env.NODE_ENV === "production" || process.env.PORT === "3000";
  if (isProd) {
    return "/tmp/state_data.json";
  }
  try {
    const testPath = path.join(process.cwd(), "test_write_perm");
    fs.mkdirSync(testPath, { recursive: true });
    fs.rmdirSync(testPath);
    return path.join(process.cwd(), "state_data.json");
  } catch {
    return "/tmp/state_data.json";
  }
})();

// Copy initial state_data.json if we are using /tmp and the /tmp file doesn't exist yet
if (STATE_FILE_PATH.startsWith("/tmp")) {
  try {
    const localPath = path.join(process.cwd(), "state_data.json");
    if (fs.existsSync(localPath) && !fs.existsSync(STATE_FILE_PATH)) {
      fs.copyFileSync(localPath, STATE_FILE_PATH);
      console.log("Copiado arquivo de estado inicial para /tmp/state_data.json");
    }
  } catch (err) {
    console.error("Falha ao copiar estado inicial para /tmp:", err);
  }
}

const saveStateToFile = () => {
  try {
    const dataToSave = {
      config: state.config,
      groups: state.groups,
      history: state.history,
      logs: state.logs,
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(dataToSave, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar arquivo de estado:", error);
  }
};

const loadStateFromFile = () => {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const fileContent = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(fileContent);
      if (parsed.config) state.config = { ...state.config, ...parsed.config };
      if (parsed.groups) {
        if (parsed.groups.sources) state.groups.sources = parsed.groups.sources;
        if (parsed.groups.targets) state.groups.targets = parsed.groups.targets;
      }
      if (parsed.history) state.history = parsed.history;
      if (parsed.logs) state.logs = parsed.logs;
    }
  } catch (error) {
    console.error("Erro ao carregar arquivo de estado:", error);
  }
};

// Initial load
loadStateFromFile();

// Add initial logs
const addLog = (type: "info" | "success" | "warning" | "error", message: string) => {
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.logs.unshift({ time, type, message });
  if (state.logs.length > 100) state.logs.pop();
  saveStateToFile();
};

addLog("info", "Robô de Afiliados iniciado. Aguardando conexão do WhatsApp...");

// Initialize Gemini API
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (error) {
    console.error("Erro ao inicializar o cliente Gemini:", error);
    return null;
  }
};

// Helper to convert links to affiliate
const convertToAffiliateLink = (originalUrl: string, affiliateId: string, subId: string = "bot") => {
  // Regex to extract product IDs or parameters
  // Simulated affiliate link generation
  let productId = "product_deal";
  const shopeeIdMatch = originalUrl.match(/i\.\d+\.\d+|shp\.ee\/\w+|shope\.ee\/\w+/i);
  if (shopeeIdMatch) {
    productId = shopeeIdMatch[0].replace("/", "_");
  }

  // Create clean Shopee Affiliate format URL
  return `https://shope.ee/r/${affiliateId}?sub=${encodeURIComponent(subId)}&product=${productId}`;
};

// Official Shopee Affiliate API Link Converter
const convertWithShopeeApi = async (
  originalUrl: string,
  appKey: string,
  appSecret: string,
  subId: string = "bot"
): Promise<string | null> => {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const query = `mutation {
    generatePromotionLink(linkParams: {
      originalLink: "${originalUrl}",
      subIds: ["${subId}"]
    }) {
      code
      message
      data {
        promotionLink
      }
    }
  }`;

  const requestBody = { query };
  const payloadStr = JSON.stringify(requestBody);
  const signatureFactor = appKey + timestamp + payloadStr;
  
  const signature = crypto
    .createHmac("sha256", appSecret)
    .update(signatureFactor)
    .digest("hex");

  const authHeader = `SHA256 app_key=${appKey}, timestamp=${timestamp}, signature=${signature}`;

  try {
    const response = await fetch("https://open-api.affiliate.shopee.com.br/v2/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: payloadStr,
    });

    if (!response.ok) {
      throw new Error(`Shopee API HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as any;
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || "GraphQL error");
    }

    const data = json.data?.generatePromotionLink;
    if (data && data.code === 0 && data.data?.promotionLink) {
      return data.data.promotionLink;
    } else {
      const errorMsg = data?.message || "Sem link retornado da API";
      throw new Error(`Shopee API cod ${data?.code}: ${errorMsg}`);
    }
  } catch (error) {
    console.error("Erro na conversão Shopee API:", error);
    throw error;
  }
};

// Async Link Converter that automatically uses Shopee API if configured
const convertToAffiliateLinkAsync = async (originalUrl: string, affiliateId: string, subId: string = "bot") => {
  if (state.config.useShopeeApi && state.config.shopeeAppKey && state.config.shopeeAppSecret) {
    try {
      addLog("info", `Convertendo link via API Oficial da Shopee...`);
      const apiLink = await convertWithShopeeApi(
        originalUrl,
        state.config.shopeeAppKey,
        state.config.shopeeAppSecret,
        subId
      );
      if (apiLink) {
        addLog("success", `✅ Link convertido com sucesso via API Oficial da Shopee!`);
        return apiLink;
      }
    } catch (err) {
      addLog("error", `⚠️ Falha ao converter via API da Shopee: ${(err as Error).message}. Usando simulador.`);
    }
  }

  // Fallback
  return convertToAffiliateLink(originalUrl, affiliateId, subId);
};

// AI Parsing logic using Gemini
const parseMessageWithGemini = async (messageText: string, affiliateId: string, style: string) => {
  const ai = getGeminiClient();
  if (!ai) {
    // Return mock parsing if Gemini is not configured
    return parseMessageWithRegex(messageText, affiliateId);
  }

  const prompt = `Você é um assistente de marketing de afiliados especialista em Shopee.
Analise a mensagem em português e extraia as informações de promoção do produto.
Se houver links da Shopee (como shopee.com.br, shp.ee ou shope.ee), identifique o link principal do produto.

Responda EXCLUSIVAMENTE em formato JSON com a seguinte estrutura:
{
  "hasShopeeLink": boolean (indica se contém um link válido da Shopee),
  "originalLink": "link original da Shopee encontrado",
  "productTitle": "Nome ou título curto e atraente do produto",
  "price": "preço aproximado se houver (ex: R$ 49,90), caso contrário null",
  "coupon": "cupom de desconto se houver, caso contrário null",
  "rewrittenMessage": "Uma cópia reformulada da promoção em português para enviar no WhatsApp. Use emojis adequados. Substitua o link promocional por [LINK_AFILIADO] exatamente assim."
}

Use as seguintes diretrizes para o "rewrittenMessage" de acordo com o estilo selecionado "${style}":
- excited: Use muitos emojis (🔥, 😱, 🚨, ✨), texto entusiasmado, tom urgente, ideal para grupos de achados. Ex: "🚨 GENTE DO CÉU! OLHA ESSE ACHADO... 🔥"
- minimal: Direto ao ponto, com poucos emojis, focado no preço e no link de compra. Sem enrolação.
- creative: Crie um texto descontraído, engraçado ou que conte um caso rápido de uso para o produto.
- direct: Profissional, amigável e claro. Formato limpo.

Mensagem original a ser analisada:
"""
${messageText}
"""`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasShopeeLink: { type: Type.BOOLEAN },
            originalLink: { type: Type.STRING },
            productTitle: { type: Type.STRING },
            price: { type: Type.STRING },
            coupon: { type: Type.STRING },
            rewrittenMessage: { type: Type.STRING },
          },
          required: ["hasShopeeLink", "originalLink", "productTitle", "rewrittenMessage"],
        },
      },
    });

    const resultText = response.text?.trim() || "";
    const parsed = JSON.parse(resultText);

    if (parsed.hasShopeeLink && parsed.originalLink) {
      const affiliateLink = await convertToAffiliateLinkAsync(parsed.originalLink, affiliateId);
      parsed.affiliateLink = affiliateLink;
      parsed.rewrittenMessage = parsed.rewrittenMessage.replace("[LINK_AFILIADO]", affiliateLink);
    }

    return parsed;
  } catch (error) {
    console.error("Erro na chamada do Gemini API:", error);
    addLog("error", `Falha ao usar IA do Gemini para reescrever anúncio: ${(error as Error).message}. Usando conversão automática via Regex.`);
    return parseMessageWithRegex(messageText, affiliateId);
  }
};

// Regex Fallback parsing if Gemini is not available
const parseMessageWithRegex = async (messageText: string, affiliateId: string) => {
  // Regex to detect Shopee URLs
  const shopeeRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.com\.br|shp\.ee|shope\.ee)\/[^\s]+)/gi;
  const match = shopeeRegex.exec(messageText);

  if (!match) {
    return {
      hasShopeeLink: false,
      originalLink: "",
      productTitle: "Mensagem Informativa",
      price: null,
      coupon: null,
      rewrittenMessage: messageText,
    };
  }

  const originalLink = match[0];
  const affiliateLink = await convertToAffiliateLinkAsync(originalLink, affiliateId);

  // Guess product title from the message text (first line or first few words)
  let productTitle = "Produto da Shopee";
  const lines = messageText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    productTitle = lines[0]
      .replace(/[🚨🔥😱🛍️✨🚨🚨]/g, "")
      .replace(/PROMOÇÃO|OFERTA|ACHADO|CUPOM/gi, "")
      .substring(0, 40)
      .trim();
  }

  // Construct a default rewritten message
  const rewrittenMessage = `⚡ *PROMOÇÃO DETECTADA!* ⚡
  
🛍️ *${productTitle || "Produto Achado"}*

🔗 Compre aqui com desconto garantido:
👉 ${affiliateLink}

🚀 _Enviado via Robô de Afiliados Shopee_`;

  return {
    hasShopeeLink: true,
    originalLink,
    affiliateLink,
    productTitle,
    price: "Ver no site",
    coupon: null,
    rewrittenMessage,
  };
};

// Helper to fetch original product photo from Shopee URL by following redirects and reading OpenGraph tags
const fetchOriginalShopeeImage = async (url: string): Promise<string | null> => {
  if (!url || !url.startsWith("http")) return null;
  
  try {
    addLog("info", `Buscando foto original do produto no link: ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn(`Shopee request returned status: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Pattern matches for og:image
    const matches = [
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      /meta\s+property="og:image"\s+content="([^"]+)"/i,
      /"image":\s*"([^"]+)"/i,
    ];

    for (const regex of matches) {
      const match = html.match(regex);
      if (match && match[1]) {
        let imageUrl = match[1].trim();
        if (imageUrl.startsWith("//")) {
          imageUrl = "https:" + imageUrl;
        }
        if (imageUrl.startsWith("http")) {
          addLog("success", `📸 Foto original encontrada: ${imageUrl.substring(0, 60)}...`);
          return imageUrl;
        }
      }
    }
  } catch (err) {
    console.error("Falha ao buscar imagem do link da Shopee:", err);
  }
  return null;
};

// Map product titles or keywords to beautiful high-quality Unsplash image URLs
const getProductImage = (title: string): string => {
  const cleanTitle = (title || "").toLowerCase();

  if (cleanTitle.includes("fone") || cleanTitle.includes("headphone") || cleanTitle.includes("ouvido") || cleanTitle.includes("bluetooth")) {
    return "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800";
  }
  if (cleanTitle.includes("garrafa") || cleanTitle.includes("squeeze") || cleanTitle.includes("copo") || cleanTitle.includes("termos") || cleanTitle.includes("térmica")) {
    return "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800";
  }
  if (cleanTitle.includes("mochila") || cleanTitle.includes("bolsa") || cleanTitle.includes("backpack") || cleanTitle.includes("mala")) {
    return "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800";
  }
  if (cleanTitle.includes("relógio") || cleanTitle.includes("smartwatch") || cleanTitle.includes("watch") || cleanTitle.includes("mido")) {
    return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800";
  }
  if (cleanTitle.includes("cozinha") || cleanTitle.includes("triturador") || cleanTitle.includes("alho") || cleanTitle.includes("mini") || cleanTitle.includes("processador")) {
    return "https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=800";
  }
  if (cleanTitle.includes("iluminação") || cleanTitle.includes("ring") || cleanTitle.includes("lâmpada") || cleanTitle.includes("refletor") || cleanTitle.includes("luz")) {
    return "https://images.unsplash.com/photo-1626266842868-aba7dd2373c6?w=800";
  }
  if (cleanTitle.includes("camisa") || cleanTitle.includes("roupa") || cleanTitle.includes("vestido") || cleanTitle.includes("camiseta") || cleanTitle.includes("calça")) {
    return "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800";
  }
  if (cleanTitle.includes("maquiagem") || cleanTitle.includes("beleza") || cleanTitle.includes("batom") || cleanTitle.includes("makeup") || cleanTitle.includes("pincel")) {
    return "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800";
  }
  if (cleanTitle.includes("ferramenta") || cleanTitle.includes("chave") || cleanTitle.includes("parafusadeira")) {
    return "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800";
  }
  // Generic beautiful product photo
  return "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=800";
};

// Process an incoming message (either simulated or actual)
const processIncomingMessage = async (sourceGroupName: string, messageText: string, imageBuffer?: Buffer, imageUrl?: string) => {
  // Filtro de palavra-chave desabilitado por solicitação do usuário. Todos os anúncios de links Shopee serão processados.
  /*
  const keywords = state.config.keywords.split(",").map(k => k.trim().toLowerCase());
  const hasKeyword = keywords.length === 0 || keywords.some(kw => kw && messageText.toLowerCase().includes(kw));

  if (!hasKeyword) {
    addLog("info", `Mensagem recebida em "${sourceGroupName}" descartada (não contém palavras-chave).`);
    return null;
  }
  */

  addLog("info", `Nova mensagem em "${sourceGroupName}": Analisando anúncio...`);

  const parsed = await parseMessageWithGemini(
    messageText,
    state.config.affiliateId,
    state.config.rewriteStyle
  );

  if (!parsed.hasShopeeLink) {
    addLog("warning", `Anúncio em "${sourceGroupName}" não contém link da Shopee. Processamento ignorado.`);
    return null;
  }

  // Identify targets
  const activeTargets = state.groups.targets.filter(t => t.active);
  if (activeTargets.length === 0) {
    addLog("warning", `Anúncio convertido, mas nenhum grupo de destino está ativo. Mensagem arquivada.`);
  }

  let resolvedImageUrl = imageUrl;
  if (!resolvedImageUrl && parsed.originalLink) {
    resolvedImageUrl = await fetchOriginalShopeeImage(parsed.originalLink);
  }
  if (!resolvedImageUrl) {
    resolvedImageUrl = getProductImage(parsed.productTitle);
  }

  const historyItem = {
    id: "deal_" + Math.random().toString(36).substr(2, 9),
    time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    sourceGroup: sourceGroupName,
    targetGroups: activeTargets.map(t => t.name),
    productTitle: parsed.productTitle || "Produto Encontrado",
    originalLink: parsed.originalLink,
    affiliateLink: parsed.affiliateLink || await convertToAffiliateLinkAsync(parsed.originalLink, state.config.affiliateId),
    originalMessage: messageText,
    rewrittenMessage: parsed.rewrittenMessage,
    status: (activeTargets.length > 0 ? "success" : "failed") as "success" | "failed",
    imageUrl: resolvedImageUrl,
  };

  state.history.unshift(historyItem);
  if (state.history.length > 50) state.history.pop();

  // Send rewritten message to target groups with image if connected
  for (const target of activeTargets) {
    if (typeof whatsappEngine !== "undefined" && whatsappEngine && whatsappEngine.status.status === "connected") {
      if (target.id.endsWith("@g.us")) {
        await whatsappEngine.sendMessage(target.id, parsed.rewrittenMessage, imageBuffer, resolvedImageUrl);
        addLog("success", `✨ [WhatsApp REAL] Anúncio enviado com IMAGEM para "${target.name}": ${parsed.productTitle}`);
      } else {
        addLog("success", `✨ Anúncio encaminhado para "${target.name}": ${parsed.productTitle}`);
      }
    } else {
      addLog("success", `✨ Anúncio encaminhado para "${target.name}" (Simulado): ${parsed.productTitle}`);
    }
  }

  return historyItem;
};

// Initialize the real WhatsApp Engine
const whatsappEngine = new WhatsAppEngine(
  (type, msg) => {
    addLog(type, msg);
  },
  (discoveredGroups) => {
    // Merge discovered groups into sources and targets
    let addedCount = 0;
    discoveredGroups.forEach(g => {
      if (!state.groups.sources.some(s => s.id === g.id)) {
        state.groups.sources.push({ id: g.id, name: g.name, active: false });
        addedCount++;
      }
      if (!state.groups.targets.some(t => t.id === g.id)) {
        state.groups.targets.push({ id: g.id, name: g.name, active: false });
        addedCount++;
      }
    });
    if (addedCount > 0) {
      addLog("info", `Novos grupos do WhatsApp identificados e sincronizados.`);
    }
  },
  async (groupJid, groupName, text, imageBuffer, imageUrl) => {
    // Check if this source group is active
    const sourceGroup = state.groups.sources.find(s => s.id === groupJid && s.active);
    if (!sourceGroup) return;

    // Process the message and convert links (this will also send to active targets automatically inside processIncomingMessage)
    await processIncomingMessage(groupName, text, imageBuffer, imageUrl);
  }
);

// Simulated auto-pilot background deal stream
const SIMULATED_PRODUCTS = [
  {
    title: "Fone de Ouvido Sem Fio Bluetooth i12 TWS Original",
    price: "R$ 18,90",
    originalUrl: "https://shopee.com.br/product-10293021-9988231",
    rawCopy: "🔥 ALERTA DE PREÇO BAIXO! Fone de Ouvido Bluetooth sem fio por apenas R$18,90! Excelente som e bateria! Compre no precinho: https://shopee.com.br/product-10293021-9988231 Frete grátis usando cupom!"
  },
  {
    title: "Garrafa de Água Squeeze Motivacional 2 Litros com Adesivos 3D",
    price: "R$ 14,50",
    originalUrl: "https://shopee.com.br/garrafa-motivacional-2l-i.3821931.2849201",
    rawCopy: "🛍️ Olhem essa garrafinha linda de 2L que achei na Shopee! Vem com adesivos para colar. Ideal para levar pra academia ou trabalho. Apenas R$ 14,50! Link do produto: https://shope.ee/a283kd91 Corre que esgota logo!"
  },
  {
    title: "Mini Processador e Triturador de Alimentos Elétrico USB de Alho e Cebola",
    price: "R$ 22,99",
    originalUrl: "https://shp.ee/u29kd8a",
    rawCopy: "😱 FACILITE SUA VIDA NA COZINHA! Triturador elétrico de alho e temperos USB por apenas R$ 22,99! É maravilhoso, comprei um e recomendo demais. Link promocional aqui: https://shp.ee/u29kd8a"
  },
  {
    title: "Mochila Impermeável Escolar e de Viagem com Entrada USB",
    price: "R$ 59,90",
    originalUrl: "https://shopee.com.br/product-2283921-12039201",
    rawCopy: "🚨 MOCHILA RESISTENTE EM PROMOÇÃO! Ótima para escola, faculdade ou trabalho, impermeável e com saída USB de carregamento por R$59,90! 🏃‍♂️ Aproveite: https://shopee.com.br/product-2283921-12039201"
  },
  {
    title: "Ring Light de Mesa 10 polegadas com Tripé para Gravações e Maquiagem",
    price: "R$ 31,50",
    originalUrl: "https://shp.ee/92kd81x",
    rawCopy: "✨ Para fazer seus vídeos e fotos brilharem! Ring Light completa com tripé e ajuste de iluminação por apenas R$ 31,50 📸 Link com o cupom aplicado: https://shp.ee/92kd81x"
  }
];

let autoPilotTimer: NodeJS.Timeout | null = null;

const startAutoPilotSimulator = () => {
  if (autoPilotTimer) clearInterval(autoPilotTimer);

  const runSimulationTick = async () => {
    if (whatsappEngine.status.status !== "connected") {
      // Don't process autopilot if WhatsApp is disconnected
      return;
    }

    if (!state.config.autoPilot) return;

    // Pick random source group that is active
    const activeSources = state.groups.sources.filter(g => g.active);
    if (activeSources.length === 0) return;
    const randomSource = activeSources[Math.floor(Math.random() * activeSources.length)];

    // Pick random product
    const randomProduct = SIMULATED_PRODUCTS[Math.floor(Math.random() * SIMULATED_PRODUCTS.length)];

    await processIncomingMessage(randomSource.name, randomProduct.rawCopy);
  };

  // Run initial simulation soon after connection
  setTimeout(() => {
    if (whatsappEngine.status.status === "connected" && state.config.autoPilot) {
      runSimulationTick();
    }
  }, 4000);

  autoPilotTimer = setInterval(runSimulationTick, state.config.autoPilotInterval * 1000);
};

// API Routes

// Configs
app.get("/api/config", (req, res) => {
  res.json(state.config);
});

app.post("/api/config", (req, res) => {
  state.config = { ...state.config, ...req.body };
  addLog("info", "Configurações atualizadas com sucesso!");
  // Restart autopilot timer to apply new intervals
  startAutoPilotSimulator();
  res.json({ success: true, config: state.config });
});

// Groups
app.get("/api/groups", (req, res) => {
  res.json(state.groups);
});

app.post("/api/groups", (req, res) => {
  if (req.body.sources) state.groups.sources = req.body.sources;
  if (req.body.targets) state.groups.targets = req.body.targets;
  addLog("info", "Lista de grupos atualizada.");
  res.json({ success: true, groups: state.groups });
});

// History
app.get("/api/history", (req, res) => {
  res.json(state.history);
});

app.post("/api/history/clear", (req, res) => {
  state.history = [];
  addLog("info", "Histórico de anúncios limpo.");
  res.json({ success: true });
});

// Logs
app.get("/api/logs", (req, res) => {
  res.json(state.logs);
});

app.post("/api/logs/clear", (req, res) => {
  state.logs = [];
  addLog("info", "Painel de logs limpo.");
  res.json({ success: true });
});

// WhatsApp Status & Control
app.get("/api/whatsapp/status", (req, res) => {
  res.json(whatsappEngine.status);
});

app.post("/api/whatsapp/connect", (req, res) => {
  whatsappEngine.connect(true);
  res.json(whatsappEngine.status);
});

// Endpoint called by frontend when user simulates scanning the QR Code
app.post("/api/whatsapp/confirm-scan", (req, res) => {
  if (whatsappEngine.status.status !== "connected") {
    whatsappEngine.status = {
      status: "connected",
      phone: "+55 (11) 99876-5432",
      userName: "Helton Julio (Simulado)",
      qrCodeProgress: 100,
      connectedAt: new Date().toLocaleString("pt-BR"),
    };
    addLog("success", "🟢 WhatsApp conectado em MODO DE SIMULAÇÃO! (Sem celular real)");
    startAutoPilotSimulator();
  }
  res.json(whatsappEngine.status);
});

app.post("/api/whatsapp/disconnect", async (req, res) => {
  await whatsappEngine.logout();
  if (autoPilotTimer) {
    clearInterval(autoPilotTimer);
    autoPilotTimer = null;
  }
  // Clear connected/synchronized WhatsApp groups and history metrics
  state.groups.sources = state.groups.sources.filter(g => !g.id.endsWith("@g.us"));
  state.groups.targets = state.groups.targets.filter(g => !g.id.endsWith("@g.us"));
  state.history = [];
  saveStateToFile();
  addLog("info", "WhatsApp desconectado. Grupos sincronizados e histórico de envios foram limpos.");
  res.json(whatsappEngine.status);
});

// Sync real or simulated WhatsApp groups
app.post("/api/whatsapp/sync-groups", async (req, res) => {
  if (whatsappEngine.status.status !== "connected") {
    // If we are in simulated connection, or even if disconnected, return simulated groups so the user can test
    const simulatedGroups = [
      { id: "120363198421045239@g.us", name: "Shopee Ofertas Bombásticas 💣" },
      { id: "120363198421045240@g.us", name: "Cupom & Descontos Diários 🤑" },
      { id: "120363198421045241@g.us", name: "Achados da Shopee Brasil 🇧🇷" },
      { id: "120363198421045242@g.us", name: "Grupo da Família e Promoções 🏡" },
      { id: "120363198421045243@g.us", name: "Canal de Teste Replicador 📲" }
    ];

    simulatedGroups.forEach(g => {
      if (!state.groups.sources.some(s => s.id === g.id)) {
        state.groups.sources.push({ id: g.id, name: g.name, active: false });
      }
      if (!state.groups.targets.some(t => t.id === g.id)) {
        state.groups.targets.push({ id: g.id, name: g.name, active: false });
      }
    });

    addLog("success", `✨ Sincronizados ${simulatedGroups.length} grupos simulados! Vá em 'Grupos e Canais' para ativá-los.`);
    return res.json({ success: true, groups: state.groups });
  }

  try {
    await whatsappEngine.fetchAndRegisterGroups();
    res.json({ success: true, groups: state.groups });
  } catch (err) {
    res.status(500).json({ error: (err as any).message });
  }
});

// Endpoint to scan and process current-day messages for a selected source group
app.post("/api/whatsapp/scan-today", async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ error: "Grupo não especificado." });
  }

  if (whatsappEngine.status.status !== "connected") {
    return res.status(400).json({ error: "O WhatsApp precisa estar conectado." });
  }

  const group = state.groups.sources.find(s => s.id === groupId);
  const groupName = group ? group.name : "Grupo Monitorado";

  try {
    const result = await whatsappEngine.scanTodayMessages(groupId, async (text, imageBuffer) => {
      return await processIncomingMessage(groupName, text, imageBuffer);
    });
    
    // Save updated state since history/logs may have changed
    saveStateToFile();
    
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Manual Test Sandbox endpoint
app.post("/api/sandbox/parse", async (req, res) => {
  const { messageText } = req.body;
  if (!messageText) {
    return res.status(400).json({ error: "Mensagem vazia" });
  }

  addLog("info", "Laboratório de Teste: Analisando mensagem com IA...");
  try {
    const result = await parseMessageWithGemini(
      messageText,
      state.config.affiliateId,
      state.config.rewriteStyle
    );
    // Add imageUrl using fetchOriginalShopeeImage if originalLink is present, otherwise fallback
    let imageUrl = null;
    if (result.originalLink) {
      imageUrl = await fetchOriginalShopeeImage(result.originalLink);
    }
    result.imageUrl = imageUrl || getProductImage(result.productTitle);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Manual Sandbox Send endpoint
app.post("/api/sandbox/send", async (req, res) => {
  const { productTitle, rewrittenMessage, originalLink, affiliateLink, imageUrl } = req.body;
  
  const activeTargets = state.groups.targets.filter(t => t.active);
  if (activeTargets.length === 0) {
    addLog("warning", "Laboratório: Tentativa de envio manual sem nenhum grupo de destino ativo.");
    return res.json({ success: false, error: "Nenhum grupo de destino ativo" });
  }

  const resolvedImageUrl = imageUrl || getProductImage(productTitle);

  const historyItem = {
    id: "manual_" + Math.random().toString(36).substr(2, 9),
    time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    sourceGroup: "Laboratório de Testes 🧪",
    targetGroups: activeTargets.map(t => t.name),
    productTitle: productTitle || "Envio Manual Sandbox",
    originalLink: originalLink || "",
    affiliateLink: affiliateLink || "",
    originalMessage: "[Inserido no Laboratório]",
    rewrittenMessage: rewrittenMessage,
    status: "success" as const,
    imageUrl: resolvedImageUrl,
  };

  state.history.unshift(historyItem);
  
  // Real send to connected WhatsApp groups
  for (const target of activeTargets) {
    if (whatsappEngine.status.status === "connected" && target.id.endsWith("@g.us")) {
      await whatsappEngine.sendMessage(target.id, rewrittenMessage, undefined, resolvedImageUrl);
      addLog("success", `✨ [WhatsApp REAL] Anúncio encaminhado com IMAGEM para o grupo "${target.name}": ${productTitle}`);
    } else {
      addLog("success", `✨ Anúncio encaminhado para "${target.name}": ${productTitle}`);
    }
  }

  res.json({ success: true, historyItem });
});

// Simulate incoming message from frontend custom input
app.post("/api/simulation/incoming", async (req, res) => {
  const { sourceGroupId, messageText } = req.body;
  
  if (whatsappEngine.status.status !== "connected") {
    return res.status(400).json({ error: "O WhatsApp precisa estar conectado para processar mensagens." });
  }

  const group = state.groups.sources.find(g => g.id === sourceGroupId);
  const groupName = group ? group.name : "Grupo Simulado 📲";

  const historyItem = await processIncomingMessage(groupName, messageText);
  res.json({ success: true, historyItem });
});

// Vite Middleware & Static Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
