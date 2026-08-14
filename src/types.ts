export interface AppConfig {
  affiliateId: string;
  autoPilot: boolean;
  autoPilotInterval: number;
  rewriteStyle: "excited" | "minimal" | "creative" | "direct";
  keywords: string;
  isTransmissionEnabled: boolean;
  shopeeEnabled?: boolean;
  mercadolivreEnabled?: boolean;
  shopeeAppKey?: string;
  shopeeAppSecret?: string;
  shopeeAffiliateId?: string;
  mercadolivreAffiliateId?: string;
  useShopeeApi?: boolean;
  shortenAffiliateLinks?: boolean;
  customFooter?: string;
  quietStart?: string;
  quietEnd?: string;
}

export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "qr_code" | "connected";
  phone: string;
  userName: string;
  qrCodeProgress: number;
  connectedAt: string | null;
  qrDataUrl?: string;
  pairingCode?: string;
  pairingPhone?: string;
}

export interface GroupItem {
  id: string;
  name: string;
  active: boolean;
}

export interface GroupConfig {
  sources: GroupItem[];
  targets: GroupItem[];
}

export interface LogItem {
  time: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

export interface HistoryItem {
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
  storeType?: "shopee" | "mercadolivre" | "other";
}

export interface SandboxResult {
  hasShopeeLink: boolean;
  hasMercadoLivreLink?: boolean;
  storeType?: "shopee" | "mercadolivre" | "other";
  originalLink: string;
  affiliateLink?: string;
  productTitle: string;
  price?: string | null;
  coupon?: string | null;
  rewrittenMessage: string;
  imageUrl?: string;
}
