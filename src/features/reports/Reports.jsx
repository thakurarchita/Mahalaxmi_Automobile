import { useMemo, useState } from 'react'
import { CalendarDays, ChartNoAxesColumnIncreasing, Download, FileSpreadsheet, Printer, Store, Text } from 'lucide-react'
import { dateLabel, money } from '../../utils/format'

const periods = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'supplier', label: 'By supplier' },
  { id: 'all', label: 'Full report' },
]

function localDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function reportDate(value) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null
}

function weekStart(date) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

function groupFor(dateValue, period) {
  const date = reportDate(dateValue)
  if (!date) return null
  if (period === 'daily') return localDate(date)
  if (period === 'weekly') return localDate(weekStart(date))
  if (period === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return String(date.getFullYear())
}

function groupLabel(key, period) {
  if (period === 'yearly' || period === 'all') return key
  if (period === 'monthly') {
    const [year, month] = key.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }
  const date = reportDate(key)
  return date?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) || key
}

function startDate(period, records) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (period === 'daily') {
    today.setDate(today.getDate() - 13)
    return localDate(today)
  }
  if (period === 'weekly') {
    const firstWeek = weekStart(today)
    firstWeek.setDate(firstWeek.getDate() - 11 * 7)
    return localDate(firstWeek)
  }
  if (period === 'monthly') {
    today.setDate(1)
    today.setMonth(today.getMonth() - 11)
    return localDate(today)
  }
  const years = records.map((row) => Number(row.invoice_date?.slice(0, 4) || row.purchase_date?.slice(0, 4))).filter(Boolean)
  return `${Math.min(today.getFullYear(), ...(years.length ? years : [today.getFullYear()]))}-01-01`
}

function csvCell(value) {
  let text = String(value ?? '')
  if (typeof value !== 'number' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function excelDate(value) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function pdfMoney(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ReportCard({ label, value, note, negative = false, count = false }) {
  return <section className="panel report-card">
    <span className="label">{label}</span>
    <b className={negative ? 'negative' : ''}>{count ? Number(value || 0).toLocaleString('en-IN') : money(value)}</b>
    <small>{note}</small>
  </section>
}

export default function Reports({ invoices = [], purchases = [], suppliers = [], onGo }) {
  const [period, setPeriod] = useState('monthly')
  const [supplierId, setSupplierId] = useState('all')
  const [exportError, setExportError] = useState('')
  const rows = useMemo(() => {
    if (period === 'supplier') return []
    const transactions = [...invoices.map((row) => ({ ...row, kind: 'sale', date: row.invoice_date })),
      ...purchases.map((row) => ({ ...row, kind: 'purchase', date: row.purchase_date }))]
    if (period === 'all') return transactions
    const start = startDate(period, transactions)
    return transactions.filter((row) => row.date >= start)
  }, [invoices, purchases, period])

  const totals = useMemo(() => rows.reduce((summary, row) => {
    if (row.kind === 'sale') {
      summary.sales += Number(row.taxable_amount || 0)
      summary.cost += Number(row.cost_of_goods || 0)
      summary.receivables += Number(row.total || 0) - Number(row.paid_amount || 0)
    } else {
      summary.purchases += Number(row.total || 0)
    }
    return summary
  }, { sales: 0, cost: 0, purchases: 0, receivables: 0 }), [rows])

  const timeline = useMemo(() => {
    const groups = new Map()
    rows.forEach((row) => {
      const key = groupFor(row.date, period)
      if (!key) return
      const group = groups.get(key) || { key, sales: 0, purchases: 0 }
      if (row.kind === 'sale') group.sales += Number(row.taxable_amount || 0)
      else group.purchases += Number(row.total || 0)
      groups.set(key, group)
    })
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [rows, period])

  const supplierRows = useMemo(() => {
    const grouped = new Map(suppliers
      .filter((supplier) => supplierId === 'all' || String(supplier.id) === supplierId)
      .map((supplier) => [supplier.id, {
        id: supplier.id,
        name: supplier.name,
        bills: 0,
        total: 0,
        paid: 0,
      }]))
    purchases.forEach((purchase) => {
      if (supplierId !== 'all' && String(purchase.supplier_id) !== supplierId) return
      const group = grouped.get(purchase.supplier_id) || {
        id: purchase.supplier_id,
        name: purchase.supplier_name || 'Unknown supplier',
        bills: 0,
        total: 0,
        paid: 0,
      }
      group.bills += 1
      group.total += Number(purchase.total || 0)
      group.paid += Number(purchase.paid_amount || 0)
      grouped.set(purchase.supplier_id, group)
    })
    return [...grouped.values()].sort((a, b) => b.total - a.total)
  }, [purchases, supplierId, suppliers])

  const maxBar = Math.max(1, ...timeline.flatMap((row) => [row.sales, row.purchases]))
  const summaryText = period === 'daily' ? 'Last 14 days'
    : period === 'weekly' ? 'Last 12 weeks'
      : period === 'monthly' ? 'Last 12 months'
        : period === 'yearly' ? 'Since your first record'
          : 'All dates · all records'

  function downloadReport() {
    const exportRows = period === 'supplier'
      ? supplierRows.map((row) => [row.name, row.bills, Number(row.total.toFixed(2)), Number(row.paid.toFixed(2)), Number((row.total - row.paid).toFixed(2))])
      : [...rows].sort((a, b) => b.date.localeCompare(a.date)).map((row) => {
        const isSale = row.kind === 'sale'
        const taxable = Number(row.taxable_amount || 0)
        const cost = Number(row.cost_of_goods || 0)
        const total = Number(row.total || 0)
        const paid = Number(row.paid_amount || 0)
        return [
          isSale ? 'Sale' : 'Purchase',
          isSale ? row.invoice_number : row.purchase_number,
          row.date,
          isSale ? row.customer_name : row.supplier_name,
          Number(taxable.toFixed(2)),
          Number(total.toFixed(2)),
          Number(paid.toFixed(2)),
          Number((total - paid).toFixed(2)),
          isSale ? Number(cost.toFixed(2)) : '',
          isSale ? Number((taxable - cost).toFixed(2)) : '',
          row.status,
        ]
      })
    const exportHeaders = period === 'supplier'
      ? ['Supplier', 'Bills', 'Total purchases', 'Paid', 'Balance due']
      : ['Type', 'Reference', 'Date', 'Customer / supplier', 'Taxable amount', 'Total', 'Paid', 'Balance due', 'Part cost', 'Gross profit', 'Status']
    downloadCsv(`${period}-business-report.csv`, exportHeaders, exportRows)
  }

  async function downloadExcel() {
    setExportError('')
    try {
    const { buildWorkbook } = await import('./excelExport')
    const periodLabel = periods.find((option) => option.id === period)?.label || 'Business'
    const reportRows = period === 'supplier'
      ? supplierRows.map((row) => [row.name, row.bills, row.total, row.paid, row.total - row.paid])
      : [...rows].sort((a, b) => b.date.localeCompare(a.date)).map((row) => {
        const isSale = row.kind === 'sale'
        const taxable = Number(row.taxable_amount || 0)
        const cost = Number(row.cost_of_goods || 0)
        const total = Number(row.total || 0)
        const paid = Number(row.paid_amount || 0)
        return [
          isSale ? 'Sale' : 'Purchase',
          isSale ? row.invoice_number : row.purchase_number,
          excelDate(row.date),
          isSale ? row.customer_name : row.supplier_name,
          taxable,
          total,
          paid,
          total - paid,
          isSale ? cost : '',
          isSale ? taxable - cost : '',
          row.status,
        ]
      })
    const headers = period === 'supplier'
      ? ['Supplier', 'Bills', 'Total purchases', 'Paid', 'Balance due']
      : ['Type', 'Reference', 'Date', 'Customer / supplier', 'Taxable amount', 'Total', 'Paid', 'Balance due', 'Part cost', 'Gross profit', 'Status']
    const summaryRows = period === 'supplier'
      ? [
        ['Mahalaxmi Automobiles — Supplier Purchase Report'],
        ['Supplier filter', supplierId === 'all' ? 'All suppliers' : suppliers.find((item) => String(item.id) === supplierId)?.name || 'Selected supplier'],
        ['Total purchases', supplierRows.reduce((sum, row) => sum + row.total, 0)],
        ['Supplier count', supplierRows.filter((row) => row.bills > 0).length],
        ['Bills recorded', supplierRows.reduce((sum, row) => sum + row.bills, 0)],
        ['Balance due', supplierRows.reduce((sum, row) => sum + row.total - row.paid, 0)],
        [],
      ]
      : [
        ['Mahalaxmi Automobiles — Business Report'],
        ['Report view', periodLabel],
        ['Date range', summaryText],
        [],
        ['Metric', 'Amount'],
        ['Sales before GST', totals.sales],
        ['Part costs', totals.cost],
        ['Gross profit / (loss)', totals.sales - totals.cost],
        ['Purchases including GST', totals.purchases],
        ['Customer balances due', totals.receivables],
        [],
      ]
    const headerRow = summaryRows.length + 1
    const workbook = buildWorkbook([{
      name: 'Business report',
      rows: [...summaryRows, headers, ...reportRows],
      widths: period === 'supplier' ? [34, 14, 22, 22, 22] : [14, 22, 17, 34, 20, 20, 20, 20, 20, 20, 16],
      options: {
        headerRow,
        dateColumns: period === 'supplier' ? [] : [2],
        currencyColumns: period === 'supplier' ? [2, 3, 4] : [1, 4, 5, 6, 7, 8, 9],
        titleRows: [1],
      },
    }])
    downloadBlob(`${period}-business-report.xlsx`, new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }))
    } catch (cause) {
      setExportError(`Could not create the Excel report: ${cause.message}`)
    }
  }

  async function downloadPdf() {
    setExportError('')
    try {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const periodLabel = periods.find((option) => option.id === period)?.label || 'Business'
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    pdf.setFontSize(17)
    pdf.text('Mahalaxmi Automobiles — Business Report', 15, 16)
    pdf.setFontSize(10)
    pdf.text(`${periodLabel} · ${period === 'supplier' ? 'All recorded purchases' : summaryText}`, 15, 23)
    const body = period === 'supplier'
      ? supplierRows.map((row) => [row.name, String(row.bills), pdfMoney(row.total), pdfMoney(row.paid), pdfMoney(row.total - row.paid)])
      : [...rows].sort((a, b) => b.date.localeCompare(a.date)).map((row) => {
        const isSale = row.kind === 'sale'
        const taxable = Number(row.taxable_amount || 0)
        const cost = Number(row.cost_of_goods || 0)
        const total = Number(row.total || 0)
        const paid = Number(row.paid_amount || 0)
        return [
          isSale ? 'Sale' : 'Purchase',
          isSale ? row.invoice_number : row.purchase_number,
          dateLabel(row.date),
          isSale ? row.customer_name : row.supplier_name,
          pdfMoney(taxable),
          pdfMoney(total),
          pdfMoney(paid),
          pdfMoney(total - paid),
          isSale ? pdfMoney(cost) : '—',
          isSale ? pdfMoney(taxable - cost) : '—',
          row.status,
        ]
      })
    const headers = period === 'supplier'
      ? ['Supplier', 'Bills', 'Total purchases', 'Paid', 'Balance due']
      : ['Type', 'Reference', 'Date', 'Customer / supplier', 'Taxable', 'Total', 'Paid', 'Balance due', 'Part cost', 'Gross profit', 'Status']
    const totalsLine = period === 'supplier'
      ? `Total purchases ${pdfMoney(supplierRows.reduce((sum, row) => sum + row.total, 0))} · Balance due ${pdfMoney(supplierRows.reduce((sum, row) => sum + row.total - row.paid, 0))}`
      : `Sales ${pdfMoney(totals.sales)} · Part costs ${pdfMoney(totals.cost)} · Gross profit ${pdfMoney(totals.sales - totals.cost)} · Purchases ${pdfMoney(totals.purchases)}`
    pdf.text(totalsLine, 15, 30)
    autoTable(pdf, {
      head: [headers],
      body,
      startY: 36,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [173, 36, 40] },
      columnStyles: period === 'supplier' ? { 0: { cellWidth: 85 } } : {
        0: { cellWidth: 20 },
        1: { cellWidth: 32 },
        2: { cellWidth: 28 },
        3: { cellWidth: 60 },
      },
    })
    pdf.save(`${period}-business-report.pdf`)
    } catch (cause) {
      setExportError(`Could not create the PDF report: ${cause.message}`)
    }
  }

  function printReport() {
    document.body.classList.add('printing-report')
    window.print()
    window.setTimeout(() => document.body.classList.remove('printing-report'), 1000)
  }

  return <div className="reports-page">
    {exportError && <div className="alert error" role="alert">{exportError}</div>}
    <section className="panel reports-intro">
      <div className="reports-intro-icon"><ChartNoAxesColumnIncreasing size={21} /></div>
      <div><h2>Business reports</h2><p>See how sales and purchases are changing over time, or compare what you buy from each supplier.</p></div>
      <span className="reports-range"><CalendarDays size={14} />{period === 'supplier' ? 'All recorded purchases' : summaryText}</span>
      <div className="reports-actions"><button type="button" className="btn btn-small" onClick={printReport}><Printer size={14} />Print</button><button type="button" className="btn btn-small" onClick={downloadReport}><Text size={14} />CSV</button><button type="button" className="btn btn-small" onClick={downloadExcel}><FileSpreadsheet size={14} />Excel</button><button type="button" className="btn btn-small solid" onClick={downloadPdf}><Download size={14} />PDF</button></div>
    </section>

    <nav className="report-tabs" aria-label="Choose report view">
      {periods.map((option) => <button type="button" key={option.id} className={period === option.id ? 'active' : ''} onClick={() => setPeriod(option.id)}>
        {option.label}
      </button>)}
    </nav>

    {period === 'supplier' ? <>
      <div className="report-section-title">
        <div><h2>Purchases by supplier</h2><p>Compare total bills and unpaid balances for each supplier.</p></div>
        <label className="report-filter">Supplier
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="all">All suppliers</option>
            {suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
      </div>
      <div className="stat-grid supplier-report-stats">
        <ReportCard label="Total purchases" value={supplierRows.reduce((sum, row) => sum + row.total, 0)} note="Including GST" />
        <ReportCard label="Suppliers" value={supplierRows.filter((row) => row.bills > 0).length} note="With recorded purchases" count />
        <ReportCard label="Bills recorded" value={supplierRows.reduce((sum, row) => sum + row.bills, 0)} note="Received purchase bills" count />
        <ReportCard label="Balance due" value={supplierRows.reduce((sum, row) => sum + row.total - row.paid, 0)} note="Still to pay suppliers" />
      </div>
      <section className="panel content-panel report-table-panel">
        {supplierRows.length ? <div className="scroll"><table>
          <thead><tr><th>Supplier</th><th className="r">Bills</th><th className="r">Total purchases</th><th className="r">Paid</th><th className="r">Balance due</th></tr></thead>
          <tbody>{supplierRows.map((row) => <tr key={row.id}><td><b>{row.name}</b></td><td className="r">{row.bills}</td><td className="r">{money(row.total)}</td><td className="r">{money(row.paid)}</td><td className="r">{money(row.total - row.paid)}</td></tr>)}</tbody>
        </table></div> : <div className="report-empty"><Store size={22} /><b>No supplier purchases yet</b><span>Receive a purchase order to start comparing supplier bills.</span></div>}
      </section>
    </> : <>
      <div className="report-section-title"><div><h2>{periods.find((option) => option.id === period)?.label} overview</h2><p>Sales and purchases for {summaryText.toLowerCase()}.</p></div></div>
      <div className="stat-grid reports-stats">
        <ReportCard label="Sales before GST" value={totals.sales} note="Taxable invoice amounts" />
        <ReportCard label="Part costs" value={totals.cost} note="Cost of parts sold" />
        <ReportCard label="Gross profit / (loss)" value={totals.sales - totals.cost} note="Sales less part costs" negative={totals.sales < totals.cost} />
        <ReportCard label="Purchases" value={totals.purchases} note="Received supplier bills" />
        <ReportCard label="Customer balances due" value={totals.receivables} note="Unpaid invoice totals" />
      </div>
      {period === 'all' && <section className="panel content-panel report-table-panel full-report-table">
        <div className="section-heading"><div><h2>All sales and purchases</h2><p>{invoices.length} sales invoices and {purchases.length} supplier bills</p></div></div>
        {rows.length ? <div className="scroll"><table>
          <thead><tr><th>Type</th><th>Reference</th><th>Date</th><th>Customer / supplier</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Balance</th><th>Status</th></tr></thead>
          <tbody>{[...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map((row) => {
            const isSale = row.kind === 'sale'
            return <tr key={`${row.kind}-${row.id}`}>
              <td>{isSale ? 'Sale' : 'Purchase'}</td>
              <td><b>{isSale ? row.invoice_number : row.purchase_number}</b></td>
              <td>{dateLabel(row.date)}</td>
              <td>{isSale ? row.customer_name : row.supplier_name}</td>
              <td className="r">{money(row.total)}</td><td className="r">{money(row.paid_amount)}</td>
              <td className="r">{money(Number(row.total || 0) - Number(row.paid_amount || 0))}</td><td>{row.status}</td>
            </tr>
          })}</tbody>
        </table></div> : <div className="report-empty"><CalendarDays size={22} /><b>No sales or purchases recorded</b><span>Business activity will appear here once records are added.</span></div>}
      </section>}
      <section className="panel report-chart-panel">
        <div className="section-heading"><div><h2>Sales and purchases</h2><p>Sales are shown before GST; purchases include GST.</p></div><div className="legend"><span><i className="legend-sales" />Sales</span><span><i className="legend-cost" />Purchases</span></div></div>
        {timeline.length ? <div className="report-chart">
          {timeline.map((row) => <div className="report-chart-column" key={row.key} title={`Sales ${money(row.sales)} · Purchases ${money(row.purchases)}`}>
            <div className="report-chart-bars"><i className="chart-sales" style={{ height: `${Math.max(row.sales ? 4 : 0, row.sales / maxBar * 100)}%` }} /><i className="chart-cost" style={{ height: `${Math.max(row.purchases ? 4 : 0, row.purchases / maxBar * 100)}%` }} /></div>
            <span>{groupLabel(row.key, period)}</span>
          </div>)}
        </div> : <div className="report-empty"><CalendarDays size={22} /><b>No activity for this time period</b><span>Sales and purchase records will appear here when they are added.</span></div>}
      </section>
      <section className="panel report-note"><h2>What do these numbers mean?</h2><p>Gross profit is sales before GST minus the recorded cost of parts sold. It does not include rent, wages, tax or other operating expenses. Customer balances include GST and show what is still unpaid.</p><button className="btn" onClick={() => onGo('Invoices')}>Review invoices</button></section>
    </>}
  </div>
}
