import { handler, student, checkCanRegister, razorpay, db, FieldValue, HttpError } from './_lib.js'

/** Creates a Razorpay order for the signed-in student. The amount comes from the event settings and the
 *  student's details from the college records — never from the browser. */
export default handler(async req => {
  const { uid, roll } = await student(req)
  if ((await db.doc(`registrations/${uid}`).get()).exists) throw new HttpError(409, 'You are already registered. Open your ticket from the dashboard.')
  const { student: s, cfg } = await checkCanRegister(roll)
  if (!(cfg.fee > 0)) throw new HttpError(409, 'The registration fee has not been set by the organisers yet.')
  const order = await razorpay('/orders', {
    amount: Math.round(cfg.fee * 100), currency: 'INR', receipt: `${roll}-${Date.now()}`,
    notes: { uid, roll, name: s.name }
  })
  await db.doc(`orders/${order.id}`).set({ uid, roll, amount: order.amount, currency: order.currency, student: s, status: 'created', createdAt: FieldValue.serverTimestamp() })
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID }
})
