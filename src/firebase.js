// ============================================================
//  FIREBASE CONFIG — Raza Online Services
//
//  TO ENABLE real-time sync across devices:
//  1. Go to https://console.firebase.google.com
//  2. Create a project → Realtime Database → copy your config
//  3. Replace the placeholder values below with your real values
//
//  Until then, the app works perfectly with local storage only.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCmRrNjZnzIEgfnMSFjq4BGYxoKUlh7iEY",
  authDomain: "raza-online.firebaseapp.com",
  databaseURL: "https://raza-online-default-rtdb.asia-southeast1.firebasedatabase.app", // Added based on Singapore region
  projectId: "raza-online",
  storageBucket: "raza-online.firebasestorage.app",
  messagingSenderId: "412104436004",
  appId: "1:412104436004:web:fd6a9b3cd9ce17d90dabb1",
  measurementId: "G-MKNJ8MEFY9"
};

// Returns true only when real credentials are present
export function isFirebaseConfigured() {
  return (
    firebaseConfig.databaseURL &&
    !firebaseConfig.databaseURL.includes('REPLACE_WITH') &&
    firebaseConfig.databaseURL.startsWith('https://')
  );
}
