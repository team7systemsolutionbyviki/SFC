import { auth, db } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    where,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

const foodGrid = document.getElementById('food-grid');
const searchInput = document.getElementById('food-search');
const catFilters = document.getElementById('cat-filters');
const cartCountSpan = document.getElementById('cart-count');
const cartCountMobSpan = document.getElementById('cart-count-mob');
const logoutBtn = document.getElementById('logout-btn');
const logoutBtnMob = document.getElementById('logout-btn-mob');

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('food_cart')) || [];
let shopSettings = { schedule: {} };
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Initial Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    }
    updateCartCount();
    checkShopStatus();
});

async function checkShopStatus() {
    const snap = await getDoc(doc(db, "settings", "shop"));
    if (snap.exists()) {
        shopSettings = snap.data();
        renderProducts(allProducts);
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

// Fetch Products from Firestore (Real-time)
const q = query(collection(db, "products"));
onSnapshot(q, (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCategoryFilters(allProducts);
    renderProducts(allProducts);
});

function renderProducts(products) {
    foodGrid.innerHTML = '';

    const isOpen = isShopOpen();
    if (!isOpen) {
        const dayName = DAYS_OF_WEEK[new Date().getDay()];
        const todayData = shopSettings.schedule ? shopSettings.schedule[dayName] : null;

        const closedBanner = document.createElement('div');
        closedBanner.style = "grid-column: 1 / -1; background: #fff4f4; color: #e23744; padding: 20px; border-radius: 12px; border: 1px solid #ffccd1; text-align: center; margin-bottom: 2rem; font-weight: bold;";
        
        let message = `🌙 Shop is Currently Closed for today.`;
        if (todayData && !todayData.isClosed) {
            message = `<div style="font-size: 1.5rem; margin-bottom: 5px;">🌙 Shop is Currently Closed</div>
                       <div>Today's hours: ${todayData.open} to ${todayData.close}. Please visit us later!</div>`;
        } else if (todayData && todayData.isClosed) {
            message = `<div style="font-size: 1.5rem; margin-bottom: 5px;">🌙 Closed for ${dayName}</div>
                       <div>We are taking a break today. See you tomorrow!</div>`;
        }

        closedBanner.innerHTML = message;
        foodGrid.appendChild(closedBanner);
    }
    
    if (products.length === 0) {
        foodGrid.innerHTML = '<div class="no-results" style="grid-column:1/-1; text-align:center; padding: 50px;">No food items found matching your criteria.</div>';
        return;
    }

    products.forEach(product => {
        const isOutOfStock = product.isAvailable === false;
        const cartItem = cart.find(item => item.id === product.id);
        const qty = cartItem ? cartItem.quantity : 0;

        const card = document.createElement('div');
        card.className = `food-card ${isOutOfStock ? 'out-of-stock' : ''}`;
        
        // --- Footer Logic: Show Add Button or Qty Selector ---
        let controlUI = '';
        if (isOutOfStock) {
            controlUI = `<button class="swiggy-add-btn" disabled style="color: #666; width: 100%;">Sold Out</button>`;
        } else if (!isOpen) {
            controlUI = `<button class="swiggy-add-btn" style="background:#eee; color:#999; cursor:not-allowed;" onclick="showToast('Shop is closed!', 'error')" disabled>Closed</button>`;
        } else if (qty > 0) {
            controlUI = `
                <div class="cart-qty-ctrl" style="border-radius: 8px;">
                    <div style="cursor:pointer; padding: 0 10px;" onclick="updateItemQty('${product.id}', -1)">−</div>
                    <div style="font-weight: 800;">${qty}</div>
                    <div style="cursor:pointer; padding: 0 10px;" onclick="updateItemQty('${product.id}', 1)">+</div>
                </div>`;
        } else {
            controlUI = `<button class="swiggy-add-btn" onclick="updateItemQty('${product.id}', 1)">ADD</button>`;
        }

        card.innerHTML = `
            <div class="food-img-wrapper">
                <img src="${product.imageUrl || 'https://via.placeholder.com/300x200?text=Food'}" alt="${product.name}">
                <div class="food-overlay">
                    <div class="food-offer">${product.offer || 'DELICIOUS'}</div>
                </div>
            </div>
            <div class="food-info">
                <div class="food-title">${product.name}</div>
                <div class="food-rating-row">
                    <div class="rating-badge">⭐ 4.2</div>
                    <div class="food-tags">${product.category} • ${product.unit || 'PCS'}</div>
                </div>
                <div class="food-bottom">
                    <div class="food-price">₹${product.price}</div>
                    <div id="control-${product.id}">
                        ${controlUI}
                    </div>
                </div>
            </div>
        `;
        foodGrid.appendChild(card);
    });
}

// Update Item Quantity directly from the card
window.updateItemQty = (productId, change) => {
    const product = allProducts.find(p => p.id === productId);
    const cartIdx = cart.findIndex(item => item.id === productId);

    if (cartIdx > -1) {
        cart[cartIdx].quantity += change;
        if (cart[cartIdx].quantity <= 0) {
            cart.splice(cartIdx, 1);
            showToast(`${product.name} removed from cart`);
        }
    } else if (change > 0) {
        cart.push({ ...product, quantity: 1 });
        showToast(`${product.name} added to cart!`, 'success');
    }

    localStorage.setItem('food_cart', JSON.stringify(cart));
    updateCartCount();
    renderProducts(allProducts); // Reflect change on all cards
};

// Update UI
function updateCartCount() {
    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (cartCountSpan) cartCountSpan.textContent = totalCount;
    if (cartCountMobSpan) cartCountMobSpan.textContent = totalCount;
}

// Search
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term));
    renderProducts(filtered);
});

function renderCategoryFilters(products) {
    if (!catFilters) return;
    
    const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c))];
    
    catFilters.innerHTML = '';
    categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `cat-pill ${cat === 'All' ? 'active' : ''}`;
        pill.dataset.category = cat;
        pill.innerText = cat === 'Veg' ? 'Pure Veg' : cat;
        
        pill.onclick = (e) => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const selected = pill.dataset.category;
            if (selected === 'All') {
                renderProducts(allProducts);
            } else {
                const filtered = allProducts.filter(p => p.category === selected);
                renderProducts(filtered);
            }
        };
        catFilters.appendChild(pill);
    });
}

const handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    });
};

if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (logoutBtnMob) logoutBtnMob.addEventListener('click', handleLogout);
