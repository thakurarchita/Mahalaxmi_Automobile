import LogoMark from '../../components/LogoMark'
import { dateLabel, money } from '../../utils/format'

export default function PurchaseDocument({ document, kind }) {
  const isOrder = kind === 'purchase-order'
  const number = isOrder ? document.order_number : document.quotation_number
  const date = isOrder ? document.order_date : document.quotation_date
  const validLabel = isOrder ? 'Expected delivery' : 'Valid until'
  const validDate = isOrder ? document.expected_date : document.valid_until
  const rows = document.items || []

  return <article className="invoice-paper business-document-paper">
    <header className="invoice-brand">
      <LogoMark />
      <div><h2>{document.shop?.name || 'Business'}</h2><p>{document.shop?.address || ''}</p>
        <p>{document.shop?.phone ? `Contact no: ${document.shop.phone}` : ''}{document.shop?.email ? ` · Email: ${document.shop.email}` : ''}</p>
        <p>GSTIN: {document.shop?.gstin || '—'}</p>
      </div>
      <div className="invoice-title">{isOrder ? 'PURCHASE ORDER' : 'QUOTATION'}</div>
    </header>
    <div className="invoice-meta">
      <section><b>{isOrder ? 'Supplier' : 'Customer'}</b><strong>{isOrder ? document.supplier_name : document.customer_name}</strong>
        <span>{isOrder ? document.supplier_address || 'Address not provided' : document.customer_address || 'Address not provided'}</span>
        {(isOrder ? document.supplier_phone : document.customer_phone) && <span>Contact no: {isOrder ? document.supplier_phone : document.customer_phone}</span>}
        <span>GSTIN: {(isOrder ? document.supplier_gstin : document.customer_gstin) || 'Unregistered'}</span>
        {!isOrder && <span>Place of supply: {document.place_of_supply || '—'}</span>}
      </section>
      <section className="meta-values">
        <div><b>{isOrder ? 'Order no.' : 'Quote no.'}</b><span>{number}</span></div>
        <div><b>Date</b><span>{dateLabel(date)}</span></div>
        <div><b>{validLabel}</b><span>{dateLabel(validDate)}</span></div>
        <div><b>Status</b><span>{document.status}</span></div>
      </section>
    </div>
    <div className="invoice-table-wrap">
      <table className="invoice-table">
        <thead><tr><th>No.</th><th>Part / description</th><th>{isOrder ? 'SKU' : 'HSN/SAC'}</th><th>Quantity</th><th>{isOrder ? 'Unit cost' : 'Unit price'}</th><th>GST</th><th>Amount</th></tr></thead>
        <tbody>{rows.map((item, index) => <tr key={item.id}>
          <td>{index + 1}</td><td>{item.description}</td><td>{isOrder ? item.sku || '—' : item.hsn || '—'}</td>
          <td>{Number(item.quantity).toLocaleString('en-IN')} {item.unit || 'pcs'}</td>
          <td>{money(isOrder ? item.unit_cost : item.unit_price)}</td><td>{Number(item.gst_rate)}%</td><td>{money(item.amount)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="invoice-bottom">
      <section className="bank-details"><b>{isOrder ? 'Order notes' : 'Quotation notes'}</b><span>{document.notes || 'No additional notes'}</span></section>
      <section className="invoice-totals">
        <div><span>Taxable amount</span><b>{money(document.taxable_amount || rows.reduce((sum, item) => sum + Number(isOrder ? item.quantity * item.unit_cost : item.taxable_amount), 0))}</b></div>
        {Number(document.igst) > 0
          ? <div><span>IGST</span><b>{money(document.igst)}</b></div>
          : <><div><span>SGST</span><b>{money(document.sgst)}</b></div><div><span>CGST</span><b>{money(document.cgst)}</b></div></>}
        <div className="grand-total"><span>{isOrder ? 'Estimated total' : 'Quote total'}</span><b>{money(document.total)}</b></div>
      </section>
    </div>
    <footer className="invoice-signatures">
      <span>{isOrder ? 'Supplier acknowledgement' : 'Customer acceptance'}</span>
      <span>For {document.shop?.name || 'Business'}<b>(Authorized Signatory)</b></span>
    </footer>
  </article>
}
