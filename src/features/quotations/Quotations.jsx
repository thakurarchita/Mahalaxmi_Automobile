import Empty from '../../components/Empty'
import { money } from '../../utils/format'

export default function Quotations({ items, onCreate, onView, onConvert }) {
  return <section className="panel content-panel">
    <div className="section-heading"><div><h2>Quotations</h2><p>Customer estimates before conversion to sales</p></div><button className="btn solid" onClick={onCreate}>New quote</button></div>
    {items.length ? <div className="scroll"><table>
      <thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Valid until</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.quotation_number}</td><td>{item.customer_name}</td><td>{item.quotation_date}</td><td>{item.valid_until || '—'}</td><td>{money(item.total || 0)}</td>
        <td><span className={`status ${item.status === 'Converted' ? 'status-paid' : 'status-partial'}`}>{item.status}</span></td>
        <td className="row-actions"><button className="btn btn-small" onClick={() => onView(item)}>View / print</button>{item.status !== 'Converted' && <button className="btn btn-small" onClick={() => onConvert(item)}>Convert</button>}</td>
      </tr>)}</tbody>
    </table></div> : <Empty title="No quotations" copy="Create a customer estimate and convert it into an invoice when approved." action="Create quote" onAction={onCreate} />}
  </section>
}
