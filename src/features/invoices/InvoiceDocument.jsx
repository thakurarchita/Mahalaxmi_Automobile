import { useMemo } from 'react'
import LogoMark from '../../components/LogoMark'
import { dateLabel, money } from '../../utils/format'

export default function InvoiceDocument({ invoice }) {
  const hsnRows = useMemo(() => Object.values(invoice.items.reduce((groups, item) => {
    const key = `${item.hsn || '—'}-${item.gst_rate}`
    groups[key] ??= { hsn: item.hsn || '—', rate: Number(item.gst_rate), quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    groups[key].quantity += Number(item.quantity)
    groups[key].taxable += Number(item.taxable_amount)
    groups[key].cgst += Number(item.cgst)
    groups[key].sgst += Number(item.sgst)
    groups[key].igst += Number(item.igst)
    return groups
  }, {})), [invoice.items])
  return (
    <article className="invoice-paper">
      <header className="invoice-brand">
        <LogoMark />
        <div><h2>{invoice.shop_name}</h2><p>{invoice.shop_address}</p>
          <p>Contact no: {invoice.shop_phone || '—'}{invoice.shop_email ? ` · Email: ${invoice.shop_email}` : ''}</p>
          <p>GSTIN: {invoice.shop_gstin || '—'}</p>
        </div>
        <div className="invoice-title">TAX INVOICE</div>
      </header>
      <div className="invoice-meta">
        <section><b>Buyer / Recipient</b><strong>{invoice.customer_name}</strong>
          <span>{invoice.customer_address || 'Address not provided'}</span>
          {invoice.customer_phone && <span>Contact no: {invoice.customer_phone}</span>}
          <span>GSTIN: {invoice.customer_gstin || 'Unregistered'}</span>
          <span>Place of supply: {invoice.place_of_supply}</span>
        </section>
        <section className="meta-values">
          <div><b>Invoice No.</b><span>{invoice.invoice_number}</span></div>
          <div><b>Date</b><span>{dateLabel(invoice.invoice_date)}</span></div>
          <div><b>Dispatched through</b><span>{invoice.dispatched_through || '—'}</span></div>
          <div><b>Vehicle No.</b><span>{invoice.vehicle_number || '—'}</span></div>
          <div><b>Model</b><span>{invoice.vehicle_model || '—'}</span></div>
          <div><b>Engine No.</b><span>{invoice.engine_number || '—'}</span></div>
        </section>
      </div>
      <div className="invoice-table-wrap">
        <table className="invoice-table">
          <thead><tr><th>Sr. No.</th><th>Description</th><th>HSN/SAC</th><th>Quantity</th><th>Price</th><th>Taxes</th><th>Amount</th></tr></thead>
          <tbody>{invoice.items.map((item, index) => (
            <tr key={item.id}><td>{index + 1}</td><td>{item.description}</td><td>{item.hsn || '—'}</td>
              <td>{Number(item.quantity).toLocaleString('en-IN')} {item.unit}</td><td>{money(item.unit_price)}</td>
              <td>GST {Number(item.gst_rate)}%</td><td>{money(item.taxable_amount)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="invoice-bottom">
        <section className="bank-details"><b>Bank Details</b>
          <span>{invoice.bank_name || 'Bank details not set'}</span><span>{invoice.bank_branch}</span>
          {invoice.account_number && <span>A/c No.: {invoice.account_number}</span>}
          {invoice.ifsc && <span>IFSC Code: {invoice.ifsc}</span>}
        </section>
        <section className="invoice-totals">
          <div><span>Untaxed amount</span><b>{money(invoice.taxable_amount)}</b></div>
          {invoice.igst > 0
            ? <div><span>IGST</span><b>{money(invoice.igst)}</b></div>
            : <><div><span>SGST / UTGST</span><b>{money(invoice.sgst)}</b></div><div><span>CGST</span><b>{money(invoice.cgst)}</b></div></>}
          <div className="grand-total"><span>Total</span><b>{money(invoice.total)}</b></div>
          {invoice.paid_amount > 0 && <div><span>Paid</span><b>{money(invoice.paid_amount)}</b></div>}
          {invoice.total > invoice.paid_amount && <div><span>Balance due</span><b>{money(invoice.total - invoice.paid_amount)}</b></div>}
        </section>
      </div>
      <section className="hsn-summary">
        <h3>HSN Summary</h3>
        <table><thead><tr><th>HSN/SAC</th><th>Quantity</th><th>Rate %</th><th>Taxable value</th><th>SGST / UTGST</th><th>{invoice.igst > 0 ? 'IGST' : 'CGST'}</th></tr></thead>
          <tbody>{hsnRows.map((row) => <tr key={`${row.hsn}-${row.rate}`}><td>{row.hsn}</td><td>{row.quantity}</td><td>{row.rate}%</td>
            <td>{money(row.taxable)}</td><td>{money(row.sgst)}</td><td>{money(row.cgst + row.igst)}</td></tr>)}</tbody>
        </table>
      </section>
      {invoice.notes && <p className="invoice-notes"><b>Notes:</b> {invoice.notes}</p>}
      <footer className="invoice-signatures"><span>Receiver Signature</span><span>For {invoice.shop_name}<b>(Authorized Signatory)</b></span></footer>
    </article>
  )
}
