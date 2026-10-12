(function () {
    'use strict';
  
    // Protected page: no token, no entry.
    if (!Api.getToken()) {
      window.location.replace('/index.html');
      return;
    }
  
    const $ = (id) => document.getElementById(id);
  
    const els = {
      list: $('task-list'),
      empty: $('empty-state'),
      userName: $('user-name'),
      search: $('filter-search'),
      status: $('filter-status'),
      priority: $('filter-priority'),
      due: $('filter-due'),
      sort: $('filter-sort'),
      dialog: $('task-dialog'),
      form: $('task-form'),
      dialogTitle: $('dialog-title'),
      saveBtn: $('save-btn'),
      toast: $('toast')
    };
  
    const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
    const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
    const SORTS = {
      created_desc: { sort: 'created_at', order: 'desc' },
      due_asc: { sort: 'due_date', order: 'asc' },
      priority_desc: { sort: 'priority', order: 'desc' },
      title_asc: { sort: 'title', order: 'asc' }
    };
  
    let editingId = null;
    let loadCounter = 0;
  
    const user = Api.getUser();
    els.userName.textContent = user ? user.name : '';
  
    // ---------- Helpers ----------
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text; // textContent keeps user input from running as HTML
      return node;
    }
  
    let toastTimer;
    function toast(message, isError) {
      els.toast.textContent = message;
      els.toast.className = `toast${isError ? ' toast-error' : ''}`;
      els.toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3500);
    }
  
    function parseLocalDate(iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
  
    function dueLabel(task) {
      if (!task.due_date) return 'No due date';
  
      const due = parseLocalDate(task.due_date);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.round((due - today) / 86400000);
      const formatted = due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  
      if (task.status === 'done') return `Was due ${formatted}`;
      if (task.overdue) {
        const days = Math.max(1, -diff);
        return `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`;
      }
      if (diff === 0) return 'Due today';
      if (diff === 1) return 'Due tomorrow';
      if (diff <= 7) return `Due in ${diff} days`;
      return `Due ${formatted}`;
    }
  
    // ---------- Loading data ----------
    const filters = () => ({
      search: els.search.value.trim(),
      status: els.status.value,
      priority: els.priority.value,
      due: els.due.value
    });
  
    function hasActiveFilters() {
      return Object.values(filters()).some(Boolean);
    }
  
    async function loadTasks() {
      const requestId = ++loadCounter;
      const query = new URLSearchParams();
      Object.entries(filters()).forEach(([key, value]) => { if (value) query.set(key, value); });
      const sort = SORTS[els.sort.value];
      query.set('sort', sort.sort);
      query.set('order', sort.order);
  
      try {
        const { tasks } = await Api.get(`/tasks?${query}`);
        if (requestId !== loadCounter) return; // a newer request has superseded this one
        renderTasks(tasks);
      } catch (err) {
        toast(err.message, true);
      }
    }
  
    async function loadStats() {
      try {
        const { stats } = await Api.get('/tasks/stats');
        Object.keys(stats).forEach((key) => {
          const node = $(`stat-${key}`);
          if (node) node.textContent = stats[key];
        });
      } catch (err) {
        toast(err.message, true);
      }
    }
  
    const refresh = () => Promise.all([loadTasks(), loadStats()]);
  
    // ---------- Rendering ----------
    function renderTasks(tasks) {
      els.list.replaceChildren();
  
      if (!tasks.length) {
        els.empty.textContent = hasActiveFilters()
          ? 'No tasks match these filters. Clear them to see everything.'
          : 'No tasks yet. Choose "New task" to add your first one.';
        els.empty.hidden = false;
        return;
      }
  
      els.empty.hidden = true;
      tasks.forEach((task) => els.list.appendChild(buildCard(task)));
    }
  
    function buildCard(task) {
      const li = el('li', 'task');
      li.classList.add(`status-${task.status}`);
      if (task.overdue) li.classList.add('is-overdue');
  
      const main = el('div', 'task-main');
      main.appendChild(el('h3', 'task-title', task.title));
      if (task.description) main.appendChild(el('p', 'task-desc', task.description));
  
      const meta = el('div', 'task-meta');
      meta.appendChild(el('span', `badge badge-${task.priority}`, `${PRIORITY_LABELS[task.priority]} priority`));
      meta.appendChild(el('span', `due${task.overdue ? ' due-overdue' : ''}`, dueLabel(task)));
      main.appendChild(meta);
  
      const actions = el('div', 'task-actions');
  
      const select = el('select', 'status-select');
      select.setAttribute('aria-label', `Status of ${task.title}`);
      Object.entries(STATUS_LABELS).forEach(([value, label]) => {
        const option = el('option', '', label);
        option.value = value;
        option.selected = value === task.status;
        select.appendChild(option);
      });
      select.addEventListener('change', () => changeStatus(task, select));
  
      const editBtn = el('button', 'btn btn-small', 'Edit');
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', `Edit ${task.title}`);
      editBtn.addEventListener('click', () => openDialog(task));
  
      const deleteBtn = el('button', 'btn btn-small btn-danger', 'Delete');
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', `Delete ${task.title}`);
      deleteBtn.addEventListener('click', () => removeTask(task));
  
      actions.append(select, editBtn, deleteBtn);
      li.append(main, actions);
      return li;
    }
  
    // ---------- Actions ----------
    async function changeStatus(task, select) {
      select.disabled = true;
      try {
        await Api.patch(`/tasks/${task.id}/status`, { status: select.value });
        toast(`Marked "${task.title}" as ${STATUS_LABELS[select.value].toLowerCase()}.`);
        await refresh();
      } catch (err) {
        select.value = task.status;
        select.disabled = false;
        toast(err.message, true);
      }
    }
  
    async function removeTask(task) {
      if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
      try {
        await Api.delete(`/tasks/${task.id}`);
        toast('Task deleted.');
        await refresh();
      } catch (err) {
        toast(err.message, true);
      }
    }
  
    // ---------- Dialog (create / edit) ----------
    function clearFormErrors() {
      els.form.querySelectorAll('[data-error-for]').forEach((p) => { p.textContent = ''; });
      els.form.querySelector('[data-form-error]').textContent = '';
      els.form.querySelectorAll('input, textarea, select').forEach((f) => f.removeAttribute('aria-invalid'));
    }
  
    function showFormErrors(errors) {
      let first = null;
      Object.entries(errors).forEach(([name, message]) => {
        const slot = els.form.querySelector(`[data-error-for="${name}"]`);
        const field = els.form.elements[name];
        if (slot) {
          slot.textContent = message;
          if (field) {
            field.setAttribute('aria-invalid', 'true');
            if (!first) first = field;
          }
        } else {
          els.form.querySelector('[data-form-error]').textContent = message;
        }
      });
      if (first) first.focus();
    }
  
    function openDialog(task) {
      editingId = task ? task.id : null;
      clearFormErrors();
      els.form.reset();
  
      els.dialogTitle.textContent = task ? 'Edit task' : 'New task';
      if (task) {
        els.form.elements.title.value = task.title;
        els.form.elements.description.value = task.description || '';
        els.form.elements.due_date.value = task.due_date || '';
        els.form.elements.priority.value = task.priority;
        els.form.elements.status.value = task.status;
      }
      els.dialog.showModal();
      els.form.elements.title.focus();
    }
  
    function closeDialog() {
      els.dialog.close();
    }
  
    els.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors();
  
      const payload = {
        title: els.form.elements.title.value.trim(),
        description: els.form.elements.description.value.trim(),
        due_date: els.form.elements.due_date.value || null,
        priority: els.form.elements.priority.value,
        status: els.form.elements.status.value
      };
  
      if (!payload.title) {
        showFormErrors({ title: 'Enter a title for this task.' });
        return;
      }
  
      els.saveBtn.disabled = true;
      try {
        if (editingId) {
          await Api.patch(`/tasks/${editingId}`, payload);
          toast('Task updated.');
        } else {
          await Api.post('/tasks', payload);
          toast('Task created.');
        }
        closeDialog();
        await refresh();
      } catch (err) {
        if (err.details) showFormErrors(err.details);
        else els.form.querySelector('[data-form-error]').textContent = err.message;
      } finally {
        els.saveBtn.disabled = false;
      }
    });
  
    $('new-task-btn').addEventListener('click', () => openDialog(null));
    $('cancel-btn').addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', (event) => {
      if (event.target === els.dialog) closeDialog(); // click on the backdrop
    });
  
    // ---------- Filters ----------
    let searchTimer;
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadTasks, 250);
    });
    [els.status, els.priority, els.due, els.sort].forEach((select) => {
      select.addEventListener('change', loadTasks);
    });
  
    $('clear-filters').addEventListener('click', () => {
      els.search.value = '';
      els.status.value = '';
      els.priority.value = '';
      els.due.value = '';
      els.sort.value = 'created_desc';
      loadTasks();
    });
  
    // ---------- Log out ----------
    $('logout-btn').addEventListener('click', () => {
      Api.clearSession();
      window.location.href = '/index.html';
    });
  
    refresh();
  })();
  