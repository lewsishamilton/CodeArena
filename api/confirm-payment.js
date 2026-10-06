import { handler, student, db, FieldValue, HttpError, verifyPayUPayment } from './_lib.js'

const PAYU_MODES = {
  UPI: 'UPI',
  CC: 'Credit Card',
  DC: 'Debit Card',
  NB: 'Net banking',
  CASH: 'Wallet',
  EMI: 'EMI'
}

/** Asks PayU (not the browser) whether any of the student's orders has been paid. If so,
 *  issues the registration + next ticket number in one atomic transaction. Safe to call repeatedly:
 *  after checkout, and again on page load if the student closed the window mid-payment. */
export default handler(async req => {
  const { uid } = await student(req)
  if (db) {
    const regRef = db.doc(`registrations/${uid}`)
    if ((await regRef.get()).exists) return { status: 'paid' }
  }

  // Check specific txnid if provided in request, else query all user orders
  const specificTxnid = req.body?.txnid ? String(req.body.txnid).trim() : null
  const orders = db ? await db.collection('orders').where('uid', '==', uid).get() : { docs: [] }

  // Sort orders with the requested txnid first, or most recent first
  const sortedDocs = [...orders.docs].sort((a, b) => {
    if (specificTxnid) {
      if (a.id === specificTxnid || a.data().txnid === specificTxnid) return -1
      if (b.id === specificTxnid || b.data().txnid === specificTxnid) return 1
    }
    return 0
  })

  for (const o of sortedDocs) {
    const order = o.data()
    const txnid = order.txnid || o.id

    let details
    try {
      details = await verifyPayUPayment(txnid)
    } catch (err) {
      console.warn(`PayU verify_payment failed for txnid ${txnid}:`, err.message)
      continue
    }

    if (!details) continue
    const status = String(details.status || '').toLowerCase()
    if (status !== 'success' && status !== 'captured') continue

    // Validate payment amount matches order
    if (order.amount && Number(details.amount) !== Number(order.amount)) {
      throw new HttpError(409, 'Payment amount does not match the order. Contact the organisers.')
    }

    if (db) await issue(uid, o.ref, order, details)
    return {
      status: 'paid',
      paymentId: details.mihpayid || txnid,
      mode: details.mode,
      amount: details.amount,
      txnid
    }
  }

  // Fallback: directly verify specificTxnid with PayU if db had no orders
  if (specificTxnid) {
    let details
    try {
      details = await verifyPayUPayment(specificTxnid)
    } catch (err) {
      console.warn(`PayU verify_payment failed for txnid ${specificTxnid}:`, err.message)
    }
    if (details) {
      const status = String(details.status || '').toLowerCase()
      if (status === 'success' || status === 'captured') {
        return {
          status: 'paid',
          paymentId: details.mihpayid || specificTxnid,
          mode: details.mode,
          amount: details.amount,
          txnid: specificTxnid
        }
      }
    }
  }

  return { status: 'unpaid' }
})

/** Registration + ticket TK-01, TK-02, … assigned atomically. Transaction details are copied from PayU. */
export function issue(uid, orderRef, order, p) {
  return db.runTransaction(async tx => {
    const regRef = db.doc(`registrations/${uid}`), statsRef = db.doc('config/stats'), cfgRef = db.doc('config/event')
    const [reg, stats, cfg] = await Promise.all([tx.get(regRef), tx.get(statsRef), tx.get(cfgRef)])
    if (reg.exists) return
    const paid = (stats.data()?.paid ?? 0) + 1, seq = (stats.data()?.seq ?? 0) + 1
    const s = order.student, yy = String(cfg.data()?.edition || new Date().getFullYear()).slice(-2)
    const txnid = order.txnid || orderRef.id
    const payuId = p.mihpayid || txnid

    tx.set(statsRef, { paid, seq }, { merge: true })
    tx.update(orderRef, { status: 'paid', paymentId: payuId })
    tx.set(regRef, {
      roll: s.roll, name: s.name, course: s.course, dept: s.branch, year: s.year, email: s.email,
      college: cfg.data()?.college ?? '', phone: p.phone ? String(p.phone).replace(/^\+91/, '') : (s.phone || ''),
      payment: 'paid', ticket: 'issued',
      // Exactly what PayU recorded
      txn: payuId,
      orderId: orderRef.id,
      txnid: txnid,
      amount: Number(p.amount || order.amount),
      currency: 'INR',
      method: PAYU_MODES[p.mode] || p.mode || 'PayU',
      methodDetail: p.bank_ref_num || p.bankcode || p.mode || '',
      payerEmail: p.email || s.email || '',
      paidAt: p.addedon ? new Date(p.addedon) : new Date(),
      seq,
      regId: `CA${yy}-${String(seq).padStart(4, '0')}`,
      ticketId: `TK-${String(seq).padStart(2, '0')}`,
      registeredAt: FieldValue.serverTimestamp()
    })
  })
}
