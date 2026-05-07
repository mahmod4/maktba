/**
 * auth.js — نظام المصادقة لـ DOMS مع Supabase
 * يستخدم Supabase Auth للمصادقة الآمنة
 */
(function () {
  'use strict';

  var AUTH_KEY = 'doms_auth_session';
  var supabase = null;

  /**
   * تهيئة Supabase client
   */
  // افتراضيات يمكن تعديلها لبيئتك
  var DEFAULT_SUPABASE_URL = '';
  var DEFAULT_SUPABASE_KEY = '';

  function initSupabase() {
    if (supabase) return supabase;
    
    var CFG = window.DOMS.config;
    var credentials = CFG.getSupabaseCredentials();
    
    var url = credentials.url || DEFAULT_SUPABASE_URL;
    var key = credentials.key || DEFAULT_SUPABASE_KEY;

    if (!url || !key) {
      console.warn('Auth: بيانات Supabase غير مكتملة');
      return null;
    }
    
    try {
      supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      window.DOMS.authClient = supabase;
      return supabase;
    } catch (e) {
      console.error('فشل تهيئة Supabase:', e);
      return null;
    }
  }

  /**
   * حفظ بيانات الجلسة
   */
  function saveSessionData(session) {
    if (!session) return;
    
    var authData = {
      user: session.user,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
  }

  /**
   * مسح بيانات المصادقة
   */
  function clearAuthData() {
    localStorage.removeItem(AUTH_KEY);
  }

  /**
   * الحصول على بيانات المصادقة الحالية
   */
  function getAuthData() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * التحقق من تسجيل الدخول (غير متزامن)
   */
  function isAuthenticated() {
    var client = initSupabase();
    if (!client) return Promise.resolve(false);
    
    return client.auth.getSession()
      .then(function(session) {
        return !!(session && session.data && session.data.user);
      })
      .catch(function() {
        return false;
      });
  }

  /**
   * التحقق إذا كان Supabase جاهز
   */
  function isSupabaseReady() {
    return !!(window.supabase && window.DOMS && window.DOMS.config);
  }

  /**
   * الحصول على المستخدم الحالي (غير متزامن)
   */
  function getCurrentUser() {
    var client = initSupabase();
    if (!client) return Promise.resolve(null);
    
    return client.auth.getSession()
      .then(function(session) {
        return (session && session.data && session.data.user) ? session.data.user : null;
      })
      .catch(function() {
        return null;
      });
  }

  /**
   * التحقق السريع من الجلسة (متزامن)
   */
  function isAuthenticatedSync() {
    try {
      var authData = getAuthData();
      return !!(authData && authData.user && authData.access_token);
    } catch (e) {
      return false;
    }
  }

  /**
   * تسجيل الدخول
   */
  function login(email, password) {
    return new Promise(function(resolve, reject) {
      var client = initSupabase();
      if (!client) {
        reject(new Error('Supabase غير مهيأ. يرجى التحقق من الإعدادات.'));
        return;
      }

      client.auth.signInWithPassword({
        email: email,
        password: password
      })
      .then(function(response) {
        if (response.error) {
          reject(new Error(response.error.message || 'فشل تسجيل الدخول'));
        } else if (response.data && response.data.session) {
          saveSessionData(response.data.session);
          resolve({
            success: true,
            user: response.data.user,
            session: response.data.session
          });
        } else {
          reject(new Error('لم يتم استلام جلسة صالحة'));
        }
      })
      .catch(function(error) {
        reject(new Error('خطأ في الاتصال: ' + error.message));
      });
    });
  }

  /**
   * تسجيل مستخدم جديد
   */
  function signup(email, password) {
    return new Promise(function(resolve, reject) {
      var client = initSupabase();
      if (!client) {
        reject(new Error('Supabase غير مهيأ. يرجى التحقق من الإعدادات.'));
        return;
      }

      client.auth.signUp({
        email: email,
        password: password
      })
      .then(function(response) {
        if (response.error) {
          reject(new Error(response.error.message || 'فشل إنشاء الحساب'));
        } else {
          resolve({
            success: true,
            user: response.data.user,
            message: 'تم إنشاء الحساب بنجاح. يرجى تفعيل البريد الإلكتروني.'
          });
        }
      })
      .catch(function(error) {
        reject(new Error('خطأ في الاتصال: ' + error.message));
      });
    });
  }

  /**
   * وضع تجريبي: تسجيل دخول محلي بدون خادم
   */
  function demoLogin(email, password) {
    return new Promise(function(resolve, reject) {
      if (!email || !password) {
        reject(new Error('يرجى إدخال البريد وكلمة المرور'));
        return;
      }
      var session = {
        user: { id: 'demo-' + Date.now(), email: email, role: 'authenticated' },
        access_token: 'demo-token-' + Math.random().toString(36).slice(2),
        refresh_token: 'demo-refresh-' + Math.random().toString(36).slice(2),
        expires_at: Date.now() + 86400000
      };
      saveSessionData(session);
      resolve({ success: true, user: session.user, session: session });
    });
  }

  /**
   * تسجيل الخروج
   */
  function logout() {
    var client = initSupabase();
    if (client) {
      client.auth.signOut();
    }
    clearAuthData();
    showLoginScreen();
  }

  /**
   * إظهار شاشة تسجيل الدخول
   */
  function showLoginScreen() {
    var loginScreen = document.getElementById('loginScreen');
    var app = document.getElementById('app');

    if (loginScreen) {
      loginScreen.hidden = false;
      loginScreen.style.display = '';
    }
    if (app) {
      app.hidden = true;
      app.style.display = 'none';
    }

    // مسح أي رسائل خطأ سابقة
    var errorEl = document.getElementById('loginError');
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    // مسح حقول الإدخال
    var usernameEl = document.getElementById('username');
    var passwordEl = document.getElementById('password');
    if (usernameEl) usernameEl.value = '';
    if (passwordEl) passwordEl.value = '';
  }

  /**
   * إظهار التطبيق الرئيسي
   */
  function showApp() {
    console.log('Auth: إظهار التطبيق...');
    var loginScreen = document.getElementById('loginScreen');
    var app = document.getElementById('app');

    if (loginScreen) {
      loginScreen.hidden = true;
      loginScreen.style.display = 'none';
    }
    if (app) {
      app.hidden = false;
      app.style.display = '';
    }
    console.log('Auth: تم إظهار التطبيق');
  }

  /**
   * بدء التطبيق إذا لم يكن قد بدأ
   */
  function startAppIfNeeded() {
    if (window.DOMS && window.DOMS.app && !window.DOMS.app.initialized) {
      console.log('Auth: بدء تهيئة التطبيق...');
      window.DOMS.app.init();
    } else if (!window.DOMS || !window.DOMS.app) {
      console.log('Auth: التطبيق غير جاهز، إعادة المحاولة بعد 200ms...');
      setTimeout(startAppIfNeeded, 200);
    } else {
      console.log('Auth: التطبيق مهيأ بالفعل');
    }
  }

  /**
   * تهيئة نظام المصادقة
   */
  function init() {
    console.log('Auth: بدء التهيئة...');
    
    // الانتظار حتى تحميل جميع المكتبات
    if (!isSupabaseReady()) {
      console.log('Auth: Supabase ليس جاهزاً بعد، إعادة المحاولة...');
      setTimeout(init, 200);
      return;
    }

    console.log('Auth: Supabase جاهز، التحقق من الجلسة...');
    
    var client = initSupabase();

    // استمع لتغييرات حالة المصادقة
    if (client) {
      client.auth.onAuthStateChange(function(event, session) {
        console.log('Auth: حالة المصادقة تغيرت:', event);
        if (event === 'SIGNED_IN' && session) {
          saveSessionData(session);
          showApp();
          startAppIfNeeded();
        } else if (event === 'SIGNED_OUT') {
          clearAuthData();
          showLoginScreen();
        }
      });
    }

    // استعادة الجلسة بشكل صحيح من Supabase
    if (client) {
      client.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          console.log('Auth: جلسة Supabase موجودة');
          saveSessionData(result.data.session);
          showApp();
          startAppIfNeeded();
        } else {
          console.log('Auth: لا توجد جلسة Supabase');
          // التحقق من الجلسة المحلية كاحتياطي
          if (isAuthenticatedSync()) {
            console.log('Auth: جلسة محلية موجودة');
            showApp();
            startAppIfNeeded();
          } else {
            showLoginScreen();
          }
        }
      }).catch(function(err) {
        console.error('Auth: خطأ في استعادة الجلسة:', err);
        if (isAuthenticatedSync()) {
          showApp();
          startAppIfNeeded();
        } else {
          showLoginScreen();
        }
      });
    } else {
      // بدون Supabase - استخدم الجلسة المحلية
      if (isAuthenticatedSync()) {
        console.log('Auth: جلسة محلية موجودة (بدون Supabase)');
        showApp();
        startAppIfNeeded();
      } else {
        showLoginScreen();
      }
    }

    // ربط حدث تسجيل الدخول
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        var email = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value;
        var errorEl = document.getElementById('loginError');
        var submitBtn = loginForm.querySelector('button[type="submit"]');
        
        if (!email || !password) {
          if (errorEl) {
            errorEl.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
            errorEl.hidden = false;
          }
          return;
        }

        // التحقق من صحة البريد الإلكتروني
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          if (errorEl) {
            errorEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح';
            errorEl.hidden = false;
          }
          return;
        }

        // التحقق مرة أخرى من جاهزية Supabase
        if (!isSupabaseReady()) {
          if (errorEl) {
            errorEl.textContent = 'النظام لم يكتمل التحميل بعد. يرجى الانتظار قليلاً.';
            errorEl.hidden = false;
          }
          return;
        }

        // التحقق من وجود بيانات Supabase
        var credentials = window.DOMS.config.getSupabaseCredentials();
        if (!credentials.url || !credentials.key) {
          if (errorEl) {
            errorEl.textContent = 'بيانات Supabase غير مكتملة. أدخل الرابط والمفتاح في الإعدادات أولاً.';
            errorEl.hidden = false;
          }
          var hint = document.getElementById('loginHint');
          var goBtn = document.getElementById('goToSettingsBtn');
          if (hint) hint.hidden = false;
          if (goBtn) goBtn.hidden = false;
          return;
        }

        // تعطيل الزر أثناء المحاولة
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الدخول...';

        var useDemo = !credentials.url || !credentials.key;
        var authPromise = useDemo ? demoLogin(email, password) : login(email, password);

        authPromise
          .then(function(result) {
            console.log('Auth: تسجيل الدخول نجح:', result.user.email);
            showApp();
            startAppIfNeeded();
          })
          .catch(function(error) {
            if (errorEl) {
              errorEl.textContent = error.message;
              errorEl.hidden = false;
            }
          })
          .finally(function() {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول';
          });
      });
    }

    // إضافة زر تسجيل الخروج في القائمة الجانبية
    var sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'btn btn-ghost btn-sm';
      logoutBtn.textContent = 'تسجيل خروج';
      logoutBtn.style.marginTop = '8px';
      logoutBtn.addEventListener('click', logout);
      sidebarFooter.appendChild(logoutBtn);
    }
  }

  // تصدير الدوال للاستخدام الخارجي
  window.DOMS = window.DOMS || {};
  window.DOMS.auth = {
    isAuthenticated: isAuthenticated,
    isAuthenticatedSync: isAuthenticatedSync,
    login: login,
    demoLogin: demoLogin,
    signup: signup,
    logout: logout,
    showLoginScreen: showLoginScreen,
    showApp: showApp,
    init: init
  };

  // تهيئة عند تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
