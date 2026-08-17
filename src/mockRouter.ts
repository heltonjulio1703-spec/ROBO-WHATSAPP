import { AppConfig, WhatsAppStatus, GroupConfig, LogItem, HistoryItem } from "./types";

// Save the original fetch
const originalFetch = window.fetch;

// Helper to write mock local storage states
const getLocalStorage = <T>(key: string, defaultValue: T): T => {
  const item = localStorage.getItem(key);
  if (!item) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
};

const setLocalStorage = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Default States
const defaultConfig: AppConfig = {
  affiliateId: "heltonjulio1703",
  autoPilot: true,
  autoPilotInterval: 30,
  rewriteStyle: "excited",
  keywords: "promocao, cupom, desconto, oferta, achado, frete gratis, shopee, shp.ee",
  isTransmissionEnabled: true,
};

const defaultWhatsapp: WhatsAppStatus = {
  status: "disconnected",
  phone: "",
  userName: "",
  qrCodeProgress: 0,
  connectedAt: null,
};

const defaultGroups: GroupConfig = {
  sources: [
    { id: "120363145678901234@g.us", name: "Grupo de Ofertas Fonte (Demonstração)", active: true },
    { id: "120363145678901235@g.us", name: "Cupom & Descontos Shopee (Demonstração)", active: true }
  ],
  targets: [
    { id: "120363145678901236@g.us", name: "Canal de Afiliados Destino (Demonstração)", active: true }
  ]
};

const defaultLogs: LogItem[] = [
  {
    time: new Date().toLocaleTimeString("pt-BR"),
    type: "info",
    message: "🤖 Sistema de Afiliados Shopee iniciado com sucesso."
  }
];

const defaultHistory: HistoryItem[] = [];

// Initialize local states with deep defaults to prevent undefined properties in case of stale localStorage
let configState = { ...defaultConfig, ...getLocalStorage<AppConfig>("shopee_bot_config", defaultConfig) };
if (configState.isTransmissionEnabled === undefined || configState.isTransmissionEnabled === null) {
  configState.isTransmissionEnabled = true;
}

let whatsappState = { ...defaultWhatsapp, ...getLocalStorage<WhatsAppStatus>("shopee_bot_whatsapp", defaultWhatsapp) };
let groupsState = { ...defaultGroups, ...getLocalStorage<GroupConfig>("shopee_bot_groups", defaultGroups) };
let logsState = getLocalStorage<LogItem[]>("shopee_bot_logs", defaultLogs);
let historyState = getLocalStorage<HistoryItem[]>("shopee_bot_history", defaultHistory);

// Global offline mode flag
declare global {
  interface Window {
    isOfflineMode: boolean;
  }
}
// Default to false so that real server endpoints are accessed by default.
window.isOfflineMode = false;

// Helper to append a simulated log entry
const addSimulatedLog = (type: "info" | "success" | "warning" | "error", message: string) => {
  const newLog: LogItem = {
    time: new Date().toLocaleTimeString("pt-BR"),
    type,
    message
  };
  logsState = [newLog, ...logsState].slice(0, 500);
  setLocalStorage("shopee_bot_logs", logsState);
};

// Check if actual backend is available on startup
const checkBackendAvailability = async () => {
  try {
    const res = await originalFetch("/api/config");
    const contentType = res.headers.get("content-type");
    if (res.ok && contentType && contentType.includes("application/json")) {
      console.log("🟢 API real detectada e conectada. Usando backend de produção.");
      window.isOfflineMode = false;
      window.dispatchEvent(new CustomEvent("backend-detected"));
    } else {
      console.warn("⚠️ API real não encontrada ou retornou 404. Ativando Modo de Demonstração 100% Client-Side.");
      window.isOfflineMode = true;
      addSimulatedLog("warning", "⚠️ [Vercel] Executando em ambiente estático. Modo de Conexão Simulada ativo.");
    }
  } catch (err) {
    console.warn("⚠️ Falha de rede para API local. Ativando Modo de Demonstração.", err);
    window.isOfflineMode = true;
  }
};

// Perform background check
checkBackendAvailability();

// Helper to make a mock JSON Response object
const createMockResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
};

// Intercept window.fetch using Object.defineProperty to bypass read-only/getter-only constraints on window.fetch
const customFetch = async function (this: any, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === "string" ? input : (input as any).url || String(input);
  
  // Only intercept /api/ requests if window.isOfflineMode is active
  if (window.isOfflineMode && urlStr.includes("/api/")) {
    const url = new URL(urlStr, window.location.origin);
    const pathname = url.pathname;
    const method = init?.method?.toUpperCase() || "GET";
    
    let bodyObj: any = {};
    if (init?.body) {
      try {
        if (typeof init.body === "string") {
          bodyObj = JSON.parse(init.body);
        }
      } catch (err) {
        console.warn("Failed to parse request body in mock fetch:", err);
      }
    }

    console.log(`[MOCK FETCH INTERCEPT] ${method} ${pathname}`, bodyObj);

    // GET /api/config
    if (pathname === "/api/config" && method === "GET") {
      return createMockResponse(configState);
    }

    // POST /api/config
    if (pathname === "/api/config" && method === "POST") {
      const prevTransmission = configState.isTransmissionEnabled;
      const prevAutoPilot = configState.autoPilot;

      configState = { ...configState, ...bodyObj };
      setLocalStorage("shopee_bot_config", configState);

      let historyCleared = false;
      if ((prevTransmission && !configState.isTransmissionEnabled) || (prevAutoPilot && !configState.autoPilot)) {
        historyState = [];
        setLocalStorage("shopee_bot_history", historyState);
        historyCleared = true;
        addSimulatedLog("info", "🧹 Histórico de envios limpo ao desligar o robô.");
      }

      addSimulatedLog("success", `Configurações salvas e preservadas com sucesso.`);
      return createMockResponse({ success: true, config: configState, historyCleared, history: historyState });
    }

    // GET /api/whatsapp/status
    if (pathname === "/api/whatsapp/status" && method === "GET") {
      return createMockResponse(whatsappState);
    }

    // POST /api/whatsapp/connect
    if (pathname === "/api/whatsapp/connect" && method === "POST") {
      const phoneNumber = bodyObj.phoneNumber;

      addSimulatedLog("info", "Iniciando conexão simulada do WhatsApp com servidores do WhatsApp Web...");

      if (phoneNumber) {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        const codeChars = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789";
        let code1 = "";
        let code2 = "";
        for (let i = 0; i < 4; i++) {
          code1 += codeChars.charAt(Math.floor(Math.random() * codeChars.length));
          code2 += codeChars.charAt(Math.floor(Math.random() * codeChars.length));
        }
        const simCode = `${code1}-${code2}`;
        whatsappState = {
          status: "qr_code",
          phone: "",
          userName: "",
          qrCodeProgress: 95,
          connectedAt: null,
          pairingPhone: cleanPhone,
          pairingCode: simCode,
        };
        addSimulatedLog("success", `🔑 [Vercel] Código de Emparelhamento oficial gerado com sucesso: ${simCode}`);
        addSimulatedLog("info", `Digite o código de pareamento no seu celular WhatsApp para o número +${cleanPhone}.`);
      } else {
        whatsappState = {
          status: "qr_code",
          phone: "",
          userName: "",
          qrCodeProgress: 95,
          connectedAt: null,
          qrDataUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://shopee.com.br/m/afiliados-shopee?utm_source=vercel_sim_${Date.now()}`,
        };
        addSimulatedLog("info", "QR Code simulado gerado com sucesso! Escaneie com o WhatsApp ou clique em 'Confirmar Leitura'.");
      }
      setLocalStorage("shopee_bot_whatsapp", whatsappState);

      return createMockResponse(whatsappState);
    }

    // POST /api/whatsapp/confirm-scan
    if (pathname === "/api/whatsapp/confirm-scan" && method === "POST") {
      const mockPhone = whatsappState.pairingPhone || "5511999998888";
      whatsappState = {
        status: "connected",
        phone: mockPhone,
        userName: "Canal de Ofertas Shopee Oficial",
        qrCodeProgress: 100,
        connectedAt: new Date().toLocaleString("pt-BR"),
      };
      setLocalStorage("shopee_bot_whatsapp", whatsappState);
      addSimulatedLog("success", `🟢 [Vercel] WhatsApp conectado com sucesso como +${mockPhone}!`);
      
      // Seed some realistic sources/targets if empty
      if (groupsState.sources.length === 0 || !groupsState.sources.some(g => g.id.endsWith("@g.us"))) {
        groupsState = {
          sources: [
            { id: "120363112233445566@g.us", name: "Shopee Achados Promocionais", active: true },
            { id: "120363998877665544@g.us", name: "Grupo de Cupons & Descontos Diários", active: true },
            { id: "120363145678901234@g.us", name: "Grupo de Ofertas Fonte (Demonstração)", active: true }
          ],
          targets: [
            { id: "120363445566778899@g.us", name: "Meu Canal de Promoções Destino", active: true }
          ]
        };
        setLocalStorage("shopee_bot_groups", groupsState);
        addSimulatedLog("info", "Grupos oficiais do WhatsApp carregados e sincronizados.");
      }

      return createMockResponse(whatsappState);
    }

    // POST /api/whatsapp/disconnect
    if (pathname === "/api/whatsapp/disconnect" && method === "POST") {
      whatsappState = {
        status: "disconnected",
        phone: "",
        userName: "",
        qrCodeProgress: 0,
        connectedAt: null,
      };
      setLocalStorage("shopee_bot_whatsapp", whatsappState);
      
      // Clear whatsapp groups but keep demo ones
      groupsState = defaultGroups;
      setLocalStorage("shopee_bot_groups", groupsState);
      
      historyState = [];
      setLocalStorage("shopee_bot_history", historyState);
      
      addSimulatedLog("info", "WhatsApp desconectado. Sessão limpa e grupos de monitoramento redefinidos.");
      return createMockResponse(whatsappState);
    }

    // GET /api/groups
    if (pathname === "/api/groups" && method === "GET") {
      return createMockResponse(groupsState);
    }

    // POST /api/groups
    if (pathname === "/api/groups" && method === "POST") {
      groupsState = bodyObj;
      setLocalStorage("shopee_bot_groups", groupsState);
      addSimulatedLog("success", "Grupos de monitoramento salvos e sincronizados com sucesso.");
      return createMockResponse({ success: true, groups: groupsState });
    }

    // GET /api/logs
    if (pathname === "/api/logs" && method === "GET") {
      return createMockResponse(logsState);
    }

    // POST /api/logs/clear
    if (pathname === "/api/logs/clear" && method === "POST") {
      logsState = [];
      setLocalStorage("shopee_bot_logs", logsState);
      addSimulatedLog("info", "Painel de logs limpo.");
      return createMockResponse({ success: true });
    }

    // GET /api/history
    if (pathname === "/api/history" && method === "GET") {
      return createMockResponse(historyState);
    }

    // POST /api/history/clear
    if (pathname === "/api/history/clear" && method === "POST") {
      historyState = [];
      setLocalStorage("shopee_bot_history", historyState);
      addSimulatedLog("info", "Histórico de envios limpo.");
      return createMockResponse({ success: true });
    }

    // POST /api/transmission/toggle
    if (pathname === "/api/transmission/toggle" && method === "POST") {
      configState.isTransmissionEnabled = !configState.isTransmissionEnabled;
      setLocalStorage("shopee_bot_config", configState);

      let historyCleared = false;
      if (!configState.isTransmissionEnabled) {
        historyState = [];
        setLocalStorage("shopee_bot_history", historyState);
        historyCleared = true;
        addSimulatedLog("info", "⏸️ Robô de transmissão desativado. Histórico de envios limpo.");
      } else {
        addSimulatedLog("info", "▶️ Robô de transmissão ativado!");
      }

      return createMockResponse({ 
        success: true, 
        isTransmissionEnabled: configState.isTransmissionEnabled,
        historyCleared,
        history: historyState
      });
    }

    // POST /api/shopee/test
    if (pathname === "/api/shopee/test" && method === "POST") {
      addSimulatedLog("success", "🔌 [Simulado] Credenciais da API da Shopee verificadas e ativas com sucesso!");
      return createMockResponse({ success: true });
    }

    // POST /api/whatsapp/sync-groups
    if (pathname === "/api/whatsapp/sync-groups" && method === "POST") {
      return createMockResponse({ success: true, groups: groupsState });
    }

    // POST /api/whatsapp/scan-today
    if (pathname === "/api/whatsapp/scan-today" && method === "POST") {
      const groupId = bodyObj.groupId;
      const targetGroup = groupsState.sources.find(s => s.id === groupId);
      const groupName = targetGroup ? targetGroup.name : "Grupo de Origem";

      addSimulatedLog("info", `🔍 [Varredura Solicitada] Iniciando varredura no grupo de origem "${groupName}"...`);

      if (!configState.isTransmissionEnabled) {
        addSimulatedLog("warning", "⏸️ Transmissão pausada: O robô está desligado.");
        return createMockResponse({ 
          success: false, 
          message: "O robô de transmissão está desativado. Ative o robô no cabeçalho antes de realizar uma varredura." 
        });
      }

      // Return simulated scan stats
      const activeTargets = groupsState.targets.filter(t => t.active);
      const targetNames = activeTargets.map(t => t.name);

      const dealTitle = "Fone de Ouvido Bluetooth JBL Wave Flex";
      const orgLink = "https://shopee.com.br/product-123";
      const affId = configState.affiliateId || "heltonjulio1703";
      const affLink = `https://shopee.com.br/m/afiliados-shopee?sub_id=${affId}&product_id=jbl_wave`;

      let rewrittenText = `🔥 **${dealTitle.toUpperCase()}** 🔥\n\n`;
      rewrittenText += `A JBL Wave Flex é o fone que você procurava! Resistente à água, design super leve e bateria de até 32h para curtir o dia todo! 😍\n\n👉 Compre no link seguro: ${affLink}\n\nGaranta frete grátis usando os cupons oficiais da Shopee!`;

      const newItem: HistoryItem = {
        id: "deal_" + Math.random().toString(36).substring(2, 11),
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        sourceGroup: groupName,
        targetGroups: targetNames,
        productTitle: dealTitle,
        originalLink: orgLink,
        affiliateLink: affLink,
        originalMessage: "Olha que fone incrível galera: https://shopee.com.br/product-123 fone de ouvido jbl wave flex muito top, corre!",
        rewrittenMessage: rewrittenText,
        status: activeTargets.length > 0 ? "success" : "failed",
        imageUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&auto=format&fit=crop&q=60"
      };

      if (activeTargets.length > 0) {
        historyState = [newItem, ...historyState].slice(0, 200);
        setLocalStorage("shopee_bot_history", historyState);
        addSimulatedLog("success", `✨ [Simulado] Varredura manual converteu link com sucesso: ${dealTitle}`);
        targetNames.forEach(tName => {
          addSimulatedLog("success", `✨ Anúncio encaminhado para "${tName}" (Simulado): ${dealTitle}`);
        });
      }

      return createMockResponse({
        success: true,
        processedCount: activeTargets.length > 0 ? 1 : 0,
        totalFound: 1,
        messageCount: 12,
        message: activeTargets.length > 0 
          ? "Sucesso! 1 oferta convertida e reencaminhada para o seu canal." 
          : "Nenhum grupo de destino ativo para enviar a oferta encontrada."
      });
    }

    // POST /api/links/validate
    if (pathname === "/api/links/validate" && method === "POST") {
      const testUrl = bodyObj.url || "";
      const isMl = /mercadolivre|mercadolibre|ml\.com\.br|meli\.li|meli\.la|sec\.mercadolivre/i.test(testUrl);
      const isShp = /shopee|shp\.ee|shope\.ee|s\.shopee|a\.shopee/i.test(testUrl);

      if (!isMl && !isShp) {
        return createMockResponse({
          success: false,
          error: "O link informado não é reconhecido como sendo do Mercado Livre ou da Shopee.",
        }, 400);
      }

      const affId = (isMl ? (bodyObj.affiliateId || configState.mercadolivreAffiliateId || configState.affiliateId) : (bodyObj.affiliateId || configState.shopeeAffiliateId || configState.affiliateId)) || "heltonjulio1703";
      let convertedAffiliate = "";
      let resolvedUrl = testUrl.split("?")[0].split("#")[0];

      if (isMl) {
        if (testUrl.includes("2S5rJzD")) {
          resolvedUrl = "https://produto.mercadolivre.com.br/MLB-1231146019-kit-10-pares-de-meias-lupo-soquete-invisivel-sport-_JM";
        } else if (testUrl.includes("15zvKPc") || testUrl.includes("meli.la") || testUrl.includes("meli.li")) {
          resolvedUrl = "https://www.mercadolivre.com.br/mesa-tabua-de-passar-roupa-slim-dobravel/p/MLB64578882";
        }
        const isCustomTag = isNaN(Number(affId));
        if (isCustomTag) {
          convertedAffiliate = `${resolvedUrl}?matt_word=${encodeURIComponent(affId)}&matt_tool=37552149&forceInApp=true`;
        } else {
          convertedAffiliate = `${resolvedUrl}?matt_tool=${encodeURIComponent(affId)}&matt_word=bot&forceInApp=true`;
        }
      } else {
        const shpModel = configState.shopeeLinkModel || "shopee_short";
        const shpShort = configState.shopeeShortLink || "https://s.shopee.com.br/3VjU9xABK7";
        if (shpModel === "shopee_short" && shpShort.startsWith("http")) {
          convertedAffiliate = shpShort;
        } else if (shpModel === "direct") {
          convertedAffiliate = `${resolvedUrl}?utm_source=an_affiliate&utm_medium=affiliates&utm_content=bot&utm_term=${encodeURIComponent(affId)}`;
        } else {
          convertedAffiliate = `https://shopee.com.br/universal-link?utm_source=an_affiliate&utm_medium=affiliates&utm_campaign=-&utm_content=bot&utm_term=${encodeURIComponent(affId)}&url=${encodeURIComponent(resolvedUrl)}`;
        }
      }

      return createMockResponse({
        success: true,
        store: isMl ? "mercadolivre" : "shopee",
        storeLabel: isMl ? "Mercado Livre" : "Shopee",
        originalUrl: testUrl,
        resolvedUrl,
        affiliateLink: convertedAffiliate,
        imageUrl: isMl 
          ? "https://http2.mlstatic.com/D_NQ_NP_2X_746838-MLB64578882_102024-F.webp" 
          : "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
        hasHighResImage: true,
        isValid: true,
        affiliateIdUsed: affId,
      });
    }

    // POST /api/simulation/incoming
    if (pathname === "/api/simulation/incoming" && method === "POST") {
      const sourceGroupId = bodyObj.sourceGroupId;
      const messageText = bodyObj.messageText;

      const sourceGroup = groupsState.sources.find(s => s.id === sourceGroupId);
      const sourceGroupName = sourceGroup ? sourceGroup.name : "Grupo de Ofertas Fonte (MOCK)";

      addSimulatedLog("info", `Nova mensagem em "${sourceGroupName}": Analisando anúncio...`);

      if (!configState.isTransmissionEnabled) {
        addSimulatedLog("warning", `⏸️ Transmissão pausada: Mensagem de "${sourceGroupName}" ignorada pois o robô está desligado.`);
        return createMockResponse({ success: false, error: "Robô desligado" }, 400);
      }

      // Extract a mock link and determine storeType
      const dealLinkMatch = messageText.match(/(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|shp\.ee|shope\.ee|s\.shopee\.[a-z]{2,3}(?:\.[a-z]{2})?|a\.shopee\.[a-z]{2,3}|mercadolivre\.com(?:\.br)?|mercadolibre\.com(?:\.[a-z]{2})?|ml\.com\.br|meli\.li|meli\.la|sec\.mercadolivre\.com(?:\.br)?|sec\.mercadolibre\.com(?:\.[a-z]{2})?|produto\.mercadolivre\.com\.br|lista\.mercadolivre\.com\.br|oferta\.mercadolivre\.com\.br)[^\s]+)/i);
      const originalLink = dealLinkMatch ? dealLinkMatch[0] : "https://shopee.com.br/product-mock";
      
      const isMl = /mercadolivre|mercadolibre|ml\.com\.br|meli\.li|meli\.la|sec\.mercadolivre/i.test(originalLink);

      if (isMl && configState.mercadolivreEnabled === false) {
        return createMockResponse({ success: false, error: "Plataforma Mercado Livre está desativada nas configurações" }, 400);
      }
      if (!isMl && configState.shopeeEnabled === false) {
        return createMockResponse({ success: false, error: "Plataforma Shopee está desativada nas configurações" }, 400);
      }

      const storeType: "shopee" | "mercadolivre" = isMl ? "mercadolivre" : "shopee";
      const storeLabel = isMl ? "Mercado Livre 💛" : "Shopee 🧡";

      const affId = (isMl ? (configState.mercadolivreAffiliateId || configState.affiliateId) : (configState.shopeeAffiliateId || configState.affiliateId)) || "is20251020221720";
      
      let affiliateLink = "";
      if (isMl) {
        let cleanBase = originalLink.split("?")[0].replace(/[.,;:!?)\]\>\<\'\"\,]+$/, "");
        if (cleanBase.includes("/social/")) {
          cleanBase = cleanBase.replace(/\/social\/[a-zA-Z0-9_.-]+/i, `/social/${affId}`);
        }
        affiliateLink = `${cleanBase}?matt_tool=${encodeURIComponent(affId)}&matt_word=bot`;
      } else {
        affiliateLink = `https://shopee.com.br/universal-link?utm_source=an_affiliate&utm_medium=affiliates&utm_campaign=-&utm_content=bot&utm_term=${encodeURIComponent(affId)}&url=${encodeURIComponent(originalLink)}`;
      }

      let productTitle = isMl ? "Super Oferta Mercado Livre" : "Super Oferta Relâmpago Shopee";
      if (messageText.toLowerCase().includes("fone")) {
        productTitle = "Fone de Ouvido Sem Fio TWS Air";
      } else if (messageText.toLowerCase().includes("relogio") || messageText.toLowerCase().includes("smartwatch")) {
        productTitle = "Smartwatch Inteligente Bluetooth Esportivo";
      } else if (messageText.toLowerCase().includes("luminaria") || messageText.toLowerCase().includes("led")) {
        productTitle = "Luminária de Mesa LED Flexível Recarregável";
      }

      let rewrittenText = `🔥 **${productTitle.toUpperCase()}** 🔥\n\n`;
      if (configState.rewriteStyle === "excited") {
        rewrittenText += isMl 
          ? `😱 GALERA, OLHA ESSA OFERTA NO MERCADO LIVRE! Entrega super rápida e preço lá embaixo!\n\n👉 Garanta o seu no link seguro: ${affiliateLink}\n\n⚠️ Estoque limitado!`
          : `😱 MENINAS, OLHA ESSA PROMOÇÃO INCRÍVEL! É sério, tá muito barato!\n\n👉 Aproveita o cupom e garante o seu aqui: ${affiliateLink}\n\n⚠️ Corre antes que o estoque acabe!`;
      } else if (configState.rewriteStyle === "minimal") {
        rewrittenText += `${productTitle} em oferta exclusiva!\n\n👉 Link seguro com menor preço: ${affiliateLink}`;
      } else if (configState.rewriteStyle === "direct") {
        rewrittenText += `ACHADO IMPERDÍVEL ${isMl ? "MERCADO LIVRE" : "SHOPEE"}!\n\n🛍️ ${productTitle}\n\n🛒 Acesse agora: ${affiliateLink}`;
      } else {
        rewrittenText += `Separamos o melhor achado do dia para você:\n${productTitle}.\n\n👉 Link seguro para compra: ${affiliateLink}`;
      }

      const activeTargets = groupsState.targets.filter(t => t.active);
      const targetNames = activeTargets.map(t => t.name);

      const mockImage = messageText.toLowerCase().includes("fone")
        ? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60"
        : messageText.toLowerCase().includes("relogio")
          ? "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60"
          : "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=500&auto=format&fit=crop&q=60";

      const historyItem: HistoryItem = {
        id: "deal_" + Math.random().toString(36).substring(2, 11),
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        sourceGroup: sourceGroupName,
        targetGroups: targetNames,
        productTitle,
        originalLink,
        affiliateLink,
        originalMessage: messageText,
        rewrittenMessage: rewrittenText,
        status: activeTargets.length > 0 ? "success" : "failed",
        imageUrl: mockImage,
        storeType,
      };

      if (activeTargets.length > 0) {
        historyState = [historyItem, ...historyState].slice(0, 200);
        setLocalStorage("shopee_bot_history", historyState);
        addSimulatedLog("success", `✨ [Simulado] Anúncio [${storeLabel}] convertido com sucesso: ${productTitle}`);
        targetNames.forEach(tName => {
          addSimulatedLog("success", `✨ [${storeLabel}] Anúncio encaminhado para "${tName}" (Simulado): ${productTitle}`);
        });
      } else {
        addSimulatedLog("warning", "Anúncio convertido, mas nenhum grupo de destino está ativo para receber a postagem.");
      }

      return createMockResponse(historyItem);
    }
  }

  // Fallback to real fetch
  return originalFetch.apply(this || window, [input, init]);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    writable: true,
    configurable: true
  });
} catch (e) {
  console.warn("Could not redefine window.fetch via Object.defineProperty. Trying direct assignment fallback...", e);
  try {
    (window as any).fetch = customFetch;
  } catch (err) {
    console.error("Direct assignment to window.fetch also failed:", err);
  }
}

