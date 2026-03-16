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
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#d97706', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
        if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
        if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
        if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tagen`;
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
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        // Use count query for exact total (no 1000 limit)
        var countRes = await sb.from('members').select('*', { count: 'exact', head: true });
        var totalCount = countRes.count || 0;

        const { data: members, error } = await sb.from('members').select('*').range(0, 4999);
        if (error) throw error;
        const all = members || [];
        const paying = all.filter(m => m.membership_type && m.membership_type !== 'free');
        const atRisk = all.filter(m => m.activity_status === 'at_risk');
        const revenue = all.reduce((sum, m) => {
            if (m.membership_type === 'monthly_97') return sum + 97;
            if (m.membership_type === 'yearly_697') return sum + Math.round(697 / 12);
            return sum;
        }, 0);

        $('stat-total').textContent = totalCount;
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
        await loadTeamNotifications();

        // Charts (removed city chart — replaced by Team-Benachrichtigungen)
        const byMembership = {}; all.forEach(m => { const k = m.membership_type || 'free'; byMembership[membershipLabel(k)] = (byMembership[membershipLabel(k)] || 0) + 1; });
        const byLevel = {}; all.forEach(m => { const k = m.progress_level || 'beginner'; byLevel[levelLabel(k)] = (byLevel[levelLabel(k)] || 0) + 1; });
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

async function loadTeamNotifications() {
    var notifEl = $('team-notifications-feed');
    if (!notifEl) return;
    try {
        // Load team messages sent TO current user
        var res = await sb.from('team_messages')
            .select('*, sender:sender_id(display_name), member:member_id(name)')
            .eq('recipient_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(8);
        var messages = (res.data || []);

        if (messages.length === 0) {
            notifEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine Team-Benachrichtigungen</p>';
            return;
        }

        notifEl.innerHTML = messages.map(function(msg) {
            var senderName = (msg.sender && msg.sender.display_name) || 'System';
            var memberLink = '';
            if (msg.member_id && msg.member) {
                memberLink = ' <a href="#member/' + msg.member_id + '" style="color:var(--accent-blue);text-decoration:none">📋 ' + escapeHtml(msg.member.name) + '</a>';
            }
            var isRead = msg.is_read;
            return '<div class="activity-item' + (isRead ? '' : ' notif-unread') + '">' +
                '<div class="activity-dot" style="background:' + (isRead ? 'var(--text-muted)' : 'var(--accent-blue)') + '"></div>' +
                '<div class="activity-info">' +
                    '<div class="activity-text">' +
                        '<strong>' + escapeHtml(senderName) + '</strong>' +
                        (isRead ? '' : ' <span class="badge badge-blue" style="font-size:9px">Neu</span>') +
                        memberLink +
                    '</div>' +
                    '<div class="activity-meta" style="margin-top:2px">' + escapeHtml(msg.content || '').substring(0, 100) + '</div>' +
                    '<div class="activity-meta">' + relativeTime(msg.created_at) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch(e) {
        console.warn('Team notifications error:', e);
        notifEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Team-Nachrichten nicht verfuegbar</p>';
    }
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
            <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(val / max) * 100}%;background:${color}"></div></div>
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

// ─── Member Detail ─────────────────────
var cachedMemberIds = [];
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
        // Cache member IDs for prev/next navigation
        if (cachedMemberIds.length === 0) {
            var idRes = await sb.from('members').select('id').order('name').range(0, 9999);
            cachedMemberIds = (idRes.data || []).map(function(m) { return m.id; });
        }
        renderMemberDetail(member);
        renderMemberNav();
        loadTimeline(id);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderMemberNav() {
    var navCounter = $('member-nav-counter');
    if (!navCounter) return;
    var idx = cachedMemberIds.indexOf(currentMemberId);
    var total = cachedMemberIds.length;
    navCounter.textContent = (idx >= 0 ? (idx + 1) : '?') + ' / ' + total;
}

function navigateMember(direction) {
    if (cachedMemberIds.length === 0) return;
    var idx = cachedMemberIds.indexOf(currentMemberId);
    if (idx === -1) return;
    var newIdx = idx + direction;
    if (newIdx < 0) newIdx = cachedMemberIds.length - 1;
    if (newIdx >= cachedMemberIds.length) newIdx = 0;
    location.hash = 'member/' + cachedMemberIds[newIdx];
}

function renderMemberDetail(m) {
    $('breadcrumb-name').textContent = m.name;
    $('detail-avatar').textContent = initials(m.name);
    $('detail-avatar').style.background = avatarColor(m.name);
    $('detail-name').textContent = m.name;
    $('detail-username').textContent = m.skool_username || '';

    // Badges (removed membership badge from here - now shown prominently at top)
    $('detail-badges').innerHTML = `
        ${statusBadge(m.activity_status)}
        ${m.is_premium ? '<span class="badge badge-purple">Premium</span>' : ''}
        ${m.is_admin ? '<span class="badge badge-gold">Admin</span>' : ''}
    `;

    // Prominent membership type at top
    var mtEl = $('detail-membership-type');
    if (mtEl) {
        var mLabel = m.membership_type === 'free' ? '🟡 FREE COMMUNITY' : '🔵 BEZAHLTE COMMUNITY';
        var mColor = m.membership_type === 'free' ? '#f59e0b' : '#3b82f6';
        mtEl.innerHTML = '<span style="font-size:14px;font-weight:700;color:' + mColor + ';letter-spacing:1px">' + mLabel + '</span>';
    }

    // Build funnel/assigned selectors
    const funnelOptions = ['', 'free_community', 'recently_cancelled', 'long_cancelled']
        .map(v => `<option value="${v}" ${m.funnel_stage === v ? 'selected' : ''}>${v ? funnelLabel(v) : '— Kein Funnel —'}</option>`).join('');
    const assignedOptions = ['<option value="">— Niemand —</option>']
        .concat(allUsers.map(u => `<option value="${u.id}" ${m.assigned_to == u.id ? 'selected' : ''}>${escapeHtml(u.display_name)}</option>`)).join('');

    // Fields (removed Mitgliedschaft - now shown at top)
    $('detail-fields').innerHTML = `
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
        <div class="field-row">
            <span class="field-label">Akquise-Status</span>
            <span class="field-value"><select onchange="updateMemberField(${m.id},'acquisition_status',this.value)" class="acq-status-select">
                <option value="" ${!m.acquisition_status ? 'selected' : ''}>— Kein Status —</option>
                <option value="hot_lead" ${m.acquisition_status === 'hot_lead' ? 'selected' : ''}>🔥 Heißer Lead</option>
                <option value="in_progress" ${m.acquisition_status === 'in_progress' ? 'selected' : ''}>🟡 In Bearbeitung</option>
                <option value="no_interest" ${m.acquisition_status === 'no_interest' ? 'selected' : ''}>❌ Kein Interesse</option>
            </select></span>
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
        // Load timeline entries
        const { data: entries, error } = await sb.from('timeline_entries').select('*').eq('member_id', memberId).order('created_at', { ascending: true });
        if (error) throw error;

        // Load post_comments for this member with post details
        var comments = [];
        try {
            var cResult = await sb.from('post_comments')
                .select('id, comment_text, comment_date, likes, depth, is_reply, created_at, author_name, post_id, posts(post_title, post_content, author_name, author_username, post_url, category, posted_at)')
                .eq('member_id', memberId)
                .order('created_at', { ascending: true });
            if (cResult.data) comments = cResult.data;
        } catch (e) { console.warn('Comments load error:', e); }

        // Merge timeline entries and comments into one feed
        var allItems = [];

        // Add regular timeline entries (skip old system "kommentiert" entries)
        (entries || []).forEach(function (e) {
            if (e.entry_type === 'system' && e.content && e.content.indexOf('kommentiert in:') !== -1) return; // skip old grouped entries
            allItems.push({ type: 'timeline', data: e, sortDate: new Date(e.created_at) });
        });

        // Add comment entries
        comments.forEach(function (c) {
            allItems.push({ type: 'comment', data: c, sortDate: new Date(c.created_at) });
        });

        // Sort by date
        allItems.sort(function (a, b) { return a.sortDate - b.sortDate; });

        if (allItems.length === 0) {
            feed.innerHTML = '<div class="empty-state"><p>Noch keine Eintraege im Verlauf</p></div>';
            return;
        }

        feed.innerHTML = allItems.map(function (item) {
            if (item.type === 'comment') return renderCommentEntry(item.data);
            return renderTimelineEntry(item.data);
        }).join('');
        feed.scrollTop = feed.scrollHeight;
    } catch (err) {
        feed.innerHTML = '<p class="text-muted" style="padding:12px">' + escapeHtml(err.message) + '</p>';
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
        audioHtml = '<div class="timeline-audio"><audio controls src="' + e.audio_url + '" preload="none"></audio></div>';
    }

    let channelHtml = '';
    if (e.channel) {
        channelHtml = '<div class="timeline-channel">Kanal: ' + escapeHtml(e.channel) + '</div>';
    }

    return '<div class="timeline-entry">' +
        '<div class="timeline-icon timeline-icon-' + e.entry_type + '">' + icon + '</div>' +
        '<div class="timeline-body">' +
        '<div class="timeline-header">' +
        '<span class="timeline-author">' + escapeHtml(e.user_name || 'System') + '</span>' +
        '<span class="badge ' + badgeCls + ' timeline-type-badge">' + entryTypeLabel(e.entry_type) + '</span>' +
        '<span class="timeline-time">' + relativeTime(e.created_at) + '</span>' +
        '</div>' +
        '<div class="timeline-text">' + escapeHtml(e.content || '') + '</div>' +
        audioHtml +
        channelHtml +
        '</div>' +
        '</div>';
}

function renderCommentEntry(c, memberLookup) {
    var post = c.posts || {};
    var postTitle = post.post_title || 'Unbekannter Post';
    var postAuthor = post.author_name || 'Unbekannt';
    var postAuthorUsername = post.author_username || '';
    var postUrl = post.post_url || '';
    var postCategory = post.category || '';
    var commentText = c.comment_text || '';
    var commentDate = c.comment_date || '';
    var commentLikes = c.likes || 0;
    var isReply = c.is_reply;
    var icon = isReply ? '↩️' : '💬';

    // Author link: green if member exists, red if not
    var authorHtml = '';
    var authorMember = (memberLookup && postAuthorUsername) ? memberLookup[postAuthorUsername] : null;
    if (authorMember) {
        authorHtml = '<a href="#member/' + authorMember.id + '" class="author-link author-link-found">' + escapeHtml(postAuthor) + '</a>';
    } else {
        authorHtml = '<span class="author-link author-link-missing">' + escapeHtml(postAuthor) + '</span>';
    }

    var linkHtml = postUrl ? '<a href="' + escapeHtml(postUrl) + '" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:none;font-size:12px">🔗 Post oeffnen</a>' : '';
    var categoryHtml = postCategory ? '<span class="badge badge-blue" style="font-size:10px;margin-left:4px">' + escapeHtml(postCategory) + '</span>' : '';
    var likesHtml = commentLikes > 0 ? '<span style="font-size:12px;color:var(--text-muted)">👍 ' + commentLikes + '</span>' : '';

    return '<div class="timeline-entry timeline-comment-entry">' +
        '<div class="timeline-icon timeline-icon-comment">' + icon + '</div>' +
        '<div class="timeline-body">' +
        '<div class="timeline-header">' +
        '<span class="timeline-author">Kommentar</span>' +
        '<span class="badge badge-green timeline-type-badge">Skool</span>' +
        '<span class="timeline-time">' + relativeTime(c.created_at) + '</span>' +
        '</div>' +
        '<div class="timeline-comment-post">' +
        '<strong>Post:</strong> ' + escapeHtml(postTitle) + categoryHtml +
        '<br><strong>Von:</strong> ' + authorHtml +
        (commentDate ? ' <span style="color:var(--text-muted);font-size:12px">(' + escapeHtml(commentDate) + ')</span>' : '') +
        (post.post_content ? '<div class="timeline-post-content">' + escapeHtml(post.post_content.substring(0, 200)) + (post.post_content.length > 200 ? '...' : '') + '</div>' : '') +
        '</div>' +
        '<div class="timeline-comment-text">' +
        (isReply ? '<span style="color:var(--text-muted);font-size:12px">↩️ Antwort:</span> ' : '') +
        escapeHtml(commentText) +
        '</div>' +
        '<div class="timeline-comment-meta">' + likesHtml + ' ' + linkHtml + '</div>' +
        '</div>' +
        '</div>';
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

// ─── AI Export ───────────────────────────
async function exportAIProfile(memberId) {
    try {
        toast('AI-Profil wird erstellt...', 'info');

        // Load member
        var mRes = await sb.from('members').select('*').eq('id', memberId).single();
        if (mRes.error) throw mRes.error;
        var member = mRes.data;

        // Load posts by this member
        var pRes = await sb.from('posts').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
        var memberPosts = pRes.data || [];

        // Load comments by this member with post details
        var cRes = await sb.from('post_comments')
            .select('*, posts(post_title, post_content, author_name, author_username, post_url, category)')
            .eq('member_id', memberId)
            .order('created_at', { ascending: true });
        var memberComments = cRes.data || [];

        // Load timeline entries
        var tRes = await sb.from('timeline_entries').select('*').eq('member_id', memberId).order('created_at', { ascending: true });
        var timelineEntries = (tRes.data || []).filter(function(e) {
            return !(e.entry_type === 'system' && e.content && e.content.indexOf('kommentiert in:') !== -1);
        });

        // Analyze interests
        var categories = {};
        memberComments.forEach(function(c) {
            var cat = (c.posts && c.posts.category) || 'Unkategorisiert';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        memberPosts.forEach(function(p) {
            var cat = p.category || 'Unkategorisiert';
            categories[cat] = (categories[cat] || 0) + 2;
        });
        var sortedCategories = Object.keys(categories).sort(function(a, b) { return categories[b] - categories[a]; });

        // Build AI-optimized JSON
        var aiProfile = {
            _hinweis: 'Dieses JSON beschreibt ein Community-Mitglied und seine Aktivitaeten. Nutze diese Daten, um die Person zu verstehen und personalisierte Kommunikation zu erstellen.',
            person: {
                name: member.name,
                username: member.skool_username || null,
                mitgliedschaft: member.membership_type === 'free' ? 'Kostenlose Community' : 'Bezahlte Community (97 Euro/Monat)',
                status: member.activity_status,
                level: member.progress_level,
                stadt: member.city || null,
                land: member.country || null,
                bio: member.bio || null,
                beitritt: member.join_date || null
            },
            vita: {
                anzahl_eigene_posts: memberPosts.length,
                anzahl_kommentare: memberComments.length,
                hauptinteressen: sortedCategories.slice(0, 5),
                engagement_level: memberComments.length > 20 ? 'Sehr aktiv' : memberComments.length > 5 ? 'Aktiv' : memberComments.length > 0 ? 'Gelegentlich' : 'Passiv',
                letzte_aktivitaet: member.last_active || null
            },
            eigene_posts: memberPosts.map(function(p) {
                return {
                    titel: p.post_title,
                    inhalt: p.post_content,
                    kategorie: p.category,
                    likes: p.likes || 0,
                    kommentare: p.comments || 0,
                    url: p.post_url
                };
            }),
            kommentare_auf_posts_anderer: memberComments.map(function(c) {
                var post = c.posts || {};
                return {
                    post_titel: post.post_title || 'Unbekannt',
                    post_autor: post.author_name || 'Unbekannt',
                    post_inhalt_auszug: (post.post_content || '').substring(0, 300) + ((post.post_content || '').length > 300 ? '...' : ''),
                    post_kategorie: post.category || null,
                    post_url: post.post_url || null,
                    kommentar_text: c.comment_text,
                    datum: c.comment_date || null,
                    ist_antwort: c.is_reply || false,
                    likes: c.likes || 0
                };
            }),
            notizen_und_verlauf: timelineEntries.filter(function(e) { return e.entry_type !== 'system'; }).map(function(e) {
                return {
                    typ: e.entry_type,
                    inhalt: e.content,
                    kanal: e.channel || null,
                    datum: e.created_at,
                    von: e.user_name || 'System'
                };
            })
        };

        // Download as JSON
        var jsonStr = JSON.stringify(aiProfile, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ai-profil-' + (member.skool_username || member.name.toLowerCase().replace(/\s+/g, '-')) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast('AI-Profil exportiert!', 'success');
    } catch (err) {
        toast('Export-Fehler: ' + err.message, 'error');
    }
}

// ─── Vita ────────────────────────────────
async function loadVita(memberId) {
    var container = $('vita-content');
    if (!container) return;

    try {
        container.innerHTML = '<div class="empty-state"><p>⏳ Vita wird analysiert...</p></div>';

        // Load member
        var mRes = await sb.from('members').select('*').eq('id', memberId).single();
        var member = mRes.data;

        // Load posts by this member (full content)
        var pRes = await sb.from('posts').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
        var posts = pRes.data || [];

        // Load comments with FULL post details (title, content, author, category)
        var cRes = await sb.from('post_comments')
            .select('*, posts(post_title, post_content, author_name, category, post_url)')
            .eq('member_id', memberId)
            .order('created_at', { ascending: false });
        var comments = cRes.data || [];

        // Load timeline entries (notes, calls etc.)
        var tRes = await sb.from('timeline_entries').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
        var timeline = (tRes.data || []).filter(function(e) {
            return e.entry_type !== 'system';
        });

        // ── Stats ──
        var totalPosts = posts.length;
        var totalComments = comments.length;
        var totalLikesReceived = 0;
        var totalLikesGiven = 0;
        posts.forEach(function(p) { totalLikesReceived += (p.likes || 0); });
        comments.forEach(function(c) { totalLikesGiven += (c.likes || 0); });

        // ── Topic Analysis from content ──
        var topicKeywords = {
            'Datenschutz & DSGVO': ['datenschutz', 'dsgvo', 'privacy', 'gdpr', 'daten', 'cookie', 'einwilligung', 'personenbezogen'],
            'KI & Automatisierung': ['ki ', ' ai ', 'kuenstlich', 'künstlich', 'chatgpt', 'gpt', 'openai', 'claude', 'automatisierung', 'automat', 'prompt', 'llm', 'bot'],
            'Marketing & Vertrieb': ['marketing', 'vertrieb', 'sales', 'funnel', 'lead', 'ads', 'werbung', 'kampagne', 'conversion', 'kund', 'akquise'],
            'Social Media': ['social media', 'instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'content', 'reichweite', 'follower', 'viral'],
            'Technik & Entwicklung': ['programmier', 'code', 'software', 'entwickl', 'api', 'website', 'app', 'tech', 'server', 'datenbank', 'javascript', 'python'],
            'Business & Strategie': ['business', 'strategie', 'unternehm', 'startup', 'gruend', 'gründ', 'skalier', 'wachstum', 'revenue', 'umsatz', 'geschaeft'],
            'Community & Networking': ['community', 'netzwerk', 'networking', 'mitglied', 'austausch', 'zusammen', 'gruppe', 'skool', 'mastermind'],
            'E-Mail & Newsletter': ['email', 'e-mail', 'newsletter', 'mail', 'betreff', 'autoresponder', 'opt-in', 'liste'],
            'SEO & Website': ['seo', 'google', 'ranking', 'keyword', 'backlink', 'traffic', 'webseite', 'website', 'domain', 'wordpress'],
            'Finanzen & Investition': ['finanz', 'invest', 'geld', 'kapital', 'rendite', 'aktie', 'krypto', 'bitcoin', 'budget', 'steuer'],
            'Coaching & Beratung': ['coaching', 'coach', 'berat', 'mentoring', 'mentor', 'training', 'kurs', 'online-kurs', 'webinar'],
            'Mindset & Motivation': ['mindset', 'motivation', 'erfolg', 'ziel', 'disziplin', 'gewohnheit', 'habit', 'produktiv', 'fokus', 'wachstum'],
            'Design & Kreativitaet': ['design', 'kreativ', 'grafik', 'canva', 'brand', 'logo', 'visual', 'bild', 'video', 'foto'],
            'Tools & Software': ['tool', 'software', 'notion', 'zapier', 'make', 'n8n', 'airtable', 'clickup', 'trello', 'slack'],
            'Freelancing & Agentur': ['freelanc', 'agentur', 'selbst', 'freiberuf', 'auftraeg', 'auftrag', 'kunde', 'projekt', 'dienstleist']
        };

        // Collect all text items WITH labels for source tracking
        var textItems = [];
        comments.forEach(function(c) {
            if (c.comment_text) textItems.push({ text: c.comment_text, label: 'Kommentar', context: (c.posts && c.posts.post_title) ? 'auf "' + c.posts.post_title + '"' : '' });
            if (c.posts && c.posts.post_content) textItems.push({ text: c.posts.post_content, label: 'Post-Inhalt', context: c.posts.post_title || '' });
        });
        posts.forEach(function(p) {
            if (p.post_title) textItems.push({ text: p.post_title, label: 'Eigener Post', context: '' });
            if (p.post_content) textItems.push({ text: p.post_content, label: 'Eigener Post-Inhalt', context: p.post_title || '' });
        });
        timeline.forEach(function(e) {
            if (e.content) textItems.push({ text: e.content, label: 'Notiz (' + (e.entry_type || 'note') + ')', context: '' });
        });

        var allTexts = textItems.map(function(t) { return t.text; });
        var combinedText = allTexts.join(' ').toLowerCase();

        // Score each topic AND collect sources
        var topicScores = {};
        var topicSources = {};
        Object.keys(topicKeywords).forEach(function(topic) {
            var score = 0;
            var sources = [];
            topicKeywords[topic].forEach(function(kw) {
                textItems.forEach(function(item) {
                    if (item.text.toLowerCase().indexOf(kw) !== -1) {
                        score++;
                        // Add source (limit snippet to 120 chars around the keyword)
                        var lowerText = item.text.toLowerCase();
                        var pos = lowerText.indexOf(kw);
                        var start = Math.max(0, pos - 40);
                        var end = Math.min(item.text.length, pos + kw.length + 80);
                        var snippet = (start > 0 ? '...' : '') + item.text.substring(start, end) + (end < item.text.length ? '...' : '');
                        sources.push({ label: item.label, context: item.context, snippet: snippet, keyword: kw });
                    }
                });
            });
            if (score > 0) {
                topicScores[topic] = score;
                // Deduplicate sources by snippet
                var seen = {};
                topicSources[topic] = sources.filter(function(s) {
                    var key = s.snippet.substring(0, 60);
                    if (seen[key]) return false;
                    seen[key] = true;
                    return true;
                }).slice(0, 10); // max 10 sources per topic
            }
        });
        var sortedTopics = Object.entries(topicScores).sort(function(a, b) { return b[1] - a[1]; });

        // ── Categories ──
        var categories = {};
        comments.forEach(function(c) {
            var cat = (c.posts && c.posts.category) || 'Unkategorisiert';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        posts.forEach(function(p) {
            var cat = p.category || 'Unkategorisiert';
            categories[cat] = (categories[cat] || 0) + 2;
        });
        var sortedCats = Object.entries(categories).sort(function(a, b) { return b[1] - a[1]; });

        // ── Engagement & Type ──
        var total = totalPosts + totalComments;
        var engLevel = 'Passiv';
        var engColor = '#ef4444';
        if (total > 20) { engLevel = 'Sehr aktiv'; engColor = '#10b981'; }
        else if (total > 5) { engLevel = 'Aktiv'; engColor = '#3b82f6'; }
        else if (total > 0) { engLevel = 'Gelegentlich'; engColor = '#f59e0b'; }

        var actType = 'Beobachter';
        if (totalPosts > 5 && totalComments > 10) actType = 'Community-Leader';
        else if (totalPosts > 3) actType = 'Content-Creator';
        else if (totalComments > 10) actType = 'Aktiver Kommentator';
        else if (totalComments > 0) actType = 'Gelegentlicher Teilnehmer';

        // ══════ BUILD HTML ══════
        var html = '';

        // Stats Grid
        html += '<div class="vita-stats-grid">';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalPosts + '</div><div class="vita-stat-label">Eigene Posts</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalComments + '</div><div class="vita-stat-label">Kommentare</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalLikesReceived + '</div><div class="vita-stat-label">Likes erhalten</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number" style="color:' + engColor + '">' + engLevel + '</div><div class="vita-stat-label">Engagement</div></div>';
        html += '</div>';

        // Personality card
        html += '<div class="vita-card">';
        html += '<h4>📋 Persoenlichkeitsprofil</h4>';
        html += '<div class="vita-personality">';
        html += '<div class="vita-trait"><span class="vita-trait-label">Typ:</span><span class="vita-trait-value" style="font-weight:700;color:' + engColor + '">' + actType + '</span></div>';
        html += '<div class="vita-trait"><span class="vita-trait-label">Mitgliedschaft:</span><span class="vita-trait-value">' + (member.membership_type === 'free' ? '🟡 Free Community' : '🔵 Bezahlte Community') + '</span></div>';
        html += '<div class="vita-trait"><span class="vita-trait-label">Status:</span><span class="vita-trait-value">' + (member.activity_status || 'Unbekannt') + '</span></div>';
        if (member.acquisition_status) {
            var acqLabels = { hot_lead: '🔥 Heisser Lead', in_progress: '🟡 In Bearbeitung', no_interest: '❌ Kein Interesse' };
            html += '<div class="vita-trait"><span class="vita-trait-label">Akquise:</span><span class="vita-trait-value">' + (acqLabels[member.acquisition_status] || member.acquisition_status) + '</span></div>';
        }
        if (member.city || member.country) {
            html += '<div class="vita-trait"><span class="vita-trait-label">Standort:</span><span class="vita-trait-value">📍 ' + escapeHtml((member.city || '') + (member.city && member.country ? ', ' : '') + (member.country || '')) + '</span></div>';
        }
        if (member.bio) {
            html += '<div class="vita-trait"><span class="vita-trait-label">Bio:</span><span class="vita-trait-value">' + escapeHtml(member.bio) + '</span></div>';
        }
        html += '</div></div>';

        // ── TOPIC ANALYSIS with clickable sources ──
        if (sortedTopics.length > 0) {
            html += '<div class="vita-card">';
            html += '<h4>🔍 Themenanalyse (aus Inhalten erkannt)</h4>';
            html += '<p style="font-size:12px;color:var(--text-muted);margin:0 0 10px 0">Basierend auf ' + allTexts.length + ' analysierten Texten — <strong>Klick auf ein Thema fuer Quellen</strong></p>';
            html += '<div class="vita-interests">';
            var topMax = sortedTopics[0] ? sortedTopics[0][1] : 1;
            sortedTopics.forEach(function(entry, idx) {
                var topicName = entry[0];
                var pct = Math.round((entry[1] / topMax) * 100);
                var color = pct > 70 ? '#10b981' : pct > 40 ? '#3b82f6' : '#8b5cf6';
                var panelId = 'topic-sources-' + idx;
                html += '<div class="vita-topic-row">';
                html += '<div class="vita-interest vita-interest-clickable" onclick="document.getElementById(\'' + panelId + '\').classList.toggle(\'open\')" style="cursor:pointer">';
                html += '<span class="vita-interest-name">' + escapeHtml(topicName) + ' <span style="font-size:10px;color:var(--text-muted)">▼</span></span>';
                html += '<div class="vita-interest-bar"><div class="vita-interest-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
                html += '<span class="vita-interest-count">' + entry[1] + 'x</span>';
                html += '</div>';
                // Sources panel (hidden by default)
                var sources = topicSources[topicName] || [];
                html += '<div class="vita-topic-sources" id="' + panelId + '">';
                if (sources.length > 0) {
                    sources.forEach(function(s) {
                        html += '<div class="vita-source-item">';
                        html += '<span class="vita-source-label">' + escapeHtml(s.label) + '</span>';
                        if (s.context) html += ' <span style="font-size:11px;color:var(--text-muted)">' + escapeHtml(s.context) + '</span>';
                        html += '<div class="vita-source-snippet">"' + escapeHtml(s.snippet) + '"</div>';
                        html += '</div>';
                    });
                } else {
                    html += '<p style="font-size:12px;color:var(--text-muted);margin:4px 0">Keine Quellen verfuegbar</p>';
                }
                html += '</div>';
                html += '</div>';
            });
            html += '</div></div>';
        }

        // ── Category breakdown ──
        if (sortedCats.length > 0) {
            html += '<div class="vita-card">';
            html += '<h4>📁 Kategorien</h4>';
            html += '<div class="vita-interests">';
            var catMax = sortedCats[0] ? sortedCats[0][1] : 1;
            sortedCats.forEach(function(entry) {
                var pct = Math.round((entry[1] / catMax) * 100);
                html += '<div class="vita-interest">';
                html += '<span class="vita-interest-name">' + escapeHtml(entry[0]) + '</span>';
                html += '<div class="vita-interest-bar"><div class="vita-interest-fill" style="width:' + pct + '%"></div></div>';
                html += '<span class="vita-interest-count">' + entry[1] + '</span>';
                html += '</div>';
            });
            html += '</div></div>';
        }

        // ── Activity Feed: What did the person comment on? ──
        if (comments.length > 0) {
            html += '<div class="vita-card">';
            html += '<h4>💬 Kommentar-Verlauf (' + comments.length + ')</h4>';
            var showComments = comments.slice(0, 15); // Show max 15
            showComments.forEach(function(c) {
                var post = c.posts || {};
                html += '<div class="vita-activity-item">';
                html += '<div class="vita-activity-post">';
                html += '<strong>📄 Post:</strong> ' + escapeHtml(post.post_title || 'Unbekannt');
                if (post.category) html += ' <span class="badge badge-blue" style="font-size:10px">' + escapeHtml(post.category) + '</span>';
                if (post.author_name) html += '<br><span style="color:var(--text-muted);font-size:12px">Von: ' + escapeHtml(post.author_name) + '</span>';
                if (post.post_content) {
                    html += '<div class="vita-activity-context">' + escapeHtml(post.post_content.substring(0, 150)) + (post.post_content.length > 150 ? '...' : '') + '</div>';
                }
                html += '</div>';
                html += '<div class="vita-activity-comment">';
                html += (c.is_reply ? '↩️ <strong>Antwort:</strong> ' : '💬 <strong>Kommentar:</strong> ') + escapeHtml(c.comment_text || '');
                if (c.comment_date) html += ' <span style="color:var(--text-muted);font-size:11px">(' + escapeHtml(c.comment_date) + ')</span>';
                if (c.likes > 0) html += ' <span style="font-size:11px">👍 ' + c.likes + '</span>';
                html += '</div>';
                html += '</div>';
            });
            if (comments.length > 15) {
                html += '<p style="text-align:center;color:var(--text-muted);font-size:12px">... und ' + (comments.length - 15) + ' weitere Kommentare</p>';
            }
            html += '</div>';
        }

        // ── Own posts ──
        if (posts.length > 0) {
            html += '<div class="vita-card">';
            html += '<h4>📝 Eigene Beitraege (' + posts.length + ')</h4>';
            var showPosts = posts.slice(0, 10);
            showPosts.forEach(function(p) {
                html += '<div class="vita-activity-item">';
                html += '<strong>📄 ' + escapeHtml(p.post_title || 'Ohne Titel') + '</strong>';
                if (p.category) html += ' <span class="badge badge-blue" style="font-size:10px">' + escapeHtml(p.category) + '</span>';
                html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">';
                html += '👍 ' + (p.likes || 0) + ' Likes &middot; 💬 ' + (p.comments || 0) + ' Kommentare';
                html += '</div>';
                if (p.post_content) {
                    html += '<div class="vita-activity-context">' + escapeHtml(p.post_content.substring(0, 200)) + (p.post_content.length > 200 ? '...' : '') + '</div>';
                }
                html += '</div>';
            });
            html += '</div>';
        }

        // ── AI Summary ──
        html += '<div class="vita-card">';
        html += '<h4>🤖 Zusammenfassung fuer AI</h4>';
        var summaryText = escapeHtml(member.name) + ' ist ein <strong>' + actType + '</strong> in der ' +
            (member.membership_type === 'free' ? 'kostenlosen' : 'bezahlten') + ' Community. ' +
            'Mit ' + totalPosts + ' eigenen Posts und ' + totalComments + ' Kommentaren zeigt ' +
            (total > 10 ? 'hohes' : total > 3 ? 'moderates' : 'geringes') + ' Engagement. ';
        if (sortedTopics.length > 0) {
            summaryText += 'Erkannte Themen: ' + sortedTopics.slice(0, 5).map(function(e) { return '<strong>' + e[0] + '</strong> (' + e[1] + 'x)'; }).join(', ') + '. ';
        }
        if (sortedCats.length > 0) {
            summaryText += 'Aktiv in Kategorien: ' + sortedCats.slice(0, 3).map(function(e) { return e[0]; }).join(', ') + '.';
        }
        html += '<p class="vita-summary">' + summaryText + '</p>';
        html += '<button class="btn btn-primary btn-sm" onclick="exportAIProfile(' + memberId + ')">🤖 AI-Profil als JSON exportieren</button>';
        html += '</div>';

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>Fehler: ' + escapeHtml(err.message) + '</p></div>';
    }
}

// ─── Connections (Verbindungen) ──────────
async function loadConnections(memberId) {
    var container = $('connections-content');
    if (!container) return;

    try {
        container.innerHTML = '<div class="empty-state"><p>Verbindungen werden berechnet...</p></div>';

        // Load member info
        var mRes = await sb.from('members').select('id, name, skool_username').eq('id', memberId).single();
        var member = mRes.data;

        // Load this member's own posts
        var pRes = await sb.from('posts').select('id, post_title, member_id').eq('member_id', memberId);
        var myPostIds = (pRes.data || []).map(function(p) { return p.id; });

        // 1. WHO COMMENTS ON MY POSTS? (comments by others on this member's posts)
        var commentersOnMyPosts = {};
        if (myPostIds.length > 0) {
            // Supabase .in() has a limit, batch if needed
            var batchSize = 100;
            for (var i = 0; i < myPostIds.length; i += batchSize) {
                var batch = myPostIds.slice(i, i + batchSize);
                var cRes = await sb.from('post_comments')
                    .select('author_name, author_username, member_id, likes')
                    .in('post_id', batch);
                (cRes.data || []).forEach(function(c) {
                    // Skip self-comments
                    if (c.member_id && c.member_id == memberId) return;
                    var key = c.author_username || c.author_name || 'Unbekannt';
                    if (!commentersOnMyPosts[key]) {
                        commentersOnMyPosts[key] = { name: c.author_name || key, username: key, member_id: c.member_id, count: 0, likes: 0 };
                    }
                    commentersOnMyPosts[key].count++;
                    commentersOnMyPosts[key].likes += (c.likes || 0);
                    if (c.member_id && !commentersOnMyPosts[key].member_id) commentersOnMyPosts[key].member_id = c.member_id;
                });
            }
        }

        // 2. WHOSE POSTS DO I COMMENT ON? (my comments on others' posts)
        var myCommentsRes = await sb.from('post_comments')
            .select('post_id, likes, posts(member_id, author_name, author_username)')
            .eq('member_id', memberId);
        var iCommentOn = {};
        (myCommentsRes.data || []).forEach(function(c) {
            var post = c.posts || {};
            // Skip comments on own posts
            if (post.member_id && post.member_id == memberId) return;
            var key = post.author_username || post.author_name || 'Unbekannt';
            if (!iCommentOn[key]) {
                iCommentOn[key] = { name: post.author_name || key, username: key, member_id: post.member_id, count: 0, likes: 0 };
            }
            iCommentOn[key].count++;
            iCommentOn[key].likes += (c.likes || 0);
        });

        // 3. SHARED DISCUSSIONS (other members who commented on the same posts)
        var myCommentedPostIds = [];
        (myCommentsRes.data || []).forEach(function(c) {
            if (c.post_id && myCommentedPostIds.indexOf(c.post_id) === -1) myCommentedPostIds.push(c.post_id);
        });
        var sharedDiscussions = {};
        if (myCommentedPostIds.length > 0) {
            for (var j = 0; j < myCommentedPostIds.length; j += batchSize) {
                var batch2 = myCommentedPostIds.slice(j, j + batchSize);
                var sdRes = await sb.from('post_comments')
                    .select('author_name, author_username, member_id')
                    .in('post_id', batch2);
                (sdRes.data || []).forEach(function(c) {
                    if (c.member_id && c.member_id == memberId) return;
                    var key = c.author_username || c.author_name || 'Unbekannt';
                    if (!sharedDiscussions[key]) {
                        sharedDiscussions[key] = { name: c.author_name || key, username: key, member_id: c.member_id, count: 0 };
                    }
                    sharedDiscussions[key].count++;
                    if (c.member_id && !sharedDiscussions[key].member_id) sharedDiscussions[key].member_id = c.member_id;
                });
            }
        }

        // Sort each list by count descending
        var sortedCommenters = Object.values(commentersOnMyPosts).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);
        var sortedICommentOn = Object.values(iCommentOn).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);
        var sortedShared = Object.values(sharedDiscussions).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

        // Total unique connections
        var allKeys = {};
        Object.keys(commentersOnMyPosts).forEach(function(k) { allKeys[k] = true; });
        Object.keys(iCommentOn).forEach(function(k) { allKeys[k] = true; });
        var totalUniqueConnections = Object.keys(allKeys).length;
        var totalInteractions = sortedCommenters.reduce(function(s, c) { return s + c.count; }, 0) + sortedICommentOn.reduce(function(s, c) { return s + c.count; }, 0);

        // Build HTML
        var html = '';

        // Stats row
        html += '<div class="connections-stats-row">';
        html += '<div class="conn-stat"><div class="conn-stat-number">' + totalUniqueConnections + '</div><div class="conn-stat-label">Verbindungen</div></div>';
        html += '<div class="conn-stat"><div class="conn-stat-number">' + totalInteractions + '</div><div class="conn-stat-label">Interaktionen</div></div>';
        html += '<div class="conn-stat"><div class="conn-stat-number">' + myCommentedPostIds.length + '</div><div class="conn-stat-label">Diskussionen</div></div>';
        html += '</div>';

        // Section 1 — Who comments on my posts
        html += renderConnectionSection(
            '🔵 Kommentieren auf seine Posts',
            'Wer kommentiert am meisten auf Posts von ' + escapeHtml(member.name) + '?',
            sortedCommenters, 'blue'
        );

        // Section 2 — Whose posts I comment on
        html += renderConnectionSection(
            '🟢 Er kommentiert bei',
            'Auf wessen Posts kommentiert ' + escapeHtml(member.name) + ' am meisten?',
            sortedICommentOn, 'green'
        );

        // Section 3 — Shared discussions
        html += renderConnectionSection(
            '🟣 Gemeinsame Diskussionen',
            'Mitglieder, die auf denselben Posts aktiv sind',
            sortedShared, 'purple'
        );

        if (totalUniqueConnections === 0) {
            html = '<div class="connections-empty"><p>Noch keine Verbindungen gefunden. Verbindungen werden aus Kommentaren und Posts berechnet.</p></div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>Fehler: ' + escapeHtml(err.message) + '</p></div>';
    }
}

function renderConnectionSection(title, subtitle, items, color) {
    if (!items || items.length === 0) {
        return '<div class="connections-section"><h4>' + title + '</h4>' +
            '<div class="connections-subtitle">' + subtitle + '</div>' +
            '<div class="connections-empty">Keine Daten vorhanden</div></div>';
    }
    var maxCount = items[0].count || 1;
    var html = '<div class="connections-section">';
    html += '<h4>' + title + '</h4>';
    html += '<div class="connections-subtitle">' + subtitle + '</div>';
    html += '<div class="connection-list">';
    items.forEach(function(item) {
        var pct = Math.round((item.count / maxCount) * 100);
        var clickAttr = item.member_id ? ' onclick="location.hash=\'member/' + item.member_id + '\';"' : '';
        var cursorStyle = item.member_id ? '' : ' style="cursor:default"';
        html += '<div class="connection-item"' + clickAttr + cursorStyle + '>';
        html += '<div class="connection-avatar" style="background:' + avatarColor(item.name) + '">' + initials(item.name) + '</div>';
        html += '<div class="connection-info">';
        html += '<span class="connection-name">' + escapeHtml(item.name) + '</span>';
        var metaParts = [];
        if (item.username && item.username !== item.name) metaParts.push('@' + escapeHtml(item.username));
        if (item.likes > 0) metaParts.push('👍 ' + item.likes + ' Likes');
        if (metaParts.length > 0) html += '<span class="connection-meta">' + metaParts.join(' · ') + '</span>';
        html += '</div>';
        html += '<div class="connection-stats">';
        html += '<div class="connection-bar-track"><div class="connection-bar-fill connection-bar-fill-' + color + '" style="width:' + pct + '%"></div></div>';
        html += '<span class="connection-count">' + item.count + '</span>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div></div>';
    return html;
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
        if (type === 'posts') {
            // Use the Skool import pipeline for posts
            await importSkoolJSON(JSON.stringify(data));
            fileInput.value = '';
            return;
        }
        const { error } = await sb.from('members').insert(Array.isArray(data) ? data : [data]);
        if (error) throw error;
        resultEl.className = 'import-result success';
        resultEl.textContent = `Daten erfolgreich importiert`;
        fileInput.value = '';
    } catch (err) {
        resultEl.className = 'import-result error';
        resultEl.textContent = err.message;
    }
}

// ─── Skool JSON Import Pipeline ──────────
let selectedCommunity = 'free'; // 'free' or 'paid'

async function importSkoolJSON(jsonText) {
    const resultEl = $('import-json-result');
    const progressEl = $('import-json-progress');
    const progressFill = $('import-progress-fill');
    const progressText = $('import-progress-text');
    const logEl = $('import-json-log');

    // Helper: log line
    function log(msg, cls) {
        if (!logEl) return;
        logEl.classList.remove('hidden');
        const line = document.createElement('div');
        line.className = 'log-line ' + (cls || '');
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }

    try {
        // Reset UI
        if (logEl) { logEl.innerHTML = ''; logEl.classList.remove('hidden'); }
        progressEl.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starte Import...';
        resultEl.className = 'import-result';
        resultEl.textContent = '';

        // Parse JSON
        let posts;
        try {
            posts = JSON.parse(jsonText);
        } catch (e) {
            throw new Error('Ungueltiges JSON: ' + e.message);
        }
        if (!Array.isArray(posts)) posts = [posts];
        if (posts.length === 0) throw new Error('Leeres Array — keine Posts gefunden.');

        const communityType = selectedCommunity;
        const membershipType = communityType === 'paid' ? 'monthly_97' : 'free';
        log('Community: ' + (communityType === 'paid' ? '🔵 Bezahlt' : '🟡 Free'), 'log-info');
        log(posts.length + ' Posts gefunden, starte Verarbeitung...', 'log-info');

        const startTime = Date.now();

        // Load existing members + posts for duplicate check
        const { data: existingMembers } = await sb.from('members').select('id, name, skool_username');
        const memberMap = new Map();
        (existingMembers || []).forEach(function (m) {
            if (m.skool_username) memberMap.set(m.skool_username, m);
        });

        const { data: existingPosts } = await sb.from('posts').select('post_url');
        const existingUrls = new Set((existingPosts || []).map(function (p) { return p.post_url; }).filter(Boolean));
        log(memberMap.size + ' bestehende Mitglieder geladen', 'log-info');
        log(existingUrls.size + ' bestehende Post-URLs fuer Duplikat-Check', 'log-info');

        var totalPosts = 0, totalComments = 0, totalNewMembers = 0, totalSkipped = 0;
        var totalSteps = posts.length;

        // Helper: find or create member
        async function findOrCreateMember(authorName, authorUsername) {
            if (!authorUsername) return null;
            if (memberMap.has(authorUsername)) return memberMap.get(authorUsername);
            var memberData = {
                name: authorName || authorUsername,
                skool_username: authorUsername,
                membership_type: membershipType,
                membership_status: 'active',
                activity_status: 'active'
            };
            var result = await sb.from('members').insert(memberData).select('id, name, skool_username').single();
            if (result.error) {
                log('Member-Fehler (' + authorUsername + '): ' + result.error.message, 'log-warn');
                return null;
            }
            memberMap.set(authorUsername, result.data);
            totalNewMembers++;
            return result.data;
        }

        for (var i = 0; i < posts.length; i++) {
            var post = posts[i];
            var pct = Math.round(((i + 1) / totalSteps) * 100);
            progressFill.style.width = pct + '%';
            var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            var perPost = (Date.now() - startTime) / (i + 1);
            var remaining = Math.round((perPost * (totalSteps - i - 1)) / 1000);
            progressText.textContent = 'Post ' + (i + 1) + '/' + totalSteps + ' (' + pct + '%) — ~' + remaining + 's verbleibend';

            // Duplicate check by URL
            if (post.url && existingUrls.has(post.url)) {
                log('⏩ Duplikat uebersprungen: ' + (post.title || post.url).substring(0, 60), 'log-warn');
                totalSkipped++;
                continue;
            }

            // Find/create post author
            var authorUsername = (post.author && post.author.username) || null;
            var authorName = (post.author && post.author.name) || 'Unbekannt';
            var authorProfileUrl = (post.author && post.author.profile_url) || null;
            var member = await findOrCreateMember(authorName, authorUsername);

            // Insert post
            var postRow = {
                member_id: member ? member.id : null,
                post_title: post.title || null,
                post_content: post.content || null,
                post_url: post.url || null,
                likes: post.likes_count || 0,
                comments: post.comments_count || 0,
                author_name: authorName,
                author_username: authorUsername,
                author_profile_url: authorProfileUrl,
                category: post.category || null,
                scraped_at: post.scraped_at || null
            };

            var postResult = await sb.from('posts').insert(postRow).select('id').single();
            if (postResult.error) {
                log('Post-Fehler: ' + postResult.error.message, 'log-err');
                continue;
            }
            totalPosts++;
            if (post.url) existingUrls.add(post.url);
            log('✅ Post: ' + (post.title || 'Ohne Titel').substring(0, 50), 'log-ok');

            // Insert comments
            var comments = post.comments || [];
            if (comments.length > 0) {
                var commentRows = [];
                for (var ci = 0; ci < comments.length; ci++) {
                    var c = comments[ci];
                    var cUsername = (c.author && c.author.username) || null;
                    var cName = (c.author && c.author.name) || 'Unbekannt';
                    var cProfileUrl = (c.author && c.author.profile_url) || null;
                    var cMember = await findOrCreateMember(cName, cUsername);
                    commentRows.push({
                        post_id: postResult.data.id,
                        member_id: cMember ? cMember.id : null,
                        author_name: cName,
                        author_username: cUsername,
                        author_profile_url: cProfileUrl,
                        comment_text: c.text || null,
                        comment_date: c.date || null,
                        likes: c.likes || 0,
                        depth: c.depth || 1,
                        is_reply: c.is_reply || false
                    });
                }

                // Batch insert comments
                for (var j = 0; j < commentRows.length; j += 50) {
                    var batch = commentRows.slice(j, j + 50);
                    var batchResult = await sb.from('post_comments').insert(batch);
                    if (batchResult.error) {
                        log('Kommentar-Fehler: ' + batchResult.error.message, 'log-err');
                    } else {
                        totalComments += batch.length;
                    }
                }
                log('   → ' + comments.length + ' Kommentare importiert', 'log-ok');

                // Timeline entries per unique commenter
                var seenCommenters = {};
                for (var ti = 0; ti < comments.length; ti++) {
                    var tc = comments[ti];
                    var tcUser = (tc.author && tc.author.username) || null;
                    if (!tcUser || seenCommenters[tcUser]) continue;
                    seenCommenters[tcUser] = true;
                    var tcMember = memberMap.get(tcUser);
                    if (!tcMember) continue;
                    var commentCount = comments.filter(function (x) { return x.author && x.author.username === tcUser; }).length;
                    await sb.from('timeline_entries').insert({
                        member_id: tcMember.id,
                        entry_type: 'system',
                        content: 'Hat ' + commentCount + 'x kommentiert in: "' + (post.title || 'Post') + '"',
                        channel: 'skool'
                    });
                }
            }
        }

        var totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        progressFill.style.width = '100%';
        progressText.textContent = 'Fertig! (' + totalElapsed + 's)';
        var summary = totalPosts + ' Posts, ' + totalComments + ' Kommentare importiert. ' + totalNewMembers + ' neue Mitglieder. ' + totalSkipped + ' Duplikate uebersprungen.';
        resultEl.className = 'import-result success';
        resultEl.textContent = summary;
        log('=== FERTIG: ' + summary + ' ===', 'log-ok');
        toast('Import: ' + totalPosts + ' Posts, ' + totalComments + ' Kommentare', 'success');

    } catch (err) {
        resultEl.className = 'import-result error';
        resultEl.textContent = 'FEHLER: ' + err.message;
        log('FEHLER: ' + err.message, 'log-err');
        toast(err.message, 'error');
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
            if (tab.dataset.tab === 'vita' && currentMemberId) {
                loadVita(currentMemberId);
            }
            if (tab.dataset.tab === 'connections' && currentMemberId) {
                loadConnections(currentMemberId);
            }
        });
    });

    // AI Export button
    $('btn-export-ai').addEventListener('click', function() {
        if (currentMemberId) exportAIProfile(currentMemberId);
        else toast('Kein Mitglied ausgewaehlt', 'error');
    });

    // Prev/Next member navigation
    $('btn-prev-member').addEventListener('click', function() { navigateMember(-1); });
    $('btn-next-member').addEventListener('click', function() { navigateMember(1); });

    // Team messages
    $('btn-send-team-msg').addEventListener('click', sendTeamMessage);

    // Import
    $('import-members-drop').addEventListener('click', () => $('import-members-file').click());
    $('import-posts-drop').addEventListener('click', () => $('import-posts-file').click());
    $('import-members-file').addEventListener('change', () => importFile('members'));
    $('import-posts-file').addEventListener('change', () => importFile('posts'));
    $('btn-import-demo').addEventListener('click', loadDemoData);
    $('btn-export-data').addEventListener('click', exportData);

    // Skool JSON paste + community toggle
    $('btn-community-free').addEventListener('click', function () {
        selectedCommunity = 'free';
        $('btn-community-free').classList.add('active');
        $('btn-community-paid').classList.remove('active');
    });
    $('btn-community-paid').addEventListener('click', function () {
        selectedCommunity = 'paid';
        $('btn-community-paid').classList.add('active');
        $('btn-community-free').classList.remove('active');
    });
    $('btn-import-json-paste').addEventListener('click', function () {
        var jsonText = $('import-json-paste').value.trim();
        if (!jsonText) { toast('Bitte JSON einfuegen', 'error'); return; }
        var btn = $('btn-import-json-paste');
        btn.disabled = true;
        btn.textContent = '⏳ Importiere...';
        importSkoolJSON(jsonText).finally(function () {
            btn.disabled = false;
            btn.textContent = '📋 JSON Importieren';
        });
    });
    $('btn-clear-json-paste').addEventListener('click', function () {
        $('import-json-paste').value = '';
        $('import-json-result').textContent = '';
        $('import-json-result').className = 'import-result';
        $('import-json-progress').classList.add('hidden');
        var logEl = $('import-json-log');
        if (logEl) { logEl.innerHTML = ''; logEl.classList.add('hidden'); }
    });

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
