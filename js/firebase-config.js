/*
  ============================================================
  FILE: js/firebase-config.js
  PURPOSE: Initialises Firebase and exports all the tools
  every other file needs — database, storage, auth.
  
  This file is imported by every other page using:
    import { db, storage } from '../js/firebase-config.js';
  
  WHY FIREBASE?
  Firebase gives us a real live database, file storage for
  profile photos, and authentication — all for free, with
  no server needed. Everything runs from the browser.
  ============================================================
*/

// Import Firebase core and the specific services we need
import { initializeApp }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore,
         collection, doc,
         setDoc, getDoc, getDocs,
         addDoc, updateDoc, deleteDoc,
         query, where, orderBy,
         serverTimestamp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage,
         ref, uploadBytes,
         getDownloadURL }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Your Firebase project configuration
// These values are safe to be in frontend code —
// security is handled by Firestore Rules, not by hiding the config
const firebaseConfig = {
  apiKey:            "AIzaSyCLqQVXtbchyztLRKfkv8YnzCAuPfdBFcE",
  authDomain:        "linkubuntu.firebaseapp.com",
  projectId:         "linkubuntu",
  storageBucket:     "linkubuntu.firebasestorage.app",
  messagingSenderId: "461482120414",
  appId:             "1:461482120414:web:b041a9dcc799a523af1e4f"
};

// Initialise the Firebase app
const app = initializeApp(firebaseConfig);

// Get the Firestore database instance
// db is what we use to read and write all citizen/contact data
const db = getFirestore(app);

// Get the Storage instance
// storage is what we use to upload and retrieve profile photos
const storage = getStorage(app);

/*
  ============================================================
  DATABASE HELPER FUNCTIONS
  These wrap Firebase calls in simple functions so the rest
  of the app doesn't need to know Firebase details.
  
  OUR DATABASE COLLECTIONS (like tables):
    citizens   — one document per registered person
    contacts   — emergency contacts linked to a citizen
    responders — authorised government personnel
    scan_logs  — audit trail of every fingerprint scan
    otp_codes  — temporary login codes (deleted after use)
  ============================================================
*/

// ---- CITIZENS ----

// Save a new citizen to Firestore
// citizenData = { id_number, full_name, phone, photo_url, ... }
async function saveCitizen(citizenData) {
  // Use the ID number as the document ID so we can look up by ID
  const docRef = doc(db, 'citizens', citizenData.id_number);
  await setDoc(docRef, {
    ...citizenData,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return citizenData.id_number;
}

// Get one citizen by their SA ID number
async function getCitizen(idNumber) {
  const docRef = doc(db, 'citizens', idNumber);
  const docSnap = await getDoc(docRef);
  // docSnap.exists() is true if the document was found
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null; // Return null if not found
}

// Get all citizens (for admin panel)
async function getAllCitizens() {
  const querySnapshot = await getDocs(collection(db, 'citizens'));
  // Map each document to a plain object with its ID
  return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Update a citizen's details
async function updateCitizen(idNumber, updates) {
  const docRef = doc(db, 'citizens', idNumber);
  await updateDoc(docRef, {
    ...updates,
    updated_at: serverTimestamp()
  });
}

// Delete a citizen (admin only)
async function deleteCitizen(idNumber) {
  await deleteDoc(doc(db, 'citizens', idNumber));
}

// ---- CONTACTS ----

// Add an emergency contact for a citizen
// contactData = { citizen_id, name, phone, relationship, priority }
async function addContact(contactData) {
  const docRef = await addDoc(collection(db, 'contacts'), {
    ...contactData,
    created_at: serverTimestamp()
  });
  return docRef.id;
}

// Get all contacts for a specific citizen
async function getContacts(citizenId) {
  const q = query(
    collection(db, 'contacts'),
    where('citizen_id', '==', citizenId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Delete a contact
async function deleteContact(contactId) {
  await deleteDoc(doc(db, 'contacts', contactId));
}

// ---- RESPONDERS ----

// Get a responder by employee number
async function getResponder(employeeNum) {
  const docRef = doc(db, 'responders', employeeNum);
  const snap = await getDoc(docRef);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  return null;
}

// Save a responder (admin adds these)
async function saveResponder(data) {
  await setDoc(doc(db, 'responders', data.employee_number), {
    ...data,
    created_at: serverTimestamp()
  });
}

// ---- FINGERPRINTS ----

// Save a fingerprint descriptor (array of numbers) for a citizen
async function saveFingerprint(idNumber, descriptor) {
  await updateDoc(doc(db, 'citizens', idNumber), {
    fingerprint: descriptor,
    fingerprint_enrolled_at: serverTimestamp()
  });
}

// Get all citizens who have fingerprints enrolled
// Used by the responder app to match against
async function getCitizensWithFingerprints() {
  const q = query(
    collection(db, 'citizens'),
    where('fingerprint', '!=', null)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---- OTP CODES ----

// Save a one-time PIN for login
async function saveOTP(phone, code) {
  // Use phone as doc ID — overwrites any previous OTP for this number
  await setDoc(doc(db, 'otp_codes', phone), {
    code: code,
    phone: phone,
    expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
    created_at: serverTimestamp()
  });
}

// Verify an OTP code
async function verifyOTP(phone, enteredCode) {
  const snap = await getDoc(doc(db, 'otp_codes', phone));
  if (!snap.exists()) return false;
  const data = snap.data();
  const now = new Date();
  const expires = data.expires_at.toDate ? data.expires_at.toDate() : new Date(data.expires_at);
  if (now > expires) return false;         // Expired
  if (data.code !== enteredCode) return false; // Wrong code
  // Delete the OTP after successful verification
  await deleteDoc(doc(db, 'otp_codes', phone));
  return true;
}

// ---- SCAN LOGS ----

// Log every fingerprint scan for accountability
async function logScan(scanData) {
  await addDoc(collection(db, 'scan_logs'), {
    ...scanData,
    timestamp: serverTimestamp()
  });
}

// ---- PHOTO UPLOAD ----

// Upload a profile photo and return its download URL
async function uploadPhoto(idNumber, file) {
  // Create a storage reference: photos/9001015800082.jpg
  const photoRef = ref(storage, `photos/${idNumber}`);
  // Upload the file
  await uploadBytes(photoRef, file);
  // Get the public URL
  const url = await getDownloadURL(photoRef);
  return url;
}

// Export everything so other files can import what they need
export {
  db, storage,
  saveCitizen, getCitizen, getAllCitizens, updateCitizen, deleteCitizen,
  addContact, getContacts, deleteContact,
  getResponder, saveResponder,
  saveFingerprint, getCitizensWithFingerprints,
  saveOTP, verifyOTP,
  logScan,
  uploadPhoto
};
