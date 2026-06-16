import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, orderBy, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const MalagaFirebase = (() => {
  let app = null;
  let auth = null;
  let dbInstance = null;
  let configState = { loaded: false, ready: false, error: null };
  let profileCache = null;

  function basePath() {
    let path = window.location.pathname;
    if (path.endsWith('/index.html')) path = path.slice(0, -10) + '/';
    else if (!path.endsWith('/')) {
      const slash = path.lastIndexOf('/');
      path = slash >= 0 ? path.slice(0, slash + 1) : '/';
    }
    return path;
  }

  async function init() {
    if (configState.loaded) return configState;
    configState.loaded = true;

    try {
      const res = await fetch(`${basePath()}data/firebase-config.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Configurazione Firebase non trovata');
      const cfg = await res.json();
      
      app = initializeApp(cfg);
      auth = getAuth(app);
      dbInstance = getFirestore(app);
      configState.ready = true;
    } catch (error) {
      configState.error = error.message || 'Firebase non configurato';
    }

    return configState;
  }

  function db() {
    if (!dbInstance) throw new Error('Firebase non pronto');
    return dbInstance;
  }

  async function session() {
    await init();
    if (!auth) return null;
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user ? { user } : null);
      });
    });
  }

  async function signInWithGoogle() {
    await init();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      console.log("[Firebase] Starting Google Sign-In...");
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("[Firebase] Sign-In successful. UID:", user.uid);
      
      const profileRef = doc(db(), 'profiles', user.uid);
      console.log("[Firebase] Checking if profile exists...");
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        console.log("[Firebase] Profile does not exist. Creating new profile document...");
        await setDoc(profileRef, {
          email: user.email,
          display_name: user.displayName || user.email.split('@')[0],
          role: 'user',
          status: 'disabled',
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
        console.log("[Firebase] Profile successfully created in Firestore!");
      } else {
        console.log("[Firebase] Profile already exists in Firestore.");
      }
    } catch (error) {
      console.error("[Firebase] Error during sign-in or profile creation:", error);
      throw error;
    }
  }

  async function signInWithPassword(email, password) {
    await init();
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      const profileRef = doc(db(), 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        await setDoc(profileRef, {
          email: user.email,
          display_name: user.email.split('@')[0],
          role: 'user',
          status: 'disabled',
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async function signOut() {
    if (auth) await firebaseSignOut(auth);
    profileCache = null;
  }

  function onAuthChange(callback) {
    if (!auth && !configState.ready) {
      // If not initialized yet, wait for init or call it immediately and then attach
      init().then(() => {
        if (auth) onAuthStateChanged(auth, () => {
          profileCache = null;
          callback();
        });
      });
      return () => {};
    }
    const unsubscribe = onAuthStateChanged(auth, () => {
      profileCache = null;
      callback();
    });
    return unsubscribe;
  }

  async function profile() {
    await init();
    const s = await session();
    if (!s) return null;
    if (profileCache) return profileCache;
    
    const profileRef = doc(db(), 'profiles', s.user.uid);
    const profileSnap = await getDoc(profileRef);
    
    if (!profileSnap.exists()) {
      profileCache = {
        id: s.user.uid,
        email: s.user.email,
        display_name: s.user.displayName || s.user.email,
        role: 'user',
        status: 'disabled'
      };
      return profileCache;
    }
    
    const data = profileSnap.data();
    profileCache = { id: s.user.uid, ...data };
    return profileCache;
  }

  async function updateProfile(patch) {
    const p = await profile();
    const profileRef = doc(db(), 'profiles', p.id);
    await updateDoc(profileRef, {
      ...patch,
      updated_at: serverTimestamp()
    });
    profileCache = null;
  }

  async function listProposals() {
    await init();
    // In Supabase this was an RPC, we have to rebuild the aggregation in JS or use separate queries.
    // Given the small scale, we'll fetch proposals and then fetch profiles and votes.
    const proposalsRef = collection(db(), 'planning_proposals');
    const q = query(proposalsRef, where('status', '!=', 'archived'));
    const snapshot = await getDocs(q);
    
    let profilesMap = {};
    try {
      const profilesRef = collection(db(), 'profiles');
      const profilesSnap = await getDocs(profilesRef);
      profilesSnap.forEach(doc => profilesMap[doc.id] = doc.data());
    } catch (e) {
      console.warn("Could not fetch profiles for names:", e.message);
    }

    const currentUserId = auth.currentUser ? auth.currentUser.uid : null;
    const currentUserRole = profileCache ? profileCache.role : 'user';

    const results = [];
    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      const pId = docSnap.id;
      
      const creatorProfile = profilesMap[p.created_by];
      const created_by_name = creatorProfile ? creatorProfile.display_name : 'Gruppo';
      const can_edit = (p.created_by === currentUserId || currentUserRole === 'admin');
      
      results.push({
        id: pId,
        ...p,
        created_at: p.created_at?.toDate ? p.created_at.toDate().toISOString() : p.created_at,
        updated_at: p.updated_at?.toDate ? p.updated_at.toDate().toISOString() : p.updated_at,
        created_by_name,
        can_edit
      });
    });

    // Sort: approved first, then open, then closed, then by day_date, then created_at
    const statusWeight = { 'approved': 0, 'open': 1, 'closed': 2 };
    results.sort((a, b) => {
      const wA = statusWeight[a.status] ?? 3;
      const wB = statusWeight[b.status] ?? 3;
      if (wA !== wB) return wA - wB;
      if (a.day_date !== b.day_date) return a.day_date.localeCompare(b.day_date);
      return new Date(a.created_at) - new Date(b.created_at);
    });

    return results;
  }

  async function listApprovedProgram() {
    await init();
    if (!auth) return []; // In the original, it was public? The RPC granted to anon. Let's allow if db is init.
    
    const proposalsRef = collection(db(), 'planning_proposals');
    const q = query(proposalsRef, where('status', '==', 'approved'));
    const snapshot = await getDocs(q);
    
    const results = [];
    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      results.push({
        id: docSnap.id,
        ...p,
        created_at: p.created_at?.toDate ? p.created_at.toDate().toISOString() : p.created_at,
        updated_at: p.updated_at?.toDate ? p.updated_at.toDate().toISOString() : p.updated_at
      });
    });
    
    results.sort((a, b) => {
      if (a.day_date !== b.day_date) return a.day_date.localeCompare(b.day_date);
      return new Date(a.created_at) - new Date(b.created_at);
    });
    
    return results;
  }

  async function saveProposal(input) {
    const s = await session();
    if (!s) throw new Error("Not authenticated");

    const proposalsRef = collection(db(), 'planning_proposals');
    
    if (input.id) {
      const docRef = doc(db(), 'planning_proposals', input.id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error("Proposal not found");
      const currentData = snap.data();
      
      let versionChanged = false;
      if (
        currentData.title !== input.title ||
        currentData.description !== (input.description || '') ||
        currentData.day_date !== input.day_date ||
        currentData.location !== (input.location || '') ||
        currentData.place_id !== (input.place_id || null)
      ) {
        versionChanged = true;
      }
      
      await updateDoc(docRef, {
        title: input.title,
        description: input.description || '',
        day_date: input.day_date,
        location: input.location || '',
        place_id: input.place_id || null,
        status: input.status || 'open',
        current_version: versionChanged ? currentData.current_version + 1 : currentData.current_version,
        updated_at: serverTimestamp()
      });
      return;
    }

    const newDocRef = doc(proposalsRef);
    await setDoc(newDocRef, {
      title: input.title,
      description: input.description || '',
      day_date: input.day_date,
      location: input.location || '',
      place_id: input.place_id || null,
      created_by: s.user.uid,
      status: input.status || 'open',
      current_version: 1,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
  }

  async function vote(proposal) {
    const s = await session();
    if (!s) throw new Error("Not authenticated");
    
    const voteId = `${proposal.proposal_id}_${proposal.current_version}_${s.user.uid}`;
    const voteRef = doc(db(), 'votes', voteId);
    
    await setDoc(voteRef, {
      proposal_id: proposal.proposal_id,
      proposal_version: proposal.current_version,
      user_id: s.user.uid,
      vote: proposal.vote,
      updated_at: serverTimestamp(),
      created_at: serverTimestamp() // setDoc might overwrite, but fine for simple upsert
    }, { merge: true });
  }

  async function approveProposal(proposalId) {
    const s = await session();
    if (!s) throw new Error("Not authenticated");
    
    const pRef = doc(db(), 'planning_proposals', proposalId);
    await updateDoc(pRef, {
      status: 'approved',
      updated_at: serverTimestamp()
    });
    
    const approvedRef = collection(db(), 'approved_plannings');
    await addDoc(approvedRef, {
      proposal_id: proposalId,
      approved_by: s.user.uid,
      approved_at: serverTimestamp(),
      notes: ''
    });
  }

  async function deleteProposal(proposalId) {
    // Delete from approved_plannings first
    const approvedRef = collection(db(), 'approved_plannings');
    const q = query(approvedRef, where('proposal_id', '==', proposalId));
    const snap = await getDocs(q);
    
    const batch = writeBatch(db());
    snap.forEach(d => {
      batch.delete(d.ref);
    });
    
    const pRef = doc(db(), 'planning_proposals', proposalId);
    batch.update(pRef, {
      status: 'archived',
      updated_at: serverTimestamp()
    });
    
    await batch.commit();
  }

  async function invite(email, role) {
    const s = await session();
    if (!s) throw new Error("Not authenticated");
    
    const invitesRef = collection(db(), 'invites');
    await addDoc(invitesRef, {
      email,
      role,
      invited_by: s.user.uid,
      accepted_at: null,
      expires_at: null,
      created_at: serverTimestamp()
    });
  }

  return {
    init,
    session,
    signInWithPassword, // Alias to signInWithGoogle to not break UI
    signInWithGoogle,
    signOut,
    onAuthChange,
    profile,
    updateProfile,
    listApprovedProgram,
    listProposals,
    saveProposal,
    vote,
    approveProposal,
    deleteProposal,
    invite,
    get state() { return configState; }
  };
})();

window.MalagaFirebase = MalagaFirebase;
window.MalagaSupabase = MalagaFirebase; // Expose as MalagaSupabase for backward compatibility with UI
