import { useState } from 'react'
import { KeyRound, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { api } from '../../api/client'

export default function AuthScreen({ configured, onAuthenticated }) {
  const [mode, setMode] = useState(configured ? 'login' : 'setup')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'setup') {
        const password = String(form.get('password') || '')
        if (password !== String(form.get('confirm_password') || '')) throw new Error('The passwords do not match.')
        const owner = await api('/auth/setup', {
          method: 'POST',
          body: JSON.stringify({ owner_name: form.get('owner_name'), password }),
        })
        onAuthenticated(owner)
      } else if (mode === 'login') {
        const owner = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password: form.get('password') }),
        })
        onAuthenticated(owner)
      } else if (mode === 'forgot') {
        const result = await api('/auth/forgot-password', { method: 'POST', body: '{}' })
        setMessage(result.message)
        setMode('reset')
      } else {
        const result = await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ code: form.get('code'), password: form.get('password') }),
        })
        setMessage(result.message)
        setMode('login')
      }
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  const titles = {
    setup: ['Set up your owner account', 'Create the password you will use to access your business desk.'],
    login: ['Owner login', 'Sign in to your private business workspace.'],
    forgot: ['Recover your password', 'We will send a one-time recovery code to your registered business email.'],
    reset: ['Set a new password', 'Enter the one-time recovery code sent to your email.'],
  }
  const [title, subtitle] = titles[mode]

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <svg width="48" height="40" viewBox="0 0 48 40" aria-hidden="true">
            <path d="M5 20c2.8-8.5 9.2-13 19-13s16.2 4.5 19 13" fill="none" stroke="#ad2428" strokeWidth="3" strokeLinecap="round" />
            <path d="M8 21h32l4 7H4z" fill="#202327" />
            <circle cx="13" cy="29" r="3.2" fill="#fff" stroke="#202327" strokeWidth="1.5" />
            <circle cx="35" cy="29" r="3.2" fill="#fff" stroke="#202327" strokeWidth="1.5" />
          </svg>
          <div><b>Mahalaxmi Automobiles</b><span>Owner business desk</span></div>
        </div>
        <div className="auth-icon">{mode === 'login' ? <LockKeyhole /> : mode === 'forgot' || mode === 'reset' ? <KeyRound /> : <ShieldCheck />}</div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {message && <p className="auth-message" role="status">{message}</p>}
        <form className="form-grid auth-form" onSubmit={submit}>
          {mode === 'setup' && <label>Owner name<input name="owner_name" autoComplete="name" maxLength="100" required autoFocus /></label>}
          {mode === 'reset' && <label>One-time recovery code<input name="code" autoComplete="one-time-code" minLength="48" maxLength="48" required autoFocus /></label>}
          {(mode === 'setup' || mode === 'login' || mode === 'reset') && <>
            <label>{mode === 'login' ? 'Password' : 'New password'}<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="12" maxLength="256" required autoFocus={mode === 'login'} /></label>
            {mode !== 'login' && <p className="form-hint">Use at least 12 characters.</p>}
          </>}
          {mode === 'setup' && <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength="12" maxLength="256" required /></label>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="btn solid auth-submit" disabled={saving}>
            {mode === 'login' ? <LogIn size={16} /> : mode === 'forgot' || mode === 'reset' ? <KeyRound size={16} /> : <ShieldCheck size={16} />}
            {saving ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'setup' ? 'Create owner account' : mode === 'forgot' ? 'Get recovery code' : 'Reset password'}
          </button>
        </form>
        {configured && mode === 'login' && <button className="auth-link" type="button" onClick={() => { setError(''); setMessage(''); setMode('forgot') }}>Forgot password?</button>}
        {configured && (mode === 'forgot' || mode === 'reset') && <button className="auth-link" type="button" onClick={() => { setError(''); setMessage(''); setMode('login') }}>Back to login</button>}
        <div className="auth-security"><LockKeyhole size={14} />Owner-only access · Local business data stays on this computer</div>
      </section>
    </main>
  )
}
