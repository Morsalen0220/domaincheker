import express from 'express';
import path from 'path';
import dns from 'dns';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Supabase Configuration - only initialized if environment keys are supplied and valid
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

let supabaseClient: any = null;
const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('sb_publishable_'));

try {
  if (isSupabaseConfigured) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    });
  }
} catch (err) {
  console.error('Supabase Initialization Error:', err);
}

// Lazy initializer for Gemini
let aiInstance: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the Secrets / Environment.');
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

// Normalize domain names
function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  // Strip protocol and www
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  // Strip paths or query parameters
  domain = domain.split('/')[0];
  // Basic domain format validation
  if (/^[a-z0-9]+[a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(domain)) {
    return domain;
  }
  return '';
}

// Perform DNS check
async function checkDns(domain: string): Promise<{ resolved: boolean; ip?: string; ns?: string[] }> {
  try {
    const lookupPromise = dns.promises.lookup(domain)
      .then(r => ({ resolved: true, ip: r.address }))
      .catch(() => ({ resolved: false, ip: undefined }));

    const nsPromise = dns.promises.resolveNs(domain)
      .then(ns => ({ ns }))
      .catch(() => ({ ns: [] as string[] }));

    const [lookupRes, nsRes] = await Promise.all([lookupPromise, nsPromise]);
    
    return {
      resolved: lookupRes.resolved || nsRes.ns.length > 0,
      ip: lookupRes.ip,
      ns: nsRes.ns,
    };
  } catch {
    return { resolved: false };
  }
}

// Expiry difference calculator
function calculateDaysRemaining(expiryString?: string): number | undefined {
  if (!expiryString) return undefined;
  const now = new Date();
  const expiry = new Date(expiryString);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Core Lookup Logic (DNS + RDAP modern WHOIS protocol)
async function lookupDomain(rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  const checkedAt = new Date().toISOString();

  if (!domain) {
    return {
      domain: rawDomain,
      available: false,
      error: 'Invalid domain name format',
      checkedAt,
    };
  }

  // 1. Trigger concurrent DNS Check
  const dnsInfo = await checkDns(domain);

  // 2. Fetch RDAP (JSON metadata WHOIS spec)
  // We use rdap.org as a helpful bootstrap redirect registry or custom TLD queries
  let available = false;
  let rdapData: any = null;
  let registrar = 'Unknown Registrar';
  let expiryDate: string | undefined = undefined;
  let createdDate: string | undefined = undefined;
  let statusList: string[] = [];
  let isPendingDelete = false;

  try {
    // Timeout of 4 seconds for RDAP
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const rdapResponse = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/rdap+json, application/json' },
    });
    
    clearTimeout(timeoutId);

    if (rdapResponse.status === 404) {
      available = true;
    } else if (rdapResponse.ok) {
      rdapData = await rdapResponse.json();
    }
  } catch (error) {
    // If RDAP fails (e.g. timeout, rate limit, unsupported TLD bootstrap),
    // we fall back onto DNS evidence
  }

  // Parse RDAP data if retrieved
  if (rdapData) {
    available = false; // RDAP answered, hence registered

    // Parse Expiry & Created Events
    if (rdapData.events && Array.isArray(rdapData.events)) {
      const expEvent = rdapData.events.find((e: any) => e.eventAction === 'expiration');
      if (expEvent) expiryDate = expEvent.eventDate;

      const regEvent = rdapData.events.find((e: any) => e.eventAction === 'registration');
      if (regEvent) createdDate = regEvent.eventDate;
    }

    // Parse Status
    if (rdapData.status && Array.isArray(rdapData.status)) {
      statusList = rdapData.status;
      isPendingDelete = statusList.some((s: string) => 
        /pending.*delete/i.test(s) || /redemption/i.test(s)
      );
    }

    // Parse Registrar details
    if (rdapData.entities && Array.isArray(rdapData.entities)) {
      const registrarEntity = rdapData.entities.find((e: any) => 
        e.roles && e.roles.includes('registrar')
      );
      if (registrarEntity && registrarEntity.vcardArray && Array.isArray(registrarEntity.vcardArray)) {
        const vcardProperties = registrarEntity.vcardArray[1];
        if (Array.isArray(vcardProperties)) {
          const fnProperty = vcardProperties.find((prop: any) => Array.isArray(prop) && prop[0] === 'fn');
          if (fnProperty && fnProperty[3]) {
            registrar = fnProperty[3];
          }
        }
      }
    }
  } else {
    // Fallback: If DNS resolved NS/IP, then domain is definitely registered/not available
    if (dnsInfo.resolved) {
      available = false;
    } else {
      // If DNS has failed AND RDAP failed or returned nothing, let's treat it as likely available
      // but clearly tag it so the user knows
      available = !dnsInfo.resolved;
    }
  }

  const daysRemaining = calculateDaysRemaining(expiryDate);
  const isExpiringSoon = daysRemaining !== undefined && daysRemaining <= 30 && daysRemaining > 0;

  return {
    domain,
    available,
    expiryDate,
    createdDate,
    registrar,
    status: statusList.length > 0 ? statusList : (dnsInfo.resolved ? ['active'] : []),
    expiryDaysRemaining: daysRemaining,
    dnsRecords: dnsInfo.ip ? [`A Record: ${dnsInfo.ip}`] : [],
    nsRecords: dnsInfo.ns || [],
    isExpiringSoon,
    isPendingDelete,
    checkedAt,
    fallbackUsed: !rdapData,
  };
}

// ---------------- SUPABASE CONFIG & OPERATIONS ----------------
app.get('/api/supabase/config', (req, res) => {
  res.json({
    enabled: !!supabaseClient,
    url: SUPABASE_URL || 'Not Configured',
    keyMasked: SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 8 ? `${SUPABASE_ANON_KEY.substring(0, 8)}...${SUPABASE_ANON_KEY.substring(SUPABASE_ANON_KEY.length - 8)}` : 'None'
  });
});

// GET watchlist items
app.get('/api/supabase/watchlist', async (req, res) => {
  if (!supabaseClient) {
    return res.status(400).json({ error: 'Supabase client is not initialized.' });
  }
  try {
    const { data, error } = await supabaseClient
      .from('domain_watchlist')
      .select('*')
      .order('domain', { ascending: true });

    if (error) {
      if (error.message && error.message.includes('relation "public.domain_watchlist" does not exist')) {
        return res.json({ tableMissing: true, error: error.message });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json({ data: data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching watchlist from Supabase' });
  }
});

// UPSERT watchlist item
app.post('/api/supabase/watchlist', async (req, res) => {
  if (!supabaseClient) {
    return res.status(400).json({ error: 'Supabase client is not initialized.' });
  }
  const { watchlist_item } = req.body;
  if (!watchlist_item || !watchlist_item.domain) {
    return res.status(400).json({ error: 'watchlist_item with valid domain is required' });
  }

  try {
    const payload = {
      domain: watchlist_item.domain,
      expiry_date: watchlist_item.expiryDate || null,
      registrar: watchlist_item.registrar || null,
      expiry_days_remaining: watchlist_item.expiryDaysRemaining !== undefined ? watchlist_item.expiryDaysRemaining : null,
      is_expiring_soon: !!watchlist_item.isExpiringSoon,
      is_pending_delete: !!watchlist_item.isPendingDelete,
      last_checked_at: watchlist_item.lastCheckedAt || new Date().toISOString(),
      notes: watchlist_item.notes || ''
    };

    const { data, error } = await supabaseClient
      .from('domain_watchlist')
      .upsert(payload, { onConflict: 'domain' })
      .select();

    if (error) {
      if (error.message && error.message.includes('relation "public.domain_watchlist" does not exist')) {
        return res.status(404).json({ tableMissing: true, error: error.message });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error saving to Supabase' });
  }
});

// DELETE watchlist item
app.delete('/api/supabase/watchlist', async (req, res) => {
  if (!supabaseClient) {
    return res.status(400).json({ error: 'Supabase client is not configured.' });
  }
  const { domain } = req.body;
  if (!domain) {
    return res.status(400).json({ error: 'domain is required for deletion' });
  }

  try {
    const { error } = await supabaseClient
      .from('domain_watchlist')
      .delete()
      .eq('domain', domain);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error deleting from Supabase' });
  }
});

// API endpoint for health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Single Domain Lookup
app.post('/api/lookup', async (req, res) => {
  const { domain } = req.body;
  if (!domain) {
    return res.status(400).json({ error: 'Domain name is required' });
  }
  try {
    const result = await lookupDomain(domain);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error performing lookup' });
  }
});

// Bulk Domain Lookup (Supports Concurrency Control)
app.post('/api/bulk-lookup', async (req, res) => {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains)) {
    return res.status(400).json({ error: 'Domains must be a string array' });
  }

  const normalizedList = domains
    .map(d => d.trim())
    .filter(d => d.length > 0);

  if (normalizedList.length === 0) {
    return res.json({ results: [] });
  }

  // Set standard concurrency limit to prevent overwhelming downstream RDAP endpoints
  const concurrencyLimit = 5;
  const results: any[] = [];
  const queue = [...normalizedList];

  const workers = Array(Math.min(concurrencyLimit, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          try {
            const res = await lookupDomain(item);
            results.push(res);
          } catch {
            results.push({
              domain: item,
              available: false,
              error: 'Verification error',
              checkedAt: new Date().toISOString()
            });
          }
        }
      }
    });

  await Promise.all(workers);
  
  // Return in original order or aggregated
  return res.json({ results });
});

// AI Analyze (Branding feedback, suggested names, registration assistance via Gemini 3.5 Flash)
app.post('/api/ai-analyze', async (req, res) => {
  const { domain, isAvailable } = req.body;
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }

  try {
    const gemini = getGemini();
    const prompt = isAvailable
      ? `You are an expert domain name analyst and branding consultant.
The domain "${domain}" is currently AVAILABLE!
Provide:
1. Brandability score (out of 10) and explanation (SEO, memorability, spelling).
2. Recommended business niches that fit this domain name perfectly.
3. 5 similar available alternatives with different extensions (.com, .io, .co, .net, .app, .ai).
Keep the format elegant, structural, and return it. Under no circumstances should you add any technical log metadata.`
      : `You are an expert domain name analyst and branding consultant.
The domain "${domain}" is registered (NOT AVAILABLE).
Provide:
1. 8 premium, catchy, creative variations or brand name ideas that are likely available. Mix extensions like (.com, .io, .co, .ai, .app, .dev).
2. Quick branding or phonetic suggestion on why these variations are powerful.
Keep the format elegant and structured. Under no circumstances should you add any technical log metadata.`;

    const response = await gemini.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return res.json({ suggestion: response.text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gemini AI analysis failed' });
  }
});

// Telegram Alert Tester
app.post('/api/alert-test', async (req, res) => {
  const { token, chatId, domain, days, status } = req.body;
  if (!token || !chatId) {
    return res.status(400).json({ error: 'Token and Chat ID are required' });
  }

  const textMessage = domain 
    ? `🚨 *Domain Expiry Alert!*
🌐 *Domain:* \`${domain}\`
⚠️ *Status:* ${status || 'Expiring Soon'}
📅 *Time Left:* ${days} Days remaining!
Please renew immediately! 🔍`
    : `🔔 *Domain Monitor Alert system connection successful!*
Your configuration is active. You will receive alerts here.`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: textMessage,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();
    if (data.ok) {
      return res.json({ success: true, message: 'Message successfully sent to Telegram!' });
    } else {
      return res.status(400).json({ error: data.description || 'Telegram API returned an error' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Network error connecting to Telegram' });
  }
});

// Global Error Handler for diagnostic feedback
app.use((err: any, req: any, res: any, next: any) => {
  console.error('EXPRESS SERVER ERROR:', err);
  res.status(500).json({
    error: 'Internal Server Error detected by Express',
    message: err.message || String(err),
    stack: err.stack || null,
  });
});

// Start listening or attach Vite Dev environment
async function start() {
  if (process.env.VERCEL) {
    // Under Vercel's serverless runtime, static assets are served instantly by Vercel CDN,
    // and Express acts clean and light only as an API router handler.
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

start();

export default app;
