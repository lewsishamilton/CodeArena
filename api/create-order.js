import crypto from 'node:crypto'
import { handler, student, checkCanRegister, db, FieldValue, HttpError, PAYU_KEY, PAYU_SALT, PAYU_IS_PROD, PAYU_BOLT_URL, PAYU_PAYMENT_URL, createPaymentHash } from './_lib.js'

/** Creates a PayU order and secure SHA-512 hash for the signed-in student.
 *  The amount comes from the event settings and the student's details from college records. */
export default handler(async req => {
  const { uid, roll } = await student(req)
  if (db && (await db.doc(`registrations/${uid}`).get()).exists) {
    throw new HttpError(409, 'You are already registered. Open your ticket from the dashboard.')
  }
  const { student: s, cfg } = await checkCanRegister(roll)
  if (!(cfg.fee > 0)) {
    throw new HttpError(409, 'The registration fee has not been set by the organisers yet.')
  }
  if (!PAYU_KEY || !PAYU_SALT) {
    throw new HttpError(503, 'PayU credentials (PAYU_KEY / PAYU_SALT) are not configured on the server.')
  }

  // Generate unique PayU transaction ID (alphanumeric, e.g. CA1741234567AB)
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  const txnid = `CA${Date.now().toString().slice(-8)}${rand}`
  const amount = Number(cfg.fee).toFixed(2)
  const productinfo = `${cfg.name || 'CODE//ARENA'} Registration`
  const firstname = (s.name || 'Student').replace(/[^a-zA-Z0-9 ]/g, '').trim().split(' ')[0] || 'Student'
  const email = s.email || `${roll.toLowerCase()}@students.codearena.local`
  const phone = (req.body?.phone || s.phone || '9999999999').replace(/[^0-9]/g, '').slice(-10) || '9999999999'

  const hash = createPaymentHash({
    key: PAYU_KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1: uid,
    udf2: roll,
    salt: PAYU_SALT
  })

  if (db) {
    await db.doc(`registrations/${uid}`).set({
      uid,
      roll,
      name: s.name || 'Student',
      email: email,
      phone: phone,
      payment: 'pending',
      txnid,
      amount,
      currency: 'INR',
      method: 'PayU',
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true })

    await db.doc(`orders/${txnid}`).set({
      uid,
      roll,
      txnid,
      amount,
      currency: 'INR',
      student: s,
      status: 'created',
      createdAt: FieldValue.serverTimestamp()
    })
  }

  return {
    key: PAYU_KEY,
    txnid,
    orderId: txnid, // alias for backwards compatibility
    amount,
    currency: 'INR',
    productinfo,
    firstname,
    email,
    phone,
    udf1: uid,
    udf2: roll,
    hash,
    isProduction: PAYU_IS_PROD,
    boltUrl: PAYU_BOLT_URL,
    paymentUrl: PAYU_PAYMENT_URL
  }
})
