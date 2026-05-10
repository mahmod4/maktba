/**
 * sync.js — نظام المزامنة الذكي لـ DOMS
 * يتعامل مع: online/offline detection، sync queue، conflict resolution
 */
(function () {
  'use strict';

  function getIDB() { return window.DOMS && window.DOMS.indexedDB; }
  function getStorage() { return window.DOMS && window.DOMS.storage; }
  function getCFG() { return window.DOMS && window.DOMS.config; }

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
    console.log('[Sync] queueChange:', action, table, recordId);
    var IDB = getIDB();
    if (!IDB) {
      console.warn('[Sync] queueChange skipped: IDB not available');
      return Promise.resolve();
    }
    return IDB.addToSyncQueue({
      action: action,
      table: table,
      recordId: recordId,
      data: data
    }).then(function () {
      console.log('[Sync] queueChange queued successfully:', action, table, recordId);
      updateStatusIndicators();
      // محاولة مزامنة فورية إذا كان online
      if (isOnline && !isSyncing) {
        attemptSync().catch(function () {});
      }
    }).catch(function (e) {
      console.error('[Sync] queueChange failed:', action, table, recordId, e.message || e);
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

  // ── Main Sync (Bidirectional) ──
  async function attemptSync() {
    var IDB = getIDB();
    var storage = getStorage();
    var CFG = getCFG();
    if (!isOnline || isSyncing || !IDB) return;
    var creds = CFG && CFG.getSupabaseCredentials ? CFG.getSupabaseCredentials() : {};
    if (!creds.useSupabase || !storage || !storage.getClient || !storage.getClient()) {
      return;
    }

    isSyncing = true;
    updateStatusIndicators();
    console.log('[Sync] Starting bidirectional sync...');

    try {
      console.log('[Sync] === attemptSync starting ===');
      var IDB = getIDB();
      // المرحلة 1: دفع التغييرات المحلية للسحابة
      var pending = await IDB.getPendingSyncItems();
      console.log('[Sync] Pending sync items:', pending.length);
      if (pending.length) {
        console.log('[Sync] Pushing', pending.length, 'local changes to remote');
        for (var i = 0; i < pending.length; i++) {
          var item = pending[i];
          try {
            await processSyncItem(item);
            await IDB.removeSyncItem(item.id);
          } catch (e) {
            console.warn('[Sync] Push failed for item', item.id, e.message);
            await IDB.updateSyncItemStatus(item.id, 'failed');
          }
        }
      }

      // المرحلة 2: جذب التغييرات من السحابة ودمجها محلياً
      await pullAndMerge();

      // المرحلة 3: تحديث UI
      notifySyncComplete();
      console.log('[Sync] Completed');
    } catch (e) {
      console.error('[Sync] Sync error:', e);
    } finally {
      isSyncing = false;
      updateStatusIndicators();
    }
  }

  async function pullAndMerge() {
    var storage = getStorage();
    if (!storage || !storage.fetchRemoteOrders || !storage.mergeRemoteOrders) {
      console.warn('[Sync] pullAndMerge skipped: storage or methods unavailable');
      return;
    }

    try {
      // جذب الطلبات من السحابة
      var remoteOrders = await storage.fetchRemoteOrders();
      console.log('[Sync] Fetched', remoteOrders ? remoteOrders.length : 0, 'orders from remote');
      if (remoteOrders && remoteOrders.length) {
        var result = await storage.mergeRemoteOrders(remoteOrders);
        console.log('[Sync] mergeRemoteOrders result:', result);
        if (result.changed) {
          console.log('[Sync] Merged', result.count, 'remote orders, local data updated');
        } else {
          console.log('[Sync] No order changes needed after merge');
        }
      } else {
        console.log('[Sync] No remote orders to merge');
      }
    } catch (e) {
      console.warn('[Sync] Pull orders failed:', e.message);
    }

    try {
      // جذب الـ schema من السحابة
      var remoteSchema = await storage.fetchRemoteSchema();
      if (remoteSchema && remoteSchema.length) {
        await storage.mergeRemoteSchema(remoteSchema);
        console.log('[Sync] Merged remote schema');
      }
    } catch (e) {
      console.warn('[Sync] Pull schema failed:', e.message);
    }

    // تسجيل وقت آخر مزامنة ناجحة
    try {
      var IDB = getIDB();
      if (IDB) await IDB.setMetadata('last_sync_at', new Date().toISOString());
    } catch (e) { /* ignore */ }
  }

  function notifySyncComplete() {
    // إعلام باقي التطبيق بإعادة تحميل البيانات
    if (window.DOMS && window.DOMS.onSyncComplete) {
      window.DOMS.onSyncComplete();
    }
    // إطلاق حدث مخصص
    try {
      window.dispatchEvent(new CustomEvent('doms:sync-complete', { detail: { timestamp: new Date().toISOString() } }));
    } catch (e) { /* ignore */ }
  }

  async function processSyncItem(item) {
    console.log('[Sync] processSyncItem:', item.action, item.table, item.recordId);
    var storage = getStorage();
    if (!storage) throw new Error('Storage not available');
    var client = storage.getClient();
    if (!client) throw new Error('Supabase not available');

    if (item.table === 'orders') {
      if (item.action === 'insert') {
        // تحقق إذا الطلب موجود قبل الإدراج (للتجنب تكرار UUID)
        var existing = await client.from('orders').select('id').eq('id', item.recordId).limit(1);
        console.log('[Sync] insert check existing:', existing);
        if (existing && existing.data && existing.data.length) {
          // موجود - تحديث بدل إدراج
          console.log('[Sync] Order exists, updating instead of insert');
          await storage.updateRemoteOrder(item.recordId, {
            status: item.data.status,
            reference: item.data.reference,
            data: item.data.data
          });
        } else {
          console.log('[Sync] Order not found, inserting new');
          await storage.insertRemoteOrder(item.data);
        }
      } else if (item.action === 'update') {
        console.log('[Sync] Updating order', item.recordId);
        await storage.updateRemoteOrder(item.recordId, item.data);
      } else if (item.action === 'delete') {
        console.log('[Sync] Deleting order', item.recordId);
        await storage.deleteRemoteOrder(item.recordId);
      }
    } else if (item.table === 'schema_fields') {
      if (item.action === 'update' && item.data) {
        // لا نحفظ schema مباشرة للسحابة - نترك pullAndMerge تتعامل مع الدمج
        await storage.saveSchema(item.data);
      }
    }
    console.log('[Sync] processSyncItem completed:', item.action, item.table, item.recordId);
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
    var IDB = getIDB();
    if (syncPill) {
      if (isSyncing) {
        syncPill.textContent = '🔄 يتم المزامنة...';
        syncPill.className = 'status-pill syncing';
      } else if (IDB) {
        IDB.getPendingSyncItems().then(function (items) {
          if (items.length > 0) {
            syncPill.textContent = '⏳ ' + items.length + ' تغيير معلق';
            syncPill.className = 'status-pill pending';
          } else {
            IDB.getMetadata('last_sync_at').then(function (ts) {
              if (ts) {
                var d = new Date(ts);
                var timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                syncPill.textContent = '✅ متزامن ' + timeStr;
              } else {
                syncPill.textContent = '✅ متزامن';
              }
              syncPill.className = 'status-pill synced';
            }).catch(function () {
              syncPill.textContent = '✅ متزامن';
              syncPill.className = 'status-pill synced';
            });
          }
        }).catch(function () {
          syncPill.textContent = '';
        });
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
