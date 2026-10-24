import { useEffect, useState } from 'react'
import { Bell, Check, Download, LogOut, Menu, Plus, Printer, Search, X } from 'lucide-react'
import { api } from './api/client'
import LogoMark from './components/LogoMark'
import Modal from './components/Modal'
import { nav } from './data'
import AuthScreen from './features/auth/AuthScreen'
import Parts from './features/catalog/Parts'
import Parties from './features/contacts/Parties'
import Dashboard from './features/dashboard/Dashboard'
import InvoiceForm from './features/forms/InvoiceForm'
import BusinessDocumentForm from './features/forms/BusinessDocumentForm'
import RecordForm from './features/forms/RecordForm'
import InvoiceDocument from './features/invoices/InvoiceDocument'
import Invoices from './features/invoices/Invoices'
import PurchaseDocument from './features/documents/PurchaseDocument'
import PurchaseOrders from './features/purchases/PurchaseOrders'
import Purchases from './features/purchases/Purchases'
import Quotations from './features/quotations/Quotations'
import PaymentsDues from './features/payments/PaymentsDues'
import Reports from './features/reports/Reports'
import SettingsPage from './features/settings/SettingsPage'
import { money } from './utils/format'

const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const blankData = { overview: {}, products: [], customers: [], suppliers: [], invoices: [], purchaseOrders: [], purchases: [], quotations: [], dues: { customer_total: 0, supplier_total: 0, customer_outstanding: [], supplier_outstanding: [] }, shop: null }

export default function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [active, setActive] = useState('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [data, setData] = useState(blankData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState('')
  const [recordTarget, setRecordTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [invoiceView, setInvoiceView] = useState(null)
  const [businessDocumentView, setBusinessDocumentView] = useState(null)
  const [paymentTarget, setPaymentTarget] = useState(null)
  const [stockTarget, setStockTarget] = useState(null)

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true)
    try {
      const [overview, products, customers, suppliers, invoices, purchaseOrders, purchases, quotations, dues, shop] = await Promise.all([
        api('/overview'), api('/products'), api('/customers'), api('/suppliers'), api('/invoices'), api('/purchase-orders'), api('/purchases'), api('/quotations'), api('/dues'), api('/shop'),
      ])
      setData({ overview, products, customers, suppliers, invoices, purchaseOrders, purchases, quotations, dues, shop })
      setError('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api('/auth/status')
      .then(setAuthStatus)
      .catch((cause) => setAuthError(cause.message))
      .finally(() => setAuthLoading(false))
  }, [])
  useEffect(() => {
    const handleExpired = () => setAuthStatus((current) => current ? { ...current, authenticated: false } : current)
    window.addEventListener('owner-session-expired', handleExpired)
    return () => window.removeEventListener('owner-session-expired', handleExpired)
  }, [])
  useEffect(() => {
    if (authStatus?.authenticated) refresh(true)
  }, [authStatus?.authenticated])
  useEffect(() => {
    const handleOpenRecord = (event) => { setFormError(''); setModal(event.detail) }
    document.addEventListener('open-record-modal', handleOpenRecord)
    return () => document.removeEventListener('open-record-modal', handleOpenRecord)
  }, [])
  const say = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const go = (label) => { setActive(label); setMenuOpen(false); setQuery('') }
  const filtered = (items, fields) => items.filter((item) => fields.map((field) => item[field] || '').join(' ').toLowerCase().includes(query.toLowerCase()))
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' })
      setAuthStatus((current) => current ? { ...current, authenticated: false } : current)
      setData(blankData)
    } catch (cause) {
      setError(cause.message)
    }
  }

  if (authLoading) return <div className="loading auth-loading">Checking owner access…</div>
  if (authError && !authStatus) return <main className="auth-page"><section className="auth-card">
    <h1>Business API unavailable</h1><p className="auth-subtitle">{authError}</p>
    <button className="btn solid auth-submit" onClick={() => window.location.reload()}>Retry connection</button>
  </section></main>
  if (!authStatus?.authenticated) return <AuthScreen
    configured={Boolean(authStatus?.configured)}
    onAuthenticated={(status) => { setAuthError(''); setAuthStatus(status) }}
  />

  async function saveRecord(path, payload, success, method = 'POST') {
    setSaving(true)
    setFormError('')
    try {
      await api(path, { method, body: JSON.stringify(payload) })
      await refresh()
      setModal('')
      say(success)
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function createInvoice(payload) {
    setSaving(true)
    setFormError('')
    try {
      const invoice = await api('/invoices', { method: 'POST', body: JSON.stringify(payload) })
      await refresh()
      setModal('')
      setInvoiceView(invoice)
      say('Invoice created and inventory updated')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function recordPayment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setFormError('')
    try {
      const updated = await api(`/invoices/${paymentTarget.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: form.get('amount'), method: form.get('method') }),
      })
      await refresh()
      setPaymentTarget(null)
      setInvoiceView(updated)
      say('Payment recorded')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function receiveStock(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setFormError('')
    try {
      await api(`/products/${stockTarget.id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ quantity: form.get('quantity'), unit_cost: form.get('unit_cost') }),
      })
      await refresh()
      setStockTarget(null)
      say('Stock updated')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveShop(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    setSaving(true)
    setFormError('')
    try {
      const shop = await api('/shop', { method: 'PUT', body: JSON.stringify(payload) })
      setData((current) => ({ ...current, shop }))
      setFormError('')
      say('Business details updated')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function createPurchaseOrder(payload) {
    setSaving(true)
    setFormError('')
    try {
      await api('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) })
      await refresh()
      setModal('')
      say('Purchase order created')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function receivePurchaseOrder(order) {
    const supplierInvoice = window.prompt('Supplier invoice number (optional):', '')
    if (supplierInvoice === null) return
    try {
      await api(`/purchase-orders/${order.id}/receive`, { method: 'POST', body: JSON.stringify({ supplier_invoice_number: supplierInvoice }) })
      await refresh()
      say('Purchase received and stock updated')
    } catch (cause) {
      setFormError(cause.message)
    }
  }

  async function recordSupplierPayment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setFormError('')
    try {
      await api(`/purchases/${paymentTarget.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: form.get('amount'), method: form.get('method') }),
      })
      await refresh()
      setPaymentTarget(null)
      say('Supplier payment recorded')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function createQuotation(payload) {
    setSaving(true)
    setFormError('')
    try {
      await api('/quotations', { method: 'POST', body: JSON.stringify(payload) })
      await refresh()
      setModal('')
      say('Quotation saved')
    } catch (cause) {
      setFormError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function convertQuotation(quotation) {
    try {
      const invoice = await api(`/quotations/${quotation.id}/convert`, { method: 'POST', body: JSON.stringify({}) })
      await refresh()
      setInvoiceView(invoice)
      say('Quotation converted to invoice')
    } catch (cause) {
      setFormError(cause.message)
    }
  }

  const openModal = (type) => { setFormError(''); setRecordTarget(null); setModal(type) }
  const editRecord = (type, record) => { setFormError(''); setRecordTarget(record); setModal(type) }
  const openInvoice = async (id) => {
    setFormError('')
    try { setInvoiceView(await api(`/invoices/${id}`)) } catch (cause) { setError(cause.message) }
  }
  const openBusinessDocument = async (kind, id) => {
    setError('')
    try {
      const document = await api(`/${kind === 'purchase-order' ? 'purchase-orders' : 'quotations'}/${id}`)
      setBusinessDocumentView({ kind, document })
    } catch (cause) {
      setError(cause.message)
    }
  }
  const printBusinessDocument = () => {
    const { kind, document: record } = businessDocumentView
    const reference = kind === 'purchase-order' ? record.order_number : record.quotation_number
    const previousTitle = window.document.title
    window.document.title = `${kind === 'purchase-order' ? 'Purchase-Order' : 'Quotation'}-${reference.replace(/[^a-z0-9_-]+/gi, '-')}`
    window.print()
    window.setTimeout(() => { window.document.title = previousTitle }, 1000)
  }

  return (
    <div className="shell">
      <aside className={`side ${menuOpen ? 'open' : ''}`}>
        <div className="logo"><LogoMark /><div><b>Mahalaxmi</b><small>Automobiles</small></div>
          <button className="only-mobile icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <nav>{nav.map((item, index) => item.group
          ? <p className="group-name" key={index}>{item.group}</p>
          : <button key={item.label} className={active === item.label ? 'on' : ''} onClick={() => go(item.label)}><item.icon size={17} />{item.label}</button>)}</nav>
        <div className="side-footer"><span className="side-dot" />Local business workspace</div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="top">
          <button className="only-mobile icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoices, parts, people..." /></label>
          <span className="top-business">MAHALAXMI AUTOMOBILES</span>
          <button className="icon-button bell" aria-label="Notifications"><Bell size={18} /></button>
          <button className="me" type="button" onClick={logout} title="Log out"><span>{(authStatus.owner?.name || 'Owner').slice(0, 2).toUpperCase()}</span>{authStatus.owner?.name || 'Owner'}<LogOut size={15} /></button>
        </header>

        <main className="page">
          <div className="title-row">
            <div><h1>{active}</h1><p>{today}</p></div>
            <div className="actions">
              {active === 'Invoices' && <button data-create-invoice className="btn solid" onClick={() => openModal('invoice')}><Plus size={16} />New invoice</button>}
              {active === 'Parts' && <button className="btn solid" onClick={() => openModal('part')}><Plus size={16} />Add part</button>}
              {active === 'Inventory' && <button className="btn solid" onClick={() => openModal('part')}><Plus size={16} />Add part</button>}
              {active === 'Customers' && <button className="btn solid" onClick={() => openModal('customer')}><Plus size={16} />Add customer</button>}
              {active === 'Suppliers' && <button className="btn solid" onClick={() => openModal('supplier')}><Plus size={16} />Add supplier</button>}
              {active === 'Purchase Orders' && <button className="btn solid" onClick={() => openModal('purchase-order')}><Plus size={16} />New order</button>}
              {active === 'Quotations' && <button className="btn solid" onClick={() => openModal('quotation')}><Plus size={16} />New quote</button>}
              {active === 'Dashboard' && <button className="btn solid" onClick={() => openModal('invoice')}><Plus size={16} />Create invoice</button>}
            </div>
          </div>
          {error && <div className="alert error" role="alert">{error}<button type="button" onClick={() => refresh(true)}>Retry</button></div>}
          {loading ? <div className="loading">Loading your business records…</div> : (
            <>
              {active === 'Dashboard' && <Dashboard overview={data.overview} onOpenInvoice={openInvoice} onGo={go} />}
              {(active === 'Sales' || active === 'Invoices') && <Invoices invoices={filtered(data.invoices, ['invoice_number', 'customer_name', 'status'])} onOpen={openInvoice} onPay={setPaymentTarget} />}
              {(active === 'Parts' || active === 'Inventory') && <Parts products={filtered(data.products, ['name', 'sku', 'hsn', 'category'])} onAdd={() => openModal('part')} onEdit={(item) => editRecord('part', item)} onRestock={setStockTarget} />}
              {active === 'Customers' && <Parties title="Customers" items={filtered(data.customers, ['name', 'phone', 'gstin', 'address'])} onAdd={() => openModal('customer')} onEdit={(item) => editRecord('customer', item)} />}
              {active === 'Suppliers' && <Parties title="Suppliers" items={filtered(data.suppliers, ['name', 'phone', 'gstin', 'address'])} onAdd={() => openModal('supplier')} onEdit={(item) => editRecord('supplier', item)} />}
              {active === 'Purchase Orders' && <PurchaseOrders items={filtered(data.purchaseOrders, ['order_number', 'supplier_name', 'status'])} onCreate={() => openModal('purchase-order')} onView={(item) => openBusinessDocument('purchase-order', item.id)} onReceive={receivePurchaseOrder} />}
              {active === 'Purchases' && <Purchases items={filtered(data.purchases, ['purchase_number', 'supplier_name', 'status'])} onPay={setPaymentTarget} />}
              {active === 'Quotations' && <Quotations items={filtered(data.quotations, ['quotation_number', 'customer_name', 'status'])} onCreate={() => openModal('quotation')} onView={(item) => openBusinessDocument('quotation', item.id)} onConvert={convertQuotation} />}
              {active === 'Payments & Dues' && <PaymentsDues dues={data.dues} onGo={go} />}
              {active === 'Reports' && <Reports overview={data.overview} invoices={data.invoices} purchases={data.purchases} suppliers={data.suppliers} onGo={go} />}
              {active === 'Settings' && <SettingsPage shop={data.shop} onSubmit={saveShop} saving={saving} error={formError} />}
            </>
          )}
        </main>
      </div>

      {modal === 'invoice' && <InvoiceForm customers={data.customers} products={data.products} onClose={() => setModal('')} onSubmit={createInvoice} saving={saving} error={formError} />}
      {(modal === 'customer' || modal === 'supplier' || modal === 'part') && (
        <RecordForm type={modal} record={recordTarget} suppliers={data.suppliers} onClose={() => { setModal(''); setRecordTarget(null) }} onSubmit={saveRecord} saving={saving} error={formError} />
      )}
      {(modal === 'purchase-order' || modal === 'quotation') && <BusinessDocumentForm
        kind={modal}
        customers={data.customers}
        suppliers={data.suppliers}
        products={data.products}
        onClose={() => setModal('')}
        onSubmit={modal === 'purchase-order' ? createPurchaseOrder : createQuotation}
        saving={saving}
        error={formError}
      />}
      {paymentTarget && <Modal title={`Record payment · ${paymentTarget.invoice_number || paymentTarget.purchase_number}`} onClose={() => setPaymentTarget(null)}>
        <form className="form-grid" onSubmit={paymentTarget.purchase_number ? recordSupplierPayment : recordPayment}>
          <p className="form-hint">Balance due: <b>{money(paymentTarget.total - paymentTarget.paid_amount)}</b></p>
          <label>{paymentTarget.purchase_number ? 'Amount paid (₹)' : 'Amount received (₹)'}<input name="amount" type="number" min="0.01" max={(paymentTarget.total - paymentTarget.paid_amount).toFixed(2)} step="0.01" required autoFocus /></label>
          <label>Payment method<select name="method"><option>Cash</option><option>UPI</option><option>Bank transfer</option><option>Card</option><option>Cheque</option></select></label>
          {formError && <div className="alert error">{formError}</div>}
          <div className="foot"><button type="button" className="btn" onClick={() => setPaymentTarget(null)}>Cancel</button><button className="btn solid" disabled={saving}><Check size={16} />{saving ? 'Saving…' : 'Save payment'}</button></div>
        </form>
      </Modal>}
      {stockTarget && <Modal title={`Receive stock · ${stockTarget.name}`} onClose={() => setStockTarget(null)}>
        <form className="form-grid" onSubmit={receiveStock}>
          <p className="form-hint">Current stock: <b>{stockTarget.stock} {stockTarget.unit}</b></p>
          <label>Quantity received<input name="quantity" type="number" min="0.01" step="0.01" required autoFocus /></label>
          <label>Updated cost price (₹)<input name="unit_cost" type="number" min="0" step="0.01" placeholder={Number(stockTarget.purchase_price).toFixed(2)} /></label>
          {formError && <div className="alert error" role="alert">{formError}</div>}
          <div className="foot"><button type="button" className="btn" onClick={() => setStockTarget(null)}>Cancel</button><button className="btn solid" disabled={saving}><Check size={16} />{saving ? 'Saving…' : 'Receive stock'}</button></div>
        </form>
      </Modal>}
      {invoiceView && <Modal title={`Invoice · ${invoiceView.invoice_number}`} onClose={() => setInvoiceView(null)} className="invoice-modal">
        <div className="invoice-actions"><button className="btn" onClick={() => {
          const previousTitle = document.title
          document.title = `Invoice-${invoiceView.invoice_number.replace(/[^a-z0-9_-]+/gi, '-')}`
          window.print()
          window.setTimeout(() => { document.title = previousTitle }, 1000)
        }}><Download size={16} />Download / save PDF</button>
          {invoiceView.total > invoiceView.paid_amount && <button className="btn solid" onClick={() => { setInvoiceView(null); setPaymentTarget(invoiceView) }}><Plus size={16} />Record payment</button>}</div>
        <p className="invoice-download-hint">In the print dialog, choose “Save as PDF” to download a PDF copy.</p>
        <InvoiceDocument invoice={invoiceView} />
      </Modal>}
      {businessDocumentView && <Modal
        title={`${businessDocumentView.kind === 'purchase-order' ? 'Purchase order' : 'Quotation'} · ${businessDocumentView.kind === 'purchase-order' ? businessDocumentView.document.order_number : businessDocumentView.document.quotation_number}`}
        onClose={() => setBusinessDocumentView(null)}
        className="invoice-modal"
      >
        <div className="invoice-actions">
          <button className="btn solid" onClick={printBusinessDocument}><Printer size={16} />Print / download PDF</button>
          {businessDocumentView.kind === 'quotation' && businessDocumentView.document.status === 'Open' && <button className="btn" onClick={() => {
            const quotation = data.quotations.find((item) => item.id === businessDocumentView.document.id)
            setBusinessDocumentView(null)
            if (quotation) convertQuotation(quotation)
          }}><Check size={16} />Convert to invoice</button>}
        </div>
        <p className="invoice-download-hint">Choose “Save as PDF” in the print dialog to download a copy.</p>
        <PurchaseDocument document={businessDocumentView.document} kind={businessDocumentView.kind} />
      </Modal>}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}
