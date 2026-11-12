import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAzDMVuUA9LqetWLpmLo8lWlhxZ69R04As",
  authDomain: "midterm-project-ba073.firebaseapp.com",
  projectId: "midterm-project-ba073",
  storageBucket: "midterm-project-ba073.firebasestorage.app",
  messagingSenderId: "323036542827",
  appId: "1:323036542827:web:d8726ad7a639c47ae8be2e",
  measurementId: "G-C1YN899F35",
};

export const db = getFirestore(initializeApp(firebaseConfig));
