import { handler, student, db, FieldValue, HttpError, verifyPayUPayment } from './_lib.js'

const PAYU_MODES = {
  UPI: 'UPI',
  CC: 'Credit Card',
  DC: 'Debit Card',
  NB: 'Net banking',
  CASH: 'Wallet',
  EMI: 'EMI'
}

/** Asks PayU (not the browser) whether any of this student's orders has been paid, and if so issues the
 *  registration + next ticket number in one transaction. Safe to call repeatedly: after checkout, and on every
 *  page load — so a student whose connection dropped after paying gets their ticket the next time they log in.
 *  All of the student's orders are checked in ONE PayU request: a paid order is never missed because a newer
 *  attempt exists, and PayU's verify_payment rate limit isn't hit. Only the student's own orders count. */
export default handler(async req => {
  const { uid } = await student(req)
  const regRef = db.doc(`registrations/${uid}`)
  const reg = (await regRef.get()).data()
  if (reg?.payment === 'paid') return { status: 'paid', ...reg }

  const orders = (await db.collection('orders').where('uid', '==', uid).get()).docs
    .sort((a, b) => (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0))
    .slice(0, 25)   // ponytail: a student with more than 25 checkout attempts would need an organiser check
  if (!orders.length) return { status: 'unpaid' }

  const details = await verifyPayUPayment(orders.map(o => o.id))
  for (const o of orders) {
    const p = details[o.id]
    if (!p || !['success', 'captured'].includes(String(p.status).toLowerCase())) continue
    const order = o.data()
    if (Number(p.amt ?? p.amount) !== Number(order.amount)) throw new HttpError(409, 'Payment amount does not match the order. Contact the organisers.')
    await issue(uid, o.ref, order, { ...p, amount: p.amt ?? p.amount })
    return { status: 'paid', ...(await regRef.get()).data() }
  }
  return { status: 'unpaid' }
})

/** Registration + ticket TK-01, TK-02, … assigned atomically. Transaction details are copied from PayU. */
export function issue(uid, orderRef, order, p) {
  return db.runTransaction(async tx => {
    const regRef = db.doc(`registrations/${uid}`), statsRef = db.doc('config/stats'), cfgRef = db.doc('config/event')
    const [reg, stats, cfg] = await Promise.all([tx.get(regRef), tx.get(statsRef), tx.get(cfgRef)])
    if (reg.exists && reg.data()?.payment === 'paid') return
    const paid = (stats.data()?.paid ?? 0) + 1
    let seq = (stats.data()?.seq ?? 0) + 1
    const s = order.student || (reg.exists ? reg.data() : {})
    const yy = String(cfg.data()?.edition || new Date().getFullYear()).slice(-2)
    const txnid = order.txnid || (orderRef ? orderRef.id : p.txnid)
    const payuId = p.mihpayid || txnid
    let ticketId
    for (let offset = 0; offset < 1000; offset++) {
      const candidateSeq = seq + offset
      const candidate = `TK-${String(candidateSeq).padStart(2, '0')}`
      const reservation = await tx.get(db.doc(`ticketReservations/${candidate}`))
      const activeTicket = await tx.get(db.collection('registrations').where('ticketId', '==', candidate).limit(1))
      if (!reservation.exists && activeTicket.empty) {
        seq = candidateSeq
        ticketId = candidate
        break
      }
    }
    if (!ticketId) throw new HttpError(409, 'No unique ticket number is available. Contact the organiser.')

    tx.set(statsRef, { paid, seq }, { merge: true })
    if (orderRef) tx.update(orderRef, { status: 'paid', paymentId: payuId })
    tx.create(db.doc(`ticketReservations/${ticketId}`), {
      ticketId, uid, status: 'active', issuedAt: FieldValue.serverTimestamp()
    })
    const regData = {
      uid,
      roll: s.roll || order.roll || '',
      name: s.name || '',
      course: s.course || '',
      dept: s.branch || s.dept || '',
      year: s.year || '',
      email: s.email || '',
      college: s.college || cfg.data()?.college || '',
      phone: p.phone ? String(p.phone).replace(/^\+91/, '') : (s.phone || ''),
      payment: 'paid',
      ticket: 'issued',
      // Exactly what PayU recorded
      txn: payuId,
      orderId: orderRef ? orderRef.id : txnid,
      txnid: txnid,
      amount: Number(p.amount || p.amt || order.amount || 1),
      currency: 'INR',
      method: PAYU_MODES[p.mode] || p.mode || 'UPI',
      methodDetail: p.bank_ref_num || p.bankcode || p.mode || '',
      payerEmail: p.email || s.email || '',
      // PayU's addedon is Indian time with no zone ("2026-10-08 06:59:03"); servers run in UTC
      paidAt: p.addedon ? new Date(String(p.addedon).replace(' ', 'T') + '+05:30') : FieldValue.serverTimestamp(),
      seq,
      regId: `CA${yy}-${String(seq).padStart(4, '0')}`,
      ticketId,
      registeredAt: reg.exists && reg.data()?.createdAt ? reg.data().createdAt : FieldValue.serverTimestamp()
    }
    tx.set(regRef, regData, { merge: true })
  })
}
