import Empty from '../../components/Empty'
import { money } from '../../utils/format'

export default function Purchases({ items, onPay }) {
  return <section className="panel content-panel">
    <div className="section-heading"><div><h2>Purchases</h2><p>Supplier stock received and outstanding balances</p></div><span className="count-pill">{items.length} bills</span></div>
    {items.length ? <div className="scroll"><table>
      <thead><tr><th>Purchase</th><th>Supplier</th><th>Date</th><th>Invoice</th><th>Total</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.purchase_number}</td><td>{item.supplier_name}</td><td>{item.purchase_date}</td><td>{item.supplier_invoice_number || '—'}</td>
        <td>{money(item.total || 0)}</td><td>{money((item.total || 0) - (item.paid_amount || 0))}</td>
        <td><span className={`status ${item.status === 'Paid' ? 'status-paid' : item.status === 'Partial' ? 'status-partial' : 'status-unpaid'}`}>{item.status}</span></td>
        <td>{(item.total || 0) > (item.paid_amount || 0) ? <button className="btn btn-small" onClick={() => onPay(item)}>Pay</button> : 'Settled'}</td>
      </tr>)}</tbody>
    </table></div> : <Empty title="No purchases" copy="Record purchased stock once supplier goods are received." action="View suppliers" onAction={() => document.querySelector('[data-supplier-nav]')?.click()} />}
  </section>
}
