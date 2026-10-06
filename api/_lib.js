/* Shared server code for the Vercel functions in /api (files starting with "_" are not endpoints).
   Firebase Admin writes registrations; Razorpay's API is the source of truth for every payment. */
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
if (serviceAccount && !getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
export const db = serviceAccount ? getFirestore() : null
export { FieldValue }

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/** POST-only JSON endpoint; known errors go back as { error }, unexpected ones are logged. */
export const handler = fn => async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    if (!db) throw new HttpError(503, 'The payment server is not set up yet (missing Firebase service account).')
    res.status(200).json(await fn(req))
  } catch (e) {
    if (!e.status) console.error(e)
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong. Please try again.' })
  }
}

/** The signed-in student, from the Firebase ID token in "Authorization: Bearer …". */
export async function student(req) {
  let decoded
  try { decoded = await getAuth().verifyIdToken(String(req.headers.authorization || '').replace(/^Bearer /, '')) }
  catch { throw new HttpError(401, 'Your login expired. Log in again.') }
  const m = /^([a-z0-9]+)(?:_v\d+)?@students\.codearena\.local$/.exec(decoded.email || '')
  if (!m) throw new HttpError(403, 'Student accounts only.')
  return { uid: decoded.uid, roll: m[1].toUpperCase() }
}

/** Razorpay REST API (GET without body, POST with body). */
export async function razorpay(path, body) {
  const key = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const r = await fetch('https://api.razorpay.com/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${key}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  })
  const d = await r.json()
  if (!r.ok) throw new HttpError(502, d.error?.description || 'Payment service error. Try again.')
  return d
}

/* ---------- College student records ----------
   Only these six fields ever leave the server: the API also returns private data
   (date of birth, Aadhaar, parent details) that must not reach the browser. */
const COURSES = { A: 'B.Tech', D: 'M.Tech', E: 'MBA', F: 'MCA' }   // 6th character of a JNTUH roll number
const ROMAN = { I: '1', II: '2', III: '3', IV: '4' }
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
export const normRoll = v => String(v ?? '').trim().toUpperCase()

async function fetchStudent(roll) {
  let res
  try { res = await fetch('https://mlrit-api.onrender.com/student/' + encodeURIComponent(roll), { signal: AbortSignal.timeout(55_000) }) }
  catch { throw new HttpError(503, 'The college student service is waking up. Try again in a minute.') }
  if (res.status === 401 || res.status === 404) throw new HttpError(404, 'No student found with this roll number. Check it and try again.')
  if (!res.ok) throw new HttpError(503, 'The college student service is not responding. Try again in a minute.')
  const d = await res.json()
  if (!d.success || !d.name) throw new HttpError(404, 'No student found with this roll number. Check it and try again.')
  return {
    roll: normRoll(d.roll_no ?? roll), name: titleCase(String(d.name).trim()), course: COURSES[roll[5]] ?? '',
    branch: String(d.branch ?? ''), year: ROMAN[String(d.semester ?? '').split('/')[0].trim()] ?? '', email: String(d.student_email ?? '')
  }
}

/** Eligibility + seat checks before showing details or taking money. */
export async function checkCanRegister(roll) {
  if (!/^[A-Z0-9]{10}$/.test(roll)) throw new HttpError(400, 'Enter a valid 10-character roll number.')
  const taken = await db.collection('registrations').where('roll', '==', roll).limit(1).get()
  if (!taken.empty) throw new HttpError(409, 'This roll number is already registered. Log in with your roll number and password.')
  const cfg = (await db.doc('config/event').get()).data() ?? {}
  if (cfg.regOpen === false) throw new HttpError(403, 'Registrations are closed.')
  const paid = (await db.doc('config/stats').get()).data()?.paid ?? 0
  if (cfg.capacity && paid >= cfg.capacity) throw new HttpError(409, 'All seats are taken.')
  const s = await fetchStudent(roll)
  if (cfg.eligibleYears?.length && !cfg.eligibleYears.map(String).includes(s.year)) {
    throw new HttpError(403, `This contest is open to year ${cfg.eligibleYears.join(' & ')} students only.`)
  }
  return { student: s, cfg }
}
