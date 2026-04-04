import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

// Elements
const cartList = document.getElementById('cart-list');
const emptyCartMsg = document.getElementById('empty-cart-msg');
const checkoutArea = document.getElementById('checkout-area');
const checkoutForm = document.getElementById('checkout-form');
const grandTotalSpan = document.getElementById('grand-total');
const deliveryInfo = document.getElementById('delivery-info');
const orderTypeInputs = document.getElementsByName('order-type');
const areaSelect = document.getElementById('delivery-area');
const getLocationBtn = document.getElementById('get-location-btn');
const locationStatus = document.getElementById('location-status');
const mapLinkInput = document.getElementById('map-link');

let cart = JSON.parse(localStorage.getItem('food_cart')) || [];
let currentUser = null;
let allLocations = [];

// Auth check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }
    currentUser = user;
    renderCart();
    setupListeners();
});

function setupListeners() {
    // 🔄 Switch Order Type
    orderTypeInputs.forEach(input => {
        input.onchange = () => {
            const type = input.value;
            const subLabel = document.getElementById('order-type-label');
            if (subLabel) subLabel.innerText = type + " Order";
            
            if (type === 'Delivery') {
                deliveryInfo.classList.remove('hidden');
            } else {
                deliveryInfo.classList.add('hidden');
                if (areaSelect) areaSelect.value = "0";
            }
            renderCart();
        };
    });

    if (areaSelect) areaSelect.onchange = () => renderCart();
}

function renderCart() {
    const items = cartList.querySelectorAll('.cart-item');
    items.forEach(el => el.remove());

    if (cart.length === 0) {
        if (emptyCartMsg) emptyCartMsg.classList.remove('hidden');
        if (checkoutArea) checkoutArea.classList.add('hidden');
        return;
    }

    if (emptyCartMsg) emptyCartMsg.classList.add('hidden');
    if (checkoutArea) checkoutArea.classList.remove('hidden');

    let total = 0;
    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const card = document.createElement('div');
        card.className = 'cart-item fade-in';
        card.innerHTML = `
            <img src="${item.imageUrl || ''}" class="cart-item-img">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <div class="qty-control">
                    <button type="button" class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button type="button" class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                </div>
            </div>
            <div class="cart-item-price">
                <span>₹${item.price * item.quantity}</span>
                <button type="button" class="remove-btn" onclick="removeItem(${index})">🗑</button>
            </div>
        `;
        cartList.appendChild(card);
    });

    let deliveryFee = 0;
    if (areaSelect && areaSelect.value !== "0") {
        deliveryFee = parseFloat(areaSelect.options[areaSelect.selectedIndex].dataset.fee) || 0;
    }
    if (grandTotalSpan) grandTotalSpan.textContent = `₹${total + deliveryFee}`;
}

// Global functions for the buttons
window.updateQty = (index, change) => {
    cart[index].quantity += change;
    if (cart[index].quantity < 1) cart[index].quantity = 1;
    localStorage.setItem('food_cart', JSON.stringify(cart));
    renderCart();
};

window.removeItem = (index) => {
    cart.splice(index, 1);
    localStorage.setItem('food_cart', JSON.stringify(cart));
    renderCart();
};

// Fetch Locations for Dropdown
onSnapshot(collection(db, "locations"), (snap) => {
    allLocations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (areaSelect) {
        areaSelect.innerHTML = '<option value="0" data-fee="0">Select Area (Fee Apply)</option>';
        allLocations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.dataset.fee = loc.fee;
            opt.textContent = `${loc.name} (+₹${loc.fee})`;
            areaSelect.appendChild(opt);
        });
    }
});

// 📍 Get Current Location
if (getLocationBtn) {
    getLocationBtn.onclick = () => {
        if (!navigator.geolocation) {
            locationStatus.innerText = "Geolocation not supported";
            return;
        }
        locationStatus.innerText = "🔍 Getting location...";
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            const link = `https://www.google.com/maps?q=${latitude},${longitude}`;
            mapLinkInput.value = link;
            locationStatus.innerText = "✅ Location Tagged Successfully!";
        }, () => {
            locationStatus.innerText = "❌ Location Access Denied";
        });
    };
}
// checkoutForm.onsubmit logic remains below...

if (checkoutForm) {
    checkoutForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('place-order-btn');
        btn.disabled = true;
        
        const cartData = JSON.parse(localStorage.getItem('food_cart') || '[]');
        if (cartData.length === 0) {
            showToast("Your cart is empty", "error");
            btn.disabled = false;
            return;
        }

        const orderType = [...orderTypeInputs].find(r => r.checked).value;
        const name = document.getElementById('cust-name').value;
        const phone = document.getElementById('cust-phone').value;
        const address = document.getElementById('cust-address').value || "No address provided";
        const mapLink = mapLinkInput.value || "";
        
        // --- Mandatory Delivery Area Check ---
        if (orderType === 'Delivery' && (!areaSelect || areaSelect.value === "0")) {
            showToast("Please select a delivery area!", "error");
            btn.disabled = false;
            return;
        }
        
        // --- Calculate Final Total (Food + Delivery) ---
        const deliveryCharge = orderType === 'Delivery' ? (parseFloat(areaSelect?.options[areaSelect.selectedIndex]?.dataset.fee) || 0) : 0;
        const totalPrice = cartData.reduce((acc, item) => acc + (item.price * item.quantity), 0) + deliveryCharge;

        try {
            const orderRef = await addDoc(collection(db, "orders"), {
                userId: currentUser.uid,
                customerName: name,
                phone: phone,
                address: address,
                orderType: orderType,
                deliveryArea: orderType === 'Delivery' ? (areaSelect?.options[areaSelect.selectedIndex]?.text || 'N/A') : 'N/A',
                deliveryFee: deliveryCharge,
                mapLink: mapLink,
                items: cartData,
                totalPrice: totalPrice,
                status: 'Pending',
                timestamp: serverTimestamp()
            });

            localStorage.removeItem('food_cart');
            showToast("Order Placed Successfully!");
            window.location.href = `orders.html?id=${orderRef.id}`;
        } catch (error) {
            console.error(error);
            showToast("Error placing order", "error");
            btn.disabled = false;
        }
    };
}
