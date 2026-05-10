/**
 * indexeddb.js — طبقة التخزين المحلي باستخدام IndexedDB
 * بديل عن localStorage بسعة أكبر وأداء أفضل
 */
(function () {
  'use strict';

  var DB_NAME = 'doms_db';
  var DB_VERSION = 1;
  var db = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = function () { reject(request.error); };
      request.onsuccess = function () { db = request.result; resolve(db); };
      request.onupgradeneeded = function (event) {
        var database = event.target.result;
        // مخزن الحقول (schema)
        if (!database.objectStoreNames.contains('schema_fields')) {
          database.createObjectStore('schema_fields', { keyPath: 'id' });
        }
        // مخزن الطلبات
        if (!database.objectStoreNames.contains('orders')) {
          var ordersStore = database.createObjectStore('orders', { keyPath: 'id' });
          ordersStore.createIndex('createdAt', 'createdAt', { unique: false });
          ordersStore.createIndex('reference', 'reference', { unique: false });
        }
        // مخزن queue المزامنة
        if (!database.objectStoreNames.contains('sync_queue')) {
          var syncStore = database.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        // مخزن التعارضات
        if (!database.objectStoreNames.contains('conflicts')) {
          database.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
        }
        // مخزن الميتاداتا
        if (!database.objectStoreNames.contains('metadata')) {
          database.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  function getStore(name, mode) {
    return openDB().then(function (database) {
      var tx = database.transaction(name, mode || 'readonly');
      return tx.objectStore(name);
    });
  }

  // ── Schema Fields ──
  function getAllSchemaFields() {
    return getStore('schema_fields').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function putSchemaField(field) {
    return getStore('schema_fields', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.put(field);
        request.onsuccess = function () { resolve(field); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function deleteSchemaField(id) {
    return getStore('schema_fields', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function clearSchemaFields() {
    return getStore('schema_fields', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.clear();
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // ── Orders ──
  function getAllOrders() {
    return getStore('orders').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.getAll();
        request.onsuccess = function () {
          var results = request.result || [];
          // ترتيب حسب التاريخ
          results.sort(function (a, b) {
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          });
          resolve(results);
        };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function getOrder(id) {
    return getStore('orders').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.get(id);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function putOrder(order) {
    return getStore('orders', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.put(order);
        request.onsuccess = function () { resolve(order); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function deleteOrder(id) {
    return getStore('orders', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function clearOrders() {
    return getStore('orders', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.clear();
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // ── Sync Queue ──
  function addToSyncQueue(item) {
    return getStore('sync_queue', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var record = {
          action: item.action,
          table: item.table,
          recordId: item.recordId,
          data: item.data,
          status: 'pending',
          timestamp: new Date().toISOString(),
          attempts: 0
        };
        var request = store.add(record);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function getPendingSyncItems() {
    return getStore('sync_queue').then(function (store) {
      return new Promise(function (resolve, reject) {
        var index = store.index('status');
        var request = index.getAll('pending');
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function updateSyncItemStatus(id, status) {
    return getStore('sync_queue', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var getReq = store.get(id);
        getReq.onsuccess = function () {
          var item = getReq.result;
          if (!item) { resolve(); return; }
          item.status = status;
          if (status === 'failed') item.attempts = (item.attempts || 0) + 1;
          var putReq = store.put(item);
          putReq.onsuccess = function () { resolve(); };
          putReq.onerror = function () { reject(putReq.error); };
        };
        getReq.onerror = function () { reject(getReq.error); };
      });
    });
  }

  function removeSyncItem(id) {
    return getStore('sync_queue', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function clearSyncQueue() {
    return getStore('sync_queue', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.clear();
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // ── Metadata ──
  function getMetadata(key) {
    return getStore('metadata').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.get(key);
        request.onsuccess = function () { resolve(request.result ? request.result.value : null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function setMetadata(key, value) {
    return getStore('metadata', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var request = store.put({ key: key, value: value });
        request.onsuccess = function () { resolve(value); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // ── Migration من localStorage ──
  function migrateFromLocalStorage() {
    var CFG = window.DOMS && window.DOMS.config;
    if (!CFG) return Promise.resolve();
    var migrated = false;
    try {
      // ترحيل schema
      var rawSchema = localStorage.getItem(CFG.SCHEMA_LOCAL);
      if (rawSchema) {
        var schema = JSON.parse(rawSchema);
        if (Array.isArray(schema) && schema.length > 0) {
          schema.forEach(function (field) {
            putSchemaField(field);
          });
        }
      }
      // ترحيل الطلبات
      var rawOrders = localStorage.getItem(CFG.ORDERS_LOCAL);
      if (rawOrders) {
        var orders = JSON.parse(rawOrders);
        if (Array.isArray(orders) && orders.length > 0) {
          orders.forEach(function (order) {
            putOrder(order);
          });
          migrated = true;
        }
      }
    } catch (e) {
      console.warn('IDB migration error:', e);
    }
    return Promise.resolve(migrated);
  }

  window.DOMS = window.DOMS || {};
  window.DOMS.indexedDB = {
    openDB: openDB,
    // Schema
    getAllSchemaFields: getAllSchemaFields,
    putSchemaField: putSchemaField,
    deleteSchemaField: deleteSchemaField,
    clearSchemaFields: clearSchemaFields,
    // Orders
    getAllOrders: getAllOrders,
    getOrder: getOrder,
    putOrder: putOrder,
    deleteOrder: deleteOrder,
    clearOrders: clearOrders,
    // Sync Queue
    addToSyncQueue: addToSyncQueue,
    getPendingSyncItems: getPendingSyncItems,
    updateSyncItemStatus: updateSyncItemStatus,
    removeSyncItem: removeSyncItem,
    clearSyncQueue: clearSyncQueue,
    // Metadata
    getMetadata: getMetadata,
    setMetadata: setMetadata,
    // Migration
    migrateFromLocalStorage: migrateFromLocalStorage
  };
})();
