/**
 * الإعدادات المخزَّنة محليًا لمشروع المتصفّح (ليست جزء مخطّط الطلب الديناميكي).
 * - مفاتيح Supabase اختيارية تُحمَّل قبل تهيئة Supabase من storage.js
 */
(function () {
  var KEY = 'doms_user_settings_v1';

  /* ── افتراضيات مضمنة: عدّل هنا لتعمل على كل الأجهزة بدون إعداد يدوي ── */
  var DEFAULT_SUPABASE_URL = 'https://nhizwukdxpinkwluohib.supabase.co';
  var DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXp3dWtkeHBpbmt3bHVvaGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDQ0MzUsImV4cCI6MjA5MzcyMDQzNX0.LAnWK1vCg103cX0R0tI_ZSKoZGEHAvzE1m6lb_N9_6U';  /* مثال: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXp3dWtkeHBpbmt3bHVvaGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDQ0MzUsImV4cCI6MjA5MzcyMDQzNX0.LAnWK1vCg103cX0R0tI_ZSKoZGEHAvzE1m6lb_N9_6U' */

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
      var url = (s.supabaseUrl || '').trim() || DEFAULT_SUPABASE_URL;
      var key = (s.supabaseKey || '').trim() || DEFAULT_SUPABASE_KEY;
      var hasCredentials = !!(url && key);
      return {
        url: url,
        key: key,
        useSupabase: hasCredentials || !!s.useSupabase,
      };
    },
  };
})();
