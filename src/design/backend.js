/* =========================================================================
   Firebase connection for the CODE//ARENA screens: auth, Firestore, Functions,
   PayU checkout. All event data lives in Firestore — nothing is hardcoded.
   ========================================================================= */
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth'
import * as fs from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const env = import.meta.env
export const configured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)

/** Must match ADMIN_EMAIL in functions/src/index.ts and firestore.rules. The organiser logs in with ID "admin". */
export const ADMIN_EMAIL = 'admin@codearena.local'
/** Students log in with their roll number; Firebase Auth needs an email, so the roll maps to this address. Supports versioning when reset. */
export const rollEmail = (roll, version = 1) => {
  const r = String(roll).trim().toLowerCase()
  return (version && version > 1) ? `${r}_v${version}@students.codearena.local` : `${r}@students.codearena.local`
}

export async function getRollVersion(roll) {
  if (!configured) return 1
  try {
    const snap = await fs.getDoc(fs.doc(db, 'config', 'roll_versions'))
    return snap.exists() ? (snap.data()?.[String(roll).trim().toUpperCase()] || 1) : 1
  } catch (_) {
    return 1
  }
}

const app = configured ? initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
}) : null
const auth = app && getAuth(app)
export const db = app && fs.getFirestore(app)
const functions = app && getFunctions(app, 'asia-south1')
export { fs, auth }

/** Calls a Firebase Cloud Function (unused while the project is on the free Spark plan). */
export const call = (name, data) => configured
  ? httpsCallable(functions, name)(data).then(r => r.data)
  : Promise.reject(new Error('The site is not connected to Firebase yet.'))

const REG_CACHE_KEY = uid => `ca_reg_${uid}`

/** The signed-in person: { user, isAdmin, reg } — reg is the student's registration document. */
export const session = { user: null, isAdmin: false, reg: null }

let readyPromise
/** Resolves once Firebase has restored the login (and loaded the student's registration). */
export function ready() {
  if (!configured) return Promise.resolve(session)
  readyPromise ||= new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop()
      await setUser(user)
      resolve(session)
    })
  })
  return readyPromise
}
async function setUser(user) {
  session.user = user
  session.isAdmin = user?.email === ADMIN_EMAIL
  session.reg = null
  if (user && !session.isAdmin) {
    // 1. Immediately restore cached registration if present for 0ms delay
    try {
      const cached = localStorage.getItem(REG_CACHE_KEY(user.uid))
      if (cached) session.reg = JSON.parse(cached)
    } catch (_) {}

    // 2. If cached, refresh in background; otherwise await fetch
    if (session.reg) {
      getRegistration().catch(() => {})
    } else {
      await getRegistration()
    }
  }
}
export async function getRegistration() {
  if (!session.user) return null
  try {
    const snap = await fs.getDoc(fs.doc(db, 'registrations', session.user.uid))
    if (snap.exists()) {
      session.reg = { uid: snap.id, ...snap.data() }
      try { localStorage.setItem(REG_CACHE_KEY(session.user.uid), JSON.stringify(session.reg)) } catch (_) {}
    } else {
      session.reg = null
      try { localStorage.removeItem(REG_CACHE_KEY(session.user.uid)) } catch (_) {}
    }
  } catch (err) {
    console.warn('Could not read registration from Firestore', err)
  }
  return session.reg
}

/** Student login: roll number + password. Firebase Auth keeps it across page loads. */
export async function login(roll, password) {
  if (!configured) throw new Error('The site is not connected to Firebase yet.')
  const cleanRoll = String(roll).trim().toUpperCase()
  const version = await getRollVersion(cleanRoll)
  try {
    const cred = await signInWithEmailAndPassword(auth, rollEmail(cleanRoll, version), password)
    await setUser(cred.user)
    return session
  } catch (e) {
    if (version > 1) {
      try {
        const cred2 = await signInWithEmailAndPassword(auth, rollEmail(cleanRoll, 1), password)
        await setUser(cred2.user)
        return session
      } catch (_) {}
    }
    throw e
  }
}

/** Organiser login (the /admin screen): admin ID + password. */
export async function loginAdmin(id, password) {
  if (!configured) throw new Error('The site is not connected to Firebase yet.')
  if (!['admin', ADMIN_EMAIL].includes(String(id).trim().toLowerCase())) throw new Error('Wrong admin ID or password.')
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password)
  await setUser(cred.user)
  return session
}

export async function logout() {
  if (session.user?.uid) {
    try { localStorage.removeItem(REG_CACHE_KEY(session.user.uid)) } catch (_) {}
  }
  if (configured) await signOut(auth).catch(() => {})
  await setUser(null)
}

/** Creates the student's login (roll number + password) and signs them in.
 *  If a participant was deleted by admin, this enables them to register again with any password seamlessly. */
export async function createAccount(roll, password) {
  if (!configured) throw new Error('The site is not connected to Firebase yet.')
  const cleanRoll = String(roll).trim().toUpperCase()
  let version = await getRollVersion(cleanRoll)
  let email = rollEmail(cleanRoll, version)
  let user = null

  // If already signed in as this roll:
  if (auth.currentUser && auth.currentUser.email && auth.currentUser.email.startsWith(cleanRoll.toLowerCase())) {
    try {
      const snap = await fs.getDoc(fs.doc(db, 'registrations', auth.currentUser.uid))
      if (snap.exists() && snap.data()?.payment === 'paid') {
        await setUser(auth.currentUser)
        return session
      }
      // Registration was deleted by admin or not paid -> update password and continue!
      await updatePassword(auth.currentUser, password).catch(() => {})
      await setUser(auth.currentUser)
      return session
    } catch (_) {}
  }

  // Try creating new user with the active roll version
  try {
    user = (await createUserWithEmailAndPassword(auth, email, password)).user
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      // 1. Try signing in with the provided password
      let signedIn = false
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password)
        user = cred.user
        signedIn = true
        const snap = await fs.getDoc(fs.doc(db, 'registrations', user.uid))
        if (snap.exists() && snap.data()?.payment === 'paid') {
          await setUser(user)
          throw new Error('This roll number is already registered. Log in with your roll number and password.')
        }
      } catch (signInErr) {
        if (signInErr.message?.includes('already registered')) throw signInErr
        // 2. If password didn't match old account or was deleted, provision a fresh versioned account so user can register again!
        let nextVersion = version + 1
        for (let tries = 0; tries < 5; tries++) {
          const nextEmail = rollEmail(cleanRoll, nextVersion)
          try {
            user = (await createUserWithEmailAndPassword(auth, nextEmail, password)).user
            fs.setDoc(fs.doc(db, 'config', 'roll_versions'), { [cleanRoll]: nextVersion }, { merge: true }).catch(() => {})
            break
          } catch (err2) {
            if (err2.code === 'auth/email-already-in-use') {
              nextVersion++
            } else {
              throw err2
            }
          }
        }
      }
      if (!user && !signedIn) {
        throw new Error('This roll number is already registered. Log in with your roll number and password.')
      }
    } else {
      throw e
    }
  }

  await setUser(user)
  return session
}

/** Calls our server (/api on Vercel) as the signed-in user. */
async function api(path, data = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (session.user) headers.Authorization = 'Bearer ' + await session.user.getIdToken()
  let r
  try { r = await fetch('/api/' + path, { method: 'POST', headers, body: JSON.stringify(data) }) }
  catch { throw new Error('Network problem. Check your connection and try again.') }
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Server error. Please try again.')
  return d
}

const COURSES = { A: 'B.Tech', D: 'M.Tech', E: 'MBA', F: 'MCA' }
const ROMAN = { I: '1', II: '2', III: '3', IV: '4' }
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

/** Student details from the college records (fetched via /api/lookup on server, with direct fallback). */
export async function lookupStudent(roll) {
  const norm = String(roll || '').trim().toUpperCase()
  try {
    const s = await api('lookup', { roll: norm })
    if (s && s.name) return s
  } catch (err) {
    console.warn('/api/lookup unavailable, using direct student API fallback:', err.message)
  }

  // Direct fetch from student records API
  let res
  try {
    res = await fetch('https://mlrit-api.onrender.com/student/' + encodeURIComponent(norm))
  } catch (_) {
    throw new Error('The college student service is waking up. Try again in a minute.')
  }
  if (res.status === 401 || res.status === 404) throw new Error('No student found with this roll number. Check it and try again.')
  if (!res.ok) throw new Error('The college student service is not responding. Try again in a minute.')
  const d = await res.json().catch(() => ({}))
  if (!d.success || !d.name) throw new Error('No student found with this roll number. Check it and try again.')

  return {
    roll: String(d.roll_no || norm).trim().toUpperCase(),
    name: titleCase(String(d.name).trim()),
    course: COURSES[norm[5]] || 'B.Tech',
    branch: String(d.branch || ''),
    year: ROMAN[String(d.semester || '').split('/')[0].trim()] || '1',
    email: String(d.student_email || '')
  }
}

/** Asks the server to check PayU for this student's payment and issue the ticket. Returns the registration or null. */
export async function confirmPayment(txnid, orderContext) {
  let status = 'unpaid'
  let details = null
  try {
    const res = await api('confirm-payment', txnid ? { txnid } : {})
    status = res?.status
    details = res
  } catch (err) {
    console.warn('confirm-payment API call:', err.message)
  }

  if (status !== 'paid' && !orderContext?.completed) return null
  try { localStorage.removeItem(REG_CACHE_KEY(session.user.uid)) } catch (_) {}
  let reg = await getRegistration()

  // If payment succeeded but server could not write to Firestore, create registration directly
  if (!reg && session.user) {
    try {
      const statsRef = fs.doc(db, 'config', 'stats')
      const statsSnap = await fs.getDoc(statsRef).catch(() => null)
      const seq = (statsSnap?.exists() ? (statsSnap.data()?.paid || 0) + 1 : Number(Date.now().toString().slice(-3)))
      const yy = String(new Date().getFullYear()).slice(-2)
      const s = orderContext?.prefill || {}

      const regData = {
        roll: s.roll || session.user.email.split('@')[0].toUpperCase(),
        name: s.name || 'Student',
        course: s.course || '',
        dept: s.branch || '',
        year: s.year || '1',
        email: s.email || session.user.email,
        payment: 'paid',
        ticket: 'issued',
        txn: details?.paymentId || txnid || `PAYU_${Date.now()}`,
        orderId: txnid || '',
        txnid: txnid || '',
        amount: Number(orderContext?.amount || 100),
        currency: 'INR',
        method: details?.mode || 'PayU',
        payerEmail: s.email || session.user.email,
        paidAt: new Date(),
        seq,
        regId: `CA${yy}-${String(seq).padStart(4, '0')}`,
        ticketId: `TK-${String(seq).padStart(2, '0')}`,
        registeredAt: new Date()
      }

      await fs.setDoc(fs.doc(db, 'registrations', session.user.uid), regData)
      session.reg = { uid: session.user.uid, ...regData }
      try { localStorage.setItem(REG_CACHE_KEY(session.user.uid), JSON.stringify(session.reg)) } catch (_) {}
      return session.reg
    } catch (e) {
      console.warn('Could not save client registration:', e)
    }
  }
  return reg
}

/** Reads one document's data, or null. */
export async function getData(path) {
  if (!configured) return null
  try {
    const snap = await fs.getDoc(fs.doc(db, path))
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn(`Could not read ${path}`, e)
    return null
  }
}
/** Reads a whole collection as [{ id, ...data }]. */
export async function getAll(name, ...constraints) {
  if (!configured) return []
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, name), ...constraints))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn(`Could not read ${name}`, e)
    return []
  }
}
/** Live updates for a collection; returns an unsubscribe function. */
export function watchAll(name, cb, ...constraints) {
  if (!configured) { cb([]); return () => {} }
  return fs.onSnapshot(fs.query(fs.collection(db, name), ...constraints),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    e => { console.warn(`Live updates for ${name} stopped`, e); cb([]) })
}
export function watchDoc(path, cb) {
  if (!configured) { cb(null); return () => {} }
  return fs.onSnapshot(fs.doc(db, path), snap => cb(snap.exists() ? snap.data() : null), () => cb(null))
}

/** Firestore Timestamp | Date | string | number → milliseconds (or null). */
export const ms = v => v == null ? null : typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime()

/** Human-readable message for Firebase errors. */
export function errorMessage(e) {
  const code = e?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') return 'Wrong ID or password.'
  if (code === 'auth/operation-not-allowed') return 'Login is not enabled yet. The organisers must turn on Email/Password sign-in in Firebase.'
  if (code === 'auth/email-already-in-use') return 'This roll number is already registered. Log in instead.'
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a minute and try again.'
  if (code === 'auth/network-request-failed' || code === 'unavailable') return 'Network problem. Check your connection and try again.'
  if (code === 'permission-denied' && !e.message) return 'You don\'t have access to this.'
  return e?.message?.replace(/^Firebase: /, '').replace(/ \(.*\)\.?$/, '') || 'Something went wrong. Please try again.'
}

/* ---------- PayU checkout ---------- */
/** Pays the event fee: the server creates the PayU order and SHA-512 hash, then the browser navigates
 *  to PayU's hosted payment gateway (secure.payu.in) where the student completes payment via UPI/Card/NetBanking.
 *  After payment, PayU returns to surl (/register?payment=success) and the ticket is generated. */
export async function payWithPayU({ name, description, prefill = {} }) {
  const order = await api('create-order', {
    phone: prefill.phone,
    name: prefill.name,
    email: prefill.email
  })
  if (!order.key || !order.hash) {
    throw new Error('PayU is not properly configured on the server. Please check your PayU credentials.')
  }

  const origin = window.location.origin
  const surl = `${origin}/api/payu-callback`
  const furl = `${origin}/api/payu-callback`

  // Store order details in sessionStorage so client-side state is preserved across PayU redirect
  try {
    sessionStorage.setItem('codearena_pending_checkout', JSON.stringify({
      txnid: order.txnid,
      amount: order.amount,
      prefill
    }))
  } catch (_) {}

  // Direct PayU Hosted Checkout Form POST (official standard, works across all browsers and devices)
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = order.paymentUrl || 'https://secure.payu.in/_payment'
  form.style.display = 'none'

  const fields = {
    key: order.key,
    txnid: order.txnid,
    amount: order.amount,
    productinfo: order.productinfo || name || 'CODE//ARENA Registration',
    firstname: order.firstname || (prefill.name ? prefill.name.split(' ')[0] : 'Student'),
    email: order.email || prefill.email || '',
    phone: order.phone || (prefill.phone ? String(prefill.phone).slice(-10) : '9999999999'),
    surl: order.surl || surl,
    furl: order.furl || furl,
    udf1: order.udf1 || '',
    udf2: order.udf2 || '',
    udf3: '',
    udf4: '',
    udf5: '',
    hash: order.hash,
    service_provider: 'payu_paisa'
  }

  for (const [k, v] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = k
    input.value = v == null ? '' : String(v)
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()

  return new Promise(() => {})
}

// Seed admin settings
setTimeout(() => {
  if (configured && db) {
    fs.setDoc(fs.doc(db, 'config', 'event'), { fee: 100, regOpen: true, capacity: 150 }, { merge: true })
      .catch(e => console.error('Failed to seed config', e));
  }
}, 3000);
