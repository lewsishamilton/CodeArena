import { getAuth } from 'firebase-admin/auth'
import { getApps } from 'firebase-admin/app'
import { db, handler, HttpError } from './_lib.js'

const ADMIN_EMAIL = 'admin@codearena.local'

async function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !getApps().length) throw new HttpError(401, 'Admin authentication is required.')
  let decoded
  try {
    decoded = await getAuth().verifyIdToken(token)
  } catch {
    throw new HttpError(401, 'Your admin login has expired. Log in again.')
  }
  if (String(decoded.email || '').toLowerCase() !== ADMIN_EMAIL) {
    throw new HttpError(403, 'Only the organiser can change participant passwords.')
  }
  return decoded
}

export default handler(async req => {
  await requireAdmin(req)
  if (!db) throw new HttpError(503, 'Authentication service is not configured.')
  const uid = String(req.body?.uid || '').trim()
  const password = String(req.body?.password || '')
  if (!uid || password.length < 8) throw new HttpError(400, 'Provide a participant and a password of at least 8 characters.')
  const registration = await db.doc(`registrations/${uid}`).get()
  if (!registration.exists || registration.data()?.payment !== 'paid') {
    throw new HttpError(404, 'A paid participant registration was not found.')
  }
  await getAuth().updateUser(uid, { password })
  return { ok: true }
})
