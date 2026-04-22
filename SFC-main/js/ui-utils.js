export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

export function showLoader(elementId) {
    const parent = document.getElementById(elementId);
    if (!parent) return;
    
    parent.innerHTML = '';
    const loader = document.createElement('div');
    loader.className = 'loader centered';
    parent.appendChild(loader);
}

export function hideLoader(elementId, html = '') {
    const parent = document.getElementById(elementId);
    if (!parent) return;
    parent.innerHTML = html;
}
