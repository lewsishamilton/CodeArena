import { getAuth } from 'firebase-admin/auth'
import { getApps } from 'firebase-admin/app'
import { checkCanRegister, db, handler, HttpError, normRoll } from './_lib.js'

export default handler(async req => {
  if (!db || !getApps().length) throw new HttpError(503, 'Enrollment service is not configured.')
  const roll = normRoll(req.body?.roll)
  const password = String(req.body?.password || '')
  if (password.length < 8) throw new HttpError(400, 'Enter a valid password of at least 8 characters.')
  const { student } = await checkCanRegister(roll)
  const email = `${roll.toLowerCase()}@students.codearena.local`
  let user
  try {
    user = await getAuth().createUser({ email, password, displayName: student.name })
  }
  catch (error) {
    if (error.code !== 'auth/email-already-exists') throw error

    // Account creation happens before payment. A cancelled or failed checkout
    // can therefore leave an Auth user without a paid registration. Reuse that
    // orphan account instead of permanently blocking the student.
    const existing = await getAuth().getUserByEmail(email)
    const registration = await db.doc(`registrations/${existing.uid}`).get()
    if (registration.exists && registration.data()?.payment === 'paid') {
      throw new HttpError(409, 'This roll number is already registered. Log in instead.')
    }
    user = await getAuth().updateUser(existing.uid, {
      password,
      displayName: student.name
    })
  }
  return { token: await getAuth().createCustomToken(user.uid), email }
})
