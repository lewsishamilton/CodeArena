import crypto from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { getApps } from 'firebase-admin/app'
import { checkCanRegister, db, handler, HttpError, normRoll } from './_lib.js'

const hash = value => crypto.createHash('sha256').update(value).digest('hex')

export default handler(async req => {
  if (!db || !getApps().length) throw new HttpError(503, 'Enrollment service is not configured.')
  const roll = normRoll(req.body?.roll)
  const password = String(req.body?.password || '')
  const code = String(req.body?.code || '').trim()
  if (password.length < 8 || !/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter a valid password and six-digit verification code.')
  const { student } = await checkCanRegister(roll)
  const tokenRef = db.doc(`enrollmentTokens/${roll}`)
  const tokenSnap = await tokenRef.get()
  const token = tokenSnap.data()
  if (!token || token.expiresAt < Date.now()) throw new HttpError(400, 'Verification code expired. Request a new one.')
  if (token.attempts >= 5) throw new HttpError(429, 'Too many verification attempts. Request a new code.')
  if (token.email !== String(student.email || '').toLowerCase() || token.codeHash !== hash(code)) {
    await tokenRef.set({ attempts: (token.attempts || 0) + 1 }, { merge: true })
    throw new HttpError(400, 'Incorrect verification code.')
  }
  const email = `${roll.toLowerCase()}@students.codearena.local`
  let user
  try { user = await getAuth().createUser({ email, password, displayName: student.name }) }
  catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpError(409, 'This roll number is already registered. Log in instead.')
    throw error
  }
  await tokenRef.delete()
  return { token: await getAuth().createCustomToken(user.uid), email }
})
