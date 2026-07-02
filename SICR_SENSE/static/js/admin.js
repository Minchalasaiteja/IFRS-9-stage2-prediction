// SICRSense Admin Panel JavaScript
class AdminPanel {
    constructor() {
        this.currentSection = window.initialAdminSection || 'overview';
        this.users = [];
        this.selectedUsers = new Set();
        this.init();
    }
    
    init() {
        this.setupNavigation();
        this.setupEventListeners();
        this.switchSection(this.currentSection);
        this.checkAdminAccess();
    }
    
    async checkAdminAccess() {
        try {
                        const response = await fetch('/api/v1/auth/me', {
                credentials: 'include',
                headers: {}
            });
            
            if (response.ok) {
                const user = await response.json();
                if (user.role !== 'admin') {
                    window.location.href = '/dashboard';
                }
                const adminNameEl = document.getElementById('admin-name');
                const adminRoleEl = document.getElementById('admin-role');
                if (adminNameEl) adminNameEl.textContent = `${user.first_name} ${user.last_name}`;
                if (adminRoleEl) adminRoleEl.textContent = user.role;
            } else {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Access check failed:', error);
        }
    }
    
    setupNavigation() {
        document.querySelectorAll('[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSection(item.dataset.section);
            });
        });
    }
    
    switchSection(section) {
        document.querySelectorAll('[id^="section-"]').forEach(s => {
            s.classList.add('hidden');
        });
        
        const target = document.getElementById(`section-${section}`);
        if (target) {
            target.classList.remove('hidden');
            gsap.from(target.children, {
                opacity: 0,
                y: 20,
                duration: 0.5,
                stagger: 0.05
            });
        }
        
        document.querySelectorAll('[data-section]').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
        
        document.getElementById('sectionTitle').textContent = 
            this.getSectionTitle(section);
        
        this.currentSection = section;
        this.updateUrlForSection(section);
        this.loadSectionData(section);
    }
    
    getSectionTitle(section) {
        const titles = {
            overview: 'Admin Overview',
            users: 'User Management',
            roles: 'Roles & Permissions',
            activity: 'User Activity',
            sessions: 'Active Sessions',
            security: 'Security Settings',
            audit: 'Audit Log'
        };
        return titles[section] || section;
    }

    updateUrlForSection(section) {
        const sectionPath = section === 'overview' ? '/admin' : `/admin/${section}`;
        if (window.history && window.location.pathname !== sectionPath) {
            window.history.replaceState({}, '', sectionPath);
        }
    }
    
    async loadSectionData(section) {
                
        try {
            switch(section) {
                case 'overview':
                    await this.loadOverview();
                    break;
                case 'users':
                    await this.loadUsers();
                    break;
                case 'activity':
                    await this.loadActivity();
                    break;
                case 'sessions':
                    await this.loadSessions();
                    break;
                case 'audit':
                    await this.loadAuditLogs();
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${section} data:`, error);
            this.showToast('Failed to load data', 'error');
        }
    }
    
    async loadOverview() {
                const response = await fetch('/api/v1/admin/overview', {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const data = await response.json();
            
            this.animateValue('totalUsers', data.total_users);
            this.animateValue('activeSessions', data.active_sessions);
            this.animateValue('apiCalls', data.api_calls_today);
            
            // Initialize charts
            this.initOverviewCharts(data);
        }
    }
    
    initOverviewCharts(data) {
        // Initialize live charts (or update if present)
        // Admin User Growth Chart
        const ugCanvas = document.getElementById('adminUserGrowthChart');
        if (ugCanvas) {
            if (!ugCanvas._chart) {
                ugCanvas._chart = new Chart(ugCanvas, {
                    type: 'line',
                    data: {
                        labels: data.user_growth_labels || [],
                        datasets: [{
                            label: 'New Users',
                            data: data.user_growth_data || [],
                            borderColor: '#00f0ff',
                            backgroundColor: 'rgba(0, 240, 255, 0.08)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            } else {
                ugCanvas._chart.data.labels = data.user_growth_labels || ugCanvas._chart.data.labels;
                ugCanvas._chart.data.datasets[0].data = data.user_growth_data || ugCanvas._chart.data.datasets[0].data;
                ugCanvas._chart.update();
            }
        }

        // Admin API Usage Chart
        const auCanvas = document.getElementById('adminApiUsageChart');
        if (auCanvas) {
            if (!auCanvas._chart) {
                auCanvas._chart = new Chart(auCanvas, {
                    type: 'bar',
                    data: {
                        labels: data.api_usage_labels || [],
                        datasets: [{
                            label: 'API Calls',
                            data: data.api_usage_data || [],
                            backgroundColor: 'rgba(124, 58, 237, 0.6)',
                            borderColor: '#7c3aed',
                            borderWidth: 1,
                            borderRadius: 8
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            } else {
                auCanvas._chart.data.labels = data.api_usage_labels || auCanvas._chart.data.labels;
                auCanvas._chart.data.datasets[0].data = data.api_usage_data || auCanvas._chart.data.datasets[0].data;
                auCanvas._chart.update();
            }
        }
    }

    // Subscribe to WebSocket admin updates and update charts in real-time
    subscribeAdminLive() {
        const subscribeAdmin = () => {
            try {
                if (window.wsStatus && typeof window.wsStatus.sendMessage === 'function') {
                    window.wsStatus.sendMessage({ type: 'subscribe_admin' });
                } else if (window.wsStatus && window.wsStatus.ws && window.wsStatus.ws.readyState === WebSocket.OPEN) {
                    window.wsStatus.ws.send(JSON.stringify({ type: 'subscribe_admin' }));
                }
            } catch (err) {
                console.warn('Failed to request admin subscription', err);
            }
        };

        if (window.wsStatus && window.wsStatus.connected) {
            subscribeAdmin();
        } else {
            window.addEventListener('ws-status-changed', () => subscribeAdmin());
        }

        window.addEventListener('ws-message', (e) => {
            const data = e.detail;
            if (!data || !data.type) return;
            if (data.type !== 'admin_update') return;

            // Update KPI values if present
            if (data.data && data.data.system_metrics) {
                const sys = data.data.system_metrics;
                if (sys && sys.cpu) {
                    const el = document.getElementById('systemHealthPercent');
                    if (el) el.textContent = `${Math.round(sys.cpu.percent)}%`;
                    const cpuBar = document.getElementById('dash-cpu-bar');
                    if (cpuBar) cpuBar.style.width = `${Math.round(sys.cpu.percent)}%`;
                    const cpuEl = document.getElementById('dash-cpu');
                    if (cpuEl) cpuEl.textContent = `${Math.round(sys.cpu.percent)}%`;
                }
            }

            const label = new Date(data.timestamp || Date.now()).toLocaleTimeString();
            const activeConnections = data.data?.active_connections ?? 0;
            const totalPredictions = data.data?.total_predictions ?? 0;

            const updateChart = (canvasId, value) => {
                const canvas = document.getElementById(canvasId);
                if (!canvas || !canvas._chart) return;
                const chart = canvas._chart;
                const labels = chart.data.labels || [];
                const dataset = chart.data.datasets[0];

                if (labels[labels.length - 1] === label) {
                    dataset.data[dataset.data.length - 1] = value;
                } else {
                    labels.push(label);
                    dataset.data.push(value);
                    if (labels.length > 20) {
                        labels.shift();
                        dataset.data.shift();
                    }
                }

                chart.update();
            };

            updateChart('adminUserGrowthChart', activeConnections);
            updateChart('adminApiUsageChart', totalPredictions);
        }, false);
    }
    
    async loadUsers(page = 1) {
                const role = document.getElementById('roleFilter')?.value || '';
        const status = document.getElementById('statusFilter')?.value || '';
        const search = document.getElementById('userSearch')?.value || '';
        const params = new URLSearchParams({ page: String(page), limit: '10' });

        if (role) params.set('role', role);
        if (status) params.set('status', status);
        if (search) params.set('search', search);

        const response = await fetch(`/api/v1/admin/users?${params.toString()}`, {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const data = await response.json();
            this.users = data.users || [];
            this.renderUsersTable(this.users);
            this.renderPagination(data);
        }
    }
    
    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        this.selectedUsers.clear();
        document.getElementById('selectedCount').textContent = '0';
        document.getElementById('bulkActions').style.display = 'none';
        
        tbody.innerHTML = '';
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
            row.innerHTML = `
                <td class="py-3 px-4">
                    <input type="checkbox" class="w-4 h-4 rounded" value="${user._id || user.id}"
                           onchange="adminPanel.toggleUserSelection(this)">
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
                            <span class="text-white text-xs font-bold">${(user.first_name?.[0] || '')}${(user.last_name?.[0] || '')}</span>
                        </div>
                        <div>
                            <p class="font-semibold text-sm">${user.first_name} ${user.last_name}</p>
                            <p class="text-xs text-gray-500">@${user.username}</p>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 text-gray-400 text-sm">${user.email}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-1 rounded-full text-xs ${this.getRoleBadgeClass(user.role)}">${user.role}</span>
                </td>
                <td class="py-3 px-4">
                    <span class="px-2 py-1 rounded-full text-xs ${user.is_active ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}">
                        ${user.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="py-3 px-4">
                    ${user.two_factor_enabled ? '<i class="fas fa-check-circle text-green-400"></i>' : '<i class="fas fa-times-circle text-red-400"></i>'}
                </td>
                <td class="py-3 px-4 text-gray-400 text-sm">
                    ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                </td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button onclick="adminPanel.editUser('${user._id || user.id}')" 
                                class="text-cyan-400 hover:text-cyan-300 transition-colors">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="adminPanel.deleteUser('${user._id || user.id}')" 
                                class="text-red-400 hover:text-red-300 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
    
    renderPagination(data) {
        const container = document.getElementById('pagination');
        if (!container) return;
        
        let html = '';
        for (let i = 1; i <= data.pages; i++) {
            html += `<button onclick="adminPanel.loadUsers(${i})" 
                class="px-3 py-1 rounded-lg text-sm ${i === data.page ? 'bg-cyan-400/20 text-cyan-400' : 'text-gray-400 hover:text-white'}">
                ${i}
            </button>`;
        }
        container.innerHTML = html;
    }
    
    toggleUserSelection(checkbox) {
        if (checkbox.checked) {
            this.selectedUsers.add(checkbox.value);
        } else {
            this.selectedUsers.delete(checkbox.value);
        }
        
        document.getElementById('selectedCount').textContent = this.selectedUsers.size;
        document.getElementById('bulkActions').style.display = 
            this.selectedUsers.size > 0 ? 'flex' : 'none';
    }
    
    async editUser(userId) {
                const response = await fetch(`/api/v1/admin/users/${userId}`, {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const user = await response.json();
            this.openUserModal(user);
        }
    }
    
    openUserModal(user = null) {
        const modal = document.getElementById('userModal');
        if (!modal) return;
        
        document.getElementById('modalTitle').textContent = user ? 'Edit User' : 'Add User';
        
        if (user) {
            document.getElementById('edit-first-name').value = user.first_name || '';
            document.getElementById('edit-last-name').value = user.last_name || '';
            document.getElementById('edit-email').value = user.email || '';
            document.getElementById('edit-username').value = user.username || '';
            document.getElementById('edit-role').value = user.role || 'user';
            document.getElementById('edit-status').checked = user.is_active;
            document.getElementById('user-id').value = user._id || user.id;
        } else {
            document.getElementById('userForm').reset();
            document.getElementById('user-id').value = '';
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    
    closeUserModal() {
        const modal = document.getElementById('userModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    
    async saveUser(event) {
        event.preventDefault();
        
        const userId = document.getElementById('user-id').value;
        const userData = {
            first_name: document.getElementById('edit-first-name').value,
            last_name: document.getElementById('edit-last-name').value,
            email: document.getElementById('edit-email').value,
            username: document.getElementById('edit-username').value,
            role: document.getElementById('edit-role').value,
            is_active: document.getElementById('edit-status').checked
        };
        
                const url = userId ? 
            `/api/v1/admin/users/${userId}` : 
            '/api/v1/admin/users';
        const method = userId ? 'PUT' : 'POST';
        
        try {
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                this.showToast(userId ? 'User updated successfully' : 'User created successfully', 'success');
                this.closeUserModal();
                this.loadUsers();
            } else {
                const error = await response.json();
                this.showToast(error.detail || 'Operation failed', 'error');
            }
        } catch (error) {
            this.showToast('Network error occurred', 'error');
        }
    }
    
    async deleteUser(userId) {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }
        
                
        try {
            const response = await fetch(`/api/v1/admin/users/${userId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {}
            });
            
            if (response.ok) {
                this.showToast('User deleted successfully', 'success');
                this.loadUsers();
            }
        } catch (error) {
            this.showToast('Failed to delete user', 'error');
        }
    }
    
    async bulkDelete() {
        if (this.selectedUsers.size === 0) return;
        
        if (!confirm(`Delete ${this.selectedUsers.size} selected users?`)) return;
        
                
        try {
            for (const userId of this.selectedUsers) {
                await fetch(`/api/v1/admin/users/${userId}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {}
                });
            }
            
            this.selectedUsers.clear();
            this.showToast('Users deleted successfully', 'success');
            this.loadUsers();
        } catch (error) {
            this.showToast('Bulk delete failed', 'error');
        }
    }

    exportSelectedUsers() {
        if (this.selectedUsers.size === 0) {
            this.showToast('Select users to export first', 'info');
            return;
        }
        const ids = Array.from(this.selectedUsers).join(',');
        window.location.href = `/api/v1/export?ids=${encodeURIComponent(ids)}&collection=users`;
    }
    
    async loadActivity() {
                const response = await fetch('/api/v1/admin/activity?limit=20', {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const data = await response.json();
            this.renderActivityLog(data.activities);
        } else {
            this.showToast('Failed to load activity logs', 'error');
        }
    }
    
    renderActivityLog(activities) {
        const container = document.getElementById('activityLog');
        if (!container) return;
        
        container.innerHTML = '';
        
        activities.forEach(activity => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-4 p-4 rounded-xl bg-white/5';
            item.innerHTML = `
                <div class="w-2 h-2 rounded-full ${this.getActivityColor(activity.action)}"></div>
                <div class="flex-1">
                    <p class="font-semibold text-sm">${activity.details}</p>
                    <p class="text-xs text-gray-500">User ID: ${activity.user_id}</p>
                </div>
                <span class="text-xs text-gray-500">${new Date(activity.timestamp).toLocaleString()}</span>
            `;
            container.appendChild(item);
        });
    }
    
    getActivityColor(action) {
        if (action.includes('login')) return 'bg-green-400';
        if (action.includes('delete')) return 'bg-red-400';
        if (action.includes('update')) return 'bg-yellow-400';
        if (action.includes('create')) return 'bg-cyan-400';
        return 'bg-gray-400';
    }
    
    async loadSessions(page = 1) {
        const response = await fetch(`/api/v1/admin/sessions?page=${page}&limit=20`, {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const data = await response.json();
            this.renderSessionsTable(data.sessions || []);
        } else {
            this.showToast('Failed to load sessions', 'error');
        }
    }
    
    renderSessionsTable(sessions) {
        const tbody = document.getElementById('sessionsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        sessions.forEach(session => {
            const row = document.createElement('tr');
            row.className = 'border-b border-white/10 hover:bg-white/5 transition-colors';
            row.innerHTML = `
                <td class="py-3 px-4 font-semibold text-sm">${session.user_id || 'Unknown'}</td>
                <td class="py-3 px-4 text-gray-400 text-sm">${session.username || 'Unknown'}</td>
                <td class="py-3 px-4 text-gray-400 text-sm">${session.created_at ? new Date(session.created_at).toLocaleString() : 'N/A'}</td>
                <td class="py-3 px-4 text-gray-400 text-sm">${session.expires_at ? new Date(session.expires_at).toLocaleString() : 'N/A'}</td>
                <td class="py-3 px-4 text-sm ${session.is_active ? 'text-green-400' : 'text-red-400'}">${session.is_active ? 'Active' : 'Expired'}</td>
                <td class="py-3 px-4 text-gray-400 text-sm">${session.ip_address || 'N/A'}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    async loadAuditLogs() {
                const response = await fetch('/api/v1/monitoring/audit-logs?limit=20', {
            credentials: 'include',
            headers: {}
        });
        
        if (response.ok) {
            const data = await response.json();
            this.renderAuditLogs(data.logs);
        }
    }
    
    renderAuditLogs(logs) {
        const container = document.getElementById('auditLogs');
        if (!container) return;
        
        container.innerHTML = '';
        
        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'p-4 rounded-xl bg-white/5 border-l-4 border-cyan-400';
            item.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold">${log.action}</p>
                        <p class="text-sm text-gray-400">${log.details}</p>
                        <p class="text-xs text-gray-500 mt-1">User: ${log.user_id}</p>
                    </div>
                    <span class="text-xs text-gray-500">${new Date(log.timestamp).toLocaleString()}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }
    
    getRoleBadgeClass(role) {
        const classes = {
            admin: 'bg-purple-400/10 text-purple-400 border border-purple-400/30',
            analyst: 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/30',
            user: 'bg-gray-400/10 text-gray-400 border border-gray-400/30'
        };
        return classes[role] || classes.user;
    }
    
    animateValue(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const startValue = parseInt(element.textContent) || 0;
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startValue + (newValue - startValue) * eased);
            
            element.textContent = current.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    setupEventListeners() {
        document.getElementById('userForm')?.addEventListener('submit', (e) => this.saveUser(e));
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeUserModal());
        document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDelete());
        document.getElementById('exportUsersBtn')?.addEventListener('click', () => this.exportSelectedUsers());
        document.getElementById('selectAllUsers')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));

        // Search and filter functionality
        document.getElementById('userSearch')?.addEventListener('input', () => this.loadUsers());
        document.getElementById('roleFilter')?.addEventListener('change', () => this.loadUsers());
        document.getElementById('statusFilter')?.addEventListener('change', () => this.loadUsers());
    }
    
    toggleSelectAll(isChecked) {
        const checkboxes = document.querySelectorAll('#usersTableBody input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
            if (isChecked) {
                this.selectedUsers.add(cb.value);
            } else {
                this.selectedUsers.delete(cb.value);
            }
        });
        document.getElementById('selectedCount').textContent = `${this.selectedUsers.size}`;
        document.getElementById('bulkActions').style.display = this.selectedUsers.size > 0 ? 'flex' : 'none';
    }
    
    filterUsers(searchTerm) {
        const filtered = this.users.filter(user => 
            user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderUsersTable(filtered);
    }
    
    showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-3';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        const colors = {
            success: 'border-green-400 bg-green-400/10',
            error: 'border-red-400 bg-red-400/10',
            info: 'border-cyan-400 bg-cyan-400/10'
        };
        
        toast.className = `fixed bottom-4 right-4 z-50 p-4 rounded-xl border ${colors[type]} backdrop-blur-md transition-all duration-300`;
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <i class="fas fa-${type === 'success' ? 'check-circle text-green-400' : type === 'error' ? 'exclamation-circle text-red-400' : 'info-circle text-cyan-400'}"></i>
                <span class="text-white">${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
    window.openUserModal = (user = null) => window.adminPanel?.openUserModal(user);
    // Start listening for live admin updates
    try { window.adminPanel?.subscribeAdminLive(); } catch(e) { console.warn('subscribeAdminLive failed', e); }
});