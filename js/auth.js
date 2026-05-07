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
  function initSupabase() {
    if (supabase) return supabase;
    
    var CFG = window.DOMS.config;
    var credentials = CFG.getSupabaseCredentials();
    
    if (!credentials.url || !credentials.key || !credentials.useSupabase) {
      return null;
    }
    
    try {
      supabase = window.supabase.createClient(credentials.url, credentials.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
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
   * التحقق من تسجيل الدخول
   */
  function isAuthenticated() {
    var client = initSupabase();
    if (!client) return false;
    
    var session = client.auth.session();
    return !!(session && session.user);
  }

  /**
   * التحقق إذا كان Supabase جاهز
   */
  function isSupabaseReady() {
    return !!(window.supabase && window.DOMS && window.DOMS.config);
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

      client.auth.signIn({
        email: email,
        password: password
      })
      .then(function(response) {
        if (response.error) {
          reject(new Error(response.error.message || 'فشل تسجيل الدخول'));
        } else if (response.session) {
          saveSessionData(response.session);
          resolve({
            success: true,
            user: response.session.user,
            session: response.session
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
            user: response.user,
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
    
    if (loginScreen) loginScreen.hidden = false;
    if (app) app.hidden = true;
    
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
    var loginScreen = document.getElementById('loginScreen');
    var app = document.getElementById('app');
    
    if (loginScreen) loginScreen.hidden = true;
    if (app) app.hidden = false;
  }

  /**
   * تهيئة نظام المصادقة
   */
  function init() {
    // الانتظار حتى تحميل جميع المكتبات
    if (!isSupabaseReady()) {
      // إعادة المحاولة بعد 100ms
      setTimeout(init, 100);
      return;
    }

    // التحقق من وجود جلسة سابقة
    if (isAuthenticated()) {
      showApp();
    } else {
      showLoginScreen();
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

        // تعطيل الزر أثناء المحاولة
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الدخول...';

        login(email, password)
          .then(function(result) {
            showApp();
            // تهيئة التطبيق الرئيسي بعد تسجيل الدخول
            if (window.DOMS && window.DOMS.app && window.DOMS.app.init) {
              window.DOMS.app.init();
            }
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
    login: login,
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
