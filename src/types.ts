export interface AppConfig {
  affiliateId: string;
  autoPilot: boolean;
  autoPilotInterval: number;
  rewriteStyle: "excited" | "minimal" | "creative" | "direct";
  keywords: string;
  isTransmissionEnabled: boolean;
  shopeeAppKey?: string;
  shopeeAppSecret?: string;
  shopeeAffiliateId?: string;
  useShopeeApi?: boolean;
}

export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "qr_code" | "connected";
  phone: string;
  userName: string;
  qrCodeProgress: number;
  connectedAt: string | null;
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
}

export interface SandboxResult {
  hasShopeeLink: boolean;
  originalLink: string;
  affiliateLink?: string;
  productTitle: string;
  price?: string | null;
  coupon?: string | null;
  rewrittenMessage: string;
  imageUrl?: string;
}
