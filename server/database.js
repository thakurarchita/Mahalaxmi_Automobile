import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.dirname(serverDirectory)
export const dataDirectory = path.join(projectRoot, 'data')
export const databasePath = path.resolve(
  process.env.DATABASE_PATH || path.join(dataDirectory, 'mahalaxmi-automobiles.sqlite'),
)

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', gstin TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '', bank_branch TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '', ifsc TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO shop (id, name, address, phone, email, gstin, bank_name, bank_branch, account_number, ifsc)
  VALUES (1, 'MAHALAXMI AUTOMOBILES', 'Near Ambedkar Putla, Opp. Bhagat Singh Garden, Kolap Building, Ichalkaranji 416115, Maharashtra, India', '9822682476', 'mahalaxmiauto@gmail.com', '27AKEPM1058Q1ZR', '', '', '', '');
  UPDATE shop
  SET address = 'Near Ambedkar Putla, Opp. Bhagat Singh Garden, Kolap Building, Ichalkaranji 416115, Maharashtra, India'
  WHERE id = 1 AND address = 'Near Ambedkar Putla, Ner, Taluka Indapur, Pune 411515';
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    gstin TEXT NOT NULL DEFAULT '', place_of_supply TEXT NOT NULL DEFAULT 'Maharashtra',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    gstin TEXT NOT NULL DEFAULT '', place_of_supply TEXT NOT NULL DEFAULT 'Maharashtra',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    hsn TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
    vehicle_make TEXT NOT NULL DEFAULT 'Universal', vehicle_model TEXT NOT NULL DEFAULT 'All models',
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
    selling_price REAL NOT NULL CHECK (selling_price >= 0),
    gst_rate REAL NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),
    stock REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
    reorder_level REAL NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    unit TEXT NOT NULL DEFAULT 'pcs',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '', customer_address TEXT NOT NULL DEFAULT '',
    customer_gstin TEXT NOT NULL DEFAULT '',
    invoice_date TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '',
    dispatched_through TEXT NOT NULL DEFAULT '', vehicle_number TEXT NOT NULL DEFAULT '',
    vehicle_model TEXT NOT NULL DEFAULT '', engine_number TEXT NOT NULL DEFAULT '',
    place_of_supply TEXT NOT NULL DEFAULT 'Maharashtra', notes TEXT NOT NULL DEFAULT '',
    taxable_amount REAL NOT NULL, cgst REAL NOT NULL DEFAULT 0,
    sgst REAL NOT NULL DEFAULT 0, igst REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Partial', 'Unpaid')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL, hsn TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL CHECK (quantity > 0), unit TEXT NOT NULL DEFAULT 'pcs',
    unit_price REAL NOT NULL CHECK (unit_price >= 0), cost_price REAL NOT NULL DEFAULT 0,
    gst_rate REAL NOT NULL DEFAULT 18, taxable_amount REAL NOT NULL,
    cgst REAL NOT NULL DEFAULT 0, sgst REAL NOT NULL DEFAULT 0,
    igst REAL NOT NULL DEFAULT 0, amount REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount > 0), method TEXT NOT NULL DEFAULT 'Cash',
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL, movement_type TEXT NOT NULL CHECK (movement_type IN ('opening', 'sale', 'adjustment')),
    reference TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY, order_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    supplier_name TEXT NOT NULL, order_date TEXT NOT NULL,
    expected_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Ordered' CHECK (status IN ('Ordered', 'Received', 'Cancelled')),
    purchase_id INTEGER UNIQUE REFERENCES purchases(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    description TEXT NOT NULL, sku TEXT NOT NULL, quantity REAL NOT NULL CHECK (quantity > 0),
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0), gst_rate REAL NOT NULL DEFAULT 18,
    amount REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY, purchase_number TEXT NOT NULL UNIQUE,
    purchase_order_id INTEGER UNIQUE REFERENCES purchase_orders(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id), supplier_name TEXT NOT NULL,
    supplier_invoice_number TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL,
    taxable_amount REAL NOT NULL, cgst REAL NOT NULL DEFAULT 0, sgst REAL NOT NULL DEFAULT 0,
    igst REAL NOT NULL DEFAULT 0, total REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Partial', 'Unpaid')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL, sku TEXT NOT NULL, quantity REAL NOT NULL CHECK (quantity > 0),
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0), gst_rate REAL NOT NULL DEFAULT 18,
    taxable_amount REAL NOT NULL, amount REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount > 0), method TEXT NOT NULL DEFAULT 'Cash',
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY, quotation_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id), customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL DEFAULT '', customer_address TEXT NOT NULL DEFAULT '',
    customer_gstin TEXT NOT NULL DEFAULT '', place_of_supply TEXT NOT NULL DEFAULT 'Maharashtra',
    quotation_date TEXT NOT NULL, valid_until TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    taxable_amount REAL NOT NULL, cgst REAL NOT NULL DEFAULT 0, sgst REAL NOT NULL DEFAULT 0,
    igst REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Converted', 'Cancelled')),
    invoice_id INTEGER UNIQUE REFERENCES invoices(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY, quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL, hsn TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL CHECK (quantity > 0), unit TEXT NOT NULL DEFAULT 'pcs',
    unit_price REAL NOT NULL CHECK (unit_price >= 0), gst_rate REAL NOT NULL DEFAULT 18,
    taxable_amount REAL NOT NULL, cgst REAL NOT NULL DEFAULT 0, sgst REAL NOT NULL DEFAULT 0,
    igst REAL NOT NULL DEFAULT 0, amount REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS owner_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    owner_name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS owner_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices(invoice_date);
  CREATE INDEX IF NOT EXISTS invoice_items_product_idx ON invoice_items(product_id);
`)

const supplierColumns = new Set(db.prepare('PRAGMA table_info(suppliers)').all().map((column) => column.name))
if (!supplierColumns.has('place_of_supply')) {
  db.exec("ALTER TABLE suppliers ADD COLUMN place_of_supply TEXT NOT NULL DEFAULT 'Maharashtra'")
}

const productColumns = new Set(db.prepare('PRAGMA table_info(products)').all().map((column) => column.name))
if (!productColumns.has('vehicle_make')) {
  db.exec("ALTER TABLE products ADD COLUMN vehicle_make TEXT NOT NULL DEFAULT 'Universal'")
}
if (!productColumns.has('vehicle_model')) {
  db.exec("ALTER TABLE products ADD COLUMN vehicle_model TEXT NOT NULL DEFAULT 'All models'")
}

if (db.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0) {
  const demoParts = [
    ['DEMO-MSU-001', 'Engine air filter', '87089900', 'Filters', 'Maruti Suzuki', 'Swift (2018–2023)', 320, 480, 18, 8, 3],
    ['DEMO-MSU-002', 'Oil filter', '84212300', 'Filters', 'Maruti Suzuki', 'Swift (2018–2023)', 180, 280, 18, 10, 4],
    ['DEMO-MSU-003', 'Front brake pad set', '87083000', 'Brakes', 'Maruti Suzuki', 'Swift (2018–2023)', 850, 1250, 18, 5, 2],
    ['DEMO-HY-001', 'Engine air filter', '87089900', 'Filters', 'Hyundai', 'i20 (2018–2023)', 350, 520, 18, 6, 2],
    ['DEMO-HY-002', 'Front brake pad set', '87083000', 'Brakes', 'Hyundai', 'i20 (2018–2023)', 920, 1390, 18, 4, 2],
    ['DEMO-TATA-001', 'Clutch plate assembly', '87089300', 'Clutch', 'Tata', 'Ace Gold', 2450, 3250, 18, 2, 2],
    ['DEMO-HON-001', 'Drive belt', '40103900', 'Transmission', 'Honda', 'Activa 6G', 390, 620, 18, 7, 3],
    ['DEMO-HON-002', 'Rear brake shoe set', '87141090', 'Brakes', 'Honda', 'Activa 6G', 210, 350, 18, 3, 2],
    ['DEMO-HERO-001', 'Chain sprocket kit', '87141090', 'Transmission', 'Hero', 'Splendor Plus', 680, 980, 18, 5, 2],
    ['DEMO-BAJ-001', 'Clutch cable', '87141090', 'Cables', 'Bajaj', 'Pulsar 150', 110, 190, 18, 1, 2],
    ['DEMO-MAH-001', 'Oil filter', '84212300', 'Filters', 'Mahindra', 'Bolero', 240, 360, 18, 3, 2],
    ['DEMO-UNI-001', 'Universal engine oil 1L', '27101980', 'Fluids', 'Universal', 'All models', 280, 390, 18, 12, 4],
  ]
  const insertDemoPart = db.prepare(`
    INSERT INTO products (sku, name, hsn, category, vehicle_make, vehicle_model,
      purchase_price, selling_price, gst_rate, stock, reorder_level, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pcs')
  `)
  const seedDemoParts = db.transaction(() => {
    for (const part of demoParts) {
      const result = insertDemoPart.run(...part)
      const product = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(result.lastInsertRowid)
      db.prepare(`
        INSERT INTO stock_movements (product_id, quantity, movement_type, reference)
        VALUES (?, ?, 'opening', 'DEMO DATA - replace with verified stock')
      `).run(product.id, product.stock)
    }
  })
  seedDemoParts()
  console.info('Inserted clearly marked DEMO- parts into the empty inventory.')
}
