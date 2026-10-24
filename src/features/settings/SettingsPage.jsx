import { Check } from 'lucide-react'

export default function SettingsPage({ shop, onSubmit, saving, error }) {
  if (!shop) return <div className="loading">Loading business profile…</div>
  const fields = [['name', 'Business name'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'], ['gstin', 'GSTIN'], ['bank_name', 'Bank name'], ['bank_branch', 'Bank branch'], ['account_number', 'Account number'], ['ifsc', 'IFSC code']]
  return <section className="panel settings-panel"><div className="section-heading"><div><h2>Business &amp; invoice profile</h2><p>Details printed on customer invoices</p></div></div>
    <form className="form-grid settings-form" onSubmit={onSubmit}>{fields.map(([name, label]) => <label className={name === 'address' ? 'field-wide' : ''} key={name}>{label}<input name={name} defaultValue={shop[name] || ''} required={['name', 'address'].includes(name)} maxLength={name === 'gstin' ? 15 : 200} /></label>)}
      {error && <div className="alert error field-wide" role="alert">{error}</div>}<div className="foot field-wide"><button className="btn solid" disabled={saving}><Check size={16} />{saving ? 'Saving…' : 'Save business details'}</button></div></form>
  </section>
}
