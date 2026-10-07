/* Shared server code for the Vercel functions in /api (files starting with "_" are not endpoints).
   Firebase Admin writes registrations; PayU's API is the source of truth for every payment. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Fallback loader for .env / .env.local if not pre-injected into process.env
for (const envFile of ['.env.local', '.env']) {
  try {
    const p = path.resolve(process.cwd(), envFile)
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  } catch (_) {}
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
if (serviceAccount && !getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
export const db = getApps().length ? getFirestore() : null
export { FieldValue }

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/** POST-only JSON endpoint; known errors go back as { error }, unexpected ones are logged. */
export const handler = fn => async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    res.status(200).json(await fn(req))
  } catch (e) {
    if (!e.status) console.error(e)
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong. Please try again.' })
  }
}

/** The signed-in student, from the Firebase ID token in "Authorization: Bearer …". */
export async function student(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '').trim()
  if (!token) throw new HttpError(401, 'Please log in to continue.')

  if (!getApps().length) throw new HttpError(503, 'Authentication service is not configured.')
  let decoded
  try {
    decoded = await getAuth().verifyIdToken(token)
  } catch {
    throw new HttpError(401, 'Your login expired. Log in again.')
  }

  const email = decoded.email || req.body?.email || ''
  const m = /^([a-z0-9]+)(?:_v\d+)?@students\.codearena\.local$/i.exec(email)
  const roll = m ? m[1].toUpperCase() : (req.body?.roll ? String(req.body.roll).trim().toUpperCase() : '')
  if (!roll) throw new HttpError(403, 'Student accounts only.')
  return { uid: decoded.uid, roll }
}

/* ---------- PayU Payment Gateway ---------- */
export const PAYU_KEY = process.env.PAYU_KEY || process.env.PAYU_MERCHANT_KEY || ''
export const PAYU_SALT = process.env.PAYU_SALT || process.env.PAYU_MERCHANT_SALT || ''
// Force production environment to bypass any stuck system env variables
export const PAYU_ENV = 'production'
export const PAYU_IS_PROD = true
export const PAYU_POST_URL = process.env.PAYU_POST_URL || (PAYU_IS_PROD
  ? 'https://info.payu.in/merchant/postservice.php?form=2'
  : 'https://test.payu.in/merchant/postservice.php?form=2')
export const PAYU_PAYMENT_URL = process.env.PAYU_PAYMENT_URL || (PAYU_IS_PROD
  ? 'https://secure.payu.in/_payment'
  : 'https://test.payu.in/_payment')
export const PAYU_BOLT_URL = PAYU_IS_PROD
  ? 'https://jssdk.payu.in/bolt/bolt.min.js'
  : 'https://jssdk-uat.payu.in/bolt/bolt.min.js'

export function payuHash(str) {
  return crypto.createHash('sha512').update(str).digest('hex')
}

/** Generates the SHA-512 hash required for PayU payment checkout:
 *  sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|SALT) */
export function createPaymentHash({
  key = PAYU_KEY,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  udf6 = '',
  udf7 = '',
  udf8 = '',
  udf9 = '',
  udf10 = '',
  salt = PAYU_SALT
}) {
  const hashString = [
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    udf6,
    udf7,
    udf8,
    udf9,
    udf10,
    salt
  ].join('|')
  return payuHash(hashString)
}

/** Verifies the reverse hash sent by PayU in callbacks/response:
 *  sha512(SALT|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key) */
export function verifyReverseHash({
  status,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  udf6 = '',
  udf7 = '',
  udf8 = '',
  udf9 = '',
  udf10 = '',
  additionalCharges,
  hash,
  key = PAYU_KEY,
  salt = PAYU_SALT
}) {
  const base = [
    salt,
    status,
    udf10,
    udf9,
    udf8,
    udf7,
    udf6,
    udf5,
    udf4,
    udf3,
    udf2,
    udf1,
    email,
    firstname,
    productinfo,
    amount,
    txnid,
    key
  ].join('|')
  const seq = additionalCharges ? `${additionalCharges}|${base}` : base
  const expectedHash = payuHash(seq).toLowerCase()
  return expectedHash === String(hash || '').toLowerCase()
}

/** Server-to-server payment verification with PayU using the verify_payment command. */
export async function verifyPayUPayment(txnid) {
  if (!PAYU_KEY || !PAYU_SALT) throw new HttpError(503, 'PayU credentials (PAYU_KEY / PAYU_SALT) are not configured on the server.')
  const hash = payuHash(`${PAYU_KEY}|verify_payment|${txnid}|${PAYU_SALT}`)
  const params = new URLSearchParams()
  params.set('key', PAYU_KEY)
  params.set('command', 'verify_payment')
  params.set('var1', txnid)
  params.set('hash', hash)

  let r
  try {
    r = await fetch(PAYU_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })
  } catch (err) {
    throw new HttpError(502, 'Could not contact PayU payment verification service.')
  }

  const data = await r.json().catch(() => null)
  if (!data) throw new HttpError(502, 'Invalid response from PayU payment verification service.')
  const details = data.transaction_details?.[txnid]
  return details || null
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
  if (db) {
    const taken = await db.collection('registrations').where('roll', '==', roll).get()
    const paidDoc = taken.docs.find(d => d.data()?.payment === 'paid')
    if (paidDoc) throw new HttpError(409, 'This roll number is already registered. Log in with your roll number and password.')
  }
  let cfg = {}
  if (db) {
    try {
      cfg = (await db.doc('config/event').get()).data() ?? {}
    } catch (_) {}
  }
  if (cfg.regOpen === false) throw new HttpError(403, 'Registrations are closed.')
  if (db) {
    try {
      const paid = (await db.doc('config/stats').get()).data()?.paid ?? 0
      if (cfg.capacity && paid >= cfg.capacity) throw new HttpError(409, 'All seats are taken.')
    } catch (_) {}
  }
  if (cfg.fee === undefined) cfg.fee = 1
  const s = await fetchStudent(roll)
  if (cfg.eligibleYears?.length && !cfg.eligibleYears.map(String).includes(s.year)) {
    throw new HttpError(403, `This contest is open to year ${cfg.eligibleYears.join(' & ')} students only.`)
  }
  return { student: s, cfg }
}
