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

function firebaseCredential() {
  const serviceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT || '')
    .trim()
    .replace(/^(['"])|(['"])$/g, '')
  if (serviceAccount) {
    try {
      return cert(JSON.parse(serviceAccount))
    } catch (error) {
      console.error('FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.', error)
      return null
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    })
  }
  return null
}

const credential = firebaseCredential()
if (credential && !getApps().length) initializeApp({ credential })
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
export const PAYU_ENV = String(process.env.PAYU_ENV || 'test').trim().toLowerCase()
export const PAYU_IS_PROD = PAYU_ENV === 'production' || PAYU_ENV === 'prod'
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
const payuCooldownUntil = new Map()
const payuInFlight = new Map()

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }

  const reset = Number(response.headers.get('x-rate-limit-reset'))
  if (Number.isFinite(reset)) {
    const resetMs = reset > 1e12 ? reset : reset * 1000
    return Math.max(0, resetMs - Date.now())
  }

  const exponential = Math.min(30_000, 1_000 * 2 ** attempt)
  return Math.round(exponential * (0.5 + Math.random()))
}

function logPayUResponse(txnid, response, body) {
  const headers = {}
  response.headers.forEach((value, name) => { headers[name] = value })
  console.error('PayU verify_payment response', {
    txnid,
    status: response.status,
    headers,
    body
  })
}

/** PayU status for one or more transaction ids, in a single verify_payment request.
 *  Returns { [txnid]: transaction_details } (PayU reports the paid amount as "amt"). */
export async function verifyPayUPayment(txnids) {
  if (!PAYU_KEY || !PAYU_SALT) throw new HttpError(503, 'PayU credentials (PAYU_KEY / PAYU_SALT) are not configured on the server.')
  const txnid = [].concat(txnids).join('|')
  const existing = payuInFlight.get(txnid)
  if (existing) return existing

  const verification = verifyPayUPaymentOnce(txnid)
  payuInFlight.set(txnid, verification)
  try {
    return await verification
  } finally {
    payuInFlight.delete(txnid)
  }
}

async function verifyPayUPaymentOnce(txnid) {
  const cooldown = payuCooldownUntil.get(PAYU_POST_URL) || 0
  if (cooldown > Date.now()) await wait(cooldown - Date.now())

  const hash = payuHash(`${PAYU_KEY}|verify_payment|${txnid}|${PAYU_SALT}`)
  const params = new URLSearchParams()
  params.set('key', PAYU_KEY)
  params.set('command', 'verify_payment')
  params.set('var1', txnid)
  params.set('hash', hash)

  for (let attempt = 0; attempt < 3; attempt++) {
    let response
    let bodyText = ''
    try {
      response = await fetch(PAYU_POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      bodyText = await response.text()
    } catch (err) {
      if (attempt === 2) throw new HttpError(502, 'Could not contact PayU payment verification service.')
      await wait(Math.round(1_000 * (0.5 + Math.random())))
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      logPayUResponse(txnid, response, bodyText)
      const delay = retryDelay(response, attempt)
      payuCooldownUntil.set(PAYU_POST_URL, Date.now() + delay)
      if (attempt < 2) {
        await wait(delay)
        continue
      }
      throw new HttpError(429, 'PayU rate limit or service error. Retry later.')
    }

    if (!response.ok) {
      logPayUResponse(txnid, response, bodyText)
      throw new HttpError(502, `PayU verification failed with HTTP ${response.status}.`)
    }

    let data
    try { data = JSON.parse(bodyText) } catch (_) {
      logPayUResponse(txnid, response, bodyText)
      throw new HttpError(502, 'Invalid response from PayU payment verification service.')
    }
    if (/too many requests|rate limit/i.test(bodyText) || data.error) {
      logPayUResponse(txnid, response, bodyText)
      const delay = retryDelay(response, attempt)
      payuCooldownUntil.set(PAYU_POST_URL, Date.now() + delay)
      if (attempt < 2) {
        await wait(delay)
        continue
      }
      throw new HttpError(429, 'PayU reported a rate limit. Retry later.')
    }
    return data.transaction_details || {}
  }
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
export async function checkCanRegister(roll, { allowExisting = false } = {}) {
  if (!/^[A-Z0-9]{10}$/.test(roll)) throw new HttpError(400, 'Enter a valid 10-character roll number.')
  let alreadyRegistered = false
  if (db) {
    const taken = await db.collection('registrations').where('roll', '==', roll).get()
    const paidDoc = taken.docs.find(d => d.data()?.payment === 'paid')
    alreadyRegistered = Boolean(paidDoc)
    if (alreadyRegistered && !allowExisting) {
      throw new HttpError(409, 'This roll number is already registered. Log in with your roll number and password.')
    }
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
      if (cfg.capacity && paid >= cfg.capacity && !alreadyRegistered) throw new HttpError(409, 'All seats are taken.')
    } catch (_) {}
  }
  if (cfg.fee === undefined) cfg.fee = 1
  const s = await fetchStudent(roll)
  if (cfg.eligibleYears?.length && !cfg.eligibleYears.map(String).includes(s.year)) {
    throw new HttpError(403, `This contest is open to year ${cfg.eligibleYears.join(' & ')} students only.`)
  }
  return { student: s, cfg, alreadyRegistered }
}
