import express from 'express'
import path from 'node:path'
import { db, databasePath, projectRoot } from './server/database.js'
import { registerAuthRoutes } from './server/auth.js'

const app = express()
app.use(express.json({ limit: '12mb' }))
const requireOwner = registerAuthRoutes(app, db)
app.use('/api', requireOwner)

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const requiredText = (value, label, max = 200) => {
  const text = String(value ?? '').trim()
  if (!text || text.length > max) throw new HttpError(400, `${label} is required (maximum ${max} characters).`)
  return text
}

const optionalText = (value, max = 500) => {
  const text = String(value ?? '').trim()
  if (text.length > max) throw new HttpError(400, `Text must be ${max} characters or fewer.`)
  return text
}

const positiveOrZero = (value, label, { allowZero = true, max = 1_000_000_000 } = {}) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < (allowZero ? 0 : Number.EPSILON) || number > max) {
    throw new HttpError(400, `${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} number.`)
  }
  return number
}

const quantityForUnit = (value, label, unit = 'pcs') => {
  const quantity = positiveOrZero(value, label, { allowZero: false })
  if (!Number.isInteger(quantity)) {
    throw new HttpError(400, `${label} must be a whole number.`)
  }
  return quantity
}

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const moneyText = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const validDate = (value, label) => {
  const text = requiredText(value, label, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) throw new HttpError(400, `${label} must be a valid date.`)
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new HttpError(400, `${label} must be a valid date.`)
  }
  return text
}

function listRows(sql, ...params) {
  return db.prepare(sql).all(...params)
}

const isIntraState = (place) => {
  const normalized = String(place || '').trim().toLowerCase().replace(/[.,]/g, '')
  return normalized === '27'
    || normalized === 'mh'
    || normalized === 'maharashtra'
    || normalized.includes('maharashtra')
}

function invoiceDetails(id) {
  const invoice = db.prepare(`
    SELECT i.*, s.name AS shop_name, s.address AS shop_address, s.phone AS shop_phone,
      s.email AS shop_email, s.gstin AS shop_gstin, s.bank_name, s.bank_branch,
      s.account_number, s.ifsc
    FROM invoices i CROSS JOIN shop s
    WHERE i.id = ? AND s.id = 1
  `).get(id)
  if (!invoice) throw new HttpError(404, 'Invoice not found.')
  invoice.items = listRows('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id', id)
  if (isIntraState(invoice.place_of_supply) && invoice.igst > 0 && invoice.cgst === 0 && invoice.sgst === 0) {
    invoice.cgst = round(invoice.igst / 2)
    invoice.sgst = round(invoice.igst - invoice.cgst)
    invoice.igst = 0
    invoice.items = invoice.items.map((item) => {
      const cgst = round(item.igst / 2)
      return { ...item, cgst, sgst: round(item.igst - cgst), igst: 0 }
    })
  }
  return invoice
}

app.get('/api/shop', (_req, res) => res.json(db.prepare('SELECT * FROM shop WHERE id = 1').get()))
app.get('/api/products', (_req, res) => res.json(listRows(`
  SELECT p.*, s.name AS supplier_name FROM products p
  LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.name COLLATE NOCASE
`)))
app.get('/api/customers', (_req, res) => res.json(listRows('SELECT * FROM customers ORDER BY name COLLATE NOCASE')))
app.get('/api/suppliers', (_req, res) => res.json(listRows('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE')))
app.get('/api/part-requests', (_req, res) => res.json(listRows(`
  SELECT * FROM part_requests WHERE status IN ('Open', 'Ordered')
  ORDER BY CASE status WHEN 'Open' THEN 0 ELSE 1 END, created_at DESC
`)))
app.post('/api/chat', (req, res) => {
  const message = requiredText(req.body.message, 'Message', 300).toLowerCase()
  if (message.includes('low stock')) {
    const rows = listRows(`SELECT name, stock, unit FROM products WHERE stock <= reorder_level ORDER BY stock, name COLLATE NOCASE LIMIT 10`)
    return res.json({ reply: rows.length ? `Low stock:\n${rows.map((row) => `• ${row.name}: ${row.stock} ${row.unit}`).join('\n')}` : 'No parts are currently below their reorder level.' })
  }
  if (message.includes('owe') || message.includes('due')) {
    const customers = db.prepare(`SELECT customer_name, ROUND(SUM(total - paid_amount), 2) AS balance FROM invoices WHERE total > paid_amount GROUP BY customer_id, customer_name ORDER BY balance DESC LIMIT 5`).all()
    const suppliers = db.prepare(`SELECT supplier_name, ROUND(SUM(total - paid_amount), 2) AS balance FROM purchases WHERE total > paid_amount GROUP BY supplier_id, supplier_name ORDER BY balance DESC LIMIT 5`).all()
    const lines = [...customers.map((row) => `${row.customer_name} owes ${moneyText(row.balance)}`), ...suppliers.map((row) => `You owe ${row.supplier_name} ${moneyText(row.balance)}`)]
    return res.json({ reply: lines.length ? lines.join('\n') : 'There are no outstanding balances.' })
  }
  if (message.includes('invoice')) {
    const rows = listRows(`SELECT invoice_number, customer_name, total, invoice_date FROM invoices ORDER BY invoice_date DESC, id DESC LIMIT 5`)
    return res.json({ reply: rows.length ? rows.map((row) => `${row.invoice_number} · ${row.customer_name} · ${moneyText(row.total)} · ${row.invoice_date}`).join('\n') : 'No invoices found.' })
  }
  if (message.includes('sales') || message.includes('sale')) {
    const condition = message.includes('today') ? `date(invoice_date) = date('now','localtime')` : message.includes('month') ? `strftime('%Y-%m', invoice_date) = strftime('%Y-%m','now','localtime')` : '1 = 1'
    const result = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM invoices WHERE ${condition}`).get()
    return res.json({ reply: `${message.includes('today') ? "Today's" : message.includes('month') ? "This month's" : 'Recorded'} sales: ${result.count} invoice${result.count === 1 ? '' : 's'}, ${moneyText(result.total)}.` })
  }
  if (message.includes('best') || message.includes('selling')) {
    const rows = listRows(`SELECT p.name, COALESCE(SUM(ii.quantity), 0) AS units FROM products p JOIN invoice_items ii ON ii.product_id = p.id GROUP BY p.id ORDER BY units DESC LIMIT 5`)
    return res.json({ reply: rows.length ? rows.map((row) => `${row.name}: ${row.units} sold`).join('\n') : 'There is not enough sales history yet.' })
  }
  res.json({ reply: 'Try asking about today’s sales, sales this month, low stock, outstanding dues, recent invoices or best-selling parts.' })
})
app.post('/api/part-requests', (req, res) => {
  const partName = requiredText(req.body.part_name, 'Part name')
  const quantity = quantityForUnit(req.body.quantity || 1, 'Quantity')
  const reminderDate = req.body.reminder_date ? validDate(req.body.reminder_date, 'Reminder date') : ''
  const result = db.prepare(`
    INSERT INTO part_requests (customer_name, vehicle_number, vehicle_model, part_name, quantity, notes, reminder_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    optionalText(req.body.customer_name, 200),
    optionalText(req.body.vehicle_number, 40),
    optionalText(req.body.vehicle_model, 120),
    partName,
    quantity,
    optionalText(req.body.notes, 500),
    reminderDate,
  )
  res.status(201).json(db.prepare('SELECT * FROM part_requests WHERE id = ?').get(result.lastInsertRowid))
})
app.put('/api/part-requests/:id/complete', (req, res) => {
  const id = positiveOrZero(req.params.id, 'Part request ID', { allowZero: false })
  const updated = db.prepare("UPDATE part_requests SET status = 'Fulfilled' WHERE id = ? AND status IN ('Open', 'Ordered')").run(id)
  if (!updated.changes) throw new HttpError(404, 'Open part request not found.')
  res.json(db.prepare('SELECT * FROM part_requests WHERE id = ?').get(id))
})
app.get('/api/invoices', (_req, res) => res.json(listRows(`
  SELECT i.id, i.invoice_number, i.invoice_date, i.total, i.paid_amount, i.status,
    i.taxable_amount, i.customer_name, i.customer_phone,
    COALESCE(cogs.cost, 0) AS cost_of_goods
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(cost_price * quantity) AS cost
    FROM invoice_items GROUP BY invoice_id
  ) cogs ON cogs.invoice_id = i.id
  ORDER BY i.invoice_date DESC, i.id DESC
`)))
app.get('/api/invoices/:id', (req, res) => res.json(invoiceDetails(positiveOrZero(req.params.id, 'Invoice ID', { allowZero: false }))))

app.get('/api/overview', (_req, res) => {
  const totals = db.prepare(`
    SELECT COUNT(*) AS invoice_count,
      COALESCE(SUM(taxable_amount), 0) AS taxable_sales,
      COALESCE(SUM(total), 0) AS total_sales,
      COALESCE(SUM(total - paid_amount), 0) AS outstanding,
      COALESCE(SUM(cogs.cost), 0) AS cost_of_goods
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(cost_price * quantity) AS cost
      FROM invoice_items GROUP BY invoice_id
    ) cogs ON cogs.invoice_id = i.id
  `).get()
  const inventory = db.prepare(`
    SELECT COUNT(*) AS part_count,
      COALESCE(SUM(CASE WHEN stock <= reorder_level THEN 1 ELSE 0 END), 0) AS low_stock_count,
      COALESCE(SUM(stock * purchase_price), 0) AS inventory_cost_value,
      COALESCE(SUM(stock * selling_price), 0) AS inventory_retail_value,
      COALESCE(SUM(CASE WHEN sku LIKE 'DEMO-%' THEN 1 ELSE 0 END), 0) AS demo_part_count
    FROM products
  `).get()
  const contacts = db.prepare(`
    SELECT (SELECT COUNT(*) FROM customers) AS customer_count,
      (SELECT COUNT(*) FROM suppliers) AS supplier_count
  `).get()
  const salesSummary = db.prepare(`
    SELECT p.id, p.name, COALESCE(SUM(ii.quantity), 0) AS units,
      COALESCE(SUM(ii.taxable_amount), 0) AS sales
    FROM products p LEFT JOIN invoice_items ii ON ii.product_id = p.id
    GROUP BY p.id ORDER BY units DESC, sales DESC, p.name COLLATE NOCASE
  `).all()
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', invoice_date) AS month,
      SUM(taxable_amount) AS sales,
      SUM((SELECT COALESCE(SUM(cost_price * quantity), 0) FROM invoice_items WHERE invoice_id = invoices.id)) AS cost
    FROM invoices WHERE invoice_date >= date('now', '-5 months', 'start of month')
    GROUP BY month ORDER BY month
  `).all()
  const demandRows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.vehicle_make, p.vehicle_model, p.stock,
      p.reorder_level, p.unit,
      COALESCE(SUM(CASE WHEN date(i.invoice_date) >= date('now', '-90 days')
        THEN ii.quantity ELSE 0 END), 0) AS units_sold_90d
    FROM products p
    LEFT JOIN invoice_items ii ON ii.product_id = p.id
    LEFT JOIN invoices i ON i.id = ii.invoice_id
    GROUP BY p.id
    ORDER BY units_sold_90d DESC, p.stock ASC, p.name COLLATE NOCASE
  `).all()
  const inventoryForecast = demandRows.map((part) => {
    const dailyDemand = Number(part.units_sold_90d) / 90
    const daysOfStock = dailyDemand > 0 ? Math.floor(Number(part.stock) / dailyDemand) : null
    const suggestedOrder = dailyDemand > 0
      ? Math.max(0, Math.ceil(dailyDemand * 30 + Number(part.reorder_level) - Number(part.stock)))
      : 0
    return {
      ...part,
      estimated_30_day_demand: round(dailyDemand * 30),
      days_of_stock: daysOfStock,
      suggested_order: suggestedOrder,
      forecast_status: dailyDemand === 0
        ? Number(part.stock) <= Number(part.reorder_level) ? 'At reorder level' : 'Building sales history'
        : daysOfStock <= 30 ? 'Reorder soon' : 'Stock looks sufficient',
      purchase_priority: suggestedOrder > 0
        ? Number(part.stock) === 0 ? 'High' : daysOfStock !== null && daysOfStock <= 14 ? 'High' : 'Medium'
        : 'None',
      purchase_reason: suggestedOrder > 0
        ? Number(part.stock) === 0 ? 'Out of stock' : daysOfStock !== null && daysOfStock <= 14 ? 'Less than 15 days of stock' : 'Below forecasted requirement'
        : '',
    }
  })
  res.json({
    ...totals, ...inventory, ...contacts,
    gross_profit: round(totals.taxable_sales - totals.cost_of_goods),
    best_seller: Number(salesSummary[0]?.units) > 0 ? salesSummary[0] : null,
    slow_seller: Number(salesSummary[0]?.units) > 0 ? salesSummary.at(-1) : null,
    monthly,
    inventory_forecast: inventoryForecast,
    recent_invoices: listRows(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.total, i.paid_amount, i.status,
        i.customer_name
      FROM invoices i ORDER BY i.invoice_date DESC, i.id DESC LIMIT 6
    `),
    low_stock: listRows(`
      SELECT id, sku, name, stock, reorder_level FROM products
      WHERE stock <= reorder_level ORDER BY stock ASC, name LIMIT 6
    `),
  })
})

function createParty(table, req, res) {
  const name = requiredText(req.body.name, 'Name')
  const phone = optionalText(req.body.phone, 40)
  const email = optionalText(req.body.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  const address = optionalText(req.body.address)
  const gstin = optionalText(req.body.gstin, 15).toUpperCase()
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw new HttpError(400, 'GSTIN must contain 15 letters or numbers.')
  const values = table === 'customers'
    ? [name, phone, email, address, gstin, optionalText(req.body.place_of_supply || 'Maharashtra', 80)]
    : [name, phone, email, address, gstin, optionalText(req.body.place_of_supply || 'Maharashtra', 80)]
  const row = db.prepare(`INSERT INTO ${table} (name, phone, email, address, gstin, place_of_supply) VALUES (${Array(values.length).fill('?').join(',')})`)
    .run(...values)
  res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.lastInsertRowid))
}

app.post('/api/customers', (req, res) => createParty('customers', req, res))
app.post('/api/suppliers', (req, res) => createParty('suppliers', req, res))

function updateParty(table, req, res) {
  const id = positiveOrZero(req.params.id, 'Record ID', { allowZero: false })
  if (!db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)) throw new HttpError(404, 'Business contact not found.')
  const name = requiredText(req.body.name, 'Name')
  const phone = optionalText(req.body.phone, 40)
  const email = optionalText(req.body.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  const address = optionalText(req.body.address)
  const gstin = optionalText(req.body.gstin, 15).toUpperCase()
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw new HttpError(400, 'GSTIN must contain 15 letters or numbers.')
  const values = table === 'customers'
    ? [name, phone, email, address, gstin, optionalText(req.body.place_of_supply || 'Maharashtra', 80), id]
    : [name, phone, email, address, gstin, optionalText(req.body.place_of_supply || 'Maharashtra', 80), id]
  db.prepare(`UPDATE ${table} SET name = ?, phone = ?, email = ?, address = ?, gstin = ?, place_of_supply = ? WHERE id = ?`)
    .run(...values)
  res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id))
}

app.put('/api/customers/:id', (req, res) => updateParty('customers', req, res))
app.put('/api/suppliers/:id', (req, res) => updateParty('suppliers', req, res))

app.post('/api/products', (req, res) => {
  const sku = requiredText(req.body.sku, 'SKU', 60).toUpperCase()
  const name = requiredText(req.body.name, 'Part name')
  const hsn = optionalText(req.body.hsn, 20)
  const category = optionalText(req.body.category, 80)
  const vehicleMake = optionalText(req.body.vehicle_make || 'Universal', 80)
  const vehicleModel = optionalText(req.body.vehicle_model || 'All models', 120)
  const purchasePrice = positiveOrZero(req.body.purchase_price, 'Cost price')
  const sellingPrice = positiveOrZero(req.body.selling_price, 'Selling price')
  const gstRate = positiveOrZero(req.body.gst_rate ?? 18, 'GST rate', { max: 100 })
  const reorder = positiveOrZero(req.body.reorder_level ?? 0, 'Reorder level')
  const unit = optionalText(req.body.unit || 'pcs', 20)
  const stock = req.body.stock === '' || req.body.stock === undefined ? 0 : quantityForUnit(req.body.stock, 'Opening stock', unit)
  const supplierId = req.body.supplier_id ? positiveOrZero(req.body.supplier_id, 'Supplier', { allowZero: false }) : null
  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO products (sku, name, hsn, category, vehicle_make, vehicle_model,
        supplier_id, purchase_price, selling_price, gst_rate, stock, reorder_level, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sku, name, hsn, category, vehicleMake, vehicleModel, supplierId,
      purchasePrice, sellingPrice, gstRate, stock, reorder, unit)
    if (stock > 0) db.prepare(`
      INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
      VALUES (?, ?, 'opening', 'Opening stock')
    `).run(result.lastInsertRowid, stock)
    return db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)
  })
  res.status(201).json(create())
})

app.put('/api/products/:id', (req, res) => {
  const id = positiveOrZero(req.params.id, 'Part ID', { allowZero: false })
  const sku = requiredText(req.body.sku, 'SKU', 60).toUpperCase()
  const name = requiredText(req.body.name, 'Part name')
  const hsn = optionalText(req.body.hsn, 20)
  const category = optionalText(req.body.category, 80)
  const vehicleMake = optionalText(req.body.vehicle_make || 'Universal', 80)
  const vehicleModel = optionalText(req.body.vehicle_model || 'All models', 120)
  const purchasePrice = positiveOrZero(req.body.purchase_price, 'Cost price')
  const sellingPrice = positiveOrZero(req.body.selling_price, 'Selling price')
  const gstRate = positiveOrZero(req.body.gst_rate ?? 18, 'GST rate', { max: 100 })
  const reorder = positiveOrZero(req.body.reorder_level ?? 0, 'Reorder level')
  const unit = optionalText(req.body.unit || 'pcs', 20)
  const supplierId = req.body.supplier_id ? positiveOrZero(req.body.supplier_id, 'Supplier', { allowZero: false }) : null
  const update = db.prepare(`
    UPDATE products SET sku = ?, name = ?, hsn = ?, category = ?, vehicle_make = ?,
      vehicle_model = ?, supplier_id = ?, purchase_price = ?, selling_price = ?,
      gst_rate = ?, reorder_level = ?, unit = ?
    WHERE id = ?
  `).run(sku, name, hsn, category, vehicleMake, vehicleModel, supplierId,
    purchasePrice, sellingPrice, gstRate, reorder, unit, id)
  if (!update.changes) throw new HttpError(404, 'Part not found.')
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id))
})

app.post('/api/products/:id/stock', (req, res) => {
  const productId = positiveOrZero(req.params.id, 'Part ID', { allowZero: false })
  const unitCost = req.body.unit_cost === '' || req.body.unit_cost === undefined
    ? null
    : positiveOrZero(req.body.unit_cost, 'Updated cost price')
  const update = db.transaction(() => {
    const product = db.prepare('SELECT id, unit FROM products WHERE id = ?').get(productId)
    if (!product) throw new HttpError(404, 'Part not found.')
    const quantity = quantityForUnit(req.body.quantity, 'Received quantity', product.unit)
    if (unitCost === null) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, productId)
    else db.prepare('UPDATE products SET stock = stock + ?, purchase_price = ? WHERE id = ?').run(quantity, unitCost, productId)
    db.prepare(`
      INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
      VALUES (?, ?, 'adjustment', 'Stock received')
    `).run(productId, quantity)
    return db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
  })
  res.json(update())
})

app.post('/api/invoices', (req, res) => {
  const customerId = positiveOrZero(req.body.customer_id, 'Customer', { allowZero: false })
  const invoiceDate = validDate(req.body.invoice_date, 'Invoice date')
  const dueDate = req.body.due_date ? validDate(req.body.due_date, 'Due date') : ''
  const customer = db.prepare('SELECT id, name, phone, email, address, gstin, place_of_supply FROM customers WHERE id = ?').get(customerId)
  if (!customer) throw new HttpError(400, 'Select an existing customer.')
  const place = optionalText(req.body.place_of_supply || customer.place_of_supply || 'Maharashtra', 80)
  const itemsInput = req.body.items
  if (!Array.isArray(itemsInput) || itemsInput.length === 0 || itemsInput.length > 100) {
    throw new HttpError(400, 'Add between 1 and 100 invoice items.')
  }
  if (dueDate && dueDate < invoiceDate) throw new HttpError(400, 'Due date cannot be before the invoice date.')
  const intraState = isIntraState(place)
  const lines = itemsInput.map((item) => {
    const productId = positiveOrZero(item.product_id, 'Part', { allowZero: false })
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
    if (!product) throw new HttpError(400, 'A selected part no longer exists. Refresh and try again.')
    const quantity = quantityForUnit(item.quantity, `${product.name} quantity`, product.unit)
    if (quantity > product.stock) throw new HttpError(400, `${product.name} has only ${product.stock} ${product.unit} in stock.`)
    const unitPrice = item.unit_price === undefined || item.unit_price === '' ? product.selling_price : positiveOrZero(item.unit_price, `${product.name} price`)
    const taxable = round(quantity * unitPrice)
    const tax = round(taxable * product.gst_rate / 100)
    return {
      product, quantity, unitPrice, taxable,
      cgst: intraState ? round(tax / 2) : 0,
      sgst: intraState ? round(tax - round(tax / 2)) : 0,
      igst: intraState ? 0 : tax,
    }
  })
  const taxable = round(lines.reduce((sum, line) => sum + line.taxable, 0))
  const cgst = round(lines.reduce((sum, line) => sum + line.cgst, 0))
  const sgst = round(lines.reduce((sum, line) => sum + line.sgst, 0))
  const igst = round(lines.reduce((sum, line) => sum + line.igst, 0))
  const total = round(taxable + cgst + sgst + igst)
  const rawNumber = optionalText(req.body.invoice_number, 50)
  const invoiceNumber = rawNumber || `INV-${invoiceDate.slice(2, 4)}/${String(db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count + 1).padStart(4, '0')}`
  const insertInvoice = db.transaction(() => {
    const invoice = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name, customer_phone,
        customer_email, customer_address, customer_gstin, invoice_date, due_date, dispatched_through,
        vehicle_number, vehicle_model, engine_number, place_of_supply, notes,
        taxable_amount, cgst, sgst, igst, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceNumber, customerId, customer.name, customer.phone, customer.email,
      customer.address, customer.gstin, invoiceDate, dueDate,
      optionalText(req.body.dispatched_through, 100), optionalText(req.body.vehicle_number, 40).toUpperCase(),
      optionalText(req.body.vehicle_model, 100), optionalText(req.body.engine_number, 100), place,
      optionalText(req.body.notes), taxable, cgst, sgst, igst, total)
    const itemInsert = db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_id, description, hsn, quantity, unit,
        unit_price, cost_price, gst_rate, taxable_amount, cgst, sgst, igst, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const stockUpdate = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
    const movement = db.prepare(`
      INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
      VALUES (?, ?, 'sale', ?)
    `)
    lines.forEach((line) => {
      itemInsert.run(invoice.lastInsertRowid, line.product.id, line.product.name, line.product.hsn,
        line.quantity, line.product.unit, line.unitPrice, line.product.purchase_price, line.product.gst_rate,
        line.taxable, line.cgst, line.sgst, line.igst, line.taxable)
      const update = stockUpdate.run(line.quantity, line.product.id, line.quantity)
      if (!update.changes) throw new HttpError(400, `${line.product.name} stock changed. Refresh and try again.`)
      movement.run(line.product.id, -line.quantity, invoiceNumber)
    })
    return invoice.lastInsertRowid
  })
  res.status(201).json(invoiceDetails(insertInvoice()))
})

app.post('/api/invoices/:id/payments', (req, res) => {
  const invoiceId = positiveOrZero(req.params.id, 'Invoice ID', { allowZero: false })
  const amount = positiveOrZero(req.body.amount, 'Payment amount', { allowZero: false })
  const method = requiredText(req.body.method || 'Cash', 'Payment method', 40)
  const pay = db.transaction(() => {
    const invoice = db.prepare('SELECT id, total, paid_amount FROM invoices WHERE id = ?').get(invoiceId)
    if (!invoice) throw new HttpError(404, 'Invoice not found.')
    if (amount > round(invoice.total - invoice.paid_amount)) throw new HttpError(400, 'Payment cannot exceed the invoice balance.')
    db.prepare('INSERT INTO payments (invoice_id, amount, method, notes) VALUES (?, ?, ?, ?)')
      .run(invoiceId, amount, method, optionalText(req.body.notes))
    const paid = round(invoice.paid_amount + amount)
    const status = paid >= invoice.total ? 'Paid' : 'Partial'
    db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, invoiceId)
  })
  pay()
  res.json(invoiceDetails(invoiceId))
})

function documentTotals(lines, place) {
  const intraState = isIntraState(place)
  const taxable = round(lines.reduce((sum, line) => sum + line.taxable, 0))
  const cgst = round(lines.reduce((sum, line) => sum + line.cgst, 0))
  const sgst = round(lines.reduce((sum, line) => sum + line.sgst, 0))
  const igst = round(lines.reduce((sum, line) => sum + line.igst, 0))
  return { taxable, cgst, sgst, igst, total: round(taxable + cgst + sgst + igst), intraState }
}

function purchaseOrderDetails(id) {
  const order = db.prepare(`
    SELECT po.*, s.phone AS supplier_phone, s.email AS supplier_email,
      s.address AS supplier_address, s.gstin AS supplier_gstin,
      s.place_of_supply AS supplier_place_of_supply,
      COALESCE(SUM(poi.amount), 0) AS total
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
    WHERE po.id = ? GROUP BY po.id
  `).get(id)
  if (!order) throw new HttpError(404, 'Purchase order not found.')
  order.items = listRows('SELECT * FROM purchase_order_items WHERE order_id = ? ORDER BY id', id)
  order.taxable_amount = order.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
  order.cgst = 0
  order.sgst = 0
  order.igst = 0
  order.shop = db.prepare('SELECT name, address, phone, email, gstin FROM shop WHERE id = 1').get()
  return order
}

app.get('/api/purchase-orders', (_req, res) => res.json(listRows(`
  SELECT po.*, COALESCE(SUM(poi.amount), 0) AS total
  FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
  GROUP BY po.id ORDER BY po.order_date DESC, po.id DESC
`)))

app.get('/api/purchase-orders/:id', (req, res) => {
  const id = positiveOrZero(req.params.id, 'Purchase order ID', { allowZero: false })
  res.json(purchaseOrderDetails(id))
})

app.post('/api/purchase-orders', (req, res) => {
  const newSupplierInput = req.body.new_supplier
  let supplierId = req.body.supplier_id
    ? positiveOrZero(req.body.supplier_id, 'Supplier', { allowZero: false })
    : null
  let supplier = supplierId ? db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) : null
  if (supplierId && !supplier) throw new HttpError(400, 'Select an existing supplier.')
  if (!supplierId) {
    if (!newSupplierInput || typeof newSupplierInput !== 'object') throw new HttpError(400, 'Choose a supplier or add a new one.')
    const name = requiredText(newSupplierInput.name, 'Supplier name')
    const email = optionalText(newSupplierInput.email, 120)
    const gstin = optionalText(newSupplierInput.gstin, 15).toUpperCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid supplier email address.')
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw new HttpError(400, 'Supplier GSTIN must contain 15 letters or numbers.')
    supplier = {
      name,
      phone: optionalText(newSupplierInput.phone, 40),
      email,
      address: optionalText(newSupplierInput.address, 500),
      gstin,
      place_of_supply: optionalText(newSupplierInput.place_of_supply || 'Maharashtra', 80),
    }
  }
  const orderDate = validDate(req.body.order_date, 'Order date')
  const expectedDate = req.body.expected_date ? validDate(req.body.expected_date, 'Expected date') : ''
  if (expectedDate && expectedDate < orderDate) throw new HttpError(400, 'Expected date cannot be before the order date.')
  const input = req.body.items
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new HttpError(400, 'Add between 1 and 100 purchase order items.')
  }
  const lineInputs = input.map((item) => {
    const newProduct = item.new_product
    const product = newProduct
      ? {
          name: requiredText(newProduct.name, 'New part name'),
          sku: requiredText(newProduct.sku, 'New part SKU', 60),
          hsn: optionalText(newProduct.hsn, 20),
          category: optionalText(newProduct.category, 80),
          vehicle_make: requiredText(newProduct.vehicle_make || 'Universal', 'Vehicle make', 80),
          vehicle_model: requiredText(newProduct.vehicle_model || 'All models', 'Vehicle model', 120),
          purchase_price: positiveOrZero(newProduct.purchase_price, 'New part cost'),
          selling_price: positiveOrZero(newProduct.selling_price || newProduct.purchase_price, 'New part sale price'),
          gst_rate: positiveOrZero(newProduct.gst_rate || 0, 'New part GST', { max: 100 }),
          unit: requiredText(newProduct.unit || 'pcs', 'New part unit', 20),
        }
      : db.prepare('SELECT * FROM products WHERE id = ?').get(positiveOrZero(item.product_id, 'Part', { allowZero: false }))
    if (!product) throw new HttpError(400, 'A selected part no longer exists. Refresh and try again.')
    const quantity = quantityForUnit(item.quantity, `${product.name} quantity`, product.unit)
    const unitCost = item.unit_cost === undefined || item.unit_cost === '' ? product.purchase_price : positiveOrZero(item.unit_cost, `${product.name} cost`)
    return { product, quantity, unitCost, newProduct }
  })
  const orderId = db.transaction(() => {
    if (!supplierId) {
      const result = db.prepare(`
        INSERT INTO suppliers (name, phone, email, address, gstin, place_of_supply)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(supplier.name, supplier.phone, supplier.email, supplier.address, supplier.gstin, supplier.place_of_supply)
      supplierId = Number(result.lastInsertRowid)
      supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid)
    }
    const lines = lineInputs.map((line) => {
      let product = line.product
      if (line.newProduct) {
        const productResult = db.prepare(`
          INSERT INTO products (sku, name, hsn, category, vehicle_make, vehicle_model, supplier_id,
            purchase_price, selling_price, gst_rate, stock, reorder_level, unit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
        `).run(product.sku, product.name, product.hsn, product.category, product.vehicle_make, product.vehicle_model,
          supplierId, product.purchase_price, product.selling_price, product.gst_rate, product.unit)
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(productResult.lastInsertRowid)
      }
      const taxable = round(line.quantity * line.unitCost)
      return { product, quantity: line.quantity, unitCost: line.unitCost, taxable, amount: taxable }
    })
    const count = db.prepare('SELECT COUNT(*) AS count FROM purchase_orders').get().count
    const number = optionalText(req.body.order_number, 50) || `PO-${String(count + 1).padStart(5, '0')}`
    const result = db.prepare(`
      INSERT INTO purchase_orders (order_number, supplier_id, supplier_name, order_date, expected_date, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(number, supplierId, supplier.name, orderDate, expectedDate, optionalText(req.body.notes))
    const insertItem = db.prepare(`
      INSERT INTO purchase_order_items (order_id, product_id, description, sku, quantity, unit_cost, gst_rate, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    lines.forEach((line) => insertItem.run(result.lastInsertRowid, line.product.id, line.product.name,
      line.product.sku, line.quantity, line.unitCost, 0, line.amount))
    return result.lastInsertRowid
  })()
  res.status(201).json(purchaseOrderDetails(orderId))
})

app.post('/api/purchase-orders/:id/receive', (req, res) => {
  const orderId = positiveOrZero(req.params.id, 'Purchase order ID', { allowZero: false })
  const suppliedInvoice = optionalText(req.body.supplier_invoice_number, 80)
  const invoiceDetails = req.body.invoice_details || {}
  const invoiceNumber = optionalText(req.body.invoice_file_name, 180)
  const invoiceType = optionalText(req.body.invoice_file_type, 120)
  const invoiceData = optionalText(req.body.invoice_file_data, 10_000_000)
  const receive = db.transaction(() => {
    const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(orderId)
    if (!order) throw new HttpError(404, 'Purchase order not found.')
    if (order.status !== 'Ordered') throw new HttpError(409, 'Only an open purchase order can be received.')
    const items = db.prepare('SELECT * FROM purchase_order_items WHERE order_id = ? ORDER BY id').all(orderId)
    if (!items.length) throw new HttpError(400, 'The purchase order has no items.')
    const supplier = db.prepare('SELECT place_of_supply FROM suppliers WHERE id = ?').get(order.supplier_id)
    const purchaseLines = items.map((item) => {
      const taxable = round(item.quantity * item.unit_cost)
      return {
        ...item, taxable,
        cgst: 0, sgst: 0, igst: 0,
      }
    })
    const orderTotals = documentTotals(purchaseLines, supplier?.place_of_supply || 'Maharashtra')
    const numberFromInvoice = (value, label) => value === '' || value === undefined ? 0 : positiveOrZero(value, label)
    const totals = {
      taxable: numberFromInvoice(invoiceDetails.taxable_amount, 'Invoice taxable amount') || orderTotals.taxable,
      cgst: numberFromInvoice(invoiceDetails.cgst, 'Invoice CGST'),
      sgst: numberFromInvoice(invoiceDetails.sgst, 'Invoice SGST'),
      igst: numberFromInvoice(invoiceDetails.igst, 'Invoice IGST'),
      total: numberFromInvoice(invoiceDetails.total, 'Invoice total') || orderTotals.taxable,
    }
    const purchaseCount = db.prepare('SELECT COUNT(*) AS count FROM purchases').get().count
    const purchaseNumber = `PUR-${String(purchaseCount + 1).padStart(5, '0')}`
    const now = new Date()
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    const purchaseDate = validDate(req.body.purchase_date || localToday, 'Purchase date')
    const purchase = db.prepare(`
      INSERT INTO purchases (purchase_number, purchase_order_id, supplier_id, supplier_name,
        supplier_invoice_number, purchase_date, taxable_amount, cgst, sgst, igst, total,
        invoice_file_name, invoice_file_type, invoice_file_data, invoice_taxable_amount, invoice_cgst, invoice_sgst, invoice_igst, invoice_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(purchaseNumber, orderId, order.supplier_id, order.supplier_name,
      suppliedInvoice, purchaseDate, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.total,
      invoiceNumber, invoiceType, invoiceData, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.total)
    const insertItem = db.prepare(`
      INSERT INTO purchase_items (purchase_id, product_id, description, sku, quantity, unit_cost, gst_rate, taxable_amount, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const stock = db.prepare('UPDATE products SET stock = stock + ?, purchase_price = ? WHERE id = ?')
    const movement = db.prepare(`
      INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
      VALUES (?, ?, 'adjustment', ?)
    `)
    purchaseLines.forEach((line) => {
      insertItem.run(purchase.lastInsertRowid, line.product_id, line.description, line.sku,
        line.quantity, line.unit_cost, line.gst_rate, line.taxable, line.amount)
      const updated = stock.run(line.quantity, line.unit_cost, line.product_id)
      if (!updated.changes) throw new HttpError(409, `${line.description} no longer exists in inventory.`)
      movement.run(line.product_id, line.quantity, purchaseNumber)
    })
    db.prepare("UPDATE purchase_orders SET status = 'Received', purchase_id = ? WHERE id = ?")
      .run(purchase.lastInsertRowid, orderId)
    return purchase.lastInsertRowid
  })
  const purchaseId = receive()
  res.status(201).json(db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId))
})

app.get('/api/purchases', (_req, res) => res.json(listRows(`
  SELECT id, purchase_number, purchase_order_id, supplier_id, supplier_name,
    supplier_invoice_number, purchase_date, taxable_amount, cgst, sgst, igst,
    total, paid_amount, status, invoice_file_name, invoice_file_type
  FROM purchases ORDER BY purchase_date DESC, id DESC
`)))

app.get('/api/purchases/:id/invoice', (req, res) => {
  const id = positiveOrZero(req.params.id, 'Purchase ID', { allowZero: false })
  const purchase = db.prepare('SELECT invoice_file_name, invoice_file_type, invoice_file_data FROM purchases WHERE id = ?').get(id)
  if (!purchase || !purchase.invoice_file_data) throw new HttpError(404, 'Supplier invoice file not found.')
  const match = /^data:([^;]+);base64,(.+)$/.exec(purchase.invoice_file_data)
  if (!match) throw new HttpError(404, 'Supplier invoice file is invalid.')
  res.setHeader('Content-Type', purchase.invoice_file_type || match[1])
  res.setHeader('Content-Disposition', `inline; filename="${purchase.invoice_file_name || 'supplier-invoice'}"`)
  res.send(Buffer.from(match[2], 'base64'))
})

app.post('/api/purchases/:id/payments', (req, res) => {
  const purchaseId = positiveOrZero(req.params.id, 'Purchase ID', { allowZero: false })
  const amount = positiveOrZero(req.body.amount, 'Payment amount', { allowZero: false })
  const method = requiredText(req.body.method || 'Cash', 'Payment method', 40)
  const pay = db.transaction(() => {
    const purchase = db.prepare('SELECT id, total, paid_amount FROM purchases WHERE id = ?').get(purchaseId)
    if (!purchase) throw new HttpError(404, 'Purchase not found.')
    if (amount > round(purchase.total - purchase.paid_amount)) throw new HttpError(400, 'Payment cannot exceed the purchase balance.')
    db.prepare('INSERT INTO supplier_payments (purchase_id, amount, method, notes) VALUES (?, ?, ?, ?)')
      .run(purchaseId, amount, method, optionalText(req.body.notes))
    const paid = round(purchase.paid_amount + amount)
    const status = paid >= purchase.total ? 'Paid' : 'Partial'
    db.prepare('UPDATE purchases SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, purchaseId)
  })
  pay()
  res.json(db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId))
})

app.get('/api/quotations', (_req, res) => res.json(listRows(`
  SELECT q.* FROM quotations q ORDER BY q.quotation_date DESC, q.id DESC
`)))

app.get('/api/quotations/:id', (req, res) => {
  const id = positiveOrZero(req.params.id, 'Quotation ID', { allowZero: false })
  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id)
  if (!quotation) throw new HttpError(404, 'Quotation not found.')
  quotation.items = listRows('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id', id)
  quotation.shop = db.prepare('SELECT name, address, phone, email, gstin FROM shop WHERE id = 1').get()
  res.json(quotation)
})

app.post('/api/quotations', (req, res) => {
  const rawCustomerId = String(req.body.customer_id ?? '').trim()
  const customerId = rawCustomerId
    ? positiveOrZero(rawCustomerId, 'Customer', { allowZero: false })
    : null
  const customer = customerId ? db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) : null
  if (customerId && !customer) throw new HttpError(400, 'The selected customer no longer exists.')
  const prospect = customer || {
    name: requiredText(req.body.prospect_name, 'Prospect name'),
    phone: optionalText(req.body.prospect_phone, 40),
    email: optionalText(req.body.prospect_email, 120),
    address: optionalText(req.body.prospect_address, 500),
    gstin: optionalText(req.body.prospect_gstin, 15),
    place_of_supply: optionalText(req.body.prospect_place_of_supply || 'Maharashtra', 80),
  }
  const quotationDate = validDate(req.body.quotation_date, 'Quotation date')
  const validUntil = req.body.valid_until ? validDate(req.body.valid_until, 'Valid until') : ''
  if (validUntil && validUntil < quotationDate) throw new HttpError(400, 'Validity date cannot be before the quotation date.')
  const place = optionalText(req.body.place_of_supply || prospect.place_of_supply || 'Maharashtra', 80)
  const input = req.body.items
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new HttpError(400, 'Add between 1 and 100 quotation items.')
  }
  const lines = input.map((item) => {
    const productId = positiveOrZero(item.product_id, 'Part', { allowZero: false })
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
    if (!product) throw new HttpError(400, 'A selected part no longer exists. Refresh and try again.')
    const quantity = quantityForUnit(item.quantity, `${product.name} quantity`, product.unit)
    const unitPrice = item.unit_price === undefined || item.unit_price === ''
      ? product.selling_price
      : positiveOrZero(item.unit_price, `${product.name} price`)
    const taxable = round(quantity * unitPrice)
    const tax = round(taxable * product.gst_rate / 100)
    const intraState = isIntraState(place)
    return {
      product, quantity, unitPrice, taxable,
      cgst: intraState ? round(tax / 2) : 0,
      sgst: intraState ? round(tax - round(tax / 2)) : 0,
      igst: intraState ? 0 : tax,
      amount: round(taxable + tax),
    }
  })
  const totals = documentTotals(lines, place)
  const quotationId = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM quotations').get().count
    const number = optionalText(req.body.quotation_number, 50) || `QUO-${String(count + 1).padStart(5, '0')}`
    const result = db.prepare(`
      INSERT INTO quotations (quotation_number, customer_id, customer_name, customer_phone,
        customer_email, customer_address, customer_gstin, place_of_supply, quotation_date, valid_until, notes,
        taxable_amount, cgst, sgst, igst, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(number, customerId, prospect.name, prospect.phone, prospect.email, prospect.address, prospect.gstin,
      place, quotationDate, validUntil, optionalText(req.body.notes), totals.taxable,
      totals.cgst, totals.sgst, totals.igst, totals.total)
    const insertItem = db.prepare(`
      INSERT INTO quotation_items (quotation_id, product_id, description, hsn, quantity, unit,
        unit_price, gst_rate, taxable_amount, cgst, sgst, igst, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    lines.forEach((line) => insertItem.run(result.lastInsertRowid, line.product.id, line.product.name,
      line.product.hsn, line.quantity, line.product.unit, line.unitPrice, line.product.gst_rate,
      line.taxable, line.cgst, line.sgst, line.igst, line.amount))
    return result.lastInsertRowid
  })()
  res.status(201).json(db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId))
})

app.post('/api/quotations/:id/convert', (req, res) => {
  const quotationId = positiveOrZero(req.params.id, 'Quotation ID', { allowZero: false })
  const convert = db.transaction(() => {
    const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId)
    if (!quotation) throw new HttpError(404, 'Quotation not found.')
    if (quotation.status !== 'Open') throw new HttpError(409, 'Only an open quotation can be converted.')
    let customerId = quotation.customer_id
    if (!customerId) {
      const customerResult = db.prepare(`
        INSERT INTO customers (name, phone, email, address, gstin, place_of_supply)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(quotation.customer_name, quotation.customer_phone, quotation.customer_address,
        quotation.customer_email, quotation.customer_gstin, quotation.place_of_supply)
      customerId = customerResult.lastInsertRowid
    }
    const lines = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(quotationId)
    if (!lines.length) throw new HttpError(400, 'The quotation has no items.')
    const products = lines.map((line) => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.product_id)
      if (!product) throw new HttpError(409, `${line.description} no longer exists in inventory.`)
      if (line.quantity > product.stock) throw new HttpError(409, `${product.name} has only ${product.stock} ${product.unit} in stock.`)
      return { line, product }
    })
    const count = db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count
    const invoiceNumber = optionalText(req.body.invoice_number, 50)
      || `INV-${quotation.quotation_date.slice(2, 4)}/${String(count + 1).padStart(4, '0')}`
    const invoice = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name, customer_phone,
        customer_email, customer_address, customer_gstin, invoice_date, place_of_supply, notes,
        taxable_amount, cgst, sgst, igst, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceNumber, customerId, quotation.customer_name, quotation.customer_phone, quotation.customer_email,
      quotation.customer_address, quotation.customer_gstin, quotation.quotation_date, quotation.place_of_supply, quotation.notes,
      quotation.taxable_amount, quotation.cgst, quotation.sgst, quotation.igst, quotation.total)
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_id, description, hsn, quantity, unit,
        unit_price, cost_price, gst_rate, taxable_amount, cgst, sgst, igst, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
    const movement = db.prepare(`
      INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
      VALUES (?, ?, 'sale', ?)
    `)
    products.forEach(({ line, product }) => {
      insertItem.run(invoice.lastInsertRowid, product.id, line.description, line.hsn,
        line.quantity, line.unit, line.unit_price, product.purchase_price, line.gst_rate,
        line.taxable_amount, line.cgst, line.sgst, line.igst, line.taxable_amount)
      const updated = updateStock.run(line.quantity, product.id, line.quantity)
      if (!updated.changes) throw new HttpError(409, `${product.name} stock changed. Refresh and try again.`)
      movement.run(product.id, -line.quantity, invoiceNumber)
    })
    db.prepare("UPDATE quotations SET status = 'Converted', invoice_id = ? WHERE id = ?")
      .run(invoice.lastInsertRowid, quotationId)
    return invoice.lastInsertRowid
  })
  res.status(201).json(invoiceDetails(convert()))
})

app.get('/api/dues', (_req, res) => {
  const customer = db.prepare(`
    SELECT COALESCE(SUM(total - paid_amount), 0) AS total FROM invoices
    WHERE total > paid_amount
  `).get()
  const supplier = db.prepare(`
    SELECT COALESCE(SUM(total - paid_amount), 0) AS total FROM purchases
    WHERE total > paid_amount
  `).get()
  res.json({
    customer_total: round(customer.total),
    supplier_total: round(supplier.total),
    customer_outstanding: listRows(`
      SELECT customer_id, customer_name, ROUND(SUM(total - paid_amount), 2) AS balance
      FROM invoices WHERE total > paid_amount GROUP BY customer_id, customer_name
      ORDER BY balance DESC, customer_name COLLATE NOCASE
    `),
    supplier_outstanding: listRows(`
      SELECT supplier_id, supplier_name, ROUND(SUM(total - paid_amount), 2) AS balance
      FROM purchases WHERE total > paid_amount GROUP BY supplier_id, supplier_name
      ORDER BY balance DESC, supplier_name COLLATE NOCASE
    `),
  })
})

app.put('/api/shop', (req, res) => {
  const fields = {
    name: requiredText(req.body.name, 'Business name'),
    address: requiredText(req.body.address, 'Business address'),
    phone: optionalText(req.body.phone, 40),
    email: optionalText(req.body.email, 120),
    gstin: optionalText(req.body.gstin, 15).toUpperCase(),
    bank_name: optionalText(req.body.bank_name, 100),
    bank_branch: optionalText(req.body.bank_branch, 100),
    account_number: optionalText(req.body.account_number, 40),
    ifsc: optionalText(req.body.ifsc, 20).toUpperCase(),
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(400, 'Enter a valid email address.')
  if (fields.gstin && !/^[0-9A-Z]{15}$/.test(fields.gstin)) throw new HttpError(400, 'GSTIN must contain 15 letters or numbers.')
  db.prepare(`
    UPDATE shop SET name = @name, address = @address, phone = @phone, email = @email,
      gstin = @gstin, bank_name = @bank_name, bank_branch = @bank_branch,
      account_number = @account_number, ifsc = @ifsc WHERE id = 1
  `).run(fields)
  res.json(db.prepare('SELECT * FROM shop WHERE id = 1').get())
})

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must contain valid JSON.' })
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That value is already in use. Check the invoice number or SKU.' })
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'The selected customer, supplier, or part no longer exists.' })
  console.error(error)
  return res.status(500).json({ error: 'The request could not be completed. Please try again.' })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))

const staticDirectory = path.join(projectRoot, 'dist')
app.use(express.static(staticDirectory, { index: false }))
app.get('*', (req, res, next) => {
  if (!req.accepts('html')) return next()
  res.sendFile(path.join(staticDirectory, 'index.html'), (error) => {
    if (error) next(error)
  })
})

const port = Number(process.env.PORT || 3001)
const configuredHost = process.env.HOST?.trim()
const host = configuredHost === '[::]' ? '0.0.0.0'
  : configuredHost || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
app.listen(port, host, () => {
  console.log(`Mahalaxmi Automobiles API listening on http://${host}:${port}`)
  console.log(`SQLite database: ${databasePath}`)
})
