import { BarChart3, Boxes, FileText, Receipt, Users } from 'lucide-react'
import Empty from '../../components/Empty'
import Status from '../../components/Status'
import { dateLabel, money, shortMoney } from '../../utils/format'

function Chart({ monthly = [] }) {
  const points = monthly.slice(-6)
  const maximum = Math.max(1, ...points.map((entry) => Number(entry.sales || 0)))
  if (!points.length) return <div className="chart-empty">Sales and profit trends will appear after your first invoice.</div>
  return (
    <div className="chart" role="img" aria-label="Monthly sales and cost comparison">
      {points.map((point) => (
        <div className="chart-column" key={point.month}>
          <div className="chart-bars">
            <i className="chart-sales" style={{ height: `${Math.max(2, Number(point.sales) / maximum * 100)}%` }} title={`Sales ${money(point.sales)}`} />
            <i className="chart-cost" style={{ height: `${Math.max(2, Number(point.cost) / maximum * 100)}%` }} title={`Part cost ${money(point.cost)}`} />
          </div>
          <span>{new Date(`${point.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ overview = {}, onOpenInvoice, onGo }) {
  const grossProfit = Number(overview.gross_profit || 0)
  const stats = [
    { label: 'Sales (taxable)', value: shortMoney(overview.taxable_sales), note: `${overview.invoice_count || 0} invoices`, icon: Receipt },
    { label: grossProfit < 0 ? 'Gross loss' : 'Gross profit', value: shortMoney(grossProfit), note: 'Sales less part cost', icon: BarChart3, negative: grossProfit < 0 },
    { label: 'Outstanding dues', value: shortMoney(overview.outstanding), note: 'Unpaid invoice balance', icon: FileText },
    { label: 'Parts in stock', value: Number(overview.part_count || 0).toLocaleString('en-IN'), note: `${overview.low_stock_count || 0} at reorder level`, icon: Boxes },
    { label: 'Stock value (cost)', value: shortMoney(overview.inventory_cost_value), note: `Retail value ${shortMoney(overview.inventory_retail_value)}`, icon: Boxes },
    { label: 'Customers & suppliers', value: `${overview.customer_count || 0} / ${overview.supplier_count || 0}`, note: 'Saved business contacts', icon: Users },
  ]
  return (
    <>
      <div className="stat-grid">{stats.map((stat) => <section className="panel stat-card" key={stat.label}><div className="stat-icon"><stat.icon size={17} /></div><span className="label">{stat.label}</span><b className={stat.negative ? 'negative' : ''}>{stat.value}</b><small>{stat.note}</small></section>)}</div>
      <div className="dashboard-grid">
        <section className="panel"><div className="section-heading"><div><h2>Sales &amp; cost of parts</h2><p>Invoice taxable values compared with cost price</p></div><span className="period-pill">Last 6 months</span></div>
          <Chart monthly={overview.monthly} /><div className="legend"><span><i className="legend-sales" />Sales</span><span><i className="legend-cost" />Cost of parts</span></div>
        </section>
        <section className="panel highlights"><h2>Parts performance</h2>
          {overview.best_seller ? <div className="highlight-row"><span className="highlight-symbol best">↑</span><div><small>Best selling</small><b>{overview.best_seller.name}</b><span>{Number(overview.best_seller.units).toLocaleString('en-IN')} units sold</span></div></div>
            : <div className="highlight-empty">Best selling part appears after your first sale.</div>}
          {overview.slow_seller ? <div className="highlight-row"><span className="highlight-symbol slow">↓</span><div><small>Lowest selling</small><b>{overview.slow_seller.name}</b><span>{Number(overview.slow_seller.units).toLocaleString('en-IN')} units sold</span></div></div>
            : <div className="highlight-empty">Lowest selling part appears after your first sale.</div>}
          <button className="btn wide" onClick={() => onGo('Parts')}>Manage parts</button>
        </section>
      </div>
      <div className="dashboard-grid lower-dashboard">
        <section className="panel"><div className="section-heading"><div><h2>Recent invoices</h2><p>Your latest customer bills</p></div><button className="text-button" onClick={() => onGo('Invoices')}>View all</button></div>
          {overview.recent_invoices?.length ? <div className="scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>{overview.recent_invoices.map((invoice) => <tr key={invoice.id} onClick={() => onOpenInvoice(invoice.id)} className="clickable-row">
              <td className="ref">{invoice.invoice_number}</td><td>{invoice.customer_name}</td><td className="muted">{dateLabel(invoice.invoice_date)}</td><td className="r">{money(invoice.total)}</td><td><Status status={invoice.status} /></td>
            </tr>)}</tbody></table></div> : <Empty title="No invoices yet" copy="Create your first GST invoice to begin tracking sales and profit." action="Create invoice" onAction={() => onGo('Invoices')} />}
        </section>
        <section className="panel"><div className="section-heading"><div><h2>Running low</h2><p>Parts at or below reorder level</p></div><button className="text-button" onClick={() => onGo('Parts')}>Inventory</button></div>
          {overview.low_stock?.length ? overview.low_stock.map((product) => <div className="stock-row" key={product.id}>
            <div><b>{product.name}</b><small>{product.sku}</small></div><span className={Number(product.stock) === 0 ? 'stock-zero' : 'stock-low'}>{product.stock} / {product.reorder_level}</span>
          </div>) : <div className="highlight-empty">No parts are below their reorder level.</div>}
        </section>
      </div>
      <section className="panel forecast-panel">
        <div className="section-heading"><div><h2>Smart stock forecast</h2><p>Local estimate from each part’s last 90 days of recorded sales; not an external AI service.</p></div><button className="text-button" onClick={() => onGo('Parts')}>Manage parts</button></div>
        {overview.inventory_forecast?.length ? <div className="scroll"><table><thead><tr><th>Part / fitment</th><th>Sold in 90 days</th><th>Est. next 30 days</th><th>Stock cover</th><th>Suggested order</th><th>Signal</th></tr></thead>
          <tbody>{overview.inventory_forecast.slice(0, 8).map((part) => <tr key={part.id}>
            <td><b>{part.name}</b><small className="table-sub">{part.vehicle_make} · {part.vehicle_model}</small></td>
            <td>{Number(part.units_sold_90d).toLocaleString('en-IN')} {part.unit}</td>
            <td>{Number(part.estimated_30_day_demand).toLocaleString('en-IN')} {part.unit}</td>
            <td>{part.days_of_stock === null ? 'Not enough sales history' : `${part.days_of_stock} days`}</td>
            <td>{Number(part.suggested_order) > 0 ? `${part.suggested_order} ${part.unit}` : '—'}</td>
            <td><span className={part.forecast_status === 'Reorder soon' || part.forecast_status === 'At reorder level' ? 'stock-low' : 'stock-ok'}>{part.forecast_status}</span></td>
          </tr>)}</tbody></table></div> : <div className="highlight-empty">Add parts to start tracking inventory and demand.</div>}
        {Number(overview.demo_part_count) > 0 && <p className="demo-notice" role="note">Sample inventory is loaded for setup and testing ({overview.demo_part_count} parts; SKUs start with DEMO-). Verify or replace sample stock and fitment before selling.</p>}
      </section>
    </>
  )
}
