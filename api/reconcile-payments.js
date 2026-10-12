import { getAuth } from 'firebase-admin/auth'
import { db, handler, HttpError, verifyPayUPayment } from './_lib.js'
import { issue } from './confirm-payment.js'

const ADMIN_EMAIL = 'admin@codearena.local'

/** Organiser: asks PayU about every unfinished checkout from the last 7 days and issues tickets for the paid ones.
 *  Catches students whose network dropped after paying and who never came back to the site. Also lists students
 *  who paid twice (a second successful order after their ticket was issued) so they can be refunded. */
export default handler(async req => {
  let decoded
  try { decoded = await getAuth().verifyIdToken(String(req.headers.authorization || '').replace(/^Bearer /, '')) }
  catch { throw new HttpError(401, 'Your login expired. Log in again.') }
  if (String(decoded.email || '').toLowerCase() !== ADMIN_EMAIL) throw new HttpError(403, 'Administrator access required.')

  const since = Date.now() - 7 * 864e5
  const open = (await db.collection('orders').where('status', '==', 'created').get()).docs
    .filter(d => (d.data().createdAt?.toMillis?.() ?? 0) > since)

  const issued = [], paidTwice = []
  for (let i = 0; i < open.length; i += 25) {           // PayU verify_payment: up to 25 ids per request
    const batch = open.slice(i, i + 25)
    const details = await verifyPayUPayment(batch.map(d => d.id))
    for (const o of batch) {
      const p = details[o.id]
      if (!p || !['success', 'captured'].includes(String(p.status).toLowerCase())) continue
      const order = o.data()
      if (Number(p.amt ?? p.amount) !== Number(order.amount)) continue
      const reg = (await db.doc(`registrations/${order.uid}`).get()).data()
      if (reg?.payment === 'paid') {
        if (reg.txnid !== o.id) paidTwice.push({ roll: order.roll, txnid: o.id, payuId: p.mihpayid, amount: p.amt })
        continue
      }
      await issue(order.uid, o.ref, order, { ...p, amount: p.amt ?? p.amount })
      issued.push(order.roll)
    }
  }
  return { checked: open.length, issued, paidTwice }
})
