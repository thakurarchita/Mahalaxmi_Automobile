import { useState } from 'react'
import { Plus, Receipt, X } from 'lucide-react'
import Modal from '../../components/Modal'
import { money, roundMoney } from '../../utils/format'

const isoToday = () => {
  const localDate = new Date()
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 10)
}

export default function InvoiceForm({ customers, products, onClose, onSubmit, saving, error }) {
  const [lines, setLines] = useState([{ product_id: '', quantity: '1', unit_price: '' }])
  const [customerId, setCustomerId] = useState('')
  const customer = customers.find((item) => String(item.id) === customerId)
  const placeOfSupply = customer?.place_of_supply || 'Maharashtra'
  const intraState = placeOfSupply.trim() === '27' || placeOfSupply.toLowerCase().includes('maharashtra')
  const totals = lines.reduce((sum, line) => {
    const product = products.find((item) => String(item.id) === line.product_id)
    const taxable = roundMoney(Number(line.quantity || 0) * Number(line.unit_price || 0))
    const tax = roundMoney(taxable * Number(product?.gst_rate || 0) / 100)
    return { taxable: sum.taxable + taxable, tax: sum.tax + tax }
  }, { taxable: 0, tax: 0 })
  totals.taxable = roundMoney(totals.taxable)
  totals.tax = roundMoney(totals.tax)
  const fullTotal = roundMoney(totals.taxable + totals.tax)

  function updateLine(index, key, value) {
    setLines((current) => current.map((line, at) => at === index ? { ...line, [key]: value } : line))
  }

  function selectProduct(index, value) {
    const product = products.find((item) => String(item.id) === value)
    setLines((current) => current.map((line, at) => at === index
      ? { ...line, product_id: value, unit_price: product ? String(product.selling_price) : '' }
      : line))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      customer_id: customerId,
      invoice_date: event.currentTarget.elements.invoice_date.value,
      due_date: event.currentTarget.elements.due_date.value,
      dispatched_through: event.currentTarget.elements.dispatched_through.value,
      vehicle_number: event.currentTarget.elements.vehicle_number.value,
      vehicle_model: event.currentTarget.elements.vehicle_model.value,
      engine_number: event.currentTarget.elements.engine_number.value,
      place_of_supply: placeOfSupply,
      notes: event.currentTarget.elements.notes.value,
      items: lines.map(({ product_id, quantity, unit_price }) => ({ product_id, quantity, unit_price })),
    })
  }

  return <Modal title="Create GST invoice" onClose={onClose} className="invoice-form-modal">
    {(!customers.length || !products.some((product) => Number(product.stock) > 0)) ? <div className="setup-notice">
      <p>Before invoicing, add a customer and at least one part with stock available. The part's HSN, GST rate, cost and sale price will then fill in automatically.</p>
      <div className="setup-buttons">{!customers.length && <button className="btn" onClick={() => { onClose(); document.dispatchEvent(new CustomEvent('open-record-modal', { detail: 'customer' })) }}>Add a customer</button>}
        {!products.some((product) => Number(product.stock) > 0) && <button className="btn" onClick={() => { onClose(); document.dispatchEvent(new CustomEvent('open-record-modal', { detail: 'part' })) }}>Add a stocked part</button>}</div>
    </div> : <form className="form-grid" onSubmit={submit}>
      <div className="two">
        <label>Buyer / customer<select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}{item.gstin ? ` · ${item.gstin}` : ''}</option>)}</select></label>
        <label>Invoice date<input name="invoice_date" type="date" defaultValue={isoToday()} required /></label>
      </div>
      <div className="form-hint">{customer ? <>GSTIN: {customer.gstin || 'Unregistered'} · Place of supply: {customer.place_of_supply || 'Maharashtra'} · {intraState ? 'CGST + SGST' : 'IGST'}</> : 'Choose a customer to use their billing and GST details.'}</div>
      <div className="line-entry">
        <div className="section-heading line-heading"><div><h3>Parts / services</h3><p>HSN, GST and sale price fill from the selected part</p></div><button type="button" className="btn btn-small" onClick={() => setLines((current) => [...current, { product_id: '', quantity: '1', unit_price: '' }])}><Plus size={14} />Add line</button></div>
        {lines.map((line, index) => {
          const product = products.find((item) => String(item.id) === line.product_id)
          return <div className="invoice-line" key={index}>
            <label className="line-product">Part<select required value={line.product_id} onChange={(event) => selectProduct(index, event.target.value)}><option value="">Select part</option>{products.filter((item) => Number(item.stock) > 0).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.vehicle_make} {item.vehicle_model} · {item.sku} ({item.stock} {item.unit})</option>)}</select>
              {product && <small>{product.vehicle_make} · {product.vehicle_model} · HSN {product.hsn || '—'} · GST {product.gst_rate}% · {product.stock} available</small>}</label>
            <label>Qty<input type="number" min="0.01" step="0.01" max={product?.stock || undefined} required value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /></label>
            <label>Cost ₹<input type="number" value={product ? Number(product.purchase_price).toFixed(2) : ''} placeholder="—" readOnly /></label>
            <label>Price ₹<input type="number" min="0" step="0.01" required value={line.unit_price} onChange={(event) => updateLine(index, 'unit_price', event.target.value)} /></label>
            <div className="line-amount"><small>Amount before GST</small><b>{money(roundMoney(Number(line.quantity || 0) * Number(line.unit_price || 0)))}</b></div>
            {lines.length > 1 && <button className="icon-button remove-line" type="button" onClick={() => setLines((current) => current.filter((_, at) => at !== index))} aria-label="Remove line"><X size={17} /></button>}
          </div>
        })}
      </div>
      <div className="two invoice-vehicle">
        <label>Vehicle number<input name="vehicle_number" placeholder="MH-51-C-2197" maxLength="40" /></label>
        <label>Vehicle model<input name="vehicle_model" maxLength="100" /></label>
        <label>Engine number<input name="engine_number" maxLength="100" /></label>
        <label>Dispatched through<input name="dispatched_through" maxLength="100" /></label>
        <label>Due date<input name="due_date" type="date" /></label>
        <label>Notes<input name="notes" maxLength="500" /></label>
      </div>
      <div className="invoice-calc"><span>Taxable amount <b>{money(totals.taxable)}</b></span><span>{intraState ? 'CGST + SGST' : 'IGST'} <b>{money(totals.tax)}</b></span><strong>Invoice total <b>{money(fullTotal)}</b></strong></div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn solid" disabled={saving}><Receipt size={16} />{saving ? 'Creating…' : 'Create invoice'}</button></div>
    </form>}
  </Modal>
}
