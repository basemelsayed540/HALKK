// Turns whatever the user typed into the URL the app should open.
// Accepts: a GitHub Pages link, any https link, or a GitHub *repo* link (converted to its Pages address).
function normalizeUrl(input) {
  let s = String(input || '').trim().replace(/[‎‏‪-‮]/g, '');
  if (!s) return { error: 'اكتب الرابط الأول' };
  if (/\s/.test(s)) return { error: 'الرابط فيه مسافات، اتأكد إنك نسخته صح' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (_) { return { error: 'الرابط غير صحيح' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'لازم الرابط يبدأ بـ https://' };
  const host = u.hostname.toLowerCase();
  if (!host || (!host.includes('.') && host !== 'localhost')) return { error: 'الرابط غير صحيح' };
  // GitHub repo link  ->  GitHub Pages link
  if (host === 'github.com' || host === 'www.github.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return { error: 'ده رابط حساب مش مستودع. استخدم رابط المستودع: github.com/اسم-الحساب/اسم-المستودع' };
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    const pagesHost = owner.toLowerCase() + '.github.io';
    const url = repo.toLowerCase() === pagesHost ? 'https://' + pagesHost + '/' : 'https://' + pagesHost + '/' + repo + '/';
    return { url, converted: true };
  }
  u.hash = '';
  let out = u.toString();
  if (!u.pathname || u.pathname === '') out += '/';
  return { url: out };
}
module.exports = { normalizeUrl };
