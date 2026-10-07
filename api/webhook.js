import { db, verifyReverseHash } from './_lib.js'
import { issue } from './confirm-payment.js'

/** Secure PayU Server-to-Server Webhook handler */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = Object.fromEntries(new URLSearchParams(body))
    } catch (_) {
      body = {}
    }
  }

  const txnid = body?.txnid
  const status = String(body?.status || '').toLowerCase()

  if (!txnid || status !== 'success') {
    return res.status(200).send('OK') // Ignore failed webhooks or invalid formats without throwing 500
  }

  try {
    if (db) {
      const orderRef = db.doc(`orders/${txnid}`)
      const orderSnap = await orderRef.get()
      
      if (orderSnap.exists) {
        const order = orderSnap.data()
        
        // Idempotency check: Do not re-process if already paid
        if (order.status === 'paid') {
          return res.status(200).send('Already processed')
        }

        const hashValid = verifyReverseHash({
            status: body.status,
            txnid: body.txnid,
            amount: body.amount,
            productinfo: body.productinfo,
            firstname: body.firstname,
            email: body.email,
            udf1: body.udf1 || '',
            udf2: body.udf2 || '',
            udf3: body.udf3 || '',
            udf4: body.udf4 || '',
            udf5: body.udf5 || '',
            udf6: body.udf6 || '',
            udf7: body.udf7 || '',
            udf8: body.udf8 || '',
            udf9: body.udf9 || '',
            udf10: body.udf10 || '',
            additionalCharges: body.additionalCharges,
            hash: body.hash
          })
          
        if (!hashValid) {
          console.warn('Webhook hash validation failed for txnid:', txnid)
          return res.status(403).send('Invalid Hash')
        }
        if (order.amount && Number(body.amount) !== Number(order.amount)) {
          return res.status(409).send('Payment amount does not match the order')
        }
        await issue(order.uid, orderRef, order, body)
      }
    }
    
    return res.status(200).send('Webhook Processed successfully')
  } catch (e) {
    console.error('Webhook error:', e)
    return res.status(500).send('Internal Server Error')
  }
}
