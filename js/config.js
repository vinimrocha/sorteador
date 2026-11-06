/* Configurações e Inicialização do Cliente Supabase */

export const SUPABASE_URL = 'https://maqdmlsouqmadoaayrcv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcWRtbHNvdXFtYWRvYWF5cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NjQ2ODMsImV4cCI6MjEwNDE0MDY4M30.QTLO0en8WYvsdPMdkKuNUefSk8N1w72-B89a-4beRFM';
export const SYSTEM_LOGO = 'sorteador-logo.png';
export const LIMITE_JOGADORES = 150;

export const supabaseClient = (typeof window !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (typeof window !== 'undefined') {
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    if (supabaseClient) window.supabaseClient = supabaseClient;
}
