import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const historyList = document.getElementById('order-history-list');
const noOrdersMsg = document.getElementById('no-orders-msg');

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }
    fetchOrderHistory(user.uid);
});

function fetchOrderHistory(userId) {
    const q = query(collection(db, "orders"), where("userId", "==", userId));
    
    onSnapshot(q, (snapshot) => {
        // Clear existing cards (except the message)
        const existingCards = historyList.querySelectorAll('.order-card');
        existingCards.forEach(el => el.remove());

        if (snapshot.empty) {
            noOrdersMsg.classList.remove('hidden');
            return;
        }

        noOrdersMsg.classList.add('hidden');
        
        let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by timestamp desc
        orders.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card fade-in';
            
            const firstImg = order.items[0]?.imageUrl || 'https://via.placeholder.com/60';
            const itemString = order.items.map(i => `${i.name} x${i.quantity}`).join(', ');

            card.innerHTML = `
                <div class="order-top">
                    <img src="${firstImg}" class="order-thumb">
                    <div class="order-info">
                        <span class="order-id">#${order.id.substring(0, 8).toUpperCase()}</span>
                        <div class="order-items-list">${itemString}</div>
                    </div>
                    <div class="order-pricing">
                        <div class="order-total">₹${order.totalPrice}</div>
                        <span class="status-badge status-${order.status}">${order.status}</span>
                    </div>
                </div>
                
                <div class="order-footer">
                    <div class="order-progress-track">
                        <!-- Step 1: Placed (All types) -->
                        <div class="track-step ${['Pending', 'Preparing', 'On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>Placed</span>
                        </div>
                        
                        <!-- Step 2: Preparing (All types) -->
                        <div class="track-step ${['Preparing', 'On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>Preparing</span>
                        </div>
                        
                        <!-- Step 3: On the Way (DELIVERY ONLY) -->
                        ${order.orderType === 'Delivery' ? `
                        <div class="track-step ${['On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>On the Way</span>
                        </div>
                        ` : ''}
                        
                        <!-- Step 4: Final Received/Delivered (All types) -->
                        <div class="track-step ${order.status === 'Delivered' ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>${order.orderType === 'Delivery' ? 'Delivered' : (order.orderType === 'Pickup' ? 'Picked Up' : 'Served')}</span>
                        </div>
                    </div>
                </div>
            `;
            historyList.appendChild(card);
        });
    });
}
const logoutBtn = document.getElementById('logout-btn');
const logoutBtnMob = document.getElementById('logout-btn-mob');

const handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    });
};

if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (logoutBtnMob) logoutBtnMob.addEventListener('click', handleLogout);
