import crypto from 'node:crypto'
import { checkCanRegister, db, handler, HttpError } from './_lib.js'

const hash = value => crypto.createHash('sha256').update(value).digest('hex')

export default handler(async req => {
  if (!db) throw new HttpError(503, 'Enrollment service is not configured.')
  if (!process.env.RESEND_API_KEY) throw new HttpError(503, 'Enrollment email service is not configured.')
  const roll = String(req.body?.roll || '').trim().toUpperCase()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const { student } = await checkCanRegister(roll)
  if (!student.email || student.email.toLowerCase() !== email) throw new HttpError(403, 'Use the official student email address.')
  const code = String(crypto.randomInt(100000, 1000000))
  await db.doc(`enrollmentTokens/${roll}`).set({
    codeHash: hash(code), email, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0
  })
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CERTIFICATE_FROM_EMAIL || 'codearenamlrit@gmail.com',
      to: [student.email],
      subject: 'CodeArena registration verification code',
      html: `<p>Your CodeArena verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`
    })
  })
  if (!response.ok) throw new HttpError(502, 'Could not send the verification email.')
  return { sent: true }
})
