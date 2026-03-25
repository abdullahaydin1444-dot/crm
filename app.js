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
let statusOptions = {};
let audioFileData = null;
let kanbanFilterUser = null;
let sortCol = 'name';
let sortDir = 'asc';
let unreadCount = 0;
let pollTimer = null;
let currentPage = 0;
let pageSize = 50;
let totalMembers = 0;
let selectedMemberIds = new Set();
let kanbanSearchTerm = '';
let kanbanFunnelFilter = '';
let dashboardTimeFilter = 'all';

// ─── Toast ───────────────────────────────
function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    // Remove any existing toast with the exact same message to prevent stacking
    container.querySelectorAll('.toast').forEach(function(t) {
        if (t.textContent === message) t.remove();
    });
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
    const labels = { free: 'Free', monthly_97: 'Monatlich (97€)', monthly_70: 'Monatlich (70€)', monthly_40: 'Monatlich (40€)', yearly_697: 'Jährlich (697€)', yearly_670: 'Jährlich (670€)', yearly_385: 'Jährlich (385€)' };
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
    loadStatusOptions();
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

        // Paginated fetch to bypass 1000-row default limit
        var all = [];
        var offset = 0;
        var batchSize = 1000;
        while (true) {
            var batchRes = await sb.from('members').select('*').range(offset, offset + batchSize - 1);
            if (batchRes.error) throw batchRes.error;
            var batch = batchRes.data || [];
            all = all.concat(batch);
            if (batch.length < batchSize) break;
            offset += batchSize;
        }
        const paying = all.filter(m => m.membership_type && m.membership_type !== 'free');
        const atRisk = all.filter(m => m.activity_status === 'at_risk');
        const revenue = all.reduce((sum, m) => {
            if (m.membership_type === 'monthly_97') return sum + 97;
            if (m.membership_type === 'monthly_70') return sum + 70;
            if (m.membership_type === 'monthly_40') return sum + 40;
            if (m.membership_type === 'yearly_697') return sum + Math.round(697 / 12);
            if (m.membership_type === 'yearly_670') return sum + Math.round(670 / 12);
            if (m.membership_type === 'yearly_385') return sum + Math.round(385 / 12);
            return sum;
        }, 0);

        $('stat-total').textContent = totalCount;
        $('stat-paying').textContent = paying.length;
        $('stat-revenue').textContent = `${revenue.toLocaleString('de-DE')} €`;
        $('stat-atrisk').textContent = atRisk.length;

        // Funnel overview
        // Separate query for accurate funnel counts (not limited by range)
        var funnelRes = await sb.from('members').select('funnel_stage').not('funnel_stage', 'is', null);
        var funnelData = funnelRes.data || [];
        const byFunnel = { free_community: 0, recently_cancelled: 0, long_cancelled: 0 };
        funnelData.forEach(m => { if (byFunnel[m.funnel_stage] !== undefined) byFunnel[m.funnel_stage]++; });
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

        // ── Community Cards: Free vs Premium ──
        var freeMembers = all.filter(m => m.membership_type === 'free' || !m.membership_type);
        var premiumMembers = all.filter(m => m.membership_type && m.membership_type !== 'free');

        // Free community stats
        $('free-members').textContent = freeMembers.length;
        var freeMemberIds = freeMembers.map(m => m.id);
        var freePostCount = 0, freeCommentCount = 0, freeLikeCount = 0;
        freeMembers.forEach(function(m) {
            freePostCount += (m.post_count || 0);
            freeCommentCount += (m.comment_count || 0);
            freeLikeCount += (m.engagement_score || 0);
        });
        $('free-posts').textContent = freePostCount;
        $('free-comments').textContent = freeCommentCount;
        $('free-likes').textContent = freeLikeCount;

        // Free level distribution
        var freeLevels = {};
        freeMembers.forEach(function(m) { var k = levelLabel(m.progress_level || 'beginner'); freeLevels[k] = (freeLevels[k] || 0) + 1; });
        renderBarChart($('chart-level-free'), freeLevels, '#f59e0b');

        // Premium community stats
        $('premium-members').textContent = premiumMembers.length;
        var premPostCount = 0, premCommentCount = 0, premLikeCount = 0;
        premiumMembers.forEach(function(m) {
            premPostCount += (m.post_count || 0);
            premCommentCount += (m.comment_count || 0);
            premLikeCount += (m.engagement_score || 0);
        });
        $('premium-posts').textContent = premPostCount;
        $('premium-comments').textContent = premCommentCount;
        $('premium-likes').textContent = premLikeCount;

        // Premium level distribution
        var premLevels = {};
        premiumMembers.forEach(function(m) { var k = levelLabel(m.progress_level || 'beginner'); premLevels[k] = (premLevels[k] || 0) + 1; });
        if (Object.keys(premLevels).length > 0) {
            renderBarChart($('chart-level-premium'), premLevels, '#3b82f6');
        } else {
            $('chart-level-premium').innerHTML = '<p class="text-muted" style="font-size:0.85rem">Noch keine Daten</p>';
        }

        // ── Trending Topics (from all members' top_topics) ──
        var topicCounts = {};
        all.forEach(function(m) {
            if (m.top_topics && m.top_topics.length > 0) {
                m.top_topics.forEach(function(t) {
                    topicCounts[t] = (topicCounts[t] || 0) + 1;
                });
            }
        });
        if (Object.keys(topicCounts).length > 0) {
            // Sort and take top 10
            var sortedTrending = Object.entries(topicCounts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
            var trendObj = {};
            sortedTrending.forEach(function(t) { trendObj[t[0]] = t[1]; });
            renderBarChart($('chart-trending-topics'), trendObj, '#f59e0b');
        } else {
            $('chart-trending-topics').innerHTML = '<p class="text-muted" style="font-size:0.85rem">Themen werden beim Besuch der Mitglieder-Vita berechnet</p>';
        }

        // ── Engagement Distribution ──
        var engDist = { '🔥 Expert (50+)': 0, '⚡ Fortgeschritten (20-49)': 0, '✨ Intermediate (5-19)': 0, '💤 Anfänger (0-4)': 0 };
        all.forEach(function(m) {
            var s = m.engagement_score || 0;
            if (s >= 50) engDist['🔥 Expert (50+)']++;
            else if (s >= 20) engDist['⚡ Fortgeschritten (20-49)']++;
            else if (s >= 5) engDist['✨ Intermediate (5-19)']++;
            else engDist['💤 Anfänger (0-4)']++;
        });
        renderBarChart($('chart-engagement-dist'), engDist, '#8b5cf6');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function getTimeFilterDate() {
    var now = new Date();
    switch (dashboardTimeFilter) {
        case 'week': now.setDate(now.getDate() - 7); return now.toISOString();
        case 'month': now.setMonth(now.getMonth() - 1); return now.toISOString();
        case '30days': now.setDate(now.getDate() - 30); return now.toISOString();
        default: return null;
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
        // Try crm_tasks first, fallback to member-based tasks
        var { data: tasks, error: tErr } = await sb.from('crm_tasks').select('*, member:member_id(name)').eq('assigned_to', currentUser.id).eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }).limit(10);
        if (tErr) {
            // crm_tasks table may not exist yet, fallback
            var { data, error } = await sb.from('members').select('id, name, activity_status, membership_type, funnel_stage').eq('assigned_to', currentUser.id).in('activity_status', ['at_risk', 'inactive']).order('name').limit(8);
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
            return;
        }
        if (!tasks || tasks.length === 0) {
            tasksEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Keine offenen Aufgaben</p>';
            return;
        }
        tasksEl.innerHTML = tasks.map(function(t) {
            var memberLink = t.member && t.member.name ? '<span class="task-meta">' + escapeHtml(t.member.name) + '</span>' : '';
            var dueMeta = t.due_date ? formatDate(t.due_date) : 'Kein Fälligkeitsdatum';
            return '<div class="task-item">' +
                '<input type="checkbox" onclick="event.stopPropagation();completeTask(' + t.id + ')" style="margin-right:8px;cursor:pointer">' +
                '<div class="task-info">' +
                '<div class="task-name">' + escapeHtml(t.title) + '</div>' +
                '<div class="task-meta">' + dueMeta + (memberLink ? ' · ' + memberLink : '') + '</div>' +
                '</div></div>';
        }).join('');
    } catch { tasksEl.innerHTML = '<p class="text-muted" style="padding:12px;font-size:0.85rem">Fehler beim Laden</p>'; }
}

async function completeTask(taskId) {
    try {
        var { error } = await sb.from('crm_tasks').update({ status: 'done' }).eq('id', taskId);
        if (error) throw error;
        toast('Aufgabe erledigt', 'success');
        loadMyTasks();
    } catch (err) { toast(err.message, 'error'); }
}

function openCreateTaskModal() {
    var memberOptions = allMembers.length > 0
        ? '<option value="">\u2014 Kein Mitglied \u2014</option>' + allMembers.map(function(m) { return '<option value="' + m.id + '">' + escapeHtml(m.name) + '</option>'; }).join('')
        : '<option value="">\u2014 Kein Mitglied \u2014</option>';
    var assignOptions = allUsers.map(function(u) { return '<option value="' + u.id + '"' + (u.id === currentUser.id ? ' selected' : '') + '>' + escapeHtml(u.display_name) + '</option>'; }).join('');
    var body = '<div class="form-group"><label>Titel</label><input type="text" id="task-title" placeholder="Aufgabe beschreiben..."></div>' +
        '<div class="form-group"><label>Beschreibung (optional)</label><textarea id="task-desc" rows="3" placeholder="Details..."></textarea></div>' +
        '<div class="form-row"><div class="form-group"><label>Fälligkeitsdatum</label><input type="date" id="task-due"></div>' +
        '<div class="form-group"><label>Zugewiesen an</label><select id="task-assigned" class="filter-select">' + assignOptions + '</select></div></div>' +
        '<div class="form-group"><label>Mitglied-Bezug (optional)</label><select id="task-member" class="filter-select">' + memberOptions + '</select></div>';
    openModal('Aufgabe erstellen', body, '<button class="btn btn-primary" onclick="createTask()">Erstellen</button>');
}

async function createTask() {
    var title = $('task-title').value.trim();
    if (!title) { toast('Bitte einen Titel eingeben', 'error'); return; }
    try {
        var { error } = await sb.from('crm_tasks').insert({
            title: title,
            description: $('task-desc').value.trim() || null,
            due_date: $('task-due').value || null,
            assigned_to: parseInt($('task-assigned').value),
            member_id: $('task-member').value ? parseInt($('task-member').value) : null,
            created_by: currentUser.id,
            status: 'open'
        });
        if (error) throw error;
        toast('Aufgabe erstellt', 'success');
        closeModal();
        loadMyTasks();
    } catch (err) { toast(err.message, 'error'); }
}

async function loadActivityFeed() {
    const feedEl = $('activity-feed');
    try {
        var query = sb.from('timeline_entries').select('*, member:members(name)').order('created_at', { ascending: false }).limit(10);
        var dateFrom = getTimeFilterDate();
        if (dateFrom) query = query.gte('created_at', dateFrom);
        const { data: entries, error } = await query;
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

function engagementBadge(score) {
    score = score || 0;
    if (score >= 50) return '<span class="badge badge-green" title="Posts: ' + score + '">🔥 ' + score + '</span>';
    if (score >= 20) return '<span class="badge badge-blue" title="Score: ' + score + '">⚡ ' + score + '</span>';
    if (score >= 5) return '<span class="badge badge-yellow" title="Score: ' + score + '">✨ ' + score + '</span>';
    return '<span class="badge badge-gray" title="Score: ' + score + '">💤 ' + score + '</span>';
}

// ─── Members ─────────────────────────────
async function loadMembers() {
    try {
        const search = $('member-search').value.trim();
        const status = $('filter-status').value;
        const membership = $('filter-membership').value;
        const level = $('filter-level').value;

        // Count query for pagination
        let countQuery = sb.from('members').select('*', { count: 'exact', head: true });
        if (search) countQuery = countQuery.or(`name.ilike.%${search}%,skool_username.ilike.%${search}%`);
        if (status) countQuery = countQuery.eq('activity_status', status);
        if (membership) countQuery = countQuery.eq('membership_type', membership);
        if (level) countQuery = countQuery.eq('progress_level', level);
        const { count } = await countQuery;
        totalMembers = count || 0;

        // Ensure page is within bounds
        var totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
        if (currentPage >= totalPages) currentPage = totalPages - 1;
        if (currentPage < 0) currentPage = 0;

        let query = sb.from('members').select('*');
        if (search) query = query.or(`name.ilike.%${search}%,skool_username.ilike.%${search}%`);
        if (status) query = query.eq('activity_status', status);
        if (membership) query = query.eq('membership_type', membership);
        if (level) query = query.eq('progress_level', level);
        query = query.order(sortCol, { ascending: sortDir === 'asc' }).range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

        const { data, error } = await query;
        if (error) throw error;
        allMembers = data || [];
        renderMembersTable(allMembers);
        renderPagination();
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
            <td class="bulk-check-cell" onclick="event.stopPropagation()">
                <input type="checkbox" class="bulk-check" data-id="${m.id}" ${selectedMemberIds.has(m.id) ? 'checked' : ''} onchange="toggleBulkSelect(${m.id}, this.checked)">
            </td>
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
            <td>${engagementBadge(m.engagement_score)}</td>
            <td>${escapeHtml(m.city || '—')}</td>
            <td>${m.funnel_stage ? `<span class="badge badge-blue">${funnelLabel(m.funnel_stage)}</span>` : '—'}</td>
            <td>${escapeHtml(m.assigned_name || '—')}</td>
            <td>${formatDate(m.last_active)}</td>
        </tr>
    `).join('');
    updateBulkBar();
}

// ─── Bulk Actions ────────────────────────
function toggleBulkSelect(id, checked) {
    if (checked) selectedMemberIds.add(id);
    else selectedMemberIds.delete(id);
    updateBulkBar();
}

function toggleBulkAll() {
    var checkAll = $('bulk-check-all');
    if (!checkAll) return;
    var checks = qsa('.bulk-check');
    checks.forEach(function(c) {
        var id = parseInt(c.dataset.id);
        if (checkAll.checked) selectedMemberIds.add(id);
        else selectedMemberIds.delete(id);
        c.checked = checkAll.checked;
    });
    updateBulkBar();
}

function updateBulkBar() {
    var bar = $('bulk-action-bar');
    if (!bar) return;
    if (selectedMemberIds.size > 0) {
        bar.classList.remove('hidden');
        $('bulk-count').textContent = selectedMemberIds.size + ' ausgewählt';
    } else {
        bar.classList.add('hidden');
    }
}

async function bulkUpdateField(field) {
    if (selectedMemberIds.size === 0) return;
    var selectEl = $('bulk-' + field);
    if (!selectEl) return;
    var value = selectEl.value;
    if (!value) { toast('Bitte einen Wert auswählen', 'error'); return; }
    try {
        var ids = Array.from(selectedMemberIds);
        var updates = {};
        updates[field] = value === '__none__' ? null : value;
        var { error } = await sb.from('members').update(updates).in('id', ids);
        if (error) throw error;
        toast(ids.length + ' Mitglieder aktualisiert', 'success');
        selectedMemberIds.clear();
        loadMembers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderPagination() {
    var container = $('members-pagination');
    if (!container) return;
    var totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
    if (totalMembers <= pageSize) {
        container.innerHTML = '<span class="pagination-info">' + totalMembers + ' Mitglieder</span>';
        return;
    }
    var html = '<div class="pagination-bar">';
    html += '<button class="btn btn-secondary btn-sm" onclick="goToPage(' + (currentPage - 1) + ')"' + (currentPage === 0 ? ' disabled' : '') + '>\u25C0 Zur\u00fcck</button>';
    html += '<span class="pagination-info">Seite ' + (currentPage + 1) + ' von ' + totalPages + ' (' + totalMembers + ' Mitglieder)</span>';
    html += '<button class="btn btn-secondary btn-sm" onclick="goToPage(' + (currentPage + 1) + ')"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Weiter \u25B6</button>';
    html += '</div>';
    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    loadMembers();
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
        // Cache member IDs for prev/next navigation (paginated to bypass 1000-row default)
        if (cachedMemberIds.length === 0) {
            var allIds = [];
            var offset = 0;
            var batchSize = 1000;
            while (true) {
                var idRes = await sb.from('members').select('id').order('name').range(offset, offset + batchSize - 1);
                var batch = idRes.data || [];
                batch.forEach(function(m) { allIds.push(m.id); });
                if (batch.length < batchSize) break;
                offset += batchSize;
            }
            cachedMemberIds = allIds;
        }
        renderMemberDetail(member);
        window.currentViewingMemberName = member.name;
        renderMemberNav();
        loadTimeline(id);
        // Auto-load Vita since it's the default tab
        loadVita(id);
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

    // Build dynamic selectors from statusOptions
    var funnelOptions = buildSelectOptions('funnel_stage', m.funnel_stage, '— Kein Funnel —');
    var acqOptions = buildSelectOptions('acquisition_status', m.acquisition_status, '— Kein Status —');
    var activityOptions = buildSelectOptions('activity_status', m.activity_status, '— Kein Status —');
    var levelOptions = buildSelectOptions('progress_level', m.progress_level, '— Kein Level —');
    var assignedOptions = '<option value="">— Niemand —</option>' +
        allUsers.map(function(u) { return '<option value="' + u.id + '"' + (m.assigned_to == u.id ? ' selected' : '') + '>' + escapeHtml(u.display_name) + '</option>'; }).join('');

    // Fields (removed Mitgliedschaft - now shown at top)
    $('detail-fields').innerHTML =
        '<div class="field-row"><span class="field-label">Status</span><span class="field-value">' + escapeHtml(m.membership_status || '—') + '</span></div>' +
        '<div class="field-row"><span class="field-label">Aktivität</span><span class="field-value"><select onchange="updateMemberField(' + m.id + ',\'activity_status\',this.value)">' + activityOptions + '</select></span></div>' +
        '<div class="field-row"><span class="field-label">Level</span><span class="field-value"><select onchange="updateMemberField(' + m.id + ',\'progress_level\',this.value)">' + levelOptions + '</select></span></div>' +
        '<div class="field-row"><span class="field-label">Stadt</span><span class="field-value">' + escapeHtml(m.city || '—') + '</span></div>' +
        '<div class="field-row"><span class="field-label">Land</span><span class="field-value">' + escapeHtml(m.country || '—') + '</span></div>' +
        '<div class="field-row"><span class="field-label">Beitritt</span><span class="field-value">' + formatDate(m.join_date) + '</span></div>' +
        '<div class="field-row"><span class="field-label">Verlängerung</span><span class="field-value">' + formatDate(m.renewal_date) + '</span></div>' +
        '<div class="field-row"><span class="field-label">Letzte Aktivität</span><span class="field-value">' + formatDate(m.last_active) + '</span></div>' +
        '<div class="field-row"><span class="field-label">Quelle</span><span class="field-value">' + escapeHtml(m.join_source || '—') + '</span></div>' +
        '<div class="field-row"><span class="field-label">Funnel-Stufe</span><span class="field-value"><select onchange="updateMemberField(' + m.id + ',\'funnel_stage\',this.value)">' + funnelOptions + '</select></span></div>' +
        '<div class="field-row"><span class="field-label">Zuständig</span><span class="field-value"><select onchange="updateMemberField(' + m.id + ',\'assigned_to\',this.value)">' + assignedOptions + '</select></span></div>' +
        '<div class="field-row"><span class="field-label">Akquise-Status</span><span class="field-value"><select onchange="updateMemberField(' + m.id + ',\'acquisition_status\',this.value)" class="acq-status-select">' + acqOptions + '</select></span></div>';


    // Labels
    if (m.custom_labels && m.custom_labels.length > 0) {
        const labelsHtml = m.custom_labels.map(l => `<span class="badge badge-blue">${escapeHtml(l)}</span>`).join(' ');
        $('detail-fields').innerHTML += `<div class="field-row"><span class="field-label">Labels</span><span class="field-value">${labelsHtml}</span></div>`;
    }

    // Posts
    renderPosts(m.posts || []);

    // Notes — editable textarea
    $('notes-content').innerHTML =
        '<div class="notes-edit-area" style="padding:16px">' +
        '<textarea id="notes-textarea" rows="8" placeholder="Notizen hier eingeben..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-tertiary);color:var(--text-primary);font-family:var(--font-body);font-size:0.85rem;resize:vertical">' + escapeHtml(m.notes || '') + '</textarea>' +
        '<button class="btn btn-primary btn-sm" onclick="saveNotes()" style="margin-top:8px">\uD83D\uDCBE Notizen speichern</button>' +
        '</div>';

    // Reset tab to vita (default view)
    qsa('.panel-tab').forEach(t => t.classList.remove('active'));
    qsa('.panel-content').forEach(c => c.classList.remove('active'));
    qs('.panel-tab[data-tab="vita"]').classList.add('active');
    $('tab-vita').classList.add('active');
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

// ─── Notes ───────────────────────────────
async function saveNotes() {
    if (!currentMemberId) return;
    try {
        var notes = $('notes-textarea').value;
        var result = await sb.from('members').update({ notes: notes || null }).eq('id', currentMemberId);
        if (result.error) throw result.error;
        toast('Notizen gespeichert', 'success');
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
            var pid = c.post_id || (c.posts && c.posts.id) || null;
            if (c.comment_text) textItems.push({ text: c.comment_text, label: 'Kommentar', context: (c.posts && c.posts.post_title) ? 'auf "' + c.posts.post_title + '"' : '', postId: pid });
            if (c.posts && c.posts.post_content) textItems.push({ text: c.posts.post_content, label: 'Post-Inhalt', context: c.posts.post_title || '', postId: pid });
        });
        posts.forEach(function(p) {
            if (p.post_title) textItems.push({ text: p.post_title, label: 'Eigener Post', context: '', postId: p.id });
            if (p.post_content) textItems.push({ text: p.post_content, label: 'Eigener Post-Inhalt', context: p.post_title || '', postId: p.id });
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
                        sources.push({ label: item.label, context: item.context, snippet: snippet, keyword: kw, fullText: item.text, postId: item.postId });
                    }
                });
            });
            if (score > 0) {
                topicScores[topic] = score;
                // Deduplicate sources by label + keyword + context (not snippet)
                var seen = {};
                topicSources[topic] = sources.filter(function(s) {
                    var key = s.label + '|' + s.keyword + '|' + s.context;
                    if (seen[key]) return false;
                    seen[key] = true;
                    return true;
                }); // show ALL unique sources per topic
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

        // Stats Grid (5 stats)
        html += '<div class="vita-stats-grid">';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalPosts + '</div><div class="vita-stat-label">Eigene Posts</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalComments + '</div><div class="vita-stat-label">Kommentare</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalLikesReceived + '</div><div class="vita-stat-label">Likes erhalten</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number">' + totalLikesGiven + '</div><div class="vita-stat-label">Likes verteilt</div></div>';
        html += '<div class="vita-stat"><div class="vita-stat-number" style="color:' + engColor + '">' + engLevel + '</div><div class="vita-stat-label">Engagement</div></div>';
        html += '</div>';

        // ── TOP 3 INTERESSEN (prominent card) ──
        var topicEmojis = { 'Datenschutz & DSGVO': '🔒', 'KI & Automatisierung': '🤖', 'Marketing & Vertrieb': '📈', 'Social Media': '📱', 'Technik & Entwicklung': '💻', 'Business & Strategie': '🎯', 'Community & Networking': '🤝', 'E-Mail & Newsletter': '📧', 'SEO & Website': '🔍', 'Finanzen & Investition': '💰', 'Coaching & Beratung': '🎓', 'Mindset & Motivation': '🧠', 'Design & Kreativitaet': '🎨', 'Tools & Software': '🛠️', 'Freelancing & Agentur': '💼' };
        var top3 = sortedTopics.slice(0, 3);
        if (top3.length > 0) {
            html += '<div class="vita-card vita-top-interests">';
            html += '<h4>⭐ Top Interessen</h4>';
            html += '<div class="vita-top-interests-grid">';
            top3.forEach(function(entry, i) {
                var emoji = topicEmojis[entry[0]] || '📌';
                var rank = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                html += '<div class="vita-top-interest-item">';
                html += '<span class="vita-top-rank">' + rank + '</span>';
                html += '<span class="vita-top-emoji">' + emoji + '</span>';
                html += '<div class="vita-top-info"><span class="vita-top-name">' + escapeHtml(entry[0]) + '</span><span class="vita-top-count">' + entry[1] + ' Erwähnungen</span></div>';
                html += '</div>';
            });
            html += '</div></div>';

            // Save top 3 topics to DB (async, fire-and-forget)
            var topTopicNames = top3.map(function(t) { return t[0]; });
            sb.from('members').update({ top_topics: topTopicNames }).eq('id', memberId).then(function() {});
        }

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
                    // Store sources in global cache for popup access
                    if (!window.vitaSourceCache) window.vitaSourceCache = {};
                    sources.forEach(function(s, sIdx) {
                        var cacheKey = 'src_' + idx + '_' + sIdx;
                        window.vitaSourceCache[cacheKey] = s;
                        html += '<div class="vita-source-item vita-source-clickable" onclick="showSourcePopup(\'' + cacheKey + '\')">';
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
        // Populate team member dropdown
        if (allUsers.length === 0) await loadUsers();
        const teamSelect = $('kanban-team-filter');
        if (teamSelect) {
            const isAdmin = currentUser && currentUser.role === 'admin';
            let optionsHtml = '<option value="">Alle</option>';
            if (isAdmin) {
                // Admin sees all team members
                allUsers.forEach(function(u) {
                    optionsHtml += '<option value="' + u.id + '"' + (kanbanFilterUser == u.id ? ' selected' : '') + '>' + escapeHtml(u.display_name) + '</option>';
                });
            } else {
                // Regular member sees only themselves (pre-selected)
                optionsHtml = '<option value="' + currentUser.id + '" selected>' + escapeHtml(currentUser.display_name) + '</option>';
                kanbanFilterUser = String(currentUser.id);
            }
            teamSelect.innerHTML = optionsHtml;
        }

        // Populate funnel filter dropdown dynamically
        var funnelSelect = $('kanban-funnel-filter');
        if (funnelSelect) {
            var funnelOpts = getOptionsForCategory('funnel_stage');
            var fHTML = '<option value="">Alle Stufen</option>';
            funnelOpts.forEach(function(o) {
                fHTML += '<option value="' + escapeHtml(o.value) + '"' + (kanbanFunnelFilter === o.value ? ' selected' : '') + '>' + o.emoji + ' ' + escapeHtml(o.label) + '</option>';
            });
            funnelSelect.innerHTML = fHTML;
        }

        // Query members — filter by assigned_to if a team member is selected
        let query = sb.from('members').select('*');
        if (kanbanFilterUser) query = query.eq('assigned_to', kanbanFilterUser);
        if (kanbanSearchTerm) query = query.ilike('name', '%' + kanbanSearchTerm + '%');
        if (kanbanFunnelFilter) query = query.eq('funnel_stage', kanbanFunnelFilter);
        const { data: members, error } = await query;
        if (error) throw error;
        const all = members || [];

        // Group by acquisition_status
        const grouped = { hot_lead: [], in_progress: [], no_interest: [], none: [] };
        all.forEach(function(m) {
            if (m.acquisition_status === 'hot_lead') grouped.hot_lead.push(m);
            else if (m.acquisition_status === 'in_progress') grouped.in_progress.push(m);
            else if (m.acquisition_status === 'no_interest') grouped.no_interest.push(m);
            else grouped.none.push(m);
        });

        renderKanbanColumn('kanban-hot', grouped.hot_lead, 'kanban-count-hot');
        renderKanbanColumn('kanban-progress', grouped.in_progress, 'kanban-count-progress');
        renderKanbanColumn('kanban-noint', grouped.no_interest, 'kanban-count-noint');
        renderKanbanColumn('kanban-none', grouped.none, 'kanban-count-none');

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

    container.innerHTML = members.map(function(m) {
        var acqLabel = '';
        if (m.acquisition_status === 'hot_lead') acqLabel = '🔥 Heißer Lead';
        else if (m.acquisition_status === 'in_progress') acqLabel = '🟡 In Bearbeitung';
        else if (m.acquisition_status === 'no_interest') acqLabel = '❌ Kein Interesse';

        return '<div class="kanban-card" draggable="true" data-member-id="' + m.id + '">' +
            '<div class="kanban-card-header">' +
                '<div class="kanban-card-avatar" style="background:' + avatarColor(m.name) + '">' + initials(m.name) + '</div>' +
                '<div class="kanban-card-name">' + escapeHtml(m.name) + '</div>' +
            '</div>' +
            '<div class="kanban-card-details">' +
                membershipBadge(m.membership_type) +
                statusBadge(m.activity_status) +
            '</div>' +
            '<div class="kanban-card-footer">' +
                '<span>' + escapeHtml(m.assigned_name || 'Nicht zugewiesen') + '</span>' +
            '</div>' +
        '</div>';
    }).join('');
}

function setupDragAndDrop() {
    // Cards are re-created each render, so fresh listeners are fine
    var cards = qsa('.kanban-card');
    cards.forEach(function(card) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', function(e) {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.memberId);
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', function() {
            card.classList.remove('dragging');
            qsa('.kanban-cards').forEach(function(c) { c.classList.remove('drag-over'); });
        });
        card.addEventListener('click', function(e) {
            if (!e.target.closest('.kanban-card-avatar')) {
                location.hash = 'member/' + card.dataset.memberId;
            }
        });
    });

    // Column listeners: use event delegation on the board, set up ONCE
    if (window._kanbanDelegationReady) return;
    window._kanbanDelegationReady = true;

    var board = $('kanban-board');
    if (!board) return;

    board.addEventListener('dragover', function(e) {
        var col = e.target.closest('.kanban-cards');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
    });

    board.addEventListener('dragleave', function(e) {
        var col = e.target.closest('.kanban-cards');
        if (!col) return;
        if (!col.contains(e.relatedTarget)) {
            col.classList.remove('drag-over');
        }
    });

    // Track which member is currently being processed to prevent ALL duplicates
    var processingMemberId = null;
    board.addEventListener('drop', async function(e) {
        var col = e.target.closest('.kanban-cards');
        if (!col) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        col.classList.remove('drag-over');

        var memberId = e.dataTransfer.getData('text/plain');
        var newAcqStatus = col.dataset.acqStatus;
        if (!memberId) return;

        // Hard lock: skip if we're already processing ANY drop
        if (processingMemberId) return;
        processingMemberId = memberId;

        try {
            await sb.from('members').update({ acquisition_status: newAcqStatus || null }).eq('id', memberId);
            toast('Akquise-Status aktualisiert', 'success');
            await loadKanban();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            // Small delay before clearing lock to prevent any lingering events
            setTimeout(function() { processingMemberId = null; }, 200);
        }
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
        const { data: rawMsgs, error } = await sb.from('team_messages')
            .select('*, from_user:from_user_id(display_name), to_user:to_user_id(display_name), member:member_id(name)')
            .or('from_user_id.eq.' + currentUser.id + ',to_user_id.eq.' + currentUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        const msgs = (rawMsgs || []).map(function(m) {
            return Object.assign({}, m, {
                from_name: (m.from_user && m.from_user.display_name) || 'Unbekannt',
                to_name: (m.to_user && m.to_user.display_name) || 'Unbekannt',
                member_name: m.member ? m.member.name : null
            });
        });
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

    // Show/hide Status-Optionen tab based on admin
    var statusTab = $('settings-tab-status');
    if (statusTab) statusTab.style.display = isAdmin ? '' : 'none';
}

// ─── Settings Tabs ────────────────────────
function switchSettingsTab(tabName) {
    var tabs = document.querySelectorAll('.settings-tab');
    var contents = document.querySelectorAll('.settings-tab-content');
    tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.settingsTab === tabName); });
    contents.forEach(function(c) { c.classList.toggle('active', c.id === 'settings-content-' + tabName); });
    if (tabName === 'status-options') renderStatusSettings();
}

// ─── Status Options ──────────────────────
async function loadStatusOptions() {
    try {
        var res = await sb.from('status_options').select('*').eq('is_active', true).order('position');
        if (res.error) throw res.error;
        statusOptions = {};
        (res.data || []).forEach(function(o) {
            if (!statusOptions[o.category]) statusOptions[o.category] = [];
            statusOptions[o.category].push(o);
        });
    } catch (err) {
        console.error('loadStatusOptions:', err.message);
    }
}

function getOptionsForCategory(category) {
    return statusOptions[category] || [];
}

function buildSelectOptions(category, selectedValue, emptyLabel) {
    var opts = getOptionsForCategory(category);
    var html = '<option value=""' + (!selectedValue ? ' selected' : '') + '>' + escapeHtml(emptyLabel || '— Keine —') + '</option>';
    opts.forEach(function(o) {
        html += '<option value="' + escapeHtml(o.value) + '"' + (selectedValue === o.value ? ' selected' : '') + '>' + o.emoji + ' ' + escapeHtml(o.label) + '</option>';
    });
    return html;
}

var STATUS_CATEGORY_LABELS = {
    funnel_stage: '📊 Funnel-Stufe',
    acquisition_status: '🎯 Akquise-Status',
    activity_status: '📍 Aktivität',
    progress_level: '📈 Level',
    membership_type: '💳 Mitgliedschaft'
};

function renderStatusSettings() {
    var container = $('status-options-container');
    if (!container) return;
    var categories = ['funnel_stage', 'acquisition_status', 'activity_status', 'progress_level', 'membership_type'];
    var html = '<p class="text-muted" style="margin-bottom:16px">Status-Werte verwalten — Reihenfolge ändern, neue hinzufügen oder bestehende löschen.</p>';

    categories.forEach(function(cat) {
        var catLabel = STATUS_CATEGORY_LABELS[cat] || cat;
        var opts = getOptionsForCategory(cat);
        html += '<div class="status-category-section">';
        html += '<div class="status-category-header">';
        html += '<h4>' + catLabel + '</h4>';
        html += '<span class="badge badge-gray">' + opts.length + ' Optionen</span>';
        html += '</div>';
        html += '<div class="status-options-list" id="status-list-' + cat + '">';
        opts.forEach(function(o, idx) {
            html += '<div class="status-option-item" data-id="' + o.id + '">';
            html += '<span class="status-option-emoji">' + (o.emoji || '') + '</span>';
            html += '<span class="status-option-label">' + escapeHtml(o.label) + '</span>';
            html += '<span class="status-option-value text-muted">' + escapeHtml(o.value) + '</span>';
            html += '<div class="status-option-actions">';
            html += '<button class="btn-icon" onclick="moveStatusOption(' + o.id + ',-1,\'' + cat + '\')" title="Nach oben"' + (idx === 0 ? ' disabled' : '') + '>▲</button>';
            html += '<button class="btn-icon" onclick="moveStatusOption(' + o.id + ',1,\'' + cat + '\')" title="Nach unten"' + (idx === opts.length - 1 ? ' disabled' : '') + '>▼</button>';
            html += '<button class="btn-icon" onclick="deleteStatusOption(' + o.id + ',\'' + cat + '\')" title="Löschen" style="color:var(--accent-red)">✕</button>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
        // Add new form
        html += '<div class="status-add-row">';
        html += '<input type="text" id="new-emoji-' + cat + '" placeholder="Emoji" class="status-add-emoji" maxlength="4">';
        html += '<input type="text" id="new-label-' + cat + '" placeholder="Anzeigename" class="status-add-label">';
        html += '<input type="text" id="new-value-' + cat + '" placeholder="DB-Wert (z.B. new_status)" class="status-add-value">';
        html += '<button class="btn btn-primary btn-sm" onclick="addStatusOption(\'' + cat + '\')">+ Hinzufügen</button>';
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

async function addStatusOption(category) {
    var emoji = $('new-emoji-' + category).value.trim();
    var label = $('new-label-' + category).value.trim();
    var value = $('new-value-' + category).value.trim();
    if (!label || !value) { toast('Label und DB-Wert sind Pflichtfelder', 'error'); return; }
    // Determine next position
    var opts = getOptionsForCategory(category);
    var nextPos = opts.length > 0 ? opts[opts.length - 1].position + 1 : 1;
    try {
        var res = await sb.from('status_options').insert({ category: category, value: value, label: label, emoji: emoji, position: nextPos });
        if (res.error) throw res.error;
        toast('Option hinzugefügt', 'success');
        await loadStatusOptions();
        renderStatusSettings();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteStatusOption(id, category) {
    if (!confirm('Diese Status-Option wirklich löschen?')) return;
    try {
        var res = await sb.from('status_options').delete().eq('id', id);
        if (res.error) throw res.error;
        toast('Option gelöscht', 'success');
        await loadStatusOptions();
        renderStatusSettings();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function moveStatusOption(id, direction, category) {
    var opts = getOptionsForCategory(category);
    var idx = opts.findIndex(function(o) { return o.id === id; });
    if (idx === -1) return;
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= opts.length) return;

    // Swap positions
    var posA = opts[idx].position;
    var posB = opts[swapIdx].position;
    try {
        await sb.from('status_options').update({ position: posB }).eq('id', opts[idx].id);
        await sb.from('status_options').update({ position: posA }).eq('id', opts[swapIdx].id);
        await loadStatusOptions();
        renderStatusSettings();
    } catch (err) {
        toast(err.message, 'error');
    }
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
    // Bug 5: Prevent deleting the last admin
    var targetUser = allUsers.find(function(u) { return u.id === id; });
    if (targetUser && targetUser.role === 'admin') {
        var activeAdmins = allUsers.filter(function(u) { return u.role === 'admin' && u.is_active !== false; });
        if (activeAdmins.length <= 1) {
            toast('Der letzte Admin kann nicht gelöscht werden', 'error');
            return;
        }
    }
    if (!confirm('Benutzer wirklich deaktivieren?')) return;
    try {
        const { error } = await sb.from('crm_users').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        toast('Benutzer deaktiviert', 'success');
        await loadUsers();
        loadSettings();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── Modals ──────────────────────────────
// ─── Source Popup (Skool-Style) ──────────
async function showSourcePopup(cacheKey) {
    var s = window.vitaSourceCache && window.vitaSourceCache[cacheKey];
    if (!s) return;
    var memberName = window.currentViewingMemberName || '';
    
    // If we have a postId, fetch the full post + comments
    if (s.postId) {
        openModal('Lade Beitrag...', '<div class="empty-state"><p>\u23f3 Wird geladen...</p></div>', '');
        try {
            var postRes = await sb.from('posts').select('*').eq('id', s.postId).single();
            var post = postRes.data;
            if (!post) { fallbackSourcePopup(s); return; }
            
            var commRes = await sb.from('post_comments').select('*').eq('post_id', s.postId).order('created_at', { ascending: true });
            var allComments = commRes.data || [];
            
            renderSkoolPostPopup(post, allComments, s.keyword, memberName);
        } catch(e) {
            fallbackSourcePopup(s);
        }
    } else {
        fallbackSourcePopup(s);
    }
}

function fallbackSourcePopup(s) {
    var fullText = s.fullText || s.snippet;
    var kw = s.keyword || '';
    var body = '<div style="max-height:60vh;overflow-y:auto;padding:4px">';
    if (kw) {
        var regex = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        body += '<div style="font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word">' + escapeHtml(fullText).replace(regex, '<mark style="background:#f59e0b;color:#000;padding:1px 2px;border-radius:2px">$1</mark>') + '</div>';
    } else {
        body += '<div style="font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word">' + escapeHtml(fullText) + '</div>';
    }
    body += '</div>';
    openModal(s.label + (s.context ? ' \u2014 ' + s.context : ''), body, '<button class="btn btn-secondary" onclick="closeModal()">Schlie\u00dfen</button>');
}

function renderSkoolPostPopup(post, comments, keyword, memberName) {
    var kw = keyword || '';
    var highlightText = function(text) {
        var escaped = escapeHtml(text || '');
        if (kw) {
            var regex = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            return escaped.replace(regex, '<mark style="background:#f59e0b;color:#000;padding:1px 3px;border-radius:2px">$1</mark>');
        }
        return escaped;
    };
    
    var body = '<div class="skool-post-popup">';
    
    // Post Card
    body += '<div class="skool-post-card">';
    // Author header
    body += '<div class="skool-post-header">';
    body += '<div class="skool-post-avatar" style="background:' + avatarColor(post.author_name || 'A') + '">' + initials(post.author_name || 'A') + '</div>';
    body += '<div class="skool-post-author">';
    body += '<div class="skool-post-author-name">' + escapeHtml(post.author_name || 'Unbekannt') + '</div>';
    body += '<div class="skool-post-meta">';
    if (post.category) body += '<span class="skool-post-category">' + escapeHtml(post.category) + '</span>';
    if (post.posted_at) body += '<span>' + formatDate(post.posted_at) + '</span>';
    body += '</div></div></div>';
    
    // Post title
    body += '<div class="skool-post-title">' + highlightText(post.post_title || '') + '</div>';
    
    // Post content
    if (post.post_content) {
        body += '<div class="skool-post-content">' + highlightText(post.post_content).replace(/\n/g, '<br>') + '</div>';
    }
    
    // Stats bar
    body += '<div class="skool-post-stats">';
    body += '<span>\ud83d\udc4d ' + (post.likes || 0) + ' Likes</span>';
    body += '<span>\ud83d\udcac ' + comments.length + ' Kommentare</span>';
    if (post.post_url) body += '<a href="' + escapeHtml(post.post_url) + '" target="_blank" style="color:var(--accent-blue);text-decoration:none;font-size:12px">\ud83d\udd17 Auf Skool \u00f6ffnen</a>';
    body += '</div>';
    body += '</div>'; // end post-card
    
    // Comments section
    if (comments.length > 0) {
        body += '<div class="skool-comments-section">';
        body += '<div class="skool-comments-header">' + comments.length + ' Kommentare</div>';
        comments.forEach(function(c) {
            var isMember = memberName && (c.author_name === memberName);
            body += '<div class="skool-comment' + (isMember ? ' skool-comment-highlight' : '') + '">';
            body += '<div class="skool-comment-avatar" style="background:' + avatarColor(c.author_name || 'A') + '">' + initials(c.author_name || 'A') + '</div>';
            body += '<div class="skool-comment-body">';
            body += '<div class="skool-comment-author">';
            body += '<strong>' + escapeHtml(c.author_name || 'Anonym') + '</strong>';
            if (isMember) body += ' <span style="font-size:10px;background:var(--accent-blue);color:white;padding:1px 6px;border-radius:10px;margin-left:4px">Dieses Mitglied</span>';
            if (c.comment_date) body += ' <span style="color:var(--text-muted);font-size:11px">' + escapeHtml(c.comment_date) + '</span>';
            body += '</div>';
            body += '<div class="skool-comment-text">' + highlightText(c.comment_text || '') + '</div>';
            if (c.likes > 0) body += '<div class="skool-comment-likes">\ud83d\udc4d ' + c.likes + '</div>';
            body += '</div></div>';
        });
        body += '</div>';
    }
    
    body += '</div>';
    openModal(escapeHtml(post.post_title || 'Beitrag'), body, '<button class="btn btn-secondary" onclick="closeModal()">Schlie\u00dfen</button>');
}

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
    sb.from('members').select('*').eq('id', currentMemberId).single().then(function(res) { if (res.error) throw res.error; var m = res.data;
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
        currentPage = 0;
        searchTimeout = setTimeout(loadMembers, 300);
    });
    $('filter-status').addEventListener('change', () => { currentPage = 0; loadMembers(); });
    $('filter-membership').addEventListener('change', () => { currentPage = 0; loadMembers(); });
    $('filter-level').addEventListener('change', () => { currentPage = 0; loadMembers(); });

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
    // Posts: file upload triggers Skool JSON import
    $('import-posts-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            $('import-json-paste').value = ev.target.result;
            var btn = $('btn-import-json-paste');
            btn.disabled = true; btn.textContent = '⏳ Importiere...';
            importSkoolJSON(ev.target.result).finally(function() { btn.disabled = false; btn.textContent = '📋 JSON Importieren'; });
        };
        reader.readAsText(file);
    });

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

    // ── Member Import: community toggle ──
    var selectedMemberCommunity = 'free';
    $('btn-member-community-free').addEventListener('click', function () {
        selectedMemberCommunity = 'free';
        $('btn-member-community-free').classList.add('active');
        $('btn-member-community-paid').classList.remove('active');
    });
    $('btn-member-community-paid').addEventListener('click', function () {
        selectedMemberCommunity = 'paid';
        $('btn-member-community-paid').classList.add('active');
        $('btn-member-community-free').classList.remove('active');
    });

    // Member import: paste or file
    async function importMembersJSON(jsonText) {
        var data;
        try { data = JSON.parse(jsonText); } catch(e) { toast('Ungültiges JSON: ' + e.message, 'error'); return; }
        if (!Array.isArray(data)) data = [data];
        var progEl = $('import-members-progress'); progEl.classList.remove('hidden');
        var fillEl = $('import-members-progress-fill');
        var textEl = $('import-members-progress-text');
        var resEl = $('import-members-result');
        var created = 0, updated = 0, errors = 0;
        for (var i = 0; i < data.length; i++) {
            var m = data[i];
            var pct = Math.round(((i+1) / data.length) * 100);
            fillEl.style.width = pct + '%';
            textEl.textContent = (i+1) + ' / ' + data.length + ' Mitglieder...';
            var row = {
                name: m.name || m.Name || '',
                skool_username: m.skool_username || m.username || m.skoolUsername || '',
                bio: m.bio || m.Bio || null,
                city: m.city || m.City || m.location || null,
                country: m.country || m.Country || null,
                membership_type: m.membership_type || (selectedMemberCommunity === 'paid' ? 'yearly_670' : 'free'),
                membership_status: m.membership_status || m.status || 'active',
                join_date: m.join_date || m.joinDate || m.joined || null,
                renewal_date: m.renewal_date || m.renewalDate || null,
                join_source: m.join_source || m.joinSource || 'direct',
                is_premium: m.is_premium || (m.membership_type && m.membership_type.startsWith('yearly')) || false,
                activity_status: m.activity_status || 'active'
            };
            if (!row.name || !row.skool_username) { errors++; continue; }
            // Try update first
            var upRes = await sb.from('members').update(row).eq('skool_username', row.skool_username);
            if (upRes.error) { errors++; continue; }
            // Check if update matched any rows by querying
            var chk = await sb.from('members').select('id').eq('skool_username', row.skool_username);
            if (chk.data && chk.data.length > 0) { updated++; }
            else {
                var insRes = await sb.from('members').insert(row);
                if (insRes.error) { errors++; } else { created++; }
            }
        }
        fillEl.style.width = '100%';
        textEl.textContent = 'Fertig!';
        resEl.textContent = '✅ ' + created + ' erstellt, ' + updated + ' aktualisiert' + (errors > 0 ? ', ' + errors + ' Fehler' : '');
        resEl.className = 'import-result success';
        toast(created + ' erstellt, ' + updated + ' aktualisiert', 'success');
    }
    $('btn-import-members-paste').addEventListener('click', function () {
        var jsonText = $('import-members-paste').value.trim();
        if (!jsonText) { toast('Bitte Mitglieder-JSON einfuegen', 'error'); return; }
        var btn = $('btn-import-members-paste');
        btn.disabled = true; btn.textContent = '⏳ Importiere...';
        importMembersJSON(jsonText).finally(function () { btn.disabled = false; btn.textContent = '👥 Mitglieder Importieren'; });
    });
    $('btn-clear-members-paste').addEventListener('click', function () {
        $('import-members-paste').value = '';
        $('import-members-result').textContent = '';
        $('import-members-result').className = 'import-result';
        $('import-members-progress').classList.add('hidden');
    });
    $('import-members-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            $('import-members-paste').value = ev.target.result;
            var btn = $('btn-import-members-paste');
            btn.disabled = true; btn.textContent = '⏳ Importiere...';
            importMembersJSON(ev.target.result).finally(function() { btn.disabled = false; btn.textContent = '👥 Mitglieder Importieren'; });
        };
        reader.readAsText(file);
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
