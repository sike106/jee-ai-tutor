import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAAQ6JwJ_1UUV40yNP7VPH-5QsRleL8mQY",
  authDomain: "exam-challenger-5b22d.firebaseapp.com",
  projectId: "exam-challenger-5b22d",
  storageBucket: "exam-challenger-5b22d.firebasestorage.app",
  messagingSenderId: "490875259715",
  appId: "1:490875259715:web:497e3bd0dcbfbec4173df6"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };