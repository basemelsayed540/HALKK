const _salt = '__supa__';
const _enc = function(s) {
    // UTF-8 لدعم العربية وأي يونيكود (btoa الأصلي يدعم Latin-1 فقط فيفشل مع العربية)
    try {
        var bin = '';
        new TextEncoder().encode(_salt + s).forEach(function(b) { bin += String.fromCharCode(b); });
        return btoa(bin);
    } catch (e) {
        return btoa(_salt + s); // Fallback للمتصفحات القديمة جداً بلا TextEncoder (نصوص ASCII فقط)
    }
};
const _dec = function(s) {
    try {
        var bin = atob(s);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
        var decoded = new TextDecoder('utf-8').decode(bytes);
        return decoded.indexOf(_salt) === 0 ? decoded.slice(_salt.length) : decoded;
    } catch (e) {
        return s; // بيانات تالفة/غير صحيحة => إرجاع القيمة كما هي (Fallback آمن، لا شاشة بيضاء)
    }
};

const _b64 = {
    URL: 'aHR0cHM6Ly9pb2R5b2hzc290dHRtYnJhcGdiay5zdXBhYmFzZS5jby8=',
    KEY: 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW1sdlpIbHZhSE56YjNSMGRHMWljbUZ3WjJKcklpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT0RReU1EUTBOVFVzSW1WNGNDSTZNakE1T1RjNE1EUTFOWDAuU2huTzY1MVQzYlplb3Y4NnIxWHN5bVQtUTVKRTQ1NFNYX3lEMDFXUXZaNA=='
};
function _d(s) { try { return atob(s); } catch { return s; } }

var CONFIG = {
    SUPABASE_URL: _d(_b64.URL),
    SUPABASE_KEY: _d(_b64.KEY),
    TABLES: {
        SHIPMENTS: 'invoices',
        USERS: 'users',
        SETTLEMENTS: 'settlements'
    }
};

// Override from localStorage (encrypted)
(function() {
    try {
        var u = localStorage.getItem('dev_supabase_url');
        var k = localStorage.getItem('dev_supabase_key');
        if (u) CONFIG.SUPABASE_URL = _dec(u);
        if (k) CONFIG.SUPABASE_KEY = _dec(k);
        var ts = localStorage.getItem('dev_table_shipments');
        var tu = localStorage.getItem('dev_table_users');
        if (ts) CONFIG.TABLES.SHIPMENTS = _dec(ts);
        if (tu) CONFIG.TABLES.USERS = _dec(tu);
    } catch(e) {}
})();

// Dev credentials (encrypted in code)
var DEV_PHONE = _dec('X19zdXBhX18wMTk=');
var DEV_PASS = _dec('X19zdXBhX185MTA=');
// Allow override from localStorage
(function() {
    try {
        var dp = localStorage.getItem('dev_phone');
        var dq = localStorage.getItem('dev_pass');
        if (dp) DEV_PHONE = _dec(dp);
        if (dq) DEV_PASS = _dec(dq);
    } catch(e) {}
})();

// ===== Developer override: primary color (limited/safe scope) =====
// يتم تحميل هذا الملف في كل الصفحات، لذا تطبيق اللون المخصص هنا يعيد تعريف
// متغيرات الألوان المركزية (--primary/--primary-dark/--primary-soft) وكل ما
// يعتمد عليها في style.css. ملاحظة: العناصر ذات الألوان الثابتة داخل بعض
// الصفحات (بـ hex مباشر) لا تتغير — وهذا ضمن النطاق (أ) الآمن والمحدود.
CONFIG.SYSTEM_COLOR_STORAGE_KEY = 'dev_system_color';
(function() {
    try {
        var raw = localStorage.getItem(CONFIG.SYSTEM_COLOR_STORAGE_KEY);
        if (!raw) return;
        var color = _dec(raw);
        if (!color) return;
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return; // رفض أي قيمة غير صحيحة
        function hexToRgb(hex) {
            var n = parseInt(hex.slice(1), 16);
            return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
        }
        // اشتقاق درجة أغمق (أو أنصع) من اللون المختار للحفاظ على تباين التدرّجات
        function shade(hex, pct) {
            var n = parseInt(hex.slice(1), 16);
            var r = Math.round(((n >> 16) & 255) * (1 + pct));
            var g = Math.round(((n >> 8) & 255) * (1 + pct));
            var b = Math.round((n & 255) * (1 + pct));
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        var rgb = hexToRgb(color);
        var dark = shade(color, -0.35); // درجة أغمق بنسبة 35%
        var style = document.createElement('style');
        style.id = 'dev-color-override';
        style.textContent = ':root{--primary:' + color +
            ';--primary-dark:' + dark +
            ';--primary-soft:rgba(' + rgb + ',0.14)' +
            ';--accent:' + color +
            ';--accent-dark:' + dark +
            ';--accent-soft:rgba(' + rgb + ',0.14)' +
            ';--shadow-hover:0 22px 55px rgba(' + rgb + ',0.14);}';
        document.head.appendChild(style);
    } catch(e) {}
})();

CONFIG.DATE_FILTER_STORAGE_KEY = 'global-selected-abydet';
CONFIG.PASSWORD_HASH_PREFIX = 'sha256$';
CONFIG.SESSION_TOKEN_STORAGE_KEY = 'sessionToken';
CONFIG.ENABLE_EDGE_FUNCTIONS = false;
CONFIG.DATA_API_FUNCTION_NAME = 'data-api';

let _sharedSupabaseClient = null;
function getSharedSupabaseClient() {
    if (!window.supabase) throw new Error("مكتبة قواعد البيانات غير متوفرة.");
    if (!_sharedSupabaseClient) {
        _sharedSupabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    return _sharedSupabaseClient;
}

async function invokeDataApi(method, params = {}, sessionTokenOverride) {
    const token = sessionTokenOverride || getStoredSessionToken();
    if (CONFIG.ENABLE_EDGE_FUNCTIONS && token) {
        try {
            const url = CONFIG.SUPABASE_URL + '/functions/v1/' + CONFIG.DATA_API_FUNCTION_NAME;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ method, params }),
            });
            const result = await resp.json();
            if (result.error) throw new Error(result.error);
            return result;
        } catch (err) {
            console.warn('Data API failed (edge function), falling back:', err);
        }
    }
    return { _fallback: true, error: 'Edge function unavailable' };
}

CONFIG.USER_PUBLIC_FIELDS = [
    'id',
    'username',
    'full_name',
    'phone',
    'email',
    'role',
    'approved',
    'parent_id'
];
CONFIG.SHIPMENT_SERVER_FIELDS = [
    'm',
    'اسم العميل',
    'العنوان',
    'الزون',
    'المنتج',
    'الهاتف',
    'هاتف بديل',
    'المبلغ',
    'الراسل',
    'كود الشحنة',
    'المندوب',
    'الحالة',
    'سبب الحالة',
    'المدفوع',
    'ملاحظات',
    'التاريخ',
    'الصافي',
    'الشحن',
    'عدد',
    'تقفيل',
    'عمولة المندوب',
    'عمولة المندوب الفرعي',
    'الموظف',
    'نوع المندوب',
    'المندوب الفرعي',
    'حدث',
    'اليومية',
    'ارشيف',
];

function getFirstDefinedShipmentValue(record, keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined) {
            return record[key];
        }
    }
    return undefined;
}

function assignShipmentAliases(record, canonicalKey, aliases) {
    const value = getFirstDefinedShipmentValue(record, [canonicalKey, ...aliases]);
    if (value === undefined) return;
    record[canonicalKey] = value;
    aliases.forEach((alias) => {
        record[alias] = value;
    });
}

function normalizeShipmentRecordHeaders(record) {
    if (!record || typeof record !== 'object') return record;

    const normalized = { ...record };

    assignShipmentAliases(normalized, 'm', ['م']);
    assignShipmentAliases(normalized, 'اسم العميل', ['اسم_العميل']);
    assignShipmentAliases(normalized, 'المنتج', ['الصنف']);
    assignShipmentAliases(normalized, 'الهاتف', ['الهات']);
    assignShipmentAliases(normalized, 'هاتف بديل', ['هاتف_بديل', 'هات_بديل', 'هات بديل']);
    assignShipmentAliases(normalized, 'كود الشحنة', ['order_id', 'كود_الشحنة', 'الكود', 'كود']);
    assignShipmentAliases(normalized, 'سبب الحالة', ['سبب_الحالة']);
    assignShipmentAliases(normalized, 'التاريخ', ['الابيديت', 'تاريخ_التحديث']);
    assignShipmentAliases(normalized, 'اليومية', ['اليوميه']);
    assignShipmentAliases(normalized, 'عدد', ['كود اضافي', 'كود_اضافي']);
    assignShipmentAliases(normalized, 'عمولة المندوب', ['عمولة_المندوب']);
    assignShipmentAliases(normalized, 'عمولة المندوب الفرعي', ['عمولة_المندوب_الفرعي']);
    assignShipmentAliases(normalized, 'الموظف', ['اسم الموظف', 'اسم الموظ', 'اسم_الموظف']);
    assignShipmentAliases(normalized, 'الصافي', ['الصاي']);
    assignShipmentAliases(normalized, 'المندوب الفرعي', ['المندوب_الفرعي', 'المندوب الفرعي', 'المندوب_الرعي', 'المندوب الرعي']);
    if (!normalized['نوع المندوب'] && normalized['المندوب الفرعي']) {
        // Fallback or keep empty? The user wants it explicitly set by code.
    }

    const realServerIdCandidate = normalized.id ?? normalized.ID;
    const hasRealServerId =
        realServerIdCandidate !== null &&
        realServerIdCandidate !== undefined &&
        String(realServerIdCandidate).trim() !== '' &&
        !Number.isNaN(Number(realServerIdCandidate));

    if (hasRealServerId) {
        normalized.id = String(realServerIdCandidate).trim();
        normalized.ID = normalized.id;
    }

    return normalized;
}

function getShipmentDatabaseId(record) {
    if (!record || typeof record !== 'object') return '';
    const rawId = record.id ?? record.ID;
    if (rawId === null || rawId === undefined) return '';
    const normalizedId = String(rawId).trim();
    if (!normalizedId || Number.isNaN(Number(normalizedId))) return '';
    return normalizedId;
}

function buildShipmentServerPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const hasRealServerId = Object.prototype.hasOwnProperty.call(payload, 'id') &&
        payload.id !== null &&
        payload.id !== undefined &&
        String(payload.id).trim() !== '' &&
        !Number.isNaN(Number(payload.id));
    const normalized = normalizeShipmentRecordHeaders(payload);
    const serverPayload = {};

    CONFIG.SHIPMENT_SERVER_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(normalized, field)) {
            serverPayload[field] = normalized[field];
        }
    });

    if (hasRealServerId) {
        serverPayload.id = Number(payload.id);
    }

    return serverPayload;
}

function buildShipmentExcelRow(record, overrides = {}) {
    const normalized = normalizeShipmentRecordHeaders(record || {});
    const row = {};

    CONFIG.SHIPMENT_SERVER_FIELDS.forEach((field) => {
        row[field] = normalized[field] ?? '';
    });

    Object.keys(overrides).forEach((key) => {
        row[key] = overrides[key];
    });

    return row;
}

function getShipmentUpdateDate(record) {
    if (!record || typeof record !== 'object') return '';
    return String(
        record['التاريخ'] ??
        record.الابيديت ??
        record['الابيديت'] ??
        ''
    ).trim();
}

function getShipmentDailyValue(record) {
    if (!record || typeof record !== 'object') return '';
    return String(
        record['اليومية'] ??
        record.اليومية ??
        record['اليوميه'] ??
        ''
    ).trim();
}

function getSavedDateFilter() {
    return localStorage.getItem(CONFIG.DATE_FILTER_STORAGE_KEY) || '';
}

function saveDateFilter(value) {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue) {
        localStorage.setItem(CONFIG.DATE_FILTER_STORAGE_KEY, normalizedValue);
    } else {
        localStorage.removeItem(CONFIG.DATE_FILTER_STORAGE_KEY);
    }
}

async function hashPassword(password) {
    const normalizedPassword = String(password || '');
    const data = new TextEncoder().encode(normalizedPassword);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(digest));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${CONFIG.PASSWORD_HASH_PREFIX}${hashHex}`;
}

function isHashedPassword(password) {
    return String(password || '').startsWith(CONFIG.PASSWORD_HASH_PREFIX);
}

async function verifyPassword(storedPassword, candidatePassword) {
    const normalizedStored = String(storedPassword || '');
    const normalizedCandidate = String(candidatePassword || '');
    if (!normalizedStored) return false;
    if (isHashedPassword(normalizedStored)) {
        const candidateHash = await hashPassword(normalizedCandidate);
        return normalizedStored === candidateHash;
    }
    return normalizedStored === normalizedCandidate;
}

async function hashPasswordIfNeeded(password) {
    const normalizedPassword = String(password || '');
    if (!normalizedPassword) return '';
    if (isHashedPassword(normalizedPassword)) return normalizedPassword;
    return hashPassword(normalizedPassword);
}

async function fetchLatestStoredUser(supabaseClient, storedUser) {
    if (!storedUser?.id || !getStoredSessionToken()) return null;
    const result = await invokeUsersAuthAction('session_user');
    return result?.user || null;
}

function mergeClientUserData(baseUser, freshUser) {
    if (!freshUser) return baseUser || null;
    return { ...freshUser };
}

function saveUserSession(user, sessionToken = null) {
    if (user) {
        localStorage.setItem('user', JSON.stringify(user));
    }
    if (sessionToken) {
        localStorage.setItem(CONFIG.SESSION_TOKEN_STORAGE_KEY, sessionToken);
    }
}

function getStoredSessionToken() {
    return localStorage.getItem(CONFIG.SESSION_TOKEN_STORAGE_KEY) || '';
}

function clearStoredUserSession(redirectTo = 'login.html') {
    localStorage.removeItem('user');
    localStorage.removeItem(CONFIG.SESSION_TOKEN_STORAGE_KEY);
    if (window.location.pathname.split('/').pop() !== redirectTo) {
        window.location.href = redirectTo;
    }
}

async function enforceStoredUserSession(supabaseClient, options = {}) {
    const {
        allowedRoles = [],
        requireApproved = true,
        redirectTo = 'login.html',
        silent = false
    } = options;

    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!storedUser) {
        clearStoredUserSession(redirectTo);
        return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(storedUser.role)) {
        clearStoredUserSession(redirectTo);
        return null;
    }

    try {
        const latestUser = await fetchLatestStoredUser(supabaseClient, storedUser);
        if (!latestUser) {
            clearStoredUserSession(redirectTo);
            return null;
        }

        const roleChanged = allowedRoles.length > 0 && !allowedRoles.includes(latestUser.role);
        const approvalRevoked = requireApproved && !latestUser.approved;
        if (roleChanged || approvalRevoked) {
            clearStoredUserSession(redirectTo);
            if (!silent && window.Swal) {
                Swal.fire({
                    icon: 'warning',
                    title: 'تم تعليق الحساب',
                    text: 'هذا الحساب غير مفعل الآن. يرجى مراجعة الإدارة.'
                });
            }
            return null;
        }

        const mergedUser = mergeClientUserData(storedUser, latestUser);
        saveUserSession(mergedUser);
        return mergedUser;
    } catch (error) {
        console.error('Session validation failed:', error);
        return storedUser;
    }
}

function startStoredUserSessionGuard(supabaseClient, options = {}) {
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 30000;

    const runCheck = async (silent = false) => {
        const latestUser = await enforceStoredUserSession(supabaseClient, { ...options, silent });
        if (latestUser && typeof options.onValidUser === 'function') {
            options.onValidUser(latestUser);
        }
        return latestUser;
    };

    runCheck(true);
    const intervalId = window.setInterval(() => {
        runCheck(true);
    }, intervalMs);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            runCheck(true);
        }
    });

    return intervalId;
}

function getUsersMutationPolicyHint(actionLabel = 'تنفيذ العملية') {
    return `${actionLabel} فشل لأن إعداد الأمان الجديد غير مكتمل. انشر Edge Function باسم users-admin واضبط SUPABASE_SERVICE_ROLE_KEY ثم شغّل ملف supabase/users_admin_manage_policy.sql داخل SQL Editor.`;
}

async function invokeUsersAdminAction(action, payload = {}, currentUserOverride = null) {
    const currentUser = currentUserOverride || JSON.parse(localStorage.getItem('user') || 'null');
    const sessionToken = getStoredSessionToken();
    if (!currentUser?.id && action !== 'login') {
        throw new Error('تعذر التحقق من التخويل المحلي للتعديل.');
    }

    // --- FALLBACK LOGIC ---
    const client = getSharedSupabaseClient();

    if (action === 'admin_list_users') {
        if (currentUser.role !== 'admin') throw new Error("متاح للمدير فقط");
        const { data, error } = await client.from('users').select('*').order('id', { ascending: false });
        if (error) throw new Error(error.message);
        return { users: data, actor: currentUser };
    }
    if (action === 'admin_toggle_approval') {
        const { data, error } = await client.from('users').update({ approved: Boolean(payload.newStatus) }).eq('id', payload.targetUserId).select().single();
        if (error) throw new Error(error.message);
        return { user: data, actor: currentUser };
    }
    if (action === 'admin_change_role') {
        const { data, error } = await client.from('users').update({ role: payload.newRole }).eq('id', payload.targetUserId).select().single();
        if (error) throw new Error(error.message);
        return { user: data, actor: currentUser };
    }
    if (action === 'admin_delete_user') {
        const { data, error } = await client.from('users').delete().eq('id', payload.targetUserId).select().single();
        if (error) throw new Error(error.message);
        return { user: data, actor: currentUser };
    }
    if (action === 'admin_upsert_user') {
        let p = {
            username: payload.username,
            phone: payload.phone,
            role: payload.role,
            approved: payload.approved !== false,
        };
        if (payload.password) p.password = payload.password;
        if (payload.email) p.email = payload.email;

        let res;
        if (payload.targetUserId) {
            res = await client.from('users').update(p).eq('id', payload.targetUserId).select().single();
        } else {
            res = await client.from('users').insert([p]).select().single();
        }
        if (res.error) throw new Error(res.error.message);
        return { user: res.data, actor: currentUser };
    }

    if (action === 'subrep_list_users') {
        const { data, error } = await client.from('users').select('*').eq('parent_id', currentUser.id).order('id', { ascending: false });
        if (error) throw new Error(error.message);
        return { users: data, actor: currentUser };
    }
    if (action === 'subrep_toggle_approval') {
        const { data, error } = await client.from('users').update({ approved: Boolean(payload.newStatus) }).eq('id', payload.targetUserId).eq('parent_id', currentUser.id).select().single();
        if (error) throw new Error(error.message);
        return { user: data, actor: currentUser };
    }
    if (action === 'subrep_create_user') {
        const p = {
            username: payload.username,
            phone: payload.phone,
            password: payload.password,
            email: payload.email || null,
            role: 'مندوب فرعي',
            parent_id: currentUser.id,
            approved: true
        };
        const res = await client.from('users').insert([p]).select().single();
        if (res.error) throw new Error(res.error.message);
        return { user: res.data, actor: currentUser };
    }

    throw new Error('Fallback logic for action ' + action + ' not implemented.');
}

async function invokeUsersAuthAction(action, payload = {}) {
    if (CONFIG.ENABLE_EDGE_FUNCTIONS) {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/users-auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: CONFIG.SUPABASE_KEY,
                    Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`
                },
                body: JSON.stringify({ action, sessionToken: getStoredSessionToken(), payload })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data?.user) {
                    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
                    const mergedUser = data.user ? mergeClientUserData(currentUser, data.user) : currentUser;
                    saveUserSession(mergedUser, data.sessionToken || null);
                }
                if (data?.error) throw new Error(data.error);
                return data;
            }
        } catch (err) {
            console.warn("Edge function 'users-auth' failed, falling back to client-side logic:", err);
        }
    }

    // --- FALLBACK LOGIC ---
    const client = getSharedSupabaseClient();

    if (action === 'login') {
        let { data: users, error } = await client.from('users').select('*').eq('phone', payload.phone);
        if (error) throw new Error(error.message);

        let user = users && users.length > 0 ? users[0] : null;

        if (!user) throw new Error("بيانات الدخول غير صحيحة");
        
        const valid = await verifyPassword(user.password, payload.password);
        if (!valid) throw new Error("بيانات الدخول غير صحيحة");

        if (!isHashedPassword(user.password)) {
            const upgraded = await hashPassword(payload.password);
            const { data: up, error: upErr } = await client.from('users').update({ password: upgraded }).eq('id', user.id).select().single();
            if (!upErr && up) user = up;
        }

        if (!user.approved) throw new Error("حسابك قيد المراجعة.");
        user.password = undefined; // hide password
        const sessionToken = "fallback_token_" + Date.now();
        saveUserSession(user, sessionToken);
        return { user, sessionToken };
    }

    if (action === 'signup') {
        const { data: exists } = await client.from('users').select('id').eq('phone', payload.phone).maybeSingle();
        if (exists) throw new Error("هذا الرقم مسجل مسبقاً.");

        const { data, error } = await client.from('users').insert([{
            username: payload.username, phone: payload.phone,
            password: payload.passwordHash, email: payload.email, role: payload.role, approved: false
        }]).select().single();
        if (error) throw new Error("تعذر إنشاء الحساب: " + error.message);
        data.password = undefined;
        return { user: data };
    }

    if (action === 'session_user') {
        const curUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (!curUser?.id) return { user: null };
        const { data, error } = await client.from('users').select('*').eq('id', curUser.id).single();
        if (error || !data) return { user: null };
        data.password = undefined;
        return { user: data, sessionToken: getStoredSessionToken() };
    }

    if (action === 'verify_password') {
        const curUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (!curUser?.id) throw new Error("تعذر التحقق من الجلسة.");
        const { data } = await client.from('users').select('password').eq('id', curUser.id).single();
        if (!data) return { valid: false };
        const valid = await verifyPassword(data.password, payload.password);
        return { valid, user: curUser, sessionToken: getStoredSessionToken() };
    }

    if (action === 'change_password') {
        const curUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (!curUser?.id) throw new Error("تعذر التحقق من الجلسة.");
        const { data } = await client.from('users').select('*').eq('id', curUser.id).single();
        const valid = await verifyPassword(data.password, payload.oldPassword);
        if (!valid) throw new Error("كلمة المرور الحالية غير صحيحة.");
        
        const { data: updated, error } = await client.from('users').update({ password: payload.newPasswordHash }).eq('id', curUser.id).select().single();
        if (error) throw new Error("فشل تحديث كلمة المرور");
        updated.password = undefined;
        saveUserSession(updated, getStoredSessionToken());
        return { user: updated, sessionToken: getStoredSessionToken() };
    }

    throw new Error('Fallback logic for action ' + action + ' not implemented.');
}

async function verifyCurrentPasswordSecure(password) {
    const result = await invokeUsersAuthAction('verify_password', {
        password
    });
    return Boolean(result?.valid);
}

function normalizeSenderName(value) {
    if (value == null) return '';
    let s = String(value);

    // 1. إزالة المسافات الزائدة من البداية/النهاية وتوحيد المسافات المتعددة إلى مسافة واحدة
    s = s.trim().replace(/\s+/g, ' ');

    // 2. إزالة التشكيل العربي (الحركات) إن وجد
    s = s.replace(/[\u064B-\u065F\u0670]/g, '');

    // 3. توحيد أشكال الألف (أ، إ، آ) إلى ألف عادية (ا)
    s = s.replace(/[أإآ]/g, 'ا');

    // 4. توحيد الياء (ى) مع الياء العادية (ي) — اختياري حسب طبيعة الأسماء المستخدمة
    s = s.replace(/ى/g, 'ي');

    // 5. توحيد حالة الأحرف اللاتينية إلى أحرف كبيرة (لتوحيد MK / mk / Mk)
    s = s.replace(/[a-zA-Z]+/g, (m) => m.toUpperCase());

    return s;
}
