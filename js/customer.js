import { auth, db } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

const foodGrid = document.getElementById('food-grid');
const searchInput = document.getElementById('food-search');
const catFilters = document.getElementById('cat-filters');
const cartCountSpan = document.getElementById('cart-count');
const logoutBtn = document.getElementById('logout-btn');

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('food_cart')) || [];

// Initial Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    }
    updateCartCount();
});

// Fetch Products from Firestore (Real-time)
const q = query(collection(db, "products"));
onSnapshot(q, (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCategoryFilters(allProducts);
    renderProducts(allProducts);
});

function renderProducts(products) {
    foodGrid.innerHTML = '';
    
    if (products.length === 0) {
        foodGrid.innerHTML = '<div class="no-results">No food items found matching your criteria.</div>';
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
            controlUI = `<button class="add-btn" disabled>Sold Out</button>`;
        } else if (qty > 0) {
            controlUI = `
                <div class="qty-selector">
                    <button class="btn-qty" onclick="updateItemQty('${product.id}', -1)">-</button>
                    <span class="qty-num">${qty}</span>
                    <button class="btn-qty" onclick="updateItemQty('${product.id}', 1)">+</button>
                </div>`;
        } else {
            controlUI = `<button class="add-btn" onclick="updateItemQty('${product.id}', 1)">Add to Cart</button>`;
        }

        card.innerHTML = `
            <div class="food-img-wrapper">
                <img src="${product.imageUrl || 'https://via.placeholder.com/300x200?text=Food'}" alt="${product.name}">
                <span class="${product.category === 'Veg' ? 'veg-tag' : 'non-veg-tag'}">${product.category}</span>
                ${isOutOfStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
            </div>
            <div class="food-info">
                <h3>${product.name}</h3>
                <p class="food-desc">${product.description || 'Freshly prepared ' + product.name}</p>
                <div class="food-footer">
                    <span class="food-price">₹${product.price}</span>
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
    cartCountSpan.textContent = totalCount;
}

// Search
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term));
    renderProducts(filtered);
});

function renderCategoryFilters(products) {
    if (!catFilters) return;
    
    // 1. Extract Unique Categories
    const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c))];
    
    // 2. Clear and Render Pills
    catFilters.innerHTML = '';
    categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `cat-pill ${cat === 'All' ? 'active' : ''}`;
        pill.dataset.category = cat;
        pill.innerText = cat;
        
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

// Logout
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    });
});
