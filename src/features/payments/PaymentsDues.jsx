import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { money } from '../../utils/format'

function BalanceList({ title, description, partyLabel, items, total, kind, onGo }) {
  const isCustomer = kind === 'customer'
  return <section className={`panel dues-list ${kind}`}>
    <div className="dues-list-heading">
      <div className={`dues-direction ${kind}`}>{isCustomer ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</div>
      <div><h2>{title}</h2><p>{description}</p></div>
      <span className="dues-total">{money(total)}</span>
    </div>
    {items.length ? <div className="scroll">
      <table>
        <thead><tr><th>{partyLabel}</th><th className="r">Amount outstanding</th></tr></thead>
        <tbody>{items.map((item) => <tr key={isCustomer ? item.customer_id : item.supplier_id}>
          <td><b>{isCustomer ? item.customer_name : item.supplier_name}</b></td>
          <td className="r">{money(item.balance || 0)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="dues-empty"><b>All clear</b><span>{isCustomer ? 'There are no customer payments waiting to be collected.' : 'There are no supplier payments waiting to be paid.'}</span></div>}
    <div className="dues-list-footer">
      <span>{items.length} {items.length === 1 ? 'account' : 'accounts'} with outstanding balances</span>
      <button className="btn btn-small" onClick={() => onGo(isCustomer ? 'Invoices' : 'Purchases')}>
        {isCustomer ? 'View invoices & receive payment' : 'View purchases & pay supplier'}
      </button>
    </div>
  </section>
}

export default function PaymentsDues({ dues = {}, onGo }) {
  const customer = dues.customer_outstanding || []
  const supplier = dues.supplier_outstanding || []
  const customerTotal = Number(dues.customer_total || 0)
  const supplierTotal = Number(dues.supplier_total || 0)
  return <div className="dues-page">
    <section className="panel dues-intro">
      <div className="dues-intro-icon"><Wallet size={21} /></div>
      <div><h2>Money to collect and pay</h2><p>A simple overview of unpaid customer invoices and supplier bills.</p></div>
      <div className="dues-net"><span>Difference</span><b>{money(customerTotal - supplierTotal)}</b><small>{customerTotal >= supplierTotal ? 'More is owed to you' : 'More is owed to suppliers'}</small></div>
    </section>
    <div className="dues-summary">
      <article className="dues-summary-card customer">
        <div className="dues-summary-label"><span className="dues-direction customer"><ArrowDownLeft size={17} /></span><span>Customers owe you</span></div>
        <b>{money(customerTotal)}</b><small>{customer.length} {customer.length === 1 ? 'customer has' : 'customers have'} an unpaid balance</small>
        <button className="text-button" onClick={() => onGo('Invoices')}>Go to invoices <ArrowUpRight size={14} /></button>
      </article>
      <article className="dues-summary-card supplier">
        <div className="dues-summary-label"><span className="dues-direction supplier"><ArrowUpRight size={17} /></span><span>You owe suppliers</span></div>
        <b>{money(supplierTotal)}</b><small>{supplier.length} {supplier.length === 1 ? 'supplier has' : 'suppliers have'} an unpaid balance</small>
        <button className="text-button" onClick={() => onGo('Purchases')}>Go to purchases <ArrowUpRight size={14} /></button>
      </article>
    </div>
    <div className="dues-section-heading"><div><h2>Outstanding balances</h2><p>Choose a list below to see who still needs payment.</p></div></div>
    <div className="dues-lists">
      <BalanceList title="Money to collect" description="Customers with invoices still to be paid" partyLabel="Customer" items={customer} total={customerTotal} kind="customer" onGo={onGo} />
      <BalanceList title="Money to pay" description="Suppliers with purchase bills still unpaid" partyLabel="Supplier" items={supplier} total={supplierTotal} kind="supplier" onGo={onGo} />
    </div>
    <p className="dues-help">To record a payment, open the related invoices or purchases list and choose <b>Receive payment</b> or <b>Pay</b>.</p>
  </div>
}
