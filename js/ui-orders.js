/**
 * واجهة الطلبات: جدول + بحث وفلاتر وفق بحث-able على الحقول + حوارات إضافة وتفاصيل.
 */
(function () {
  var ENG = window.DOMS.engine;
  var storage = window.DOMS.storage;

  var state = {
    fields: [],
    orders: [],
    search: '',
    filters: {},
    statusFilter: '',
  };

  function el(id) {
    return document.getElementById(id);
  }

  function syncFields(fields) {
    state.fields = fields || [];
  }

  function setOrders(rows) {
    state.orders = ENG.sortOrdersByDate(rows || []);
    renderTable();
    renderFilters();
  }

  function visibleOrders() {
    var sFields = ENG.searchableFields(state.fields);
    return ENG.sortOrdersByDate(state.orders).filter(function (o) {
      if (state.statusFilter && String(o.status) !== state.statusFilter) return false;
      return (
        ENG.matchesOrderSearch(o, state.search, sFields) &&
        ENG.matchesFilters(o, state.filters, state.fields)
      );
    });
  }

  function mergeOrderSaved(u) {
    state.orders = state.orders.map(function (o) {
      return String(o.id) === String(u.id) ? u : o;
    });
    renderTable();
  }

  function copyToClipboard(txt) {
    var t = String(txt || '');
    if (!t) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(
        function () {
          alert('تم النسخ إلى الحافظة.');
        },
        function () {
          fallbackCopy(t);
        }
      );
      return;
    }
    fallbackCopy(t);
  }

  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      alert('تم نسخ المرجع');
    } catch (e) {
      alert('انسخ يدوياً: ' + txt);
    }
    document.body.removeChild(ta);
  }

  function buildStatusSelect(selected, compact) {
    var sel = document.createElement('select');
    sel.className = compact ? 'input btn-sm status-select status-select--inline' : 'input status-select';
    sel.setAttribute('aria-label', 'تغيير الحالة');

    ENG.ORDER_STATUSES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.value;
      o.textContent = s.label;
      if (selected === s.value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function wireStatusFilterDropdown() {
    var sel = el('orderStatusFilter');
    if (!sel || sel.dataset.wired) return;
    sel.dataset.wired = '1';
    sel.innerHTML = '';

    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'كل الحالات';
    sel.appendChild(all);

    ENG.ORDER_STATUSES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.value;
      o.textContent = s.label;
      sel.appendChild(o);
    });

    sel.value = state.statusFilter || '';
    sel.addEventListener('change', function () {
      state.statusFilter = sel.value || '';
      renderTable();
    });
  }

  function renderFilters() {
    wireStatusFilterDropdown();
    var bar = el('filterBar');
    if (!bar) return;
    bar.innerHTML = '';
    var filters = ENG.filterableFields(state.fields);

    filters.forEach(function (f) {
      var wrap = document.createElement('label');
      wrap.className = 'field';
      var lab = document.createElement('span');
      lab.className = 'field-label small';
      lab.textContent = f.label;

      var sel = document.createElement('select');
      sel.className = 'input btn-sm filter-chips';

      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'كلّ ' + f.label;
      sel.appendChild(opt0);

      (f.options || []).forEach(function (optv) {
        var o = document.createElement('option');
        o.value = optv;
        o.textContent = optv;
        if (state.filters[f.slug] === optv) o.selected = true;
        sel.appendChild(o);
      });

      sel.addEventListener('change', function () {
        if (sel.value) state.filters[f.slug] = sel.value;
        else delete state.filters[f.slug];
        renderTable();
      });

      wrap.appendChild(lab);
      wrap.appendChild(sel);
      bar.appendChild(wrap);
    });
  }

  function tdWithLabel(cellClass, label, nodeOrText, isRtlCode) {
    var td = document.createElement('td');
    if (cellClass) td.className = cellClass;
    td.setAttribute('data-label', label);
    if (typeof nodeOrText === 'string' || typeof nodeOrText === 'number') {
      td.textContent = nodeOrText == null ? '—' : String(nodeOrText);
      if (isRtlCode) td.setAttribute('dir', 'ltr');
    } else {
      td.appendChild(nodeOrText);
    }
    return td;
  }

  function renderTable() {
    var thead = el('ordersHead');
    var tbody = el('ordersBody');
    if (!thead || !tbody) return;

    thead.innerHTML = '';
    var vf = ENG.visibleTableFields(state.fields);

    var thRef = document.createElement('th');
    thRef.textContent = 'رمز المرجع';
    thead.appendChild(thRef);
    var thSt = document.createElement('th');
    thSt.textContent = 'الحالة';
    thead.appendChild(thSt);

    vf.forEach(function (f) {
      var th = document.createElement('th');
      th.textContent = f.label;
      thead.appendChild(th);
    });
    var thDate = document.createElement('th');
    thDate.textContent = 'التاريخ';
    thead.appendChild(thDate);
    var thAct = document.createElement('th');
    thAct.textContent = 'إجراءات';
    thead.appendChild(thAct);

    tbody.innerHTML = '';
    var rows = visibleOrders();
    var colspan = vf.length + 4;
    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = colspan;
      td.className = 'empty-cell';
      td.textContent = 'لا توجد طلبات مطابقة أو لم تُنشأ بعد.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(function (o) {
      var rowOrder = ENG.normalizeOrder(o);
      var tr = document.createElement('tr');

      var tdRef = tdWithLabel(
        'order-cell order-cell-ref',
        'رمز المرجع',
        rowOrder.reference || '—',
        true
      );
      tr.appendChild(tdRef);

      var stSel = buildStatusSelect(rowOrder.status || 'new', true);
      stSel.dataset.orderId = rowOrder.id;
      stSel.addEventListener('change', function () {
        var nid = rowOrder.id;
        var ns = stSel.value;
        storage.updateOrder(nid, { status: ns }).then(mergeOrderSaved).catch(function (e) {
          alert(e.message || String(e));
          stSel.value = rowOrder.status;
        });
      });
      var tdSt = tdWithLabel('order-cell order-cell-status', 'الحالة', stSel);
      tr.appendChild(tdSt);

      vf.forEach(function (f) {
        var cell = tdWithLabel(
          'order-cell',
          f.label,
          ENG.formatCellValue(f, (rowOrder.data || {})[f.slug])
        );
        tr.appendChild(cell);
      });

      var tdD = tdWithLabel(
        'order-cell order-cell-date',
        'التاريخ',
        isNaN(new Date(rowOrder.createdAt).getTime())
          ? '—'
          : new Date(rowOrder.createdAt).toLocaleString('ar'),
        false
      );
      tr.appendChild(tdD);

      var bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'link-btn';
      bt.textContent = 'تفاصيل';
      bt.addEventListener('click', function () {
        openDetail(rowOrder);
      });
      var tdA = tdWithLabel('order-cell order-cell-actions', 'إجراءات', bt);
      tr.appendChild(tdA);

      tbody.appendChild(tr);
    });
  }

  function buildDynamicForm(fields, data) {
    var root = document.createDocumentFragment();

    ENG.visibleFormFields(fields).forEach(function (f) {
      var id = 'f_' + f.slug.replace(/[^\w]+/g, '_');
      var wrap = document.createElement('label');
      wrap.className = 'field';
      var lab = document.createElement('span');
      lab.className = 'field-label';
      lab.textContent = f.label + (f.required ? ' *' : '');

      var val = data && data[f.slug] !== undefined ? data[f.slug] : f.type === 'checkbox' ? false : '';
      var input;

      if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (f.type === 'select') {
        input = document.createElement('select');
        input.appendChild(new Option('— اختر —', '', false, val === ''));
        (f.options || []).forEach(function (opt) {
          input.appendChild(new Option(opt, opt, false, opt === val));
        });
      } else if (f.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!val;
        input.className = 'input';
        input.id = id;
        input.dataset.slug = f.slug;
        var row = document.createElement('label');
        row.className = 'check';
        row.appendChild(input);
        var sp = document.createElement('span');
        sp.textContent = f.label + (f.required ? ' *' : '');
        row.appendChild(sp);
        root.appendChild(row);
        return;
      } else {
        input = document.createElement('input');
        input.type =
          f.type === 'number'
            ? 'number'
            : f.type === 'email'
              ? 'email'
              : f.type === 'tel'
                ? 'tel'
                : f.type === 'date'
                  ? 'date'
                  : f.type === 'datetime'
                    ? 'datetime-local'
                    : 'text';
        if (val !== '' && val !== null && val !== undefined) input.value = val;
      }

      input.className = 'input';
      input.id = id;
      input.dataset.slug = f.slug;
      input.required = !!f.required && f.type !== 'checkbox';

      wrap.appendChild(lab);
      wrap.appendChild(input);
      root.appendChild(wrap);
    });

    return root;
  }

  function readForm(container) {
    var data = {};
    container.querySelectorAll('[data-slug]').forEach(function (inp) {
      var slug = inp.dataset.slug;
      if (inp.type === 'checkbox') data[slug] = !!inp.checked;
      else if (inp.type === 'number') data[slug] = inp.value === '' ? '' : Number(inp.value);
      else data[slug] = inp.value;
    });
    return data;
  }

  function openNewOrder() {
    var modal = el('orderModal');
    var formFields = el('orderFormFields');
    var form = el('orderForm');
    if (!modal || !formFields) return;

    el('orderModalTitle').textContent = 'طلب جديد';
    formFields.innerHTML = '';
    formFields.appendChild(buildDynamicForm(state.fields, {}));
    modal.showModal();

    form.onsubmit = function (ev) {
      ev.preventDefault();
      var raw = readForm(formFields);
      var errs = ENG.validateOrderData(state.fields, raw);
      if (errs.length) {
        alert(errs.join('\n'));
        return;
      }
      var order = ENG.normalizeOrder({
        id: ENG.uuidV4(),
        createdAt: new Date().toISOString(),
        status: 'new',
        data: raw,
      });
      storage
        .appendOrder(order)
        .then(function (saved) {
          modal.close();
          return storage.loadOrders();
        })
        .then(function (all) {
          setOrders(all);
        })
        .catch(function (e) {
          alert('تعذر الحفظ: ' + (e.message || String(e)));
        });
    };
  }

  function openDetail(order) {
    var normalized = ENG.normalizeOrder(order);

    var modal = el('detailModal');
    var body = el('detailBody');
    if (!modal || !body) return;
    body.innerHTML = '';
    el('detailModalTitle').textContent = 'تفاصيل الطلب «' + (normalized.reference || '') + '»';

    function addRow(title, valueNode) {
      var row = document.createElement('div');
      row.className = 'detail-row';
      var dt = document.createElement('div');
      dt.className = 'detail-k';
      dt.textContent = title;
      var dd = document.createElement('div');
      dd.className = 'detail-v';
      if (typeof valueNode === 'string') dd.textContent = valueNode;
      else dd.appendChild(valueNode);
      row.appendChild(dt);
      row.appendChild(dd);
      body.appendChild(row);
    }

    var refWrap = document.createDocumentFragment();
    var refCode = document.createElement('span');
    refCode.className = 'detail-ref mono';
    refCode.dir = 'ltr';
    refCode.textContent = normalized.reference || '—';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-secondary btn-sm';
    copyBtn.textContent = 'نسخ المرجع';
    copyBtn.style.marginInlineStart = '0.65rem';
    copyBtn.addEventListener('click', function () {
      copyToClipboard(normalized.reference);
    });
    refWrap.appendChild(refCode);
    refWrap.appendChild(copyBtn);
    addRow('رمز الطلب للقراءة', refWrap);

    var uuidSmall = document.createElement('code');
    uuidSmall.dir = 'ltr';
    uuidSmall.className = 'detail-uuid muted small';
    uuidSmall.textContent = normalized.id || '';
    addRow('معرّف فني للنظام (UUID)', uuidSmall);

    var d = new Date(normalized.createdAt || '');
    addRow('التاريخ', isNaN(d.getTime()) ? '—' : d.toLocaleString('ar'));

    var sel = buildStatusSelect(normalized.status, false);
    sel.addEventListener('change', function () {
      var v = sel.value;
      storage
        .updateOrder(normalized.id, { status: v })
        .then(function (updated) {
          Object.assign(normalized, updated);
          mergeOrderSaved(updated);
        })
        .catch(function (e) {
          alert(e.message || String(e));
          sel.value = normalized.status;
        });
    });
    addRow('حالة الطلب', sel);

    ENG.visibleFormFields(state.fields).forEach(function (f) {
      addRow(f.label, ENG.formatCellValue(f, (normalized.data || {})[f.slug]));
    });

    var delBtn = el('deleteOrderBtn');
    delBtn.onclick = function () {
      if (!confirm('حذف هذا الطلب نهائياً؟')) return;
      storage
        .removeOrder(normalized.id)
        .then(function () {
          modal.close();
          return storage.loadOrders();
        })
        .then(function (all) {
          setOrders(all);
        })
        .catch(function (e) {
          alert('تعذر الحذف: ' + (e.message || String(e)));
        });
    };

    el('detailModalDismiss').onclick = function () {
      modal.close();
    };

    modal.showModal();
  }

  function exportCsv() {
    var vf = ENG.visibleTableFields(state.fields);
    var rows = visibleOrders();
    var cols = vf.map(function (f) {
      return f.slug;
    });
    var headers = vf.map(function (f) {
      return f.label;
    });
    headers.unshift('التاريخ');
    headers.unshift('حالة');
    headers.unshift('مرجع');
    headers.unshift('id');

    function esc(s) {
      var t = String(s == null ? '' : s).replace(/"/g, '""');
      if (/[",\n]/.test(t)) return '"' + t + '"';
      return t;
    }

    var lines = [headers.map(esc).join(',')];
    rows.forEach(function (o) {
      var n = ENG.normalizeOrder(o);
      var line = [
        n.id,
        n.reference,
        ENG.orderStatusLabel(n.status),
        new Date(n.createdAt || '').toISOString(),
      ].concat(
        vf.map(function (f) {
          return ENG.formatCellValue(f, (n.data || {})[f.slug]);
        })
      );
      lines.push(line.map(esc).join(','));
    });

    var csv = '\uFEFF' + lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orders_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 4000);
  }

  function wire() {
    var search = el('globalSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.search = search.value;
        renderTable();
      });
    }
    var clearF = el('clearFiltersBtn');
    if (clearF) {
      clearF.addEventListener('click', function () {
        state.filters = {};
        renderFilters();
        renderTable();
      });
    }
    var exCsv = el('exportCsvBtn');
    if (exCsv) exCsv.addEventListener('click', exportCsv);

    var omClose = el('orderModalClose');
    if (omClose) {
      omClose.addEventListener('click', function () {
        var m = el('orderModal');
        if (m) m.close();
      });
    }
    var omCx = el('orderModalCancel');
    if (omCx) {
      omCx.addEventListener('click', function () {
        var m = el('orderModal');
        if (m) m.close();
      });
    }

    var dmClose = el('detailModalClose');
    if (dmClose) {
      dmClose.addEventListener('click', function () {
        var m = el('detailModal');
        if (m) m.close();
      });
    }
  }

  window.DOMS = window.DOMS || {};
  window.DOMS.ordersUI = {
    wire: wire,
    syncFields: syncFields,
    setOrders: setOrders,
    renderTable: renderTable,
    openNewOrder: openNewOrder,
    refresh: function () {
      renderTable();
      renderFilters();
      wireStatusFilterDropdown();
    },
  };
})();
