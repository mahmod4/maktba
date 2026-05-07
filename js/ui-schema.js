/**
 * مصمّم الحقول: يبني DOM لبطاقات التحرير ثم يحفظ عبر DOMS.storage.saveSchema.
 * كل تغيير مهمّ يستدِي onSchemaSaved ليعيد تشكيل الطلبات والجدول تلقائيًا.
 */
(function () {
  var ENG = window.DOMS.engine;
  var storage = window.DOMS.storage;

  var state = { fields: [], dirty: false, dragFrom: null };
  var el = {};

  function initElements() {
    el.list = document.getElementById('fieldList');
    el.resetDemo = document.getElementById('resetDemoBtn');
    el.add = document.getElementById('addFieldBtn');
  }

  function setFields(fields) {
    state.fields = ENG.sortFields(fields).map(function (f, i) {
      var c = Object.assign({}, f);
      c.order = i * 10;
      return c;
    });
    state.dirty = false;
    render();
  }

  function markDirty() {
    state.dirty = true;
  }

  function scheduleSave() {
    if (window.DOMS._schemaSaveTimer) clearTimeout(window.DOMS._schemaSaveTimer);
    window.DOMS._schemaSaveTimer = setTimeout(function () {
      saveNow();
    }, 650);
  }

  function saveNow() {
    return storage
      .saveSchema(state.fields)
      .then(function (next) {
        state.fields = ENG.sortFields(next);
        state.dirty = false;
        if (window.DOMS.onSchemaSaved) window.DOMS.onSchemaSaved(state.fields);
        render();
      })
      .catch(function (e) {
        alert('تعذر حفظ النموذج: ' + (e.message || String(e)));
      });
  }

  function addEmptyField() {
    var provisional = ENG.normalizeField(
      {
        label: 'خانة جديدة',
        slug: '',
        type: 'text',
        required: false,
        showInForm: true,
        showInTable: true,
        searchable: true,
        filterable: false,
      },
      state.fields
    );
    state.fields.push(provisional);
    markDirty();
    render();
    scheduleSave();
  }

  async function resetDemo() {
    if (!confirm('سيتم استبدال نموذجك الحالي والطلبات ببيانات تجريبية. أكمل؟')) return;
    var creds = window.DOMS.config.getSupabaseCredentials();
    if (creds.useSupabase && storage.getClient()) {
      try {
        await storage.clearRemoteOrders();
      } catch (e) {
        alert('تعذر مسح الطلبات السحابية: ' + (e.message || String(e)));
        return;
      }
    } else {
      await storage.replaceAllOrders([]);
    }
    await storage.saveSchema(ENG.defaultDemoSchema());
    await window.DOMS.bootstrapData();
    if (window.DOMS.refreshOrdersUI) window.DOMS.refreshOrdersUI();
  }

  function moveField(idx, dir) {
    var arr = ENG.sortFields(state.fields);
    var j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    var t = arr[idx];
    arr[idx] = arr[j];
    arr[j] = t;
    state.fields = arr.map(function (f, i) {
      var c = Object.assign({}, f);
      c.order = i * 10;
      return c;
    });
    markDirty();
    render();
    scheduleSave();
  }

  function bindDrag(card, id) {
    var handle = card.querySelector('[data-drag-handle]');
    if (!handle) return;
    handle.addEventListener('dragstart', function (e) {
      state.dragFrom = id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });
    handle.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      state.dragFrom = null;
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      card.classList.add('drop-target');
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('drop-target');
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      card.classList.remove('drop-target');
      var toId = id;
      var fromId = e.dataTransfer.getData('text/plain') || state.dragFrom;
      if (!fromId || fromId === toId) return;
      var ids = ENG.sortFields(state.fields).map(function (f) {
        return f.id;
      });
      var i = ids.indexOf(fromId);
      var j = ids.indexOf(toId);
      if (i < 0 || j < 0) return;
      var arr = ENG.sortFields(state.fields);
      var [moved] = arr.splice(i, 1);
      arr.splice(j, 0, moved);
      state.fields = arr.map(function (f, ix) {
        var c = Object.assign({}, f);
        c.order = ix * 10;
        return c;
      });
      markDirty();
      render();
      scheduleSave();
    });
  }

  function updateField(id, patch) {
    state.fields = state.fields.map(function (f) {
      if (f.id !== id) return f;
      var merged = Object.assign({}, f, patch);
      return ENG.normalizeField(merged, state.fields.filter(function (x) {
        return x.id !== id;
      }));
    });
    markDirty();
  }

  function removeField(id) {
    state.fields = state.fields.filter(function (f) {
      return f.id !== id;
    });
    markDirty();
    scheduleSave();
    render();
  }

  function toggleHidden(id) {
    var cur = state.fields.find(function (f) {
      return f.id === id;
    });
    if (!cur) return;
    updateField(id, { hidden: !cur.hidden });
    scheduleSave();
    render();
  }

  function renderCard(f, index, total) {
    var card = document.createElement('div');
    card.className = 'field-card';
    card.dataset.id = f.id;
    card.setAttribute('draggable', 'false');

    var optsVal = (f.options || []).join('\n');

    card.innerHTML = [
      '<div class="field-card-head">',
      '  <div class="drag-handle" draggable="true" data-drag-handle title="سحب لإعادة الترتيب">⃞</div>',
      '  <div class="field-card-meta">',
      '    <input class="input" data-k="label" type="text" value="' +
        escapeAttr(f.label) +
        '" aria-label="عنوان الخانة" placeholder="اسم الخانة" />',
      '    <label class="field"><span class="field-label muted small">المفتاح الداخلي (slug)</span>',
      '      <input class="input" data-k="slug" type="text" value="' + escapeAttr(f.slug) + '" />',
      '    </label>',
      '  </div>',
      '  <div class="field-card-actions">',
      '    <button type="button" class="btn btn-ghost btn-sm" data-act="hide">' +
        (f.hidden ? 'إظهار' : 'إخفاء') +
        '</button>',
      '    <button type="button" class="btn btn-secondary btn-sm" data-act="up" ' +
        (index === 0 ? 'disabled' : '') +
        '>↑</button>',
      '    <button type="button" class="btn btn-secondary btn-sm" data-act="down" ' +
        (index >= total - 1 ? 'disabled' : '') +
        '>↓</button>',
      '    <button type="button" class="btn btn-danger btn-sm" data-act="del">حذف</button>',
      '  </div>',
      '</div>',
      '<div class="field-grid options-editor">',
      '  <label class="field"><span class="field-label">نوع الخانة</span>',
      '    <select class="input" data-k="type">' +
        ENG.TYPES.map(function (t) {
          return '<option value="' +
            escapeAttr(t) +
            '"' +
            (f.type === t ? ' selected' : '') +
            '>' +
            typeLabelAr(t) +
            '</option>';
        }).join('') +
      '    </select>',
      '  </label>',
      '  </div>',
      '<div class="field-grid cols-6">',
      '  <div class="toggle-grid">',
      checkbox('required', 'إجبارية', !!f.required),
      checkbox('showInForm', 'تظهر في النموذج', f.showInForm !== false),
      checkbox('showInTable', 'تظهر في الجدول', f.showInTable !== false),
      checkbox('searchable', 'قابلة للبحث', f.searchable !== false),
      checkbox('filterable', 'قابلة للفلترة', !!f.filterable),
      '</div></div>',
      '<div class="field-grid options-editor" data-select-opts="' +
        (f.type === 'select' ? '1' : '0') +
        '">',
      '  <label class="field"><span class="field-label">خيارات القائمة (سطر لكل خيار)</span>',
      '    <textarea class="input" data-k="optionsText" placeholder="مثال: خيار١">' +
        escapeText(optsVal) +
        '</textarea>',
      '  </label>',
      '</div>',
    ].join('\n');

    card.querySelectorAll('input[data-k], select[data-k], textarea[data-k]').forEach(function (inp) {
      inp.addEventListener('change', onFieldInputChange.bind(null, f.id));
      inp.addEventListener('input', onFieldInputLive.bind(null, f.id));
    });

    card.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-act');
        if (act === 'up') moveField(index, -1);
        else if (act === 'down') moveField(index, +1);
        else if (act === 'del') {
          if (confirm('حذف الخانة نهائياً من النموذج؟')) removeField(f.id);
        } else if (act === 'hide') toggleHidden(f.id);
      });
    });

    bindDrag(card, f.id);

    var selOpts = card.querySelector('[data-select-opts]');
    if (f.type !== 'select') selOpts.style.display = 'none';

    return card;
  }

  function checkbox(k, lbl, checked) {
    return (
      '<label><input type="checkbox" data-k="' +
      escapeAttr(k) +
      '"' +
      (checked ? ' checked' : '') +
      '> ' +
      escapeText(lbl) +
      '</label>'
    );
  }

  function typeLabelAr(t) {
    return (
      {
        text: 'نص قصير',
        number: 'رقم',
        email: 'بريد',
        tel: 'هاتف',
        textarea: 'نص طويل',
        date: 'تاريخ',
        datetime: 'تاريخ ووقت',
        select: 'قائمة خيارات',
        checkbox: 'مربّع تأكيد',
      }[t] || t
    );
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function onFieldInputLive(id /*, ev */ ) {
    markDirty();
  }

  function onFieldInputChange(id, ev) {
    var inp = ev.target;
    var k = inp.getAttribute('data-k');
    if (!k) return;
    var patch = {};

    if (k === 'optionsText') {
      patch.options = ENG.parseOptionsText(inp.value);
    } else if (inp.type === 'checkbox') {
      patch[k] = !!inp.checked;
      if (k === 'filterable' && inp.checked && !patch.type) {
        var fld = state.fields.find(function (x) {
          return x.id === id;
        });
        if (fld && fld.type !== 'select') alert('الفلترة تطبّق الآن على قوائم «الخيارات» فقط. غيّر النوع إلى قائمة لتفعيلها.');
      }
    } else if (k === 'type') {
      patch.type = inp.value;
      if (inp.value !== 'select') patch.filterable = false;
    } else {
      patch[k] = inp.value;
    }

    updateField(id, patch);
    if (k === 'type') render();
    else scheduleSave();
  }

  function render() {
    if (!el.list) return;
    el.list.innerHTML = '';

    var arr = ENG.sortFields(state.fields);
    if (!arr.length) {
      var e = document.createElement('div');
      e.className = 'muted small';
      e.textContent = 'لا توجد خانات بعد. ابدأ بإضافة خانة جديدة.';
      el.list.appendChild(e);
      return;
    }

    arr.forEach(function (f, i) {
      if (f.hidden) {
        /** still show in designer with subdued style */
      }
      var c = renderCard(f, i, arr.length);
      if (f.hidden) c.style.opacity = '0.65';
      el.list.appendChild(c);
      var tp = c.querySelector('select[data-k="type"]');
      if (tp) {
        tp.addEventListener('change', function () {
          var o = c.querySelector('[data-select-opts]');
          if (!o) return;
          o.style.display = tp.value === 'select' ? '' : 'none';
        });
      }
    });

    /** patch select opts visibility initial */
    el.list.querySelectorAll('.field-card').forEach(function (card) {
      var tp = card.querySelector('select[data-k="type"]');
      var o = card.querySelector('[data-select-opts]');
      if (!tp || !o) return;
      o.style.display = tp.value === 'select' ? '' : 'none';
    });

    /** dirty toast small */
    window.DOMS.setSchemaDirty && window.DOMS.setSchemaDirty(state.dirty);
  }

  function bootstrap() {
    initElements();
    if (!el.list) return;
    el.add.addEventListener('click', function () {
      addEmptyField();
    });
    el.resetDemo.addEventListener('click', resetDemo);
  }

  window.DOMS = window.DOMS || {};
  window.DOMS.schemaUI = {
    bootstrap: bootstrap,
    setFields: setFields,
    saveNow: saveNow,
    getFields: function () {
      return state.fields.slice();
    },
  };
})();
