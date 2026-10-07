import { db, verifyReverseHash } from './_lib.js'
import { issue } from './confirm-payment.js'

/** PayU Webhook / Callback handler for surl & furl POST requests. */
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
  const errorMsg = body?.error_Message || body?.field9 || 'Payment was not completed'

  if (!txnid) {
    res.writeHead(302, { Location: '/register?payment=failed' })
    return res.end()
  }

  if (status === 'success') {
    try {
      if (db) {
        const orderRef = db.doc(`orders/${txnid}`)
        const orderSnap = await orderRef.get()
        if (orderSnap.exists) {
          const order = orderSnap.data()
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
          if (!hashValid) throw new Error('Invalid PayU callback signature.')
          if (order.amount && Number(body.amount) !== Number(order.amount)) {
            throw new Error('PayU callback amount does not match the order.')
          }
          // The signed callback is sufficient here. A second verify_payment
          // request can hit PayU's rate limit during the browser redirect.
          await issue(order.uid, orderRef, order, body)
        }
      }
      res.writeHead(302, { Location: `/register?payment=success&txnid=${encodeURIComponent(txnid)}` })
      return res.end()
    } catch (e) {
      console.error('PayU callback processing error:', e)
      res.writeHead(302, { Location: `/register?payment=error&txnid=${encodeURIComponent(txnid)}` })
      return res.end()
    }
  }

  res.writeHead(302, { Location: `/register?payment=failed&txnid=${encodeURIComponent(txnid)}&msg=${encodeURIComponent(errorMsg)}` })
  res.end()
}
