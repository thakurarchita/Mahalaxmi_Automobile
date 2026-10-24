import Empty from '../../components/Empty'

export default function Parties({ title, items, onAdd, onEdit }) {
  return <section className="panel content-panel"><div className="section-heading"><div><h2>{title} directory</h2><p>Business contacts and GST details</p></div><span className="count-pill">{items.length} records</span></div>
    {items.length ? <div className="scroll"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>GSTIN</th><th>Address</th>{title === 'Customers' && <th>Place of supply</th>}<th>Action</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.phone || '—'}</td><td>{item.email || '—'}</td><td>{item.gstin || 'Unregistered'}</td><td>{item.address || '—'}</td>
        {title === 'Customers' && <td>{item.place_of_supply || '—'}</td>}<td><button className="btn btn-small" onClick={() => onEdit(item)}>Edit</button></td></tr>)}</tbody></table></div>
      : <Empty title={`No ${title.toLowerCase()} added`} copy={title === 'Customers' ? 'Add your customer first to prepare a tax invoice.' : 'Keep supplier contact, address and GST details in one place.'} action={`Add ${title === 'Customers' ? 'customer' : 'supplier'}`} onAction={onAdd} />}</section>
}
