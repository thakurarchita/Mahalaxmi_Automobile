import { useState } from 'react'
import { Plus, UserRoundPlus, X } from 'lucide-react'
import Modal from '../../components/Modal'
import { money, roundMoney } from '../../utils/format'

const isoToday = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export default function BusinessDocumentForm({ kind, customers, suppliers, products, onClose, onSubmit, saving, error }) {
  const isPurchaseOrder = kind === 'purchase-order'
  const parties = isPurchaseOrder ? suppliers : customers
  const [partyId, setPartyId] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(isPurchaseOrder && suppliers.length === 0)
  const [lines, setLines] = useState([{ product_id: '', quantity: '1', unit_value: '' }])
  const selectedParty = parties.find((party) => String(party.id) === partyId)
  const title = isPurchaseOrder ? 'Create purchase order' : 'Create quotation'
  const valueLabel = isPurchaseOrder ? 'Unit cost' : 'Unit price'
  const totals = lines.reduce((result, line) => {
    const product = products.find((part) => String(part.id) === line.product_id)
    const taxable = roundMoney(Number(line.quantity || 0) * Number(line.unit_value || 0))
    const tax = roundMoney(taxable * Number(product?.gst_rate || 0) / 100)
    return { taxable: result.taxable + taxable, tax: result.tax + tax }
  }, { taxable: 0, tax: 0 })
  totals.taxable = roundMoney(totals.taxable)
  totals.tax = roundMoney(totals.tax)

  function updateLine(index, key, value) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line))
  }

  function selectProduct(index, productId) {
    const product = products.find((part) => String(part.id) === productId)
    setLines((current) => current.map((line, lineIndex) => lineIndex === index
      ? { ...line, product_id: productId, unit_value: product ? String(isPurchaseOrder ? product.purchase_price : product.selling_price) : '' }
      : line))
  }

  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const items = lines.map((line) => ({
      product_id: line.product_id,
      quantity: line.quantity,
      [isPurchaseOrder ? 'unit_cost' : 'unit_price']: line.unit_value,
    }))
    if (isPurchaseOrder) {
      onSubmit({
        ...(addingSupplier ? {
          new_supplier: {
            name: form.get('supplier_name'),
            phone: form.get('supplier_phone'),
            email: form.get('supplier_email'),
            address: form.get('supplier_address'),
            gstin: form.get('supplier_gstin'),
            place_of_supply: form.get('supplier_place_of_supply'),
          },
        } : { supplier_id: partyId }),
        order_date: form.get('document_date'),
        expected_date: form.get('secondary_date'),
        notes: form.get('notes'),
        items,
      })
    } else {
      onSubmit({
        customer_id: partyId,
        quotation_date: form.get('document_date'),
        valid_until: form.get('secondary_date'),
        place_of_supply: selectedParty?.place_of_supply || 'Maharashtra',
        notes: form.get('notes'),
        items,
      })
    }
  }

  return <Modal title={title} onClose={onClose} className="invoice-form-modal">
    {!products.length || (!isPurchaseOrder && !parties.length) ? <div className="setup-notice">
      <p>Add at least one {isPurchaseOrder ? 'inventory part' : 'customer and inventory part'} before creating this document.</p>
    </div> : <form className="form-grid" onSubmit={submit}>
      <div className="document-parties">
        {isPurchaseOrder ? <section className="supplier-picker">
          <div className="section-heading line-heading">
            <div><h3>Supplier</h3><p>The supplier you are buying these parts from</p></div>
            {suppliers.length > 0 && <button type="button" className="btn btn-small" onClick={() => setAddingSupplier((current) => !current)}>
              <UserRoundPlus size={14} />{addingSupplier ? 'Choose saved supplier' : 'Add new supplier'}
            </button>}
          </div>
          {addingSupplier ? <div className="form-grid supplier-fields">
            <label>Supplier name<input name="supplier_name" required maxLength="200" autoFocus /></label>
            <div className="two">
              <label>Phone<input name="supplier_phone" type="tel" maxLength="40" /></label>
              <label>Email<input name="supplier_email" type="email" maxLength="120" /></label>
            </div>
            <label>Address<textarea name="supplier_address" rows="2" maxLength="500" /></label>
            <div className="two">
              <label>GSTIN<input name="supplier_gstin" maxLength="15" pattern="[0-9A-Za-z]{15}" title="GSTIN must contain 15 letters or numbers" /></label>
              <label>State / place of supply<input name="supplier_place_of_supply" defaultValue="Maharashtra" maxLength="80" required /></label>
            </div>
            <p className="form-hint">This supplier will be saved to your directory along with the purchase order.</p>
          </div> : <label>Choose a supplier
            <select required value={partyId} onChange={(event) => setPartyId(event.target.value)}>
              <option value="">Select supplier</option>
              {parties.map((party) => <option value={party.id} key={party.id}>{party.name}</option>)}
            </select>
          </label>}
        </section> : <label>Customer
          <select required value={partyId} onChange={(event) => setPartyId(event.target.value)}>
            <option value="">Select customer</option>
            {parties.map((party) => <option value={party.id} key={party.id}>{party.name}</option>)}
          </select>
        </label>}
        <div className="two">
        <label>{isPurchaseOrder ? 'Order date' : 'Quotation date'}
          <input name="document_date" type="date" defaultValue={isoToday()} required />
        </label>
        <label>{isPurchaseOrder ? 'Expected delivery' : 'Valid until'}
          <input name="secondary_date" type="date" />
        </label>
        </div>
      </div>
      <div className="line-entry">
        <div className="section-heading line-heading">
          <div><h3>Items</h3><p>Part details and {valueLabel.toLowerCase()} are filled from inventory</p></div>
          <button type="button" className="btn btn-small" onClick={() => setLines((current) => [...current, { product_id: '', quantity: '1', unit_value: '' }])}>
            <Plus size={14} />Add line
          </button>
        </div>
        {lines.map((line, index) => {
          const product = products.find((part) => String(part.id) === line.product_id)
          return <div className="invoice-line" key={index}>
            <label className="line-product">Part
              <select required value={line.product_id} onChange={(event) => selectProduct(index, event.target.value)}>
                <option value="">Select part</option>
                {products.map((part) => <option value={part.id} key={part.id}>{part.name} · {part.vehicle_make} {part.vehicle_model} · {part.sku}</option>)}
              </select>
              {product && <small>HSN {product.hsn || '—'} · GST {product.gst_rate}% · {product.stock} {product.unit} in stock · Usual supplier: {product.supplier_name || 'Not set'}</small>}
            </label>
            <label>Qty<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /></label>
            <label>{valueLabel} ₹<input type="number" min="0" step="0.01" required value={line.unit_value} onChange={(event) => updateLine(index, 'unit_value', event.target.value)} /></label>
            <div className="line-amount"><small>Before GST</small><b>{money(roundMoney(Number(line.quantity || 0) * Number(line.unit_value || 0)))}</b></div>
            {lines.length > 1 && <button className="icon-button remove-line" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remove line"><X size={17} /></button>}
          </div>
        })}
      </div>
      <label>Notes<input name="notes" maxLength="500" /></label>
      <div className="invoice-calc"><span>Taxable amount <b>{money(totals.taxable)}</b></span><span>Estimated GST <b>{money(totals.tax)}</b></span><strong>Estimated total <b>{money(roundMoney(totals.taxable + totals.tax))}</b></strong></div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn solid" disabled={saving}>{saving ? 'Saving…' : isPurchaseOrder ? 'Create order' : 'Save quotation'}</button>
      </div>
    </form>}
  </Modal>
}
