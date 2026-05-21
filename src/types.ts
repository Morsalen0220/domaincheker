export interface DomainInfo {
  domain: string;
  available: boolean;
  expiryDate?: string;
  createdDate?: string;
  registrar?: string;
  status?: string[];
  expiryDaysRemaining?: number;
  dnsRecords?: string[];
  nsRecords?: string[];
  isExpiringSoon?: boolean;
  isPendingDelete?: boolean;
  checkedAt: string;
  fallbackUsed?: boolean;
  error?: string;
  // UI helper state
  scanning?: boolean;
}

export interface WatchlistItem {
  domain: string;
  expiryDate?: string;
  registrar?: string;
  expiryDaysRemaining?: number;
  isExpiringSoon?: boolean;
  isPendingDelete?: boolean;
  lastCheckedAt: string;
  notes?: string;
}

export interface TelegramConfig {
  token: string;
  chatId: string;
  enabled: boolean;
}
