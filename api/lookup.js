import { handler, checkCanRegister, normRoll } from './_lib.js'

/** Public: name, course, branch, roll no, year and email for a roll number, before registering. */
export default handler(async req => checkCanRegister(normRoll(req.body?.roll), { allowExisting: true }))
