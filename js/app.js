import {
  openDB, getAll, put, putMany, remove, clearAll, exportDatabase, importDatabase
} from './db.js';
import { icon } from './icons.js';
import {
  uuid, escapeHTML, escapeAttr, formatDate, formatDateTime, todayISO, addDays,
  getDateRange, isDateInRange, isOverdue, isDueToday, isDueThisWeek, daysBetween,
  formatFileSize, debounce, slugify, downloadBlob, downloadText, csvEscape,
  fileToDataURL, compressImage, getInitials, parseTags, normalizeURL,
  humanizeStatus, sortByDateDesc, wordCount, truncate, taskImpactSuggestion,
  printDocument, wordCompatibleHTML
} from './utils.js';

const APP_VERSION = '0.1.4';
const SETTINGS_KEY = 'preferences';
const WORKSTREAM_COLORS = ['#9b7652', '#9466d8', '#3da85b', '#2d9baa', '#ed8b16', '#5372d4', '#d05272', '#65758b'];

const DEFAULT_SETTINGS = {
  key: SETTINGS_KEY,
  theme: 'system',
  weekStartsOn: 1,
  sidebarCollapsed: false,
  onboardingDismissed: false,
  workstreams: [
    { id: 'ws-projects', name: 'Projects', color: '#9b7652' },
    { id: 'ws-operations', name: 'Operations', color: '#9466d8' },
    { id: 'ws-general', name: 'General', color: '#3da85b' },
    { id: 'ws-team', name: 'Team Support', color: '#2d9baa' },
    { id: 'ws-planning', name: 'Planning', color: '#ed8b16' },
    { id: 'ws-development', name: 'Professional Development', color: '#5372d4' }
  ],
  tags: ['Meeting', 'Documentation', 'Onboarding', 'Presentation', 'Follow-up', 'Planning', 'Process Improvement'],
  goals: ['Operational Excellence', 'Leadership & Communication', 'Professional Growth'],
  lastWeeklyReview: ''
};

const VIEW_META = {
  dashboard: ['Dashboard', 'Your notes, tasks, and accomplishments in one place.'],
  tasks: ['Tasks', 'Track assignments, due dates, priorities, and follow-up.'],
  waiting: ['Waiting On', 'Keep an eye on requests and dependencies owned by others.'],
  completed: ['Completed', 'Review finished work and convert meaningful items into accomplishments.'],
  recurring: ['Recurring', 'Manage repeat responsibilities and the next time they are due.'],
  decisions: ['Decisions', 'Maintain a searchable record of decisions and context.'],
  notes: ['Notes', 'Type, organize, search, export, and connect notes to work.'],
  uploads: ['Uploads', 'Store supporting images and files locally in this browser.'],
  references: ['References', 'Keep useful links, procedures, contacts, and source material together.'],
  reports: ['Reports', 'Review activity, accomplishments, goal progress, and workflow diagnostics.'],
  accomplishments: ['Accomplishments', 'Capture impact throughout the year instead of reconstructing it later.'],
  workstreams: ['Workstreams', 'Organize notes and tasks by person, team, project, or area of responsibility.'],
  tags: ['Tags', 'Maintain reusable labels for faster organization and retrieval.'],
  settings: ['Settings', 'Personalize Atlas, manage local data, backups, and installation.'],
  search: ['Search', 'Search across tasks, notes, accomplishments, and uploads.']
};

const NAV_SECTIONS = [
  { label: '', items: [{ view: 'dashboard', label: 'Dashboard', icon: 'home' }] },
  { label: 'Work', items: [
    { view: 'tasks', label: 'Tasks', icon: 'task', count: 'open' },
    { view: 'waiting', label: 'Waiting On', icon: 'hourglass', count: 'waiting' },
    { view: 'completed', label: 'Completed', icon: 'check', count: 'completed' },
    { view: 'recurring', label: 'Recurring', icon: 'repeat', count: 'recurring' },
    { view: 'decisions', label: 'Decisions', icon: 'bulb', count: 'decisions' }
  ]},
  { label: 'Notes & Content', items: [
    { view: 'notes', label: 'Notes', icon: 'note', count: 'notes' },
    { view: 'uploads', label: 'Uploads', icon: 'upload', count: 'files' },
    { view: 'references', label: 'References', icon: 'link', count: 'references' }
  ]},
  { label: 'Reports', items: [
    { view: 'reports', label: 'Reports', icon: 'chart' },
    { view: 'accomplishments', label: 'Accomplishments', icon: 'trophy', count: 'accomplishments' }
  ]},
  { label: 'Manage', items: [
    { view: 'workstreams', label: 'Workstreams', icon: 'layers' },
    { view: 'tags', label: 'Tags', icon: 'tag' },
    { view: 'settings', label: 'Settings', icon: 'settings' }
  ]}
];

const state = {
  tasks: [],
  notes: [],
  accomplishments: [],
  files: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  view: 'dashboard',
  preSearchView: 'dashboard',
  searchQuery: '',
  dashboardTaskTab: 'today',
  taskFilter: 'all',
  taskScope: '',
  workstreamFilter: '',
  noteFilter: 'all',
  selectedNoteId: '',
  reportPreset: 'fiscal',
  reportCustomStart: '',
  reportCustomEnd: '',
  beforeInstallPrompt: null,
  storageEstimate: null,
  rendering: false
};

const elements = {};

function cacheElements() {
  elements.sidebar = document.querySelector('#sidebar');
  elements.sidebarBackdrop = document.querySelector('#sidebar-backdrop');
  elements.nav = document.querySelector('#primary-nav');
  elements.viewTitle = document.querySelector('#view-title');
  elements.viewSubtitle = document.querySelector('#view-subtitle');
  elements.viewContainer = document.querySelector('#view-container');
  elements.searchInput = document.querySelector('#global-search-input');
  elements.modalRoot = document.querySelector('#modal-root');
  elements.toastRegion = document.querySelector('#toast-region');
  elements.installButton = document.querySelector('#install-app-button');
}

async function init() {
  cacheElements();
  await openDB();
  await loadAllData();
  applySettings();
  bindGlobalEvents();
  registerServiceWorker();
  requestStorageEstimate();
  handleInitialRoute();
  render();
  handleShortcutCapture();
}

async function loadAllData() {
  const [tasks, notes, accomplishments, files, settingsRows] = await Promise.all([
    getAll('tasks'), getAll('notes'), getAll('accomplishments'), getAll('files'), getAll('settings')
  ]);
  state.tasks = tasks;
  state.notes = notes;
  state.accomplishments = accomplishments;
  state.files = files;
  const saved = settingsRows.find(item => item.key === SETTINGS_KEY);
  state.settings = mergeSettings(saved);
  if (!saved || Object.prototype.hasOwnProperty.call(saved, 'userName')) await put('settings', state.settings);
}

function mergeSettings(saved) {
  const merged = { ...structuredClone(DEFAULT_SETTINGS), ...(saved || {}) };
  delete merged.userName;
  merged.workstreams = Array.isArray(saved?.workstreams) && saved.workstreams.length
    ? saved.workstreams : structuredClone(DEFAULT_SETTINGS.workstreams);
  merged.tags = Array.isArray(saved?.tags) ? saved.tags : structuredClone(DEFAULT_SETTINGS.tags);
  merged.goals = Array.isArray(saved?.goals) ? saved.goals : structuredClone(DEFAULT_SETTINGS.goals);
  merged.key = SETTINGS_KEY;
  return merged;
}

async function saveSettings() {
  await put('settings', state.settings);
  applySettings();
  renderNav();
}

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101725' : '#17233a');
  elements.sidebar.classList.toggle('is-collapsed', Boolean(state.settings.sidebarCollapsed));
  document.querySelector('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 20);
  document.querySelector('#help-button').innerHTML = icon('help', 20);
  document.querySelector('#sidebar-open').innerHTML = icon('menu', 21);
  document.querySelector('#sidebar-close').innerHTML = icon('close', 20);
  document.querySelector('#global-search-icon').innerHTML = icon('search', 18);
  document.querySelector('#quick-add-button').innerHTML = `${icon('plus', 17)}<span>Quick Capture</span>`;
  document.querySelector('#global-quick-capture').innerHTML = `${icon('plus', 19)}<span>Quick Capture</span>`;
  document.querySelector('#sidebar-collapse').innerHTML = `${icon(state.settings.sidebarCollapsed ? 'chevronRight' : 'chevronLeft', 19)}<span>${state.settings.sidebarCollapsed ? 'Expand' : 'Collapse'}</span>`;
  if (state.beforeInstallPrompt) {
    elements.installButton.hidden = false;
    elements.installButton.innerHTML = `${icon('download', 16)} Install Atlas`;
  }
}

function resolvedTheme() {
  if (state.settings.theme === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return state.settings.theme || 'light';
}

function bindGlobalEvents() {
  document.querySelector('#sidebar-open').addEventListener('click', openMobileSidebar);
  document.querySelector('#sidebar-close').addEventListener('click', closeMobileSidebar);
  elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  document.querySelector('#sidebar-collapse').addEventListener('click', async () => {
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    await saveSettings();
  });
  document.querySelector('#global-quick-capture').addEventListener('click', openQuickCaptureModal);
  document.querySelector('#quick-add-button').addEventListener('click', openQuickCaptureModal);
  document.querySelector('#help-button').addEventListener('click', openHelpModal);
  document.querySelector('#theme-toggle').addEventListener('click', cycleTheme);
  elements.installButton.addEventListener('click', installApp);

  elements.nav.addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    if (button.dataset.view === 'tasks') { state.taskScope = ''; state.workstreamFilter = ''; state.taskFilter = 'all'; }
    navigate(button.dataset.view);
    closeMobileSidebar();
  });

  elements.viewContainer.addEventListener('click', handleViewClick);
  elements.viewContainer.addEventListener('change', handleViewChange);
  elements.viewContainer.addEventListener('submit', handleViewSubmit);
  elements.modalRoot.addEventListener('click', handleModalClick);

  const searchHandler = debounce(() => {
    const query = elements.searchInput.value.trim();
    state.searchQuery = query;
    if (query) {
      if (state.view !== 'search') state.preSearchView = state.view;
      state.view = 'search';
      history.replaceState(null, '', '#search');
    } else if (state.view === 'search') {
      state.view = state.preSearchView || 'dashboard';
      history.replaceState(null, '', `#${state.view}`);
    }
    render();
  }, 160);
  elements.searchInput.addEventListener('input', searchHandler);

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
    if (event.key === 'Escape' && elements.modalRoot.firstElementChild) closeModal();
  });

  window.addEventListener('hashchange', () => {
    const view = location.hash.slice(1);
    if (VIEW_META[view] && view !== 'search') {
      state.view = view;
      state.searchQuery = '';
      elements.searchInput.value = '';
      render();
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.beforeInstallPrompt = event;
    applySettings();
  });

  window.addEventListener('appinstalled', () => {
    state.beforeInstallPrompt = null;
    applySettings();
    toast('Atlas installed', 'You can now launch it from your device like an app.', 'success');
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'system') applySettings();
  });
}

function handleInitialRoute() {
  const hash = location.hash.slice(1);
  if (VIEW_META[hash]) state.view = hash;
  else history.replaceState(null, '', '#dashboard');
}

function handleShortcutCapture() {
  const params = new URLSearchParams(location.search);
  const capture = params.get('capture');
  if (!capture) return;
  history.replaceState(null, '', `${location.pathname}${location.hash || '#dashboard'}`);
  setTimeout(() => {
    if (capture === 'task') openTaskModal();
    if (capture === 'note') openNoteModal();
  }, 300);
}

function openMobileSidebar() {
  elements.sidebar.classList.add('is-mobile-open');
  elements.sidebarBackdrop.hidden = false;
}
function closeMobileSidebar() {
  elements.sidebar.classList.remove('is-mobile-open');
  elements.sidebarBackdrop.hidden = true;
}

function navigate(view) {
  if (!VIEW_META[view]) view = 'dashboard';
  state.view = view;
  state.searchQuery = '';
  elements.searchInput.value = '';
  history.pushState(null, '', `#${view}`);
  render();
  requestAnimationFrame(() => document.querySelector('#main-content')?.focus({ preventScroll: true }));
}

function cycleTheme() {
  const current = state.settings.theme;
  state.settings.theme = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
  saveSettings();
  toast('Theme updated', `Atlas is using the ${state.settings.theme} theme.`, 'info');
}

async function installApp() {
  if (!state.beforeInstallPrompt) return;
  state.beforeInstallPrompt.prompt();
  await state.beforeInstallPrompt.userChoice;
  state.beforeInstallPrompt = null;
  applySettings();
}

async function requestStorageEstimate() {
  if (!navigator.storage?.estimate) return;
  try {
    state.storageEstimate = await navigator.storage.estimate();
    if (state.view === 'settings') render();
  } catch { /* optional diagnostic */ }
}

function render() {
  if (state.rendering) return;
  state.rendering = true;
  try {
    renderNav();
    const [title, subtitle] = VIEW_META[state.view] || VIEW_META.dashboard;
    elements.viewTitle.textContent = title;
    elements.viewSubtitle.textContent = subtitle;
    const renderers = {
      dashboard: renderDashboard,
      tasks: () => renderTasksPage('all'),
      waiting: () => renderTasksPage('waiting'),
      completed: () => renderTasksPage('completed'),
      recurring: () => renderTasksPage('recurring'),
      decisions: () => renderNotesPage('decision'),
      notes: () => renderNotesPage('all'),
      uploads: renderUploadsPage,
      references: () => renderNotesPage('reference'),
      reports: renderReportsPage,
      accomplishments: renderAccomplishmentsPage,
      workstreams: renderWorkstreamsPage,
      tags: renderTagsPage,
      settings: renderSettingsPage,
      search: renderSearchPage
    };
    elements.viewContainer.innerHTML = (renderers[state.view] || renderDashboard)();
    if (state.view === 'settings') requestAnimationFrame(updateStorageUI);
  } finally {
    state.rendering = false;
  }
}

function countMap() {
  return {
    open: state.tasks.filter(task => task.status === 'open').length,
    waiting: state.tasks.filter(task => task.status === 'waiting').length,
    completed: state.tasks.filter(task => task.status === 'completed').length,
    recurring: state.tasks.filter(task => task.recurringFrequency && task.recurringFrequency !== 'none').length,
    decisions: state.notes.filter(note => note.type === 'decision').length,
    notes: state.notes.filter(note => note.type === 'note').length,
    files: state.files.length,
    references: state.notes.filter(note => note.type === 'reference').length,
    accomplishments: state.accomplishments.length
  };
}

function renderNav() {
  const counts = countMap();
  elements.nav.innerHTML = NAV_SECTIONS.map(section => `
    <div class="nav-section">
      ${section.label ? `<span class="nav-section-title">${escapeHTML(section.label)}</span>` : ''}
      ${section.items.map(item => `
        <button class="nav-link ${state.view === item.view ? 'is-active' : ''}" type="button" data-view="${item.view}" title="${escapeAttr(item.label)}">
          ${icon(item.icon, 19)}
          <span class="nav-label">${escapeHTML(item.label)}</span>
          ${item.count ? `<span class="nav-count">${counts[item.count] ?? 0}</span>` : ''}
        </button>`).join('')}
    </div>`).join('');
}

function getWorkstream(id) {
  return state.settings.workstreams.find(item => item.id === id) || { id: '', name: 'Unassigned', color: '#7b8799' };
}
function getTask(id) { return state.tasks.find(item => item.id === id); }
function getNote(id) { return state.notes.find(item => item.id === id); }
function getAccomplishment(id) { return state.accomplishments.find(item => item.id === id); }
function getFile(id) { return state.files.find(item => item.id === id); }

function workstreamOptions(selected = '') {
  return `<option value="">Unassigned</option>${state.settings.workstreams.map(ws => `<option value="${escapeAttr(ws.id)}" ${ws.id === selected ? 'selected' : ''}>${escapeHTML(ws.name)}</option>`).join('')}`;
}
function goalOptions(selected = '') {
  return `<option value="">No linked goal</option>${state.settings.goals.map(goal => `<option value="${escapeAttr(goal)}" ${goal === selected ? 'selected' : ''}>${escapeHTML(goal)}</option>`).join('')}`;
}
function noteOptions(selected = '') {
  return `<option value="">No linked note</option>${sortByDateDesc(state.notes).map(note => `<option value="${escapeAttr(note.id)}" ${note.id === selected ? 'selected' : ''}>${escapeHTML(note.title)}</option>`).join('')}`;
}

function toast(title, message = '', type = 'info') {
  const id = uuid();
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'xCircle' : 'info';
  elements.toastRegion.insertAdjacentHTML('beforeend', `
    <div class="toast ${type}" data-toast-id="${id}">
      <span class="toast-icon">${icon(iconName, 20)}</span>
      <div class="toast-copy"><div class="toast-title">${escapeHTML(title)}</div>${message ? `<div class="toast-message">${escapeHTML(message)}</div>` : ''}</div>
      <button class="icon-button toast-close" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon('close', 15)}</button>
    </div>`);
  setTimeout(() => document.querySelector(`[data-toast-id="${id}"]`)?.remove(), 5200);
}

function openModal({ title, subtitle = '', body = '', footer = '', size = '', onOpen }) {
  elements.modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop-close">
      <section class="modal ${size ? `modal-${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-header">
          <div><h2 id="modal-title">${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div>
          <button class="icon-button" type="button" data-action="modal-close" aria-label="Close dialog">${icon('close', 20)}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
      </section>
    </div>`;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    const first = elements.modalRoot.querySelector('input:not([type="hidden"]), textarea, select, button');
    first?.focus();
    onOpen?.(elements.modalRoot.querySelector('.modal'));
  });
}

function closeModal() {
  elements.modalRoot.innerHTML = '';
  document.body.style.overflow = '';
}

function handleModalClick(event) {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  if (action === 'modal-close') closeModal();
  if (action === 'modal-backdrop-close' && event.target === actionElement) closeModal();
  if (action === 'dismiss-toast') actionElement.closest('.toast')?.remove();
  if (!['modal-close', 'modal-backdrop-close', 'dismiss-toast'].includes(action)) handleViewClick(event);
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    openModal({
      title,
      body: `<p style="margin:0;color:var(--muted)">${escapeHTML(message)}</p>`,
      size: 'small',
      footer: `<button class="button button-secondary" type="button" data-confirm="cancel">Cancel</button><button class="button ${danger ? 'button-danger' : 'button-primary'}" type="button" data-confirm="yes">${escapeHTML(confirmLabel)}</button>`,
      onOpen(modal) {
        modal.querySelectorAll('[data-confirm]').forEach(button => button.addEventListener('click', () => {
          const answer = button.dataset.confirm === 'yes';
          closeModal();
          resolve(answer);
        }));
      }
    });
  });
}

function renderDashboard() {
  const now = new Date();
  const weekRange = getDateRange('week', '', '', state.settings.weekStartsOn);
  const monthRange = getDateRange('month');
  const dueToday = state.tasks.filter(isDueToday);
  const dueThisWeek = state.tasks.filter(task => isDueThisWeek(task, state.settings.weekStartsOn));
  const waiting = state.tasks.filter(task => task.status === 'waiting');
  const completedThisWeek = state.tasks.filter(task => task.status === 'completed' && task.completedAt && isDateInRange(task.completedAt, weekRange.start, weekRange.end));
  const accomplishmentsThisMonth = state.accomplishments.filter(item => item.completedAt && isDateInRange(item.completedAt, monthRange.start, monthRange.end));
  const allEmpty = !state.tasks.length && !state.notes.length && !state.accomplishments.length;

  return `
    <div class="dashboard-greeting">
      <div><h2>Good ${greetingPeriod()} 👋</h2><p>Here’s what’s happening with your work.</p></div>
      <div class="dashboard-date">${escapeHTML(new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now))}</div>
    </div>
    ${allEmpty && !state.settings.onboardingDismissed ? renderOnboardingBanner() : ''}
    <div class="metrics-grid">
      ${metricCard('due-today', 'task', dueToday.length, 'Due Today', dueToday.some(task => isOverdue(task)) ? 'Includes overdue work' : 'Focus for today', 'purple')}
      ${metricCard('due-week', 'calendar', dueThisWeek.length, 'Due This Week', `${state.tasks.filter(isOverdue).length} overdue`, 'orange')}
      ${metricCard('waiting', 'hourglass', waiting.length, 'Waiting On', waiting.length ? 'Review follow-up dates' : 'Nothing pending', 'blue')}
      ${metricCard('completed', 'check', completedThisWeek.length, 'Completed', `${completedThisWeek.length} this week`, 'green')}
      ${metricCard('accomplishments', 'trophy', accomplishmentsThisMonth.length, 'Accomplishments', 'This month', 'teal')}
    </div>

    <section class="panel quick-capture-panel">
      <div class="panel-header"><div><h3>Quick Capture</h3><p>Capture anything and organize it immediately or later.</p></div></div>
      <div class="panel-body">
        <div class="quick-grid">
          ${quickCard('new-task', 'task', 'New Task', 'Something I need to do', 'purple')}
          ${quickCard('new-waiting', 'hourglass', 'Waiting On', 'Something I am waiting for', 'orange')}
          ${quickCard('new-decision', 'bulb', 'Decision', 'Something that was decided', 'blue')}
          ${quickCard('new-note', 'note', 'New Note', 'Write or organize a note', 'green')}
          ${quickCard('open-ocr', 'camera', 'Upload / OCR', 'Photograph or upload text', 'teal')}
        </div>
      </div>
    </section>

    <div class="dashboard-layout">
      <div class="dashboard-center">
        <div class="dashboard-center-top">
          <section class="panel dashboard-main">
            <div class="panel-header">
              <div><h3>My Tasks</h3></div>
              <div class="tabs" role="tablist">
                ${dashboardTab('today', 'Today')}${dashboardTab('week', 'This Week')}${dashboardTab('overdue', 'Overdue')}${dashboardTab('all', 'All Tasks')}
              </div>
            </div>
            <div class="panel-body flush">${renderDashboardTaskList()}</div>
          </section>

          <section class="panel">
            <div class="panel-header"><div><h3>Workstreams</h3></div><button class="panel-link" type="button" data-action="navigate" data-view="workstreams">View All</button></div>
            <div class="panel-body">${renderDashboardWorkstreams()}</div>
          </section>
        </div>

        <div class="dashboard-lower">
          <section class="panel accomplishments-panel">
            <div class="panel-header"><div><h3>${icon('trophy', 17)} Recent Accomplishments</h3></div><button class="panel-link" type="button" data-action="navigate" data-view="accomplishments">View Report</button></div>
            <div class="panel-body">${renderRecentAccomplishments()}</div>
          </section>
          <section class="panel">
            <div class="panel-header"><div><h3>Workflow Diagnostics</h3><p>Small fixes that keep Atlas useful.</p></div><button class="panel-link" type="button" data-action="navigate" data-view="reports">Details</button></div>
            <div class="panel-body">${renderDashboardDiagnostics()}</div>
          </section>
        </div>
      </div>

      <div class="dashboard-side right">
        <section class="panel">
          <div class="panel-header"><div><h3>Recent Notes</h3></div><button class="panel-link" type="button" data-action="navigate" data-view="notes">View All</button></div>
          <div class="panel-body">${renderRecentNotes()}</div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Recent Uploads</h3></div><button class="panel-link" type="button" data-action="navigate" data-view="uploads">View All</button></div>
          <div class="panel-body">${renderRecentUploads()}</div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Reports</h3></div><button class="panel-link" type="button" data-action="navigate" data-view="reports">View All</button></div>
          <div class="panel-body">${renderDashboardReports()}</div>
        </section>
      </div>
    </div>`;
}

function greetingPeriod() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function renderOnboardingBanner() {
  return `<div class="onboarding-banner">
    <div class="onboarding-icon">${icon('sparkles', 24)}</div>
    <div class="onboarding-copy"><strong>Welcome to Atlas 0.1</strong><span>Start blank, or load sample items to explore the workflow before entering your own information.</span></div>
    <div class="onboarding-actions"><button class="button button-secondary button-small" type="button" data-action="dismiss-onboarding">Start blank</button><button class="button button-primary button-small" type="button" data-action="load-sample">Load sample data</button></div>
  </div>`;
}

function metricCard(action, iconName, value, label, meta, tone) {
  return `<button class="metric-card ${tone}" type="button" data-action="metric" data-metric="${action}">
    <span class="metric-icon">${icon(iconName, 25)}</span>
    <span><span class="metric-value">${value}</span><span class="metric-label">${escapeHTML(label)}</span><span class="metric-meta">${escapeHTML(meta)}</span></span>
  </button>`;
}

function quickCard(action, iconName, title, subtitle, tone) {
  return `<button class="quick-card ${tone}" type="button" data-action="${action}">
    <span class="quick-card-icon">${icon(iconName, 23)}</span>
    <span><strong>${escapeHTML(title)}</strong><span>${escapeHTML(subtitle)}</span></span>
  </button>`;
}

function dashboardTab(value, label) {
  return `<button class="tab-button ${state.dashboardTaskTab === value ? 'is-active' : ''}" type="button" role="tab" data-action="dashboard-tab" data-tab="${value}">${escapeHTML(label)}</button>`;
}

function renderDashboardTaskList() {
  let tasks = state.tasks.filter(task => task.status !== 'completed');
  if (state.dashboardTaskTab === 'today') tasks = tasks.filter(task => isDueToday(task) || isOverdue(task));
  if (state.dashboardTaskTab === 'week') tasks = tasks.filter(task => isDueThisWeek(task, state.settings.weekStartsOn) || isOverdue(task));
  if (state.dashboardTaskTab === 'overdue') tasks = tasks.filter(isOverdue);
  tasks = sortTasks(tasks).slice(0, 7);
  if (!tasks.length) return emptyState('check', 'Nothing here right now', state.dashboardTaskTab === 'overdue' ? 'No overdue tasks. Nicely done.' : 'Add a task or switch to another view.', 'new-task', 'Add a task');
  return `<div class="task-list">${tasks.map(renderTaskRow).join('')}<button class="add-row-button" type="button" data-action="new-task">${icon('plus', 15)} Add new task</button></div>`;
}

function sortTasks(tasks) {
  const priorityWeight = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
    if ((a.dueDate || '9999') !== (b.dueDate || '9999')) return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    return (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
  });
}

function renderTaskRow(task) {
  const ws = getWorkstream(task.workstreamId);
  const completeClass = task.status === 'completed' ? 'is-complete' : task.status === 'waiting' ? 'is-waiting' : '';
  const checkIcon = task.status === 'completed' ? icon('check', 15) : task.status === 'waiting' ? icon('hourglass', 13) : '';
  const due = taskDueDisplay(task);
  return `<div class="task-row">
    <button class="task-check ${completeClass}" type="button" data-action="toggle-task" data-id="${task.id}" aria-label="${task.status === 'completed' ? 'Reopen' : 'Complete'} ${escapeAttr(task.title)}">${checkIcon}</button>
    <div>
      <button class="task-title-button ${task.status === 'completed' ? 'completed' : ''}" type="button" data-action="edit-task" data-id="${task.id}">${escapeHTML(task.title)}</button>
      <div class="task-subline">${escapeHTML(ws.name)}${task.description ? ` · ${escapeHTML(truncate(task.description, 70))}` : ''}</div>
    </div>
    <span class="task-due ${due.className}">${escapeHTML(due.text)}</span>
    <span class="person-badge" style="background:${ws.color}22;color:${ws.color}">${escapeHTML(getInitials(ws.name))}</span>
  </div>`;
}

function taskDueDisplay(task) {
  if (task.status === 'completed') return { text: task.completedAt ? `Completed ${formatDate(task.completedAt, { year: false })}` : 'Completed', className: 'done' };
  if (task.status === 'waiting') {
    if (task.followUpDate) return { text: `Follow up ${formatDate(task.followUpDate, { year: false })}`, className: 'waiting' };
    return { text: task.waitingOn ? `Waiting on ${task.waitingOn}` : 'Waiting On', className: 'waiting' };
  }
  if (isOverdue(task)) return { text: `Overdue ${formatDate(task.dueDate, { year: false })}`, className: 'due' };
  if (task.dueDate === todayISO()) return { text: 'Due Today', className: 'due' };
  if (task.dueDate) return { text: `Due ${formatDate(task.dueDate, { year: false })}`, className: 'soon' };
  return { text: 'No due date', className: '' };
}

function renderDashboardWorkstreams() {
  const rows = state.settings.workstreams.map(ws => ({ ...ws, count: state.tasks.filter(task => task.workstreamId === ws.id && task.status !== 'completed').length }))
    .sort((a, b) => b.count - a.count).slice(0, 6);
  if (!rows.length) return emptyState('layers', 'No workstreams yet', 'Add a person, team, or project to organize your work.', 'new-workstream', 'Add workstream');
  return `<div class="workstream-list">${rows.map(ws => `<button class="workstream-row" type="button" data-action="filter-workstream" data-id="${ws.id}" style="border:0;background:transparent;width:100%;text-align:left;cursor:pointer">
    <span class="workstream-icon" style="background:${ws.color}">${icon('layers', 17)}</span><span class="workstream-name">${escapeHTML(ws.name)}</span><span class="workstream-count">${ws.count}<span>Open items</span></span>
  </button>`).join('')}</div>`;
}

function renderRecentNotes() {
  const notes = sortByDateDesc(state.notes).slice(0, 5);
  if (!notes.length) return emptyState('note', 'No notes yet', 'Capture your first meeting note, decision, or reference.', 'new-note', 'New note');
  return `<div class="simple-list">${notes.map(note => `<button class="simple-list-item" type="button" data-action="view-note" data-id="${note.id}" style="border-left:0;border-right:0;border-top:0;background:transparent;width:100%;text-align:left;cursor:pointer">
    <span class="simple-list-icon">${icon(note.type === 'decision' ? 'bulb' : note.type === 'reference' ? 'link' : 'note', 17)}</span>
    <span><span class="simple-list-title">${escapeHTML(note.title)}</span><span class="simple-list-meta">${escapeHTML(capitalize(note.type))} · ${formatDate(note.updatedAt, { year: false })}</span></span>
    <span class="simple-list-action">${icon('chevronRight', 15)}</span>
  </button>`).join('')}</div>`;
}

function renderRecentUploads() {
  const files = sortByDateDesc(state.files, 'createdAt').slice(0, 4);
  if (!files.length) return emptyState('upload', 'No uploads yet', 'Photograph a handwritten note or attach a supporting file.', 'open-ocr', 'Upload / OCR');
  return `<div class="simple-list">${files.map(file => `<button class="simple-list-item" type="button" data-action="view-file" data-id="${file.id}" style="border-left:0;border-right:0;border-top:0;background:transparent;width:100%;text-align:left;cursor:pointer">
    ${file.type?.startsWith('image/') ? `<img class="file-thumb" src="${escapeAttr(file.dataUrl)}" alt="">` : `<span class="simple-list-icon">${icon('file', 17)}</span>`}
    <span><span class="simple-list-title">${escapeHTML(file.name)}</span><span class="simple-list-meta">${formatDate(file.createdAt, { year: false })}${file.ocrText ? ' · OCR extracted' : ''}</span></span>
    <span class="simple-list-action">${icon('chevronRight', 15)}</span>
  </button>`).join('')}</div>`;
}

function renderDashboardReports() {
  const items = [
    ['week', 'This Week’s Summary', 'calendar'],
    ['month', 'Monthly Accomplishments', 'chart'],
    ['quarter', 'Quarterly Impact Report', 'file'],
    ['fiscal', 'Year-to-Date Summary', 'trophy']
  ];
  return `<div class="simple-list">${items.map(([preset, title, iconName]) => `<button class="simple-list-item" type="button" data-action="open-report" data-preset="${preset}" style="border-left:0;border-right:0;border-top:0;background:transparent;width:100%;text-align:left;cursor:pointer">
    <span class="simple-list-icon">${icon(iconName, 17)}</span><span><span class="simple-list-title">${escapeHTML(title)}</span><span class="simple-list-meta">Generate from current Atlas data</span></span><span class="simple-list-action">${icon('chevronRight', 15)}</span>
  </button>`).join('')}</div>`;
}

function renderRecentAccomplishments() {
  const items = sortByDateDesc(state.accomplishments, 'completedAt').slice(0, 6);
  if (!items.length) return emptyState('trophy', 'Start your accomplishment log', 'When meaningful tasks are completed, save the result and impact here.', 'new-accomplishment', 'Add accomplishment');
  return `<div class="accomplishment-mini-grid">${items.map(item => `<button class="accomplishment-mini" type="button" data-action="edit-accomplishment" data-id="${item.id}" style="border:0;background:transparent;text-align:left;cursor:pointer;color:inherit;padding:0">${icon('check', 15)}<span>${escapeHTML(item.title)}</span></button>`).join('')}</div>`;
}

function renderDashboardDiagnostics() {
  const diagnostics = getDiagnostics();
  return `<div class="diagnostic-list">${diagnostics.slice(0, 3).map(renderDiagnostic).join('')}</div>`;
}

function renderDiagnostic(item) {
  return `<div class="diagnostic-item ${item.tone}"><span class="diagnostic-icon">${icon(item.icon, 18)}</span><div><div class="diagnostic-title">${escapeHTML(item.title)}</div><div class="diagnostic-text">${escapeHTML(item.text)}</div></div></div>`;
}

function emptyState(iconName, title, text, action = '', actionLabel = '') {
  return `<div class="empty-state"><div class="empty-state-icon">${icon(iconName, 25)}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${action ? `<button class="button button-secondary button-small" type="button" data-action="${action}">${escapeHTML(actionLabel)}</button>` : ''}</div>`;
}

function capitalize(value = '') { return value ? value[0].toUpperCase() + value.slice(1) : ''; }

function renderTasksPage(routeFilter = 'all') {
  const effective = routeFilter === 'all' ? state.taskFilter : routeFilter;
  const labels = { all: 'All Tasks', open: 'Open', waiting: 'Waiting On', completed: 'Completed', recurring: 'Recurring', overdue: 'Overdue' };
  let tasks = [...state.tasks];
  if (routeFilter === 'all' && state.taskScope === 'today') tasks = tasks.filter(task => isDueToday(task) || isOverdue(task));
  if (routeFilter === 'all' && state.taskScope === 'week') tasks = tasks.filter(task => isDueThisWeek(task, state.settings.weekStartsOn) || isOverdue(task));
  if (routeFilter === 'all' && state.workstreamFilter) tasks = tasks.filter(task => task.workstreamId === state.workstreamFilter);
  if (effective === 'open') tasks = tasks.filter(task => task.status === 'open');
  if (effective === 'waiting') tasks = tasks.filter(task => task.status === 'waiting');
  if (effective === 'completed') tasks = tasks.filter(task => task.status === 'completed');
  if (effective === 'recurring') tasks = tasks.filter(task => task.recurringFrequency && task.recurringFrequency !== 'none');
  if (effective === 'overdue') tasks = tasks.filter(isOverdue);
  tasks = routeFilter === 'completed' ? sortByDateDesc(tasks, 'completedAt') : sortTasks(tasks);

  const activeWorkstream = state.workstreamFilter ? getWorkstream(state.workstreamFilter) : null;
  const scopeLabel = state.taskScope === 'today' ? 'Due Today' : state.taskScope === 'week' ? 'Due This Week' : '';
  const heading = activeWorkstream ? `${activeWorkstream.name} Tasks` : scopeLabel || labels[effective] || 'Tasks';
  return `
    <div class="page-heading">
      <div><h2>${escapeHTML(heading)}</h2><p>${activeWorkstream ? `Open and completed records connected to ${escapeHTML(activeWorkstream.name)}.` : taskPageDescription(effective)}</p></div>
      <div class="page-heading-actions"><button class="button button-secondary" type="button" data-action="weekly-review">${icon('refresh', 16)} Weekly Review</button><button class="button button-primary" type="button" data-action="new-task">${icon('plus', 17)} New Task</button></div>
    </div>
    ${routeFilter === 'all' ? `<div class="toolbar"><div class="chip-row">${['all','open','waiting','overdue','recurring','completed'].map(filter => `<button class="chip ${state.taskFilter === filter && !state.taskScope ? 'is-active' : ''}" type="button" data-action="task-filter" data-filter="${filter}">${escapeHTML(labels[filter])} <strong>${taskFilterCount(filter)}</strong></button>`).join('')}</div>${state.taskScope || state.workstreamFilter ? `<span class="toolbar-spacer"></span><button class="chip is-active" type="button" data-action="clear-task-scope">${icon('close', 12)} Clear ${escapeHTML(scopeLabel || activeWorkstream?.name || 'filter')}</button>` : ''}</div>` : ''}
    ${tasks.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Status</th><th>Task</th><th>Workstream</th><th>Due / Follow-up</th><th>Priority</th><th>Linked note</th><th aria-label="Actions"></th></tr></thead><tbody>${tasks.map(renderTaskTableRow).join('')}</tbody></table></div>` : emptyState('task', `No ${labels[effective].toLowerCase()} items`, taskEmptyDescription(effective), 'new-task', 'Add a task')}`;
}

function taskPageDescription(filter) {
  const descriptions = {
    all: 'Use one structured list for assignments, dependencies, recurring responsibilities, and finished work.',
    open: 'Active assignments that are ready for your attention.',
    waiting: 'Requests and dependencies that need a follow-up date and owner.',
    completed: 'Finished work that can feed your accomplishment record and performance reports.',
    recurring: 'Repeat responsibilities that Atlas can roll forward after completion.',
    overdue: 'Items with due dates before today that are still open.'
  };
  return descriptions[filter] || descriptions.all;
}

function taskEmptyDescription(filter) {
  if (filter === 'overdue') return 'You have no overdue tasks. Tiny parade warranted.';
  if (filter === 'waiting') return 'Nothing is currently waiting on someone else.';
  if (filter === 'completed') return 'Completed tasks will appear here and can be converted into accomplishments.';
  if (filter === 'recurring') return 'Add a task and choose a recurrence schedule.';
  return 'Create a task directly or turn part of a note into one.';
}

function taskFilterCount(filter) {
  if (filter === 'all') return state.tasks.length;
  if (filter === 'open') return state.tasks.filter(task => task.status === 'open').length;
  if (filter === 'waiting') return state.tasks.filter(task => task.status === 'waiting').length;
  if (filter === 'completed') return state.tasks.filter(task => task.status === 'completed').length;
  if (filter === 'recurring') return state.tasks.filter(task => task.recurringFrequency && task.recurringFrequency !== 'none').length;
  if (filter === 'overdue') return state.tasks.filter(isOverdue).length;
  return 0;
}

function renderTaskTableRow(task) {
  const ws = getWorkstream(task.workstreamId);
  const note = getNote(task.linkedNoteId);
  const due = taskDueDisplay(task);
  return `<tr>
    <td><button class="task-check ${task.status === 'completed' ? 'is-complete' : task.status === 'waiting' ? 'is-waiting' : ''}" type="button" data-action="toggle-task" data-id="${task.id}" aria-label="${task.status === 'completed' ? 'Reopen' : 'Complete'} ${escapeAttr(task.title)}">${task.status === 'completed' ? icon('check', 14) : task.status === 'waiting' ? icon('hourglass', 12) : ''}</button></td>
    <td><button class="task-title-button ${task.status === 'completed' ? 'completed' : ''}" type="button" data-action="edit-task" data-id="${task.id}">${escapeHTML(task.title)}</button><div class="table-subtitle">${escapeHTML(truncate(task.description || task.waitingOn || 'No description', 85))}</div></td>
    <td><span class="pill" style="background:${ws.color}1c;color:${ws.color}">${escapeHTML(ws.name)}</span></td>
    <td><span class="task-due ${due.className}">${escapeHTML(due.text)}</span></td>
    <td><span class="pill ${task.priority || 'medium'}">${escapeHTML(capitalize(task.priority || 'medium'))}</span></td>
    <td>${note ? `<button class="panel-link" type="button" data-action="view-note" data-id="${note.id}">${escapeHTML(truncate(note.title, 28))}</button>` : '<span class="table-subtitle">—</span>'}</td>
    <td><div class="table-actions"><button class="icon-button button-icon-only" type="button" data-action="edit-task" data-id="${task.id}" aria-label="Edit task">${icon('edit', 16)}</button><button class="icon-button button-icon-only" type="button" data-action="delete-task" data-id="${task.id}" aria-label="Delete task">${icon('trash', 16)}</button></div></td>
  </tr>`;
}

function openTaskModal(task = null, defaults = {}) {
  const editing = Boolean(task);
  const data = {
    id: task?.id || uuid(),
    title: task?.title || defaults.title || '',
    description: task?.description || defaults.description || '',
    status: task?.status || defaults.status || 'open',
    priority: task?.priority || defaults.priority || 'medium',
    dueDate: task?.dueDate || defaults.dueDate || '',
    followUpDate: task?.followUpDate || defaults.followUpDate || '',
    waitingOn: task?.waitingOn || defaults.waitingOn || '',
    workstreamId: task?.workstreamId || defaults.workstreamId || '',
    linkedNoteId: task?.linkedNoteId || defaults.linkedNoteId || '',
    sourceLink: task?.sourceLink || defaults.sourceLink || '',
    recurringFrequency: task?.recurringFrequency || defaults.recurringFrequency || 'none',
    tags: task?.tags || defaults.tags || []
  };

  openModal({
    title: editing ? 'Edit Task' : 'New Task',
    subtitle: editing ? 'Update the assignment, status, or follow-up details.' : 'Capture the next action and enough context to follow through.',
    size: 'wide',
    body: `<form id="task-form" class="form-stack">
      <div class="field"><label for="task-title">Task <span class="required">*</span></label><input id="task-title" name="title" required maxlength="180" value="${escapeAttr(data.title)}" placeholder="What needs to be done?"></div>
      <div class="field"><label for="task-description">Context or notes</label><textarea id="task-description" name="description" placeholder="Include the request, expected outcome, or useful context.">${escapeHTML(data.description)}</textarea></div>
      <div class="field-row three">
        <div class="field"><label for="task-status">Status</label><select id="task-status" name="status"><option value="open" ${data.status === 'open' ? 'selected' : ''}>Open</option><option value="waiting" ${data.status === 'waiting' ? 'selected' : ''}>Waiting On</option><option value="completed" ${data.status === 'completed' ? 'selected' : ''}>Completed</option></select></div>
        <div class="field"><label for="task-priority">Priority</label><select id="task-priority" name="priority"><option value="low" ${data.priority === 'low' ? 'selected' : ''}>Low</option><option value="medium" ${data.priority === 'medium' ? 'selected' : ''}>Medium</option><option value="high" ${data.priority === 'high' ? 'selected' : ''}>High</option></select></div>
        <div class="field"><label for="task-workstream">Workstream</label><select id="task-workstream" name="workstreamId">${workstreamOptions(data.workstreamId)}</select></div>
      </div>
      <div class="field-row three">
        <div class="field"><label for="task-due">Due date</label><input id="task-due" name="dueDate" type="date" value="${escapeAttr(data.dueDate)}"></div>
        <div class="field"><label for="task-follow-up">Follow-up date</label><input id="task-follow-up" name="followUpDate" type="date" value="${escapeAttr(data.followUpDate)}"></div>
        <div class="field"><label for="task-recurring">Repeats</label><select id="task-recurring" name="recurringFrequency"><option value="none" ${data.recurringFrequency === 'none' ? 'selected' : ''}>Does not repeat</option><option value="daily" ${data.recurringFrequency === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${data.recurringFrequency === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${data.recurringFrequency === 'monthly' ? 'selected' : ''}>Monthly</option><option value="quarterly" ${data.recurringFrequency === 'quarterly' ? 'selected' : ''}>Quarterly</option><option value="annual" ${data.recurringFrequency === 'annual' ? 'selected' : ''}>Annually</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="task-waiting-on">Waiting on</label><input id="task-waiting-on" name="waitingOn" value="${escapeAttr(data.waitingOn)}" placeholder="Person, team, vendor, or decision"></div>
        <div class="field"><label for="task-note">Linked note</label><select id="task-note" name="linkedNoteId">${noteOptions(data.linkedNoteId)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="task-source">Source link</label><input id="task-source" name="sourceLink" type="url" value="${escapeAttr(data.sourceLink)}" placeholder="Link to a Slack thread, document, website, or file"></div>
        <div class="field"><label for="task-tags">Tags</label><input id="task-tags" name="tags" value="${escapeAttr(data.tags.join(', '))}" placeholder="Meeting, Website, Follow-up"><div class="field-help">Separate tags with commas.</div></div>
      </div>
    </form>`,
    footer: `${editing ? `<button class="button button-danger-soft" type="button" data-task-delete="${data.id}">${icon('trash', 16)} Delete</button>` : ''}<span class="footer-spacer"></span><button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="task-form">${icon('save', 16)} ${editing ? 'Save Changes' : 'Create Task'}</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#task-form');
      const status = form.elements.status;
      const waitingOn = form.elements.waitingOn;
      const followUp = form.elements.followUpDate;
      const syncWaitingFields = () => {
        const waiting = status.value === 'waiting';
        waitingOn.closest('.field').style.opacity = waiting ? '1' : '.72';
        followUp.closest('.field').style.opacity = waiting ? '1' : '.72';
      };
      status.addEventListener('change', syncWaitingFields);
      syncWaitingFields();
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(form);
        const now = new Date().toISOString();
        const next = {
          ...task,
          id: data.id,
          title: formData.get('title').trim(),
          description: formData.get('description').trim(),
          status: formData.get('status'),
          priority: formData.get('priority'),
          dueDate: formData.get('dueDate'),
          followUpDate: formData.get('followUpDate'),
          waitingOn: formData.get('waitingOn').trim(),
          workstreamId: formData.get('workstreamId'),
          linkedNoteId: formData.get('linkedNoteId'),
          sourceLink: normalizeURL(formData.get('sourceLink')),
          recurringFrequency: formData.get('recurringFrequency'),
          tags: parseTags(formData.get('tags')),
          createdAt: task?.createdAt || now,
          updatedAt: now,
          completedAt: formData.get('status') === 'completed' ? (task?.completedAt || now) : ''
        };
        if (!next.title) return;
        await put('tasks', next);
        await refreshStore('tasks');
        closeModal();
        render();
        toast(editing ? 'Task updated' : 'Task created', next.title, 'success');
      });
      modal.querySelector('[data-task-delete]')?.addEventListener('click', async () => {
        closeModal();
        await deleteTask(data.id);
      });
    }
  });
}

async function deleteTask(id) {
  const task = getTask(id);
  if (!task) return;
  const confirmed = await confirmDialog({ title: 'Delete task?', message: `“${task.title}” will be permanently removed from this browser.`, confirmLabel: 'Delete Task', danger: true });
  if (!confirmed) return;
  await remove('tasks', id);
  await refreshStore('tasks');
  render();
  toast('Task deleted', '', 'info');
}

async function toggleTask(id) {
  const task = getTask(id);
  if (!task) return;
  if (task.status === 'completed') {
    const reopened = { ...task, status: 'open', completedAt: '', updatedAt: new Date().toISOString() };
    await put('tasks', reopened);
    await refreshStore('tasks');
    render();
    toast('Task reopened', task.title, 'info');
    return;
  }
  openCompleteTaskModal(task);
}

function openCompleteTaskModal(task) {
  const ws = getWorkstream(task.workstreamId);
  openModal({
    title: 'Complete Task',
    subtitle: task.title,
    size: 'small',
    body: `<form id="complete-task-form" class="form-stack">
      <div class="notice info">${icon('trophy', 18)}<div><strong>Preserve the meaningful work</strong>Atlas can add this task to your accomplishment log for future reports and performance evaluations.</div></div>
      <label class="checkbox-row"><input type="checkbox" name="logAccomplishment" checked><span><strong>Add to accomplishments</strong><br><span style="color:var(--muted)">You can edit the wording now or later.</span></span></label>
      <div class="field"><label for="completion-title">Accomplishment statement</label><input id="completion-title" name="accomplishmentTitle" value="${escapeAttr(task.title)}"></div>
      <div class="field"><label for="completion-impact">Result or impact</label><textarea id="completion-impact" name="impact" placeholder="What improved, who benefited, or what outcome did this support?">${escapeHTML(taskImpactSuggestion({ ...task, workstreamName: ws.name }))}</textarea></div>
      <div class="field"><label for="completion-goal">Related goal</label><select id="completion-goal" name="goal">${goalOptions('')}</select></div>
      ${task.recurringFrequency && task.recurringFrequency !== 'none' ? `<div class="notice info">${icon('repeat', 18)}<div><strong>Recurring task</strong>Atlas will create the next ${escapeHTML(task.recurringFrequency)} occurrence after this one is completed.</div></div>` : ''}
    </form>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="complete-task-form">${icon('check', 16)} Mark Complete</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#complete-task-form');
      const checkbox = form.elements.logAccomplishment;
      const fields = [form.elements.accomplishmentTitle, form.elements.impact, form.elements.goal];
      const toggle = () => fields.forEach(field => { field.disabled = !checkbox.checked; field.closest('.field').style.opacity = checkbox.checked ? '1' : '.55'; });
      checkbox.addEventListener('change', toggle);
      toggle();
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const now = new Date().toISOString();
        let accomplishmentId = task.accomplishmentId || '';
        if (checkbox.checked) {
          accomplishmentId ||= uuid();
          const accomplishment = {
            id: accomplishmentId,
            title: form.elements.accomplishmentTitle.value.trim() || task.title,
            impact: form.elements.impact.value.trim(),
            results: '',
            workstreamId: task.workstreamId || '',
            goal: form.elements.goal.value,
            skills: task.tags || [],
            evidenceLink: task.sourceLink || '',
            relatedTaskId: task.id,
            completedAt: todayISO(),
            createdAt: now,
            updatedAt: now
          };
          await put('accomplishments', accomplishment);
        }
        await put('tasks', { ...task, status: 'completed', completedAt: now, updatedAt: now, accomplishmentId });
        if (task.recurringFrequency && task.recurringFrequency !== 'none') {
          const nextDue = nextRecurrenceDate(task.dueDate || todayISO(), task.recurringFrequency);
          const nextTask = {
            ...task,
            id: uuid(),
            status: 'open',
            dueDate: nextDue,
            followUpDate: '',
            completedAt: '',
            accomplishmentId: '',
            createdAt: now,
            updatedAt: now
          };
          await put('tasks', nextTask);
        }
        await Promise.all([refreshStore('tasks'), refreshStore('accomplishments')]);
        closeModal();
        render();
        toast('Task completed', checkbox.checked ? 'It was also added to your accomplishment log.' : task.title, 'success');
      });
    }
  });
}

function nextRecurrenceDate(dateValue, frequency) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  if (frequency === 'quarterly') date.setMonth(date.getMonth() + 3);
  if (frequency === 'annual') date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function renderNotesPage(typeFilter = 'all') {
  const title = typeFilter === 'decision' ? 'Decision Log' : typeFilter === 'reference' ? 'References' : 'Notes';
  const description = typeFilter === 'decision'
    ? 'Record what was decided, when, by whom, and the context you may need later.'
    : typeFilter === 'reference'
      ? 'Save procedures, contacts, links, and source material without turning them into tasks.'
      : 'Keep full notes here, then connect action items to the task tracker.';
  let notes = typeFilter === 'all' ? state.notes : state.notes.filter(note => note.type === typeFilter);
  if (typeFilter === 'all' && state.noteFilter !== 'all') notes = notes.filter(note => note.type === state.noteFilter);
  notes = sortByDateDesc(notes);
  const addAction = typeFilter === 'decision' ? 'new-decision' : typeFilter === 'reference' ? 'new-reference' : 'new-note';

  return `
    <div class="page-heading">
      <div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div>
      <div class="page-heading-actions"><button class="button button-secondary" type="button" data-action="open-ocr">${icon('camera', 16)} Upload / OCR</button><button class="button button-primary" type="button" data-action="${addAction}">${icon('plus', 17)} New ${typeFilter === 'decision' ? 'Decision' : typeFilter === 'reference' ? 'Reference' : 'Note'}</button></div>
    </div>
    ${typeFilter === 'all' ? `<div class="toolbar"><div class="chip-row">${['all','note','decision','reference'].map(filter => `<button class="chip ${state.noteFilter === filter ? 'is-active' : ''}" type="button" data-action="note-filter" data-filter="${filter}">${escapeHTML(filter === 'all' ? 'All' : capitalize(filter))} <strong>${filter === 'all' ? state.notes.length : state.notes.filter(note => note.type === filter).length}</strong></button>`).join('')}</div><span class="toolbar-spacer"></span><span class="pill">${state.notes.reduce((total, note) => total + wordCount(note.body), 0).toLocaleString()} words</span></div>` : ''}
    ${notes.length ? `<div class="card-grid">${notes.map(renderNoteCard).join('')}</div>` : emptyState(typeFilter === 'decision' ? 'bulb' : typeFilter === 'reference' ? 'link' : 'note', `No ${title.toLowerCase()} yet`, typeFilter === 'decision' ? 'Create a decision entry after a meeting or important conversation.' : typeFilter === 'reference' ? 'Save a useful link, procedure, or source document.' : 'Create your first note or upload an image and extract its text.', addAction, `New ${typeFilter === 'decision' ? 'decision' : typeFilter === 'reference' ? 'reference' : 'note'}`)}`;
}

function renderNoteCard(note) {
  const ws = getWorkstream(note.workstreamId);
  const fileCount = state.files.filter(file => file.noteId === note.id).length;
  const linkedTasks = state.tasks.filter(task => task.linkedNoteId === note.id).length;
  return `<article class="content-card">
    <div class="card-topline">
      <div style="display:flex;gap:10px;min-width:0"><span class="note-type-icon ${note.type}">${icon(note.type === 'decision' ? 'bulb' : note.type === 'reference' ? 'link' : 'note', 18)}</span><div style="min-width:0"><h3 class="card-title"><button class="card-title-button" type="button" data-action="view-note" data-id="${note.id}">${escapeHTML(note.title)}</button></h3><div class="card-meta">${escapeHTML(capitalize(note.type))} · Updated ${formatDate(note.updatedAt, { year: false })}</div></div></div>
      <button class="icon-button button-icon-only" type="button" data-action="edit-note" data-id="${note.id}" aria-label="Edit note">${icon('edit', 16)}</button>
    </div>
    <div class="card-body">${escapeHTML(truncate(note.body || 'No note text yet.', 220))}</div>
    <div class="card-footer"><div class="card-tags"><span class="pill" style="background:${ws.color}1c;color:${ws.color}">${escapeHTML(ws.name)}</span>${(note.tags || []).slice(0,2).map(tag => `<span class="pill">${escapeHTML(tag)}</span>`).join('')}${fileCount ? `<span class="pill">${icon('upload', 11)} ${fileCount}</span>` : ''}${linkedTasks ? `<span class="pill">${icon('task', 11)} ${linkedTasks}</span>` : ''}</div><div class="card-actions"><button class="icon-button button-icon-only" type="button" data-action="view-note" data-id="${note.id}" aria-label="Open note">${icon('eye', 16)}</button><button class="icon-button button-icon-only" type="button" data-action="export-note-menu" data-id="${note.id}" aria-label="Export note">${icon('download', 16)}</button></div></div>
  </article>`;
}

function openNoteModal(note = null, presetType = 'note', defaults = {}) {
  const editing = Boolean(note);
  const data = {
    id: note?.id || uuid(),
    title: note?.title || defaults.title || '',
    body: note?.body || defaults.body || '',
    type: note?.type || presetType || 'note',
    workstreamId: note?.workstreamId || defaults.workstreamId || '',
    tags: note?.tags || defaults.tags || [],
    sourceLink: note?.sourceLink || defaults.sourceLink || '',
    shareable: note?.shareable ?? true
  };
  const existingFiles = state.files.filter(file => file.noteId === data.id);

  openModal({
    title: editing ? `Edit ${capitalize(data.type)}` : `New ${capitalize(data.type)}`,
    subtitle: data.type === 'decision' ? 'Capture the outcome and enough context to understand it later.' : data.type === 'reference' ? 'Save useful information without creating an action item.' : 'Write the full note here; action items can become linked tasks.',
    size: 'wide',
    body: `<form id="note-form" class="form-stack">
      <div class="field-row">
        <div class="field"><label for="note-title">Title <span class="required">*</span></label><input id="note-title" name="title" required maxlength="180" value="${escapeAttr(data.title)}" placeholder="Meeting, topic, project, or reference"></div>
        <div class="field"><label for="note-type">Type</label><select id="note-type" name="type"><option value="note" ${data.type === 'note' ? 'selected' : ''}>Note</option><option value="decision" ${data.type === 'decision' ? 'selected' : ''}>Decision</option><option value="reference" ${data.type === 'reference' ? 'selected' : ''}>Reference</option></select></div>
      </div>
      <div class="field"><label for="note-body">Note</label><textarea id="note-body" class="note-body" name="body" placeholder="Type or paste your notes here...">${escapeHTML(data.body)}</textarea><div class="field-help"><span id="note-word-count">${wordCount(data.body)}</span> words. Plain text is used so exports remain clean and dependable.</div></div>
      <div class="field-row">
        <div class="field"><label for="note-workstream">Workstream</label><select id="note-workstream" name="workstreamId">${workstreamOptions(data.workstreamId)}</select></div>
        <div class="field"><label for="note-tags">Tags</label><input id="note-tags" name="tags" value="${escapeAttr(data.tags.join(', '))}" placeholder="Meeting, Onboarding, Website"><div class="field-help">Separate tags with commas.</div></div>
      </div>
      <div class="field"><label for="note-source">Source link</label><input id="note-source" name="sourceLink" type="url" value="${escapeAttr(data.sourceLink)}" placeholder="Optional link to a document, Slack thread, or website"></div>
      <label class="checkbox-row"><input type="checkbox" name="shareable" ${data.shareable ? 'checked' : ''}><span><strong>Shareable note</strong><br><span style="color:var(--muted)">Use as a reminder that this note is suitable for export. Atlas does not enforce permissions.</span></span></label>
      <div class="form-section-title">Attachments</div>
      ${existingFiles.length ? `<div class="manage-list">${existingFiles.map(file => `<div class="manage-row"><span class="simple-list-icon">${icon(file.type?.startsWith('image/') ? 'image' : 'file', 17)}</span><div class="manage-copy"><strong>${escapeHTML(file.name)}</strong><span>${formatFileSize(file.size)}</span></div><button class="icon-button" type="button" data-remove-file="${file.id}" aria-label="Remove ${escapeAttr(file.name)}">${icon('trash', 16)}</button></div>`).join('')}</div>` : '<div class="field-help">No attachments yet.</div>'}
      <div class="field"><label for="note-attachments">Add files</label><input id="note-attachments" name="attachments" type="file" multiple accept="image/*,.pdf,.txt,.md,.doc,.docx,.csv,.xlsx"><div class="field-help">Files are stored in this browser only. Keep each file under 8 MB.</div></div>
    </form>`,
    footer: `${editing ? `<button class="button button-danger-soft" type="button" data-note-delete="${data.id}">${icon('trash', 16)} Delete</button>` : ''}<span class="footer-spacer"></span><button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="note-form">${icon('save', 16)} ${editing ? 'Save Changes' : 'Save Note'}</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#note-form');
      const body = form.elements.body;
      const counter = modal.querySelector('#note-word-count');
      body.addEventListener('input', () => { counter.textContent = wordCount(body.value); });
      modal.querySelectorAll('[data-remove-file]').forEach(button => button.addEventListener('click', async () => {
        await remove('files', button.dataset.removeFile);
        await refreshStore('files');
        button.closest('.manage-row').remove();
        toast('Attachment removed', '', 'info');
      }));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(form);
        const now = new Date().toISOString();
        const next = {
          ...note,
          id: data.id,
          title: formData.get('title').trim(),
          body: formData.get('body').trim(),
          type: formData.get('type'),
          workstreamId: formData.get('workstreamId'),
          tags: parseTags(formData.get('tags')),
          sourceLink: normalizeURL(formData.get('sourceLink')),
          shareable: form.elements.shareable.checked,
          createdAt: note?.createdAt || now,
          updatedAt: now
        };
        if (!next.title) return;
        await put('notes', next);
        const files = [...form.elements.attachments.files];
        if (files.length) await storeFiles(files, next.id);
        await Promise.all([refreshStore('notes'), refreshStore('files')]);
        closeModal();
        render();
        toast(editing ? 'Note updated' : 'Note saved', next.title, 'success');
      });
      modal.querySelector('[data-note-delete]')?.addEventListener('click', async () => {
        closeModal();
        await deleteNote(data.id);
      });
    }
  });
}

async function storeFiles(files, noteId, ocrText = '') {
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      toast('File skipped', `${file.name} is larger than the 8 MB prototype limit.`, 'error');
      continue;
    }
    try {
      const processed = file.type.startsWith('image/') ? await compressImage(file) : { dataUrl: await fileToDataURL(file), type: file.type, size: file.size };
      const record = {
        id: uuid(),
        name: file.name,
        type: processed.type || file.type || 'application/octet-stream',
        size: processed.size || file.size,
        dataUrl: processed.dataUrl,
        width: processed.width || null,
        height: processed.height || null,
        noteId,
        ocrText,
        createdAt: new Date().toISOString()
      };
      await put('files', record);
    } catch (error) {
      toast('Unable to store file', `${file.name}: ${error.message}`, 'error');
    }
  }
}

async function deleteNote(id) {
  const note = getNote(id);
  if (!note) return;
  const linkedTaskCount = state.tasks.filter(task => task.linkedNoteId === id).length;
  const message = linkedTaskCount
    ? `“${note.title}” and its attachments will be removed. ${linkedTaskCount} linked task(s) will remain but lose the note link.`
    : `“${note.title}” and its attachments will be permanently removed from this browser.`;
  const confirmed = await confirmDialog({ title: 'Delete note?', message, confirmLabel: 'Delete Note', danger: true });
  if (!confirmed) return;
  const attached = state.files.filter(file => file.noteId === id);
  await Promise.all(attached.map(file => remove('files', file.id)));
  await remove('notes', id);
  const linkedTasks = state.tasks.filter(task => task.linkedNoteId === id);
  await Promise.all(linkedTasks.map(task => put('tasks', { ...task, linkedNoteId: '', updatedAt: new Date().toISOString() })));
  await Promise.all([refreshStore('notes'), refreshStore('files'), refreshStore('tasks')]);
  render();
  toast('Note deleted', '', 'info');
}

function openNoteDetail(id) {
  const note = getNote(id);
  if (!note) return;
  const ws = getWorkstream(note.workstreamId);
  const files = state.files.filter(file => file.noteId === note.id);
  const tasks = state.tasks.filter(task => task.linkedNoteId === note.id);
  openModal({
    title: note.title,
    subtitle: `${capitalize(note.type)} · Updated ${formatDateTime(note.updatedAt)}`,
    size: 'wide',
    body: `<div class="note-detail-meta"><span class="pill" style="background:${ws.color}1c;color:${ws.color}">${escapeHTML(ws.name)}</span>${(note.tags || []).map(tag => `<span class="pill">${escapeHTML(tag)}</span>`).join('')}${note.shareable ? '<span class="pill completed">Shareable</span>' : '<span class="pill waiting">Personal working note</span>'}</div>
      <div class="note-detail-body">${escapeHTML(note.body || 'No note text.')}</div>
      ${note.sourceLink ? `<p><a href="${escapeAttr(note.sourceLink)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)} Open source link</a></p>` : ''}
      ${files.length ? `<h3 style="margin-top:24px">Attachments</h3><div class="simple-list">${files.map(file => `<button class="simple-list-item" type="button" data-action="view-file" data-id="${file.id}" style="width:100%;border-left:0;border-right:0;border-top:0;background:transparent;text-align:left;cursor:pointer">${file.type?.startsWith('image/') ? `<img class="file-thumb" src="${escapeAttr(file.dataUrl)}" alt="">` : `<span class="simple-list-icon">${icon('file', 17)}</span>`}<span><span class="simple-list-title">${escapeHTML(file.name)}</span><span class="simple-list-meta">${formatFileSize(file.size)}${file.ocrText ? ' · OCR extracted' : ''}</span></span>${icon('chevronRight', 15)}</button>`).join('')}</div>` : ''}
      ${tasks.length ? `<h3 style="margin-top:24px">Linked Tasks</h3><div class="task-list">${tasks.map(renderTaskRow).join('')}</div>` : ''}`,
    footer: `<button class="button button-secondary" type="button" data-note-action="task" data-id="${note.id}">${icon('task', 16)} Create Linked Task</button><span class="footer-spacer"></span><button class="button button-secondary" type="button" data-note-action="export" data-id="${note.id}">${icon('download', 16)} Export</button><button class="button button-primary" type="button" data-note-action="edit" data-id="${note.id}">${icon('edit', 16)} Edit</button>`,
    onOpen(modal) {
      modal.querySelector('[data-note-action="task"]').addEventListener('click', () => { closeModal(); openTaskModal(null, { linkedNoteId: note.id, workstreamId: note.workstreamId, description: truncate(note.body, 500), tags: note.tags }); });
      modal.querySelector('[data-note-action="export"]').addEventListener('click', () => openNoteExportModal(note));
      modal.querySelector('[data-note-action="edit"]').addEventListener('click', () => { closeModal(); openNoteModal(note); });
    }
  });
}

function openNoteExportModal(note) {
  openModal({
    title: 'Export Note',
    subtitle: note.title,
    size: 'small',
    body: `<div class="quick-modal-grid">
      ${exportOption('note-export-copy', 'copy', 'Copy formatted text', 'Paste into email, Slack, or Google Docs')}
      ${exportOption('note-export-text', 'file', 'Plain text (.txt)', 'A simple, portable text file')}
      ${exportOption('note-export-markdown', 'note', 'Markdown (.md)', 'Headings and metadata in readable text')}
      ${exportOption('note-export-word', 'file', 'Word-compatible (.doc)', 'Opens in Microsoft Word for editing')}
      ${exportOption('note-export-print', 'print', 'Print / Save as PDF', 'Use your browser’s print dialog')}
    </div>`,
    onOpen(modal) {
      modal.querySelectorAll('[data-export-option]').forEach(button => button.addEventListener('click', async () => {
        const option = button.dataset.exportOption;
        try {
          await exportNote(note, option);
          if (option !== 'note-export-print') closeModal();
        } catch (error) { toast('Export failed', error.message, 'error'); }
      }));
    }
  });
}

function exportOption(action, iconName, title, subtitle) {
  return `<button class="quick-modal-option" type="button" data-export-option="${action}"><span class="quick-modal-option-icon">${icon(iconName, 20)}</span><span><strong>${escapeHTML(title)}</strong><span>${escapeHTML(subtitle)}</span></span></button>`;
}

function noteExportText(note) {
  const ws = getWorkstream(note.workstreamId);
  return `${note.title}\n${'='.repeat(note.title.length)}\nType: ${capitalize(note.type)}\nWorkstream: ${ws.name}\nUpdated: ${formatDateTime(note.updatedAt)}\nTags: ${(note.tags || []).join(', ') || 'None'}\n${note.sourceLink ? `Source: ${note.sourceLink}\n` : ''}\n${note.body || ''}`;
}

function noteExportMarkdown(note) {
  const ws = getWorkstream(note.workstreamId);
  return `# ${note.title}\n\n- **Type:** ${capitalize(note.type)}\n- **Workstream:** ${ws.name}\n- **Updated:** ${formatDateTime(note.updatedAt)}\n- **Tags:** ${(note.tags || []).join(', ') || 'None'}${note.sourceLink ? `\n- **Source:** ${note.sourceLink}` : ''}\n\n## Notes\n\n${note.body || ''}\n`;
}

function noteExportHTML(note) {
  const ws = getWorkstream(note.workstreamId);
  return `<h1>${escapeHTML(note.title)}</h1><p class="meta"><strong>Type:</strong> ${escapeHTML(capitalize(note.type))}<br><strong>Workstream:</strong> ${escapeHTML(ws.name)}<br><strong>Updated:</strong> ${escapeHTML(formatDateTime(note.updatedAt))}<br><strong>Tags:</strong> ${escapeHTML((note.tags || []).join(', ') || 'None')}</p>${note.sourceLink ? `<p><strong>Source:</strong> ${escapeHTML(note.sourceLink)}</p>` : ''}<h2>Notes</h2><div class="pre">${escapeHTML(note.body || '')}</div>`;
}

async function exportNote(note, option) {
  const base = slugify(note.title);
  if (option === 'note-export-copy') {
    await navigator.clipboard.writeText(noteExportText(note));
    toast('Copied', 'The formatted note is on your clipboard.', 'success');
  }
  if (option === 'note-export-text') downloadText(noteExportText(note), `${base}.txt`);
  if (option === 'note-export-markdown') downloadText(noteExportMarkdown(note), `${base}.md`, 'text/markdown;charset=utf-8');
  if (option === 'note-export-word') downloadText(wordCompatibleHTML(note.title, noteExportHTML(note)), `${base}.doc`, 'application/msword;charset=utf-8');
  if (option === 'note-export-print') printDocument(note.title, noteExportHTML(note));
}

function renderUploadsPage() {
  const files = sortByDateDesc(state.files, 'createdAt');
  const withOCR = files.filter(file => file.ocrText?.trim()).length;
  return `
    <div class="page-heading">
      <div><h2>Uploads</h2><p>Supporting files stay in this browser and can be linked to notes.</p></div>
      <div class="page-heading-actions"><button class="button button-primary" type="button" data-action="open-ocr">${icon('camera', 17)} Upload / OCR</button></div>
    </div>
    <div class="toolbar"><span class="pill">${files.length} files</span><span class="pill completed">${withOCR} with OCR text</span><span class="pill">${formatFileSize(files.reduce((sum, file) => sum + (file.size || 0), 0))} stored</span></div>
    ${files.length ? `<div class="upload-grid">${files.map(renderUploadCard).join('')}</div>` : emptyState('upload', 'No uploads yet', 'Use Upload / OCR to photograph handwriting, signage, a whiteboard, or a printed page. Image OCR is experimental.', 'open-ocr', 'Upload an image')}`;
}

function renderUploadCard(file) {
  const note = getNote(file.noteId);
  return `<article class="content-card upload-card">
    <button class="upload-preview" type="button" data-action="view-file" data-id="${file.id}" style="border:0;width:100%;cursor:pointer">
      ${file.type?.startsWith('image/') ? `<img src="${escapeAttr(file.dataUrl)}" alt="Preview of ${escapeAttr(file.name)}">` : icon('file', 42)}
    </button>
    <div class="upload-card-body">
      <div class="upload-name" title="${escapeAttr(file.name)}">${escapeHTML(file.name)}</div>
      <div class="upload-meta">${formatFileSize(file.size)} · ${formatDate(file.createdAt, { year: false })}</div>
      ${note ? `<div class="upload-meta">Linked to <button class="panel-link" type="button" data-action="view-note" data-id="${note.id}">${escapeHTML(note.title)}</button></div>` : ''}
      ${file.ocrText ? `<div class="upload-ocr">${escapeHTML(file.ocrText)}</div>` : '<div class="upload-ocr">No OCR text saved.</div>'}
      <div class="card-footer"><span class="pill ${file.ocrText ? 'completed' : ''}">${file.ocrText ? 'OCR extracted' : 'File only'}</span><div class="card-actions"><button class="icon-button button-icon-only" type="button" data-action="download-file" data-id="${file.id}" aria-label="Download file">${icon('download', 16)}</button><button class="icon-button button-icon-only" type="button" data-action="delete-file" data-id="${file.id}" aria-label="Delete file">${icon('trash', 16)}</button></div></div>
    </div>
  </article>`;
}

function openFileDetail(id) {
  const file = getFile(id);
  if (!file) return;
  const note = getNote(file.noteId);
  openModal({
    title: file.name,
    subtitle: `${formatFileSize(file.size)} · Added ${formatDateTime(file.createdAt)}`,
    size: 'wide',
    body: `${file.type?.startsWith('image/') ? `<div class="ocr-preview" style="min-height:360px"><img src="${escapeAttr(file.dataUrl)}" alt="${escapeAttr(file.name)}"></div>` : `<div class="empty-state"><div class="empty-state-icon">${icon('file', 28)}</div><h3>${escapeHTML(file.name)}</h3><p>This file can be downloaded but is not previewed by Atlas.</p></div>`}
      ${file.ocrText ? `<h3 style="margin-top:22px">Extracted Text</h3><div class="note-detail-body">${escapeHTML(file.ocrText)}</div>` : ''}
      ${note ? `<p style="margin-top:20px"><strong>Linked note:</strong> <button class="panel-link" type="button" data-action="view-note" data-id="${note.id}">${escapeHTML(note.title)}</button></p>` : ''}`,
    footer: `<button class="button button-danger-soft" type="button" data-file-action="delete" data-id="${file.id}">${icon('trash', 16)} Delete</button><span class="footer-spacer"></span>${file.ocrText ? `<button class="button button-secondary" type="button" data-file-action="copy" data-id="${file.id}">${icon('copy', 16)} Copy Text</button>` : ''}<button class="button button-primary" type="button" data-file-action="download" data-id="${file.id}">${icon('download', 16)} Download</button>`,
    onOpen(modal) {
      modal.querySelector('[data-file-action="download"]').addEventListener('click', () => downloadFile(file));
      modal.querySelector('[data-file-action="copy"]')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(file.ocrText || '');
        toast('OCR text copied', '', 'success');
      });
      modal.querySelector('[data-file-action="delete"]').addEventListener('click', async () => {
        closeModal();
        await deleteFile(file.id);
      });
    }
  });
}

async function downloadFile(file) {
  try {
    const response = await fetch(file.dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, file.name || 'atlas-file');
  } catch (error) {
    toast('Download failed', error.message, 'error');
  }
}

async function deleteFile(id) {
  const file = getFile(id);
  if (!file) return;
  const confirmed = await confirmDialog({ title: 'Delete upload?', message: `“${file.name}” will be removed from this browser. The linked note will remain.`, confirmLabel: 'Delete File', danger: true });
  if (!confirmed) return;
  await remove('files', id);
  await refreshStore('files');
  render();
  toast('Upload deleted', '', 'info');
}

let tesseractLoader;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoader) return tesseractLoader;
  tesseractLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR library loaded incorrectly.'));
    script.onerror = () => reject(new Error('Unable to load the OCR library. Check your internet connection.'));
    document.head.appendChild(script);
  });
  return tesseractLoader;
}

function openOCRModal() {
  let processed = null;
  let sourceFile = null;
  let running = false;
  openModal({
    title: 'Upload / OCR',
    subtitle: 'Capture an image, extract editable text, and save both as an Atlas note.',
    size: 'wide',
    body: `<form id="ocr-form" class="form-stack">
      <label class="file-drop-zone" id="ocr-drop-zone" for="ocr-file">
        <input id="ocr-file" type="file" accept="image/*" capture="environment">
        <span><span class="file-drop-icon">${icon('camera', 24)}</span><strong>Take a photo or choose an image</strong><span>Printed text works best. Handwriting recognition is experimental. PDF OCR is not included in Atlas 0.1.</span></span>
      </label>
      <div id="ocr-workspace" hidden>
        <div class="ocr-layout">
          <div><div class="ocr-preview"><img id="ocr-image-preview" alt="Selected image preview"></div><div class="ocr-progress" id="ocr-progress" hidden><div class="progress-track"><div class="progress-fill" id="ocr-progress-fill"></div></div><div class="progress-label" id="ocr-progress-label">Preparing OCR…</div></div></div>
          <div class="form-stack">
            <div class="field"><label for="ocr-title">Note title <span class="required">*</span></label><input id="ocr-title" name="title" required placeholder="Handwritten notes, signage, whiteboard..."></div>
            <div class="field-row"><div class="field"><label for="ocr-workstream">Workstream</label><select id="ocr-workstream" name="workstreamId">${workstreamOptions('')}</select></div><div class="field"><label for="ocr-tags">Tags</label><input id="ocr-tags" name="tags" value="OCR" placeholder="OCR, Meeting, Operations"></div></div>
            <div class="field"><label for="ocr-text">Extracted text</label><textarea id="ocr-text" class="note-body" name="text" placeholder="Run OCR, or type/correct the note manually."></textarea><div class="field-help">Always review OCR output against the original image before relying on it.</div></div>
          </div>
        </div>
        <div class="notice info" style="margin-top:14px">${icon('lock', 18)}<div><strong>Local processing</strong>The selected image is processed in your browser. The OCR code and language data are downloaded from a public CDN when you run OCR.</div></div>
      </div>
    </form>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><span class="footer-spacer"></span><button id="run-ocr-button" class="button button-secondary" type="button" disabled>${icon('sparkles', 16)} Run OCR</button><button id="save-ocr-button" class="button button-primary" type="submit" form="ocr-form" disabled>${icon('save', 16)} Save as Note</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#ocr-form');
      const input = modal.querySelector('#ocr-file');
      const dropZone = modal.querySelector('#ocr-drop-zone');
      const workspace = modal.querySelector('#ocr-workspace');
      const preview = modal.querySelector('#ocr-image-preview');
      const title = modal.querySelector('#ocr-title');
      const text = modal.querySelector('#ocr-text');
      const runButton = modal.querySelector('#run-ocr-button');
      const saveButton = modal.querySelector('#save-ocr-button');
      const progress = modal.querySelector('#ocr-progress');
      const progressFill = modal.querySelector('#ocr-progress-fill');
      const progressLabel = modal.querySelector('#ocr-progress-label');

      const acceptFile = async file => {
        if (!file || !file.type.startsWith('image/')) {
          toast('Choose an image', 'Atlas 0.1 OCR accepts image files only.', 'error');
          return;
        }
        if (file.size > 12 * 1024 * 1024) {
          toast('Image is too large', 'Choose an image under 12 MB.', 'error');
          return;
        }
        sourceFile = file;
        processed = await compressImage(file, 2000, 0.9);
        preview.src = processed.dataUrl;
        workspace.hidden = false;
        title.value ||= file.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ');
        runButton.disabled = false;
        saveButton.disabled = false;
      };

      input.addEventListener('change', () => acceptFile(input.files[0]));
      ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('is-dragging'); }));
      ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('is-dragging'); }));
      dropZone.addEventListener('drop', event => acceptFile(event.dataTransfer.files[0]));

      runButton.addEventListener('click', async () => {
        if (!processed || running) return;
        running = true;
        runButton.disabled = true;
        saveButton.disabled = true;
        progress.hidden = false;
        progressFill.style.width = '2%';
        progressLabel.textContent = 'Loading OCR engine…';
        try {
          const Tesseract = await loadTesseract();
          const worker = await Tesseract.createWorker('eng', 1, {
            logger(message) {
              const pct = Math.max(2, Math.round((message.progress || 0) * 100));
              progressFill.style.width = `${pct}%`;
              progressLabel.textContent = `${capitalize(message.status || 'Processing')} · ${pct}%`;
            }
          });
          const result = await worker.recognize(processed.dataUrl);
          await worker.terminate();
          text.value = result.data.text.trim();
          progressFill.style.width = '100%';
          progressLabel.textContent = `OCR complete · confidence ${Math.round(result.data.confidence || 0)}%`;
          toast('OCR complete', 'Review and correct the extracted text before saving.', 'success');
        } catch (error) {
          progressLabel.textContent = 'OCR could not be completed.';
          toast('OCR failed', error.message, 'error');
        } finally {
          running = false;
          runButton.disabled = false;
          saveButton.disabled = false;
        }
      });

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!processed || !sourceFile) return;
        const now = new Date().toISOString();
        const noteId = uuid();
        const note = {
          id: noteId,
          title: title.value.trim() || sourceFile.name,
          body: text.value.trim(),
          type: 'note',
          workstreamId: form.elements.workstreamId.value,
          tags: parseTags(form.elements.tags.value),
          sourceLink: '',
          shareable: true,
          createdAt: now,
          updatedAt: now
        };
        const fileRecord = {
          id: uuid(),
          name: sourceFile.name,
          type: processed.type,
          size: processed.size,
          dataUrl: processed.dataUrl,
          width: processed.width || null,
          height: processed.height || null,
          noteId,
          ocrText: note.body,
          createdAt: now
        };
        await Promise.all([put('notes', note), put('files', fileRecord)]);
        await Promise.all([refreshStore('notes'), refreshStore('files')]);
        closeModal();
        render();
        toast('OCR note saved', note.title, 'success');
      });
    }
  });
}

function renderAccomplishmentsPage() {
  const accomplishments = sortByDateDesc(state.accomplishments, 'completedAt');
  const groupedMonths = new Set(accomplishments.map(item => item.completedAt?.slice(0, 7)).filter(Boolean)).size;
  const goalsCovered = new Set(accomplishments.map(item => item.goal).filter(Boolean)).size;
  return `
    <div class="page-heading">
      <div><h2>Accomplishments</h2><p>Capture the result, impact, evidence, and goal connection while the work is still fresh.</p></div>
      <div class="page-heading-actions"><button class="button button-secondary" type="button" data-action="open-report" data-preset="fiscal">${icon('chart', 16)} View Report</button><button class="button button-primary" type="button" data-action="new-accomplishment">${icon('plus', 17)} Add Accomplishment</button></div>
    </div>
    <div class="report-metrics">
      <div class="report-stat"><strong>${accomplishments.length}</strong><span>Total recorded</span></div>
      <div class="report-stat"><strong>${accomplishments.filter(item => isDateInRange(item.completedAt, getDateRange('month').start, getDateRange('month').end)).length}</strong><span>This month</span></div>
      <div class="report-stat"><strong>${groupedMonths}</strong><span>Months represented</span></div>
      <div class="report-stat"><strong>${goalsCovered}</strong><span>Goals represented</span></div>
      <div class="report-stat"><strong>${accomplishments.filter(item => item.evidenceLink).length}</strong><span>With evidence links</span></div>
    </div>
    ${accomplishments.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Accomplishment</th><th>Workstream</th><th>Goal</th><th>Completed</th><th>Impact</th><th aria-label="Actions"></th></tr></thead><tbody>${accomplishments.map(renderAccomplishmentRow).join('')}</tbody></table></div>` : emptyState('trophy', 'No accomplishments recorded yet', 'Complete a meaningful task and choose “Add to accomplishments,” or enter one manually.', 'new-accomplishment', 'Add accomplishment')}`;
}

function renderAccomplishmentRow(item) {
  const ws = getWorkstream(item.workstreamId);
  return `<tr>
    <td><button class="task-title-button" type="button" data-action="edit-accomplishment" data-id="${item.id}">${escapeHTML(item.title)}</button><div class="table-subtitle">${escapeHTML((item.skills || []).join(', ') || 'No skills tagged')}</div></td>
    <td><span class="pill" style="background:${ws.color}1c;color:${ws.color}">${escapeHTML(ws.name)}</span></td>
    <td>${item.goal ? `<span class="pill">${escapeHTML(item.goal)}</span>` : '<span class="table-subtitle">—</span>'}</td>
    <td>${formatDate(item.completedAt)}</td>
    <td>${escapeHTML(truncate(item.impact || item.results || 'No impact statement yet.', 110))}</td>
    <td><div class="table-actions"><button class="icon-button button-icon-only" type="button" data-action="edit-accomplishment" data-id="${item.id}" aria-label="Edit accomplishment">${icon('edit', 16)}</button><button class="icon-button button-icon-only" type="button" data-action="delete-accomplishment" data-id="${item.id}" aria-label="Delete accomplishment">${icon('trash', 16)}</button></div></td>
  </tr>`;
}

function openAccomplishmentModal(item = null, defaults = {}) {
  const editing = Boolean(item);
  const data = {
    id: item?.id || uuid(),
    title: item?.title || defaults.title || '',
    impact: item?.impact || defaults.impact || '',
    results: item?.results || defaults.results || '',
    workstreamId: item?.workstreamId || defaults.workstreamId || '',
    goal: item?.goal || defaults.goal || '',
    skills: item?.skills || defaults.skills || [],
    evidenceLink: item?.evidenceLink || defaults.evidenceLink || '',
    relatedTaskId: item?.relatedTaskId || defaults.relatedTaskId || '',
    completedAt: item?.completedAt || defaults.completedAt || todayISO()
  };
  openModal({
    title: editing ? 'Edit Accomplishment' : 'Add Accomplishment',
    subtitle: 'Use an action + outcome statement, then capture why the work mattered.',
    size: 'wide',
    body: `<form id="accomplishment-form" class="form-stack">
      <div class="field"><label for="accomplishment-title">Accomplishment <span class="required">*</span></label><input id="accomplishment-title" name="title" required maxlength="220" value="${escapeAttr(data.title)}" placeholder="What did you complete, improve, coordinate, or deliver?"></div>
      <div class="field"><label for="accomplishment-impact">Impact</label><textarea id="accomplishment-impact" name="impact" placeholder="Who benefited? What became easier, clearer, faster, safer, or more reliable?">${escapeHTML(data.impact)}</textarea></div>
      <div class="field"><label for="accomplishment-results">Measurable result or evidence</label><textarea id="accomplishment-results" name="results" placeholder="Examples: six pages updated, two presentations delivered, turnaround reduced, positive feedback received...">${escapeHTML(data.results)}</textarea></div>
      <div class="field-row three">
        <div class="field"><label for="accomplishment-date">Completion date</label><input id="accomplishment-date" name="completedAt" type="date" value="${escapeAttr(data.completedAt)}"></div>
        <div class="field"><label for="accomplishment-workstream">Workstream</label><select id="accomplishment-workstream" name="workstreamId">${workstreamOptions(data.workstreamId)}</select></div>
        <div class="field"><label for="accomplishment-goal">Related goal</label><select id="accomplishment-goal" name="goal">${goalOptions(data.goal)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="accomplishment-skills">Skills or competencies</label><input id="accomplishment-skills" name="skills" value="${escapeAttr(data.skills.join(', '))}" placeholder="Communication, documentation, project coordination"><div class="field-help">Separate entries with commas.</div></div>
        <div class="field"><label for="accomplishment-evidence">Evidence link</label><input id="accomplishment-evidence" name="evidenceLink" type="url" value="${escapeAttr(data.evidenceLink)}" placeholder="Website, document, presentation, survey, or source"></div>
      </div>
      <div class="field"><label for="accomplishment-task">Related task</label><select id="accomplishment-task" name="relatedTaskId"><option value="">No linked task</option>${sortByDateDesc(state.tasks, 'updatedAt').map(task => `<option value="${task.id}" ${task.id === data.relatedTaskId ? 'selected' : ''}>${escapeHTML(task.title)}</option>`).join('')}</select></div>
    </form>`,
    footer: `${editing ? `<button class="button button-danger-soft" type="button" data-accomplishment-delete="${data.id}">${icon('trash', 16)} Delete</button>` : ''}<span class="footer-spacer"></span><button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="accomplishment-form">${icon('save', 16)} ${editing ? 'Save Changes' : 'Add Accomplishment'}</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#accomplishment-form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(form);
        const now = new Date().toISOString();
        const next = {
          ...item,
          id: data.id,
          title: formData.get('title').trim(),
          impact: formData.get('impact').trim(),
          results: formData.get('results').trim(),
          completedAt: formData.get('completedAt') || todayISO(),
          workstreamId: formData.get('workstreamId'),
          goal: formData.get('goal'),
          skills: parseTags(formData.get('skills')),
          evidenceLink: normalizeURL(formData.get('evidenceLink')),
          relatedTaskId: formData.get('relatedTaskId'),
          createdAt: item?.createdAt || now,
          updatedAt: now
        };
        if (!next.title) return;
        await put('accomplishments', next);
        if (next.relatedTaskId) {
          const task = getTask(next.relatedTaskId);
          if (task && task.accomplishmentId !== next.id) await put('tasks', { ...task, accomplishmentId: next.id, updatedAt: now });
        }
        await Promise.all([refreshStore('accomplishments'), refreshStore('tasks')]);
        closeModal();
        render();
        toast(editing ? 'Accomplishment updated' : 'Accomplishment added', next.title, 'success');
      });
      modal.querySelector('[data-accomplishment-delete]')?.addEventListener('click', async () => {
        closeModal();
        await deleteAccomplishment(data.id);
      });
    }
  });
}

async function deleteAccomplishment(id) {
  const item = getAccomplishment(id);
  if (!item) return;
  const confirmed = await confirmDialog({ title: 'Delete accomplishment?', message: `“${item.title}” will be removed from reports and the accomplishment log. The related task will remain.`, confirmLabel: 'Delete Accomplishment', danger: true });
  if (!confirmed) return;
  await remove('accomplishments', id);
  const linkedTasks = state.tasks.filter(task => task.accomplishmentId === id);
  await Promise.all(linkedTasks.map(task => put('tasks', { ...task, accomplishmentId: '', updatedAt: new Date().toISOString() })));
  await Promise.all([refreshStore('accomplishments'), refreshStore('tasks')]);
  render();
  toast('Accomplishment deleted', '', 'info');
}

function getReportData() {
  const range = getDateRange(state.reportPreset, state.reportCustomStart, state.reportCustomEnd, state.settings.weekStartsOn);
  const completedTasks = state.tasks.filter(task => task.status === 'completed' && task.completedAt && isDateInRange(task.completedAt, range.start, range.end));
  const accomplishments = state.accomplishments.filter(item => item.completedAt && isDateInRange(item.completedAt, range.start, range.end));
  const relevantTasks = state.tasks.filter(task => {
    if (task.completedAt && isDateInRange(task.completedAt, range.start, range.end)) return true;
    if (task.dueDate && isDateInRange(task.dueDate, range.start, range.end)) return true;
    return false;
  });
  const completionRate = relevantTasks.length ? Math.round((completedTasks.length / relevantTasks.length) * 100) : 0;
  const workstreamCounts = new Map();
  accomplishments.forEach(item => {
    const name = getWorkstream(item.workstreamId).name;
    workstreamCounts.set(name, (workstreamCounts.get(name) || 0) + 1);
  });
  if (!accomplishments.length) completedTasks.forEach(task => {
    const name = getWorkstream(task.workstreamId).name;
    workstreamCounts.set(name, (workstreamCounts.get(name) || 0) + 1);
  });
  const goalCounts = new Map();
  accomplishments.forEach(item => {
    const goal = item.goal || 'Not linked to a goal';
    goalCounts.set(goal, (goalCounts.get(goal) || 0) + 1);
  });
  return {
    range,
    completedTasks: sortByDateDesc(completedTasks, 'completedAt'),
    accomplishments: sortByDateDesc(accomplishments, 'completedAt'),
    relevantTasks,
    completionRate,
    openTasks: state.tasks.filter(task => task.status !== 'completed').length,
    overdueTasks: state.tasks.filter(isOverdue),
    waitingTasks: state.tasks.filter(task => task.status === 'waiting'),
    workstreamCounts: [...workstreamCounts.entries()].sort((a, b) => b[1] - a[1]),
    goalCounts: [...goalCounts.entries()].sort((a, b) => b[1] - a[1])
  };
}

function renderReportsPage() {
  const report = getReportData();
  const title = reportRangeTitle(report.range, state.reportPreset);
  return `
    <div class="page-heading">
      <div><h2>Accomplishment & Workflow Report</h2><p>Use the same data for check-ins, goal progress, quarterly summaries, and performance reviews.</p></div>
      <div class="page-heading-actions"><button class="button button-secondary" type="button" data-action="report-export" data-format="csv">${icon('download', 16)} CSV</button><button class="button button-secondary" type="button" data-action="report-export" data-format="word">${icon('file', 16)} Word</button><button class="button button-primary" type="button" data-action="report-export" data-format="print">${icon('print', 16)} Print / PDF</button></div>
    </div>
    <section class="panel report-controls">
      <div class="toolbar" style="margin:0">
        <div class="field" style="min-width:210px"><label for="report-preset">Reporting period</label><select id="report-preset" class="control" data-report-control="preset"><option value="week" ${state.reportPreset === 'week' ? 'selected' : ''}>This week</option><option value="month" ${state.reportPreset === 'month' ? 'selected' : ''}>This month</option><option value="quarter" ${state.reportPreset === 'quarter' ? 'selected' : ''}>This quarter</option><option value="year" ${state.reportPreset === 'year' ? 'selected' : ''}>Calendar year</option><option value="fiscal" ${state.reportPreset === 'fiscal' ? 'selected' : ''}>Fiscal year (Sep–Aug)</option><option value="all" ${state.reportPreset === 'all' ? 'selected' : ''}>All time</option><option value="custom" ${state.reportPreset === 'custom' ? 'selected' : ''}>Custom dates</option></select></div>
        ${state.reportPreset === 'custom' ? `<div class="field"><label for="report-start">Start</label><input id="report-start" class="control" type="date" value="${escapeAttr(state.reportCustomStart)}" data-report-control="start"></div><div class="field"><label for="report-end">End</label><input id="report-end" class="control" type="date" value="${escapeAttr(state.reportCustomEnd)}" data-report-control="end"></div>` : ''}
        <span class="toolbar-spacer"></span><div><strong>${escapeHTML(title)}</strong><div class="field-help">${formatDate(report.range.start)} – ${formatDate(report.range.end)}</div></div>
      </div>
    </section>
    <div class="report-metrics">
      <div class="report-stat"><strong>${report.accomplishments.length}</strong><span>Accomplishments</span></div>
      <div class="report-stat"><strong>${report.completedTasks.length}</strong><span>Completed tasks</span></div>
      <div class="report-stat"><strong>${report.completionRate}%</strong><span>Tracked completion rate</span></div>
      <div class="report-stat"><strong>${report.waitingTasks.length}</strong><span>Waiting on</span></div>
      <div class="report-stat"><strong>${report.overdueTasks.length}</strong><span>Currently overdue</span></div>
    </div>
    <div class="report-layout">
      <div>
        <section class="panel">
          <div class="panel-header"><div><h3>Impact Summary</h3><p>Template-generated from your Atlas records; review wording before sharing.</p></div><button class="panel-link" type="button" data-action="report-export" data-format="markdown">Download Markdown</button></div>
          <div class="panel-body"><div class="report-narrative">${escapeHTML(generateReportNarrative(report))}</div></div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Accomplishments in This Period</h3><p>${report.accomplishments.length ? 'Click an item to edit its impact or evidence.' : 'Completed tasks still appear in the metrics even when they are not logged as accomplishments.'}</p></div></div>
          <div class="panel-body flush">${renderReportAccomplishments(report)}</div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Completed Task Detail</h3></div></div>
          <div class="panel-body flush">${report.completedTasks.length ? `<div class="task-list">${report.completedTasks.slice(0, 20).map(renderTaskRow).join('')}</div>` : emptyState('check', 'No completed tasks in this period', 'Choose a different reporting period or mark work complete as you go.')}</div>
        </section>
      </div>
      <div>
        <section class="panel">
          <div class="panel-header"><div><h3>Workstream Distribution</h3><p>Based on accomplishments, or completed tasks when no accomplishments are logged.</p></div></div>
          <div class="panel-body">${renderBreakdownBars(report.workstreamCounts, 'No workstream activity in this period.')}</div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Goal Evidence</h3><p>Number of accomplishment records connected to each goal.</p></div></div>
          <div class="panel-body">${renderBreakdownBars(report.goalCounts, 'Link accomplishments to your goals to see progress here.')}</div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Workflow Diagnostics</h3><p>Signals that make weekly reviews more useful.</p></div></div>
          <div class="panel-body"><div class="diagnostic-list">${getDiagnostics().map(renderDiagnostic).join('')}</div></div>
        </section>
      </div>
    </div>`;
}

function reportRangeTitle(range, preset) {
  const labels = { week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'Calendar Year', fiscal: 'Fiscal Year', all: 'All Time', custom: 'Custom Period' };
  return labels[preset] || `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

function renderBreakdownBars(entries, emptyText) {
  if (!entries.length) return `<div class="empty-state" style="padding:22px 8px"><p>${escapeHTML(emptyText)}</p></div>`;
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return `<div class="bar-list">${entries.map(([label, count]) => `<div class="bar-row"><span title="${escapeAttr(label)}">${escapeHTML(truncate(label, 22))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.round((count / max) * 100))}%"></div></div><strong>${count}</strong></div>`).join('')}</div>`;
}

function renderReportAccomplishments(report) {
  if (!report.accomplishments.length) return emptyState('trophy', 'No accomplishment entries in this period', 'Use completed tasks as prompts, then record the impact of the work.', 'new-accomplishment', 'Add accomplishment');
  return `<div class="simple-list" style="padding:0 16px 12px">${report.accomplishments.map(item => {
    const ws = getWorkstream(item.workstreamId);
    return `<button class="simple-list-item" type="button" data-action="edit-accomplishment" data-id="${item.id}" style="width:100%;background:transparent;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer"><span class="simple-list-icon" style="background:${ws.color}1c;color:${ws.color}">${icon('trophy', 16)}</span><span><span class="simple-list-title">${escapeHTML(item.title)}</span><span class="simple-list-meta">${escapeHTML(ws.name)} · ${formatDate(item.completedAt)}${item.goal ? ` · ${escapeHTML(item.goal)}` : ''}</span></span>${icon('chevronRight', 15)}</button>`;
  }).join('')}</div>`;
}

function generateReportNarrative(report) {
  const period = reportRangeTitle(report.range, state.reportPreset).toLowerCase();
  const workstreams = report.workstreamCounts.slice(0, 3).map(([name]) => name);
  const lines = [];
  lines.push(`During ${period}, Atlas recorded ${report.accomplishments.length} accomplishment${report.accomplishments.length === 1 ? '' : 's'} and ${report.completedTasks.length} completed tracked task${report.completedTasks.length === 1 ? '' : 's'}.`);
  if (workstreams.length) lines.push(`The work primarily supported ${joinHuman(workstreams)}.`);
  if (report.accomplishments.length) {
    lines.push('');
    lines.push('Selected contributions:');
    report.accomplishments.slice(0, 6).forEach(item => {
      const detail = item.impact || item.results;
      lines.push(`• ${item.title}${detail ? ` — ${detail}` : ''}`);
    });
  } else if (report.completedTasks.length) {
    lines.push('');
    lines.push('Selected completed work:');
    report.completedTasks.slice(0, 6).forEach(task => lines.push(`• ${task.title}`));
  }
  if (report.goalCounts.length) {
    lines.push('');
    lines.push(`Goal evidence was recorded for ${joinHuman(report.goalCounts.filter(([goal]) => goal !== 'Not linked to a goal').slice(0, 3).map(([goal]) => goal)) || 'the goals represented in Atlas'}.`);
  }
  if (report.overdueTasks.length || report.waitingTasks.length) {
    lines.push('');
    lines.push(`At the time of this report, ${report.waitingTasks.length} item${report.waitingTasks.length === 1 ? ' was' : 's were'} waiting on others and ${report.overdueTasks.length} item${report.overdueTasks.length === 1 ? ' was' : 's were'} overdue.`);
  }
  return lines.join('\n');
}

function joinHuman(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean.at(-1)}`;
}

function getDiagnostics() {
  const openWithoutDate = state.tasks.filter(task => task.status !== 'completed' && !task.dueDate && !task.followUpDate).length;
  const waitingStale = state.tasks.filter(task => task.status === 'waiting' && daysBetween(task.updatedAt, new Date()) > 14).length;
  const completedUnlogged = state.tasks.filter(task => task.status === 'completed' && !task.accomplishmentId).length;
  const oldUnreviewedNotes = state.notes.filter(note => daysBetween(note.updatedAt, new Date()) > 90 && !state.tasks.some(task => task.linkedNoteId === note.id)).length;
  const diagnostics = [];
  diagnostics.push(openWithoutDate
    ? { tone: 'warning', icon: 'calendar', title: `${openWithoutDate} open item${openWithoutDate === 1 ? '' : 's'} without a date`, text: 'Add a due date or follow-up date so the work can surface at the right time.' }
    : { tone: 'good', icon: 'check', title: 'Open work has dates', text: 'Every active task has a due date or follow-up date.' });
  diagnostics.push(waitingStale
    ? { tone: 'warning', icon: 'hourglass', title: `${waitingStale} waiting item${waitingStale === 1 ? '' : 's'} may be stale`, text: 'These items have not been updated in more than 14 days.' }
    : { tone: 'good', icon: 'check', title: 'Waiting items are current', text: 'No waiting item has been untouched for more than 14 days.' });
  diagnostics.push(completedUnlogged
    ? { tone: 'info', icon: 'trophy', title: `${completedUnlogged} completed task${completedUnlogged === 1 ? '' : 's'} not logged as accomplishments`, text: 'Use the weekly review to preserve meaningful outcomes without logging every tiny task.' }
    : { tone: 'good', icon: 'trophy', title: 'Completed work is accounted for', text: 'All completed tasks are linked to accomplishment records.' });
  if (oldUnreviewedNotes) diagnostics.push({ tone: 'info', icon: 'note', title: `${oldUnreviewedNotes} older unlinked note${oldUnreviewedNotes === 1 ? '' : 's'}`, text: 'Archive, export, link, or update notes that no longer support active work.' });
  return diagnostics;
}

function reportExportHTML(report) {
  const title = `${reportRangeTitle(report.range, state.reportPreset)} Atlas Report`;
  const accomplishmentRows = report.accomplishments.length ? report.accomplishments.map(item => `<tr><td>${escapeHTML(formatDate(item.completedAt))}</td><td>${escapeHTML(item.title)}</td><td>${escapeHTML(getWorkstream(item.workstreamId).name)}</td><td>${escapeHTML(item.goal || '')}</td><td>${escapeHTML(item.impact || item.results || '')}</td></tr>`).join('') : '<tr><td colspan="5">No accomplishment records in this period.</td></tr>';
  return `<h1>${escapeHTML(title)}</h1><p class="meta">Generated ${escapeHTML(formatDateTime(new Date().toISOString()))}<br>Period: ${escapeHTML(formatDate(report.range.start))} – ${escapeHTML(formatDate(report.range.end))}</p><h2>Summary</h2><div class="pre">${escapeHTML(generateReportNarrative(report))}</div><h2>Key Metrics</h2><table><tr><th>Accomplishments</th><th>Completed Tasks</th><th>Completion Rate</th><th>Waiting On</th><th>Overdue</th></tr><tr><td>${report.accomplishments.length}</td><td>${report.completedTasks.length}</td><td>${report.completionRate}%</td><td>${report.waitingTasks.length}</td><td>${report.overdueTasks.length}</td></tr></table><h2>Accomplishments</h2><table><thead><tr><th>Date</th><th>Accomplishment</th><th>Workstream</th><th>Goal</th><th>Impact / Evidence</th></tr></thead><tbody>${accomplishmentRows}</tbody></table><h2>Completed Tasks</h2><ul>${report.completedTasks.length ? report.completedTasks.map(task => `<li>${escapeHTML(task.title)} — ${escapeHTML(getWorkstream(task.workstreamId).name)} (${escapeHTML(formatDate(task.completedAt))})</li>`).join('') : '<li>No completed tasks in this period.</li>'}</ul>`;
}

function reportExportMarkdown(report) {
  const title = `${reportRangeTitle(report.range, state.reportPreset)} Atlas Report`;
  const lines = [`# ${title}`, '', `**Period:** ${formatDate(report.range.start)} – ${formatDate(report.range.end)}`, `**Generated:** ${formatDateTime(new Date().toISOString())}`, '', '## Summary', '', generateReportNarrative(report), '', '## Metrics', '', `- Accomplishments: ${report.accomplishments.length}`, `- Completed tasks: ${report.completedTasks.length}`, `- Tracked completion rate: ${report.completionRate}%`, `- Waiting on: ${report.waitingTasks.length}`, `- Overdue: ${report.overdueTasks.length}`, '', '## Accomplishments', ''];
  if (report.accomplishments.length) report.accomplishments.forEach(item => lines.push(`- **${item.title}** (${formatDate(item.completedAt)}, ${getWorkstream(item.workstreamId).name})${item.impact ? ` — ${item.impact}` : ''}`));
  else lines.push('- No accomplishment records in this period.');
  lines.push('', '## Completed Tasks', '');
  if (report.completedTasks.length) report.completedTasks.forEach(task => lines.push(`- ${task.title} (${formatDate(task.completedAt)}, ${getWorkstream(task.workstreamId).name})`));
  else lines.push('- No completed tasks in this period.');
  return lines.join('\n');
}

function exportReport(format) {
  const report = getReportData();
  const name = `atlas-${slugify(reportRangeTitle(report.range, state.reportPreset))}-${todayISO()}`;
  if (format === 'print') printDocument('Project Atlas Report', reportExportHTML(report));
  if (format === 'word') downloadText(wordCompatibleHTML('Project Atlas Report', reportExportHTML(report)), `${name}.doc`, 'application/msword;charset=utf-8');
  if (format === 'markdown') downloadText(reportExportMarkdown(report), `${name}.md`, 'text/markdown;charset=utf-8');
  if (format === 'csv') {
    const header = ['Date', 'Accomplishment', 'Workstream', 'Goal', 'Impact', 'Measurable Result', 'Evidence Link', 'Skills'];
    const rows = report.accomplishments.map(item => [item.completedAt, item.title, getWorkstream(item.workstreamId).name, item.goal, item.impact, item.results, item.evidenceLink, (item.skills || []).join('; ')]);
    const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    downloadText(csv, `${name}.csv`, 'text/csv;charset=utf-8');
  }
}

function renderWorkstreamsPage() {
  const rows = state.settings.workstreams.map(ws => ({
    ...ws,
    open: state.tasks.filter(task => task.workstreamId === ws.id && task.status !== 'completed').length,
    notes: state.notes.filter(note => note.workstreamId === ws.id).length,
    accomplishments: state.accomplishments.filter(item => item.workstreamId === ws.id).length
  }));
  return `
    <div class="page-heading">
      <div><h2>Workstreams</h2><p>Use workstreams for the people, teams, projects, or responsibilities you regularly support.</p></div>
      <div class="page-heading-actions"><button class="button button-primary" type="button" data-action="new-workstream">${icon('plus', 17)} Add Workstream</button></div>
    </div>
    <div class="manage-list">${rows.map(ws => `<div class="manage-row"><span class="manage-color" style="background:${ws.color}"></span><div class="manage-copy"><strong>${escapeHTML(ws.name)}</strong><span>${ws.open} open tasks · ${ws.notes} notes · ${ws.accomplishments} accomplishments</span></div><div class="manage-actions"><button class="icon-button" type="button" data-action="edit-workstream" data-id="${ws.id}" aria-label="Edit ${escapeAttr(ws.name)}">${icon('edit', 16)}</button><button class="icon-button" type="button" data-action="delete-workstream" data-id="${ws.id}" aria-label="Delete ${escapeAttr(ws.name)}">${icon('trash', 16)}</button></div></div>`).join('')}</div>`;
}

function openWorkstreamModal(workstream = null) {
  const editing = Boolean(workstream);
  const data = workstream || { id: uuid(), name: '', color: WORKSTREAM_COLORS[state.settings.workstreams.length % WORKSTREAM_COLORS.length] };
  openModal({
    title: editing ? 'Edit Workstream' : 'Add Workstream',
    size: 'small',
    body: `<form id="workstream-form" class="form-stack"><div class="field"><label for="workstream-name">Name <span class="required">*</span></label><input id="workstream-name" name="name" required maxlength="60" value="${escapeAttr(data.name)}" placeholder="Person, team, project, or responsibility"></div><div class="field"><label>Color</label><input id="workstream-color" name="color" type="hidden" value="${escapeAttr(data.color)}"><div class="swatch-grid">${WORKSTREAM_COLORS.map(color => `<button class="swatch ${data.color === color ? 'is-selected' : ''}" type="button" data-color="${color}" style="background:${color}" aria-label="Select ${color}"></button>`).join('')}</div></div></form>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="workstream-form">${icon('save', 16)} Save</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#workstream-form');
      modal.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
        form.elements.color.value = button.dataset.color;
        modal.querySelectorAll('[data-color]').forEach(item => item.classList.toggle('is-selected', item === button));
      }));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = form.elements.name.value.trim();
        if (!name) return;
        const duplicate = state.settings.workstreams.some(item => item.id !== data.id && item.name.toLowerCase() === name.toLowerCase());
        if (duplicate) { toast('Workstream already exists', name, 'error'); return; }
        const next = { id: data.id, name, color: form.elements.color.value };
        const index = state.settings.workstreams.findIndex(item => item.id === data.id);
        if (index >= 0) state.settings.workstreams[index] = next;
        else state.settings.workstreams.push(next);
        await saveSettings();
        closeModal();
        render();
        toast(editing ? 'Workstream updated' : 'Workstream added', name, 'success');
      });
    }
  });
}

async function deleteWorkstream(id) {
  const ws = getWorkstream(id);
  if (!ws.id) return;
  const affected = state.tasks.filter(task => task.workstreamId === id).length + state.notes.filter(note => note.workstreamId === id).length + state.accomplishments.filter(item => item.workstreamId === id).length;
  const confirmed = await confirmDialog({ title: 'Delete workstream?', message: `“${ws.name}” will be removed. ${affected} linked record(s) will remain and become Unassigned.`, confirmLabel: 'Delete Workstream', danger: true });
  if (!confirmed) return;
  state.settings.workstreams = state.settings.workstreams.filter(item => item.id !== id);
  const now = new Date().toISOString();
  await Promise.all([
    ...state.tasks.filter(task => task.workstreamId === id).map(task => put('tasks', { ...task, workstreamId: '', updatedAt: now })),
    ...state.notes.filter(note => note.workstreamId === id).map(note => put('notes', { ...note, workstreamId: '', updatedAt: now })),
    ...state.accomplishments.filter(item => item.workstreamId === id).map(item => put('accomplishments', { ...item, workstreamId: '', updatedAt: now }))
  ]);
  await saveSettings();
  await Promise.all([refreshStore('tasks'), refreshStore('notes'), refreshStore('accomplishments')]);
  render();
  toast('Workstream deleted', '', 'info');
}

function renderTagsPage() {
  const tagCounts = new Map();
  [...state.tasks, ...state.notes].forEach(item => (item.tags || []).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  state.accomplishments.forEach(item => (item.skills || []).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  const allTags = [...new Set([...state.settings.tags, ...tagCounts.keys()])].sort((a, b) => a.localeCompare(b));
  return `
    <div class="page-heading"><div><h2>Tags</h2><p>Use tags for topics and skills that cut across workstreams.</p></div><div class="page-heading-actions"><button class="button button-primary" type="button" data-action="new-tag">${icon('plus', 17)} Add Tag</button></div></div>
    ${allTags.length ? `<div class="manage-list">${allTags.map(tag => `<div class="manage-row"><span class="simple-list-icon">${icon('tag', 16)}</span><div class="manage-copy"><strong>${escapeHTML(tag)}</strong><span>${tagCounts.get(tag) || 0} record(s)</span></div><div class="manage-actions"><button class="icon-button" type="button" data-action="delete-tag" data-tag="${escapeAttr(tag)}" aria-label="Delete ${escapeAttr(tag)}">${icon('trash', 16)}</button></div></div>`).join('')}</div>` : emptyState('tag', 'No tags yet', 'Add reusable labels for topics, skills, projects, or types of work.', 'new-tag', 'Add tag')}`;
}

function openTagModal() {
  openModal({
    title: 'Add Tag',
    size: 'small',
    body: `<form id="tag-form" class="form-stack"><div class="field"><label for="tag-name">Tag name <span class="required">*</span></label><input id="tag-name" name="name" required maxlength="50" placeholder="Example: Event Support"></div></form>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="tag-form">${icon('save', 16)} Add Tag</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#tag-form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const name = form.elements.name.value.trim();
        if (!name) return;
        if (state.settings.tags.some(tag => tag.toLowerCase() === name.toLowerCase())) { toast('Tag already exists', name, 'error'); return; }
        state.settings.tags.push(name);
        state.settings.tags.sort((a, b) => a.localeCompare(b));
        await saveSettings();
        closeModal();
        render();
        toast('Tag added', name, 'success');
      });
    }
  });
}

async function deleteTag(tag) {
  const count = [...state.tasks, ...state.notes].filter(item => (item.tags || []).includes(tag)).length + state.accomplishments.filter(item => (item.skills || []).includes(tag)).length;
  const confirmed = await confirmDialog({ title: 'Delete tag?', message: `“${tag}” will be removed from the tag list and ${count} linked record(s).`, confirmLabel: 'Delete Tag', danger: true });
  if (!confirmed) return;
  state.settings.tags = state.settings.tags.filter(item => item !== tag);
  const now = new Date().toISOString();
  await Promise.all([
    ...state.tasks.filter(item => (item.tags || []).includes(tag)).map(item => put('tasks', { ...item, tags: item.tags.filter(value => value !== tag), updatedAt: now })),
    ...state.notes.filter(item => (item.tags || []).includes(tag)).map(item => put('notes', { ...item, tags: item.tags.filter(value => value !== tag), updatedAt: now })),
    ...state.accomplishments.filter(item => (item.skills || []).includes(tag)).map(item => put('accomplishments', { ...item, skills: item.skills.filter(value => value !== tag), updatedAt: now }))
  ]);
  await saveSettings();
  await Promise.all([refreshStore('tasks'), refreshStore('notes'), refreshStore('accomplishments')]);
  render();
  toast('Tag deleted', '', 'info');
}

function renderSettingsPage() {
  const estimate = state.storageEstimate;
  const used = estimate?.usage || state.files.reduce((sum, file) => sum + (file.size || 0), 0);
  const quota = estimate?.quota || 0;
  const percentage = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return `
    <div class="page-heading"><div><h2>Settings</h2><p>Atlas 0.1 is local-first: each browser has its own private database and needs its own backup.</p></div></div>
    <div class="settings-grid">
      <section class="panel settings-section">
        <h3>Display</h3><p>Choose how Atlas looks and how your work week is organized.</p>
        <form id="profile-settings-form" class="form-stack">
          <div class="field-row"><div class="field"><label for="settings-theme">Theme</label><select id="settings-theme" name="theme"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>Follow device</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div><div class="field"><label for="settings-week">Week starts on</label><select id="settings-week" name="weekStartsOn"><option value="0" ${state.settings.weekStartsOn === 0 ? 'selected' : ''}>Sunday</option><option value="1" ${state.settings.weekStartsOn === 1 ? 'selected' : ''}>Monday</option></select></div></div>
          <button class="button button-primary" type="submit">${icon('save', 16)} Save Preferences</button>
        </form>
      </section>
      <section class="panel settings-section">
        <h3>Goals</h3><p>These appear in accomplishment records and reports. Enter one goal per line.</p>
        <form id="goal-settings-form" class="form-stack"><div class="field"><label for="settings-goals">Goals</label><textarea id="settings-goals" name="goals">${escapeHTML(state.settings.goals.join('\n'))}</textarea></div><button class="button button-primary" type="submit">${icon('save', 16)} Save Goals</button></form>
      </section>
      <section class="panel settings-section">
        <h3>Install Atlas</h3><p>Install the PWA for an app-like icon and launch experience. Availability depends on the browser.</p>
        <div class="settings-actions"><button class="button button-primary" type="button" data-action="install-app" ${state.beforeInstallPrompt ? '' : 'disabled'}>${icon('download', 16)} ${state.beforeInstallPrompt ? 'Install Atlas' : 'Install prompt not available'}</button></div>
        <div class="notice info" style="margin-top:14px">${icon('info', 18)}<div><strong>iPhone and iPad</strong>Open Atlas in Safari, use Share, then choose “Add to Home Screen.”</div></div>
      </section>
      <section class="panel settings-section">
        <h3>Local Storage</h3><p>Notes, tasks, images, and reports are saved in IndexedDB on this browser profile.</p>
        <div id="storage-summary"><strong>${formatFileSize(used)}</strong> used${quota ? ` of approximately ${formatFileSize(quota)}` : ''}<div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:${percentage}%"></div></div></div>
        <div class="notice warning" style="margin-top:14px">${icon('warning', 18)}<div><strong>No automatic device sync</strong>Phone, tablet, and computer data are separate in Atlas 0.1. Use backup and restore to move a copy.</div></div>
      </section>
      <section class="panel settings-section">
        <h3>Backup & Restore</h3><p>Export a complete JSON backup, including locally stored attachments, then keep it in an approved location.</p>
        <div class="settings-actions"><button class="button button-primary" type="button" data-action="export-backup">${icon('download', 16)} Export Backup</button><label class="button button-secondary" for="import-backup-input">${icon('upload', 16)} Import Backup<input id="import-backup-input" type="file" accept="application/json,.json" hidden></label></div>
        <div class="field-help" style="margin-top:10px">Import replaces the current Atlas database after confirmation.</div>
      </section>
      <section class="panel settings-section">
        <h3>Demo & Reset</h3><p>Load sample records to explore the interface, or remove all local Atlas data.</p>
        <div class="settings-actions"><button class="button button-secondary" type="button" data-action="load-sample">${icon('sparkles', 16)} Load Sample Data</button><button class="button button-danger-soft" type="button" data-action="clear-data">${icon('trash', 16)} Clear All Data</button></div>
      </section>
      <section class="panel settings-section" style="grid-column:1/-1">
        <h3>Privacy & Prototype Boundaries</h3><p>Version ${APP_VERSION}</p>
        <div class="notice info">${icon('lock', 18)}<div><strong>The GitHub repository contains the app—not your notes.</strong>Your live records remain in the browser database unless you export a backup. A person opening the same public GitHub Pages URL on another device receives a blank Atlas workspace.</div></div>
        <div class="notice warning" style="margin-top:10px">${icon('warning', 18)}<div><strong>Protect sensitive information.</strong>This prototype has no user authentication, centralized access control, remote wipe, automatic retention policy, or built-in cloud sync. Avoid storing regulated, highly sensitive, credential, health, financial, or other confidential information unless you have an appropriate security plan.</div></div>
      </section>
    </div>`;
}

function updateStorageUI() {
  const target = document.querySelector('#storage-summary');
  if (!target || !state.storageEstimate) return;
  const { usage = 0, quota = 0 } = state.storageEstimate;
  const percentage = quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
  target.innerHTML = `<strong>${formatFileSize(usage)}</strong> used${quota ? ` of approximately ${formatFileSize(quota)}` : ''}<div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:${percentage}%"></div></div>`;
}

function renderSearchPage() {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return emptyState('search', 'Search Atlas', 'Type in the search box to find notes, tasks, accomplishments, uploads, tags, and workstreams.');
  const includes = value => String(value || '').toLowerCase().includes(query);
  const tasks = state.tasks.filter(task => includes(task.title) || includes(task.description) || includes(task.waitingOn) || (task.tags || []).some(includes) || includes(getWorkstream(task.workstreamId).name));
  const notes = state.notes.filter(note => includes(note.title) || includes(note.body) || (note.tags || []).some(includes) || includes(getWorkstream(note.workstreamId).name));
  const accomplishments = state.accomplishments.filter(item => includes(item.title) || includes(item.impact) || includes(item.results) || includes(item.goal) || (item.skills || []).some(includes));
  const files = state.files.filter(file => includes(file.name) || includes(file.ocrText));
  const total = tasks.length + notes.length + accomplishments.length + files.length;
  return `
    <div class="page-heading"><div><h2>Search results for “${escapeHTML(state.searchQuery)}”</h2><p>${total} result${total === 1 ? '' : 's'} across Atlas.</p></div></div>
    ${total ? `<div class="search-results">${searchSection('Tasks', tasks, item => ({ id: item.id, action: 'edit-task', title: item.title, snippet: `${humanizeStatus(item.status)} · ${getWorkstream(item.workstreamId).name} · ${truncate(item.description || taskDueDisplay(item).text, 120)}` }))}${searchSection('Notes', notes, item => ({ id: item.id, action: 'view-note', title: item.title, snippet: `${capitalize(item.type)} · ${truncate(item.body, 140)}` }))}${searchSection('Accomplishments', accomplishments, item => ({ id: item.id, action: 'edit-accomplishment', title: item.title, snippet: `${formatDate(item.completedAt)} · ${truncate(item.impact || item.results, 140)}` }))}${searchSection('Uploads', files, item => ({ id: item.id, action: 'view-file', title: item.name, snippet: `${formatFileSize(item.size)} · ${truncate(item.ocrText || 'No OCR text', 140)}` }))}</div>` : emptyState('search', 'No matches found', 'Try a person, project, tag, phrase from a note, or part of a task title.')}`;
}

function searchSection(title, items, mapper) {
  if (!items.length) return '';
  return `<section class="search-section"><h3>${escapeHTML(title)} <span class="pill">${items.length}</span></h3><div class="search-hit-list">${items.slice(0, 25).map(item => {
    const hit = mapper(item);
    return `<button class="search-hit" type="button" data-action="${hit.action}" data-id="${hit.id}" style="text-align:left"><div class="search-hit-title">${escapeHTML(hit.title)}</div><div class="search-hit-snippet">${escapeHTML(hit.snippet)}</div></button>`;
  }).join('')}</div></section>`;
}

function handleViewClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id, view, filter, preset, format, metric, tab, tag } = target.dataset;
  switch (action) {
    case 'navigate': navigate(view); break;
    case 'new-task': openTaskModal(); break;
    case 'new-waiting': openTaskModal(null, { status: 'waiting' }); break;
    case 'new-note': openNoteModal(); break;
    case 'new-decision': openNoteModal(null, 'decision'); break;
    case 'new-reference': openNoteModal(null, 'reference'); break;
    case 'open-ocr': openOCRModal(); break;
    case 'new-accomplishment': openAccomplishmentModal(); break;
    case 'new-workstream': openWorkstreamModal(); break;
    case 'new-tag': openTagModal(); break;
    case 'edit-task': openTaskModal(getTask(id)); break;
    case 'delete-task': deleteTask(id); break;
    case 'toggle-task': toggleTask(id); break;
    case 'task-filter': state.taskFilter = filter; state.workstreamFilter = ''; state.taskScope = ''; render(); break;
    case 'clear-task-scope': state.taskScope = ''; state.workstreamFilter = ''; state.taskFilter = 'all'; render(); break;
    case 'note-filter': state.noteFilter = filter; render(); break;
    case 'view-note': openNoteDetail(id); break;
    case 'edit-note': openNoteModal(getNote(id)); break;
    case 'export-note-menu': openNoteExportModal(getNote(id)); break;
    case 'view-file': openFileDetail(id); break;
    case 'download-file': { const file = getFile(id); if (file) downloadFile(file); break; }
    case 'delete-file': deleteFile(id); break;
    case 'edit-accomplishment': openAccomplishmentModal(getAccomplishment(id)); break;
    case 'delete-accomplishment': deleteAccomplishment(id); break;
    case 'edit-workstream': openWorkstreamModal(state.settings.workstreams.find(item => item.id === id)); break;
    case 'delete-workstream': deleteWorkstream(id); break;
    case 'delete-tag': deleteTag(tag); break;
    case 'dashboard-tab': state.dashboardTaskTab = tab; render(); break;
    case 'metric': handleMetric(metric); break;
    case 'open-report': state.reportPreset = preset || 'fiscal'; navigate('reports'); break;
    case 'report-export': exportReport(format); break;
    case 'filter-workstream': state.workstreamFilter = id; state.taskFilter = 'all'; navigate('tasks'); break;
    case 'dismiss-onboarding': state.settings.onboardingDismissed = true; saveSettings().then(render); break;
    case 'load-sample': loadSampleData(); break;
    case 'weekly-review': openWeeklyReview(); break;
    case 'export-backup': exportBackup(); break;
    case 'clear-data': clearAtlasData(); break;
    case 'install-app': installApp(); break;
    default: break;
  }
}

function handleMetric(metric) {
  if (metric === 'waiting') return navigate('waiting');
  if (metric === 'completed') return navigate('completed');
  if (metric === 'accomplishments') return navigate('accomplishments');
  state.taskFilter = metric === 'due-today' ? 'open' : 'all';
  state.taskScope = metric === 'due-today' ? 'today' : metric === 'due-week' ? 'week' : '';
  navigate('tasks');
}

function handleViewChange(event) {
  const control = event.target.dataset.reportControl;
  if (control) {
    if (control === 'preset') state.reportPreset = event.target.value;
    if (control === 'start') state.reportCustomStart = event.target.value;
    if (control === 'end') state.reportCustomEnd = event.target.value;
    render();
    return;
  }
  if (event.target.id === 'import-backup-input' && event.target.files[0]) importBackup(event.target.files[0]);
}

async function handleViewSubmit(event) {
  if (event.target.id === 'profile-settings-form') {
    event.preventDefault();
    const form = event.target;
    state.settings.theme = form.elements.theme.value;
    state.settings.weekStartsOn = Number(form.elements.weekStartsOn.value);
    await saveSettings();
    render();
    toast('Preferences saved', '', 'success');
  }
  if (event.target.id === 'goal-settings-form') {
    event.preventDefault();
    const goals = event.target.elements.goals.value.split('\n').map(value => value.trim()).filter(Boolean);
    state.settings.goals = [...new Set(goals)];
    await saveSettings();
    render();
    toast('Goals saved', `${state.settings.goals.length} goal(s) available in accomplishment records.`, 'success');
  }
}

function openQuickCaptureModal() {
  openModal({
    title: 'Quick Capture',
    subtitle: 'Choose the kind of information you want to preserve.',
    size: 'small',
    body: `<div class="quick-modal-grid">
      ${captureOption('task', 'task', 'New Task', 'Action, due date, and follow-up')}
      ${captureOption('waiting', 'hourglass', 'Waiting On', 'Track a dependency owned by someone else')}
      ${captureOption('note', 'note', 'New Note', 'Type or paste meeting and project notes')}
      ${captureOption('decision', 'bulb', 'Decision', 'Record an outcome and its context')}
      ${captureOption('reference', 'link', 'Reference', 'Save a useful link or procedure')}
      ${captureOption('ocr', 'camera', 'Upload / OCR', 'Photograph or upload printed or handwritten notes')}
    </div>`,
    onOpen(modal) {
      modal.querySelectorAll('[data-capture]').forEach(button => button.addEventListener('click', () => {
        const type = button.dataset.capture;
        closeModal();
        if (type === 'task') openTaskModal();
        if (type === 'waiting') openTaskModal(null, { status: 'waiting' });
        if (type === 'note') openNoteModal();
        if (type === 'decision') openNoteModal(null, 'decision');
        if (type === 'reference') openNoteModal(null, 'reference');
        if (type === 'ocr') openOCRModal();
      }));
    }
  });
}

function captureOption(type, iconName, title, subtitle) {
  return `<button class="quick-modal-option" type="button" data-capture="${type}"><span class="quick-modal-option-icon">${icon(iconName, 21)}</span><span><strong>${escapeHTML(title)}</strong><span>${escapeHTML(subtitle)}</span></span></button>`;
}

function openHelpModal() {
  openModal({
    title: 'Project Atlas 0.1',
    subtitle: 'A local-first prototype for notes, tasks, accomplishments, and reports.',
    size: 'wide',
    body: `<div class="form-stack">
      <div class="notice info">${icon('info', 18)}<div><strong>Core workflow</strong>Capture a note → create linked tasks → mark work complete → preserve meaningful accomplishments → generate a report.</div></div>
      <div class="field-row">
        <section><h3>Daily use</h3><ul><li>Use Quick Capture for notes, tasks, decisions, references, and images.</li><li>Give waiting items a person and follow-up date.</li><li>Link tasks back to the note or source that created them.</li><li>Complete a weekly review so meaningful work reaches the accomplishment log.</li></ul></section>
        <section><h3>Exports</h3><ul><li>Notes export as text, Markdown, Word-compatible documents, or print/PDF.</li><li>Reports export as CSV, Markdown, Word-compatible documents, or print/PDF.</li><li>JSON backup is the only complete backup of all Atlas data and attachments.</li></ul></section>
      </div>
      <div class="field-row">
        <section><h3>Keyboard</h3><ul><li><strong>Ctrl/Cmd + K:</strong> Focus search</li><li><strong>Escape:</strong> Close a dialog</li></ul></section>
        <section><h3>Important limitation</h3><p>Atlas 0.1 does not sync automatically between devices. Each browser stores a separate local database.</p></section>
      </div>
    </div>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Close</button><button class="button button-primary" type="button" data-help-action="settings">Open Settings</button>`,
    onOpen(modal) {
      modal.querySelector('[data-help-action="settings"]').addEventListener('click', () => { closeModal(); navigate('settings'); });
    }
  });
}

function openWeeklyReview() {
  const unlogged = sortByDateDesc(state.tasks.filter(task => task.status === 'completed' && !task.accomplishmentId), 'completedAt');
  const overdue = state.tasks.filter(isOverdue);
  const waiting = state.tasks.filter(task => task.status === 'waiting');
  openModal({
    title: 'Weekly Review',
    subtitle: 'A five-minute check to keep task status and accomplishment evidence current.',
    size: 'wide',
    body: `<form id="weekly-review-form" class="form-stack">
      <div class="report-metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0"><div class="report-stat"><strong>${unlogged.length}</strong><span>Completed, not logged</span></div><div class="report-stat"><strong>${overdue.length}</strong><span>Overdue</span></div><div class="report-stat"><strong>${waiting.length}</strong><span>Waiting on</span></div></div>
      <div><h3>Choose meaningful completed work</h3><p style="color:var(--muted);font-size:12px">Do not log every routine task. Select work that shows impact, growth, problem-solving, leadership, or measurable support.</p>
      ${unlogged.length ? `<div class="manage-list">${unlogged.map(task => `<label class="manage-row" style="cursor:pointer"><input type="checkbox" name="taskIds" value="${task.id}"><span class="simple-list-icon">${icon('check', 16)}</span><div class="manage-copy"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(getWorkstream(task.workstreamId).name)} · Completed ${formatDate(task.completedAt)}</span></div></label>`).join('')}</div>` : `<div class="notice info">${icon('check', 18)}<div><strong>No unlogged completed tasks</strong>Your completed work is already accounted for, or there are no completed tasks yet.</div></div>`}</div>
      ${overdue.length ? `<div class="notice warning">${icon('warning', 18)}<div><strong>${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}</strong>Review dates, update status, or delete work that is no longer needed.</div></div>` : ''}
      ${waiting.length ? `<div class="notice info">${icon('hourglass', 18)}<div><strong>${waiting.length} waiting item${waiting.length === 1 ? '' : 's'}</strong>Confirm each one has a clear owner and follow-up date.</div></div>` : ''}
    </form>`,
    footer: `<button class="button button-secondary" type="button" data-action="modal-close">Cancel</button><button class="button button-primary" type="submit" form="weekly-review-form">${icon('check', 16)} Complete Review</button>`,
    onOpen(modal) {
      const form = modal.querySelector('#weekly-review-form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const selected = [...form.querySelectorAll('input[name="taskIds"]:checked')].map(input => input.value);
        const now = new Date().toISOString();
        for (const taskId of selected) {
          const task = getTask(taskId);
          if (!task || task.accomplishmentId) continue;
          const accomplishmentId = uuid();
          await put('accomplishments', {
            id: accomplishmentId,
            title: task.title,
            impact: taskImpactSuggestion({ ...task, workstreamName: getWorkstream(task.workstreamId).name }),
            results: '',
            workstreamId: task.workstreamId || '',
            goal: '',
            skills: task.tags || [],
            evidenceLink: task.sourceLink || '',
            relatedTaskId: task.id,
            completedAt: task.completedAt?.slice(0, 10) || todayISO(),
            createdAt: now,
            updatedAt: now
          });
          await put('tasks', { ...task, accomplishmentId, updatedAt: now });
        }
        state.settings.lastWeeklyReview = todayISO();
        await saveSettings();
        await Promise.all([refreshStore('tasks'), refreshStore('accomplishments')]);
        closeModal();
        render();
        toast('Weekly review complete', `${selected.length} accomplishment${selected.length === 1 ? '' : 's'} added.`, 'success');
      });
    }
  });
}

async function exportBackup() {
  try {
    const payload = await exportDatabase();
    downloadText(JSON.stringify(payload, null, 2), `project-atlas-backup-${todayISO()}.json`, 'application/json;charset=utf-8');
    toast('Backup exported', 'Keep the JSON file in an approved, secure location.', 'success');
  } catch (error) { toast('Backup failed', error.message, 'error'); }
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || !Array.isArray(payload.tasks) || !Array.isArray(payload.notes)) throw new Error('This does not appear to be an Atlas backup file.');
    const confirmed = await confirmDialog({ title: 'Replace Atlas data?', message: 'Importing this backup will replace all tasks, notes, uploads, accomplishments, settings, and local changes currently in this browser.', confirmLabel: 'Import Backup', danger: true });
    if (!confirmed) return;
    await importDatabase(payload, { replace: true });
    await loadAllData();
    applySettings();
    render();
    requestStorageEstimate();
    toast('Backup imported', 'Atlas has been restored from the selected file.', 'success');
  } catch (error) { toast('Import failed', error.message, 'error'); }
}

async function clearAtlasData() {
  const confirmed = await confirmDialog({ title: 'Clear all Atlas data?', message: 'This permanently deletes every local task, note, upload, accomplishment, and setting from this browser. Export a backup first if you may need the data later.', confirmLabel: 'Clear Everything', danger: true });
  if (!confirmed) return;
  await clearAll();
  state.tasks = [];
  state.notes = [];
  state.accomplishments = [];
  state.files = [];
  state.settings = structuredClone(DEFAULT_SETTINGS);
  await put('settings', state.settings);
  applySettings();
  render();
  requestStorageEstimate();
  toast('Atlas reset', 'All local data was cleared.', 'info');
}

async function loadSampleData() {
  const hasData = state.tasks.length || state.notes.length || state.accomplishments.length || state.files.length;
  if (hasData) {
    const confirmed = await confirmDialog({ title: 'Replace with sample data?', message: 'Your current Atlas records will be replaced with a small demonstration workspace. Export a backup first if needed.', confirmLabel: 'Load Sample Data', danger: true });
    if (!confirmed) return;
    await clearAll();
    state.settings = structuredClone(DEFAULT_SETTINGS);
    await put('settings', state.settings);
  }
  const now = new Date().toISOString();
  const noteProject = uuid();
  const noteTeam = uuid();
  const noteOps = uuid();
  const noteDecision = uuid();
  const tasks = [
    { id: uuid(), title: 'Finalize project status update', description: 'Review open items, confirm the latest milestones, and publish the approved update.', status: 'open', priority: 'high', dueDate: todayISO(), followUpDate: '', waitingOn: '', workstreamId: 'ws-projects', linkedNoteId: noteProject, sourceLink: '', recurringFrequency: 'none', tags: ['Documentation','Planning'], createdAt: now, updatedAt: now, completedAt: '', accomplishmentId: '' },
    { id: uuid(), title: 'Confirm quarterly meeting agenda', description: 'Confirm presenters, timing, and final agenda order.', status: 'open', priority: 'medium', dueDate: addDays(todayISO(), 2), followUpDate: '', waitingOn: '', workstreamId: 'ws-team', linkedNoteId: noteTeam, sourceLink: '', recurringFrequency: 'quarterly', tags: ['Meeting'], createdAt: now, updatedAt: now, completedAt: '', accomplishmentId: '' },
    { id: uuid(), title: 'Follow up on equipment request', description: 'Confirm requirements and next steps before drafting a recommendation.', status: 'waiting', priority: 'medium', dueDate: '', followUpDate: addDays(todayISO(), 1), waitingOn: 'Vendor contact', workstreamId: 'ws-operations', linkedNoteId: noteOps, sourceLink: '', recurringFrequency: 'none', tags: ['Follow-up','Process Improvement'], createdAt: now, updatedAt: now, completedAt: '', accomplishmentId: '' },
    { id: uuid(), title: 'Review workspace request process', description: 'Document the current process and identify opportunities to reduce follow-up.', status: 'open', priority: 'medium', dueDate: addDays(todayISO(), 5), followUpDate: '', waitingOn: '', workstreamId: 'ws-operations', linkedNoteId: noteOps, sourceLink: '', recurringFrequency: 'none', tags: ['Process Improvement'], createdAt: now, updatedAt: now, completedAt: '', accomplishmentId: '' },
    { id: uuid(), title: 'Prepare product demonstration', description: 'Outline examples, create a short practice script, and gather feedback questions.', status: 'open', priority: 'low', dueDate: addDays(todayISO(), 8), followUpDate: '', waitingOn: '', workstreamId: 'ws-development', linkedNoteId: noteTeam, sourceLink: '', recurringFrequency: 'none', tags: ['Presentation','Planning'], createdAt: now, updatedAt: now, completedAt: '', accomplishmentId: '' }
  ];
  const notes = [
    { id: noteProject, title: 'Project Status Notes', body: 'Review current milestones, verify ownership, and flag anything that needs a decision or updated due date.\n\nPotential action: create a recurring status review.', type: 'note', workstreamId: 'ws-projects', tags: ['Documentation','Planning'], sourceLink: '', shareable: true, createdAt: now, updatedAt: now },
    { id: noteTeam, title: 'Quarterly Meeting Planning', body: 'Possible agenda sections:\n- Team update\n- Product demonstration\n- Operations reminders\n\nConfirm presenters and final timing.', type: 'note', workstreamId: 'ws-team', tags: ['Meeting','Presentation'], sourceLink: '', shareable: true, createdAt: now, updatedAt: now },
    { id: noteOps, title: 'Operations Process Ideas', body: 'Workspace requests, equipment tracking, recurring maintenance, and team moves all benefit from clear ownership, status, source links, and follow-up dates.', type: 'note', workstreamId: 'ws-operations', tags: ['Process Improvement'], sourceLink: '', shareable: false, createdAt: now, updatedAt: now },
    { id: noteDecision, title: 'Decision: Atlas stays local-first', body: 'The first release will prove the notes → tasks → accomplishments → reports workflow before adding complex integrations or hosted synchronization.', type: 'decision', workstreamId: 'ws-projects', tags: ['Planning','Project Atlas'], sourceLink: '', shareable: true, createdAt: now, updatedAt: now },
    { id: uuid(), title: 'Reference Library', body: 'Save links to frequently used procedures, templates, forms, and reference pages here.', type: 'reference', workstreamId: '', tags: ['Reference'], sourceLink: '', shareable: true, createdAt: now, updatedAt: now }
  ];
  const accomplishments = [
    { id: uuid(), title: 'Published project status update', impact: 'Improved visibility into active work and made current information easier for collaborators to locate.', results: 'Milestones and ownership were reviewed and updated.', workstreamId: 'ws-projects', goal: 'Operational Excellence', skills: ['Documentation','Planning'], evidenceLink: '', relatedTaskId: '', completedAt: addDays(todayISO(), -3), createdAt: now, updatedAt: now },
    { id: uuid(), title: 'Coordinated presentation logistics', impact: 'Supported an organized meeting by confirming materials, presenters, and timing.', results: 'Agenda and presentation materials finalized on schedule.', workstreamId: 'ws-team', goal: 'Leadership & Communication', skills: ['Communication','Meeting'], evidenceLink: '', relatedTaskId: '', completedAt: addDays(todayISO(), -7), createdAt: now, updatedAt: now },
    { id: uuid(), title: 'Revised onboarding checklist', impact: 'Improved consistency for new team members and reduced reliance on informal reminders.', results: 'Checklist reorganized and reviewed with the team.', workstreamId: 'ws-team', goal: 'Leadership & Communication', skills: ['Onboarding','Process Improvement'], evidenceLink: '', relatedTaskId: '', completedAt: addDays(todayISO(), -12), createdAt: now, updatedAt: now },
    { id: uuid(), title: 'Resolved three workspace requests', impact: 'Helped requests move to completion while keeping ownership and follow-up visible.', results: 'Three requests completed and documented.', workstreamId: 'ws-operations', goal: 'Operational Excellence', skills: ['Operations','Follow-up'], evidenceLink: '', relatedTaskId: '', completedAt: addDays(todayISO(), -16), createdAt: now, updatedAt: now }
  ];
  await Promise.all([putMany('tasks', tasks), putMany('notes', notes), putMany('accomplishments', accomplishments)]);
  state.settings.onboardingDismissed = true;
  await put('settings', state.settings);
  await loadAllData();
  applySettings();
  navigate('dashboard');
  toast('Sample data loaded', 'Explore the workflow, then reset Atlas before entering your own information.', 'success');
}

async function refreshStore(storeName) {
  state[storeName] = await getAll(storeName);
  requestStorageEstimate();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker registration failed:', error)));
}

init().catch(error => {
  console.error(error);
  document.querySelector('#view-container').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('warning', 25)}</div><h3>Atlas could not start</h3><p>${escapeHTML(error.message || 'An unexpected error occurred.')}</p><button class="button button-secondary" type="button" onclick="location.reload()">Reload</button></div>`;
});
