import { auth, db, storage } from './firebase-config.js';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc,
    query, orderBy, where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

// --- DOM Elements ---
const sidebarNav = document.querySelector('.sidebar-nav');
const productsBody = document.getElementById('products-body');
const ordersBody = document.getElementById('orders-body');
const deliveryFeesBody = document.getElementById('delivery-fees-body');
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const imgPreview = document.getElementById('image-preview');
const deliveryFeeForm = document.getElementById('delivery-fee-form');

// Stats Elements
const statOrdersEl = document.getElementById('stat-orders');
const statRevenueEl = document.getElementById('stat-revenue');
const statProductsEl = document.getElementById('stat-products');
const dashDateFilter = document.getElementById('dashboard-date-filter');
const orderSearchInput = document.getElementById('order-search');
const productSearchInput = document.getElementById('product-search');
const orderDateFilter = document.getElementById('order-date-filter');

// Global State
let allProducts = [];
let allOrders = [];
let allLocations = [];

// --- Authentication & Initialization ---
onAuthStateChanged(auth, async (user) => {
    const session = localStorage.getItem('admin_session');
    
    if (session === 'viki_super_admin') {
        document.getElementById('nav-admins')?.classList.remove('hidden');
        initAdminSystem();
        return;
    }
    if (session === 'hari_admin') {
        initAdminSystem();
        return;
    }
    
    if (!user) {
        window.location.href = '../index.html';
        return;
    }

    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().role !== 'admin') {
        window.location.href = '../customer/index.html';
        return;
    }
    initAdminSystem();
});

function initAdminSystem() {
    // 1. Delivery Fees Listener
    onSnapshot(collection(db, "locations"), (snap) => {
        allLocations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderLocations();
    });

    // 2. Products Listener
    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyProductSearch();
        updateDashboardData();
    });

    // --- Order Audio Alerts ---
    const alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    let lastOrderCount = -1;
    let soundEnabled = false;

    // Function to enable sound (Browser requirement)
    window.enableAdminSound = () => {
        soundEnabled = true;
        alertSound.play().then(() => {
            alertSound.pause();
            alertSound.currentTime = 0;
            showToast("Audio Alerts Enabled!", "success");
            document.getElementById('sound-toggle-btn').classList.add('hidden');
        }).catch(err => console.error("Sound init failed", err));
    };

    // 3. Orders Listener
    const ordersQ = query(collection(db, "orders"));
    onSnapshot(ordersQ, (snapshot) => {
        allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Play alert if new order arrives (and it's not the first load)
        if (lastOrderCount !== -1 && allOrders.length > lastOrderCount) {
            if (soundEnabled) {
                alertSound.play().catch(e => console.log("Sound blocked", e));
            }
            showToast("🔔 NEW ORDER RECEIVED!", "info");
        }
        lastOrderCount = allOrders.length;

        applyOrderFilters();
        updateDashboardData();
    });
}

// --- Navigation ---
if (sidebarNav) {
    sidebarNav.onclick = (e) => {
        const navItem = e.target.closest('.nav-item');
        if (!navItem || !navItem.dataset.view) return;
        
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
        
        const targetId = `view-${navItem.dataset.view}`;
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.classList.remove('hidden');
            navItem.classList.add('active');
            if (navItem.dataset.view === 'dashboard') updateDashboardData();
        }
    };
}

// --- Dashboard Logic ---
function updateDashboardData() {
    const filter = dashDateFilter?.value || 'all';

    // 1. Product Count
    const activeMenuCount = allProducts.filter(p => p.isAvailable !== false).length;
    if (statProductsEl) statProductsEl.innerText = activeMenuCount;

    // 2. Order Filtering
    let filtered = [...allOrders];
    if (filter !== 'all') {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        filtered = allOrders.filter(o => {
            const time = o.timestamp?.toMillis ? o.timestamp.toMillis() : (o.timestamp?.seconds ? o.timestamp.seconds * 1000 : 0);
            if (filter === 'today') return time >= sod;
            if (filter === 'yesterday') return time >= (sod - 86400000) && time < sod;
            if (filter === '7days') return time >= (Date.now() - 7 * 86400000);
            if (filter === '30days') return time >= (Date.now() - 30 * 86400000);
            return true;
        });
    }

    if (statOrdersEl) statOrdersEl.innerText = filtered.length;

    // 3. Revenue
    const revenue = filtered.reduce((acc, o) => acc + (parseFloat(o.totalPrice) || 0), 0);
    if (statRevenueEl) statRevenueEl.innerText = `₹${Math.round(revenue)}`;
}
if (dashDateFilter) dashDateFilter.onchange = updateDashboardData;

// --- Product Management ---
// --- Sorting Logic ---
let currentSort = { field: 'date', order: 'desc' };

function applySorting(products) {
    return products.sort((a, b) => {
        let valA = a[currentSort.field];
        let valB = b[currentSort.field];

        if (currentSort.field === 'name' || currentSort.field === 'category') {
            valA = (valA || '').toLowerCase();
            valB = (valB || '').toLowerCase();
            return currentSort.order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (currentSort.field === 'price') {
            return currentSort.order === 'asc' ? valA - valB : valB - valA;
        } else {
            // Default: Newest to Oldest (Date)
            const timeA = new Date(a.lastUpdated || 0).getTime();
            const timeB = new Date(b.lastUpdated || 0).getTime();
            return currentSort.order === 'desc' ? timeB - timeA : timeA - timeB;
        }
    });
}

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.order = 'asc';
    }
    showToast(`Sorting by ${field} (${currentSort.order})`, "info");
    applyProductSearch();
}

document.getElementById('sort-name').onclick = () => handleSort('name');
document.getElementById('sort-category').onclick = () => handleSort('category');
document.getElementById('sort-price').onclick = () => handleSort('price');

function renderProducts(products) {
    const sorted = applySorting([...products]); 
    if (!productsBody) return;
    productsBody.innerHTML = '';
    sorted.forEach(p => {
        const tr = document.createElement('tr');
        const isAvailable = p.isAvailable !== false;
        tr.innerHTML = `
            <td><img src="${p.imageUrl}" class="td-img"></td>
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>₹${p.price}</td>
            <td>
                <button class="status-badge ${isAvailable ? 'status-Delivered' : 'status-Pending'}" 
                        onclick="toggleAvailability('${p.id}', ${isAvailable})">
                    ${isAvailable ? 'Available' : 'Unavailable'}
                </button>
            </td>
            <td>
                <button class="btn-action btn-edit" onclick="openEditModal('${p.id}')">Edit</button>
                <button class="btn-action btn-delete" style="background:var(--error)" onclick="deleteProduct('${p.id}')">Delete</button>
            </td>
        `;
        productsBody.appendChild(tr);
    });
}

function applyProductSearch() {
    const q = productSearchInput?.value.toLowerCase().trim() || '';
    const filtered = allProducts.filter(p => 
        p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
    renderProducts(filtered);
}
if (productSearchInput) productSearchInput.oninput = applyProductSearch;

window.toggleAvailability = async (id, current) => {
    await updateDoc(doc(db, "products", id), { isAvailable: !current });
    showToast("Menu updated!");
};

document.getElementById('open-product-modal').onclick = () => {
    productForm.reset();
    document.getElementById('product-id').value = '';
    document.getElementById('modal-title').innerText = 'Add Food Item';
    imgPreview.innerHTML = '';
    productModal.classList.remove('hidden');
};

document.getElementById('close-modal').onclick = () => productModal.classList.add('hidden');

productForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const name = document.getElementById('p-name').value;
    const price = parseFloat(document.getElementById('p-price').value);
    const category = document.getElementById('p-category').value;
    const desc = document.getElementById('p-desc').value;
    const imgFile = document.getElementById('p-image').files[0];

    const btn = document.getElementById('save-product');
    btn.disabled = true;

    try {
        let imageUrl = '';
        if (imgFile) {
            const reader = new FileReader();
            imageUrl = await new Promise((res) => {
                reader.onload = (re) => res(re.target.result);
                reader.readAsDataURL(imgFile);
            });
        } else if (id) {
            imageUrl = allProducts.find(x => x.id === id).imageUrl;
        }

        const data = { name, price, category, description: desc, imageUrl, lastUpdated: new Date() };

        if (id) {
            await updateDoc(doc(db, "products", id), data);
            showToast("Updated!");
        } else {
            await addDoc(collection(db, "products"), data);
            showToast("Added!");
        }
        productModal.classList.add('hidden');
    } catch (err) {
        showToast("Error saving", "error");
    } finally {
        btn.disabled = false;
    }
};

// --- Excel (CSV) Export & Import ---
const exportCsvBtn = document.getElementById('export-csv');
const importCsvTrigger = document.getElementById('import-csv-trigger');
const importCsvInput = document.getElementById('import-csv');

if (exportCsvBtn) {
    exportCsvBtn.onclick = () => {
        if (allProducts.length === 0) return showToast("No products found to export");
        
        let csvContent = "data:text/csv;charset=utf-8,Name,Category,Price,Description\n";
        allProducts.forEach(p => {
            const row = `"${p.name}","${p.category}","${p.price}","${p.description || ''}"\n`;
            csvContent += row;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "sfc-inventory.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast("Excel/CSV file exported!");
    };
}

if (importCsvTrigger) {
    importCsvTrigger.onclick = () => importCsvInput.click();
}

if (importCsvInput) {
    importCsvInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (re) => {
            try {
                const text = re.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== "");
                
                // Skip Header
                showToast(`Importing ${rows.length - 1} items...`, "info");
                
                for (let i = 1; i < rows.length; i++) {
                    const cols = rows[i].split(',').map(c => c.replace(/"/g, "").trim());
                    if (cols.length >= 3) {
                        const productData = {
                            name: cols[0],
                            category: cols[1],
                            price: parseFloat(cols[2]) || 0,
                            description: cols[3] || '',
                            imageUrl: 'https://via.placeholder.com/300x200?text=Food',
                            isAvailable: true,
                            lastUpdated: new Date().toISOString()
                        };
                        await addDoc(collection(db, "products"), productData);
                    }
                }
                showToast("All Excel data imported!");
                importCsvInput.value = "";
            } catch (err) {
                showToast("Import failed: Select a valid CSV menu", "error");
            }
        };
        reader.readAsText(file);
    };
}

window.openEditModal = (id) => {
    const p = allProducts.find(x => x.id === id);
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-category').value = p.category;
    document.getElementById('p-desc').value = p.description;
    imgPreview.innerHTML = `<img src="${p.imageUrl}">`;
    document.getElementById('modal-title').innerText = 'Edit Food Item';
    productModal.classList.remove('hidden');
};

window.deleteProduct = async (id) => {
    if (confirm("Delete this food?")) {
        await deleteDoc(doc(db, "products", id));
        showToast("Deleted", "error");
    }
};

// --- Order Management ---
function renderOrders(orders) {
    if (!ordersBody) return;
    ordersBody.innerHTML = '';
    const sorted = [...orders].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    sorted.forEach(o => {
        const tr = document.createElement('tr');
        const orderId = o.id.substring(0, 6).toUpperCase();
        
        // --- Build Item List String ---
        const itemsList = o.items.map(i => `• ${i.name} [x${i.quantity}]`).join('<br>');

        tr.innerHTML = `
            <td>#${orderId}</td>
            <td>
                <div class="cust-info">
                    <strong>${o.customerName || 'Guest'}</strong><br>
                    <small>📞 ${o.phone || 'N/A'}</small><br>
                    <small>📦 <strong>${o.orderType || 'Pickup'}</strong></small>
                    ${o.mapLink ? `<br><a href="${o.mapLink}" target="_blank" class="map-btn">📍 View Map</a>` : ''}
                    <div style="margin-top: 8px; font-size: 0.85rem; color: var(--primary);">
                        <strong>Items:</strong><br>
                        ${itemsList}
                    </div>
                </div>
            </td>
            <td>₹${o.totalPrice}</td>
            <td><span class="status-badge status-${o.status}">${o.status}</span></td>
            <td>
                ${o.status !== 'Delivered' && o.status !== 'Cancelled' ? `
                    <button class="btn-action" onclick="updateOrderStatus('${o.id}', '${o.status}')">Update</button>
                    <button class="btn-action" style="background:var(--error)" onclick="cancelOrder('${o.id}')">Cancel</button>
                ` : ''}
                <button class="btn-action" style="background:#25d366" onclick="sendWA('${o.id}')">📱 Bill</button>
            </td>
        `;
        ordersBody.appendChild(tr);
    });
}

function applyOrderFilters() {
    const q = orderSearchInput?.value.toLowerCase().trim() || '';
    const dateRange = orderDateFilter?.value || 'all';
    
    let filtered = [...allOrders];

    if (dateRange !== 'all') {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        filtered = filtered.filter(o => {
            // If timestamp is null (new order syncing), show it in 'today'
            if (!o.timestamp) return dateRange === 'today'; 
            
            const time = (o.timestamp?.seconds || 0) * 1000;
            if (dateRange === 'today') return time >= sod;
            if (dateRange === 'yesterday') return time >= (sod-86400000) && time < sod;
            if (dateRange === '7days') return time >= (Date.now() - 7*86400000);
            return true;
        });
    }

    if (q) {
        filtered = filtered.filter(o => 
            o.id.toLowerCase().includes(q) || 
            (o.customerName && o.customerName.toLowerCase().includes(q)) ||
            (o.phone && o.phone.includes(q))
        );
    }
    renderOrders(filtered);
}
if (orderSearchInput) orderSearchInput.oninput = applyOrderFilters;
if (orderDateFilter) orderDateFilter.onchange = applyOrderFilters;

window.updateOrderStatus = async (id, current) => {
    const steps = ['Pending', 'Preparing', 'On the Way', 'Delivered'];
    const next = steps[steps.indexOf(current) + 1];
    if (next && confirm(`Move order to ${next}?`)) {
        await updateDoc(doc(db, "orders", id), { status: next });
        showToast(`Order is now ${next}!`);
    }
};

window.cancelOrder = async (id) => {
    if (confirm("Cancel this order?")) {
        await updateDoc(doc(db, "orders", id), { status: 'Cancelled' });
        showToast("Order Cancelled", "info");
    }
};

window.sendWA = (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;

    // --- Clean Phone Number ---
    let phoneNum = o.phone || '';
    phoneNum = phoneNum.replace(/\D/g, ''); 
    if (phoneNum.length === 10) phoneNum = '91' + phoneNum;

    // --- Price Logic ---
    const foodTotal = o.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const delFee = parseFloat(o.deliveryFee) || 0;

    // --- Build Clean Professional Receipt ---
    let msg = `🍽️ *SFC FOOD - ORDER BILL*\n\n`;
    msg += `*ID:* #${o.id.substring(0, 6).toUpperCase()}\n`;
    msg += `*Type:* ${o.orderType}${o.deliveryArea && o.deliveryArea !== 'N/A' ? ` (${o.deliveryArea})` : ''}\n\n`;
    
    msg += `*ITEMS LIST:*\n`;
    o.items.forEach(i => {
        msg += `• ${i.name} [x${i.quantity}] - ₹${i.price * i.quantity}\n`;
    });
    msg += `\n`;
    
    msg += `*PRICE BREAKDOWN:*\n`;
    msg += `Food total: ₹${foodTotal}\n`;
    if (delFee > 0) msg += `Delivery charge: +₹${delFee}\n`;
    
    msg += `\n*AMOUNT TO PAY: ₹${o.totalPrice}*\n`;
    msg += `*Status:* ${o.status || 'Pending'}\n\n`;
    
    msg += `❤ *Thank you for choosing SFC FOOD!* ❤\n`;
    msg += `_We hope you enjoy your meal. Order again soon!_ 🍣🥙🍕🏮🍱`;

    window.open(`https://wa.me/${phoneNum}?text=${encodeURIComponent(msg)}`, '_blank');
};

// --- Delivery Fees Management ---
function renderLocations() {
    if (!deliveryFeesBody) return;
    deliveryFeesBody.innerHTML = '';
    allLocations.forEach(loc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${loc.name}</strong></td>
            <td>₹${loc.fee}</td>
            <td><button class="btn-action btn-delete" onclick="deleteLoc('${loc.id}')">Remove</button></td>
        `;
        deliveryFeesBody.appendChild(tr);
    });
}

if (deliveryFeeForm) {
    deliveryFeeForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('loc-name').value;
        const fee = parseFloat(document.getElementById('loc-fee').value);
        await addDoc(collection(db, "locations"), { name, fee });
        deliveryFeeForm.reset();
        showToast("Area added!");
    };
}

window.deleteLoc = async (id) => {
    if (confirm("Remove area?")) {
        await deleteDoc(doc(db,"locations", id));
        showToast("Deleted");
    }
};

// --- Logout ---
document.getElementById('admin-logout').onclick = () => {
    localStorage.removeItem('admin_session');
    signOut(auth).then(() => window.location.href = '../index.html');
};
