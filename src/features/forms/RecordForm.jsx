import { Check } from 'lucide-react'
import Modal from '../../components/Modal'

export default function RecordForm({ type, record, suppliers, onClose, onSubmit, saving, error }) {
  const label = type === 'part' ? 'Part' : type === 'customer' ? 'Customer' : 'Supplier'
  const postPath = type === 'part' ? '/products' : `/${type}s`
  const method = record ? 'PUT' : 'POST'
  function submit(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    onSubmit(record ? `${postPath}/${record.id}` : postPath, values, `${label} ${record ? 'updated' : 'saved'}`, method)
  }
  return <Modal title={`${record ? 'Edit' : 'Add'} ${label.toLowerCase()}`} onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
      {type === 'part' ? <>
        <div className="two"><label>Part name<input name="name" defaultValue={record?.name || ''} required maxLength="200" autoFocus /></label><label>SKU / part number<input name="sku" defaultValue={record?.sku || ''} required maxLength="60" /></label></div>
        <div className="two"><label>HSN / SAC<input name="hsn" defaultValue={record?.hsn || ''} maxLength="20" placeholder="e.g. 87089900" /></label><label>Category<input name="category" defaultValue={record?.category || ''} maxLength="80" placeholder="Brakes, engine..." /></label></div>
        <div className="two"><label>Vehicle make<input name="vehicle_make" defaultValue={record?.vehicle_make || 'Universal'} maxLength="80" required placeholder="e.g. Tata, Honda, Universal" /></label><label>Vehicle model / year<input name="vehicle_model" defaultValue={record?.vehicle_model || 'All models'} maxLength="120" required placeholder="e.g. Activa 6G, 2020–2024" /></label></div>
        <label>Supplier<select name="supplier_id" defaultValue={record?.supplier_id || ''}><option value="">Not specified</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
        <div className="three"><label>Cost price (₹)<input name="purchase_price" type="number" min="0" step="0.01" defaultValue={record?.purchase_price ?? ''} required /></label><label>Sale price (₹)<input name="selling_price" type="number" min="0" step="0.01" defaultValue={record?.selling_price ?? ''} required /></label><label>GST %<input name="gst_rate" type="number" min="0" max="100" step="0.01" defaultValue={record?.gst_rate ?? 18} required /></label></div>
        {record ? <><div className="two"><label>Reorder at<input name="reorder_level" type="number" min="0" step="0.01" defaultValue={record.reorder_level} required /></label><label>Unit<input name="unit" defaultValue={record.unit || 'pcs'} maxLength="20" required /></label></div><p className="form-hint">Current stock: <b>{record.stock} {record.unit}</b>. Use “Receive stock” to update quantity.</p></>
          : <div className="three"><label>Opening stock<input name="stock" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>Reorder at<input name="reorder_level" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>Unit<input name="unit" defaultValue="pcs" maxLength="20" required /></label></div>}
      </> : <>
        <label>{label} name<input name="name" defaultValue={record?.name || ''} required maxLength="200" autoFocus /></label>
        <div className="two"><label>Phone<input name="phone" type="tel" defaultValue={record?.phone || ''} maxLength="40" /></label><label>Email<input name="email" type="email" defaultValue={record?.email || ''} maxLength="120" /></label></div>
        <label>Billing address<textarea name="address" rows="2" defaultValue={record?.address || ''} maxLength="500" /></label>
        <div className="two"><label>GSTIN<input name="gstin" defaultValue={record?.gstin || ''} maxLength="15" pattern="[0-9A-Za-z]{15}" title="GSTIN must contain 15 letters or numbers" /></label>
          {type === 'customer' && <label>Place of supply<input name="place_of_supply" defaultValue={record?.place_of_supply || 'Maharashtra'} maxLength="80" required /> </label>}</div>
      </>}
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn solid" disabled={saving}><Check size={16} />{saving ? 'Saving…' : `${record ? 'Update' : 'Save'} ${label.toLowerCase()}`}</button></div>
    </form>
  </Modal>
}
