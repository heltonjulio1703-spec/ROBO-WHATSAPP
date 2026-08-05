import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { WhatsAppEngine, GroupItem } from "./whatsappEngine";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import dns from "dns";
import { generateShopeeAuthHeader } from "./src/services/shopeeApi";

// DNS-over-HTTPS (DoH) resolver helper using cloudflare-dns.com and dns.google
async function resolveViaDoH(hostname: string): Promise<string[]> {
  try {
    const cfUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(cfUrl, {
      headers: { "accept": "application/dns-json" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const json = await response.json() as any;
      if (json && json.Answer && Array.isArray(json.Answer)) {
        const ips = json.Answer
          .filter((ans: any) => ans.type === 1) // Type 1 is A record
          .map((ans: any) => ans.data);
        if (ips.length > 0) return ips;
      }
    }
  } catch (e) {
    console.warn(`Cloudflare DoH failed for ${hostname}:`, e);
  }

  try {
    const googleUrl = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(googleUrl, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const json = await response.json() as any;
      if (json && json.Answer && Array.isArray(json.Answer)) {
        const ips = json.Answer
          .filter((ans: any) => ans.type === 1) // Type 1 is A record
          .map((ans: any) => ans.data);
        if (ips.length > 0) return ips;
      }
    }
  } catch (e) {
    console.warn(`Google DoH failed for ${hostname}:`, e);
  }

  return [];
}

// DNS lookup override to handle ENOTFOUND issues in sandboxed Cloud Run environments
const originalLookup = dns.lookup;
// @ts-ignore
dns.lookup = function (hostname: string, options: any, callback: any) {
  let realOptions = options;
  let realCallback = callback;
  if (typeof options === "function") {
    realCallback = options;
    realOptions = {};
  }

  const cb = (err: any, address: any, family: any) => {
    if (typeof realCallback === "function") {
      realCallback(err, address, family);
    }
  };

  // Intercept the DoH resolvers to prevent infinite recursion
  if (hostname === "cloudflare-dns.com") {
    const ip = "104.16.248.249";
    if (realOptions && realOptions.all) {
      return cb(null, [{ address: ip, family: 4 }], 4);
    }
    return cb(null, ip, 4);
  }
  if (hostname === "dns.google") {
    const ip = "8.8.8.8";
    if (realOptions && realOptions.all) {
      return cb(null, [{ address: ip, family: 4 }], 4);
    }
    return cb(null, ip, 4);
  }

  // Try the system's original DNS resolver first
  originalLookup(hostname, realOptions, (err, address, family) => {
    if (err) {
      // If system DNS fails, fallback to DoH (DNS-over-HTTPS)
      resolveViaDoH(hostname)
        .then((ips) => {
          if (ips && ips.length > 0) {
            if (realOptions && realOptions.all) {
              cb(null, ips.map(ip => ({ address: ip, family: 4 })), 4);
            } else {
              cb(null, ips[0], 4);
            }
          } else {
            cb(err, address, family);
          }
        })
        .catch(() => {
          cb(err, address, family);
        });
    } else {
      cb(null, address, family);
    }
  });
};

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
    isTransmissionEnabled: true,
    shopeeAppKey: "",
    shopeeAppSecret: "",
    shopeeAffiliateId: "",
    useShopeeApi: false,
    customFooter: "",
    quietStart: "08:00",
    quietEnd: "23:00",
    automaticScanInterval: 60, // minutes
    robotActivationTime: Date.now(), // timestamp of robot activation
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
  const isElectron = typeof process !== 'undefined' && (process.versions?.electron || process.env.ELECTRON_RUN_AS_NODE);
  
  if (isElectron) {
    const homeDir = os.homedir();
    const appDataPath = path.join(homeDir, ".shopee-bot-sessions");
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
    }
    return path.join(appDataPath, "state_data.json");
  }

  try {
    const testPath = path.join(process.cwd(), "test_write_perm");
    fs.mkdirSync(testPath, { recursive: true });
    fs.rmdirSync(testPath);
    return path.join(process.cwd(), "state_data.json");
  } catch {
    return path.join(os.tmpdir(), "state_data.json");
  }
})();

// Copy initial state_data.json if we are using an external path and the file doesn't exist yet
if (STATE_FILE_PATH !== path.join(process.cwd(), "state_data.json")) {
  try {
    const localPath = path.join(process.cwd(), "state_data.json");
    if (fs.existsSync(localPath) && !fs.existsSync(STATE_FILE_PATH)) {
      fs.copyFileSync(localPath, STATE_FILE_PATH);
      console.log(`Copiado arquivo de estado inicial para ${STATE_FILE_PATH}`);
    }
  } catch (err) {
    console.error("Falha ao copiar estado inicial:", err);
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

// Check for invalid/suspicious Shopee API configuration on startup to prevent annoying API errors
if (state.config.useShopeeApi) {
  const appKey = state.config.shopeeAppKey ? String(state.config.shopeeAppKey).trim() : "";
  const appSecret = state.config.shopeeAppSecret ? String(state.config.shopeeAppSecret).trim() : "";
  const affId = state.config.shopeeAffiliateId ? String(state.config.shopeeAffiliateId).trim() : "";
  const generalAffId = state.config.affiliateId ? String(state.config.affiliateId).trim() : "";

  let needsAutoDisable = false;
  let disableReason = "";

  if (!appKey || !appSecret) {
    needsAutoDisable = true;
    disableReason = "Chave (App Key) ou Segredo (App Secret) vazios.";
  } else if (appKey === affId || appKey === generalAffId) {
    needsAutoDisable = true;
    disableReason = "A chave (App Key) está idêntica ao ID de Afiliado. A Shopee Open Platform exige um App Key numérico específico criado no painel de desenvolvedor.";
  } else if (appKey.length > 25 && appKey.includes("@")) {
    needsAutoDisable = true;
    disableReason = "O App Key parece ser um e-mail ou formato inválido.";
  }

  if (needsAutoDisable) {
    state.config.useShopeeApi = false;
    saveStateToFile();
    console.log(`[Shopee Config Guard] Conexão via API desativada preventivamente. Motivo: ${disableReason}`);
  }
}

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
  if (!originalUrl) return "";
  const cleanUrl = originalUrl.trim().replace(/[.,;:!?)\]]+$/, "");
  
  // Resolve effective affiliate ID from user settings or parameter
  const affIdToUse = (state.config.shopeeAffiliateId || state.config.affiliateId || affiliateId || "heltonjulio1703").trim();

  // Extract domain from original URL to support other regions
  let shopeeDomain = "shopee.com.br"; // Default
  try {
    const urlObj = new URL(cleanUrl);
    const parts = urlObj.hostname.split('.');
    const shopeeIndex = parts.indexOf("shopee");
    if (shopeeIndex !== -1 && parts.length > shopeeIndex + 1) {
      shopeeDomain = parts.slice(shopeeIndex).join('.');
    }
  } catch (e) {
    // Keep default domain if parsing fails
  }

  // Shopee Universal Link structure for reliable tracking
  const universalUrl = `https://${shopeeDomain}/universal-link/pc?utm_source=an_affiliate&utm_medium=affiliates&utm_campaign=-&utm_content=${encodeURIComponent(subId)}&utm_term=${encodeURIComponent(affIdToUse)}&url=${encodeURIComponent(cleanUrl)}`;
  
  return universalUrl;
};

// Official Shopee Affiliate API Link Converter
const convertWithShopeeApi = async (
  originalUrl: string,
  key: string,
  secret: string,
  subId: string = "bot"
): Promise<string | null> => {
  const appKey = (key || "").trim();
  const appSecret = (secret || "").trim();
  const cleanUrl = originalUrl.trim().replace(/[.,;:!?)\]]+$/, "");

  // Primary Brazilian and regional GraphQL endpoints for Shopee Open Platform
  const endpoints = [
    "https://open-api.affiliate.shopee.com.br/graphql",
    "https://open-api.affiliate.shopee.com.br/v2/api",
    "https://open-api.affiliate.shopee.sg/graphql",
    "https://open-api.affiliate.shopee.sg/v2/api",
  ];

  let lastApiError: Error | null = null;
  let lastNetworkError: Error | null = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 300));
      
      const queries = [
        {
          name: "generatePromotionLink",
          body: `mutation{generatePromotionLink(linkParams:{originalUrl:${JSON.stringify(cleanUrl)},subIds:[${JSON.stringify(subId)}]}){code message data{promotionLink shortLink}}}`
        },
        {
          name: "generatePromotionLinkAlt",
          body: `mutation{generatePromotionLink(linkParams:{originUrl:${JSON.stringify(cleanUrl)},subIds:[${JSON.stringify(subId)}]}){code message data{promotionLink shortLink}}}`
        },
        {
          name: "generateShortLink",
          body: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(cleanUrl)},subIds:[${JSON.stringify(subId)}]}){shortLink}}`
        }
      ];

      for (const queryObj of queries) {
        const initialPayload = JSON.stringify({ query: queryObj.body });
        
        try {
          const authResult = generateShopeeAuthHeader({
            appKey,
            appSecret,
            payload: initialPayload
          });

          const payloadStr = authResult.payloadStr;

          for (const headerCandidate of authResult.headerVariants) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 7000);

              const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "application/json",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Authorization": headerCandidate,
                },
                body: payloadStr,
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              const responseText = await response.text();
              let json;
              try {
                json = JSON.parse(responseText);
              } catch (e) {
                lastApiError = new Error(`Resposta Shopee não é JSON válido (HTTP ${response.status}): ${responseText.substring(0, 100)}`);
                continue;
              }

              if (!response.ok) {
                lastApiError = new Error(`Shopee API HTTP ${response.status}: ${JSON.stringify(json)}`);
                continue;
              }

              if (json.errors && json.errors.length > 0) {
                const msg = json.errors[0].message || "GraphQL error";
                const errCode = json.errors[0].code;
                
                if (errCode === 10020 || msg.includes("10020") || errCode === 10035 || msg.includes("10035")) {
                  lastApiError = new Error("Erro de Permissão (10020/10035): O seu aplicativo no Shopee Open Platform precisa ser do tipo 'Affiliate' e estar com status 'Active' (Aprovado).");
                } else {
                  lastApiError = new Error(`Erro Shopee API: ${msg}`);
                }
                continue;
              }

              const result = json.data?.generatePromotionLink?.data?.promotionLink || 
                             json.data?.generatePromotionLink?.data?.shortLink ||
                             json.data?.generatePromotionLink?.promotionLink ||
                             json.data?.generatePromotionLink?.shortLink ||
                             json.data?.generateShortLink?.shortLink || 
                             json.data?.batchGetCustomLink?.customLinkList?.[0]?.customLink;

              if (result) {
                console.log(`Conversão com sucesso via endpoint Shopee: ${endpoint} usando ${queryObj.name}`);
                return result;
              }
            } catch (innerErr: any) {
              if (innerErr.name === "AbortError") {
                lastNetworkError = new Error(`Tempo limite esgotado (timeout) ao conectar no endpoint ${endpoint}`);
              } else {
                lastNetworkError = innerErr;
              }
            }
          }
        } catch (authErr: any) {
          lastApiError = authErr;
        }
      }
    } catch (error: any) {
      const isDnsOrConn = error.code === "ENOTFOUND" || error.name === "AbortError" || error.message?.includes("fetch failed");
      if (isDnsOrConn) {
        console.log(`Endpoint ${endpoint} não respondeu à conexão.`);
        lastNetworkError = new Error(`Falha de conexão com os servidores da Shopee Open API (${endpoint}).`);
      } else {
        console.warn(`Erro no endpoint ${endpoint}:`, error);
        lastNetworkError = error as Error;
      }
    }
  }

  const finalError = lastApiError || lastNetworkError || new Error("Não foi possível conectar à API da Shopee.");
  console.log(`[Shopee Link Converter] ${finalError.message}`);
  throw finalError;
};

// Helper to follow redirects of short Shopee URLs (shp.ee, shope.ee, s.shopee.com.br) and return the long original URL
const expandShopeeUrl = async (url: string): Promise<string> => {
  if (!url || !url.startsWith("http")) return url;

  const cleanUrl = url.trim().replace(/[.,;:!?)\]]+$/, "");
  const isShort = cleanUrl.includes("shp.ee") || 
                  cleanUrl.includes("shope.ee") || 
                  cleanUrl.includes("s.shopee.com") || 
                  cleanUrl.includes("s.shopee.com.br");

  if (!isShort) return cleanUrl;

  try {
    addLog("info", `Expandindo link curto da Shopee: ${cleanUrl}`);

    // Fast check via manual redirect to capture Location header
    let current = cleanUrl;
    for (let hop = 0; hop < 4; hop++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(current, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "manual",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const loc = response.headers.get("location");
        if (loc && loc.startsWith("http")) {
          current = loc;
          if (current.includes("shopee.com") && !current.includes("s.shopee.com")) {
            addLog("success", `✅ Link curto expandido com sucesso para: ${current.substring(0, 70)}...`);
            return current;
          }
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }

    // Fallback GET request with redirect follow
    const response = await fetch(current, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (response.ok) {
      if (response.url && response.url.includes("shopee.com") && !response.url.includes("s.shopee.com")) {
        addLog("success", `✅ Link curto expandido com sucesso para: ${response.url.substring(0, 70)}...`);
        return response.url;
      }

      const html = await response.text();
      const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
      if (canonicalMatch && canonicalMatch[1] && canonicalMatch[1].startsWith("http")) {
        return canonicalMatch[1];
      }
      const locMatch = html.match(/(?:location\.href|location\.replace|window\.location)\s*=\s*["']([^"']+)["']/i) ||
                       html.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][0-9]+;\s*url=([^"']+)["']/i);
      if (locMatch && locMatch[1] && locMatch[1].startsWith("http")) {
        return locMatch[1];
      }
      const shopeeFullMatch = html.match(/https?:\/\/(?:www\.)?shopee\.com\.br\/[^\s"'\<\>]+/i);
      if (shopeeFullMatch && shopeeFullMatch[0]) {
        return shopeeFullMatch[0];
      }
      if (response.url && response.url.startsWith("http")) {
        return response.url;
      }
    }
  } catch (err) {
    console.error("Falha ao expandir link curto da Shopee:", err);
  }
  return cleanUrl;
};

// Async Link Converter that automatically attempts Shopee API if configured, falling back to Affiliate ID link
const convertToAffiliateLinkAsync = async (originalUrl: string, affiliateId: string, subId: string = "bot") => {
  if (!originalUrl) return "";

  const cleanInputUrl = originalUrl.trim().replace(/[.,;:!?)\]]+$/, "");
  const effAffId = (state.config.shopeeAffiliateId || state.config.affiliateId || affiliateId || "heltonjulio1703").trim();
  
  // Expand short URLs first to ensure the best tracking and conversion results
  const resolvedUrl = await expandShopeeUrl(cleanInputUrl);

  const hasAppKey = !!(state.config.shopeeAppKey && state.config.shopeeAppKey.trim());
  const hasAppSecret = !!(state.config.shopeeAppSecret && state.config.shopeeAppSecret.trim());

  if (hasAppKey && hasAppSecret) {
    try {
      addLog("info", `Tentando gerar link via API Oficial da Shopee...`);
      const apiLink = await convertWithShopeeApi(
        resolvedUrl,
        state.config.shopeeAppKey!.trim(),
        state.config.shopeeAppSecret!.trim(),
        subId
      );

      if (apiLink) {
        addLog("success", `✅ Link gerado com sucesso via API Oficial da Shopee!`);
        return apiLink;
      }
      addLog("warning", `⚠️ Resposta da API Shopee sem link retornado. Alternando automaticamente para conversão direta com ID de Afiliado "${effAffId}"...`);
    } catch (err) {
      const errMsg = (err as Error).message || "";
      addLog("warning", `⚠️ Falha de conexão com a API da Shopee (${errMsg}). Alternando automaticamente para conversão direta com ID de Afiliado "${effAffId}"...`);
    }
  }

  // Fallback to Universal Link with Affiliate ID
  return convertToAffiliateLink(resolvedUrl, effAffId, subId);
};

// Helper to ensure the message footer below the link is strictly replaced with Instagram @isamara.manoel
const applyFooterToMessage = (msg: string): string => {
  const footer = state.config.customFooter || "";
  if (!msg) return msg;
  if (!footer) return msg;

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  let lastUrlIndex = -1;
  let lastUrlLength = 0;
  let match;
  while ((match = urlRegex.exec(msg)) !== null) {
    lastUrlIndex = match.index;
    lastUrlLength = match[0].length;
  }

  if (lastUrlIndex !== -1) {
    const upToLastUrl = msg.substring(0, lastUrlIndex + lastUrlLength).trimEnd();
    return `${upToLastUrl}\n\n${footer}`;
  }

  const trimmed = msg.trimEnd();
  if (trimmed.endsWith(footer)) return trimmed;
  return `${trimmed}\n\n${footer}`;
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

REGRA CRÍTICA DE PREÇOS (MANDATÓRIO):
Mantenha os valores de preços, parcelamento, preço de tabela ("De R$ X"), preço promocional ("Por R$ Y"), porcentagem de desconto e cupons RIGOROSAMENTE IGUAIS aos da mensagem de origem. NÃO invente novos preços, NÃO modifique nem remova a estrutura e os valores de preço da mensagem original. Se a mensagem original tiver "De R$ 99 por R$ 49,90" ou "10x de R$ 4,99", mantenha exatamente essas mesmas informações de preços na mensagem reformulada.

REGRA DO RODAPÉ (MANDATÓRIO):
Abaixo do link [LINK_AFILIADO], substitua QUALQUER texto de rodapé, assinatura, aviso ou canal original estritamente por:
Instagram @isamara.manoel

Use as seguintes diretrizes para o "rewrittenMessage" de acordo com o estilo selecionado "${style}":
- excited: Use muitos emojis (🔥, 😱, 🚨, ✨), texto entusiasmado e tom urgente, mantendo a parte dos preços idêntica ao anúncio de origem. Ex: "🚨 GENTE DO CÉU! OLHA ESSE ACHADO... 🔥"
- minimal: Direto ao ponto, com poucos emojis, mantendo a parte dos preços idêntica ao anúncio de origem e o link [LINK_AFILIADO].
- creative: Crie um texto descontraído, mantendo os preços idênticos ao anúncio de origem.
- direct: Profissional, amigável e claro. Formato limpo com preços idênticos ao anúncio de origem.

ATENÇÃO (CRÍTICO): NÃO inclua nenhuma assinatura de robô ou aviso indicando que o anúncio foi gerado por IA/bot/automação.

Mensagem original a ser analisada:
"""
${messageText}
"""`;

  const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let response = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
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
        if (response && response.text) {
          break;
        }
      } catch (modelError) {
        const errMsg = (modelError as Error).message || String(modelError);
        console.warn(`Modelo ${modelName} (tentativa ${attempt + 1}) falhou:`, errMsg);
        // If 503 (service unavailable / high demand), wait 1s before retrying
        if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE")) {
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          // If 429 or 404, switch to next model immediately
          break;
        }
      }
    }
    if (response && response.text) {
      break;
    }
  }

  try {
    if (!response || !response.text) {
      throw new Error("Não foi possível obter resposta de nenhum modelo Gemini.");
    }
    const resultText = response.text.trim();
    const parsed = JSON.parse(resultText);

    if (parsed.hasShopeeLink && parsed.originalLink) {
      const effAffId = state.config.shopeeAffiliateId || state.config.affiliateId || affiliateId;
      const cleanOrig = parsed.originalLink.trim().replace(/[.,;:!?)\]]+$/, "");
      const affiliateLink = await convertToAffiliateLinkAsync(cleanOrig, effAffId);
      parsed.originalLink = cleanOrig;
      parsed.affiliateLink = affiliateLink;
      
      let msg = parsed.rewrittenMessage || "";
      msg = msg.split("[LINK_AFILIADO]").join(affiliateLink);
      msg = msg.split("[link_afiliado]").join(affiliateLink);
      msg = msg.split("[Link_Afiliado]").join(affiliateLink);
      msg = msg.split("[LINK]").join(affiliateLink);
      msg = msg.split("[link]").join(affiliateLink);
      if (parsed.originalLink) {
        msg = msg.split(parsed.originalLink).join(affiliateLink);
      }

      // Replace any remaining Shopee links in rewrittenMessage
      const shopeeLinkRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|shp\.ee|shope\.ee|s\.shopee\.[a-z]{2,3}(?:\.[a-z]{2})?)[^\s]+)/gi;
      msg = msg.replace(shopeeLinkRegex, (foundUrl) => {
        if (foundUrl.includes("universal-link") || foundUrl.includes("utm_term=")) {
          return foundUrl;
        }
        return affiliateLink;
      });

      parsed.rewrittenMessage = applyFooterToMessage(msg);
    }

    return parsed;
  } catch (error) {
    console.error("Erro na chamada do Gemini API ou parse de JSON:", error);
    const errorStr = String(error);
    const isQuotaError = errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("quota") || errorStr.includes("429") || errorStr.includes("rate limit") || errorStr.includes("Rate limit");
    
    if (isQuotaError) {
      addLog("warning", "⚠️ Limite de cota do Gemini atingido. O robô continuará funcionando perfeitamente usando conversão e formatação automática inteligente via Regex.");
    } else {
      addLog("warning", `⚠️ Falha ao usar IA do Gemini para reescrever anúncio. Usando conversão automática via Regex.`);
    }
    return parseMessageWithRegex(messageText, affiliateId);
  }
};

// Regex Fallback parsing if Gemini is not available
const parseMessageWithRegex = async (messageText: string, affiliateId: string) => {
  const effAffId = state.config.shopeeAffiliateId || state.config.affiliateId || affiliateId;

  // Regex to detect all Shopee URL variants
  const shopeeRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|shp\.ee|shope\.ee|s\.shopee\.[a-z]{2,3}(?:\.[a-z]{2})?)[^\s]+)/gi;
  const matches = messageText.match(shopeeRegex);

  if (!matches || matches.length === 0) {
    return {
      hasShopeeLink: false,
      originalLink: "",
      productTitle: "Mensagem Informativa",
      price: null,
      coupon: null,
      rewrittenMessage: applyFooterToMessage(messageText),
    };
  }

  const rawOriginalLink = matches[0];
  const originalLink = rawOriginalLink.replace(/[.,;:!?)\]]+$/, "");
  const affiliateLink = await convertToAffiliateLinkAsync(originalLink, effAffId);

  // Guess product title from the message text
  let productTitle = "Produto da Shopee";
  const lines = messageText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    productTitle = lines[0]
      .replace(/[🚨🔥😱🛍️✨🚨🚨]/g, "")
      .replace(/PROMOÇÃO|OFERTA|ACHADO|CUPOM/gi, "")
      .substring(0, 40)
      .trim();
  }

  // Preserve the exact original message structure and prices, replacing shopee URLs with affiliate links
  let rewrittenMessage = messageText;
  for (const rawUrl of matches) {
    const cleaned = rawUrl.replace(/[.,;:!?)\]]+$/, "");
    const converted = await convertToAffiliateLinkAsync(cleaned, effAffId);
    rewrittenMessage = rewrittenMessage.split(rawUrl).join(converted);
  }

  rewrittenMessage = applyFooterToMessage(rewrittenMessage);

  return {
    hasShopeeLink: true,
    originalLink,
    affiliateLink,
    productTitle,
    price: "Ver na oferta",
    coupon: null,
    rewrittenMessage,
  };
};

// Helper to fetch original product photo from Shopee URL by following redirects, API, and reading OpenGraph tags
const fetchOriginalShopeeImage = async (url: string): Promise<string | null> => {
  if (!url || !url.startsWith("http")) return null;
  
  try {
    const targetUrl = await expandShopeeUrl(url);
    addLog("info", `Buscando foto original do produto no link: ${targetUrl}`);

    // Try Shopee API first if shopid and itemid can be extracted from targetUrl or original url
    let shopid: string | null = null;
    let itemid: string | null = null;

    const matchI = targetUrl.match(/i\.(\d+)\.(\d+)/i) || url.match(/i\.(\d+)\.(\d+)/i);
    if (matchI) {
      shopid = matchI[1];
      itemid = matchI[2];
    } else {
      const matchProd = targetUrl.match(/product\/(\d+)\/(\d+)/i) || url.match(/product\/(\d+)\/(\d+)/i);
      if (matchProd) {
        shopid = matchProd[1];
        itemid = matchProd[2];
      }
    }

    if (shopid && itemid) {
      try {
        addLog("info", `🔎 Consultando foto original via API Shopee (Item: ${itemid}, Loja: ${shopid})...`);
        const apiUrls = [
          `https://shopee.com.br/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`,
          `https://shopee.com.br/api/v2/item/get?itemid=${itemid}&shopid=${shopid}`
        ];
        for (const apiUrl of apiUrls) {
          const apiRes = await fetch(apiUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json",
              "Referer": targetUrl,
            }
          });
          if (apiRes.ok) {
            const json = await apiRes.json();
            const imgHash = json?.data?.image || json?.data?.item?.image || json?.item?.image || (json?.data?.images && json.data.images[0]) || (json?.data?.item?.images && json.data.item.images[0]);
            if (imgHash && typeof imgHash === "string" && imgHash.length > 5) {
              const cleanHash = imgHash.trim();
              const fullImgUrl = cleanHash.startsWith("http") ? cleanHash : `https://down-br.img.susercontent.com/file/${cleanHash}`;
              addLog("success", `📸 Foto original do anúncio encontrada (API Shopee): ${fullImgUrl.substring(0, 60)}...`);
              return fullImgUrl;
            }
          }
        }
      } catch (apiErr) {
        console.warn("Falha na chamada API de item Shopee:", apiErr);
      }
    }

    // HTML fallback
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (response.ok) {
      const html = await response.text();
      
      const metaMatches = [
        /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
        /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
        /<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i,
      ];
      for (const r of metaMatches) {
        const m = html.match(r);
        if (m && m[1] && m[1].trim().length > 5) {
          let cleanUrl = m[1].trim().replace(/\\u002F/g, "/");
          if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;
          if (cleanUrl.startsWith("/")) cleanUrl = "https://shopee.com.br" + cleanUrl;
          if (cleanUrl.startsWith("http")) {
            addLog("success", `📸 Foto original encontrada (Meta tag): ${cleanUrl.substring(0, 60)}...`);
            return cleanUrl;
          }
        }
      }

      const jsonImgMatch = html.match(/"image":\s*"([^"]+)"/i) || html.match(/"images":\s*\["([^"]+)"/i);
      if (jsonImgMatch && jsonImgMatch[1]) {
        let imgStr = jsonImgMatch[1].trim().replace(/\\u002F/g, "/");
        if (imgStr.startsWith("//")) imgStr = "https:" + imgStr;
        if (imgStr.startsWith("/")) imgStr = "https://shopee.com.br" + imgStr;
        if (imgStr.startsWith("http")) {
          addLog("success", `📸 Foto original encontrada (JSON): ${imgStr.substring(0, 60)}...`);
          return imgStr;
        } else if (imgStr.length > 10 && !imgStr.includes(" ")) {
          const fullUrl = `https://down-br.img.susercontent.com/file/${imgStr}`;
          addLog("success", `📸 Foto original encontrada (Hash JSON): ${fullUrl.substring(0, 60)}...`);
          return fullUrl;
        }
      }

      const cdnMatch = html.match(/https?:\/\/down-[a-z0-9-]+\.img\.susercontent\.com\/file\/[a-zA-Z0-9_.-]+/i) ||
                       html.match(/https?:\/\/cf\.shopee\.com\.br\/file\/[a-zA-Z0-9_.-]+/i);
      if (cdnMatch && cdnMatch[0]) {
        const cdnUrl = cdnMatch[0].trim();
        addLog("success", `📸 Foto original encontrada (Shopee CDN): ${cdnUrl.substring(0, 60)}...`);
        return cdnUrl;
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
  if (!state.config.isTransmissionEnabled) {
    addLog("info", `Transmissão pausada: Mensagem de "${sourceGroupName}" ignorada.`);
    return null;
  }

  // 1. Checagem rápida de duplicidade antes do processamento pesado do Gemini
  const shopeeLinkRegex = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shp\.ee|shope\.ee|shopee\.com\.br|shopee\.com)[^\s]+)/i;
  const match = messageText.match(shopeeLinkRegex);
  const foundLink = match ? match[1].toLowerCase().trim() : null;
  const cleanMessage = messageText.trim().replace(/\s+/g, " ");

  // 1.1 Checagem de horário de envio permitido
  const isSendingTimeAllowed = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (state.config.quietStart || "23:00").split(":").map(Number);
    const [endH, endM] = (state.config.quietEnd || "08:00").split(":").map(Number);
    
    const quietStartMin = startH * 60 + startM;
    const quietEndMin = endH * 60 + endM;

    let isQuiet = false;
    if (quietStartMin < quietEndMin) {
        // Same day
        isQuiet = currentMinutes >= quietStartMin && currentMinutes < quietEndMin;
    } else {
        // Spans midnight
        isQuiet = currentMinutes >= quietStartMin || currentMinutes < quietEndMin;
    }
    
    return !isQuiet;
  };

  if (!isSendingTimeAllowed()) {
    addLog("info", `Horário restrito (Configurado silêncio das ${state.config.quietStart || "23:00"} até ${state.config.quietEnd || "08:00"}). Anúncio ignorado.`);
    return null;
  }

  const isDuplicatePre = state.history.some(h => {
    if (h.originalMessage && h.originalMessage.trim().replace(/\s+/g, " ") === cleanMessage) {
      return true;
    }
    if (foundLink && h.originalLink && h.originalLink.toLowerCase().trim() === foundLink) {
      return true;
    }
    return false;
  });

  if (isDuplicatePre) {
    addLog("info", `Anúncio em "${sourceGroupName}" já foi convertido e enviado anteriormente (${foundLink || "mensagem idêntica"}). Ignorando para evitar duplicidade.`);
    return null;
  }

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

  // 2. Checagem profunda após Gemini, caso o link original tenha sido expandido pela API
  if (parsed.originalLink) {
    const parsedOriginalLinkClean = parsed.originalLink.toLowerCase().trim();
    const isDuplicatePost = state.history.some(h => {
      if (h.originalLink && h.originalLink.toLowerCase().trim() === parsedOriginalLinkClean) {
        return true;
      }
      return false;
    });

    if (isDuplicatePost) {
      addLog("info", `Anúncio em "${sourceGroupName}" com link expandido (${parsed.originalLink}) já foi processado anteriormente. Ignorando para evitar duplicidade.`);
      return null;
    }
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
  if (state.history.length > 200) state.history.pop();

  // Send rewritten message to target groups with image if connected
  for (const target of activeTargets) {
    if (typeof whatsappEngine !== "undefined" && whatsappEngine && whatsappEngine.status.status === "connected") {
      await whatsappEngine.sendMessage(target.id, parsed.rewrittenMessage, imageBuffer, resolvedImageUrl);
      addLog("success", `✨ [WhatsApp REAL] Anúncio enviado com IMAGEM para "${target.name}": ${parsed.productTitle}`);
    } else {
      addLog("success", `✨ Anúncio encaminhado para "${target.name}" (Simulado): ${parsed.productTitle}`);
    }
  }

  return historyItem;
};

// Helper to check if an incoming message's group matches an active source group (by JID or Group Name)
const isSourceGroupActive = (groupJid: string, groupName: string): boolean => {
  const cleanFromJid = groupJid.split(":")[0].toLowerCase().trim();
  const cleanFromName = groupName.toLowerCase().trim();

  return state.groups.sources.some(s => {
    if (!s.active) return false;
    const cleanSourceId = s.id.split(":")[0].toLowerCase().trim();
    const cleanSourceName = s.name.toLowerCase().trim();

    // 1. Direct JID match
    if (cleanSourceId === cleanFromJid || cleanFromJid.includes(cleanSourceId) || cleanSourceId.includes(cleanFromJid)) {
      return true;
    }
    // 2. Group name match
    if (cleanSourceName && cleanFromName && (cleanSourceName === cleanFromName || cleanFromName.includes(cleanSourceName) || cleanSourceName.includes(cleanFromName))) {
      return true;
    }
    return false;
  });
};

// Initialize the real WhatsApp Engine
const whatsappEngine = new WhatsAppEngine(
  (type, msg) => {
    addLog(type, msg);
  },
  (discoveredGroups) => {
    // Merge discovered groups into sources and targets
    let addedCount = 0;
    let updatedCount = 0;

    discoveredGroups.forEach(g => {
      // Sources
      const existingSource = state.groups.sources.find(s => s.id === g.id);
      if (existingSource) {
        if (existingSource.name !== g.name) {
          existingSource.name = g.name;
          updatedCount++;
        }
      } else {
        state.groups.sources.push({ id: g.id, name: g.name, active: false });
        addedCount++;
      }

      // Targets
      const existingTarget = state.groups.targets.find(t => t.id === g.id);
      if (existingTarget) {
        if (existingTarget.name !== g.name) {
          existingTarget.name = g.name;
          updatedCount++;
        }
      } else {
        state.groups.targets.push({ id: g.id, name: g.name, active: false });
        addedCount++;
      }
    });

    if (addedCount > 0 || updatedCount > 0) {
      addLog("info", `Sincronização concluída: ${addedCount} novos e ${updatedCount} nomes de grupos atualizados.`);
    }
    saveStateToFile();
  },
  async (groupJid, groupName, text, imageBuffer, imageUrl) => {
    // Check if this source group is active (comparing clean JID or group name)
    if (!isSourceGroupActive(groupJid, groupName)) {
      return;
    }

    // Process the message and convert links (this will also send to active targets automatically inside processIncomingMessage)
    await processIncomingMessage(groupName, text, imageBuffer, imageUrl);
  },
  () => {
    // On WhatsApp Connection Open
    if (state.config.isTransmissionEnabled) {
      scanActiveSourceGroups("Conexão WhatsApp Estabelecida");
    }
  }
);

// Automatic scanning helper for all active source groups when the bot is turned on or reconnected
async function scanActiveSourceGroups(triggerReason: string = "Robô Ligado") {
  setTimeout(async () => {
    if (!state.config.isTransmissionEnabled) {
      return;
    }

    const activeSources = state.groups.sources.filter(s => s.active);
    if (activeSources.length === 0) {
      addLog("warning", `⚡ [${triggerReason}] Nenhum grupo de origem está marcado como ativo. Ative ao menos um grupo de origem na aba 'Grupos e Canais'.`);
      return;
    }

    addLog("info", `🚀 [${triggerReason}] Iniciando varredura automática em ${activeSources.length} grupo(s) de origem ativo(s)...`);

    for (const group of activeSources) {
      try {
        addLog("info", `🔎 Varrendo automaticamente grupo: "${group.name}"...`);
        const result = await whatsappEngine.scanTodayMessages(
          group.id, 
          async (text, imageBuffer) => {
            return await processIncomingMessage(group.name, text, imageBuffer);
          },
          state.config.robotActivationTime
        );

        const detail = result.detailMessage || (result.processedCount > 0 
          ? `Sucesso: ${result.processedCount} oferta(s) encaminhada(s).` 
          : `Nenhuma oferta nova enviada.`);

        addLog("info", `📊 Varredura automática em "${group.name}": ${detail}`);
      } catch (err) {
        addLog("error", `Erro na varredura automática do grupo "${group.name}": ${(err as Error).message}`);
      }
    }
    saveStateToFile();
  }, 400);
}

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

let autoScanTimer: NodeJS.Timeout | null = null;
let autoPilotTimer: NodeJS.Timeout | null = null;

const startAutoScanTimer = () => {
  if (autoScanTimer) clearInterval(autoScanTimer);
  
  autoScanTimer = setInterval(() => {
    if (state.config.isTransmissionEnabled && whatsappEngine.status.status === "connected") {
      scanActiveSourceGroups("Varredura Automática Periódica");
    }
  }, (state.config.automaticScanInterval || 60) * 60 * 1000); // interval is in minutes
};

const startAutoPilotSimulator = () => {
  if (autoPilotTimer) clearInterval(autoPilotTimer);

  const runSimulationTick = async () => {
    try {
      if (whatsappEngine.status.status !== "connected") {
        // Don't process autopilot if WhatsApp is disconnected
        return;
      }

      if (!state.config.autoPilot || !state.config.isTransmissionEnabled) return;

      // Pick random source group that is active
      const activeSources = state.groups.sources.filter(g => g.active);
      if (activeSources.length === 0) return;
      const randomSource = activeSources[Math.floor(Math.random() * activeSources.length)];

      // Pick random product
      const randomProduct = SIMULATED_PRODUCTS[Math.floor(Math.random() * SIMULATED_PRODUCTS.length)];

      await processIncomingMessage(randomSource.name, randomProduct.rawCopy);
    } catch (err) {
      console.error("Erro no ciclo do Piloto Automático:", err);
    }
  };

  // Run initial simulation soon after connection
  setTimeout(() => {
    if (whatsappEngine.status.status === "connected" && state.config.autoPilot) {
      runSimulationTick().catch(() => {});
    }
  }, 4000);

  autoPilotTimer = setInterval(() => {
    runSimulationTick().catch(() => {});
  }, state.config.autoPilotInterval * 1000);
};

// Initialize background tasks on server boot
startAutoPilotSimulator();
startAutoScanTimer();

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
  startAutoScanTimer();
  res.json({ success: true, config: state.config });
});

app.post("/api/shopee/test", async (req, res) => {
  const { shopeeAppKey, shopeeAppSecret } = req.body;
  if (!shopeeAppKey || !shopeeAppSecret) {
    return res.status(400).json({ success: false, error: "App Key e App Secret são obrigatórios para realizar o teste de conexão." });
  }

  try {
    addLog("info", "🤖 Iniciando teste de conexão e autenticação com a API da Shopee...");
    // Use a standard Brazilian Shopee link for the test
    const testUrl = "https://shopee.com.br";
    const result = await convertWithShopeeApi(testUrl, shopeeAppKey, shopeeAppSecret, "test_conn");
    
    if (result) {
      addLog("success", "✅ Conexão com a API Oficial da Shopee estabelecida com sucesso! Credenciais ativas.");
      return res.json({ success: true, message: "Conexão com a API Oficial estabelecida com sucesso!", link: result });
    } else {
      throw new Error("A API da Shopee não retornou o link promocional esperado.");
    }
  } catch (error: any) {
    const errorMsg = error?.message || "Erro desconhecido ao testar conexão.";
    addLog("error", `❌ Falha no teste de conexão da API da Shopee: ${errorMsg}`);
    return res.json({ success: false, error: errorMsg });
  }
});

app.post("/api/transmission/toggle", (req, res) => {
  state.config.isTransmissionEnabled = !state.config.isTransmissionEnabled;
  if (!state.config.isTransmissionEnabled) {
    addLog("info", "⏸️ Robô de transmissão desativado.");
  } else {
    state.config.robotActivationTime = Date.now();
    addLog("info", "▶️ Robô de transmissão ativado! Iniciando varredura automática nos grupos de origem ativos...");
    scanActiveSourceGroups("Robô Ativado");
    startAutoScanTimer();
  }
  saveStateToFile();
  res.json({
    success: true,
    isTransmissionEnabled: state.config.isTransmissionEnabled,
    historyCleared: false,
    history: state.history,
  });
});

// Groups
app.get("/api/groups", (req, res) => {
  res.json(state.groups);
});

app.post("/api/groups", (req, res) => {
  const prevActive = (state.groups.sources || []).filter(s => s.active).map(s => s.id);
  if (req.body.sources) state.groups.sources = req.body.sources;
  if (req.body.targets) state.groups.targets = req.body.targets;
  addLog("info", "Lista de grupos atualizada.");
  saveStateToFile();

  const newlyActivated = (state.groups.sources || []).filter(s => s.active && !prevActive.includes(s.id));
  if (state.config.isTransmissionEnabled && newlyActivated.length > 0) {
    scanActiveSourceGroups("Grupo Origem Ativado");
  }

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

app.post("/api/whatsapp/connect", async (req, res) => {
  await whatsappEngine.connect(true);
  res.json(whatsappEngine.status);
});

// Endpoint for status check
app.post("/api/whatsapp/confirm-scan", (req, res) => {
  if (whatsappEngine.status.status === "qr_code") {
    whatsappEngine.simulateSuccessfulConnection();
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
  if (whatsappEngine.status.status !== "connected" || !whatsappEngine.sock) {
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

    saveStateToFile();
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

  addLog("info", `🔍 [Varredura Solicitada] Iniciando varredura no grupo de origem "${groupName}"...`);

  try {
    const result = await whatsappEngine.scanTodayMessages(
      groupId, 
      async (text, imageBuffer) => {
        return await processIncomingMessage(groupName, text, imageBuffer);
      },
      state.config.robotActivationTime
    );
    
    // Save updated state since history/logs may have changed
    saveStateToFile();
    
    const finalMsg = result.detailMessage || (result.processedCount > 0 
      ? `Sucesso! ${result.processedCount} oferta(s) encaminhada(s).`
      : `Nenhuma oferta nova enviada.`);

    res.json({ success: true, message: finalMsg, ...result });
  } catch (err) {
    addLog("error", `Falha na varredura do grupo "${groupName}": ${(err as Error).message}`);
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
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // server.cjs resides in dist/, so __dirname is exactly the absolute path to dist/
    // Fall back to path.join(process.cwd(), 'dist') if running via tsx/ts-node in production mode directly.
    const distPath = fs.existsSync(path.join(__dirname, 'index.html')) 
      ? __dirname 
      : path.join(process.cwd(), 'dist');

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
