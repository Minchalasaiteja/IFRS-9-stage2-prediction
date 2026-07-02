/* === breadcrumb.html === */
function toggleBreadcrumbOverflow() {
    const dropdown = document.getElementById('breadcrumb-overflow');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// Close on outside click
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('breadcrumb-overflow');
    const toggle = e.target.closest('[onclick="toggleBreadcrumbOverflow()"]');
    
    if (dropdown && !dropdown.classList.contains('hidden') && !toggle) {
        dropdown.classList.add('hidden');
    }
});

/* === data-table.html === */
let selectedRows = new Set();

function handleRowSelect(checkbox) {
    if (checkbox.checked) {
        selectedRows.add(checkbox.value);
    } else {
        selectedRows.delete(checkbox.value);
    }
    updateBulkActions();
}

function toggleAllRows(checkbox) {
    const rowCheckboxes = document.querySelectorAll('.row-checkbox');
    rowCheckboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedRows.add(cb.value);
        } else {
            selectedRows.delete(cb.value);
        }
    });
    updateBulkActions();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (bulkActions && selectedCount) {
        bulkActions.style.display = selectedRows.size > 0 ? 'flex' : 'none';
        selectedCount.textContent = `${selectedRows.size} selected`;
    }
}

function sortTable(key) {
    const url = new URL(window.location.href);
    const currentSort = url.searchParams.get('sort');
    
    if (currentSort === key) {
        url.searchParams.set('order', currentSort.startsWith('-') ? key : `-${key}`);
    } else {
        url.searchParams.set('sort', key);
        url.searchParams.set('order', 'asc');
    }
    
    window.location.href = url.toString();
}

function filterTable(query) {
    const rows = document.querySelectorAll('#table-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
    });
}

function changePage(direction) {
    const url = new URL(window.location.href);
    const currentPage = parseInt(url.searchParams.get('page') || '1');
    
    if (direction === 'prev' && currentPage > 1) {
        url.searchParams.set('page', currentPage - 1);
    } else if (direction === 'next') {
        url.searchParams.set('page', currentPage + 1);
    }
    
    window.location.href = url.toString();
}

function goToPage(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.location.href = url.toString();
}

function bulkDelete() {
    if (selectedRows.size === 0) return;
    
    modal.confirm_dialog(`Delete ${selectedRows.size} selected items?`)
        .then(confirmed => {
            if (confirmed) {
                // Perform bulk delete
                fetch('/api/v1/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: Array.from(selectedRows) })
                })
                .then(res => res.json())
                .then(data => {
                    toast.success(`${selectedRows.size} items deleted`);
                    selectedRows.clear();
                    updateBulkActions();
                    window.location.reload();
                })
                .catch(() => toast.error('Bulk delete failed'));
            }
        });
}

function bulkExport() {
    if (selectedRows.size === 0) return;
    
    const ids = Array.from(selectedRows).join(',');
    window.location.href = `/api/v1/export?ids=${ids}`;
}

/* === dropdown.html === */
// Dropdown Manager
const DropdownManager = {
    openDropdowns: new Set(),
    
    toggle(id) {
        const dropdown = document.getElementById(id);
        if (!dropdown) return;
        
        const isOpen = !dropdown.classList.contains('hidden');
        
        // Close all other dropdowns
        this.closeAll();
        
        if (!isOpen) {
            dropdown.classList.remove('hidden');
            this.openDropdowns.add(id);
            
            // Animate in
            gsap.from(dropdown, {
                opacity: 0,
                y: -10,
                duration: 0.2,
                ease: 'power2.out'
            });
        }
    },
    
    close(id) {
        const dropdown = document.getElementById(id);
        if (dropdown) {
            dropdown.classList.add('hidden');
            this.openDropdowns.delete(id);
        }
    },
    
    closeAll() {
        this.openDropdowns.forEach(id => this.close(id));
    },
    
    select(id, value, label) {
        const labelEl = document.getElementById(`${id}-label`);
        if (labelEl) {
            labelEl.textContent = label;
        }
        
        // Update active state
        const items = document.querySelectorAll(`#${id} .dropdown-item`);
        items.forEach(item => {
            item.classList.toggle('bg-cyan-400/10 text-cyan-400', item.dataset.value === value);
        });
        
        // Dispatch change event
        window.dispatchEvent(new CustomEvent('dropdown-change', {
            detail: { id, value, label }
        }));
        
        this.close(id);
    },
    
    filter(id, query) {
        const items = document.querySelectorAll(`#${id} .dropdown-item`);
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
        });
    },
    
    getValue(id) {
        const labelEl = document.getElementById(`${id}-label`);
        const activeItem = document.querySelector(`#${id} .dropdown-item.bg-cyan-400\\/10`);
        return {
            label: labelEl?.textContent || '',
            value: activeItem?.dataset.value || ''
        };
    },
    
    setValue(id, value) {
        const item = document.querySelector(`#${id} .dropdown-item[data-value="${value}"]`);
        if (item) {
            this.select(id, value, item.querySelector('p')?.textContent || '');
        }
    }
};

// Global functions
function toggleDropdown(id) {
    DropdownManager.toggle(id);
}

function selectDropdownItem(id, value, label) {
    DropdownManager.select(id, value, label);
}

function filterDropdown(id, query) {
    DropdownManager.filter(id, query);
}

function handleDropdownCheckbox(id, checkbox) {
    window.dispatchEvent(new CustomEvent('dropdown-checkbox-change', {
        detail: { id, value: checkbox.value, checked: checkbox.checked }
    }));
}

// Authentication now uses HTTP-only cookies for same-origin API auth
async function refreshAccessToken() {
    try {
        const response = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.ok;
    } catch (err) {
        console.warn('Auth refresh failed:', err);
        return false;
    }
}

async function fetchWithAuth(url, options = {}) {
    // Ensure options is an object
    options = options || {};
    // Normalise headers to a Headers instance
    options.headers = new Headers(options.headers || {});
    // Default to same-origin credentials for API calls
    options.credentials = options.credentials || 'same-origin';
    
    // ---------------------------------------------------------------------
    // Handle duplex for streaming bodies
    // ---------------------------------------------------------------------
    // The Fetch spec requires the `duplex` member to be set to "half" when the
    // request body is a ReadableStream. Some browsers (Chrome) also treat
    // FormData as a streaming body and will throw the same error if `duplex`
    // is omitted. We therefore add support for both cases.
    if (options.body) {
        const isReadableStream = typeof options.body === 'object' && typeof options.body.getReader === 'function';
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        if (isReadableStream || isFormData) {
            // Only set duplex for streaming bodies; omit for plain strings.
            options.duplex = 'half';
        }
    }

    let response = await window.originalFetch(url, options);
    if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            response = await window.originalFetch(url, options);
        } else {
            window.location.replace('/login');
        }
    }
    return response;
}

window.fetchWithAuth = fetchWithAuth;

if (!window.originalFetch) {
    window.originalFetch = window.fetch.bind(window);
}

// ============================================================
// FIXED: window.fetch override - properly handles duplex
// ============================================================
window.fetch = async function(input, init = {}) {
    // If input is a Request object, handle it differently
    if (input instanceof Request) {
        const request = input;
        const requestUrl = new URL(request.url, window.location.origin);
        const sameOrigin = requestUrl.origin === window.location.origin;
        const authBypassPaths = [
            '/api/v1/auth/login',
            '/api/v1/auth/signup',
            '/api/v1/auth/refresh',
            '/api/v1/auth/password/reset-request',
            '/api/v1/auth/password/reset',
            '/api/v1/auth/verify-email',
            '/api/v1/auth/resend-verification'
        ];

        if (sameOrigin && requestUrl.pathname.startsWith('/api/v1/') && 
            !authBypassPaths.some(path => requestUrl.pathname.startsWith(path))) {
            
            // Build options from the Request object
            const options = {
                method: request.method,
                headers: request.headers,
                body: request.body,
                mode: request.mode,
                credentials: init.credentials || request.credentials,
                cache: request.cache,
                redirect: request.redirect,
                referrer: request.referrer,
                referrerPolicy: request.referrerPolicy,
                integrity: request.integrity,
                keepalive: request.keepalive,
                window: request.window,
                signal: request.signal,
                duplex: request.body ? 'half' : undefined
                
            };
            
            // Handle the body carefully
            if (request.body) {
                try {
                    // Try to clone and read the body as text
                    const clonedRequest = request.clone();
                    const bodyText = await clonedRequest.text();
                    if (bodyText) {
                        options.body = bodyText;
                    }
                } catch (e) {
                    // If we can't read the body, it's likely a stream
                    // Add duplex: 'half' for streaming bodies
                    options.body = request.body;
                    options.duplex = 'half';
                }
            }
            
            return fetchWithAuth(requestUrl.href, options);
        }
        
        // Non-API request with Request object - pass through
        return window.originalFetch(input, init);
    }
    
    // Handle string URL case
    const url = typeof input === 'string' ? input : input.url;
    const requestUrl = new URL(url, window.location.origin);
    const sameOrigin = requestUrl.origin === window.location.origin;
    const authBypassPaths = [
        '/api/v1/auth/login',
        '/api/v1/auth/signup',
        '/api/v1/auth/refresh',
        '/api/v1/auth/password/reset-request',
        '/api/v1/auth/password/reset',
        '/api/v1/auth/verify-email',
        '/api/v1/auth/resend-verification'
    ];

    if (sameOrigin && requestUrl.pathname.startsWith('/api/v1/') && 
        !authBypassPaths.some(path => requestUrl.pathname.startsWith(path))) {
        
        const options = { ...init };
        options.credentials = options.credentials || 'same-origin';
        
        // Check if body is a ReadableStream (needs duplex)
        if (options.body && typeof options.body === 'object' && typeof options.body.getReader === 'function') {
            options.duplex = 'half';
        }
        
        return fetchWithAuth(url, options);
    }

    return window.originalFetch(input, init);
};

async function logout() {
    try {
        await fetch('/api/v1/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) {
        console.warn('Logout request failed', err);
    }
    window.location.href = '/login';
}


// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-dropdown]')) {
        DropdownManager.closeAll();
    }
});

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        DropdownManager.closeAll();
    }
});

/* === error.html === */

function reportError() {
    const container = document.getElementById('error-data-container');
    if (!container) return;
    const errorInfo = {
        code: container.dataset.code,
        message: container.dataset.message,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        details: container.dataset.details
    };
    
    fetch('/api/v1/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorInfo)
    })
    .then(() => {
        if(typeof toast !== 'undefined' && toast.success) toast.success('Error reported. Thank you for your feedback!');
    })
    .catch(() => {
        if(typeof toast !== 'undefined' && toast.error) toast.error('Failed to report error');
    });
}


/* === filter-bar.html === */
const activeFilters = new Map();

function applyFilter(key, value, label) {
    activeFilters.set(key, { value, label });
    updateActiveFilters();
    triggerFilterChange();
    
    // Close dropdown
    const dropdown = document.getElementById(`filter-${key}`);
    if (dropdown) dropdown.classList.add('hidden');
    
    // Update button label
    const labelEl = document.getElementById(`filter-${key}-label`);
    if (labelEl) labelEl.textContent = label;
}

function toggleFilter(key) {
    if (activeFilters.has(key)) {
        activeFilters.delete(key);
    } else {
        activeFilters.set(key, { value: true, label: '' });
    }
    updateActiveFilters();
    triggerFilterChange();
    
    // Update button style
    const button = document.querySelector(`[data-filter="${key}"]`);
    if (button) {
        const isActive = activeFilters.has(key);
        button.classList.toggle('bg-cyan-400/10', isActive);
        button.classList.toggle('text-cyan-400', isActive);
        button.classList.toggle('border-cyan-400/30', isActive);
    }
}

function applyDateFilter(key, value) {
    if (value) {
        activeFilters.set(key, { value, label: formatDate(value) });
    } else {
        activeFilters.delete(key);
    }
    updateActiveFilters();
    triggerFilterChange();
}

function applyRangeFilter(key, type, value) {
    const rangeKey = `${key}_${type}`;
    if (value) {
        activeFilters.set(rangeKey, { value, label: `${type}: ${value}` });
    } else {
        activeFilters.delete(rangeKey);
    }
    updateActiveFilters();
    triggerFilterChange();
}

function applySort(value) {
    activeFilters.set('sort', { value, label: '' });
    triggerFilterChange();
}

function updateActiveFilters() {
    const container = document.getElementById('active-filters');
    const clearBtn = document.getElementById('clear-filters-btn');
    
    if (!container) return;
    
    // Remove sort from display
    const displayFilters = new Map(activeFilters);
    displayFilters.delete('sort');
    
    container.innerHTML = Array.from(displayFilters).map(([key, filter]) => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
            ${filter.label || key}
            <button onclick="removeFilter('${key}')" class="hover:text-red-400 transition-colors">
                <i class="fas fa-times text-[10px]"></i>
            </button>
        </span>
    `).join('');
    
    if (clearBtn) {
        clearBtn.style.display = displayFilters.size > 0 ? 'inline' : 'none';
    }
}

function removeFilter(key) {
    activeFilters.delete(key);
    updateActiveFilters();
    triggerFilterChange();
    
    // Reset toggle button style
    const toggleBtn = document.querySelector(`[data-filter="${key}"]`);
    if (toggleBtn) {
        toggleBtn.classList.remove('bg-cyan-400/10', 'text-cyan-400', 'border-cyan-400/30');
    }
    
    // Reset select button label
    const labelEl = document.getElementById(`filter-${key}-label`);
    if (labelEl) labelEl.textContent = labelEl.dataset.default || 'Select';
}

function clearAllFilters() {
    activeFilters.clear();
    updateActiveFilters();
    triggerFilterChange();
    
    // Reset all toggle buttons
    document.querySelectorAll('.filter-toggle').forEach(btn => {
        btn.classList.remove('bg-cyan-400/10', 'text-cyan-400', 'border-cyan-400/30');
    });
    
    // Reset all select labels
    document.querySelectorAll('[id$="-label"]').forEach(label => {
        label.textContent = label.dataset.default || 'Select';
    });
    
    // Reset search
    const searchInput = document.getElementById('filter-search');
    if (searchInput) searchInput.value = '';
}

function triggerFilterChange() {
    const filters = Object.fromEntries(activeFilters);
    window.dispatchEvent(new CustomEvent('filter-change', { detail: filters }));
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/* === footer.html === */
// Update system status periodically
setInterval(async () => {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        const statusEl = document.getElementById('system-status');
        if (statusEl && data.status) {
            const isHealthy = data.status === 'healthy';
            statusEl.innerHTML = `
                <span class="w-2 h-2 rounded-full ${isHealthy ? 'bg-green-400 animate-pulse' : 'bg-red-400'}"></span>
                <span class="text-gray-400">${isHealthy ? 'System Operational' : 'System Degraded'}</span>
            `;
        }
    } catch (error) {
        console.error('Health check failed:', error);
    }
}, 30000); // Check every 30 seconds

/* === form-elements.html === */
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    
    // Update character count
    const charCountEl = document.getElementById(`${textarea.id}-char-count`);
    if (charCountEl) {
        charCountEl.textContent = textarea.value.length;
    }
}

function handleFileUpload(input) {
    const preview = document.getElementById(`${input.id}-preview`);
    if (!preview) return;
    
    if (input.files.length > 0) {
        const file = input.files[0];
        preview.classList.remove('hidden');
        preview.innerHTML = `
            <div class="flex items-center gap-3 p-3 glass-card rounded-xl">
                <i class="fas fa-file text-cyan-400"></i>
                <div class="flex-1">
                    <p class="text-sm">${file.name}</p>
                    <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
                </div>
                <button onclick="removeFile('${input.id}')" class="text-red-400 hover:text-red-300">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }
}

function removeFile(inputId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(`${inputId}-preview`);
    
    if (input) input.value = '';
    if (preview) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Password strength checker
document.addEventListener('input', (e) => {
    if (e.target.dataset.passwordStrength) {
        const password = e.target.value;
        const strength = calculatePasswordStrength(password);
        const bar = document.getElementById(`${e.target.id}-strength-bar`);
        const text = document.getElementById(`${e.target.id}-strength-text`);
        
        if (bar) {
            bar.style.width = strength.score + '%';
            bar.style.background = strength.color;
        }
        if (text) {
            text.textContent = strength.label;
            text.style.color = strength.color;
        }
    }
});

function calculatePasswordStrength(password) {
    let score = 0;
    
    if (password.length >= 8) score += 20;
    if (password.length >= 12) score += 10;
    if (password.match(/[A-Z]/)) score += 20;
    if (password.match(/[a-z]/)) score += 15;
    if (password.match(/[0-9]/)) score += 15;
    if (password.match(/[^A-Za-z0-9]/)) score += 20;
    
    if (score < 40) return { score, label: 'Weak', color: '#ef4444' };
    if (score < 70) return { score, label: 'Fair', color: '#f59e0b' };
    if (score < 90) return { score, label: 'Good', color: '#3b82f6' };
    return { score: 100, label: 'Strong', color: '#10b981' };
}

/* === header.html === */
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('-translate-x-full');
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function exportData() {
    // Trigger data export
    window.dispatchEvent(new CustomEvent('export-data'));
}

function refreshData() {
    if (window.monitoring && typeof window.monitoring.refreshData === 'function') {
        window.monitoring.refreshData();
        return;
    }
    if (window.dashboard && typeof window.dashboard.fetchInitialData === 'function') {
        window.dashboard.fetchInitialData();
        return;
    }
    if (window.adminPanel && typeof window.adminPanel.loadSectionData === 'function') {
        window.adminPanel.loadSectionData(window.adminPanel.currentSection);
        return;
    }
    if (typeof loadPredictionHistory === 'function') {
        loadPredictionHistory();
        return;
    }
    window.location.reload();
}

window.addEventListener('export-data', () => {
    if (typeof downloadPredictions === 'function') {
        downloadPredictions();
        return;
    }
    if (window.adminPanel && typeof window.adminPanel.exportSelectedUsers === 'function') {
        window.adminPanel.exportSelectedUsers();
        return;
    }
    if (window.monitoring && typeof window.monitoring.exportMetrics === 'function') {
        window.monitoring.exportMetrics();
        return;
    }
    if (window.dashboard && typeof window.dashboard.exportDashboardData === 'function') {
        window.dashboard.exportDashboardData();
        return;
    }
    if (typeof toast !== 'undefined' && toast.info) {
        toast.info('No export action available for this page.');
    } else {
        alert('No export action available for this page.');
    }
});

function handleGlobalSearch(event) {
    const query = event.target.value;
    const resultsContainer = document.getElementById('search-results');
    
    if (query.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    // Perform search
    fetch(`/api/v1/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                resultsContainer.innerHTML = data.results.map(result => `
                    <a href="${result.url}" class="block p-3 hover:bg-white/5 rounded-lg transition-colors">
                        <div class="flex items-center gap-3">
                            <i class="fas ${result.icon || 'fa-file'} text-gray-400"></i>
                            <div>
                                <p class="text-sm font-semibold">${result.title}</p>
                                <p class="text-xs text-gray-500">${result.subtitle || ''}</p>
                            </div>
                        </div>
                    </a>
                `).join('');
                resultsContainer.classList.remove('hidden');
            } else {
                resultsContainer.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">No results found</p>';
                resultsContainer.classList.remove('hidden');
            }
        })
        .catch(() => {
            resultsContainer.classList.add('hidden');
        });
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    const searchContainer = document.getElementById('global-search')?.parentElement;
    if (searchContainer && !searchContainer.contains(e.target)) {
        document.getElementById('search-results')?.classList.add('hidden');
    }
});

/* === loading.html === */
class LoaderManager {
    static show(loaderId = 'page-loader', message = 'Loading...') {
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.classList.remove('hidden');
            const msgEl = document.getElementById('loader-message');
            if (msgEl) msgEl.textContent = message;
        }
    }
    
    static hide(loaderId = 'page-loader') {
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.classList.add('hidden');
        }
    }
    
    static showSkeleton(containerId, count = 1) {
        const container = document.getElementById(containerId);
        const template = document.getElementById('skeleton-template');
        
        if (container && template) {
            container.innerHTML = '';
            for (let i = 0; i < count; i++) {
                container.appendChild(template.content.cloneNode(true));
            }
        }
    }
    
    static showButtonLoader(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            const text = button.querySelector('.btn-text');
            const loader = button.querySelector('.btn-loader');
            if (text) text.classList.add('hidden');
            if (loader) loader.classList.remove('hidden');
            button.disabled = true;
        }
    }
    
    static hideButtonLoader(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            const text = button.querySelector('.btn-text');
            const loader = button.querySelector('.btn-loader');
            if (text) text.classList.remove('hidden');
            if (loader) loader.classList.add('hidden');
            button.disabled = false;
        }
    }
}

// Initialize global loader manager
window.loader = LoaderManager;

/* === modal.html === */
class ModalManager {
    constructor() {
        this.overlay = document.getElementById('modal-overlay');
        this.container = document.getElementById('modal-container');
        this.title = document.getElementById('modal-title');
        this.body = document.getElementById('modal-body');
        this.footer = document.getElementById('modal-footer');
        this.confirmBtn = document.getElementById('modal-confirm-btn');
        this.confirmCallback = null;
        this.isOpen = false;
    }
    
    open(options = {}) {
        const {
            title = 'Modal',
            content = '',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            showFooter = true,
            confirmCallback = null,
            size = 'md',
            closeOnOverlay = true
        } = options;
        
        // Set title
        this.title.textContent = title;
        
        // Set content
        if (typeof content === 'string') {
            this.body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            this.body.innerHTML = '';
            this.body.appendChild(content);
        }
        
        // Configure buttons
        this.confirmBtn.textContent = confirmText;
        this.confirmCallback = confirmCallback;
        
        // Show/hide footer
        this.footer.style.display = showFooter ? 'flex' : 'none';
        
        // Set size
        const sizes = {
            sm: 'max-w-sm',
            md: 'max-w-lg',
            lg: 'max-w-2xl',
            xl: 'max-w-4xl',
            full: 'max-w-[95vw]'
        };
        this.container.className = `glass-card w-full ${sizes[size] || sizes.md} max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-300`;
        
        // Show modal
        this.overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            this.container.style.transform = 'scale(1)';
            this.container.style.opacity = '1';
        });
        
        this.isOpen = true;
        
        // Close on Escape key
        document.addEventListener('keydown', this.handleEscape);
    }
    
    close() {
        this.container.style.transform = 'scale(0.95)';
        this.container.style.opacity = '0';
        
        setTimeout(() => {
            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';
            this.isOpen = false;
            this.confirmCallback = null;
        }, 200);
        
        document.removeEventListener('keydown', this.handleEscape);
    }
    
    confirm() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.close();
    }
    
    handleEscape = (e) => {
        if (e.key === 'Escape' && this.isOpen) {
            this.close();
        }
    }
    
    // Convenience methods
    alert(message, title = 'Alert') {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p class="text-gray-300">${message}</p>`,
                confirmText: 'OK',
                confirmCallback: resolve,
                showFooter: true
            });
        });
    }
    
    confirm_dialog(message, title = 'Confirm') {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p class="text-gray-300">${message}</p>`,
                confirmText: 'Confirm',
                confirmCallback: () => resolve(true)
            });
            
            // Handle cancel by overlay click
            const originalClose = this.close.bind(this);
            this.close = () => {
                resolve(false);
                originalClose();
            };
        });
    }
    
    prompt(message, title = 'Input Required', defaultValue = '') {
        return new Promise((resolve) => {
            const inputId = 'modal-prompt-input';
            const content = `
                <div>
                    <p class="text-gray-300 mb-4">${message}</p>
                    <input type="text" id="${inputId}" class="neo-input" value="${defaultValue}" autofocus>
                </div>
            `;
            
            this.open({
                title,
                content,
                confirmText: 'Submit',
                confirmCallback: () => {
                    const value = document.getElementById(inputId)?.value || '';
                    resolve(value);
                }
            });
        });
    }
}

// Initialize global modal manager
window.modal = new ModalManager();

// Global functions for inline onclick handlers
function openModal(options) { window.modal.open(options); }
function closeModal() { window.modal.close(); }
function confirmModal() { window.modal.confirm(); }

/* === navbar.html === */
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) {
        menu.classList.toggle('hidden');
        
        if (!menu.classList.contains('hidden')) {
            gsap.from(menu.children, {
                opacity: 0,
                y: -10,
                duration: 0.3,
                stagger: 0.05,
                ease: 'power2.out'
            });
        }
    }
}

// Active link highlighting based on current path
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentPath.startsWith(href)) {
            link.classList.add('text-cyan-400', 'bg-cyan-400/10');
        }
    });
});

// Hide mobile menu on window resize
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        document.getElementById('mobile-menu')?.classList.add('hidden');
    }
});

/* === notification-bell.html === */
let notifications = [];
let unreadCount = 0;

async function fetchNotifications() {
    try {
        const response = await fetch('/api/v1/notifications?limit=10');
        const data = await response.json();
        
        notifications = data.notifications || [];
        unreadCount = data.unread_count || 0;
        
        updateNotificationBadge();
        renderNotifications();
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function renderNotifications() {
    const container = document.getElementById('notifications-content');
    const loading = document.getElementById('notifications-loading');
    const empty = document.getElementById('notifications-empty');
    
    if (!container) return;
    
    loading.classList.add('hidden');
    
    if (notifications.length === 0) {
        empty.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }
    
    empty.classList.add('hidden');
    
    container.innerHTML = notifications.map(notif => `
        <div class="p-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer ${notif.read ? '' : 'bg-cyan-400/5'}"
             onclick="handleNotificationClick('${notif.id}')">
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-lg ${getNotifBg(notif.type)} flex items-center justify-center flex-shrink-0">
                    <i class="fas ${getNotifIcon(notif.type)} ${getNotifColor(notif.type)} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold truncate">${notif.title}</p>
                    <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">${notif.message}</p>
                    <p class="text-xs text-gray-600 mt-1">${timeAgo(notif.timestamp)}</p>
                </div>
                ${!notif.read ? '<span class="w-2 h-2 bg-cyan-400 rounded-full flex-shrink-0 mt-2"></span>' : ''}
            </div>
        </div>
    `).join('');
}

function getNotifBg(type) {
    const bgs = {
        success: 'bg-green-400/10',
        warning: 'bg-yellow-400/10',
        error: 'bg-red-400/10',
        info: 'bg-cyan-400/10'
    };
    return bgs[type] || bgs.info;
}

function getNotifIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

function getNotifColor(type) {
    const colors = {
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400',
        info: 'text-cyan-400'
    };
    return colors[type] || colors.info;
}

function timeAgo(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

async function handleNotificationClick(id) {
    try {
        await fetch(`/api/v1/notifications/${id}/read`, { method: 'POST' });
        
        const notif = notifications.find(n => n.id === id);
        if (notif) {
            notif.read = true;
            unreadCount = Math.max(0, unreadCount - 1);
            updateNotificationBadge();
            renderNotifications();
        }
        
        if (notif?.url) {
            window.location.href = notif.url;
        }
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
    }
}

async function markAllRead() {
    try {
        await fetch('/api/v1/notifications/read-all', { method: 'POST' });
        
        notifications.forEach(n => n.read = true);
        unreadCount = 0;
        updateNotificationBadge();
        renderNotifications();
        
        toast.success('All notifications marked as read');
    } catch (error) {
        console.error('Failed to mark all as read:', error);
    }
}

function toggleNotifications() {
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown) {
        const isHidden = dropdown.classList.contains('hidden');
        dropdown.classList.toggle('hidden');
        
        if (!isHidden) {
            fetchNotifications();
        }
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notifications-dropdown');
    const bell = e.target.closest('[onclick="toggleNotifications()"]');
    
    if (dropdown && !dropdown.classList.contains('hidden') && !bell && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// Initial fetch
fetchNotifications();

// Poll for new notifications every 30 seconds
setInterval(fetchNotifications, 30000);

/* === pagination.html === */
const paginationRoot = document.getElementById("pagination-data");
let CURRENT_PAGE = 1;
let TOTAL_PAGES = 1;

try {
    if (paginationRoot && paginationRoot.dataset) {
        CURRENT_PAGE = Number(paginationRoot.dataset.currentPage || 1);
        TOTAL_PAGES = Number(paginationRoot.dataset.totalPages || 1);
    }
} catch (error) {
    console.warn('Pagination metadata unavailable:', error);
}

function goToPage(page){

    if(page<1 || page>TOTAL_PAGES){
        return;
    }

    const url = new URL(window.location.href);

    url.searchParams.set("page",page);

    window.location.href=url.toString();

}

function changePerPage(value){

    const url=new URL(window.location.href);

    url.searchParams.set("per_page",value);

    url.searchParams.set("page",1);

    window.location.href=url.toString();

}

function jumpToPage(){

    const input=document.getElementById("page-jump-input");

    const page=parseInt(input.value,10);

    if(Number.isNaN(page)){

        input.value=CURRENT_PAGE;

        return;

    }

    if(page>=1 && page<=TOTAL_PAGES){

        goToPage(page);

    }else{

        input.value=TOTAL_PAGES;

        if(typeof toast!=="undefined"){

            toast.warning(
                `Please enter a page between 1 and ${TOTAL_PAGES}`
            );

        }

    }

}

document.addEventListener("keydown",function(e){

    if(
        e.target.tagName==="INPUT" ||
        e.target.tagName==="TEXTAREA" ||
        e.target.tagName==="SELECT"
    ){
        return;
    }

    if(e.ctrlKey && e.key==="ArrowLeft"){

        e.preventDefault();

        goToPage(CURRENT_PAGE-1);

    }

    if(e.ctrlKey && e.key==="ArrowRight"){

        e.preventDefault();

        goToPage(CURRENT_PAGE+1);

    }

});

/* === progress-bar.html === */
// Animate progress bars on scroll
document.addEventListener('DOMContentLoaded', () => {
    const progressBars = document.querySelectorAll('.progress-fill[data-progress]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const targetWidth = bar.dataset.progress + '%';
                
                // Animate width
                setTimeout(() => {
                    bar.style.width = targetWidth;
                }, 200);
                
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.5 });
    
    progressBars.forEach(bar => observer.observe(bar));
});

// Update progress bar dynamically
function updateProgress(selector, value) {
    const bar = document.querySelector(selector);
    if (bar) {
        bar.style.width = value + '%';
        bar.dataset.progress = value;
        
        // Update label if exists
        const label = bar.parentElement.parentElement.querySelector('.progress-label');
        if (label) {
            label.textContent = value + '%';
        }
    }
}

/* === search-bar.html === */
class SearchManager {
    constructor() {
        this.searchTimers = {};
        this.selectedIndex = -1;
        this.currentResults = [];
    }
    
    handleSearch(inputId, query) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(`${inputId}-clear`);
        const resultsContainer = document.getElementById(`${inputId}-results`);
        const loadingEl = document.getElementById(`${inputId}-loading`);
        const listEl = document.getElementById(`${inputId}-list`);
        const emptyEl = document.getElementById(`${inputId}-empty`);
        const footerEl = document.getElementById(`${inputId}-footer`);
        
        // Show/hide clear button
        if (clearBtn) {
            clearBtn.style.display = query ? 'block' : 'none';
        }
        
        // Clear previous timer
        if (this.searchTimers[inputId]) {
            clearTimeout(this.searchTimers[inputId]);
        }
        
        if (query.length < 2) {
            resultsContainer?.classList.add('hidden');
            return;
        }
        
        // Show loading
        resultsContainer?.classList.remove('hidden');
        loadingEl?.classList.remove('hidden');
        listEl.innerHTML = '';
        emptyEl?.classList.add('hidden');
        footerEl?.classList.add('hidden');
        
        // Debounce search
        this.searchTimers[inputId] = setTimeout(async () => {
            try {
                const results = await this.performSearch(query);
                
                loadingEl?.classList.add('hidden');
                
                if (results.length === 0) {
                    emptyEl?.classList.remove('hidden');
                    emptyEl.querySelector('.search-query').textContent = query;
                } else {
                    this.currentResults = results;
                    this.selectedIndex = -1;
                    this.renderResults(listEl, results);
                    footerEl?.classList.remove('hidden');
                }
            } catch (error) {
                loadingEl?.classList.add('hidden');
                listEl.innerHTML = `
                    <div class="p-4 text-center">
                        <p class="text-sm text-red-400">Search failed. Please try again.</p>
                    </div>
                `;
            }
        }, 300);
    }
    
    async performSearch(query) {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        return data.results || [];
    }
    
    renderResults(container, results) {
        container.innerHTML = results.map((result, index) => `
            <a href="${result.url || '#'}" 
               class="search-result flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
               data-index="${index}"
               onclick="searchManager.selectResult('${result.url}')"
               onmouseenter="searchManager.highlightResult(${index})">
                <div class="w-8 h-8 rounded-lg ${result.iconBg || 'bg-cyan-400/10'} flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-${result.icon || 'file'} ${result.iconColor || 'text-cyan-400'} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold truncate">${this.highlightMatch(result.title, document.getElementById(result.inputId)?.value || '')}</p>
                    <p class="text-xs text-gray-500 mt-0.5 truncate">${result.subtitle || ''}</p>
                </div>
                <span class="text-xs text-gray-600 flex-shrink-0">${result.type || ''}</span>
            </a>
        `).join('');
    }
    
    highlightMatch(text, query) {
        if (!query) return text;
        const regex = new regexp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="bg-cyan-400/20 text-cyan-400 rounded px-0.5">$1</mark>');
    }
    
    handleKeydown(event, inputId) {
        const resultsContainer = document.getElementById(`${inputId}-results`);
        if (resultsContainer?.classList.contains('hidden')) return;
        
        switch(event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.navigateResults(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.navigateResults(-1);
                break;
            case 'Enter':
                event.preventDefault();
                if (this.selectedIndex >= 0 && this.currentResults[this.selectedIndex]) {
                    this.selectResult(this.currentResults[this.selectedIndex].url);
                }
                break;
            case 'Escape':
                resultsContainer.classList.add('hidden');
                document.getElementById(inputId)?.blur();
                break;
        }
    }
    
    navigateResults(direction) {
        const newIndex = this.selectedIndex + direction;
        if (newIndex >= -1 && newIndex < this.currentResults.length) {
            this.selectedIndex = newIndex;
            this.highlightResult(newIndex);
        }
    }
    
    highlightResult(index) {
        this.selectedIndex = index;
        document.querySelectorAll('.search-result').forEach((el, i) => {
            el.classList.toggle('bg-white/5', i === index);
        });
    }
    
    selectResult(url) {
        if (url) {
            window.location.href = url;
        }
    }
    
    clearSearch(inputId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(`${inputId}-clear`);
        const resultsContainer = document.getElementById(`${inputId}-results`);
        
        if (input) input.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        if (resultsContainer) resultsContainer.classList.add('hidden');
        
        input?.focus();
        
        // Trigger search cleared event
        window.dispatchEvent(new CustomEvent('search-cleared', { detail: { inputId } }));
    }
}

// Initialize
window.searchManager = new SearchManager();

function handleSearch(inputId, query) {
    searchManager.handleSearch(inputId, query);
}

function handleSearchKeydown(event, inputId) {
    searchManager.handleKeydown(event, inputId);
}

function clearSearch(inputId) {
    searchManager.clearSearch(inputId);
}

// Close search results on outside click
document.addEventListener('click', (e) => {
    const searchContainers = document.querySelectorAll('[id$="-results"]');
    searchContainers.forEach(container => {
        const inputId = container.id.replace('-results', '');
        const searchGroup = document.getElementById(inputId)?.closest('.group');
        
        if (searchGroup && !searchGroup.contains(e.target)) {
            container.classList.add('hidden');
        }
    });
});

/* === sidebar.html === */
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown?.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    const toggle = e.target.closest('[onclick="toggleUserDropdown()"]');
    if (dropdown && !toggle && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// Handle window resize for mobile sidebar
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        document.getElementById('sidebar')?.classList.remove('-translate-x-full');
    }
});

/* === stat-card.html === */
// Animate stat value on scroll
document.addEventListener('DOMContentLoaded', () => {
    const statValues = document.querySelectorAll('.stat-value[data-value]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                const targetValue = parseFloat(element.dataset.value);
                const duration = 1500;
                const startTime = performance.now();
                const startValue = 0;
                
                function update(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const current = startValue + (targetValue - startValue) * eased;
                    
                    element.textContent = targetValue >= 1000 ? 
                        Math.round(current).toLocaleString() : 
                        current.toFixed(1);
                    
                    if (progress < 1) {
                        requestAnimationFrame(update);
                    } else {
                        element.textContent = element.dataset.formatted || 
                            (targetValue >= 1000 ? 
                                Math.round(targetValue).toLocaleString() : 
                                targetValue.toFixed(1));
                    }
                }
                
                requestAnimationFrame(update);
                observer.unobserve(element);
            }
        });
    }, { threshold: 0.5 });
    
    statValues.forEach(value => observer.observe(value));
});

// Initialize sparklines if data provided
document.querySelectorAll('canvas[id^="sparkline-"]').forEach(canvas => {
    const data = JSON.parse(canvas.dataset.sparkline || '[]');
    if (data.length > 0) {
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data: data,
                    borderColor: canvas.dataset.color || '#00f0ff',
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: (canvas.dataset.color || '#00f0ff') + '10',
                    pointRadius: 0,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }
});

/* Theme handling moved to /static/js/theme-manager.js */

/* === toast.html === */
class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        this.maxToasts = 5;
    }
    
    show(message, type = 'info', duration = 4000, title = '') {
        // Remove excess toasts
        while (this.container.children.length >= this.maxToasts) {
            this.container.firstChild.remove();
        }
        
        // Get template
        const template = document.getElementById('toast-template');
        const toast = template.content.cloneNode(true).querySelector('.toast');
        
        // Configure toast
        const configs = {
            success: {
                border: 'border-green-400',
                bg: 'bg-green-400/10',
                icon: '<i class="fas fa-check-circle text-green-400"></i>',
                progress: 'bg-green-400'
            },
            error: {
                border: 'border-red-400',
                bg: 'bg-red-400/10',
                icon: '<i class="fas fa-exclamation-circle text-red-400"></i>',
                progress: 'bg-red-400'
            },
            warning: {
                border: 'border-yellow-400',
                bg: 'bg-yellow-400/10',
                icon: '<i class="fas fa-exclamation-triangle text-yellow-400"></i>',
                progress: 'bg-yellow-400'
            },
            info: {
                border: 'border-cyan-400',
                bg: 'bg-cyan-400/10',
                icon: '<i class="fas fa-info-circle text-cyan-400"></i>',
                progress: 'bg-cyan-400'
            }
        };
        
        const config = configs[type] || configs.info;
        
        toast.classList.add(config.border, config.bg);
        toast.querySelector('.toast-icon').innerHTML = config.icon;
        toast.querySelector('.toast-title').textContent = title || type.charAt(0).toUpperCase() + type.slice(1);
        toast.querySelector('.toast-message').textContent = message;
        
        const progressBar = toast.querySelector('.toast-progress');
        progressBar.classList.add(config.progress);
        progressBar.style.setProperty('--duration', duration + 'ms');
        progressBar.style.width = '100%';
        
        // Add to container
        this.container.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
        
        // Animate progress bar
        requestAnimationFrame(() => {
            progressBar.style.width = '0%';
        });
        
        // Auto remove
        setTimeout(() => {
            toast.style.transform = 'translateX(130%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
        
        return toast;
    }
    
    success(message, title = 'Success') {
        return this.show(message, 'success', 4000, title);
    }
    
    error(message, title = 'Error') {
        return this.show(message, 'error', 6000, title);
    }
    
    warning(message, title = 'Warning') {
        return this.show(message, 'warning', 5000, title);
    }
    
    info(message, title = 'Info') {
        return this.show(message, 'info', 4000, title);
    }
    
    clear() {
        this.container.innerHTML = '';
    }
}

// Initialize global toast manager
window.toast = new ToastManager();

/* === tooltip.html === */
// Initialize tooltips with click trigger for mobile
document.addEventListener('DOMContentLoaded', () => {
    const tooltips = document.querySelectorAll('.tooltip-wrapper');
    
    tooltips.forEach(tooltip => {
        const trigger = tooltip.querySelector('.tooltip-trigger');
        const content = tooltip.querySelector('.tooltip-content');
        
        if (trigger && content) {
            // Click handler for mobile
            trigger.addEventListener('click', (e) => {
                if (window.innerWidth < 768) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Close other tooltips
                    document.querySelectorAll('.tooltip-content.mobile-visible')
                        .forEach(t => t.classList.remove('mobile-visible'));
                    
                    content.classList.toggle('mobile-visible');
                }
            });
        }
    });
    
    // Close tooltips on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.tooltip-content.mobile-visible')
            .forEach(t => t.classList.remove('mobile-visible'));
    });
});

// Add mobile-visible style
const tooltipStyle = document.createElement('style');
tooltipStyle.textContent = `
    .tooltip-content.mobile-visible {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
    }
`;
document.head.appendChild(tooltipStyle);

/* === user-avatar.html === */
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu?.classList.toggle('hidden');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    const toggle = e.target.closest('[onclick="toggleUserMenu()"]');
    
    if (menu && !menu.classList.contains('hidden') && !toggle && !menu.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// Fetch user info and update avatar
async function updateUserInfo() {
    try {
        const response = await fetch('/api/v1/auth/me');
        
        if (response.ok) {
            const user = await response.json();
            
            const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
            const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
            
            // Update avatar displays
            ['avatar-initials', 'menu-initials'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = initials;
            });
            
            ['avatar-name', 'menu-name'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = name;
            });
            
            const avatarRole = document.getElementById('avatar-role');
            if (avatarRole) avatarRole.textContent = user.role;
            
            const menuEmail = document.getElementById('menu-email');
            if (menuEmail) menuEmail.textContent = user.email;
        }
    } catch (error) {
        console.error('Failed to fetch user info:', error);
    }
}

// Update on page load
updateUserInfo();

/* ============================================================
 * FIXED: WebSocketStatus - includes authentication token
 * ============================================================ */
class WebSocketStatus {
    constructor() {
        this.connected = false;
        this.latency = 0;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.ws = null;
        this._queued = [];
    }
    
    /**
     * Get the authentication token from cookies or localStorage
     */
    getToken() {
        // Try to get from cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'access_token') {
                return decodeURIComponent(value);
            }
        }
        // Try localStorage as fallback
        const token = localStorage.getItem('access_token');
        if (token) {
            return token;
        }
        // Try sessionStorage as last resort
        return sessionStorage.getItem('access_token') || '';
    }
    
    connect() {
        const token = this.getToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
        
        console.log('[WebSocket] Connecting with token:', token ? 'Token present (length: ' + token.length + ')' : 'No token');
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('[WebSocket] Connected successfully');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.updateUI();
                this.startPing();
                
                // Flush queued messages
                if (this._queued && this._queued.length > 0) {
                    this._queued.forEach(m => {
                        try { this.ws.send(JSON.stringify(m)); } catch(e) { console.warn('Failed queued send', e); }
                    });
                    this._queued = [];
                }
                // Subscribe to channels
                try { this.ws.send(JSON.stringify({ type: 'subscribe_metrics' })); } catch(e) { console.warn('Subscribe failed', e); }
                try { this.ws.send(JSON.stringify({ type: 'subscribe_predictions' })); } catch(e) { console.warn('Subscribe failed', e); }
            };
            
            this.ws.onclose = (event) => {
                console.log('[WebSocket] Disconnected. Code:', event.code, 'Reason:', event.reason);
                this.connected = false;
                this.stopPing();
                this.updateUI();
                // Only attempt reconnect if not a normal closure
                if (event.code !== 1000 && event.code !== 1001) {
                    this.reconnect();
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
                this.connected = false;
                this.updateUI();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'pong') {
                        this.latency = Date.now() - (data.server_time || Date.now());
                        this.updateLatency();
                    } else if (data.type === 'connection_established') {
                        console.log('[WebSocket] Connection established:', data.message);
                    } else if (data.type === 'error') {
                        console.error('[WebSocket] Server error:', data.message);
                    }
                    // Dispatch a global event for other modules
                    window.dispatchEvent(new CustomEvent('ws-message', { detail: data }));
                } catch (e) {
                    console.error('[WebSocket] Failed to parse message:', e);
                }
            };
        } catch (error) {
            console.error('[WebSocket] Connection failed:', error);
            this.connected = false;
            this.updateUI();
            this.reconnect();
        }
    }

    sendMessage(msg) {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(msg));
            } else {
                // Queue messages until connected
                this._queued = this._queued || [];
                this._queued.push(msg);
            }
        } catch (e) {
            console.error('[WebSocket] Failed to send message:', e);
        }
    }
    
    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.warn('[WebSocket] Max reconnect attempts reached');
        }
    }
    
    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, 10000); // Ping every 10 seconds
    }
    
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    updateUI() {
        const statusEl = document.getElementById('ws-status');
        const statusText = document.getElementById('ws-status-text');
        
        if (statusEl) {
            statusEl.className = this.connected ?
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-green-400/10 text-green-400 border border-green-400/30' :
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-400/10 text-red-400 border border-red-400/30';
        }
        
        if (statusText) {
            statusText.textContent = this.connected ? 'Connected' : 'Disconnected';
        }
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('ws-status-changed', {
            detail: { connected: this.connected }
        }));
    }
    
    updateLatency() {
        const latencyEl = document.getElementById('ws-latency');
        if (latencyEl) {
            latencyEl.textContent = `${this.latency}ms`;
        }
    }
}

// Initialize WebSocket status
const wsStatus = new WebSocketStatus();

// Ensure charts update when theme changes
window.addEventListener('themechange', () => {
    if (window.Chart && typeof Chart.getChart === 'function') {
        document.querySelectorAll('canvas').forEach(c => {
            try {
                const ch = Chart.getChart(c);
                if (ch && typeof ch.update === 'function') ch.update();
            } catch (e) { /* ignore canvas without charts */ }
        });
    }
});

// Connect WebSocket after DOM is ready or immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait a moment for auth to be ready
        setTimeout(() => wsStatus.connect(), 500);
    });
} else {
    // Wait a moment for auth to be ready
    setTimeout(() => wsStatus.connect(), 500);
}