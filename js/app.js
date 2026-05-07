/**
 * DOMS — app.js
 * ----------------
 * تجميع الواجهات وتوجيه الصفحات (SPA بسيطة بدون إطار):
 * - التبديل بين: الطلبات / تصميم النموذج / الإعدادات
 * - قائمة جانبية على الجوال مع غطاء قابل للنقر ومفتاح ESC
 * - مزامنة أولية للحقول والطلبات من التخزين (محلي أو Supabase حسب الإعدادات)
 */

(function () {
  var CFG = window.DOMS.config;
  var storage = window.DOMS.storage;
  var schemaUI = window.DOMS.schemaUI;
  var ordersUI = window.DOMS.ordersUI;
  var auth = window.DOMS.auth;

  /** عناصر التنقل السريع لمطابقة عنوان كل قسم مع محتواه */
  var views = {
    orders: { title: 'الطلبات', el: document.getElementById('view-orders') },
    schema: { title: 'تصميم النموذج', el: document.getElementById('view-schema') },
    settings: { title: 'الإعدادات', el: document.getElementById('view-settings') },
  };

  /** مراجع عناصر القائمة المتجاوبة — تُعبأ في wireNavigation بعد تحميل DOM */
  var menuToggle = null;
  var navBackdrop = null;
  var sidebarEl = null;
  var sidebarCloseBtn = null;
  var mqMobile = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 900px)') : null;

  /** عرضًا منطقيًا وليس نقطة كسر CSS فقط (أحيانًا لا يحدِّثَ matchMedia بسرعة عند تصغير النافذة) */
  function isMobileNav() {
    if (typeof window.innerWidth === 'number' && window.innerWidth <= 900) return true;
    if (mqMobile && mqMobile.matches) return true;
    return false;
  }

  /** يُحدّث aria لمفتاح ☰ وفقًا لحالة الفتح؛ مهم لمحركات قراءة الشاشة */
  function syncMenuToggleAria(open) {
    if (!menuToggle) return;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  }

  /** يُظهر/يُخفِي الغطاء الخلفي — زر حقيقي في DOM لالتقاط النقر (لا يمكن الاعتماد على ::before) */
  function syncBackdrop(open) {
    if (!navBackdrop) return;
    navBackdrop.hidden = !open;
    navBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) navBackdrop.blur();
  }

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
    if (sidebarEl) sidebarEl.classList.remove('is-open');
    syncBackdrop(false);
    syncMenuToggleAria(false);
  }

  /** يفتح القائمة على الجوال فقط؛ على الشاشات العريضة CSS يُبقيها ظاهرة دائماً */
  function openMobileSidebar() {
    if (!isMobileNav()) return;
    document.body.classList.add('sidebar-open');
    if (sidebarEl) sidebarEl.classList.add('is-open');
    syncBackdrop(true);
    syncMenuToggleAria(true);
  }

  function toggleMobileSidebar() {
    var open = document.body.classList.contains('sidebar-open');
    if (open) closeMobileSidebar();
    else openMobileSidebar();
  }

  /** تبديل المنظر النشط + تحديث أزرار التنقل وترويسة الشريط العلوي */
  function setView(name) {
    Object.keys(views).forEach(function (k) {
      var v = views[k];
      if (!v.el) return;
      v.el.classList.toggle('hidden', k !== name);
    });

    document.querySelectorAll('.nav-btn').forEach(function (b) {
      var isHere = b.getAttribute('data-view') === name;
      b.classList.toggle('is-active', isHere);
      b.setAttribute('aria-current', isHere ? 'page' : 'false');
    });

    var t = document.getElementById('pageTitle');
    if (t && views[name]) t.textContent = views[name].title;

    renderTopbar(name);

    /** بعد الانتقال: أغلق القائمة على الهاتف ليُعاد المحتوى للواجهة كاملة */
    closeMobileSidebar();
  }

  /** زر «طلب جديد» يظهر فقط في قسم الطلبات */
  function renderTopbar(name) {
    var box = document.getElementById('topbarActions');
    if (!box) return;
    box.innerHTML = '';
    if (name !== 'orders') return;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-primary';
    b.textContent = '+ طلب جديد';
    b.addEventListener('click', function () {
      ordersUI.openNewOrder();
      closeMobileSidebar();
    });
    box.appendChild(b);
  }

  /** شارة المحلي / Supabase أسفل الشريط الجانبي */
  function updateStoragePill() {
    var st = document.getElementById('storageStatus');
    if (!st) return;
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && creds.url && creds.key) {
      st.textContent = 'سحابي (Supabase)';
      st.classList.add('is-cloud');
    } else {
      st.textContent = 'محلي';
      st.classList.remove('is-cloud');
    }
  }

  /** يعرض رسالة انتظار ذات حفظ المصمّم عند تعديل حقول الطلب الديناميكي */
  window.DOMS.setSchemaDirty = function (dirty) {
    var t = document.querySelector('.schema-toolbar .dirty-hint');
    if (t) t.remove();
    if (!dirty) return;
    var bar = document.querySelector('.schema-toolbar');
    if (!bar) return;
    var s = document.createElement('span');
    s.className = 'dirty-hint muted small';
    s.textContent = 'توجد تغييرات قيد الحفظ…';
    bar.appendChild(s);
  };

  /** تحميل أولي: بنية الحقوق + قائمة الطلبات */
  async function bootstrapData() {
    var fields = await storage.loadSchema(true);
    ordersUI.syncFields(fields);
    schemaUI.setFields(fields);
    var orders = await storage.loadOrders();
    ordersUI.setOrders(orders);
    updateStoragePill();
  }

  function wireNavigation() {
    menuToggle = document.getElementById('menuToggle');
    navBackdrop = document.getElementById('navBackdrop');
    sidebarEl = document.getElementById('appSidebar');
    sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-view');
        if (v) setView(v);
      });
    });

    if (menuToggle) {
      syncMenuToggleAria(false);

      menuToggle.addEventListener('click', function () {
        toggleMobileSidebar();
      });
    }

    if (sidebarCloseBtn) {
      sidebarCloseBtn.addEventListener('click', function () {
        closeMobileSidebar();
        if (menuToggle) menuToggle.focus();
      });
    }

    /**
     * إغلاق عبر الغطاء فقط من دون مستمع عمومي على document:
     * المستمع العام كان يخطئ ويصفّ النقر على زر ☰ بأنه «خارج القائمة» لأنه ليس داخل الشريط.
     */
    if (navBackdrop) {
      navBackdrop.addEventListener('click', function () {
        closeMobileSidebar();
        if (menuToggle) menuToggle.focus();
      });
    }

    /** ESC: إغلاق القائمة أولاً، وإلا يترك للمتصفح/الحوارات */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('sidebar-open')) {
        e.preventDefault();
        closeMobileSidebar();
        if (menuToggle) menuToggle.focus();
      }
    });

    /** عند التوسيع لسطح مكتب: إزالة حالة «القائمة المفتوحة» حتى لا تبقى أغطية */
    function onMqChange() {
      if (!isMobileNav()) closeMobileSidebar();
    }

    if (mqMobile) {
      if (mqMobile.addEventListener) mqMobile.addEventListener('change', onMqChange);
      else if (mqMobile.addListener) mqMobile.addListener(onMqChange);
    } else {
      window.addEventListener('resize', onMqChange);
    }
  }

  /** إعدادات Supabase + النسخ الاحتياطي JSON — تبقى في localStorage المفتاح */
  function wireSettings() {
    var cfgUrl = document.getElementById('cfgUrl');
    var cfgKey = document.getElementById('cfgKey');
    var cfgUse = document.getElementById('cfgUseSupabase');
    var msg = document.getElementById('configMessage');
    var s = CFG.loadSettings();
    if (cfgUrl) cfgUrl.value = s.supabaseUrl || '';
    if (cfgKey) cfgKey.value = s.supabaseKey || '';
    if (cfgUse) cfgUse.checked = !!s.useSupabase;

    var saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn && cfgUrl && cfgKey && cfgUse) {
      saveBtn.addEventListener('click', function () {
        CFG.saveSettings({
          supabaseUrl: cfgUrl.value.trim(),
          supabaseKey: cfgKey.value.trim(),
          useSupabase: !!cfgUse.checked,
        });
        msg.textContent = 'تم حفظ الإعدادات.';
        bootstrapData().catch(function (e) {
          msg.textContent = 'خطأ بعد الحفظ: ' + (e.message || String(e));
        });
      });
    }

    var testBtn = document.getElementById('testSupabaseBtn');
    if (testBtn && cfgUrl && cfgKey) {
      testBtn.addEventListener('click', function () {
        msg.textContent = 'جاري الاختبار…';
        storage
          .probeSupabase(cfgUrl.value.trim(), cfgKey.value.trim())
          .then(function (r) {
            msg.textContent = r.ok ? '✔ ' + r.msg : '✖ ' + r.msg;
          });
      });
    }

    var exBtn = document.getElementById('exportJsonBtn');
    if (exBtn) {
      exBtn.addEventListener('click', function () {
        storage.exportBlob().then(function (blob) {
          var a = document.createElement('a');
          a.href =
            'data:application/json;charset=utf-8,' +
            encodeURIComponent(blob);
          a.download = 'doms_backup_' + new Date().toISOString().slice(0, 10) + '.json';
          a.click();
        });
      });
    }

    var imInp = document.getElementById('importJsonInput');
    if (imInp) {
      imInp.addEventListener('change', function (ev) {
        var f = ev.target.files && ev.target.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var parsed = JSON.parse(rd.result);
            storage
              .importBlob(parsed)
              .then(function () {
                alert('اكتمل الاستيراد');
                bootstrapData();
              })
              .catch(function (e) {
                alert('استيراد فاشل: ' + (e.message || String(e)));
              });
          } catch (e) {
            alert('ملف غير صالح');
          }
        };
        rd.readAsText(f, 'UTF-8');
        ev.target.value = '';
      });
    }
  }

  window.DOMS.bootstrapData = bootstrapData;
  window.DOMS.refreshOrdersUI = function () {
    storage.loadOrders().then(function (o) {
      ordersUI.setOrders(o);
    });
  };

  window.DOMS.onSchemaSaved = function (fields) {
    ordersUI.syncFields(fields);
    ordersUI.refresh();
  };

  function init() {
    // التحقق من المصادقة قبل تهيئة التطبيق
    if (!auth.isAuthenticated()) {
      return; // إذا لم يكن المستخدم مسجل دخوله، سيتم إظهار شاشة تسجيل الدخول تلقائياً
    }

    wireNavigation();

    /** يبدأ الغطاء مخفيًا لتجنب اعتراض النقر قبل فتح القائمة */
    if (navBackdrop) {
      navBackdrop.hidden = true;
      navBackdrop.setAttribute('aria-hidden', 'true');
    }

    schemaUI.bootstrap();
    ordersUI.wire();
    wireSettings();
    setView('orders');
    bootstrapData().catch(function (e) {
      console.error(e);
      alert('تعذر تحميل البيانات: ' + (e.message || String(e)));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
