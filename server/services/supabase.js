/* =============================================================================
   MERAKI — Serviço Supabase (cliente singleton)
   ============================================================================= */

const { createClient } = require('@supabase/supabase-js');

// Cliente público (usa anon key — respeita RLS do Supabase)
const supabase = createClient(
    process.env.SUPABASE_URL     || '',
    process.env.SUPABASE_ANON_KEY || ''
);

// Cliente admin (usa service role — bypass de RLS, apenas no backend)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL              || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY  || ''
);

module.exports = { supabase, supabaseAdmin };
