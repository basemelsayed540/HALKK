// zone-users: lets the HALKK admin page create / edit / delete / disable the Zone login accounts.
// Protected by a secret (ZONE_ADMIN_SECRET) that only the owner knows. It can only touch accounts it created itself
// (app_metadata.managed_by = 'halkk'), so existing Zone accounts can never be changed or deleted through it.
//
// NOTE: this function is deployed on the Zone Supabase project (zffdvylqltdktnjmwiaa), not on the HALKK project.
// Deploy with verify_jwt = false (it does its own authentication with the secret).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://basemelsayed540.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const MANAGED = 'halkk';

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

const fails = new Map<string, { n: number; t: number }>();
function tooMany(ip: string) {
  const f = fails.get(ip);
  return !!f && Date.now() - f.t < 10 * 60 * 1000 && f.n >= 5;
}
function noteFail(ip: string) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.t > 10 * 60 * 1000) fails.set(ip, { n: 1, t: Date.now() });
  else { f.n++; f.t = Date.now(); }
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  const secret = Deno.env.get('ZONE_ADMIN_SECRET') || '';
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret || !url || !key) return json(req, 500, { error: 'الخدمة غير مهيأة بعد (ZONE_ADMIN_SECRET غير مضبوط)' });

  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  if (tooMany(ip)) return json(req, 429, { error: 'محاولات كتير غلط. استنى شوية وجرب تاني.' });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json(req, 400, { error: 'طلب غير صالح' }); }

  if (!safeEqual(String(b.secret || ''), secret)) {
    noteFail(ip);
    await new Promise((r) => setTimeout(r, 600));
    return json(req, 401, { error: 'كلمة سر إدارة zone غير صحيحة' });
  }

  const action = String(b.action || '');
  if (action === 'ping') return json(req, 200, { ok: true });

  const email = String(b.email || '').trim().toLowerCase();
  const oldEmail = String(b.oldEmail || '').trim().toLowerCase();
  const password = b.password == null ? '' : String(b.password);
  if (!emailOk(email)) return json(req, 400, { error: 'الإيميل غير صحيح' });
  if (password && password.length < 6) return json(req, 400, { error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' });

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  async function find(mail: string) {
    if (!mail) return null;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email || '').toLowerCase() === mail);
      if (hit) return hit;
      if (data.users.length < 1000) break;
    }
    return null;
  }
  const managed = (u: { app_metadata?: Record<string, unknown> } | null) => !!u && u.app_metadata?.managed_by === MANAGED;
  const BAN = '876000h';

  try {
    if (action === 'upsert') {
      const active = b.active !== false;
      const cur = await find(oldEmail || email);
      if (cur) {
        if (!managed(cur)) return json(req, 403, { error: 'ده حساب zone قديم مش مدار من HALKK، ما ينفعش يتعدّل من هنا' });
        const patch: Record<string, unknown> = { ban_duration: active ? 'none' : BAN };
        if ((cur.email || '').toLowerCase() !== email) {
          const other = await find(email);
          if (other && other.id !== cur.id) return json(req, 409, { error: 'الإيميل ده مستخدم في حساب zone تاني' });
          patch.email = email; patch.email_confirm = true;
        }
        if (password) patch.password = password;
        const { error } = await sb.auth.admin.updateUserById(cur.id, patch);
        if (error) throw error;
        return json(req, 200, { ok: true, created: false });
      }
      if (!password) return json(req, 400, { error: 'كلمة المرور مطلوبة لإنشاء حساب zone' });
      const other = await find(email);
      if (other) return json(req, 409, { error: managed(other) ? 'حساب zone بالإيميل ده موجود بالفعل' : 'الإيميل ده مستخدم في حساب zone قديم' });
      const { error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true, app_metadata: { managed_by: MANAGED },
        ...(active ? {} : { ban_duration: BAN }),
      });
      if (error) throw error;
      return json(req, 200, { ok: true, created: true });
    }

    if (action === 'setActive') {
      const cur = await find(email);
      if (!cur) return json(req, 200, { ok: true, missing: true });
      if (!managed(cur)) return json(req, 403, { error: 'ده حساب zone قديم مش مدار من HALKK' });
      const { error } = await sb.auth.admin.updateUserById(cur.id, { ban_duration: b.active === false ? BAN : 'none' });
      if (error) throw error;
      return json(req, 200, { ok: true });
    }

    if (action === 'delete') {
      const cur = await find(email);
      if (!cur) return json(req, 200, { ok: true, missing: true });
      if (!managed(cur)) return json(req, 403, { error: 'ده حساب zone قديم مش مدار من HALKK، ما ينفعش يتحذف من هنا' });
      const { error } = await sb.auth.admin.deleteUser(cur.id);
      if (error) throw error;
      return json(req, 200, { ok: true });
    }

    return json(req, 400, { error: 'إجراء غير معروف' });
  } catch (e) {
    console.error('zone-users error', e);
    return json(req, 500, { error: (e as Error)?.message || 'خطأ داخلي' });
  }
});
