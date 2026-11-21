import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";

export const cfg = self.FIREBASE_CONFIG || {};
export const vapidKey = self.FIREBASE_VAPID_KEY || "";
export const configurado = !!cfg.apiKey && !/COLE/i.test(cfg.apiKey) && !/COLE/i.test(cfg.projectId || "");

export let app = null, auth = null, db = null;
if (configurado) {
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
}

export async function obterMessaging() {
  if (!configurado) return null;
  try {
    if (!(await isSupported())) return null;
    return getMessaging(app);
  } catch (e) {
    return null;
  }
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch,
  getToken, deleteToken, onMessage
};
