import { FileText, Plus } from 'lucide-react'

export default function Empty({ title, copy, action, onAction }) {
  return <div className="empty">
    <div className="empty-mark"><FileText size={22} /></div>
    <h3>{title}</h3>
    <p>{copy}</p>
    {action && <button data-create-invoice={action.toLowerCase().includes('invoice') ? '' : undefined} className="btn solid" onClick={onAction}><Plus size={16} />{action}</button>}
  </div>
}
