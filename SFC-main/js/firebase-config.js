import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// !!! REPLACE WITH YOUR PROJECT CONFIG FROM FIREBASE CONSOLE !!!
const firebaseConfig = {
  apiKey: "AIzaSyBTIrTlT8s-pjiHaOo1RlRVg4_pLjt6L1c",
  authDomain: "sfc-database-cc3da.firebaseapp.com",
  projectId: "sfc-database-cc3da",
  storageBucket: "sfc-database-cc3da.firebasestorage.app",
  messagingSenderId: "953625953643",
  appId: "1:953625953643:web:87905dbed92a107b5a782e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
