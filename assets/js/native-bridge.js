/* HALKK Android shell bridge — does nothing in a normal browser. */
(function () {
    var N = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.HalkNative;
    if (!N) return;
    var user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
    if (!user) return;
    var isRep = user.role === 'rep' || user.role === 'مندوب فرعي';
    if (!isRep) return;

    var repName = user.full_name || user.username || '';
    var status = {};

    function msg(title, text, icon) {
        if (window.Swal) return Swal.fire({ title: title, html: text, icon: icon || 'info', confirmButtonText: 'تمام' });
        alert(title + '\n' + text.replace(/<[^>]+>/g, ' '));
        return Promise.resolve();
    }
    function ask(title, text, yes, no) {
        if (window.Swal) {
            return Swal.fire({ title: title, html: text, icon: 'question', showCancelButton: true, confirmButtonText: yes, cancelButtonText: no })
                .then(function (r) { return !!r.isConfirmed; });
        }
        return Promise.resolve(confirm(title + '\n' + text.replace(/<[^>]+>/g, ' ')));
    }

    function configure() {
        return N.configure({
            url: CONFIG.SUPABASE_URL,
            key: CONFIG.SUPABASE_KEY,
            userIdJson: JSON.stringify(user.id === undefined ? null : user.id),
            trackName: user.username || user.phone || repName,
            repName: repName
        }).then(function (s) { status = s || {}; render(); return status; });
    }

    var btn, callsBtn, bar;
    function render() {
        if (!btn) return;
        var on = !!status.shiftActive;
        btn.textContent = on ? '⏹ إنهاء الوردية' : '▶ بدء الوردية';
        btn.style.background = on ? '#dc2626' : '#16a34a';
    }

    function ensurePermissions() {
        return N.getStatus().then(function (s) {
            status = s;
            if (s.location && s.background && s.notifications && s.callLog) return s;
            return ask('صلاحيات التطبيق',
                'علشان الوردية تشتغل صح محتاجين:<br>' +
                '• <b>الموقع طول الوقت</b> لتسجيل مسارك أثناء الوردية فقط.<br>' +
                '• <b>الإشعارات</b> لتنبيهك بتحديثات الشحنات.<br>' +
                '• <b>سجل المكالمات</b> لعرض مكالمات عملاء النظام فقط (أي رقم مش عميل مش بيتقرا).<br><br>' +
                'هتظهر لك رسائل من أندرويد، اختار "السماح" (ومن الموقع: "السماح طوال الوقت").',
                'متابعة', 'مش دلوقتي').then(function (ok) {
                if (!ok) return s;
                return N.askPermissions();
            });
        });
    }

    function ensureBattery() {
        if (status.batteryExempt) return Promise.resolve();
        return ask('منع إيقاف التتبع',
            'بعض الموبايلات بتقفل التطبيقات في الخلفية. اسمح للتطبيق إنه يشتغل بدون قيود بطارية علشان التتبع ما يوقفش.',
            'فتح الإعداد', 'بعدين').then(function (ok) { if (ok) return N.requestBatteryExemption(); });
    }

    function toggleShift() {
        N.getStatus().then(function (s) {
            status = s;
            if (s.shiftActive) {
                return ask('إنهاء الوردية', 'تأكيد إنهاء الوردية وإيقاف التتبع؟', 'إنهاء', 'إلغاء').then(function (ok) {
                    if (!ok) return;
                    return N.stopShift().then(function (r) { status = r; render(); });
                });
            }
            return ensurePermissions().then(function (s2) {
                if (!s2 || !s2.location) {
                    return msg('الموقع مطلوب', 'من غير صلاحية الموقع مينفعش نبدأ الوردية. فعّلها من إعدادات التطبيق.', 'warning')
                        .then(function () { return N.openAppSettings(); });
                }
                var warn = (!s2.background) ? msg('تنبيه', 'الموقع مش على "طوال الوقت" — التتبع ممكن يقف لما الشاشة تتقفل. غيّره من إعدادات التطبيق > الأذونات > الموقع.', 'warning') : Promise.resolve();
                return warn.then(ensureBattery).then(function () {
                    return N.startShift().then(function (r) { status = r; render(); N.pollNow(); });
                });
            });
        }).catch(function (e) { msg('خطأ', String((e && e.message) || e), 'error'); });
    }

    function buildUi() {
        bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:9999;display:flex;gap:8px;flex-direction:column;align-items:stretch;font-family:inherit';
        btn = document.createElement('button');
        btn.style.cssText = 'color:#fff;border:0;border-radius:14px;padding:12px 18px;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.3)';
        btn.onclick = toggleShift;
        callsBtn = document.createElement('button');
        callsBtn.textContent = '📞 مكالمات العملاء';
        callsBtn.style.cssText = 'background:#1e40af;color:#fff;border:0;border-radius:14px;padding:10px 16px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.3)';
        callsBtn.onclick = function () { location.href = 'calls.html'; };
        bar.appendChild(callsBtn);
        bar.appendChild(btn);
        document.body.appendChild(bar);
        render();
    }

    function init() {
        buildUi();
        configure().then(function () {
            // first launch: ask for permissions so notifications and call sync work even without a shift
            var asked = false;
            try { asked = localStorage.getItem('halk_perm_asked') === '1'; } catch (e) {}
            if (!asked && !(status.location && status.notifications && status.callLog)) {
                try { localStorage.setItem('halk_perm_asked', '1'); } catch (e) {}
                setTimeout(function () { ensurePermissions().then(function () { return N.pollNow(); }); }, 1200);
            } else {
                N.pollNow();
            }
        }).catch(function () {});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
