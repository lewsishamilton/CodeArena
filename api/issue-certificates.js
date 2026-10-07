import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getAuth } from 'firebase-admin/auth'
import { getApps } from 'firebase-admin/app'
import { FieldValue, db, handler, HttpError } from './_lib.js'

const ADMIN_EMAIL = 'admin@codearena.local'
const CERTIFICATE_FROM = process.env.CERTIFICATE_FROM_EMAIL || 'codearenamlrit@gmail.com'

async function admin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new HttpError(401, 'Please log in as an administrator.')
  if (!getApps().length) throw new HttpError(503, 'Authentication service is not configured.')
  let decoded
  try { decoded = await getAuth().verifyIdToken(token) } catch { throw new HttpError(401, 'Your login expired. Log in again.') }
  if (decoded.email !== ADMIN_EMAIL) throw new HttpError(403, 'Administrator access required.')
}

function cleanUrl(value) {
  const url = String(value || '').trim()
  if (!/^https:\/\//i.test(url)) throw new HttpError(400, 'Certificate templates must be uploaded images.')
  return url
}

async function makePdf(templateUrl, certificate) {
  const response = await fetch(templateUrl)
  if (!response.ok) throw new Error(`Could not download certificate template (${response.status}).`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const pdf = await PDFDocument.create()
  const image = templateUrl.toLowerCase().includes('.png')
    ? await pdf.embedPng(bytes)
    : await pdf.embedJpg(bytes)
  const page = pdf.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawText(certificate.name, {
    x: Math.max(24, image.width / 2 - font.widthOfTextAtSize(certificate.name, 30) / 2),
    y: image.height * 0.49,
    size: 30,
    font,
    color: rgb(0.08, 0.1, 0.1)
  })
  return pdf.save()
}

async function sendMail(certificate, pdfBytes) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: CERTIFICATE_FROM,
      to: [certificate.email],
      subject: `${certificate.type === 'achievement' ? 'Certificate of Excellence' : 'Certificate of Participation'} — ${certificate.eventName}`,
      html: `<p>Dear ${certificate.name},</p><p>Your ${certificate.type === 'achievement' ? 'Certificate of Excellence' : 'Certificate of Participation'} for <strong>${certificate.eventName}</strong> is attached as a PDF.</p><p>It is also available in your CodeArena dashboard.</p>`,
      attachments: [{ filename: `${certificate.certificateId}.pdf`, content: Buffer.from(pdfBytes).toString('base64') }]
    })
  })
  if (!response.ok) throw new Error(`Email provider rejected the certificate (${response.status}).`)
}

export default handler(async req => {
  await admin(req)
  if (!db) throw new HttpError(503, 'Firebase Admin is not configured on the server.')
  const body = req.body || {}
  const participationTemplateUrl = cleanUrl(body.participationTemplateUrl)
  const achievementTemplateUrl = cleanUrl(body.achievementTemplateUrl)
  const eventName = String(body.eventName || 'CODE ARENA').trim().slice(0, 120)

  const [boardSnap, submissionSnap, regsSnap, eventSnap] = await Promise.all([
    db.collection('leaderboard').get(),
    db.collection('submissions').get(),
    db.collection('registrations').where('payment', '==', 'paid').get(),
    db.doc('config/event').get()
  ])
  const registrations = new Map(regsSnap.docs.map(d => [d.id, { uid: d.id, ...d.data() }]))
  const rows = boardSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.name || registrations.has(r.id))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      || (Number(a.completion) || 999999) - (Number(b.completion) || 999999))
    .map((r, index) => ({ ...r, rank: index + 1 }))
  const submitted = new Set(submissionSnap.docs.map(d => d.data().uid).filter(Boolean))
  const participantIds = [...new Set([...submitted, ...rows.map(r => r.id)])]
  if (!participantIds.length) throw new HttpError(400, 'No competing participants are available for certificates.')
  const byId = new Map(rows.map(r => [r.id, r]))
  const issuedAt = FieldValue.serverTimestamp()
  const certificates = participantIds.map(uid => {
    const row = byId.get(uid) || {}
    const reg = registrations.get(uid) || {}
    const rank = Number(row.rank) || null
    const achievement = rank === 1 || rank === 2
    const type = achievement ? 'achievement' : 'participation'
    const certificateId = `${reg.regId || uid}-${achievement ? 'EXC' : 'PRT'}`
    return {
      uid, name: String(row.name || reg.name || 'Participant').trim(), email: String(reg.email || row.email || '').trim(),
      rank, type, title: achievement ? (rank === 1 ? 'Winner' : 'First Runner-up') : 'Participant',
      certificateId, templateUrl: achievement ? achievementTemplateUrl : participationTemplateUrl,
      eventName: String(eventSnap.data()?.name || eventName), issuedAt
    }
  })
  const invalid = certificates.find(c => !c.email)
  if (invalid) throw new HttpError(400, `No email address is recorded for ${invalid.name}.`)

  const results = []
  for (const certificate of certificates) {
    const ref = db.collection('certificates').doc(`${certificate.uid}_${certificate.type}`)
    const existing = await ref.get()
    const record = { ...certificate, issuedAt: existing.exists ? existing.data().issuedAt : issuedAt, emailedAt: null, emailError: null }
    await ref.set(record, { merge: true })
    let emailed = false
    try {
      const pdf = await makePdf(certificate.templateUrl, certificate)
      await sendMail(certificate, pdf)
      await ref.set({ emailedAt: FieldValue.serverTimestamp(), emailError: null }, { merge: true })
      emailed = true
    } catch (error) {
      await ref.set({ emailError: error.message }, { merge: true })
      results.push({ name: certificate.name, error: error.message })
      continue
    }
    results.push({ name: certificate.name, emailed })
  }
  await db.doc('config/competition').set({ certsIssued: true, certificatesIssuedAt: FieldValue.serverTimestamp() }, { merge: true })
  return { issued: certificates.length, emailed: results.filter(r => r.emailed).length, failures: results.filter(r => r.error) }
})
