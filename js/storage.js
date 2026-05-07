/**
 * storage.js — يجمع المصدر بين localStorage وبين Supabase (جداول schema_fields / orders)
 * حسب الدالة getClient(). مسار «النسخ المحلي احتياطي» يصدّر الاثنين معًا.
 */
(function () {
  var CFG = window.DOMS.config;
  var ENG = window.DOMS.engine;

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

    sharedClient = window.supabase.createClient(creds.url, creds.key);
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
      data: r.data,
    });
  }

  async function fetchRemoteOrders() {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var res = await client.from('orders').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(remoteRowToOrder);
  }

  async function insertRemoteOrder(order) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var n = ENG.normalizeOrder(order);
    var row = {
      reference: n.reference,
      status: n.status,
      created_at: n.createdAt,
      data: n.data || {},
    };
    var oid = n.id;
    if (oid && ENG.isUuid(String(oid))) row.id = oid;

    var res = await client.from('orders').insert(row).select().single();
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
    if (Object.keys(up).length === 0)
      throw new Error('لا توجد حقول للتحديث');

    var res = await client.from('orders').update(up).eq('id', id).select().single();
    if (res.error) throw res.error;
    return remoteRowToOrder(res.data);
  }

  async function deleteRemoteOrder(id) {
    var client = getClient();
    if (!client) throw new Error('Supabase غير مُهيّأ');
    var res = await client.from('orders').delete().eq('id', id);
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

  /** Replace-all remote schema avoids complex diff; good enough for v1 */
  async function saveSchema(fields) {
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) {
      return upsertRemoteSchema(fields);
    }
    return Promise.resolve(writeLocalSchema(fields));
  }

  async function loadSchema(createDefaultIfEmpty) {
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) {
      var remote = await fetchRemoteSchema().catch(function () {
        return null;
      });
      if (remote && remote.length) return remote;
      if (createDefaultIfEmpty) return saveSchema(ENG.defaultDemoSchema());
      return [];
    }

    var local = readLocalSchema();
    if (local && local.length) return ENG.sortFields(local);
    if (createDefaultIfEmpty) return saveSchema(ENG.defaultDemoSchema());
    return ENG.sortFields(local || []);
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
    if (creds.useSupabase && getClient()) {
      var rows = await fetchRemoteOrders();
      return ENG.sortOrdersByDate(rows);
    }
    return hydrateLocalOrders();
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
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) return insertRemoteOrder(n);

    var all = hydrateLocalOrders();
    all.unshift(n);
    writeLocalOrders(ENG.sortOrdersByDate(all));
    return n;
  }

  async function updateOrder(id, patch) {
    patch = patch || {};
    if (patch.status !== undefined && !ENG.isValidOrderStatus(String(patch.status)))
      throw new Error('حالة غير معروفة');

    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) return updateRemoteOrder(id, patch);

    var all = hydrateLocalOrders();
    var ix = all.findIndex(function (o) {
      return String(o.id) === String(id);
    });
    if (ix < 0) throw new Error('الطلب غير موجود');
    var cur = Object.assign({}, all[ix]);
    if (patch.status !== undefined) cur.status = patch.status;
    if (patch.reference !== undefined) cur.reference = String(patch.reference || '').trim() || cur.reference;
    if (patch.data !== undefined) cur.data = patch.data;
    cur = ENG.normalizeOrder(cur);
    all[ix] = cur;
    writeLocalOrders(ENG.sortOrdersByDate(all));
    return cur;
  }

  async function removeOrder(id) {
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) return deleteRemoteOrder(id);
    var all = readLocalOrders().filter(function (o) {
      return o.id !== id;
    });
    writeLocalOrders(all);
  }

  async function replaceAllOrders(seed) {
    var creds = CFG.getSupabaseCredentials();
    if (creds.useSupabase && getClient()) throw new Error('مزامنة جماعية غير مدعومة للسحابة في هذا الإصدار');
    writeLocalOrders(seed || []);
    return seed || [];
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
