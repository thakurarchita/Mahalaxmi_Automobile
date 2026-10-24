import Empty from '../../components/Empty'
import Status from '../../components/Status'
import { dateLabel, money } from '../../utils/format'

export default function Invoices({ invoices, onOpen, onPay }) {
  return <section className="panel content-panel"><div className="section-heading"><div><h2>Sales invoices</h2><p>Tax invoices, balances and payment status</p></div><span className="count-pill">{invoices.length} invoices</span></div>
    {invoices.length ? <div className="scroll"><table><thead><tr><th>Invoice no.</th><th>Customer</th><th>Date</th><th className="r">Total</th><th className="r">Balance</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><button className="table-link" onClick={() => onOpen(invoice.id)}>{invoice.invoice_number}</button></td><td>{invoice.customer_name}</td>
        <td>{dateLabel(invoice.invoice_date)}</td><td className="r">{money(invoice.total)}</td><td className="r">{money(invoice.total - invoice.paid_amount)}</td><td><Status status={invoice.status} /></td>
        <td className="row-actions"><button className="btn btn-small" onClick={() => onOpen(invoice.id)}>View / print</button>{invoice.total > invoice.paid_amount && <button className="btn btn-small" onClick={() => onPay(invoice)}>Receive payment</button>}</td></tr>)}</tbody></table></div>
      : <Empty title="No invoices found" copy="Create a GST invoice to record a sale. Part prices and HSN codes fill in automatically." action="Create an invoice" onAction={() => document.querySelector('[data-create-invoice]')?.click()} /> }
  </section>
}
