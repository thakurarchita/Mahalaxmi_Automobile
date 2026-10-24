import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import nodemailer from 'nodemailer'

const SESSION_COOKIE = 'ma_owner_session'
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8
const RESET_LIFETIME_MS = 10 * 60 * 1000
const PASSWORD_MIN_LENGTH = 12
const loginAttempts = new Map()
const recoveryRequests = new Map()
const resetAttempts = new Map()

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((cookie) => {
    const separator = cookie.indexOf('=')
    if (separator < 0) return ['', '']
    return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1).trim()]
  }).filter(([name]) => name))
}

function clientKey(req) {
  return req.socket.remoteAddress || 'local'
}

function tooManyRequests(bucket, req, limit, windowMs) {
  const key = clientKey(req)
  const now = Date.now()
  const previous = bucket.get(key) || []
  const recent = previous.filter((time) => now - time < windowMs)
  bucket.set(key, recent)
  if (recent.length >= limit) return true
  recent.push(now)
  return false
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString('hex'),
  }
}

function passwordMatches(password, salt, storedHash) {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashPassword(password, salt).hash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function issueSession(db, res, owner) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS
  db.prepare('INSERT INTO owner_sessions (token_hash, expires_at) VALUES (?, ?)')
    .run(tokenHash(token), expiresAt)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_SECONDS}${secure}`)
  res.json({ configured: true, authenticated: true, owner: { name: owner.owner_name } })
}

export function registerAuthRoutes(app, db) {
  const account = db.prepare('SELECT id, owner_name FROM owner_account WHERE id = 1')
  const sessionByHash = db.prepare(`
    SELECT expires_at FROM owner_sessions WHERE token_hash = ? AND expires_at > ?
  `)
  const sessionCookieOptions = 'HttpOnly; SameSite=Strict; Path=/; Max-Age=0'

  function ownerForRequest(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
    if (!sessionByHash.get(tokenHash(token), Math.floor(Date.now() / 1000))) return null
    return account.get() || null
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/auth/status', (req, res) => {
    const owner = ownerForRequest(req)
    res.json({ configured: Boolean(account.get()), authenticated: Boolean(owner), owner: owner ? { name: owner.owner_name } : null })
  })

  app.post('/api/auth/setup', (req, res) => {
    if (account.get()) return res.status(409).json({ error: 'The owner account is already configured. Please log in.' })
    const ownerName = String(req.body?.owner_name || '').trim()
    const password = req.body?.password
    if (!ownerName || ownerName.length > 100) return res.status(400).json({ error: 'Enter an owner name (maximum 100 characters).' })
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 256) {
      return res.status(400).json({ error: `Password must be between ${PASSWORD_MIN_LENGTH} and 256 characters.` })
    }
    const { salt, hash } = hashPassword(password)
    const createOwner = db.transaction(() => {
      if (account.get()) return false
      db.prepare('INSERT INTO owner_account (id, owner_name, password_salt, password_hash) VALUES (1, ?, ?, ?)')
        .run(ownerName, salt, hash)
      return true
    })
    if (!createOwner()) return res.status(409).json({ error: 'The owner account was just configured. Please log in.' })
    db.prepare('DELETE FROM owner_sessions').run()
    issueSession(db, res, { owner_name: ownerName })
  })

  app.post('/api/auth/login', (req, res) => {
    if (tooManyRequests(loginAttempts, req, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many login attempts. Wait 15 minutes and try again.' })
    }
    const owner = account.get()
    const password = req.body?.password
    if (!owner || typeof password !== 'string' || password.length > 256) {
      return res.status(401).json({ error: 'Incorrect password.' })
    }
    const credentials = db.prepare('SELECT * FROM owner_account WHERE id = 1').get()
    if (!passwordMatches(password, credentials.password_salt, credentials.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password.' })
    }
    loginAttempts.delete(clientKey(req))
    issueSession(db, res, owner)
  })

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').run(tokenHash(token))
    }
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${sessionCookieOptions}`)
    res.json({ authenticated: false })
  })

  app.post('/api/auth/forgot-password', async (req, res) => {
    if (tooManyRequests(recoveryRequests, req, 3, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many recovery requests. Try again later.' })
    }
    if (account.get()) {
      const smtpHost = process.env.SMTP_HOST
      const smtpPort = Number(process.env.SMTP_PORT || 587)
      const smtpUser = process.env.SMTP_USER
      const smtpPassword = process.env.SMTP_PASS
      const from = process.env.SMTP_FROM || smtpUser
      const recipient = db.prepare('SELECT email FROM shop WHERE id = 1').get()?.email?.trim()
      if (!smtpHost || !smtpUser || !smtpPassword || !from || !recipient || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        return res.status(503).json({ error: 'Password recovery email is not configured. Ask your administrator to set up email delivery.' })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        return res.status(503).json({ error: 'Add a valid owner recovery email in Settings before requesting a password reset.' })
      }

      const code = randomBytes(24).toString('hex')
      const expiresAt = Date.now() + RESET_LIFETIME_MS
      db.prepare('DELETE FROM password_resets').run()
      db.prepare('INSERT INTO password_resets (token_hash, expires_at) VALUES (?, ?)')
        .run(tokenHash(code), expiresAt)
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPassword },
      })
      try {
        await transporter.sendMail({
          from,
          to: recipient,
          subject: 'Your Mahalaxmi Automobiles password recovery code',
          text: `Your one-time password recovery code is:\n\n${code}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email.`,
        })
      } catch {
        db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(tokenHash(code))
        console.error('Unable to send the password recovery email. Check the SMTP configuration and recipient address.')
        return res.status(503).json({ error: 'The recovery email could not be sent. Check the business email address and email delivery settings, then try again.' })
      }
    }
    res.json({ message: 'If an owner account exists, a recovery code has been sent to the registered business email. It expires in 10 minutes.' })
  })

  app.post('/api/auth/reset-password', (req, res) => {
    if (tooManyRequests(resetAttempts, req, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many password reset attempts. Request a new code later.' })
    }
    const code = req.body?.code
    const password = req.body?.password
    if (typeof code !== 'string' || !/^[a-f0-9]{48}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the 48-character recovery code from your email.' })
    }
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 256) {
      return res.status(400).json({ error: `Password must be between ${PASSWORD_MIN_LENGTH} and 256 characters.` })
    }
    const reset = db.prepare('SELECT expires_at FROM password_resets WHERE token_hash = ?').get(tokenHash(code))
    if (!reset || reset.expires_at <= Date.now()) {
      return res.status(400).json({ error: 'This recovery code is invalid or expired. Request a new code.' })
    }
    const { salt, hash } = hashPassword(password)
    const updatePassword = db.transaction(() => {
      db.prepare('UPDATE owner_account SET password_salt = ?, password_hash = ? WHERE id = 1').run(salt, hash)
      db.prepare('DELETE FROM password_resets').run()
      db.prepare('DELETE FROM owner_sessions').run()
    })
    updatePassword()
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${sessionCookieOptions}`)
    res.json({ configured: true, authenticated: false, message: 'Password updated. Log in with your new password.' })
  })

  return function requireOwner(req, res, next) {
    const owner = ownerForRequest(req)
    if (!owner) return res.status(401).json({ error: 'Your owner session has expired. Please log in again.' })
    req.owner = owner
    next()
  }
}
