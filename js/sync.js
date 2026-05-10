/**
 * sync.js — نظام المزامنة الذكي لـ DOMS
 * يتعامل مع: online/offline detection، sync queue، conflict resolution
 */
(function () {
  'use strict';

  var IDB = window.DOMS && window.DOMS.indexedDB;
  var storage = window.DOMS && window.DOMS.storage;
  var CFG = window.DOMS && window.DOMS.config;

  // حالة النظام
  var isOnline = navigator.onLine;
  var isSyncing = false;
  var syncListeners = [];

  // ── Event Listeners ──
  function init() {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // مزامنة أولية إذا كان متصل
    if (isOnline) {
      setTimeout(function () {
        attemptSync().catch(function () { /* ignore */ });
      }, 2000);
    }
    updateStatusIndicators();
  }

  function onOnline() {
    isOnline = true;
    updateStatusIndicators();
    console.log('[Sync] Went online, triggering sync...');
    attemptSync().catch(function (e) {
      console.warn('[Sync] Auto-sync failed:', e);
    });
  }

  function onOffline() {
    isOnline = false;
    isSyncing = false;
    updateStatusIndicators();
    console.log('[Sync] Went offline');
  }

  // ── Sync Queue ──
  function queueChange(action, table, recordId, data) {
    if (!IDB) return Promise.resolve();
    return IDB.addToSyncQueue({
      action: action,
      table: table,
      recordId: recordId,
      data: data
    }).then(function () {
      updateStatusIndicators();
      // محاولة مزامنة فورية إذا كان online
      if (isOnline && !isSyncing) {
        attemptSync().catch(function () {});
      }
    });
  }

  function queueOrderInsert(order) {
    return queueChange('insert', 'orders', order.id, order);
  }

  function queueOrderUpdate(id, patch) {
    return queueChange('update', 'orders', id, patch);
  }

  function queueOrderDelete(id) {
    return queueChange('delete', 'orders', id, null);
  }

  function queueSchemaUpdate(fields) {
    return queueChange('update', 'schema_fields', 'schema', fields);
  }

  // ── Main Sync ──
  async function attemptSync() {
    if (!isOnline || isSyncing || !IDB) return;
    var creds = CFG && CFG.getSupabaseCredentials ? CFG.getSupabaseCredentials() : {};
    if (!creds.useSupabase || !storage || !storage.getClient || !storage.getClient()) {
      return;
    }

    isSyncing = true;
    updateStatusIndicators();
    console.log('[Sync] Starting sync...');

    try {
      var pending = await IDB.getPendingSyncItems();
      if (!pending.length) {
        console.log('[Sync] No pending items');
        isSyncing = false;
        updateStatusIndicators();
        return;
      }

      console.log('[Sync] Processing', pending.length, 'items');
      for (var i = 0; i < pending.length; i++) {
        var item = pending[i];
        try {
          await processSyncItem(item);
          await IDB.removeSyncItem(item.id);
        } catch (e) {
          console.warn('[Sync] Item failed:', item.id, e.message);
          await IDB.updateSyncItemStatus(item.id, 'failed');
        }
      }
      console.log('[Sync] Completed');
    } catch (e) {
      console.error('[Sync] Sync error:', e);
    } finally {
      isSyncing = false;
      updateStatusIndicators();
    }
  }

  async function processSyncItem(item) {
    if (!storage) throw new Error('Storage not available');
    var client = storage.getClient();
    if (!client) throw new Error('Supabase not available');

    if (item.table === 'orders') {
      if (item.action === 'insert') {
        // تحقق إذا الطلب موجود قبل الإدراج
        var existing = await storage.loadOrders().then(function (orders) {
          return orders.find(function (o) { return o.id === item.recordId; });
        }).catch(function () { return null; });
        if (existing) {
          // تحديث بدل إدراج
          await storage.updateRemoteOrder(item.recordId, {
            status: item.data.status,
            reference: item.data.reference,
            data: item.data.data
          });
        } else {
          await storage.insertRemoteOrder(item.data);
        }
      } else if (item.action === 'update') {
        await storage.updateRemoteOrder(item.recordId, item.data);
      } else if (item.action === 'delete') {
        await storage.deleteRemoteOrder(item.recordId);
      }
    } else if (item.table === 'schema_fields') {
      if (item.action === 'update' && item.data) {
        // تحديث schema كاملة
        await storage.saveSchema(item.data);
      }
    }
  }

  // ── Conflict Resolution ──
  function resolveConflict(localVersion, remoteVersion) {
    // استراتيجية: "last-write-wins" بناءً على التاريخ
    var localTime = new Date(localVersion.updatedAt || localVersion.createdAt || 0).getTime();
    var remoteTime = new Date(remoteVersion.updatedAt || remoteVersion.createdAt || 0).getTime();

    if (remoteTime > localTime) {
      return { winner: 'remote', data: remoteVersion };
    }
    return { winner: 'local', data: localVersion };
  }

  // ── Background Sync (Periodic) ──
  function startPeriodicSync(intervalMs) {
    intervalMs = intervalMs || 30000; // كل 30 ثانية
    setInterval(function () {
      if (isOnline && !isSyncing) {
        attemptSync().catch(function () {});
      }
    }, intervalMs);
  }

  // ── Status Indicators ──
  function updateStatusIndicators() {
    // تحديث شارة الاتصال
    var connectionPill = document.getElementById('connectionStatus');
    if (connectionPill) {
      if (isOnline) {
        connectionPill.textContent = '🌐 متصل';
        connectionPill.className = 'status-pill online';
      } else {
        connectionPill.textContent = '📴 غير متصل';
        connectionPill.className = 'status-pill offline';
      }
    }

    // تحديث شارة المزامنة
    var syncPill = document.getElementById('syncStatus');
    if (syncPill) {
      if (isSyncing) {
        syncPill.textContent = '🔄 يتم المزامنة...';
        syncPill.className = 'status-pill syncing';
      } else {
        // تحقق من وجود عناصر معلقة
        if (IDB) {
          IDB.getPendingSyncItems().then(function (items) {
            if (items.length > 0) {
              syncPill.textContent = '⏳ ' + items.length + ' تغيير معلق';
              syncPill.className = 'status-pill pending';
            } else {
              syncPill.textContent = '✅ متزامن';
              syncPill.className = 'status-pill synced';
            }
          }).catch(function () {
            syncPill.textContent = '';
          });
        }
      }
    }
  }

  // ── Force Sync ──
  function forceSync() {
    return attemptSync();
  }

  // ── Getters ──
  function getOnlineStatus() { return isOnline; }
  function getSyncStatus() { return isSyncing; }

  // ── Exports ──
  window.DOMS = window.DOMS || {};
  window.DOMS.sync = {
    init: init,
    queueChange: queueChange,
    queueOrderInsert: queueOrderInsert,
    queueOrderUpdate: queueOrderUpdate,
    queueOrderDelete: queueOrderDelete,
    queueSchemaUpdate: queueSchemaUpdate,
    attemptSync: attemptSync,
    forceSync: forceSync,
    resolveConflict: resolveConflict,
    startPeriodicSync: startPeriodicSync,
    updateStatusIndicators: updateStatusIndicators,
    getOnlineStatus: getOnlineStatus,
    getSyncStatus: getSyncStatus
  };

  // بدء التهيئة تلقائياً
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
