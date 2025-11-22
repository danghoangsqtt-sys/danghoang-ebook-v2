
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { CourseNode } from "../types";

// Cấu hình Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDqwU5EKw91pc6So2ggVGcL2WrLfR_mZFg",
    authDomain: "e-book-for-me.firebaseapp.com",
    projectId: "e-book-for-me",
    storageBucket: "e-book-for-me.firebasestorage.app",
    messagingSenderId: "380456713229",
    appId: "1:380456713229:web:4d920884462625ad23a944"
};

export interface FirestoreUser {
    uid: string;
    name: string;
    email: string;
    avatar: string;
    lastLogin: number;
    geminiApiKey?: string;
    isActiveAI?: boolean;
    storageEnabled?: boolean;
}

class FirebaseService {
    public auth: firebase.auth.Auth; // Changed to public for direct access
    private db: firebase.firestore.Firestore;
    private storage: firebase.storage.Storage;
    private _authCache: { uid: string, value: boolean } | null = null;
    public ADMIN_EMAIL = 'danghoang.sqtt@gmail.com';

    constructor() {
        let app: firebase.app.App;
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
            // Initialize Firestore with new persistence settings (v9+ modular syntax applied to compat)
            initializeFirestore(app, { localCache: persistentLocalCache() });
        } else {
            app = firebase.app();
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.storage = firebase.storage();
        console.log("✅ Firebase Service Initialized (v12.6.0 Compatible)");
    }

    async loginWithGoogle(): Promise<{ user: firebase.User, token?: string, apiKey?: string } | null> {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar');

        try {
            const result = await this.auth.signInWithPopup(provider);
            const credential = result.credential as firebase.auth.OAuthCredential;
            const token = credential?.accessToken;
            const user = result.user;

            if (!user) throw new Error("No user");

            // Clear cache on login
            this._authCache = null;

            // Check for existing API Key in Firestore immediately
            let storedApiKey = '';
            try {
                const docSnap = await this.db.collection("users").doc(user.uid).get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    storedApiKey = data?.geminiApiKey || '';
                }
            } catch (e) {
                console.error("Error fetching user data on login", e);
            }

            // Sync basics
            await this.syncUserToFirestore(user);

            return { user, token, apiKey: storedApiKey };
        } catch (error) {
            console.error("Login Failed", error);
            alert("Đăng nhập thất bại: " + (error as any).message);
            return null;
        }
    }

    async logout() {
        await this.auth.signOut();
        this._authCache = null;
    }

    get currentUser() {
        return this.auth.currentUser;
    }

    private async syncUserToFirestore(user: firebase.User) {
        try {
            const isSysAdmin = user.email === this.ADMIN_EMAIL;
            await this.db.collection("users").doc(user.uid).set({
                uid: user.uid,
                name: user.displayName || 'No Name',
                email: user.email || 'No Email',
                avatar: user.photoURL || '',
                lastLogin: Date.now(),
                // Force admin privileges in DB if needed, but logic handles it dynamically
                ...(isSysAdmin ? { isActiveAI: true, storageEnabled: true } : {})
            }, { merge: true });
        } catch (e) {
            console.error("Error syncing user to DB", e);
        }
    }

    async getAllUsers(): Promise<FirestoreUser[]> {
        // Only admin can do this, theoretically protected by Rules, but client-side check helps UI
        if (!this.currentUser || this.currentUser.email !== this.ADMIN_EMAIL) return [];

        try {
            const querySnapshot = await this.db.collection("users").get();
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

    async updateUserApiKey(targetUid: string, apiKey: string) {
        if (await this.isUserAuthorized()) {
            try {
                await this.db.collection("users").doc(targetUid).set({
                    geminiApiKey: apiKey,
                    isActiveAI: !!apiKey
                }, { merge: true });
                console.log(`Updated API Key for ${targetUid}`);
            } catch (e) {
                console.error("Error updating user API key", e);
            }
        }
    }

    async updateUserStatus(uid: string, data: Partial<FirestoreUser>) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) return;
        try {
            await this.db.collection("users").doc(uid).set(data, { merge: true });
        } catch (e) {
            console.error("Error updating user status", e);
            throw e;
        }
    }

    async getMyAssignedApiKey(uid: string): Promise<string | null> {
        // Anyone logged in can check their own key
        try {
            const docSnap = await this.db.collection("users").doc(uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                return data?.geminiApiKey || null;
            }
        } catch (e) {
            console.error("Error fetching assigned key", e);
        }
        return null;
    }

    async isUserAuthorized(): Promise<boolean> {
        if (!this.auth.currentUser) return false;
        const user = this.auth.currentUser;

        // Admin is ALWAYS authorized immediately
        if (user.email === this.ADMIN_EMAIL) {
            this._authCache = { uid: user.uid, value: true };
            return true;
        }

        // Cache hit
        if (this._authCache && this._authCache.uid === user.uid) {
            return this._authCache.value;
        }

        try {
            const docSnap = await this.db.collection("users").doc(user.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data) {
                    // Authorized if explicitly enabled
                    const isAuth = data.storageEnabled === true || data.isActiveAI === true;
                    this._authCache = { uid: user.uid, value: isAuth };
                    return isAuth;
                }
            }
        } catch (e) {
            console.warn("Authorization check failed", e);
        }

        this._authCache = { uid: user.uid, value: false };
        return false;
    }

    async getUserData(moduleName: string): Promise<any> {
        const localKey = `dh_${moduleName}`;

        // Try fetching cloud if authorized
        if (this.currentUser) {
            const isAuth = await this.isUserAuthorized();
            if (isAuth) {
                try {
                    const docSnap = await this.db.collection("users").doc(this.currentUser.uid).collection("modules").doc(moduleName).get();
                    if (docSnap.exists) {
                        const cloudData = docSnap.data()?.data;
                        if (cloudData) {
                            localStorage.setItem(localKey, JSON.stringify(cloudData));
                            return cloudData;
                        }
                    }
                } catch (e) {
                    console.warn(`[Cloud] Load error for ${moduleName}, falling back to local`, e);
                }
            }
        }
        // Fallback to local
        const localData = localStorage.getItem(localKey);
        return localData ? JSON.parse(localData) : null;
    }

    async saveUserData(moduleName: string, data: any) {
        const localKey = `dh_${moduleName}`;
        // Always save local first (Guest Mode compatible)
        localStorage.setItem(localKey, JSON.stringify(data));

        // Save to Cloud ONLY if authorized
        if (this.currentUser) {
            const isAuth = await this.isUserAuthorized();
            if (isAuth) {
                try {
                    await this.db.collection("users").doc(this.currentUser.uid).collection("modules").doc(moduleName).set({
                        data,
                        updatedAt: Date.now(),
                        module: moduleName
                    }, { merge: true });
                } catch (e) {
                    console.error(`[Cloud] Save error for ${moduleName}`, e);
                }
            }
        }
    }

    async uploadFile(file: File, folder: string = 'courses'): Promise<string> {
        // Check authorization first
        const isAuth = await this.isUserAuthorized();

        if (isAuth && this.auth.currentUser) {
            try {
                const fileId = Date.now().toString(36) + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
                let storagePath = `demo-uploads/${folder}/${fileId}`;

                const email = this.auth.currentUser.email;
                if (email === this.ADMIN_EMAIL && folder === 'courses') {
                    storagePath = `courses/${fileId}`;
                } else {
                    storagePath = `users/${this.auth.currentUser.uid}/${folder}/${fileId}`;
                }

                const storageRef = this.storage.ref(storagePath);
                const snapshot = await storageRef.put(file);
                return await snapshot.ref.getDownloadURL();
            } catch (error) {
                console.error("Error uploading file to cloud:", error);
                // Fallback to local blob if cloud upload fails
                return URL.createObjectURL(file);
            }
        } else {
            // Guest or Unauthorized: Use Local Object URL (Temporary)
            console.warn("User not authorized for Cloud Storage. Using local Blob URL.");
            return URL.createObjectURL(file);
        }
    }

    async saveCourseTree(tree: CourseNode[]) {
        try {
            localStorage.setItem('dh_course_tree_v2', JSON.stringify(tree));
        } catch (e) {
            console.warn("LocalStorage full", e);
        }

        // Only Admin can update the public course tree
        if (this.auth.currentUser?.email === this.ADMIN_EMAIL) {
            try {
                await this.db.collection("data").doc("courseTree").set({ tree });
            } catch (error) {
                console.error("Error saving course tree:", error);
            }
        }
    }

    async getCourseTree(): Promise<CourseNode[] | null> {
        try {
            const docSnap = await this.db.collection("data").doc("courseTree").get();
            if (docSnap.exists) {
                return docSnap.data()?.tree as CourseNode[];
            }
        } catch (error) {
            console.error("Error fetching course tree:", error);
        }
        const localData = localStorage.getItem('dh_course_tree_v2');
        return localData ? JSON.parse(localData) : null;
    }
}

export const firebaseService = new FirebaseService();
