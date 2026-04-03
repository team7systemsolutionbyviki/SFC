import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    setDoc, 
    doc, 
    getDoc,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { showToast } from './ui-utils.js';

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authError = document.getElementById('auth-error');
const forgotPassBtn = document.getElementById('forgot-password');

// --- Forgot Password Logic ---
forgotPassBtn.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    if (!email || !email.includes('@')) {
        showToast("Please enter your email above before clicking forgot password.", "info");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset email sent! Check your inbox.", "success");
    } catch (err) {
        showToast(`Error: ${err.message}`, "error");
    }
});

// Tab Switching
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
});

// Helper to show cleaner errors
function formatAuthError(err) {
    if (err.code === 'auth/email-already-in-use') return "Email is already registered! Try logging in.";
    if (err.code === 'auth/invalid-email') return "Invalid identity or password format.";
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') return "Incorrect credentials.";
    return err.message;
}

// 🛡 MULTI-LOGIN LOGIC (Username, Email, Mobile)
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identity = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    authError.textContent = '';
    
    showToast("Authenticating...", "info");

    // 🔥 Super Admin Bypass (VIKI)
    if (identity.toUpperCase() === 'VIKI' && pass === 'VIKI1101') {
        showToast("Welcome Super Admin VIKI!", 'success');
        localStorage.setItem('admin_session', 'viki_super');
        setTimeout(() => window.location.href = 'admin/index.html', 1500);
        return;
    }

    // 🛡 Store Admin Bypass (HARI)
    if (identity.trim().toUpperCase() === 'HARI' && pass.trim() === '654321') {
        showToast("Welcome Admin HARI!", 'success');
        localStorage.setItem('admin_session', 'hari_admin');
        setTimeout(() => window.location.href = 'admin/index.html', 1500);
        return;
    }

    try {
        let finalEmail = identity;

        // If it's not a standard email, search by User Name or Mobile
        if (!identity.includes('@')) {
            console.log("Searching for alternative identity...");
            const qName = query(collection(db, "users"), where("name", "==", identity));
            const qMobile = query(collection(db, "users"), where("mobile", "==", identity));
            
            const [snapName, snapMobile] = await Promise.all([getDocs(qName), getDocs(qMobile)]);
            
            if (!snapName.empty) {
                finalEmail = snapName.docs[0].data().email;
                console.log("Found account via Username:", finalEmail);
            } else if (!snapMobile.empty) {
                finalEmail = snapMobile.docs[0].data().email;
                console.log("Found account via Mobile:", finalEmail);
            }
        }

        const userCred = await signInWithEmailAndPassword(auth, finalEmail, pass);
        const userDoc = await getDoc(doc(db, "users", userCred.user.uid));

        if (userDoc.exists()) {
            const userData = userDoc.data();
            showToast(`Welcome, ${userData.name}!`, 'success');
            setTimeout(() => {
                window.location.href = userData.role === 'admin' ? 'admin/index.html' : 'customer/index.html';
            }, 1500);
        } else {
            throw new Error("User account found but profile is missing.");
        }
    } catch (err) {
        const msg = formatAuthError(err);
        authError.textContent = msg;
        showToast(msg, 'error');
    }
});

// Signup Logic
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const mobile = document.getElementById('signup-mobile').value;
    const pass = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;
    authError.textContent = '';

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", userCred.user.uid), {
            uid: userCred.user.uid,
            name: name,
            email: email,
            mobile: mobile,
            role: role
        });

        showToast("Account created successfully!", "success");
        setTimeout(() => {
            window.location.href = role === 'admin' ? 'admin/index.html' : 'customer/index.html';
        }, 1500);
    } catch (err) {
        const msg = formatAuthError(err);
        authError.textContent = msg;
        showToast(msg, "error");
    }
});

// --- Public Menu Display ---
const publicFoodGrid = document.getElementById('public-food-grid');

function loadPublicMenu() {
    if(!publicFoodGrid) return;
    
    const q = query(collection(db, "products"));
    onSnapshot(q, (snap) => {
        publicFoodGrid.innerHTML = '';
        if (snap.empty) {
            publicFoodGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No items added yet.</p>';
            return;
        }
        
        snap.forEach(doc => {
            const p = doc.data();
            const card = document.createElement('div');
            card.className = 'menu-card';
            card.innerHTML = `
                <img src="${p.imageUrl}" alt="${p.name}">
                <h4>${p.name}</h4>
                <div class="price">₹${p.price}</div>
                <small>${p.category}</small>
            `;
            publicFoodGrid.appendChild(card);
        });
    });
}

// Check session and load menu
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        // role-based redirection can be added here if needed
    }
    loadPublicMenu();
});
