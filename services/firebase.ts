
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { CourseNode } from "../types";

// Cấu hình Firebase (Lấy từ hình ảnh Project Settings của bạn)
const firebaseConfig = {
  apiKey: "AIzaSyDqwU5EKw91pc6So2ggVGcL2WrLfR_mZFg",
  authDomain: "e-book-for-me.firebaseapp.com",
  projectId: "e-book-for-me",
  storageBucket: "e-book-for-me.firebasestorage.app",
  messagingSenderId: "380456713229",
  appId: "1:380456713229:web:4d920884462625ad23a944"
};

// Internal state
let db: any = null;
let storage: any = null;
let auth: any = null;
let isConfigured = false;

// Safe Initialization Logic
const initializeFirebaseSafe = () => {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    isConfigured = true;
    console.log("✅ Firebase Initialized Successfully");
  } catch (error) {
    console.error("❌ Firebase Initialization Failed:", error);
    isConfigured = false;
  }
};

// Run initialization
initializeFirebaseSafe();

export interface FirestoreUser {
    uid: string;
    name: string;
    email: string;
    avatar: string;
    lastLogin: number;
    geminiApiKey?: string; // Field for Admin to set
    isActiveAI?: boolean;
}

class FirebaseService {
  // --- AUTHENTICATION ---
  async loginWithGoogle(): Promise<{ user: User, token?: string } | null> {
    if (!isConfigured || !auth) {
        alert("Chưa cấu hình Firebase. Vui lòng kiểm tra source code.");
        return null;
    }

    const provider = new GoogleAuthProvider();
    // Yêu cầu quyền truy cập Google Calendar
    provider.addScope('https://www.googleapis.com/auth/calendar');

    try {
        const result = await signInWithPopup(auth, provider);
        // Lấy Access Token của Google (quan trọng để gọi Google Calendar API)
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        
        // Sync user info to Firestore for Admin to see
        await this.syncUserToFirestore(result.user);

        return { user: result.user, token };
    } catch (error) {
        console.error("Login Failed", error);
        alert("Đăng nhập thất bại: " + (error as any).message);
        return null;
    }
  }

  async logout() {
    if (auth) await signOut(auth);
  }

  get currentUser() {
      return auth?.currentUser;
  }

  // --- USER MANAGEMENT (ADMIN & SYNC) ---
  private async syncUserToFirestore(user: User) {
      if (!isConfigured || !db) return;
      try {
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
              uid: user.uid,
              name: user.displayName || 'No Name',
              email: user.email || 'No Email',
              avatar: user.photoURL || '',
              lastLogin: Date.now()
          }, { merge: true });
      } catch (e) {
          console.error("Error syncing user to DB", e);
      }
  }

  // Admin Only: Get all users
  async getAllUsers(): Promise<FirestoreUser[]> {
      if (!isConfigured || !db) return [];
      try {
          const querySnapshot = await getDocs(collection(db, "users"));
          const users: FirestoreUser[] = [];
          querySnapshot.forEach((doc) => {
              users.push(doc.data() as FirestoreUser);
          });
          return users;
      } catch (e) {
          console.error("Error fetching users", e);
          return [];
      }
  }

  // Admin Only: Set API Key for a user
  async updateUserApiKey(targetUid: string, apiKey: string) {
      if (!isConfigured || !db) return;
      try {
          const userRef = doc(db, "users", targetUid);
          await updateDoc(userRef, {
              geminiApiKey: apiKey,
              isActiveAI: !!apiKey
          });
      } catch (e) {
          console.error("Error updating user API key", e);
          throw e;
      }
  }

  // User: Fetch my assigned API Key
  async getMyAssignedApiKey(uid: string): Promise<string | null> {
      if (!isConfigured || !db) return null;
      try {
          const userRef = doc(db, "users", uid);
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
              const data = docSnap.data();
              return data.geminiApiKey || null;
          }
      } catch (e) {
          console.error("Error fetching assigned key", e);
      }
      return null;
  }

  // --- STORAGE ---
  async uploadFile(file: File, path: string = 'courses'): Promise<string> {
    if (!isConfigured || !storage) {
        console.log("ℹ️ [Local Mode] File converted to Data URL (not uploaded to cloud)");
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    try {
      const fileId = Date.now().toString(36); 
      const storageRef = ref(storage, `${path}/${fileId}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading file to Firebase:", error);
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
    }
  }

  // --- FIRESTORE ---
  async saveCourseTree(tree: CourseNode[]) {
    try {
        localStorage.setItem('dh_course_tree_v2', JSON.stringify(tree));
    } catch (e) {
        console.warn("LocalStorage full or error", e);
    }

    if (!isConfigured || !db) return;

    try {
      await setDoc(doc(db, "data", "courseTree"), { tree });
    } catch (error) {
      console.error("Error saving course tree to Firestore:", error);
    }
  }

  async getCourseTree(): Promise<CourseNode[] | null> {
    if (isConfigured && db) {
        try {
            const docRef = doc(db, "data", "courseTree");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data().tree as CourseNode[];
            }
        } catch (error) {
            console.error("Error fetching course tree from Firestore:", error);
        }
    }
    console.log("ℹ️ Loading data from LocalStorage");
    const localData = localStorage.getItem('dh_course_tree_v2');
    if (localData) {
        return JSON.parse(localData);
    }
    return null;
  }
}

export const firebaseService = new FirebaseService();
