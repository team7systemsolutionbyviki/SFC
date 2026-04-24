import { auth, db, storage } from './firebase-config.js';
import {
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc, setDoc,
    query, orderBy, where, serverTimestamp
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
const customersBody = document.getElementById('customers-body');
const customerSearchInput = document.getElementById('customer-search');

// Global State
let allProducts = [];
let allOrders = [];
let allLocations = [];
let allCategories = [];
let allExpenseCategories = [];
let allExpenses = [];
let allCoupons = [];
let allCustomOrders = [];
let allUnits = [];
let allPayments = [];
let allInventoryItems = [];
let allPurchases = [];
let pendingGrmProduct = null;
let posCart = [];
let posPaymentMethod = 'CASH';
let shopSettings = { schedule: {} };
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
        renderCustomers();
        updatePOSCustomerSuggestions();
    });

    // 4. Expenses Listener
    onSnapshot(collection(db, "expenses"), (snap) => {
        allExpenses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyExpenseFilters();
        updateDashboardData();
    });

    // 5. Expense Categories Listener
    onSnapshot(collection(db, "expense_categories"), (snap) => {
        allExpenseCategories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderExpenseCategories();
        updateExpenseFormCategories();

        // Auto-seed if empty
        if (allExpenseCategories.length === 0) {
            seedExpenseCategories();
        }
    });

    // 6. Shop settings listener
    onSnapshot(doc(db, "settings", "shop"), (snap) => {
        if (snap.exists()) {
            shopSettings = snap.data();
            // Migrating old format to new format if needed
            if (!shopSettings.schedule) {
                const oldOpen = shopSettings.open || '09:00';
                const oldClose = shopSettings.close || '22:00';
                shopSettings = { schedule: {} };
                DAYS_OF_WEEK.forEach(day => {
                    shopSettings.schedule[day] = { open: oldOpen, close: oldClose, isClosed: false };
                });
                setDoc(doc(db, "settings", "shop"), shopSettings);
            }
            updateShopSettingsUI();
        } else {
            // Set defaults if not exist
            const initial = { schedule: {} };
            DAYS_OF_WEEK.forEach(day => {
                initial.schedule[day] = { open: '09:00', close: '22:00', isClosed: false };
            });
            setDoc(doc(db, "settings", "shop"), initial);
        }
    });

    // 7. Coupons Listener
    onSnapshot(collection(db, "coupons"), (snap) => {
        allCoupons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCoupons();
    });

    // 8. Custom Orders Listener
    onSnapshot(collection(db, "custom_orders"), (snap) => {
        allCustomOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCustomOrders();
    });

    // 9. Units Listener
    onSnapshot(collection(db, "units"), (snap) => {
        allUnits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUnits();
        updateProductModalUnits();

        // Auto-seed if empty
        if (allUnits.length === 0) {
            seedUnits();
        }
    });

    // 10. Customer Payments Listener
    onSnapshot(collection(db, "payments"), (snap) => {
        allPayments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCustomers();
    });

    // 11. Inventory Items Listener
    onSnapshot(collection(db, "inventory_items"), (snap) => {
        allInventoryItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventoryStock();
        updatePurchaseItemSelect();
        renderDashboardInventory();
    });

    // 12. Purchases Listener
    onSnapshot(collection(db, "purchases"), (snap) => {
        allPurchases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyPurchaseFilters();
    });
}

// --- Custom Order Book ---
function renderCustomOrders() {
    const body = document.getElementById('custom-orders-body');
    if (!body) return;
    body.innerHTML = '';

    // Sort by date soonest first
    const sorted = [...allCustomOrders].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(co => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${new Date(co.date).toLocaleDateString()}</strong></td>
            <td>${co.name}</td>
            <td style="font-size: 0.85rem; max-width: 200px;">${co.notes || '-'}</td>
            <td>₹${co.amount}</td>
            <td>
                <select onchange="updateCustomOrderStatus('${co.id}', this.value)" class="status-badge status-${co.status.toLowerCase().replace(' ', '-')}">
                    <option value="Booked" ${co.status === 'Booked' ? 'selected' : ''}>Booked</option>
                    <option value="Advance Paid" ${co.status === 'Advance Paid' ? 'selected' : ''}>Advance Paid</option>
                    <option value="Completed" ${co.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    <option value="Cancelled" ${co.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteCustomOrder('${co.id}')">Delete</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

const customOrderForm = document.getElementById('custom-order-form');
if (customOrderForm) {
    customOrderForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('co-name').value,
            date: document.getElementById('co-date').value,
            amount: parseFloat(document.getElementById('co-amount').value),
            status: document.getElementById('co-status').value,
            notes: document.getElementById('co-notes').value,
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "custom_orders"), data);
            customOrderForm.reset();
            document.getElementById('co-notes').value = '';
            showToast("Custom Booking Recorded!");
        } catch (err) {
            showToast("Error recording order", "error");
        }
    };
}

window.updateCustomOrderStatus = async (id, newStatus) => {
    try {
        await updateDoc(doc(db, "custom_orders", id), { status: newStatus });
        showToast("Status Updated!");
    } catch (err) {
        showToast("Failed to update status", "error");
    }
};

window.deleteCustomOrder = async (id) => {
    if (confirm("Delete this custom order entry?")) {
        await deleteDoc(doc(db, "custom_orders", id));
        showToast("Entry Removed", "error");
    }
};

// --- Coupon Management ---
function renderCoupons() {
    const body = document.getElementById('coupons-body');
    if (!body) return;
    body.innerHTML = '';

    allCoupons.forEach(cp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${cp.code}</strong></td>
            <td>${cp.value}${cp.type === 'percentage' ? '%' : '₹'}</td>
            <td>${cp.type.toUpperCase()}</td>
            <td>₹${cp.minOrder}</td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteCoupon('${cp.id}')">Delete</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

const couponForm = document.getElementById('coupon-form');
if (couponForm) {
    couponForm.onsubmit = async (e) => {
        e.preventDefault();
        const codeValue = document.getElementById('cp-code').value.toUpperCase();
        const typeValue = document.getElementById('cp-type').value;
        const discountValue = parseFloat(document.getElementById('cp-value').value);
        const minOrderValue = parseFloat(document.getElementById('cp-min-order').value);

        if (allCoupons.some(c => c.code === codeValue)) {
            return showToast("Coupon code already exists!", "error");
        }

        try {
            await addDoc(collection(db, "coupons"), { code: codeValue, type: typeValue, value: discountValue, minOrder: minOrderValue, active: true });
            couponForm.reset();
            showToast("Coupon Created!");
        } catch (err) {
            showToast("Failed to create coupon", "error");
        }
    };
}

window.deleteCoupon = async (id) => {
    if (confirm("Delete this coupon code?")) {
        await deleteDoc(doc(db, "coupons", id));
        showToast("Coupon Deleted", "error");
    }
};

function updateShopSettingsUI() {
    const container = document.getElementById('schedule-container');
    const template = document.getElementById('day-row-template');
    const statusBadge = document.getElementById('shop-status-badge');
    const dashStatus = document.getElementById('dash-shop-status');

    if (container && template && shopSettings.schedule) {
        container.innerHTML = '';
        DAYS_OF_WEEK.forEach(day => {
            const dayData = shopSettings.schedule[day];
            const clone = template.content.cloneNode(true);

            clone.querySelector('.day-name').innerText = day;

            const openInp = clone.querySelector('.day-open');
            const closeInp = clone.querySelector('.day-close');
            const closedCheck = clone.querySelector('.day-is-closed');

            openInp.value = dayData.open;
            closeInp.value = dayData.close;
            closedCheck.checked = dayData.isClosed;

            // Toggle opacity if closed
            const row = clone.querySelector('.day-row');
            if (dayData.isClosed) row.style.opacity = '0.5';

            closedCheck.onchange = (e) => {
                row.style.opacity = e.target.checked ? '0.5' : '1';
                openInp.required = !e.target.checked;
                closeInp.required = !e.target.checked;
            };

            container.appendChild(clone);
        });
    }

    const isOpen = isShopOpen();
    const statusText = isOpen ? "🟢 OPEN FOR ORDERS" : "🔴 CLOSED FOR TODAY";
    const statusColor = isOpen ? "var(--success)" : "var(--error)";

    if (statusBadge) {
        statusBadge.innerText = statusText;
        statusBadge.style.color = statusColor;
    }
    if (dashStatus) {
        dashStatus.innerText = statusText;
        dashStatus.style.color = statusColor;
    }
}

function isShopOpen() {
    if (!shopSettings.schedule) return true;

    const now = new Date();
    const dayName = DAYS_OF_WEEK[now.getDay()];
    const dayData = shopSettings.schedule[dayName];

    if (!dayData || dayData.isClosed) return false;

    const [hOpen, mOpen] = dayData.open.split(':').map(Number);
    const [hClose, mClose] = dayData.close.split(':').map(Number);

    const openTime = new Date(now);
    openTime.setHours(hOpen, mOpen, 0);

    const closeTime = new Date(now);
    closeTime.setHours(hClose, mClose, 0);

    if (closeTime < openTime) {
        if (now < closeTime) return true;
        return now >= openTime;
    }

    return now >= openTime && now <= closeTime;
}

const shopHoursForm = document.getElementById('shop-hours-form');
if (shopHoursForm) {
    shopHoursForm.onsubmit = async (e) => {
        e.preventDefault();

        const newSchedule = {};
        const rows = document.querySelectorAll('.day-row');
        rows.forEach(row => {
            const day = row.querySelector('.day-name').innerText;
            const open = row.querySelector('.day-open').value;
            const close = row.querySelector('.day-close').value;
            const isClosed = row.querySelector('.day-is-closed').checked;
            newSchedule[day] = { open, close, isClosed };
        });

        try {
            await setDoc(doc(db, "settings", "shop"), { schedule: newSchedule });
            showToast("Weekly Schedule Updated!");
        } catch (err) {
            showToast("Failed to update schedule", "error");
        }
    };
}

async function seedExpenseCategories() {
    const defaults = ['Saving', 'Chicken', 'Mutton', 'Electricity', 'Salary', 'Rent', 'Grocery', 'Other'];
    for (const cat of defaults) {
        await addDoc(collection(db, "expense_categories"), { name: cat });
    }
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
            if (navItem.dataset.view === 'customers') renderCustomers();
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

    renderDashboardInventory();
}
if (dashDateFilter) dashDateFilter.onchange = updateDashboardData;

function renderDashboardInventory() {
    const dashLowStockList = document.getElementById('dash-low-stock-list');
    const dashInvOverview = document.getElementById('dash-inv-overview');

    if (dashLowStockList && dashInvOverview) {
        const sortedItems = [...allInventoryItems].sort((a, b) => {
            const aStock = parseFloat(a.stock) || 0;
            const aAlert = parseFloat(a.alertLevel) || 0;
            const bStock = parseFloat(b.stock) || 0;
            const bAlert = parseFloat(b.alertLevel) || 0;
            const aLow = aStock <= aAlert ? 1 : 0;
            const bLow = bStock <= bAlert ? 1 : 0;
            if (aLow !== bLow) return bLow - aLow;
            return a.name.localeCompare(b.name);
        });

        const lowStockItems = sortedItems.filter(i => (parseFloat(i.stock) || 0) <= (parseFloat(i.alertLevel) || 0));
        if (lowStockItems.length === 0) {
            dashLowStockList.innerHTML = `<p style="color:var(--success); font-weight:bold; padding: 10px 0;">🎉 All stock levels are good!</p>`;
        } else {
            dashLowStockList.innerHTML = lowStockItems.map(i => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid #eee;">
                    <span style="font-weight:bold;">${i.name}</span>
                    <span class="status-badge" style="background:#ffebee; color:var(--error); font-weight:bold;">${i.stock} ${i.unit} left</span>
                </div>
            `).join('');
        }

        if (sortedItems.length === 0) {
            dashInvOverview.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #666; padding: 10px;">No inventory items found.</td></tr>`;
        } else {
            dashInvOverview.innerHTML = sortedItems.slice(0, 10).map(i => {
                const stock = parseFloat(i.stock) || 0;
                const alert = parseFloat(i.alertLevel) || 0;
                const isLow = stock <= alert;
                return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px;"><strong>${i.name}</strong></td>
                        <td style="padding: 8px; font-weight:bold; color:${isLow ? 'var(--error)' : 'var(--success)'}">${stock} <small style="color:#888">${i.unit}</small></td>
                        <td style="padding: 8px; text-align: center;">
                            ${isLow ? '<span style="color:var(--error); font-size:1.2rem;">⚠️</span>' : '<span style="color:var(--success); font-size:1.2rem;">✅</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// --- Customer Logic ---
function renderCustomers() {
    if (!customersBody) return;
    const q = customerSearchInput?.value.toLowerCase().trim() || '';
    customersBody.innerHTML = '';

    // Advanced grouping: visits, credits, debits
    const custMap = {};

    // Process Orders (Visits and Credit Balances)
    allOrders.forEach(o => {
        const key = `${o.customerName || 'Guest'}_${o.phone || 'N/A'}`;
        if (!custMap[key]) {
            custMap[key] = { name: o.customerName || 'Guest', phone: o.phone || 'N/A', visits: 0, credit: 0, debit: 0 };
        }
        custMap[key].visits++;
        if (o.paymentMethod === 'CREDIT') {
            custMap[key].credit += (parseFloat(o.totalPrice) || 0);
        }
    });

    // Process Ledger Payments (Debits/Payments back to us)
    allPayments.forEach(p => {
        const key = `${p.customerName || 'Guest'}_${p.phone || 'N/A'}`;
        if (custMap[key]) {
            custMap[key].debit += (parseFloat(p.amount) || 0);
        } else {
            // New customer only with payment? Rare but handle it
            custMap[key] = { name: p.customerName || 'Guest', phone: p.phone || 'N/A', visits: 0, credit: 0, debit: parseFloat(p.amount) || 0 };
        }
    });

    let customers = Object.values(custMap).sort((a, b) => b.visits - a.visits);

    if (q) {
        customers = customers.filter(c =>
            c.name.toLowerCase().includes(q) || c.phone.includes(q)
        );
    }

    customers.forEach(c => {
        const balance = c.credit - c.debit;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:700;">${c.name}</div>
                <div style="font-size:0.8rem; color:#888;">📱 ${c.phone}</div>
            </td>
            <td><span class="status-badge" style="background:#eef; color:#444;">${c.visits} Visits</span></td>
            <td style="color:#e44; font-weight:700;">₹${Math.round(c.credit)}</td>
            <td style="color:#28a745; font-weight:700;">₹${Math.round(c.debit)}</td>
            <td style="font-weight:800; color:${balance > 0 ? '#e44' : '#28a745'}">
                ₹${Math.round(balance)}
                <div style="font-size:0.65rem; text-transform:uppercase;">${balance > 0 ? 'DUE' : 'CLEAR'}</div>
            </td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn-action btn-edit" onclick="setPOSCustomer('${c.name}', '${c.phone}')" title="Start Order">🛒</button>
                    <button class="btn-action" style="background:#e8f5e9; color:#2e7d32;" onclick="openPaymentModal('${c.name}', '${c.phone}')" title="Record Payment">💰 Pay</button>
                    <button class="btn-action" style="background:#f5f5f5; color:#555;" onclick="showCustomerHistory('${c.name}', '${c.phone}')" title="History">📜</button>
                </div>
            </td>
        `;
        customersBody.appendChild(tr);
    });
}

// Payment Modal Logic
window.openPaymentModal = (name, phone) => {
    document.getElementById('pay-modal-cust').innerText = `${name} (${phone})`;
    document.getElementById('pay-cust-key').value = `${name}|${phone}`;
    document.getElementById('payment-modal').classList.remove('hidden');
};

document.getElementById('close-pay-modal').onclick = () => {
    document.getElementById('payment-modal').classList.add('hidden');
};

document.getElementById('payment-form').onsubmit = async (e) => {
    e.preventDefault();
    const [name, phone] = document.getElementById('pay-cust-key').value.split('|');
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;

    try {
        await addDoc(collection(db, "payments"), {
            customerName: name,
            phone: phone,
            amount: amount,
            method: method,
            timestamp: serverTimestamp()
        });
        showToast(`✅ Payment of ₹${amount} recorded for ${name}`);
        document.getElementById('payment-modal').classList.add('hidden');
        document.getElementById('payment-form').reset();
    } catch (err) {
        showToast("Error saving payment", "error");
    }
};

window.showCustomerHistory = (name, phone) => {
    // Search for this customer in orders view
    const orderNav = document.querySelector('[data-view="orders"]');
    if (orderNav) orderNav.click();
    setTimeout(() => {
        const searchInput = document.getElementById('order-search');
        if (searchInput) {
            searchInput.value = phone;
            applyOrderFilters();
        }
    }, 100);
};

window.setPOSCustomer = (name, phone) => {
    document.getElementById('pos-cust-name').value = name;
    document.getElementById('pos-cust-phone').value = phone;
    const posNav = document.querySelector('[data-view="pos"]');
    if (posNav) posNav.click();
    showToast(`Customer ${name} selected for POS`);
};

if (customerSearchInput) customerSearchInput.oninput = renderCustomers;

function updatePOSCustomerSuggestions() {
    const nameList = document.getElementById('cust-names-list');
    const phoneList = document.getElementById('cust-phones-list');
    if (!nameList || !phoneList) return;

    const names = new Set();
    const phones = new Set();

    allOrders.forEach(o => {
        if (o.customerName) names.add(o.customerName);
        if (o.phone) phones.add(o.phone);
    });

    nameList.innerHTML = Array.from(names).map(n => `<option value="${n}">`).join('');
    phoneList.innerHTML = Array.from(phones).map(p => `<option value="${p}">`).join('');
}

// Auto-detection logic for POS inputs
const posNameInput = document.getElementById('pos-cust-name');
const posPhoneInput = document.getElementById('pos-cust-phone');

if (posNameInput && posPhoneInput) {
    posNameInput.onchange = () => {
        const name = posNameInput.value.trim();
        const found = allOrders.find(o => o.customerName === name && o.phone && o.phone !== 'N/A');
        if (found && !posPhoneInput.value) {
            posPhoneInput.value = found.phone;
            showToast(`Auto-detected mobile for ${name}`);
        }
    };

    posPhoneInput.onchange = () => {
        const phone = posPhoneInput.value.trim();
        const found = allOrders.find(o => o.phone === phone && o.customerName);
        if (found && !posNameInput.value) {
            posNameInput.value = found.customerName;
            showToast(`Auto-detected name for ${phone}`);
        }
    };
}

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
            <td>₹${p.price}${p.unit === 'GRM' ? '/100g' : ''}</td>
            <td><span class="status-badge" style="background:#f0f0f0; color:#555;">${p.unit || 'PCS'}</span></td>
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
    const unit = document.getElementById('p-unit').value;
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

        const data = { name, price, category, unit, description: desc, imageUrl, lastUpdated: new Date() };

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

        let csvContent = "data:text/csv;charset=utf-8,Name,Category,Price,Unit,Description\n";
        allProducts.forEach(p => {
            const row = `"${p.name}","${p.category}","${p.price}","${p.unit || 'PCS'}","${p.description || ''}"\n`;
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
                            unit: cols[3] || 'PCS',
                            description: cols[4] || '',
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
    document.getElementById('p-unit').value = p.unit || 'PLATE';
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
    const sorted = [...orders].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    sorted.forEach(o => {
        const tr = document.createElement('tr');
        const orderId = o.id.substring(0, 6).toUpperCase();

        // --- Build Item List String ---
        const itemsList = o.items.map(i => `• ${i.name} ${i.unit ? `(${i.unit})` : ''} [x${i.quantity}]`).join('<br>');

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
            if (dateRange === 'yesterday') return time >= (sod - 86400000) && time < sod;
            if (dateRange === '7days') return time >= (Date.now() - 7 * 86400000);
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
        const isGrm = i.unit === 'GRM';
        const priceStr = isGrm ? `₹${i.price}/100g` : `₹${i.price}`;
        const qtyStr = isGrm ? `${i.quantity}g` : `x${i.quantity}`;
        const itemTotal = isGrm ? (parseFloat(i.price) / 100) * parseFloat(i.quantity) : parseFloat(i.price) * parseFloat(i.quantity);

        msg += `• ${i.name} [${qtyStr}] @ ${priceStr} - ₹${itemTotal.toFixed(2)}\n`;
    });
    msg += `\n`;

    msg += `*PRICE BREAKDOWN:*\n`;
    msg += `Food total: ₹${foodTotal}\n`;
    if (delFee > 0) msg += `Delivery charge: +₹${delFee}\n`;

    msg += `\n*AMOUNT TO PAY: ₹${o.totalPrice}*\n`;
    msg += `*Payment:* ${o.paymentMethod || 'Not specified'}\n`;
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

    const uniqueNames = new Set(allCategories.map(cat => cat.name));

    uniqueNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        pCategorySelect.appendChild(opt);
    });

    if (currentVal && uniqueNames.has(currentVal)) {
        pCategorySelect.value = currentVal;
    }
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

// --- Units Management ---
function renderUnits() {
    const unitsBody = document.getElementById('units-body');
    if (!unitsBody) return;
    unitsBody.innerHTML = '';

    allUnits.forEach(unit => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${unit.name}</strong></td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteUnit('${unit.id}')">Delete</button>
            </td>
        `;
        unitsBody.appendChild(tr);
    });
}

function updateProductModalUnits() {
    const pUnitSelect = document.getElementById('p-unit');
    if (!pUnitSelect) return;

    const currentVal = pUnitSelect.value;
    pUnitSelect.innerHTML = '';

    allUnits.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.name;
        opt.textContent = unit.name;
        pUnitSelect.appendChild(opt);
    });

    if (currentVal) pUnitSelect.value = currentVal;
}

const unitForm = document.getElementById('unit-form');
if (unitForm) {
    unitForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('unit-name').value.toUpperCase();
        if (!name) return;

        if (allUnits.some(u => u.name === name)) {
            return showToast("Unit already exists!", "error");
        }

        try {
            await addDoc(collection(db, "units"), { name });
            unitForm.reset();
            showToast("Unit Added!");
        } catch (err) {
            showToast("Error adding unit", "error");
        }
    };
}

window.deleteUnit = async (id) => {
    if (confirm("Delete this unit? Products using this unit will still keep it until edited.")) {
        await deleteDoc(doc(db, "units", id));
        showToast("Unit Removed", "error");
    }
};

async function seedUnits() {
    const defaults = ['PLATE', 'GRM', 'HALF', 'FULL', '1PCS', '4PCS', '6PCS', '12PCS', '24PCS'];
    for (const u of defaults) {
        await addDoc(collection(db, "units"), { name: u });
    }
}

// --- Expense Categories Management ---
function renderExpenseCategories() {
    const body = document.getElementById('expense-categories-body');
    if (!body) return;
    body.innerHTML = '';

    allExpenseCategories.forEach(cat => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${cat.name}</strong></td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteExpenseCategory('${cat.id}')">Delete</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

function updateExpenseFormCategories() {
    const select = document.getElementById('exp-category');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Category</option>';

    // Use a Set to ensure unique category names
    const uniqueNames = new Set(allExpenseCategories.map(cat => cat.name));

    uniqueNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    if (currentVal && uniqueNames.has(currentVal)) {
        select.value = currentVal;
    }
}

const expCategoryForm = document.getElementById('exp-category-form');
if (expCategoryForm) {
    expCategoryForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('exp-cat-name').value;
        if (!name) return;
        await addDoc(collection(db, "expense_categories"), { name });
        expCategoryForm.reset();
        showToast("Expense Category Added!");
    };
}

window.deleteExpenseCategory = async (id) => {
    if (confirm("Delete this expense category? Existing expenses tag will remain.")) {
        await deleteDoc(doc(db, "expense_categories", id));
        showToast("Category Removed", "error");
    }
};

const btnRestoreExpCats = document.getElementById('btn-restore-expense-cats');
if (btnRestoreExpCats) {
    btnRestoreExpCats.onclick = async () => {
        if (confirm("This will add all default expense categories (e.g. Saving, Chicken, Mutton, etc.) if they are missing. Proceed?")) {
            const defaults = ['Saving', 'Chicken', 'Mutton', 'Electricity', 'Salary', 'Rent', 'Grocery', 'Other'];
            const existing = allExpenseCategories.map(c => c.name.toLowerCase());
            let addedCount = 0;
            for (const cat of defaults) {
                if (!existing.includes(cat.toLowerCase())) {
                    await addDoc(collection(db, "expense_categories"), { name: cat });
                    addedCount++;
                }
            }
            if (addedCount > 0) {
                showToast(`Restored ${addedCount} default categories!`);
            } else {
                showToast("All default categories are already present.");
            }
        }
    };
}

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
        await deleteDoc(doc(db, "locations", id));
        showToast("Deleted");
    }
};

// --- Expense Management ---
function renderExpenses(expenses) {
    if (!expensesBody) return;
    expensesBody.innerHTML = '';

    const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
    let totalDebit = 0;
    let totalCredit = 0;
    let totalBalance = 0;

    sorted.forEach(ex => {
        const debit = parseFloat(ex.amount) || 0;
        const credit = parseFloat(ex.paid) || 0;
        const balance = debit - credit;

        totalDebit += debit;
        totalCredit += credit;
        totalBalance += balance;

        let statusHtml = '';
        if (balance <= 0) {
            statusHtml = '<span class="status-badge" style="background:#e8f5e9; color:var(--success);">Paid</span>';
        } else if (credit > 0) {
            statusHtml = '<span class="status-badge" style="background:#fff3e0; color:#f57c00;">Partial</span>';
        } else {
            statusHtml = '<span class="status-badge" style="background:#ffebee; color:var(--error);">Unpaid</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
                <td>${ex.date}</td>
                <td><span class="status-badge" style="background:#eee; color:#333; font-size:0.75rem;">${ex.category || 'General'}</span></td>
                <td><strong>${ex.name}</strong></td>
                <td>₹${debit}</td>
                <td style="color:var(--success); font-weight:bold;">₹${credit}</td>
                <td style="color:var(--error); font-weight:bold;">₹${balance}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn-action btn-edit" onclick="editExpense('${ex.id}')">Edit</button>
                    <button class="btn-action" style="background:var(--error)" onclick="deleteExpense('${ex.id}')">Delete</button>
                </td>
            `;
        expensesBody.appendChild(tr);
    });

    if (footerTotalExpenses) footerTotalExpenses.innerText = `₹${totalDebit}`;
    const footerTotalPaid = document.getElementById('footer-total-paid');
    if (footerTotalPaid) footerTotalPaid.innerText = `₹${totalCredit}`;
    const footerTotalBalance = document.getElementById('footer-total-balance');
    if (footerTotalBalance) footerTotalBalance.innerText = `₹${totalBalance}`;
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
    document.getElementById('exp-category').value = ex.category || '';

    if (ex.category && ex.category.toLowerCase() !== 'other') {
        document.getElementById('exp-name').readOnly = true;
    } else {
        document.getElementById('exp-name').readOnly = false;
    }

    document.getElementById('exp-amount').value = ex.amount || '';
    document.getElementById('exp-paid').value = ex.paid || 0;
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
    document.getElementById('exp-name').readOnly = false;
    const saveBtn = document.getElementById('btn-save-expense');
    document.getElementById('expense-form-title').innerText = "Add New Expense";
    saveBtn.innerText = "Add Expense";
    saveBtn.style.background = "var(--primary)"; // Reset to Primary
    document.getElementById('btn-cancel-expense').classList.add('hidden');
};

window.deleteExpense = async (id) => {
    if (confirm("Are you sure you want to delete this expense record?")) {
        try {
            await deleteDoc(doc(db, "expenses", id));
            showToast("🗑 Expense Deleted", "error");
        } catch (err) {
            console.error("Delete Error:", err);
            showToast("Failed to delete record", "error");
        }
    }
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
    const expCatSelect = document.getElementById('exp-category');
    const expNameInput = document.getElementById('exp-name');

    if (expCatSelect && expNameInput) {
        expCatSelect.addEventListener('change', () => {
            const val = expCatSelect.value;
            if (val && val.toLowerCase() === 'other') {
                expNameInput.value = '';
                expNameInput.readOnly = false;
                expNameInput.focus();
            } else if (val) {
                expNameInput.value = val;
                expNameInput.readOnly = true;
            }
        });
    }

    expenseForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('exp-id').value;
        const name = document.getElementById('exp-name').value;
        const category = document.getElementById('exp-category').value;
        const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
        const paid = parseFloat(document.getElementById('exp-paid').value) || 0;
        const date = document.getElementById('exp-date').value;

        console.log("Submitting expense:", { id, name, category, amount, paid, date });

        try {
            if (id) {
                const docRef = doc(db, "expenses", id);
                await updateDoc(docRef, { name, category, amount, paid, date, lastUpdated: new Date() });
                showToast("✅ Expense Updated!");
            } else {
                await addDoc(collection(db, "expenses"), { name, category, amount, paid, date, timestamp: new Date() });
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
            <div style="display:flex; justify-content:center; align-items:center; gap:5px;">
                <span style="color:var(--primary); font-weight:bold;">₹${p.price}</span>
                <span style="font-size:0.7rem; color:#888; background:#f5f5f5; padding:1px 4px; border-radius:4px;">${p.unit || 'PCS'}</span>
            </div>
        `;
        posProductsGrid.appendChild(div);
    });
}

window.addToPOSCart = (product) => {
    if (product.unit === 'GRM') {
        pendingGrmProduct = product;
        document.getElementById('qty-modal-product').innerText = product.name;
        document.getElementById('qty-input').value = 100; // Reset to default
        document.getElementById('qty-modal').classList.remove('hidden');
        document.getElementById('qty-input').focus();
        return;
    }

    addToCartProcess(product, 1);
};

function addToCartProcess(product, quantity) {
    const existing = posCart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity = parseFloat(existing.quantity) + quantity;
    } else {
        posCart.push({ ...product, quantity: quantity });
    }
    renderPOSCart();
    showToast(`Added ${product.name}`);
}

// Custom Modal Controls
document.getElementById('close-qty-modal').onclick = () => {
    document.getElementById('qty-modal').classList.add('hidden');
    pendingGrmProduct = null;
};

document.getElementById('confirm-qty-btn').onclick = () => {
    const qty = parseFloat(document.getElementById('qty-input').value);
    if (isNaN(qty) || qty <= 0) return showToast("Enter a valid weight", "error");

    if (pendingGrmProduct) {
        addToCartProcess(pendingGrmProduct, qty);
        document.getElementById('qty-modal').classList.add('hidden');
        pendingGrmProduct = null;
    }
};

// Also allow ENTER key on qty input
document.getElementById('qty-input').onkeyup = (e) => {
    if (e.key === 'Enter') document.getElementById('confirm-qty-btn').click();
};

function renderPOSCart() {
    if (!posCartItemsEl) return;
    posCartItemsEl.innerHTML = '';
    let subtotal = 0;

    posCart.forEach((item, index) => {
        const isGrm = item.unit === 'GRM';
        const itemPrice = parseFloat(item.price);
        const itemQty = parseFloat(item.quantity);
        const itemTotal = isGrm ? (itemPrice / 100) * itemQty : itemPrice * itemQty;
        subtotal += itemTotal;

        const div = document.createElement('div');
        div.style = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #eee;';
        div.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600; font-size:0.85rem;">${item.name}</div>
                <div style="font-size:0.75rem; color:#666;">
                    ₹${item.price}${isGrm ? '/100g' : ''} x ${item.quantity}${isGrm ? 'g' : ''} 
                    <span style="float:right; font-weight:bold;">₹${itemTotal.toFixed(2)}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button onclick="updatePOSQty(${index}, -1)" style="width:24px; height:24px; border-radius:4px; background:#eee; cursor:pointer;">-</button>
                <input type="number" step="0.001" value="${item.quantity}" 
                    style="width:60px; text-align:center; border:1px solid #ddd; border-radius:4px; padding:2px;"
                    onchange="updatePOSQtyManual(${index}, this.value)">
                <button onclick="updatePOSQty(${index}, 1)" style="width:24px; height:24px; border-radius:4px; background:#eee; cursor:pointer;">+</button>
                <button onclick="removeFromPOSCart(${index})" style="color:var(--error); margin-left:8px; font-size:1.2rem; cursor:pointer;">×</button>
            </div>
        `;
        posCartItemsEl.appendChild(div);
    });

    const delFee = parseFloat(posDeliveryLoc?.value) || 0;
    const total = subtotal + delFee;

    if (posSubtotalEl) posSubtotalEl.innerText = `₹${subtotal.toFixed(2)}`;
    if (posTotalEl) posTotalEl.innerText = `₹${total.toFixed(2)}`;
}

window.updatePOSQty = (index, delta) => {
    posCart[index].quantity = Math.max(0, parseFloat(posCart[index].quantity) + delta);
    if (posCart[index].quantity <= 0) {
        posCart.splice(index, 1);
    }
    renderPOSCart();
};

window.updatePOSQtyManual = (index, val) => {
    const newVal = parseFloat(val);
    if (isNaN(newVal) || newVal <= 0) {
        posCart.splice(index, 1);
    } else {
        posCart[index].quantity = newVal;
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

// --- POS Payment Method Listeners ---
const cashBtn = document.getElementById('pay-cash-btn');
const gpayBtn = document.getElementById('pay-gpay-btn');
const creditBtn = document.getElementById('pay-credit-btn');

if (cashBtn && gpayBtn && creditBtn) {
    cashBtn.onclick = () => {
        posPaymentMethod = 'CASH';
        cashBtn.classList.add('active');
        gpayBtn.classList.remove('active');
        creditBtn.classList.remove('active');
    };
    gpayBtn.onclick = () => {
        posPaymentMethod = 'GPAY';
        gpayBtn.classList.add('active');
        cashBtn.classList.remove('active');
        creditBtn.classList.remove('active');
    };
    creditBtn.onclick = () => {
        posPaymentMethod = 'CREDIT';
        creditBtn.classList.add('active');
        cashBtn.classList.remove('active');
        gpayBtn.classList.remove('active');
    };
}

const btnCompletePOS = document.getElementById('btn-complete-pos');
if (btnCompletePOS) {
    btnCompletePOS.onclick = async () => {
        if (posCart.length === 0) return showToast("Cart is empty", "error");

        const name = document.getElementById('pos-cust-name').value.trim();
        const phone = document.getElementById('pos-cust-phone').value.trim();

        // Mandate Name and Mobile for CREDIT
        if (posPaymentMethod === 'CREDIT' && (!name || !phone)) {
            showToast("Customer Name and Mobile are mandatory for CREDIT!", "error");
            btnCompletePOS.disabled = false;
            btnCompletePOS.innerText = "✅ COMPLETE POS";
            return;
        }

        const delFee = parseFloat(posDeliveryLoc.value) || 0;
        const delArea = posDeliveryLoc.options[posDeliveryLoc.selectedIndex].dataset.name;

        const subtotal = posCart.reduce((acc, i) => {
            const p = parseFloat(i.price);
            const q = parseFloat(i.quantity);
            return acc + (i.unit === 'GRM' ? (p / 100) * q : p * q);
        }, 0);
        const total = subtotal + delFee;

        btnCompletePOS.disabled = true;
        btnCompletePOS.innerText = "Processing...";

        try {
            const orderData = {
                customerName: name,
                phone: phone || 'N/A',
                items: posCart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, unit: i.unit || 'PCS' })),
                totalPrice: total,
                deliveryFee: delFee,
                deliveryArea: delArea,
                orderType: delFee > 0 ? 'Delivery' : 'Pickup',
                paymentMethod: posPaymentMethod,
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
            posPaymentMethod = 'CASH'; // Reset to default
            if (cashBtn) cashBtn.classList.add('active');
            if (gpayBtn) gpayBtn.classList.remove('active');
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

    // 2.5 Filter Purchases
    const filteredPurchases = allPurchases.filter(p => {
        const time = new Date(p.date).getTime();
        return time >= start && time <= end;
    });

    // 2.6 Build Daily Aggregates
    const dailyData = {};
    const getDayKey = (time) => {
        const d = new Date(time);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    filteredOrders.forEach(o => {
        const time = o.timestamp?.toMillis ? o.timestamp.toMillis() : (o.timestamp?.seconds ? o.timestamp.seconds * 1000 : Date.now());
        const day = getDayKey(time);
        if (!dailyData[day]) dailyData[day] = { sales: 0, exp: 0, pur: 0 };
        dailyData[day].sales += (parseFloat(o.totalPrice) || 0);
    });

    filteredExpenses.forEach(ex => {
        const time = new Date(ex.date).getTime();
        const day = getDayKey(time);
        if (!dailyData[day]) dailyData[day] = { sales: 0, exp: 0, pur: 0 };
        dailyData[day].exp += (parseFloat(ex.amount) || 0);
    });

    filteredPurchases.forEach(pur => {
        const time = new Date(pur.date).getTime();
        const day = getDayKey(time);
        if (!dailyData[day]) dailyData[day] = { sales: 0, exp: 0, pur: 0 };
        dailyData[day].pur += (parseFloat(pur.cost) || 0);
    });

    const reportDailyBody = document.getElementById('report-daily-body');
    if (reportDailyBody) {
        reportDailyBody.innerHTML = '';
        const sortedDays = Object.keys(dailyData).sort((a, b) => new Date(b) - new Date(a));
        sortedDays.forEach(day => {
            const d = dailyData[day];
            const net = d.sales - d.exp;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${day}</strong></td>
                <td style="color:var(--success); font-weight:bold;">₹${Math.round(d.sales)}</td>
                <td style="color:var(--error); font-weight:bold;">₹${Math.round(d.exp)}</td>
                <td style="color:#f57c00; font-weight:bold;">₹${Math.round(d.pur)}</td>
                <td style="color:${net >= 0 ? 'var(--success)' : 'var(--error)'}; font-weight:bold;">
                    ${net >= 0 ? '+' : ''}₹${Math.round(net)}
                </td>
            `;
            reportDailyBody.appendChild(tr);
        });
    }

    // 3. Combine and Sort for Table
    const combined = [
        ...filteredOrders.map(o => {
            const itemList = (o.items || []).map(i => `${i.name} [x${i.quantity}]`).join(', ');
            return {
                date: o.timestamp?.toMillis ? o.timestamp.toMillis() : (o.timestamp?.seconds ? o.timestamp.seconds * 1000 : Date.now()),
                id: o.id,
                recordType: 'order',
                type: 'Order Income',
                payment: o.paymentMethod || 'Guest',
                desc: `<strong>${o.customerName || 'Guest'}</strong><br><small style="color:#666">${itemList}</small>`,
                amount: parseFloat(o.totalPrice) || 0,
                color: 'var(--success)'
            };
        }),
        ...filteredExpenses.map(ex => ({
            date: new Date(ex.date).getTime(),
            id: ex.id,
            recordType: 'expense',
            type: 'Expense Paid',
            payment: '-',
            desc: ex.name,
            amount: -(parseFloat(ex.amount) || 0),
            color: 'var(--error)'
        }))
    ].sort((a, b) => b.date - a.date);

    // 4. Summarize
    const totalSales = filteredOrders.reduce((acc, o) => acc + (parseFloat(o.totalPrice) || 0), 0);
    const totalCash = filteredOrders.filter(o => o.paymentMethod === 'CASH').reduce((acc, o) => acc + (parseFloat(o.totalPrice) || 0), 0);
    const totalGPay = filteredOrders.filter(o => o.paymentMethod === 'GPAY').reduce((acc, o) => acc + (parseFloat(o.totalPrice) || 0), 0);
    const totalItems = filteredOrders.reduce((acc, o) => acc + (o.items ? o.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) : 0), 0);
    const totalExpenses = filteredExpenses.reduce((acc, ex) => acc + (parseFloat(ex.amount) || 0), 0);
    const netProfit = totalSales - totalExpenses;

    // 5. Render UI
    reportSalesEl.innerText = `₹${Math.round(totalSales)}`;
    reportExpensesEl.innerText = `₹${Math.round(totalExpenses)}`;
    reportProfitEl.innerText = `₹${Math.round(netProfit)}`;
    reportProfitEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--error)';

    document.getElementById('report-cash').innerText = `₹${Math.round(totalCash)}`;
    document.getElementById('report-gpay').innerText = `₹${Math.round(totalGPay)}`;
    document.getElementById('report-items-count').innerText = totalItems;

    reportBody.innerHTML = '';
    combined.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(item.date).toLocaleString()}</td>
            <td><span class="status-badge" style="background:${item.color}; color:white;">${item.type}</span></td>
            <td><strong>${item.payment}</strong></td>
            <td>${item.desc}</td>
            <td style="font-weight:bold; color:${item.color}">${item.amount >= 0 ? '+' : ''}₹${Math.abs(item.amount)}</td>
            <td>
                <button class="btn-action btn-edit" onclick="editReportItem('${item.id}', '${item.recordType}')">Edit</button>
                <button class="btn-action btn-delete" onclick="deleteReportItem('${item.id}', '${item.recordType}')">Delete</button>
            </td>
        `;
        reportBody.appendChild(tr);
    });
}

window.editReportItem = (id, type) => {
    if (type === 'expense') {
        const navItem = document.querySelector('[data-view="expenses"]');
        if (navItem) navItem.click();
        setTimeout(() => editExpense(id), 100);
    } else {
        const navItem = document.querySelector('[data-view="orders"]');
        if (navItem) navItem.click();
        showToast("Switching to Orders view to edit order details", "info");
    }
};

window.deleteReportItem = async (id, type) => {
    if (confirm(`Are you sure you want to delete this ${type === 'order' ? 'order record' : 'expense record'}?`)) {
        try {
            const collectionName = type === 'order' ? 'orders' : 'expenses';
            await deleteDoc(doc(db, collectionName, id));
            showToast(`🗑 ${type.toUpperCase()} removed from system`, "error");
            generatePeriodReport(); // Refresh
        } catch (err) {
            showToast("Failed to delete", "error");
        }
    }
};

document.getElementById('open-report-pos-btn').onclick = () => {
    const navItem = document.querySelector('[data-view="pos"]');
    if (navItem) navItem.click();
};

document.getElementById('open-report-expense-modal').onclick = () => {
    const navItem = document.querySelector('[data-view="expenses"]');
    if (navItem) {
        navItem.click();
        document.getElementById('exp-name')?.focus();
    }
};

function exportReportCSV() {
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;

    // Header
    let csv = "Financial Report (" + start + " to " + end + ")\n";
    csv += "Date,Type,Payment,Description,Amount\n";

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

// --- Inventory & Purchases ---
window.switchInvTab = (tab) => {
    document.getElementById('wrap-inv-stock').classList.toggle('hidden', tab !== 'stock');
    document.getElementById('wrap-inv-history').classList.toggle('hidden', tab !== 'history');
    document.getElementById('tab-inv-stock').className = tab === 'stock' ? 'btn-primary' : 'btn-secondary';
    document.getElementById('tab-inv-history').className = tab === 'history' ? 'btn-primary' : 'btn-secondary';
};

function renderInventoryStock() {
    const body = document.getElementById('inventory-stock-body');
    if (!body) return;
    body.innerHTML = '';

    // Sort alphabetically by name
    const sorted = [...allInventoryItems].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(item => {
        const stock = parseFloat(item.stock) || 0;
        const alertLevel = parseFloat(item.alertLevel) || 0;
        const isLow = stock <= alertLevel;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td><span class="status-badge" style="background:#f0f0f0; color:#333; font-weight:bold;">${item.unit}</span></td>
            <td style="font-size: 1.1rem; font-weight: bold; color: ${isLow ? 'var(--error)' : 'var(--success)'}">${stock}</td>
            <td>
                ${isLow ? '<span class="status-badge" style="background:#ffebee; color:var(--error);">Low Stock</span>' : '<span class="status-badge" style="background:#e8f5e9; color:var(--success);">Good</span>'}
            </td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteInventoryItem('${item.id}')">Delete</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

function updatePurchaseItemSelect() {
    const select = document.getElementById('pur-item');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select Item</option>';

    const sorted = [...allInventoryItems].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `${item.name} (${item.unit})`;
        select.appendChild(opt);
    });
}

window.applyPurchaseFilters = () => {
    const startStr = document.getElementById('filter-pur-start').value;
    const endStr = document.getElementById('filter-pur-end').value;
    const status = document.getElementById('filter-pur-status')?.value || 'all';
    const itemQuery = document.getElementById('filter-pur-item')?.value.toLowerCase().trim() || '';

    let filtered = [...allPurchases];

    if (startStr && endStr) {
        const start = new Date(startStr).setHours(0, 0, 0, 0);
        const end = new Date(endStr).setHours(23, 59, 59, 999);
        filtered = filtered.filter(p => {
            const t = new Date(p.date).getTime();
            return t >= start && t <= end;
        });
    }

    if (status !== 'all') {
        filtered = filtered.filter(p => {
            const cost = parseFloat(p.cost) || 0;
            const paid = parseFloat(p.paid) || 0;
            const balance = cost - paid;
            if (status === 'paid') return balance <= 0;
            if (status === 'unpaid') return balance > 0;
            return true;
        });
    }

    if (itemQuery) {
        filtered = filtered.filter(p => {
            const itemName = allInventoryItems.find(i => i.id === p.itemId)?.name?.toLowerCase() || '';
            return itemName.includes(itemQuery);
        });
    }

    renderPurchaseHistory(filtered);
};

function renderPurchaseHistory(purchasesToRender = allPurchases) {
    const body = document.getElementById('inventory-history-body');
    if (!body) return;
    body.innerHTML = '';

    const sorted = [...purchasesToRender].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(pur => {
        const itemName = allInventoryItems.find(i => i.id === pur.itemId)?.name || 'Unknown Item';
        const unit = allInventoryItems.find(i => i.id === pur.itemId)?.unit || '';

        const cost = parseFloat(pur.cost) || 0;
        const paid = parseFloat(pur.paid) || 0;
        const balance = cost - paid;

        let statusHtml = '';
        if (balance <= 0) {
            statusHtml = '<span class="status-badge" style="background:#e8f5e9; color:var(--success);">Paid</span>';
        } else if (paid > 0) {
            statusHtml = '<span class="status-badge" style="background:#fff3e0; color:#f57c00;">Partial</span>';
        } else {
            statusHtml = '<span class="status-badge" style="background:#ffebee; color:var(--error);">Unpaid</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(pur.date).toLocaleDateString()}</td>
            <td>${pur.vendor}</td>
            <td><strong>${itemName}</strong></td>
            <td>${pur.qty} <span style="font-size:0.8rem;color:#666">${unit}</span></td>
            <td>₹${cost}</td>
            <td style="color:var(--success); font-weight:bold;">₹${paid}</td>
            <td style="color:var(--error); font-weight:bold;">₹${balance}</td>
            <td>${statusHtml}</td>
            <td>
                <button class="btn-action btn-delete" onclick="deletePurchase('${pur.id}', '${pur.itemId}', ${pur.qty})">Delete</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

const invItemForm = document.getElementById('inventory-item-form');
if (invItemForm) {
    invItemForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('inv-item-name').value.trim(),
            unit: document.getElementById('inv-item-unit').value,
            alertLevel: parseFloat(document.getElementById('inv-item-alert').value) || 0,
            stock: 0,
            createdAt: serverTimestamp()
        };

        if (allInventoryItems.some(i => i.name.toLowerCase() === data.name.toLowerCase())) {
            return showToast("Item already exists!", "error");
        }

        try {
            await addDoc(collection(db, "inventory_items"), data);
            invItemForm.reset();
            showToast("Item Added to Inventory!");
        } catch (err) {
            showToast("Failed to add item", "error");
        }
    };
}

const purEntryForm = document.getElementById('purchase-entry-form');
if (purEntryForm) {
    purEntryForm.onsubmit = async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('pur-item').value;
        const qty = parseFloat(document.getElementById('pur-qty').value);
        const cost = parseFloat(document.getElementById('pur-cost').value);
        const paid = parseFloat(document.getElementById('pur-paid').value) || 0;
        const vendor = document.getElementById('pur-vendor').value.trim();
        const date = document.getElementById('pur-date').value;
        const addExpense = document.getElementById('pur-add-expense').checked;

        if (!itemId) return showToast("Select an item first!", "error");

        const btn = purEntryForm.querySelector('button[type="submit"]');
        btn.disabled = true;

        try {
            await addDoc(collection(db, "purchases"), {
                itemId, qty, cost, paid, vendor, date, createdAt: serverTimestamp()
            });

            const item = allInventoryItems.find(i => i.id === itemId);
            if (item) {
                const newStock = (parseFloat(item.stock) || 0) + qty;
                await updateDoc(doc(db, "inventory_items", itemId), { stock: newStock });
            }

            if (addExpense) {
                const itemName = item?.name || 'Inventory Item';
                await addDoc(collection(db, "expenses"), {
                    name: `Purchase: ${itemName} from ${vendor}`,
                    category: 'Grocery',
                    amount: cost,
                    paid: paid,
                    date: date,
                    lastUpdated: serverTimestamp()
                });
            }

            purEntryForm.reset();
            if (document.getElementById('pur-date')) document.getElementById('pur-date').valueAsDate = new Date();
            showToast("Purchase Recorded & Stock Updated!");
        } catch (err) {
            showToast("Failed to record purchase", "error");
        } finally {
            btn.disabled = false;
        }
    };
}

window.deleteInventoryItem = async (id) => {
    if (confirm("Delete this inventory item? Note: Existing purchases history will remain but may show 'Unknown Item'.")) {
        await deleteDoc(doc(db, "inventory_items", id));
        showToast("Item deleted", "error");
    }
};

window.deletePurchase = async (purId, itemId, qty) => {
    if (confirm("Delete this purchase entry? This will also REDUCE the stock by the purchase quantity.")) {
        try {
            await deleteDoc(doc(db, "purchases", purId));

            const item = allInventoryItems.find(i => i.id === itemId);
            if (item) {
                const newStock = Math.max(0, (parseFloat(item.stock) || 0) - qty);
                await updateDoc(doc(db, "inventory_items", itemId), { stock: newStock });
            }
            showToast("Purchase removed & Stock adjusted", "info");
        } catch (err) {
            showToast("Error deleting purchase", "error");
        }
    }
};

// --- Logout ---
document.getElementById('admin-logout').onclick = () => {
    localStorage.removeItem('admin_session');
    signOut(auth).then(() => window.location.href = '../index.html');
};
