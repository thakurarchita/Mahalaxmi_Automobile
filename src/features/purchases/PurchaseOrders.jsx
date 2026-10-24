import Empty from '../../components/Empty'
import { money } from '../../utils/format'

export default function PurchaseOrders({ items, onCreate, onView, onReceive }) {
  return <section className="panel content-panel">
    <div className="section-heading">
      <div><h2>Purchase orders</h2><p>Supplier orders and expected stock delivery</p></div>
      <button className="btn solid" onClick={onCreate}>New order</button>
    </div>
    {items.length ? <div className="scroll"><table>
      <thead><tr><th>Order</th><th>Supplier</th><th>Order date</th><th>Expected</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.order_number}</td>
        <td>{item.supplier_name}</td>
        <td>{item.order_date}</td>
        <td>{item.expected_date || '—'}</td>
        <td>{money(item.total || 0)}</td>
        <td><span className={`status ${item.status === 'Received' ? 'status-paid' : 'status-partial'}`}>{item.status}</span></td>
        <td className="row-actions"><button className="btn btn-small" onClick={() => onView(item)}>View / print</button>{item.status !== 'Received' && <button className="btn btn-small" onClick={() => onReceive(item)}>Receive</button>}</td>
      </tr>)}</tbody>
    </table></div> : <Empty title="No purchase orders" copy="Create the first supplier order and track expected receipts." action="Create order" onAction={onCreate} />}
  </section>
}
