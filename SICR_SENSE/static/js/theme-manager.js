/**
 * SICRSense Theme Manager
 * Supports the seven cinematic themes used across the experience
 */

class ThemeManager {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'sicrsense-theme';
        this.toggleSelector = options.toggleSelector || ['#themeToggle', '#theme-toggle'];
        this.iconSelector = options.iconSelector || ['#themeIcon', '#theme-icon'];
        this.themeButtonsSelector = options.themeButtonsSelector || '[data-theme-option], .theme-btn';
        this.themes = ['dark', 'light', 'cyber', 'aurora', 'sunset', 'ocean', 'noir'];
        this.currentTheme = 'dark';
        this.initialized = false;
        this.init();
    }

    init() {
        if (this.initialized) return;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._setupTheme());
        } else {
            this._setupTheme();
        }
        this.initialized = true;
    }

    _setupTheme() {
        this.loadThemePreference();
        this._bindToggleButtons();
        this._updateActiveThemeButton();
    }

    _bindToggleButtons() {
        if (this._delegatedThemeHandler) {
            document.removeEventListener('click', this._delegatedThemeHandler);
        }

        this._delegatedThemeHandler = (event) => {
            const target = event.target.closest('[data-theme-option], #themeToggle, #theme-toggle');
            if (!target) return;

            event.preventDefault();
            event.stopPropagation();

            if (target.id === 'themeToggle' || target.id === 'theme-toggle') {
                this.toggle();
                return;
            }

            const themeName = target.getAttribute('data-theme-option') || target.getAttribute('data-theme');
            if (themeName) {
                this.setTheme(themeName);
            }
        };

        document.addEventListener('click', this._delegatedThemeHandler);
        this._updateActiveThemeButton();
    }

    loadThemePreference() {
        try {
            const saved = localStorage.getItem(this.storageKey) || localStorage.getItem('theme');
            this.setTheme(this._normalizeTheme(saved));
        } catch (e) {
            console.warn('Failed to load theme preference:', e);
            this.setTheme('dark');
        }
    }

    _normalizeTheme(themeName) {
        return this.themes.includes(themeName) ? themeName : 'dark';
    }

    setTheme(themeName) {
        const normalizedTheme = this._normalizeTheme(themeName);
        this.currentTheme = normalizedTheme;

        document.body.classList.remove(...this.themes);
        document.body.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove(...this.themes);

        if (normalizedTheme !== 'dark') {
            document.body.classList.add(normalizedTheme);
            document.body.setAttribute('data-theme', normalizedTheme);
            document.documentElement.setAttribute('data-theme', normalizedTheme);
            document.documentElement.classList.add(normalizedTheme);
        }

        this._updateIcon(normalizedTheme);
        this._updateActiveThemeButton();

        try {
            localStorage.setItem(this.storageKey, normalizedTheme);
        } catch (e) {
            console.warn('Failed to save theme preference:', e);
        }

        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { theme: normalizedTheme, isDark: normalizedTheme === 'dark' }
        }));
    }

    toggle() {
        const index = this.themes.indexOf(this.currentTheme);
        const nextTheme = this.themes[(index + 1) % this.themes.length];
        this.setTheme(nextTheme);
    }

    _updateIcon(themeName) {
        const iconNames = { dark: 'moon', light: 'sun', cyber: 'microchip', aurora: 'sparkles', sunset: 'fire', ocean: 'water', noir: 'moon' };
        const iconName = iconNames[themeName] || 'moon';
        const selectors = Array.isArray(this.iconSelector) ? this.iconSelector : [this.iconSelector];
        selectors.forEach((selector) => {
            const iconEl = document.querySelector(selector);
            if (!iconEl) return;
            iconEl.className = `fas fa-${iconName} text-gray-400 group-hover:text-cyan-400 transition-colors`;
            if (iconEl.id === 'themeIcon' || iconEl.id === 'theme-icon') {
                iconEl.classList.add('text-lg');
            }
        });
    }

    _updateActiveThemeButton() {
        document.querySelectorAll(this.themeButtonsSelector).forEach((button) => {
            const buttonTheme = button.getAttribute('data-theme-option') || button.getAttribute('data-theme');
            const isActive = buttonTheme === this.currentTheme;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    getTheme() {
        return this.currentTheme;
    }

    isDarkMode() {
        return this.currentTheme === 'dark';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.themeManager && (document.querySelector('#themeToggle') || document.querySelector('#theme-toggle'))) {
        window.themeManager = new ThemeManager();
    }
});

window.toggleTheme = () => {
    if (window.themeManager) {
        window.themeManager.toggle();
    } else {
        const manager = new ThemeManager();
        manager.toggle();
    }
};

window.initializeTheme = (options) => {
    window.themeManager = new ThemeManager(options);
    return window.themeManager;
};
