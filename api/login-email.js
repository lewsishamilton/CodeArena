import { getAuth } from 'firebase-admin/auth'
import { db, handler, normRoll, HttpError } from './_lib.js'

/** Which login email belongs to a roll number. Older re-registrations used roll_v2@… addresses, so the browser
 *  used to try up to five emails per login — and every failed browser sign-in counts toward Firebase's
 *  per-network lockout ("too many requests"). With this, the browser signs in exactly once. */
export default handler(async req => {
  const roll = normRoll(req.body?.roll).toLowerCase()
  if (!/^[a-z0-9]{10}$/.test(roll)) throw new HttpError(400, 'Enter a valid 10-character roll number.')
  const emails = [`${roll}@students.codearena.local`, ...[2, 3, 4, 5].map(v => `${roll}_v${v}@students.codearena.local`)]
  const { users } = await getAuth().getUsers(emails.map(email => ({ email })))
  if (!users.length) return { email: emails[0] }
  // Several logins for one roll: prefer the one holding the paid registration
  for (const u of users) {
    if ((await db.doc(`registrations/${u.uid}`).get()).data()?.payment === 'paid') return { email: u.email }
  }
  return { email: users[0].email }
})
