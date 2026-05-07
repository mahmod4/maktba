/**
 * engine.js — منطق نقي للمخطّط والتحقّق والعرض الخفيف في الجدول والبحث
 * (بدون اعتماد على DOM). كل التغييرات هنا لا يجب أن تلمس شبكة الموارد.
 */
(function () {
  var TYPES = ['text', 'number', 'email', 'tel', 'textarea', 'date', 'datetime', 'select', 'checkbox'];

  function slugifyArabicFallback(label, existingSlugs) {
    var base = String(label || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u0600-\u06FF]/g, '')
      .slice(0, 40);
    if (!base) base = 'field';
    var s = base;
    var i = 0;
    var set = {};
    (existingSlugs || []).forEach(function (x) {
      set[x] = true;
    });
    while (set[s]) {
      i += 1;
      s = base + '_' + i;
    }
    return s;
  }

  function isUuid(s) {
    return (
      typeof s === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
    );
  }

  function uuidV4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function shortId() {
    return uuidV4().replace(/-/g, '').slice(0, 10);
  }

  function normalizeField(f, all) {
    var slugs = (all || [])
      .filter(function (x) {
        return x.id !== f.id;
      })
      .map(function (x) {
        return x.slug;
      });
    var slug = (f.slug || '').trim();
    if (!slug) slug = slugifyArabicFallback(f.label, slugs);
    if (slugs.indexOf(slug) >= 0) slug = slug + '_' + shortId().slice(0, 4);

    return {
      id: isUuid(f.id) ? f.id : uuidV4(),
      slug: slug,
      label: String(f.label || 'خانة').trim() || 'خانة',
      type: TYPES.indexOf(f.type) >= 0 ? f.type : 'text',
      required: !!f.required,
      showInForm: f.showInForm !== false,
      showInTable: f.showInTable !== false,
      searchable: f.searchable !== false,
      filterable: f.filterable !== false,
      order: typeof f.order === 'number' ? f.order : 0,
      hidden: !!f.hidden,
      options: Array.isArray(f.options) ? f.options.map(String) : parseOptionsText(f.optionsText || ''),
    };
  }

  function parseOptionsText(txt) {
    return String(txt || '')
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
  }

  function sortFields(fields) {
    return (fields || [])
      .slice()
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0) || String(a.label).localeCompare(String(b.label), 'ar');
      });
  }

  function visibleFormFields(fields) {
    return sortFields(fields).filter(function (f) {
      return !f.hidden && f.showInForm;
    });
  }

  function visibleTableFields(fields) {
    return sortFields(fields).filter(function (f) {
      return !f.hidden && f.showInTable;
    });
  }

  function filterableFields(fields) {
    return sortFields(fields).filter(function (f) {
      return !f.hidden && f.filterable && f.type === 'select';
    });
  }

  function searchableFields(fields) {
    return sortFields(fields).filter(function (f) {
      return !f.hidden && f.searchable;
    });
  }

  function formatCellValue(field, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (field.type === 'checkbox') return value ? 'نعم' : 'لا';
    if (field.type === 'datetime' && typeof value === 'string') {
      var d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toLocaleString('ar');
    }
    if (field.type === 'date' && typeof value === 'string') {
      var d2 = new Date(value);
      return isNaN(d2.getTime()) ? value : d2.toLocaleDateString('ar');
    }
    return String(value);
  }

  function matchesSearch(order, q, fields) {
    if (!q) return true;
    var needle = q.trim().toLowerCase();
    if (!needle) return true;
    var data = order.data || {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.searchable) continue;
      var v = data[f.slug];
      if (v === null || v === undefined) continue;
      var s = formatCellValue(f, v).toLowerCase();
      if (s.indexOf(needle) >= 0) return true;
    }
    return false;
  }

  /** دوال نظام الطلب: مرجع قابل للقراءة، حالة، بحث شامل */
  var ORDER_STATUSES = [
    { value: 'new', label: 'جديد' },
    { value: 'in_progress', label: 'قيد التنفيذ' },
    { value: 'done', label: 'مكتمل' },
    { value: 'cancelled', label: 'ملغى' },
  ];

  function isValidOrderStatus(st) {
    return ORDER_STATUSES.some(function (s) {
      return s.value === st;
    });
  }

  function orderStatusLabel(code) {
    for (var i = 0; i < ORDER_STATUSES.length; i++) {
      if (ORDER_STATUSES[i].value === code) return ORDER_STATUSES[i].label;
    }
    return code ? String(code) : '—';
  }

  function generateOrderReference() {
    var d = new Date();
    var yy = String(d.getFullYear()).slice(-2);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var rnd = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();
    return 'DOM-' + yy + mm + dd + '-' + rnd;
  }

  /**
   * يطابق شكل الطلب في الذاكرة/التخزين: يولِّد مرجعًا واحدًا عند الغياب
   * (يُنصَح بحفظ التخزين مرة واحدة بعد الترقية من نسخ قديمة).
   */
  function normalizeOrder(order) {
    order = order || {};
    var id = order.id ? String(order.id) : uuidV4();
    if (!isUuid(id)) id = uuidV4();
    var ref = order.reference ? String(order.reference).trim().replace(/\s+/g, ' ') : '';
    if (!ref) ref = generateOrderReference();

    var createdAt = order.createdAt || order.created_at;
    if (!createdAt)
      createdAt = new Date().toISOString();
    else if (typeof createdAt !== 'string')
      createdAt = new Date(createdAt).toISOString();

    var status = order.status ? String(order.status) : 'new';
    if (!isValidOrderStatus(status)) status = 'new';

    var data =
      typeof order.data === 'object' && order.data !== null && !Array.isArray(order.data)
        ? order.data
        : {};

    return { id: id, reference: ref, createdAt: createdAt, status: status, data: data };
  }

  function matchesOrderExtras(order, q) {
    if (!q) return false;
    var needle = q.trim().toLowerCase();
    if (!needle) return false;
    if ((order.reference || '').toLowerCase().indexOf(needle) >= 0) return true;
    var lab = orderStatusLabel(order.status || '');
    if (lab.toLowerCase().indexOf(needle) >= 0) return true;
    if ((order.status || '').toLowerCase().indexOf(needle) >= 0) return true;
    return false;
  }

  /** بحث عمومي: حقول الطلب أو المرجع أو الحالة */
  function matchesOrderSearch(order, q, fields) {
    if (!q || !String(q).trim()) return true;
    if (matchesSearch(order, q, fields)) return true;
    if (matchesOrderExtras(order, q)) return true;
    return false;
  }

  function matchesFilters(order, filters, fields) {
    var data = order.data || {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.filterable || f.type !== 'select') continue;
      var want = filters[f.slug];
      if (!want) continue;
      var got = data[f.slug];
      if (String(got || '') !== String(want)) return false;
    }
    return true;
  }

  function validateOrderData(fields, data) {
    var errors = [];
    visibleFormFields(fields).forEach(function (f) {
      var v = data[f.slug];
      if (f.required) {
        if (f.type === 'checkbox' && !v) errors.push('الحقل "' + f.label + '" مطلوب');
        else if (f.type !== 'checkbox' && (v === '' || v === null || v === undefined))
          errors.push('الحقل "' + f.label + '" مطلوب');
      }
      if (v !== '' && v !== null && v !== undefined && f.type === 'number' && isNaN(Number(v)))
        errors.push('الحقل "' + f.label + '" يجب أن يكون رقماً');
    });
    return errors;
  }

  function defaultDemoSchema() {
    return sortFields([
      normalizeField(
        {
          slug: 'customer_name',
          label: 'اسم العميل',
          type: 'text',
          required: true,
          showInForm: true,
          showInTable: true,
          searchable: true,
          filterable: false,
          order: 10,
        },
        []
      ),
      normalizeField(
        {
          slug: 'order_type',
          label: 'نوع الطلب',
          type: 'select',
          required: true,
          options: ['استعارة', 'شراء', 'حجز', 'طلب خاص'],
          showInForm: true,
          showInTable: true,
          searchable: true,
          filterable: true,
          order: 20,
        },
        []
      ),
      normalizeField(
        {
          slug: 'notes',
          label: 'ملاحظات',
          type: 'textarea',
          required: false,
          showInForm: true,
          showInTable: false,
          searchable: true,
          filterable: false,
          order: 30,
        },
        []
      ),
    ]);
  }

  window.DOMS = window.DOMS || {};
  window.DOMS.engine = {
    TYPES: TYPES,
    slugifyArabicFallback: slugifyArabicFallback,
    shortId: shortId,
    uuidV4: uuidV4,
    isUuid: isUuid,
    normalizeField: normalizeField,
    sortFields: sortFields,
    visibleFormFields: visibleFormFields,
    visibleTableFields: visibleTableFields,
    filterableFields: filterableFields,
    searchableFields: searchableFields,
    formatCellValue: formatCellValue,
    matchesSearch: matchesSearch,
    matchesFilters: matchesFilters,
    validateOrderData: validateOrderData,
    defaultDemoSchema: defaultDemoSchema,
    parseOptionsText: parseOptionsText,
    ORDER_STATUSES: ORDER_STATUSES,
    normalizeOrder: normalizeOrder,
    generateOrderReference: generateOrderReference,
    orderStatusLabel: orderStatusLabel,
    isValidOrderStatus: isValidOrderStatus,
    matchesOrderSearch: matchesOrderSearch,
  };
})();
