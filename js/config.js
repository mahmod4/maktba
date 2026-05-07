/**
 * الإعدادات المخزَّنة محليًا لمشروع المتصفّح (ليست جزء مخطّط الطلب الديناميكي).
 * - مفاتيح Supabase اختيارية تُحمَّل قبل تهيئة Supabase من storage.js
 */
(function () {
  var KEY = 'doms_user_settings_v1';
  function loadSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(partial) {
    var cur = loadSettings();
    Object.assign(cur, partial);
    localStorage.setItem(KEY, JSON.stringify(cur));
  }

  window.DOMS = window.DOMS || {};
  window.DOMS.config = {
    KEY: KEY,
    SCHEMA_LOCAL: 'doms_schema_v1',
    ORDERS_LOCAL: 'doms_orders_v1',
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getSupabaseCredentials: function () {
      var s = loadSettings();
      return {
        url: (s.supabaseUrl || '').trim(),
        key: (s.supabaseKey || '').trim(),
        useSupabase: !!s.useSupabase,
      };
    },
  };
})();
