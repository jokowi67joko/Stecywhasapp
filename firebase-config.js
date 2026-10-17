// Import modul Firebase v10 dari CDN resmi Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// GANTI BAGIAN INI DENGAN CONFIG FIREBASE PROJECT KAMU
const firebaseConfig = {
  apiKey: "AIzaSyDX3AKm5veFTtxA9daZ8TVtXfQ2Ocg6bP0",
  authDomain: "stecyhut.firebaseapp.com",
  projectId: "stecyhut",
  storageBucket: "stecyhut.firebasestorage.app",
  messagingSenderId: "399168251119",
  appId: "1:399168251119:web:a66510b68343f7a53b271a"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, googleProvider, db, storage };
