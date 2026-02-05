import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const firebaseConfig = window.__FIREBASE_CONFIG__ || null;
const adminEmails = Array.isArray(window.__ADMIN_EMAILS__)
  ? window.__ADMIN_EMAILS__
  : [];

const isConfigValid = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let app = null;
let db = null;
let auth = null;

if (isConfigValid) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export { app, db, auth, adminEmails, isConfigValid };
