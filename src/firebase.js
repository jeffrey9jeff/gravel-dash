import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

const firebaseConfig = {
  projectId: "citytosun-gravel",
  appId: "1:625654242538:web:e518b0e328018a155d0b93",
  storageBucket: "citytosun-gravel.firebasestorage.app",
  apiKey: "AIzaSyA8z6P5_QHdL8zbM3B0ca-1Dd2iE2DWHvA",
  authDomain: "citytosun-gravel.firebaseapp.com",
  messagingSenderId: "625654242538",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DOC_REF = doc(db, "app", "state");

export function subscribeToState(callback) {
  return onSnapshot(DOC_REF, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback(null);
    }
  }, (err) => {
    console.error("Firestore listen error:", err);
  });
}

export async function saveState(state) {
  try {
    await setDoc(DOC_REF, state);
  } catch (e) {
    console.error("Firestore save failed:", e);
  }
}
