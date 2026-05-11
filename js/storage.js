/**
 * storage.js — يجمع المصدر بين IndexedDB (محلي) وبين Supabase (سحابي)
 * مع مزامنة تلقائية ودعم العمل بدون إنترنت.
 */
(function () {
  var CFG = window.DOMS.config;
  var ENG = window.DOMS.engine;
  var IDB = window.DOMS.indexedDB;
  function getSync() { return window.DOMS && window.DOMS.sync; }

  function readLocalSchema() {
    try {
      var raw = localStorage.getItem(CFG.SCHEMA_LOCAL);
      if (!raw) return null;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr.map(function (x) {
        return ENG.normalizeField(x, []);
      });
    } catch (e) {
      return null;
    }
  }

  function writeLocalSchema(fields) {
    var normalized = fields.map(function (f, idx) {
      var n = ENG.normalizeField(f, fields.filter(function (_, i) {
        return i !== idx;
      }));
      n.order = idx * 10;
      return n;
    });
    localStorage.setItem(CFG.SCHEMA_LOCAL, JSON.stringify(normalized));
    return normalized;
  }

  function readLocalOrders() {
    try {
      var raw = localStorage.getItem(CFG.ORDERS_LOCAL);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalOrders(orders) {
    localStorage.setItem(CFG.ORDERS_LOCAL, JSON.stringify(orders));
  }

  var sharedClient = null;

  function getClient() {
    var creds = CFG.getSupabaseCredentials();
    if (!creds.useSupabase || !creds.url || !creds.key) return null;
    if (!window.supabase || !window.supabase.createClient) return null;

    // استخدام العميل المشترك إذا كان متوافقاً
    if (sharedClient) {
      return sharedClient;
    }

    // محاولة استخدام عميل auth.js إذا كان موجوداً
    if (window.DOMS && window.DOMS.authClient) {
      sharedClient = window.DOMS.authClient;
      return sharedClient;
    }

    sharedClient = window.supabase.createClient(creds.url, creds.key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    window.DOMS.authClient = sharedClient;
    return sharedClient;
  }

  async function upsertRemoteSchema(fields) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var sorted = ENG.sortFields(fields);
    var rows = sorted.map(function (f, idx) {
      return {
        id: ENG.isUuid(f.id) ? f.id : ENG.uuidV4(),
        slug: f.slug,
        label: f.label,
        field_type: f.type,
        required: f.required,
        show_in_form: f.showInForm,
        show_in_table: f.showInTable,
        searchable: f.searchable,
        filterable: f.filterable,
        sort_order: idx * 10,
        is_hidden: f.hidden,
        options: f.options || [],
      };
    });
    var incoming = {};
    rows.forEach(function (r) {
      incoming[r.id] = true;
    });

    var prev = await client.from('schema_fields').select('id');
    if (prev.error && prev.error.message) console.warn(prev.error);
    else if (prev.data) {
      for (var i = 0; i < prev.data.length; i++) {
        var rid = prev.data[i].id;
        if (!incoming[rid]) {
          var rm = await client.from('schema_fields').delete().eq('id', rid);
          if (rm.error && rm.error.message) console.warn(rm.error);
        }
      }
    }

    var up = await client.from('schema_fields').upsert(rows, { onConflict: 'id' });
    if (up.error) throw up.error;

    var again = await client.from('schema_fields').select('*').order('sort_order', { ascending: true });
    if (again.error) throw again.error;
    return (again.data || []).map(function (r) {
      return ENG.normalizeField(
        {
          id: r.id,
          slug: r.slug,
          label: r.label,
          type: r.field_type,
          required: r.required,
          showInForm: r.show_in_form,
          showInTable: r.show_in_table,
          searchable: r.searchable,
          filterable: r.filterable,
          order: r.sort_order,
          hidden: r.is_hidden,
          options: Array.isArray(r.options) ? r.options : [],
        },
        []
      );
    });
  }

  async function fetchRemoteSchema() {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var res = await client.from('schema_fields').select('*').order('sort_order', { ascending: true });
    if (res.error) throw res.error;
    var list = res.data || [];
    return list.map(function (r) {
      return ENG.normalizeField(
        {
          id: r.id,
          slug: r.slug,
          label: r.label,
          type: r.field_type,
          required: r.required,
          showInForm: r.show_in_form,
          showInTable: r.show_in_table,
          searchable: r.searchable,
          filterable: r.filterable,
          order: r.sort_order,
          hidden: r.is_hidden,
          options: Array.isArray(r.options) ? r.options : [],
        },
        []
      );
    });
  }

  function remoteRowToOrder(r) {
    return ENG.normalizeOrder({
      id: r.id,
      reference: r.reference,
      status: r.status,
      createdAt: r.created_at,
      created_at: r.created_at,
      updatedAt: r.updated_at,
      updated_at: r.updated_at,
      data: r.data,
    });
  }

  async function fetchRemoteOrders() {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var res = await client.from('orders').select('*').order('created_at', { ascending: false });
    console.log('[Storage] fetchRemoteOrders res:', res);
    if (res.error) throw res.error;
    var orders = (res.data || []).map(remoteRowToOrder);
    console.log('[Storage] fetchRemoteOrders parsed:', orders.length, 'orders');
    return orders;
  }

  async function insertRemoteOrder(order) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var n = ENG.normalizeOrder(order);
    var row = {
      reference: n.reference,
      status: n.status,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      data: n.data || {},
    };
    var oid = n.id;
    if (oid && ENG.isUuid(String(oid))) row.id = oid;

    var user = null;
    try {
      var sess = await client.auth.getSession();
      user = sess?.data?.session?.user || null;
    } catch (e) { /* ignore */ }
    if (user && user.id) row.user_id = user.id;

    console.log('[Storage] insertRemoteOrder row:', row);
    var res = await client.from('orders').insert(row).select().single();
    console.log('[Storage] insertRemoteOrder res:', res);
    if (res.error) throw res.error;
    return remoteRowToOrder(res.data);
  }

  async function updateRemoteOrder(id, patch) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var up = {};
    if (patch.status !== undefined) up.status = patch.status;
    if (patch.reference !== undefined) up.reference = patch.reference;
    if (patch.data !== undefined) up.data = patch.data;
    up.updated_at = new Date().toISOString();
    if (Object.keys(up).length === 0)
      throw new Error('لا توجد حقول للتحديث');

    var res = await client.from('orders').update(up).eq('id', id).select().single();
    if (res.error) throw res.error;
    return remoteRowToOrder(res.data);
  }

  async function deleteRemoteOrder(id) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    console.log('[Storage] deleteRemoteOrder calling Supabase for id:', id);
    var res = await client.from('orders').delete().eq('id', id);
    console.log('[Storage] deleteRemoteOrder res:', res);
    if (res.error) throw res.error;
  }

  async function clearRemoteOrders() {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var sel = await client.from('orders').select('id');
    if (sel.error) throw sel.error;
    var rows = sel.data || [];
    for (var i = 0; i < rows.length; i++) {
      var rm = await client.from('orders').delete().eq('id', rows[i].id);
      if (rm.error) throw rm.error;
    }
  }

  function dedupeFields(fields) {
    var seen = {};
    return fields.filter(function (f) {
      var key = f.slug || f.label || '';
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /** Replace-all remote schema avoids complex diff; good enough for v1 */
  async function saveSchema(fields) {
    var creds = CFG.getSupabaseCredentials();

    // إزالة التكرارات قبل الحفظ
    var clean = dedupeFields(fields || []);

    // حفظ في IndexedDB دائماً
    await IDB.clearSchemaFields();
    for (var i = 0; i < clean.length; i++) {
      await IDB.putSchemaField(clean[i]);
    }
    // حفظ في localStorage كاحتياطي
    writeLocalSchema(clean);

    if (creds.useSupabase && getClient()) {
      try {
        return await upsertRemoteSchema(clean);
      } catch (e) {
        console.warn('[Storage] Remote schema save failed, queued for sync:', e.message || e);
        var s = getSync(); if (s) s.queueSchemaUpdate(fields);
      }
    }
    return ENG.sortFields(clean);
  }

  async function loadSchema(createDefaultIfEmpty) {
    var creds = CFG.getSupabaseCredentials();
    // محاولة تحميل من IndexedDB أولاً
    var idbFields = await IDB.getAllSchemaFields().catch(function () { return null; });
    if (idbFields && idbFields.length) {
      // إزالة أي تكرارات قد تكون نتجت عن migration قديم
      var clean = dedupeFields(idbFields);
      if (clean.length !== idbFields.length) {
        console.warn('[Storage] Found', idbFields.length - clean.length, 'duplicate schema fields, cleaning up');
        await IDB.clearSchemaFields();
        for (var i = 0; i < clean.length; i++) {
          await IDB.putSchemaField(clean[i]);
        }
      }
      // محاولة تحديث من السحابة إذا كان متصل
      if (creds.useSupabase && getClient() && navigator.onLine) {
        try {
          var remote = await fetchRemoteSchema();
          if (remote && remote.length) {
            // نستخدم mergeRemoteSchema بدل الاستبدال الكامل — عشان نمسك التغييرات المحلية
            var merged = await mergeRemoteSchema(remote);
            return ENG.sortFields(merged);
          }
        } catch (e) {
          console.warn('[Storage] Remote schema fetch failed, using IndexedDB:', e.message);
        }
      }
      writeLocalSchema(clean);
      return ENG.sortFields(clean);
    }

    // احتياطي: التحقق من localStorage
    var local = readLocalSchema();
    if (local && local.length) {
      var cleanLocal = dedupeFields(local);
      // ترحيل إلى IndexedDB
      for (var k = 0; k < cleanLocal.length; k++) {
        await IDB.putSchemaField(cleanLocal[k]);
      }
      if (cleanLocal.length !== local.length) {
        writeLocalSchema(cleanLocal);
      }
      return ENG.sortFields(cleanLocal);
    }
    if (createDefaultIfEmpty) return saveSchema(ENG.defaultDemoSchema());
    return [];
  }

  function hydrateLocalOrders() {
    var raw = readLocalOrders();
    var next = [];
    var dirty = false;
    raw.forEach(function (r, i) {
      var n = ENG.normalizeOrder(r);
      next.push(n);
      var o = raw[i];
      if (!o.reference || String(o.reference) !== String(n.reference)) dirty = true;
      if ((o.status || 'new') !== (n.status || 'new')) dirty = true;
    });
    var sorted = ENG.sortOrdersByDate(next);
    if (dirty && sorted.length >= 0) writeLocalOrders(sorted);
    return sorted;
  }

  async function loadOrders() {
    var creds = CFG.getSupabaseCredentials();
    // محاولة تحميل من IndexedDB أولاً
    var idbOrders = await IDB.getAllOrders().catch(function (e) {
      console.warn('[Storage] IndexedDB read failed:', e.message || e);
      return null;
    });

    // إذا IndexedDB فارغ، حاول استرجاع من localStorage وإعادة بناء IndexedDB
    if (!idbOrders || !idbOrders.length) {
      console.log('[Storage] IndexedDB empty, trying localStorage fallback...');
      var local = hydrateLocalOrders();
      if (local && local.length) {
        console.log('[Storage] Found', local.length, 'orders in localStorage, restoring IndexedDB');
        for (var j = 0; j < local.length; j++) {
          await IDB.putOrder(local[j]);
        }
        return ENG.sortOrdersByDate(local);
      }
      // لا توجد بيانات محلية - محاولة السحابة
      if (creds.useSupabase && getClient() && navigator.onLine) {
        try {
          var rows = await fetchRemoteOrders();
          if (rows && rows.length) {
            await mergeRemoteOrders(rows);
            return ENG.sortOrdersByDate(rows);
          }
        } catch (e) {
          console.warn('[Storage] Remote orders fetch failed:', e.message);
        }
      }
      return [];
    }

    // IndexedDB يحتوي على بيانات
    if (creds.useSupabase && getClient() && navigator.onLine) {
      try {
        var remoteRows = await fetchRemoteOrders();
        if (remoteRows && remoteRows.length) {
          var merged = await mergeRemoteOrders(remoteRows);
          if (merged.changed) {
            console.log('[Storage] Merged', merged.count, 'remote orders during load');
          }
          var allAfterMerge = await IDB.getAllOrders();
          return ENG.sortOrdersByDate(allAfterMerge);
        }
      } catch (e) {
        console.warn('[Storage] Remote orders fetch failed, using IndexedDB:', e.message);
      }
    }

    // حافظ على نسخة احتياطية في localStorage
    writeLocalOrders(ENG.sortOrdersByDate(idbOrders));
    return ENG.sortOrdersByDate(idbOrders);
  }

  function saveOrdersLocalSnapshot(orders) {
    writeLocalOrders(orders);
  }

  async function persistOrders(next) {
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) throw new Error('استخدم عمليات الطلب المنفردة مع السحابة');
    writeLocalOrders(next);
    return next;
  }

  async function appendOrder(order) {
    var n = ENG.normalizeOrder(order);
    n.updatedAt = new Date().toISOString();
    console.log('[Storage] appendOrder:', n.id, 'online=', navigator.onLine);
    var creds = CFG.getSupabaseCredentials();

    // حفظ دائماً في IndexedDB
    await IDB.putOrder(n);
    // حفظ snapshot في localStorage - لا تكتب [] إذا IndexedDB فارغ
    var all = await IDB.getAllOrders();
    if (all && all.length > 0) {
      writeLocalOrders(ENG.sortOrdersByDate(all));
    } else {
      // IndexedDB فارغ بشكل غير متوقع - أضف الطلب الجديد لـ localStorage على الأقل
      var localBackup = readLocalOrders();
      localBackup.unshift(n);
      writeLocalOrders(ENG.sortOrdersByDate(localBackup));
    }

    if (creds.useSupabase && getClient()) {
      if (navigator.onLine) {
        try {
          var remote = await insertRemoteOrder(n);
          console.log('[Storage] appendOrder remote insert success:', remote.id);
          return remote;
        } catch (e) {
          console.warn('[Storage] Remote insert failed, queued for sync:', e.message || e);
          var s = getSync(); if (s) s.queueOrderInsert(n);
        }
      } else {
        console.log('[Storage] appendOrder offline, queuing insert');
        var s = getSync(); if (s) s.queueOrderInsert(n);
      }
    } else {
      console.log('[Storage] appendOrder: Supabase not configured, local only');
    }

    return n;
  }

  async function updateOrder(id, patch) {
    patch = patch || {};
    if (patch.status !== undefined && !ENG.isValidOrderStatus(String(patch.status)))
      throw new Error('حالة غير معروفة');

    var creds = CFG.getSupabaseCredentials();

    // تحديث IndexedDB دائماً
    var order = await IDB.getOrder(id);
    if (!order) {
      // إذا غير موجود في IndexedDB، جرب localStorage
      var local = hydrateLocalOrders();
      order = local.find(function (o) { return String(o.id) === String(id); });
      if (!order) throw new Error('الطلب غير موجود');
    }

    if (patch.status !== undefined) order.status = patch.status;
    if (patch.reference !== undefined) order.reference = String(patch.reference || '').trim() || order.reference;
    if (patch.data !== undefined) order.data = patch.data;
    order = ENG.normalizeOrder(order);
    order.updatedAt = new Date().toISOString();
    await IDB.putOrder(order);

    // حفظ snapshot في localStorage - لا تكتب [] إذا IndexedDB فارغ
    var all = await IDB.getAllOrders();
    if (all && all.length > 0) {
      writeLocalOrders(ENG.sortOrdersByDate(all));
    } else {
      // IndexedDB فارغ - حدث localStorage يدوياً
      var localBackup = hydrateLocalOrders();
      var ix = localBackup.findIndex(function (o) { return String(o.id) === String(id); });
      if (ix >= 0) localBackup[ix] = order; else localBackup.unshift(order);
      writeLocalOrders(ENG.sortOrdersByDate(localBackup));
    }

    if (creds.useSupabase && getClient()) {
      if (navigator.onLine) {
        try {
          return await updateRemoteOrder(id, patch);
        } catch (e) {
          console.warn('[Storage] Remote update failed, queued for sync:', e.message || e);
          var s = getSync(); if (s) s.queueOrderUpdate(id, patch);
        }
      } else {
        var s = getSync(); if (s) s.queueOrderUpdate(id, patch);
      }
    }

    return order;
  }

  async function removeOrder(id) {
    console.log('[Storage] removeOrder:', id, 'online=', navigator.onLine);
    var creds = CFG.getSupabaseCredentials();

    // حذف من IndexedDB دائماً
    await IDB.deleteOrder(id);
    // تحديث localStorage - لا تكتب [] إذا IndexedDB فارغ
    var all = await IDB.getAllOrders();
    if (all && all.length >= 0) {
      writeLocalOrders(all.filter(function (o) { return o.id !== id; }));
    } else {
      // IndexedDB فارغ - حدث localStorage يدوياً
      var localBackup = readLocalOrders().filter(function (o) { return o.id !== id; });
      writeLocalOrders(localBackup);
    }

    if (creds.useSupabase && getClient()) {
      if (navigator.onLine) {
        try {
          var res = await deleteRemoteOrder(id);
          console.log('[Storage] removeOrder remote delete success:', id);
          return res;
        } catch (e) {
          console.warn('[Storage] Remote delete failed, queued for sync:', e.message || e);
          var s = getSync(); if (s) s.queueOrderDelete(id);
        }
      } else {
        console.log('[Storage] removeOrder offline, queuing delete');
        var s2 = getSync(); if (s2) s2.queueOrderDelete(id);
      }
    } else {
      console.log('[Storage] removeOrder: Supabase not configured, local only');
    }
  }

  async function replaceAllOrders(seed) {
    var creds = CFG.getSupabaseCredentials();
    seed = seed || [];

    // حفظ في IndexedDB
    await IDB.clearOrders();
    for (var i = 0; i < seed.length; i++) {
      await IDB.putOrder(seed[i]);
    }
    writeLocalOrders(seed);

    if (creds.useSupabase && getClient()) {
      if (navigator.onLine) {
        try {
          await clearRemoteOrders();
          for (var j = 0; j < seed.length; j++) {
            await insertRemoteOrder(seed[j]);
          }
        } catch (e) {
          console.warn('[Storage] Remote replace failed:', e.message || e);
        }
      }
    }
    return seed;
  }

  // ── Bidirectional Sync: Merge remote changes ──
  async function mergeRemoteOrders(remoteOrders) {
    remoteOrders = remoteOrders || [];
    var localOrders = await IDB.getAllOrders().catch(function () { return []; });
    console.log('[Storage] mergeRemoteOrders: local=' + localOrders.length + ', remote=' + remoteOrders.length);
    var localMap = {};
    localOrders.forEach(function (o) { localMap[o.id] = o; });

    // بناء خريطة للطلبات البعيدة
    var remoteMap = {};
    remoteOrders.forEach(function (r) { remoteMap[r.id] = r; });

    var added = 0;
    var updated = 0;
    var deleted = 0;

    // المرحلة 1: إضافة/تحديث الطلبات من السحابة
    for (var i = 0; i < remoteOrders.length; i++) {
      var r = remoteOrders[i];
      var local = localMap[r.id];
      if (!local) {
        // طلب جديد من جهاز آخر
        await IDB.putOrder(r);
        added++;
      } else {
        var rTime = new Date(r.updatedAt || r.createdAt || 0).getTime();
        var lTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
        if (rTime > lTime) {
          // الجهاز الآخر عدّل أحدث
          await IDB.putOrder(r);
          updated++;
        }
      }
    }

    // المرحلة 2: حذف الطلبات المحلية اللي اتحذفت من السحابة
    // نحذف بس لو: (1) السحابة فيها بيانات (يعني الجهاز ده شاف بيانات قبل كده)
    // أو (2) عملنا sync قبل كده (last_sync_at موجود)
    var lastSync = await IDB.getMetadata('last_sync_at').catch(function () { return null; });
    var hasSyncedBefore = !!lastSync;
    if (remoteOrders.length > 0 || hasSyncedBefore) {
      for (var j = 0; j < localOrders.length; j++) {
        var lo = localOrders[j];
        if (!remoteMap[lo.id]) {
          // الطلب ده مش موجود في السحابة = اتمسح
          await IDB.deleteOrder(lo.id);
          deleted++;
        }
      }
    }

    var changed = added > 0 || updated > 0 || deleted > 0;
    console.log('[Storage] mergeRemoteOrders: added=' + added + ', updated=' + updated + ', deleted=' + deleted + ', changed=' + changed);

    // تحديث localStorage
    var merged = await IDB.getAllOrders();
    writeLocalOrders(ENG.sortOrdersByDate(merged));
    return { changed: changed, count: remoteOrders.length, added: added, updated: updated, deleted: deleted };
  }

  async function mergeRemoteSchema(remoteFields) {
    remoteFields = remoteFields || [];
    var localFields = await IDB.getAllSchemaFields().catch(function () { return []; });

    // دمج: احتفظ بكل الحقول من الطرفين، استخدم الأحدث عند التعارض
    var merged = {};
    localFields.forEach(function (f) {
      var key = f.id || f.slug || f.label;
      merged[key] = f;
    });

    remoteFields.forEach(function (r) {
      var key = r.id || r.slug || r.label;
      var local = merged[key];
      if (!local) {
        merged[key] = r;
      } else {
        var rTime = new Date(r.updatedAt || 0).getTime();
        var lTime = new Date(local.updatedAt || 0).getTime();
        if (rTime > lTime) merged[key] = r;
      }
    });

    var result = dedupeFields(Object.values(merged));
    await IDB.clearSchemaFields();
    for (var i = 0; i < result.length; i++) {
      await IDB.putSchemaField(result[i]);
    }
    writeLocalSchema(result);
    return result;
  }

  async function testConnection() {
    return probeSupabase('');
  }

  async function probeSupabase(urlHint, keyHint) {
    if (!window.supabase || !window.supabase.createClient) {
      return { ok: false, msg: 'مكتبة Supabase غير محمّلة من الشبكة' };
    }
    var creds = CFG.getSupabaseCredentials();
    var url = (urlHint || creds.url || '').trim();
    var key = (keyHint || creds.key || '').trim();
    if (!url || !key) return { ok: false, msg: 'أدخل رابط المشروع والمفتاح أولاً' };
    var client = window.supabase.createClient(url, key);
    try {
      var r = await client.from('schema_fields').select('id').limit(1);
      if (r.error && r.error.message) {
        return { ok: false, msg: r.error.message };
      }
      return { ok: true, msg: 'الاتصال ناجح' };
    } catch (e) {
      return { ok: false, msg: String(e && e.message ? e.message : e) };
    }
  }

  ENG.sortOrdersByDate = function (orders) {
    return (orders || [])
      .slice()
      .sort(function (a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  };

  window.DOMS = window.DOMS || {};
  window.DOMS.storage = {
    readLocalSchema: readLocalSchema,
    writeLocalSchema: writeLocalSchema,
    saveSchema: saveSchema,
    loadSchema: loadSchema,
    loadOrders: loadOrders,
    persistOrders: persistOrders,
    appendOrder: appendOrder,
    removeOrder: removeOrder,
    updateOrder: updateOrder,
    replaceAllOrders: replaceAllOrders,
    clearRemoteOrders: clearRemoteOrders,
    saveOrdersLocalSnapshot: saveOrdersLocalSnapshot,
    getClient: getClient,
    testConnection: testConnection,
    probeSupabase: probeSupabase,
    mergeRemoteOrders: mergeRemoteOrders,
    mergeRemoteSchema: mergeRemoteSchema,
    fetchRemoteOrders: fetchRemoteOrders,
    fetchRemoteSchema: fetchRemoteSchema,
    exportBlob: async function () {
      var schema = await loadSchema(false);
      var orders = await loadOrders();
      return JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          schema: schema,
          orders: orders,
        },
        null,
        2
      );
    },
    importBlob: async function (parsed) {
      if (!parsed || typeof parsed !== 'object') throw new Error('ملف غير صالح');
      var schema = Array.isArray(parsed.schema) ? parsed.schema : [];
      var orders = Array.isArray(parsed.orders) ? parsed.orders : [];

      var creds = CFG.getSupabaseCredentials();
      var cloud = creds.useSupabase && !!getClient();
      var normalizedOrders = orders.map(normalizeImportedOrder);

      var normalizedSchema = [];
      schema.forEach(function (x) {
        normalizedSchema.push(ENG.normalizeField(x, normalizedSchema));
      });

      await saveSchema(normalizedSchema);

      if (!cloud) {
        await replaceAllOrders(normalizedOrders);
      } else {
        await clearRemoteOrders();
        for (var i = 0; i < normalizedOrders.length; i++) {
          await insertRemoteOrder(normalizedOrders[i]);
        }
      }

      return { schema: await loadSchema(false), orders: await loadOrders() };
    },
  };

  function normalizeImportedOrder(o) {
    var oid = o.id ? String(o.id) : '';
    return ENG.normalizeOrder({
      id: ENG.isUuid(oid) ? oid : ENG.uuidV4(),
      reference: o.reference,
      status: o.status,
      createdAt: o.createdAt || o.created_at || new Date().toISOString(),
      data: o.data || {},
    });
  }
})();
