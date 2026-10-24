import Empty from '../../components/Empty'
import { money } from '../../utils/format'

export default function Parts({ products, onAdd, onEdit, onRestock }) {
  return <section className="panel content-panel"><div className="section-heading"><div><h2>Parts inventory</h2><p>Automotive parts, purchase costs, sale prices and stock on hand</p></div><span className="count-pill">{products.length} parts</span></div>
    {products.length ? <div className="scroll"><table><thead><tr><th>Part / SKU</th><th>Vehicle fitment</th><th>HSN</th><th>Supplier</th><th className="r">Cost</th><th className="r">Sale price</th><th>GST</th><th className="r">In stock</th><th>Stock level</th><th>Actions</th></tr></thead>
      <tbody>{products.map((product) => <tr key={product.id}><td><b>{product.name}</b><small className="table-sub">{product.sku}{product.category ? ` · ${product.category}` : ''}</small></td>
        <td>{product.vehicle_make}<small className="table-sub">{product.vehicle_model}</small></td>
        <td>{product.hsn || '—'}</td><td>{product.supplier_name || '—'}</td><td className="r">{money(product.purchase_price)}</td><td className="r">{money(product.selling_price)}</td><td>{Number(product.gst_rate)}%</td>
        <td className="r">{product.stock} {product.unit}</td><td><span className={Number(product.stock) <= Number(product.reorder_level) ? 'stock-low' : 'stock-ok'}>{Number(product.stock) <= Number(product.reorder_level) ? 'Reorder' : 'In stock'}</span></td>
        <td className="row-actions"><button className="btn btn-small" onClick={() => onEdit(product)}>Edit</button><button className="btn btn-small" onClick={() => onRestock(product)}>Receive stock</button></td></tr>)}</tbody></table></div>
      : <Empty title="Your parts list is empty" copy="Add parts with HSN, GST, cost, sale price and opening stock before creating invoices." action="Add a part" onAction={onAdd} />}</section>
}
