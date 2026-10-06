import { handler, student, razorpay, db, FieldValue, HttpError } from './_lib.js'

const METHODS = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI' }

/** Asks Razorpay (not the browser) whether any of the student's orders has been paid. If so, captures it
 *  if needed and issues the registration + next ticket number in one transaction. Safe to call repeatedly:
 *  after checkout, and again on page load if the student closed the window mid-payment. */
export default handler(async req => {
  const { uid } = await student(req)
  const regRef = db.doc(`registrations/${uid}`)
  if ((await regRef.get()).exists) return { status: 'paid' }

  const orders = await db.collection('orders').where('uid', '==', uid).get()
  for (const o of orders.docs) {
    const order = o.data()
    const { items } = await razorpay(`/orders/${o.id}/payments`)
    let p = items.find(x => x.status === 'captured') ?? items.find(x => x.status === 'authorized')
    if (!p) continue
    if (p.amount !== order.amount || p.currency !== order.currency) throw new HttpError(409, 'Payment amount does not match the order. Contact the organisers.')
    if (p.status === 'authorized') {
      // Razorpay may auto-capture at the same moment; either way, re-read and require "captured"
      await razorpay(`/payments/${p.id}/capture`, { amount: p.amount, currency: p.currency }).catch(() => {})
      p = await razorpay(`/payments/${p.id}`)
      if (p.status !== 'captured') continue
    }
    await issue(uid, o.ref, order, p)
    return { status: 'paid' }
  }
  return { status: 'unpaid' }
})

/** Registration + ticket TK-01, TK-02, … assigned atomically. Transaction details are copied from Razorpay. */
function issue(uid, orderRef, order, p) {
  return db.runTransaction(async tx => {
    const regRef = db.doc(`registrations/${uid}`), statsRef = db.doc('config/stats'), cfgRef = db.doc('config/event')
    const [reg, stats, cfg] = await Promise.all([tx.get(regRef), tx.get(statsRef), tx.get(cfgRef)])
    if (reg.exists) return
    const paid = (stats.data()?.paid ?? 0) + 1, seq = (stats.data()?.seq ?? 0) + 1
    const s = order.student, yy = String(cfg.data()?.edition || new Date().getFullYear()).slice(-2)
    tx.set(statsRef, { paid, seq }, { merge: true })
    tx.update(orderRef, { status: 'paid', paymentId: p.id })
    tx.set(regRef, {
      roll: s.roll, name: s.name, course: s.course, dept: s.branch, year: s.year, email: s.email,
      college: cfg.data()?.college ?? '', phone: p.contact ? String(p.contact).replace(/^\+91/, '') : '',
      payment: 'paid', ticket: 'issued',
      // Exactly what Razorpay recorded
      txn: p.id, orderId: orderRef.id, amount: p.amount / 100, currency: p.currency,
      method: METHODS[p.method] ?? p.method, methodDetail: p.vpa || p.bank || p.wallet || (p.card_id ? 'Card' : ''),
      payerEmail: p.email ?? '', paidAt: new Date(p.created_at * 1000),
      seq, regId: `CA${yy}-${String(seq).padStart(4, '0')}`, ticketId: `TK-${String(seq).padStart(2, '0')}`,
      registeredAt: FieldValue.serverTimestamp()
    })
  })
}
