/* ═══════════════════════════════════════════
   Skool CRM — Community Management System
   Complete SPA with Supabase Auth + REST API
   OWASP-konform · 12.03.2026
   ═══════════════════════════════════════════ */

const SUPABASE_URL = 'https://fygynutbtlyuccfkrkzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Z3ludXRidGx5dWNjZmtya3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTg5MzQsImV4cCI6MjA4NDQzNDkzNH0.Fj03XD8YEPGK6_Wp6wmOxy6pIUr6oBbm2D1o9egZCqU';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── State ───────────────────────────────
let currentUser = null;   // { id, username, display_name, email, role, ... }
let allUsers = [];
let allMembers = [];
let currentMemberId = null;
let audioFileData = null;
let kanbanFilterUser = null;
let sortCol = 'name';
let sortDir = 'asc';
let unreadCount = 0;
let pollTimer = null;

// ─── Toast ───────────────────────────────
function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ─── Utilities ───────────────────────────
function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function avatarColor(name) {
    const colors = ['#3b82f6','#10b981','#8b5cf6','#d97706','#ef4444','#ec4899','#06b6d4','#f97316'];
    let hash = 0;
    for (let i = 0; i < (name||'').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function formatDate(d) {
    if (!d) return '—';
    try {
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return d; }
}

function formatDateTime(d) {
    if (!d) return '—';
    try {
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
}

function relativeTime(d) {
    if (!d) return '';
    try {
        const dt = new Date(d);
        const now = new Date();
        const diff = (now - dt) / 1000;
        if (diff < 60) return 'Gerade eben';
        if (diff < 3600) return `vor ${Math.floor(diff/60)} Min.`;
        if (diff < 86400) return `vor ${Math.floor(diff/3600)} Std.`;
        if (diff < 604800) return `vor ${Math.floor(diff/86400)} Tagen`;
        return formatDate(d);
    } catch { return d; }
}

function membershipLabel(type) {
    const labels = { free: 'Free', monthly_97: 'Monatlich (97€)', yearly_697: 'Jährlich (697€)' };
    return labels[type] || type || '—';
}

function statusBadge(status) {
    const map = {
        active: { cls: 'badge-green', text: 'Aktiv' },
        at_risk: { cls: 'badge-yellow', text: 'Gefährdet' },
        inactive: { cls: 'badge-red', text: 'Inaktiv' }
    };
    const s = map[status] || { cls: 'badge-gray', text: status || '—' };
    return `<span class="badge ${s.cls}">${s.text}</span>`;
}

function membershipBadge(type) {
    const map = {
        free: 'badge-gray',
        monthly_97: 'badge-blue',
        yearly_697: 'badge-purple'
    };
    return `<span class="badge ${map[type] || 'badge-gray'}">${membershipLabel(type)}</span>`;
}

function levelLabel(level) {
    const labels = { beginner: 'Anfänger', intermediate: 'Fortgeschritten', advanced: 'Experte' };
    return labels[level] || level || '—';
}

function funnelLabel(stage) {
    const labels = { free_community: 'Free Community', recently_cancelled: 'Kürzlich Gekündigt', long_cancelled: 'Länger Gekündigt' };
    return labels[stage] || stage || '—';
}

function entryTypeLabel(t) {
    const labels = {
        note: 'Aktennotiz', call: 'Telefonnotiz', meeting: 'Besprechung',
        message_in: 'Eingehend', message_out: 'Ausgehend',
        audio: 'Audio-Notiz', system: 'System'
    };
    return labels[t] || t;
}

function entryTypeBadgeColor(t) {
    const map = {
        note: 'badge-blue', call: 'badge-green', meeting: 'badge-purple',
        message_in: '', message_out: '',
        audio: 'badge-purple', system: 'badge-gray'
    };
    const cls = map[t] || 'badge-gray';
    return cls;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Auth ────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showLogin(); return; }
    try {
        const { data, error } = await sb.from('crm_users').select('*').eq('auth_user_id', session.user.id).single();
        if (error || !data) { showLogin(); return; }
        currentUser = data;
        showApp();
    } catch { showLogin(); }
}

function showLogin() {
    $('login-screen').classList.remove('hidden');
    $('app-wrapper').classList.add('hidden');
    currentUser = null;
    if (pollTimer) clearInterval(pollTimer);
}

function showApp() {
    $('login-screen').classList.add('hidden');
    $('app-wrapper').classList.remove('hidden');
    updateSidebarUser();
    loadUsers();
    startPolling();
    route();
}

function updateSidebarUser() {
    if (!currentUser) return;
    const color = currentUser.avatar_color || '#3b82f6';
    $('sidebar-avatar').textContent = initials(currentUser.display_name);
    $('sidebar-avatar').style.background = color;
    $('sidebar-username').textContent = currentUser.display_name;
    $('sidebar-role').textContent = currentUser.role === 'admin' ? 'Administrator' : 'Mitarbeiter';
}

async function loadUsers() {
    try {
        const { data, error } = await sb.from('crm_users').select('*').eq('is_active', true).order('display_name');
        if (error) throw error;
        allUsers = data || [];
    } catch { allUsers = []; }
}

function startPolling() {
    pollUnread();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollUnread, 30000);
}

async function pollUnread() {
    if (!currentUser) return;
    try {
        const { count, error } = await sb.from('team_messages').select('*', { count: 'exact', head: true }).eq('to_user_id', currentUser.id).eq('is_read', false);
        if (error) throw error;
        unreadCount = count || 0;
        const badge = $('team-badge');
        const mDot = $('mobile-notif-dot');
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
            if (mDot) mDot.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            if (mDot) mDot.classList.add('hidden');
        }
    } catch { /* silent */ }
}

// ─── Router ──────────────────────────────
function route() {
    const hash = location.hash.replace('#', '') || 'dashboard';
    const parts = hash.split('/');
    const page = parts[0];

    // Hide all pages
    qsa('.page').forEach(p => p.classList.add('hidden'));

    // Update nav
    qsa('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = qs(`.nav-item[data-page="${page === 'member' ? 'members' : page}"]`);
    if (activeNav) activeNav.classList.add('active');

    switch (page) {
        case 'dashboard': showPage('dashboard'); loadDashboard(); break;
        case 'members': showPage('members'); loadMembers(); break;
        case 'member': showPage('member-detail'); loadMemberDetail(parts[1]); break;
        case 'kanban': showPage('kanban'); loadKanban(); break;
        case 'team': showPage('team'); loadTeamPage(); break;
        case 'import': showPage('import'); break;
        case 'settings': showPage('settings'); loadSettings(); break;
        default: showPage('dashboard'); loadDashboard();
    }
}

function showPage(name) {
    const page = $(`page-${name}`);
    if (page) page.classList.remove('hidden');
}

// ─── Dashboard ───────────────────────────
async function loadDashboard() {
    try {
        const { data: members, error } = await sb.from('members').select('*');
        if (error) throw error;
        const all = members || [];
        const paying = all.filter(m => m.membership_type && m.membership_type !== 'free');
        const atRisk = all.filter(m => m.activity_status === 'at_risk');
        const revenue = all.reduce((sum, m) => {
            if (m.membership_type === 'monthly_97') return sum + 97;
            if (m.membership_type === 'yearly_697') return sum + Math.round(697/12);
            return sum;
        }, 0);

        $('stat-total').textContent = all.length;
        $('stat-paying').textContent = paying.length;
        $('stat-revenue').textContent = `${revenue.toLocaleString('de-DE')} €`;
        $('stat-atrisk').textContent = atRisk.length;

        // Funnel overview
        const byFunnel = { free_community: 0, recently_cancelled: 0, long_cancelled: 0 };
        all.forEach(m => { if (m.funnel_stage && byFunnel[m.funnel_stage] !== undefined) byFunnel[m.funnel_stage]++; });
        const funnelEl = $('funnel-overview');
        funnelEl.innerHTML = `
            <div class="funnel-card" style="background: var(--accent-blue-dim)">
                <span class="funnel-count" style="color: var(--accent-blue)">${byFunnel.free_community}</span>
                <span class="funnel-label">Free Community</span>
            </div>
            <div class="funnel-card" style="background: var(--accent-yellow-dim)">
                <span class="funnel-count" style="color: var(--accent-yellow)">${byFunnel.recently_cancelled}</span>
                <span class="funnel-label">Kürzlich Gekündigt</span>
            </div>
            <div class="funnel-card" style="background: var(--accent-red-dim)">
                <span class="funnel-count" style="color: var(--accent-red)">${byFunnel.long_cancelled}</span>
                <span class="funnel-label">Länger Gekündigt</span>
            </div>
        `;
        await loadMyTasks();
        await loadActivityFeed();

        // Charts
        const byCity = {}; all.forEach(m => { if (m.city) byCity[m.city] = (byCity[m.city]||0)+1; });
        const byMembership = {}; all.forEach(m => { const k = m.membership_type||'free'; byMembership[membershipLabel(k)] = (byMembership[membershipLabel(k)]||0)+1; });
        const byLevel = {}; all.forEach(m => { const k = m.progress_level||'beginner'; byLevel[levelLabel(k)] = (byLevel[levelLabel(k)]||0)+1; });
        renderBarChart($('chart-city'), byCity, 'var(--accent-blue)');
        renderBarChart($('chart-membership'), byMembership, 'var(--accent-purple)');
        renderBarChart($('chart-level'), byLevel, 'var(--accent-green)');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function mapObj(obj, fn) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        result[fn(k)] = v;
    }
    return result;
}

async function loadMyTasks() {
    const tasksEl = $('my-tasks');
    try {
        const { data, error } = await sb.from('members').select('id, name, activity_status, membership_type, funnel_stage').eq('assigned_to', currentUser.id).in('activity_status', ['at_risk', 'inactive']).order('name').limit(8);
        if (error) throw error;
        if (!data || data.length === 0) {
            tasksEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine offenen Aufgaben</p>';
            return;
        }
        tasksEl.innerHTML = data.map(m => `
            <div class="task-item" onclick="location.hash='member/${m.id}'">
                <div class="task-avatar" style="background:${avatarColor(m.name)}">${initials(m.name)}</div>
                <div class="task-info">
                    <div class="task-name">${escapeHtml(m.name)}</div>
                    <div class="task-meta">${membershipLabel(m.membership_type)} · ${funnelLabel(m.funnel_stage)}</div>
                </div>
                ${statusBadge(m.activity_status)}
            </div>
        `).join('');
    } catch { tasksEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Fehler beim Laden</p>'; }
}

async function loadActivityFeed() {
    const feedEl = $('activity-feed');
    try {
        const { data: entries, error } = await sb.from('timeline_entries').select('*, member:members(name)').order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        if (!entries || entries.length === 0) {
            feedEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine Aktivitäten</p>';
            return;
        }
        feedEl.innerHTML = entries.map(e => {
            const dotColors = {
                note: 'var(--accent-blue)', call: 'var(--accent-green)', meeting: 'var(--accent-purple)',
                message_in: 'var(--accent-cyan)', message_out: 'var(--accent-gold)',
                system: 'var(--text-muted)', audio: 'var(--accent-pink)'
            };
            const dotColor = dotColors[e.entry_type] || 'var(--text-muted)';
            const memberLink = e.member_id ? `<a href="#member/${e.member_id}" style="color:var(--accent-blue);text-decoration:none">${escapeHtml(e.member?.name || '')}</a>` : '';
            return `
                <div class="activity-item">
                    <div class="activity-dot" style="background:${dotColor}"></div>
                    <div class="activity-info">
                        <div class="activity-text">
                            <strong>${escapeHtml(e.user_name || 'System')}</strong>
                            — ${entryTypeLabel(e.entry_type)}
                            ${memberLink ? ' bei ' + memberLink : ''}
                        </div>
                        <div class="activity-meta">${relativeTime(e.created_at)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch { feedEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Fehler beim Laden</p>'; }
}

function renderBarChart(container, data, color) {
    if (!container) return;
    const entries = Object.entries(data);
    if (entries.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:0.85rem">Keine Daten</p>';
        return;
    }
    const max = Math.max(...entries.map(e => e[1]), 1);
    container.innerHTML = entries.map(([label, val]) => `
        <div class="chart-bar-group">
            <div class="chart-bar-label"><span>${escapeHtml(label)}</span><span>${val}</span></div>
            <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(val/max)*100}%;background:${color}"></div></div>
        </div>
    `).join('');
}

// ─── Members ─────────────────────────────
async function loadMembers() {
    try {
        const search = $('member-search').value.trim();
        const status = $('filter-status').value;
        const membership = $('filter-membership').value;
        const level = $('filter-level').value;

        let query = sb.from('members').select('*');
        if (search) query = query.or(`name.ilike.%${search}%,skool_username.ilike.%${search}%`);
        if (status) query = query.eq('activity_status', status);
        if (membership) query = query.eq('membership_type', membership);
        if (level) query = query.eq('progress_level', level);
        query = query.order(sortCol, { ascending: sortDir === 'asc' });

        const { data, error } = await query;
        if (error) throw error;
        allMembers = data || [];
        renderMembersTable(allMembers);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderMembersTable(members) {
    const tbody = $('members-tbody');
    const empty = $('members-empty');
    const tableWrapper = qs('.table-wrapper');

    if (members.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        if (tableWrapper) tableWrapper.style.display = 'none';
        return;
    }
    empty.classList.add('hidden');
    if (tableWrapper) tableWrapper.style.display = '';

    tbody.innerHTML = members.map(m => `
        <tr data-id="${m.id}">
            <td>
                <div class="member-cell">
                    <div class="member-avatar-sm" style="background:${avatarColor(m.name)}">${initials(m.name)}</div>
                    <div class="member-cell-info">
                        <span class="member-cell-name">${escapeHtml(m.name)}</span>
                        <span class="member-cell-username">${escapeHtml(m.skool_username || '')}</span>
                    </div>
                </div>
            </td>
            <td>${membershipBadge(m.membership_type)}</td>
            <td>${statusBadge(m.activity_status)}</td>
            <td><span class="badge badge-gray">${levelLabel(m.progress_level)}</span></td>
            <td>${escapeHtml(m.city || '—')}</td>
            <td>${m.funnel_stage ? `<span class="badge badge-blue">${funnelLabel(m.funnel_stage)}</span>` : '—'}</td>
            <td>${escapeHtml(m.assigned_name || '—')}</td>
            <td>${formatDate(m.last_active)}</td>
        </tr>
    `).join('');
}

// ─── Member Detail ───────────────────────
async function loadMemberDetail(id) {
    if (!id) return;
    currentMemberId = parseInt(id);
    try {
        const { data: member, error } = await sb.from('members').select('*').eq('id', id).single();
        if (error) throw error;
        // Load posts separately
        const { data: posts } = await sb.from('posts').select('*').eq('member_id', id).order('posted_at', { ascending: false });
        member.posts = posts || [];
        // Load labels
        const { data: labels } = await sb.from('member_labels').select('label').eq('member_id', id);
        member.custom_labels = (labels || []).map(l => l.label);
        renderMemberDetail(member);
        loadTimeline(id);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderMemberDetail(m) {
    $('breadcrumb-name').textContent = m.name;
    $('detail-avatar').textContent = initials(m.name);
    $('detail-avatar').style.background = avatarColor(m.name);
    $('detail-name').textContent = m.name;
    $('detail-username').textContent = m.skool_username || '';

    // Badges
    $('detail-badges').innerHTML = `
        ${membershipBadge(m.membership_type)}
        ${statusBadge(m.activity_status)}
        ${m.is_premium ? '<span class="badge badge-purple">Premium</span>' : ''}
        ${m.is_admin ? '<span class="badge badge-gold">Admin</span>' : ''}
    `;

    // Build funnel/assigned selectors
    const funnelOptions = ['', 'free_community', 'recently_cancelled', 'long_cancelled']
        .map(v => `<option value="${v}" ${m.funnel_stage === v ? 'selected' : ''}>${v ? funnelLabel(v) : '— Kein Funnel —'}</option>`).join('');
    const assignedOptions = ['<option value="">— Niemand —</option>']
        .concat(allUsers.map(u => `<option value="${u.id}" ${m.assigned_to == u.id ? 'selected' : ''}>${escapeHtml(u.display_name)}</option>`)).join('');

    // Fields
    $('detail-fields').innerHTML = `
        <div class="field-row"><span class="field-label">Mitgliedschaft</span><span class="field-value">${membershipLabel(m.membership_type)}</span></div>
        <div class="field-row"><span class="field-label">Status</span><span class="field-value">${m.membership_status || '—'}</span></div>
        <div class="field-row"><span class="field-label">Aktivität</span><span class="field-value">${m.activity_status || '—'}</span></div>
        <div class="field-row"><span class="field-label">Level</span><span class="field-value">${levelLabel(m.progress_level)}</span></div>
        <div class="field-row"><span class="field-label">Stadt</span><span class="field-value">${escapeHtml(m.city || '—')}</span></div>
        <div class="field-row"><span class="field-label">Land</span><span class="field-value">${escapeHtml(m.country || '—')}</span></div>
        <div class="field-row"><span class="field-label">Beitritt</span><span class="field-value">${formatDate(m.join_date)}</span></div>
        <div class="field-row"><span class="field-label">Verlängerung</span><span class="field-value">${formatDate(m.renewal_date)}</span></div>
        <div class="field-row"><span class="field-label">Letzte Aktivität</span><span class="field-value">${formatDate(m.last_active)}</span></div>
        <div class="field-row"><span class="field-label">Quelle</span><span class="field-value">${escapeHtml(m.join_source || '—')}</span></div>
        <div class="field-row">
            <span class="field-label">Funnel-Stufe</span>
            <span class="field-value"><select onchange="updateMemberField(${m.id},'funnel_stage',this.value)">${funnelOptions}</select></span>
        </div>
        <div class="field-row">
            <span class="field-label">Zuständig</span>
            <span class="field-value"><select onchange="updateMemberField(${m.id},'assigned_to',this.value)">${assignedOptions}</select></span>
        </div>
    `;

    // Labels
    if (m.custom_labels && m.custom_labels.length > 0) {
        const labelsHtml = m.custom_labels.map(l => `<span class="badge badge-blue">${escapeHtml(l)}</span>`).join(' ');
        $('detail-fields').innerHTML += `<div class="field-row"><span class="field-label">Labels</span><span class="field-value">${labelsHtml}</span></div>`;
    }

    // Posts
    renderPosts(m.posts || []);

    // Notes
    $('notes-content').innerHTML = m.notes
        ? `<div class="notes-area">${escapeHtml(m.notes)}</div>`
        : '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine Notizen vorhanden</p>';

    // Reset tab to timeline
    qsa('.panel-tab').forEach(t => t.classList.remove('active'));
    qsa('.panel-content').forEach(c => c.classList.remove('active'));
    qs('.panel-tab[data-tab="timeline"]').classList.add('active');
    $('tab-timeline').classList.add('active');
}

async function updateMemberField(memberId, field, value) {
    try {
        const updates = {};
        updates[field] = value || null;
        const { error } = await sb.from('members').update(updates).eq('id', memberId);
        if (error) throw error;
        toast('Aktualisiert', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderPosts(posts) {
    const el = $('posts-feed');
    if (posts.length === 0) {
        el.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine Beiträge</p>';
        return;
    }
    el.innerHTML = posts.map(p => `
        <div class="post-card">
            <h4>${escapeHtml(p.post_title || 'Ohne Titel')}</h4>
            <p>${escapeHtml(p.post_content || '')}</p>
            <div class="post-meta">
                <span>${formatDate(p.posted_at)}</span>
                <span>👍 ${p.likes || 0}</span>
                <span>💬 ${p.comments || 0}</span>
                ${p.post_url ? `<a href="${escapeHtml(p.post_url)}" target="_blank" rel="noopener">Link</a>` : ''}
            </div>
        </div>
    `).join('');
}

// ─── Timeline ────────────────────────────
async function loadTimeline(memberId) {
    const feed = $('timeline-feed');
    try {
        const { data: entries, error } = await sb.from('timeline_entries').select('*').eq('member_id', memberId).order('created_at', { ascending: true });
        if (error) throw error;
        if (!entries || entries.length === 0) {
            feed.innerHTML = '<div class="empty-state"><p>Noch keine Einträge im Verlauf</p></div>';
            return;
        }
        feed.innerHTML = entries.map(renderTimelineEntry).join('');
        feed.scrollTop = feed.scrollHeight;
    } catch (err) {
        feed.innerHTML = `<p class="text-muted" style="padding:12px">${escapeHtml(err.message)}</p>`;
    }
}

function renderTimelineEntry(e) {
    const iconMap = {
        note: '📝', call: '📞', meeting: '🤝', message_in: '📥',
        message_out: '📤', audio: '🎤', system: '⚙️'
    };
    const icon = iconMap[e.entry_type] || '📋';
    const badgeCls = entryTypeBadgeColor(e.entry_type);

    let audioHtml = '';
    if (e.audio_url && e.audio_url.startsWith('data:audio')) {
        audioHtml = `<div class="timeline-audio"><audio controls src="${e.audio_url}" preload="none"></audio></div>`;
    }

    let channelHtml = '';
    if (e.channel) {
        channelHtml = `<div class="timeline-channel">Kanal: ${escapeHtml(e.channel)}</div>`;
    }

    return `
        <div class="timeline-entry">
            <div class="timeline-icon timeline-icon-${e.entry_type}">${icon}</div>
            <div class="timeline-body">
                <div class="timeline-header">
                    <span class="timeline-author">${escapeHtml(e.user_name || 'System')}</span>
                    <span class="badge ${badgeCls} timeline-type-badge">${entryTypeLabel(e.entry_type)}</span>
                    <span class="timeline-time">${relativeTime(e.created_at)}</span>
                </div>
                <div class="timeline-text">${escapeHtml(e.content || '')}</div>
                ${audioHtml}
                ${channelHtml}
            </div>
        </div>
    `;
}

async function addTimelineEntry() {
    const content = $('timeline-content').value.trim();
    const entryType = $('timeline-type').value;
    const channel = $('timeline-channel').value;

    if (!content && !audioFileData) {
        toast('Bitte Inhalt eingeben', 'error');
        return;
    }

    try {
        const row = {
            member_id: currentMemberId,
            entry_type: audioFileData ? 'audio' : entryType,
            content: content,
            channel: channel || null,
            audio_url: audioFileData || null,
            user_id: currentUser.id,
            user_name: currentUser.display_name
        };
        const { error } = await sb.from('timeline_entries').insert(row);
        if (error) throw error;
        $('timeline-content').value = '';
        audioFileData = null;
        $('audio-filename').textContent = '';
        $('timeline-audio').value = '';
        loadTimeline(currentMemberId);
        toast('Eintrag gespeichert', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Kanban ──────────────────────────────
async function loadKanban() {
    try {
        // Load filter chips
        if (allUsers.length === 0) await loadUsers();
        const chipsEl = $('kanban-filter-chips');
        chipsEl.innerHTML = `<div class="filter-chip ${!kanbanFilterUser ? 'active' : ''}" data-user="">Alle</div>` +
            allUsers.map(u => `<div class="filter-chip ${kanbanFilterUser == u.id ? 'active' : ''}" data-user="${u.id}">${escapeHtml(u.display_name)}</div>`).join('');

        chipsEl.querySelectorAll('.filter-chip').forEach(chip => {
            chip.onclick = () => {
                kanbanFilterUser = chip.dataset.user || null;
                loadKanban();
            };
        });

        let query = sb.from('members').select('*').not('funnel_stage', 'is', null);
        if (kanbanFilterUser) query = query.eq('assigned_to', kanbanFilterUser);
        const { data: members, error } = await query;
        if (error) throw error;
        const all = members || [];
        const grouped = { free_community: [], recently_cancelled: [], long_cancelled: [] };
        all.forEach(m => { if (grouped[m.funnel_stage]) grouped[m.funnel_stage].push(m); });

        renderKanbanColumn('kanban-free', grouped.free_community, 'kanban-count-free');
        renderKanbanColumn('kanban-recent', grouped.recently_cancelled, 'kanban-count-recent');
        renderKanbanColumn('kanban-long', grouped.long_cancelled, 'kanban-count-long');

        setupDragAndDrop();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderKanbanColumn(containerId, members, countId) {
    const container = $(containerId);
    $(countId).textContent = members.length;

    if (members.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:24px"><p style="font-size:0.8rem">Keine Mitglieder</p></div>';
        return;
    }

    container.innerHTML = members.map(m => `
        <div class="kanban-card" draggable="true" data-member-id="${m.id}">
            <div class="kanban-card-header">
                <div class="kanban-card-avatar" style="background:${avatarColor(m.name)}">${initials(m.name)}</div>
                <div class="kanban-card-name">${escapeHtml(m.name)}</div>
            </div>
            <div class="kanban-card-details">
                ${membershipBadge(m.membership_type)}
                ${statusBadge(m.activity_status)}
            </div>
            <div class="kanban-card-footer">
                <span>${escapeHtml(m.assigned_name || 'Nicht zugewiesen')}</span>
                <span>${relativeTime(m.last_active)}</span>
            </div>
        </div>
    `).join('');
}

function setupDragAndDrop() {
    const cards = qsa('.kanban-card');
    const columns = qsa('.kanban-cards');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.memberId);
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            columns.forEach(col => col.classList.remove('drag-over'));
        });
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.kanban-card-avatar')) {
                location.hash = `member/${card.dataset.memberId}`;
            }
        });
    });

    columns.forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            col.classList.add('drag-over');
        });
        col.addEventListener('dragleave', () => {
            col.classList.remove('drag-over');
        });
        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');
            const memberId = e.dataTransfer.getData('text/plain');
            const newStage = col.dataset.stage;
            if (!memberId || !newStage) return;
            try {
                await sb.from('members').update({ funnel_stage: newStage }).eq('id', memberId);
                toast('Mitglied verschoben', 'success');
                loadKanban();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    });
}

// ─── Team Messages ───────────────────────
async function loadTeamPage() {
    try {
        // Populate selects
        if (allUsers.length === 0) await loadUsers();
        const toSelect = $('team-msg-to');
        toSelect.innerHTML = allUsers
            .filter(u => u.id !== currentUser.id)
            .map(u => `<option value="${u.id}">${escapeHtml(u.display_name)}</option>`).join('');

        // Member context
        if (allMembers.length === 0) {
            try {
                const { data } = await sb.from('members').select('id, name').order('name');
                allMembers = data || [];
            } catch { allMembers = []; }
        }
        const memberSelect = $('team-msg-member');
        memberSelect.innerHTML = '<option value="">— Kein Mitglied —</option>' +
            allMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');

        await loadTeamMessages();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function loadTeamMessages() {
    const listEl = $('team-messages-list');
    try {
        const msgs = await api('team_messages');
        if (msgs.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 120 120" width="60" height="60" fill="none">
                        <rect x="20" y="30" width="80" height="55" rx="8" stroke="var(--text-muted)" stroke-width="2"/>
                        <path d="M20 45L60 65L100 45" stroke="var(--text-muted)" stroke-width="2" fill="none"/>
                    </svg>
                    <p>Keine Nachrichten</p>
                </div>`;
            return;
        }
        listEl.innerHTML = msgs.map(m => {
            const isMine = m.from_user_id === currentUser.id;
            const isUnread = !isMine && !m.is_read;
            const dir = isMine ? `→ ${escapeHtml(m.to_name)}` : `← von`;
            return `
                <div class="team-msg-card ${isUnread ? 'unread' : ''}" data-msg-id="${m.id}">
                    <div class="team-msg-header">
                        <span class="team-msg-from">${escapeHtml(m.from_name)}</span>
                        <span class="team-msg-dir">${dir}</span>
                        <span class="team-msg-time">${relativeTime(m.created_at)}</span>
                    </div>
                    <div class="team-msg-body">${escapeHtml(m.content)}</div>
                    ${m.member_name ? `<div class="team-msg-context">Bezug: <a href="#member/${m.member_id}">${escapeHtml(m.member_name)}</a></div>` : ''}
                    ${isUnread ? `<div class="team-msg-actions"><button class="btn btn-secondary btn-sm" onclick="markTeamRead(${m.id})">Als gelesen markieren</button></div>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        listEl.innerHTML = `<p class="text-muted" style="padding:12px">${escapeHtml(err.message)}</p>`;
    }
}

async function sendTeamMessage() {
    const toId = $('team-msg-to').value;
    const content = $('team-msg-content').value.trim();
    const memberId = $('team-msg-member').value || null;

    if (!toId || !content) {
        toast('Empfänger und Nachricht erforderlich', 'error');
        return;
    }

    try {
        const { error } = await sb.from('team_messages').insert({
            from_user_id: currentUser.id,
            to_user_id: parseInt(toId),
            content,
            member_id: memberId ? parseInt(memberId) : null,
            is_read: false
        });
        if (error) throw error;
        $('team-msg-content').value = '';
        toast('Nachricht gesendet', 'success');
        loadTeamMessages();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function markTeamRead(msgId) {
    try {
        const { error } = await sb.from('team_messages').update({ is_read: true }).eq('id', msgId);
        if (error) throw error;
        loadTeamMessages();
        pollUnread();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Settings ────────────────────────────
async function loadSettings() {
    if (allUsers.length === 0) await loadUsers();
    const listEl = $('users-list');
    const isAdmin = currentUser && currentUser.role === 'admin';

    listEl.innerHTML = allUsers.map(u => `
        <div class="user-list-item">
            <div class="user-avatar" style="background:${u.avatar_color || '#3b82f6'}">${initials(u.display_name)}</div>
            <div class="user-list-info">
                <div class="user-list-name">${escapeHtml(u.display_name)} <span class="text-muted" style="font-weight:400;font-size:0.75rem">@${escapeHtml(u.username)}</span></div>
                <div class="user-list-email">${escapeHtml(u.email || '')}</div>
            </div>
            <span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'} user-list-role">${u.role === 'admin' ? 'Admin' : 'Mitarbeiter'}</span>
            ${isAdmin && u.id !== currentUser.id ? `<button class="btn-icon" onclick="deleteUser(${u.id})" title="Löschen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-red)" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
        </div>
    `).join('');

    // Show/hide add user section based on admin
    $('add-user-section').style.display = isAdmin ? '' : 'none';
}

async function createUser() {
    const username = $('new-user-username').value.trim();
    const display = $('new-user-display').value.trim();
    const email = $('new-user-email').value.trim();
    const password = $('new-user-password').value;
    const role = $('new-user-role').value;
    const resultEl = $('create-user-result');

    if (!username || !display || !password) {
        resultEl.className = 'import-result error';
        resultEl.textContent = 'Alle Pflichtfelder ausfüllen';
        return;
    }

    try {
        // Register in Supabase Auth
        const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
        if (authErr) throw authErr;
        // Create crm_users entry linked to auth.users
        const { error: crmErr } = await sb.from('crm_users').insert({
            username, display_name: display, email, role,
            auth_user_id: authData.user?.id,
            is_active: true,
            password_hash: 'managed_by_supabase_auth'
        });
        if (crmErr) throw crmErr;
        resultEl.className = 'import-result success';
        resultEl.textContent = `Benutzer "${display}" erfolgreich erstellt`;
        $('new-user-username').value = '';
        $('new-user-display').value = '';
        $('new-user-email').value = '';
        $('new-user-password').value = '';
        await loadUsers();
        loadSettings();
    } catch (err) {
        resultEl.className = 'import-result error';
        resultEl.textContent = err.message;
    }
}

async function deleteUser(id) {
    if (!confirm('Benutzer wirklich löschen?')) return;
    try {
        await api('delete_user', { method: 'POST', params: { id } });
        toast('Benutzer gelöscht', 'success');
        await loadUsers();
        loadSettings();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Modals ──────────────────────────────
function openModal(title, bodyHtml, footerHtml) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHtml;
    $('modal-footer').innerHTML = footerHtml || '';
    $('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    $('modal-overlay').classList.add('hidden');
}

function openAddMemberModal() {
    const assignedOptions = allUsers.map(u => `<option value="${u.id}">${escapeHtml(u.display_name)}</option>`).join('');
    const body = `
        <div class="form-row">
            <div class="form-group"><label>Name *</label><input type="text" id="modal-name"></div>
            <div class="form-group"><label>Benutzername</label><input type="text" id="modal-username" placeholder="@..."></div>
        </div>
        <div class="form-group"><label>Bio</label><textarea id="modal-bio" rows="2"></textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Stadt</label><input type="text" id="modal-city"></div>
            <div class="form-group"><label>Land</label><input type="text" id="modal-country" value="Germany"></div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Mitgliedschaft</label>
                <select id="modal-membership" class="filter-select">
                    <option value="free">Free</option>
                    <option value="monthly_97">Monatlich (97€)</option>
                    <option value="yearly_697">Jährlich (697€)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Level</label>
                <select id="modal-level" class="filter-select">
                    <option value="beginner">Anfänger</option>
                    <option value="intermediate">Fortgeschritten</option>
                    <option value="advanced">Experte</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Funnel-Stufe</label>
                <select id="modal-funnel" class="filter-select">
                    <option value="">— Keine —</option>
                    <option value="free_community">Free Community</option>
                    <option value="recently_cancelled">Kürzlich Gekündigt</option>
                    <option value="long_cancelled">Länger Gekündigt</option>
                </select>
            </div>
            <div class="form-group">
                <label>Zuständig</label>
                <select id="modal-assigned" class="filter-select">
                    <option value="">— Niemand —</option>
                    ${assignedOptions}
                </select>
            </div>
        </div>
    `;
    openModal('Mitglied hinzufügen', body, `
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">Abbrechen</button>
        <button class="btn btn-primary btn-sm" onclick="saveMember()">Speichern</button>
    `);
}

async function saveMember() {
    const name = $('modal-name').value.trim();
    if (!name) { toast('Name ist erforderlich', 'error'); return; }

    try {
        await sb.from('members').insert({
            name,
            skool_username: $('modal-username').value.trim() || null,
            bio: $('modal-bio').value.trim() || null,
            city: $('modal-city').value.trim() || null,
            country: $('modal-country').value.trim() || null,
            membership_type: $('modal-membership').value,
            progress_level: $('modal-level').value,
            funnel_stage: $('modal-funnel').value || null,
            assigned_to: $('modal-assigned').value || null,
            membership_status: 'active',
            activity_status: 'active'
        }).then(({ error }) => { if (error) throw error; });
        closeModal();
        toast('Mitglied erstellt', 'success');
        loadMembers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function openEditMemberModal() {
    if (!currentMemberId) return;
    // Fetch current member data and populate a modal
    api('member', { params: { id: currentMemberId } }).then(m => {
        const assignedOptions = allUsers.map(u => `<option value="${u.id}" ${m.assigned_to == u.id ? 'selected' : ''}>${escapeHtml(u.display_name)}</option>`).join('');
        const body = `
            <div class="form-row">
                <div class="form-group"><label>Name *</label><input type="text" id="modal-edit-name" value="${escapeHtml(m.name || '')}"></div>
                <div class="form-group"><label>Benutzername</label><input type="text" id="modal-edit-username" value="${escapeHtml(m.skool_username || '')}"></div>
            </div>
            <div class="form-group"><label>Bio</label><textarea id="modal-edit-bio" rows="2">${escapeHtml(m.bio || '')}</textarea></div>
            <div class="form-row">
                <div class="form-group"><label>Stadt</label><input type="text" id="modal-edit-city" value="${escapeHtml(m.city || '')}"></div>
                <div class="form-group"><label>Land</label><input type="text" id="modal-edit-country" value="${escapeHtml(m.country || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Mitgliedschaft</label>
                    <select id="modal-edit-membership" class="filter-select">
                        <option value="free" ${m.membership_type === 'free' ? 'selected' : ''}>Free</option>
                        <option value="monthly_97" ${m.membership_type === 'monthly_97' ? 'selected' : ''}>Monatlich (97€)</option>
                        <option value="yearly_697" ${m.membership_type === 'yearly_697' ? 'selected' : ''}>Jährlich (697€)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="modal-edit-status" class="filter-select">
                        <option value="active" ${m.activity_status === 'active' ? 'selected' : ''}>Aktiv</option>
                        <option value="at_risk" ${m.activity_status === 'at_risk' ? 'selected' : ''}>Gefährdet</option>
                        <option value="inactive" ${m.activity_status === 'inactive' ? 'selected' : ''}>Inaktiv</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Level</label>
                    <select id="modal-edit-level" class="filter-select">
                        <option value="beginner" ${m.progress_level === 'beginner' ? 'selected' : ''}>Anfänger</option>
                        <option value="intermediate" ${m.progress_level === 'intermediate' ? 'selected' : ''}>Fortgeschritten</option>
                        <option value="advanced" ${m.progress_level === 'advanced' ? 'selected' : ''}>Experte</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Funnel-Stufe</label>
                    <select id="modal-edit-funnel" class="filter-select">
                        <option value="" ${!m.funnel_stage ? 'selected' : ''}>— Keine —</option>
                        <option value="free_community" ${m.funnel_stage === 'free_community' ? 'selected' : ''}>Free Community</option>
                        <option value="recently_cancelled" ${m.funnel_stage === 'recently_cancelled' ? 'selected' : ''}>Kürzlich Gekündigt</option>
                        <option value="long_cancelled" ${m.funnel_stage === 'long_cancelled' ? 'selected' : ''}>Länger Gekündigt</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Zuständig</label>
                <select id="modal-edit-assigned" class="filter-select">
                    <option value="">— Niemand —</option>
                    ${assignedOptions}
                </select>
            </div>
            <div class="form-group"><label>Notizen</label><textarea id="modal-edit-notes" rows="3">${escapeHtml(m.notes || '')}</textarea></div>
        `;
        openModal('Mitglied bearbeiten', body, `
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Abbrechen</button>
            <button class="btn btn-primary btn-sm" onclick="updateMember()">Speichern</button>
        `);
    }).catch(err => toast(err.message, 'error'));
}

async function updateMember() {
    try {
        const updates = {
            name: $('modal-edit-name').value.trim(),
            skool_username: $('modal-edit-username').value.trim() || null,
            bio: $('modal-edit-bio').value.trim() || null,
            city: $('modal-edit-city').value.trim() || null,
            country: $('modal-edit-country').value.trim() || null,
            membership_type: $('modal-edit-membership').value,
            activity_status: $('modal-edit-status').value,
            progress_level: $('modal-edit-level').value,
            funnel_stage: $('modal-edit-funnel').value || null,
            assigned_to: $('modal-edit-assigned').value || null,
            notes: $('modal-edit-notes').value || null
        };
        const { error } = await sb.from('members').update(updates).eq('id', currentMemberId);
        if (error) throw error;
        closeModal();
        toast('Mitglied aktualisiert', 'success');
        loadMemberDetail(currentMemberId);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteMember() {
    if (!currentMemberId) return;
    if (!confirm('Mitglied wirklich löschen? Alle Daten werden entfernt.')) return;
    try {
        const { error } = await sb.from('members').delete().eq('id', currentMemberId);
        if (error) throw error;
        toast('Mitglied gelöscht', 'success');
        location.hash = 'members';
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Import ──────────────────────────────
async function importFile(type) {
    const fileInput = $(`import-${type}-file`);
    const resultEl = $(`import-${type}-result`);
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const table = type === 'members' ? 'members' : 'posts';
        const { error } = await sb.from(table).insert(Array.isArray(data) ? data : [data]);
        if (error) throw error;
        resultEl.className = 'import-result success';
        resultEl.textContent = `Daten erfolgreich importiert`;
        fileInput.value = '';
    } catch (err) {
        resultEl.className = 'import-result error';
        resultEl.textContent = err.message;
    }
}

async function loadDemoData() {
    const resultEl = $('import-demo-result');
    try {
        resultEl.className = 'import-result success';
        resultEl.textContent = 'Demo-Daten werden direkt über Supabase geladen. Nutze den Import für JSON-Dateien.';
    } catch (err) {
        resultEl.className = 'import-result error';
        resultEl.textContent = err.message;
    }
}

async function exportData() {
    try {
        const { data: members } = await sb.from('members').select('*');
        const { data: posts } = await sb.from('posts').select('*');
        const { data: timeline } = await sb.from('timeline_entries').select('*');
        const exportObj = { members: members || [], posts: posts || [], timeline_entries: timeline || [] };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skool_crm_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Export heruntergeladen', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Audio Upload ────────────────────────
function handleAudioUpload(file) {
    if (!file) return;
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        toast('Audio-Datei darf maximal 10 MB sein', 'error');
        return;
    }
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp3'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm)$/i)) {
        toast('Nur MP3, WAV, OGG und WebM erlaubt', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        audioFileData = e.target.result;
        $('audio-filename').textContent = file.name;
    };
    reader.readAsDataURL(file);
}

// ─── Event Listeners ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Login
    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        const errorEl = $('login-error');
        const btn = $('login-btn');

        btn.disabled = true;
        btn.querySelector('span').textContent = 'Anmelden...';
        errorEl.classList.add('hidden');

        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            // Load CRM user profile
            const { data: crmUser, error: crmErr } = await sb.from('crm_users').select('*').eq('auth_user_id', data.user.id).single();
            if (crmErr || !crmUser) throw new Error('Zugangsdaten ungültig');
            if (!crmUser.is_active) {
                await sb.auth.signOut();
                throw new Error('Konto ist deaktiviert');
            }
            currentUser = crmUser;
            showApp();
        } catch (err) {
            // OWASP: Generic error message to prevent user enumeration
            errorEl.textContent = 'E-Mail oder Passwort ungültig';
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Anmelden';
        }
    });

    // Logout
    $('logout-btn').addEventListener('click', async () => {
        try { await sb.auth.signOut(); } catch { /* ok */ }
        currentUser = null;
        showLogin();
    });

    // Hash routing
    window.addEventListener('hashchange', () => {
        if (currentUser) route();
    });

    // Members table row click
    $('members-tbody').addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (tr) location.hash = `member/${tr.dataset.id}`;
    });

    // Sort columns
    qsa('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortCol === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortCol = col;
                sortDir = 'asc';
            }
            loadMembers();
        });
    });

    // Member search + filters
    let searchTimeout;
    $('member-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadMembers, 300);
    });
    $('filter-status').addEventListener('change', loadMembers);
    $('filter-membership').addEventListener('change', loadMembers);
    $('filter-level').addEventListener('change', loadMembers);

    // Add member
    $('btn-add-member').addEventListener('click', openAddMemberModal);

    // Member detail actions
    $('btn-edit-member').addEventListener('click', openEditMemberModal);
    $('btn-delete-member').addEventListener('click', deleteMember);

    // Timeline
    $('btn-add-timeline').addEventListener('click', addTimelineEntry);
    $('timeline-audio').addEventListener('change', (e) => {
        handleAudioUpload(e.target.files[0]);
    });

    // Panel tabs
    qsa('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            qsa('.panel-tab').forEach(t => t.classList.remove('active'));
            qsa('.panel-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Team messages
    $('btn-send-team-msg').addEventListener('click', sendTeamMessage);

    // Import
    $('import-members-drop').addEventListener('click', () => $('import-members-file').click());
    $('import-posts-drop').addEventListener('click', () => $('import-posts-file').click());
    $('import-members-file').addEventListener('change', () => importFile('members'));
    $('import-posts-file').addEventListener('change', () => importFile('posts'));
    $('btn-import-demo').addEventListener('click', loadDemoData);
    $('btn-export-data').addEventListener('click', exportData);

    // Demo data from empty state
    $('btn-load-demo').addEventListener('click', async () => {
        await loadDemoData();
        loadMembers();
    });

    // Import drag and drop
    ['import-members-drop', 'import-posts-drop'].forEach(id => {
        const el = $(id);
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const fileId = id.replace('-drop', '-file');
            const fileInput = $(fileId);
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                const type = id.includes('members') ? 'members' : 'posts';
                importFile(type);
            }
        });
    });

    // Settings
    $('btn-create-user').addEventListener('click', createUser);

    // Dashboard refresh
    $('btn-refresh-dashboard').addEventListener('click', loadDashboard);

    // Modal close
    $('modal-close').addEventListener('click', closeModal);
    $('modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('modal-overlay')) closeModal();
    });

    // Mobile menu
    $('mobile-menu-btn').addEventListener('click', () => {
        $('sidebar').classList.toggle('open');
        $('mobile-overlay').classList.toggle('hidden');
    });
    $('mobile-overlay').addEventListener('click', () => {
        $('sidebar').classList.remove('open');
        $('mobile-overlay').classList.add('hidden');
    });
    // Close sidebar on nav click (mobile)
    qsa('.nav-item').forEach(n => {
        n.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                $('sidebar').classList.remove('open');
                $('mobile-overlay').classList.add('hidden');
            }
        });
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Start
    checkAuth();
});
