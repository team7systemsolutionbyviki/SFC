// Theme Management Module
const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.apply(savedTheme);
        this.injectToggleButton();
    },

    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        this.apply(next);
    },

    injectToggleButton() {
        // Only inject if not already present
        if (document.getElementById('theme-toggle')) return;

        const btn = document.createElement('button');
        btn.id = 'theme-toggle';
        btn.className = 'theme-toggle-btn fade-in';
        btn.innerHTML = '🌓';
        btn.title = 'Switch Light/Dark Mode';
        btn.onclick = () => this.toggle();
        
        document.body.appendChild(btn);

        // Styling for the toggle button
        const style = document.createElement('style');
        style.textContent = `
            .theme-toggle-btn {
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 45px;
                height: 45px;
                border-radius: 50%;
                background: var(--primary);
                color: white;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                border: 2px solid rgba(255, 255, 255, 0.3);
                z-index: 10001;
                transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .theme-toggle-btn:hover {
                transform: scale(1.1);
            }
            [data-theme="dark"] .theme-toggle-btn {
                background: #333;
                color: #fff;
                border-color: #444;
            }
        `;
        document.head.appendChild(style);
    }
};

ThemeManager.init();
export default ThemeManager;
