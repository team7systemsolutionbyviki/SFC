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
const expensesBody = document.getElementById('expenses-body');
const expenseForm = document.getElementById('expense-form');
const expenseDateFilter = document.getElementById('expense-date-filter');

// Stats Elements
const statOrdersEl = document.getElementById('stat-orders');
const statRevenueEl = document.getElementById('stat-revenue');
const statProductsEl = document.getElementById('stat-products');
const dashDateFilter = document.getElementById('dashboard-date-filter');
const orderSearchInput = document.getElementById('order-search');
const productSearchInput = document.getElementById('product-search');
const orderDateFilter = document.getElementById('order-date-filter');
const statExpensesEl = document.getElementById('stat-expenses');
const statProfitEl = document.getElementById('stat-profit');
const footerTotalExpenses = document.getElementById('footer-total-expenses');

// Global State
let allProducts = [];
let allOrders = [];
let allLocations = [];
let allCategories = [];
let allExpenses = [];
let posCart = [];

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
        updatePOSDeliveryOptions();
    });

    // 2. Products Listener
    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyProductSearch();
        renderPOSProducts();
        updateDashboardData();
    });

    // 📁 2.5 Categories Listener
    onSnapshot(collection(db, "categories"), (snap) => {
        allCategories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategories();
        updateProductModalCategories();
        updatePOSCategoryFilter();
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

    // 4. Expenses Listener
    onSnapshot(collection(db, "expenses"), (snap) => {
        allExpenses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyExpenseFilters();
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
            if (navItem.dataset.view === 'pos') renderPOSProducts();
            if (navItem.dataset.view === 'reports') initReportDates();
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

    // 4. Expense Logic
    const sodToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    const filteredExpenses = allExpenses.filter(ex => {
        const time = new Date(ex.date).getTime();
        if (filter === 'today') return time >= sodToday;
        if (filter === 'yesterday') return time >= (sodToday - 86400000) && time < sodToday;
        if (filter === '7days') return time >= (Date.now() - 7 * 86400000);
        if (filter === '30days') return time >= (Date.now() - 30 * 86400000);
        return true;
    });

    const totalExpenses = filteredExpenses.reduce((acc, ex) => acc + (parseFloat(ex.amount) || 0), 0);
    if (statExpensesEl) statExpensesEl.innerText = `₹${Math.round(totalExpenses)}`;

    // 5. Net Profit
    const profit = revenue - totalExpenses;
    if (statProfitEl) {
        statProfitEl.innerText = `₹${Math.round(profit)}`;
        statProfitEl.style.color = profit >= 0 ? '#2ecc71' : 'var(--error)';
    }
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
    
    if (!next) return;

    try {
        console.log(`Updating order ${id} from ${current} to ${next}`);
        const docRef = doc(db, "orders", id);
        await updateDoc(docRef, { status: next });
        showToast(`✅ Order moved to ${next}`);
    } catch (err) {
        console.error("Order Update Error:", err);
        showToast("Failed to update status", "error");
    }
};

window.cancelOrder = async (id) => {
    if (confirm("Are you sure you want to CANCEL this order?")) {
        try {
            console.log(`Cancelling order ${id}`);
            const docRef = doc(db, "orders", id);
            await updateDoc(docRef, { status: 'Cancelled' });
            showToast("❌ Order Cancelled", "info");
        } catch (err) {
            console.error("Order Cancel Error:", err);
            showToast("Failed to cancel order", "error");
        }
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
    msg += `*Hey ${o.customerName || 'Guest'}!* 👋✨\n`;
    msg += `*Type:* ${o.orderType}${o.deliveryArea && o.deliveryArea !== 'N/A' ? ` (${o.deliveryArea})` : ''} 📦\n\n`;
    
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

// --- Categories Management ---
function renderCategories() {
    const categoriesBody = document.getElementById('categories-body');
    if (!categoriesBody) return;
    categoriesBody.innerHTML = '';
    
    allCategories.forEach(cat => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${cat.name}</strong></td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteCategory('${cat.id}')">Delete</button>
            </td>
        `;
        categoriesBody.appendChild(tr);
    });
}

function updateProductModalCategories() {
    const pCategorySelect = document.getElementById('p-category');
    if (!pCategorySelect) return;
    
    const currentVal = pCategorySelect.value;
    pCategorySelect.innerHTML = '';
    
    allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        pCategorySelect.appendChild(opt);
    });
    
    if (currentVal) pCategorySelect.value = currentVal;
}

const categoryForm = document.getElementById('category-form');
if (categoryForm) {
    categoryForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('cat-name').value;
        if (!name) return;
        await addDoc(collection(db, "categories"), { name });
        categoryForm.reset();
        showToast("Category Added!");
    };
}

window.deleteCategory = async (id) => {
    if (confirm("Delete this category? Items in this category will still exist.")) {
        await deleteDoc(doc(db, "categories", id));
        showToast("Category Removed", "error");
    }
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

// --- Expense Management ---
function renderExpenses(expenses) {
    if (!expensesBody) return;
    expensesBody.innerHTML = '';
    
    const sorted = [...expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    let total = 0;

    sorted.forEach(ex => {
        total += parseFloat(ex.amount) || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${ex.date}</td>
            <td><strong>${ex.name}</strong></td>
            <td>₹${ex.amount}</td>
            <td><button class="btn-action btn-edit" onclick="editExpense('${ex.id}')">Edit</button></td>
        `;
        expensesBody.appendChild(tr);
    });

    if (footerTotalExpenses) footerTotalExpenses.innerText = `₹${total}`;
}

window.editExpense = (id) => {
    const ex = allExpenses.find(e => e.id === id);
    if (!ex) {
        showToast("Record not found", "error");
        return;
    }

    console.log("Editing expense:", ex);

    document.getElementById('exp-id').value = id;
    document.getElementById('exp-name').value = ex.name;
    document.getElementById('exp-amount').value = ex.amount;
    document.getElementById('exp-date').value = ex.date;

    const saveBtn = document.getElementById('btn-save-expense');
    document.getElementById('expense-form-title').innerText = "Edit Expense Details";
    saveBtn.innerText = "Update Expense Now";
    saveBtn.style.background = "#F5A623"; // Warning/Edit color
    document.getElementById('btn-cancel-expense').classList.remove('hidden');
    
    document.getElementById('expense-form').scrollIntoView({ behavior: 'smooth' });
};

window.resetExpenseForm = () => {
    document.getElementById('expense-form').reset();
    document.getElementById('exp-id').value = '';
    const saveBtn = document.getElementById('btn-save-expense');
    document.getElementById('expense-form-title').innerText = "Add New Expense";
    saveBtn.innerText = "Add Expense";
    saveBtn.style.background = "var(--primary)"; // Reset to Primary
    document.getElementById('btn-cancel-expense').classList.add('hidden');
};

function applyExpenseFilters() {
    const filter = expenseDateFilter?.value || 'all';
    let filtered = [...allExpenses];

    if (filter !== 'all') {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        filtered = allExpenses.filter(ex => {
            const time = new Date(ex.date).getTime();
            if (filter === 'today') return time >= sod;
            if (filter === 'yesterday') return time >= (sod - 86400000) && time < sod;
            if (filter === '7days') return time >= (Date.now() - 7 * 86400000);
            if (filter === '30days') return time >= (Date.now() - 30 * 86400000);
            return true;
        });
    }
    renderExpenses(filtered);
}

if (expenseForm) {
    expenseForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('exp-id').value;
        const name = document.getElementById('exp-name').value;
        const amount = parseFloat(document.getElementById('exp-amount').value);
        const date = document.getElementById('exp-date').value;
        
        console.log("Submitting expense:", { id, name, amount, date });

        try {
            if (id) {
                const docRef = doc(db, "expenses", id);
                await updateDoc(docRef, { name, amount, date, lastUpdated: new Date() });
                showToast("✅ Expense Updated!");
            } else {
                await addDoc(collection(db, "expenses"), { name, amount, date, timestamp: new Date() });
                showToast("✅ Expense Added!");
            }
            resetExpenseForm();
        } catch (err) {
            console.error("Firestore Save Error:", err);
            showToast("Failed to save: " + err.message, "error");
        }
    };
}

if (expenseDateFilter) expenseDateFilter.onchange = applyExpenseFilters;

// --- POS (Point of Sale) Logic ---
const posProductsGrid = document.getElementById('pos-products-grid');
const posCartItemsEl = document.getElementById('pos-cart-items');
const posSubtotalEl = document.getElementById('pos-subtotal');
const posTotalEl = document.getElementById('pos-total');
const posSearchInput = document.getElementById('pos-search');
const posCatFilter = document.getElementById('pos-cat-filter');
const posDeliveryLoc = document.getElementById('pos-delivery-loc');

function renderPOSProducts() {
    if (!posProductsGrid) return;
    const q = posSearchInput?.value.toLowerCase().trim() || '';
    const cat = posCatFilter?.value || 'all';

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(q);
        const matchesCat = cat === 'all' || p.category === cat;
        return matchesSearch && matchesCat && p.isAvailable !== false;
    });

    posProductsGrid.innerHTML = '';
    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pos-product-card auth-card';
        div.style.padding = '10px';
        div.style.cursor = 'pointer';
        div.style.textAlign = 'center';
        div.onclick = () => addToPOSCart(p);
        
        div.innerHTML = `
            <img src="${p.imageUrl}" style="width:100%; height:100px; object-fit:cover; border-radius:8px; margin-bottom:8px;">
            <div style="font-weight:600; font-size:0.9rem; margin-bottom:4px;">${p.name}</div>
            <div style="color:var(--primary); font-weight:bold;">₹${p.price}</div>
        `;
        posProductsGrid.appendChild(div);
    });
}

window.addToPOSCart = (product) => {
    const existing = posCart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        posCart.push({ ...product, quantity: 1 });
    }
    renderPOSCart();
    showToast(`Added ${product.name}`);
};

function renderPOSCart() {
    if (!posCartItemsEl) return;
    posCartItemsEl.innerHTML = '';
    let subtotal = 0;

    posCart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        const div = document.createElement('div');
        div.style = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #eee;';
        div.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600; font-size:0.85rem;">${item.name}</div>
                <div style="font-size:0.75rem; color:#666;">₹${item.price} x ${item.quantity}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button onclick="updatePOSQty(${index}, -1)" style="width:24px; height:24px; border-radius:4px; background:#eee;">-</button>
                <span>${item.quantity}</span>
                <button onclick="updatePOSQty(${index}, 1)" style="width:24px; height:24px; border-radius:4px; background:#eee;">+</button>
                <button onclick="removeFromPOSCart(${index})" style="color:var(--error); margin-left:8px; font-size:1.2rem;">×</button>
            </div>
        `;
        posCartItemsEl.appendChild(div);
    });

    const delFee = parseFloat(posDeliveryLoc?.value) || 0;
    const total = subtotal + delFee;

    if (posSubtotalEl) posSubtotalEl.innerText = `₹${subtotal}`;
    if (posTotalEl) posTotalEl.innerText = `₹${total}`;
}

window.updatePOSQty = (index, delta) => {
    posCart[index].quantity += delta;
    if (posCart[index].quantity <= 0) {
        posCart.splice(index, 1);
    }
    renderPOSCart();
};

window.removeFromPOSCart = (index) => {
    posCart.splice(index, 1);
    renderPOSCart();
};

window.clearPOSCart = () => {
    if (confirm("Clear current bill?")) {
        posCart = [];
        renderPOSCart();
    }
};

function updatePOSDeliveryOptions() {
    if (!posDeliveryLoc) return;
    const currentVal = posDeliveryLoc.value;
    posDeliveryLoc.innerHTML = '<option value="0" data-name="N/A">Self Pickup</option>';
    allLocations.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc.fee;
        opt.dataset.name = loc.name;
        opt.textContent = `${loc.name} (+₹${loc.fee})`;
        posDeliveryLoc.appendChild(opt);
    });
    posDeliveryLoc.value = currentVal;
}

function updatePOSCategoryFilter() {
    if (!posCatFilter) return;
    const currentVal = posCatFilter.value;
    posCatFilter.innerHTML = '<option value="all">All Categories</option>';
    allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        posCatFilter.appendChild(opt);
    });
    posCatFilter.value = currentVal;
}

if (posSearchInput) posSearchInput.oninput = renderPOSProducts;
if (posCatFilter) posCatFilter.onchange = renderPOSProducts;
if (posDeliveryLoc) posDeliveryLoc.onchange = renderPOSCart;

const btnCompletePOS = document.getElementById('btn-complete-pos');
if (btnCompletePOS) {
    btnCompletePOS.onclick = async () => {
        if (posCart.length === 0) return showToast("Cart is empty", "error");
        
        const name = document.getElementById('pos-cust-name').value || 'Counter Guest';
        const phone = document.getElementById('pos-cust-phone').value;
        const delFee = parseFloat(posDeliveryLoc.value) || 0;
        const delArea = posDeliveryLoc.options[posDeliveryLoc.selectedIndex].dataset.name;
        
        const subtotal = posCart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        const total = subtotal + delFee;

        btnCompletePOS.disabled = true;
        btnCompletePOS.innerText = "Processing...";

        try {
            const orderData = {
                customerName: name,
                phone: phone || 'N/A',
                items: posCart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
                totalPrice: total,
                deliveryFee: delFee,
                deliveryArea: delArea,
                orderType: delFee > 0 ? 'Delivery' : 'Pickup',
                status: 'Delivered',
                timestamp: new Date(),
                source: 'POS'
            };

            const docRef = await addDoc(collection(db, "orders"), orderData);
            showToast("Order Completed!");
            
            if (phone && phone.length >= 10) {
                sendWA(docRef.id);
            }

            // Reset POS
            posCart = [];
            document.getElementById('pos-cust-name').value = '';
            document.getElementById('pos-cust-phone').value = '';
            posDeliveryLoc.value = "0";
            renderPOSCart();
        } catch (err) {
            showToast("Error saving order", "error");
        } finally {
            btnCompletePOS.disabled = false;
            btnCompletePOS.innerText = "✅ PRINT & WHATSAPP BILL";
        }
    };
}

// --- Full Financial Reports Logic ---
const reportBody = document.getElementById('report-body');
const reportSalesEl = document.getElementById('report-sales');
const reportExpensesEl = document.getElementById('report-expenses');
const reportProfitEl = document.getElementById('report-profit');

function initReportDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('report-start').value = today;
    document.getElementById('report-end').value = today;
    generatePeriodReport();
}

async function generatePeriodReport() {
    const startStr = document.getElementById('report-start').value;
    const endStr = document.getElementById('report-end').value;
    if (!startStr || !endStr) return;

    const start = new Date(startStr).getTime();
    const end = new Date(endStr).setHours(23, 59, 59, 999);

    // 1. Filter Orders
    const filteredOrders = allOrders.filter(o => {
        const time = o.timestamp?.toMillis ? o.timestamp.toMillis() : (o.timestamp?.seconds ? o.timestamp.seconds * 1000 : 0);
        return time >= start && time <= end;
    });

    // 2. Filter Expenses
    const filteredExpenses = allExpenses.filter(ex => {
        const time = new Date(ex.date).getTime();
        return time >= start && time <= end;
    });

    // 3. Combine and Sort for Table
    const combined = [
        ...filteredOrders.map(o => {
            const itemList = (o.items || []).map(i => `${i.name} [x${i.quantity}]`).join(', ');
            return {
                date: o.timestamp?.toMillis ? o.timestamp.toMillis() : (o.timestamp?.seconds ? o.timestamp.seconds * 1000 : Date.now()),
                type: 'Order Income',
                desc: `<strong>${o.customerName || 'Guest'}</strong><br><small style="color:#666">${itemList}</small>`,
                amount: parseFloat(o.totalPrice) || 0,
                color: 'var(--success)'
            };
        }),
        ...filteredExpenses.map(ex => ({
            date: new Date(ex.date).getTime(),
            type: 'Expense Paid',
            desc: ex.name,
            amount: -(parseFloat(ex.amount) || 0),
            color: 'var(--error)'
        }))
    ].sort((a, b) => b.date - a.date);

    // 4. Summarize
    const totalSales = filteredOrders.reduce((acc, o) => acc + (parseFloat(o.totalPrice) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((acc, ex) => acc + (parseFloat(ex.amount) || 0), 0);
    const netProfit = totalSales - totalExpenses;

    // 5. Render UI
    reportSalesEl.innerText = `₹${Math.round(totalSales)}`;
    reportExpensesEl.innerText = `₹${Math.round(totalExpenses)}`;
    reportProfitEl.innerText = `₹${Math.round(netProfit)}`;
    reportProfitEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--error)';

    reportBody.innerHTML = '';
    combined.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(item.date).toLocaleString()}</td>
            <td><span class="status-badge" style="background:${item.color}; color:white;">${item.type}</span></td>
            <td>${item.desc}</td>
            <td style="font-weight:bold; color:${item.color}">${item.amount >= 0 ? '+' : ''}₹${Math.abs(item.amount)}</td>
        `;
        reportBody.appendChild(tr);
    });
}

function exportReportCSV() {
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    
    // Header
    let csv = "Financial Report (" + start + " to " + end + ")\n";
    csv += "Date,Type,Description,Amount\n";

    // Data from UI or combined logic
    const rows = Array.from(reportBody.querySelectorAll('tr'));
    rows.forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/,/g, ""));
        csv += cols.join(",") + "\n";
    });

    const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SFC_Report_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    showToast("Report Exported!");
}

document.getElementById('btn-generate-report').onclick = generatePeriodReport;
document.getElementById('btn-export-report').onclick = exportReportCSV;

// --- Logout ---
document.getElementById('admin-logout').onclick = () => {
    localStorage.removeItem('admin_session');
    signOut(auth).then(() => window.location.href = '../index.html');
};
