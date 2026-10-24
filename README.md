# Mahalaxmi Automobiles Business Desk

A small internal sales and inventory application for Mahalaxmi Automobiles. It stores records in a local SQLite database and creates GST invoices in the format of the supplied bill.

## Run locally

1. Install Node.js 20 or later.
2. From this folder, run `npm install`.
3. In one terminal, run `npm run server` to start the API and initialize `data/mahalaxmi-automobiles.sqlite`.
4. In a second terminal, run `npm run dev` and open the local Vite URL it prints.
5. On first use, create the owner account and choose a password of at least 12 characters.

The Vite development server forwards `/api` requests to the backend on port 3001. Keep the API process running while using the app. Set `PORT` to change the API port.
The API uses an HTTP-only, same-site owner session cookie and expires sessions after 8 hours. It listens only on `127.0.0.1` by default. For a deployment, configure the host's port and set `HOST=0.0.0.0` when the platform requires the application to bind to its network interface.

Password recovery sends a one-time code to the owner recovery email saved in **Settings**; codes are never printed in the terminal. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` as environment variables in the deployment platform. `SMTP_SECURE=true` enables secure SMTP (it is enabled automatically on port 465). Set a valid owner email in Settings and configure SMTP before deploying. Codes expire after 10 minutes.

## Online setup for a small business

The included `render.yaml` prepares a private Node.js web service with a persistent disk for the SQLite business database. The persistent disk requires a paid Render service; do not switch a live business to free hosting that can sleep or discard local files.

1. Create a Render account, choose **New → Blueprint**, and connect `thakurarchita/Mahalaxmi_Automobile`.
2. Review the service and persistent disk in `render.yaml`. Complete the `SMTP_USER` and `SMTP_PASS` prompts with the Gmail sender account and its Google App Password. Do not use your normal Gmail password or put secrets in GitHub.
3. In Google Account security, enable 2-Step Verification and create an App Password for the app. If Google Workspace does not allow App Passwords, use an approved SMTP sender instead.
4. After deployment, open the Render-provided HTTPS website and complete owner setup. In **Settings**, save the email address where password recovery codes should be received. The `SMTP_USER` address sends the email; the Settings email receives it.
5. Test login, request a recovery code, and confirm it arrives before relying on recovery.

The hosted database starts separately from the SQLite file on your computer. If your local database already contains real business records, do not start using the hosted app until those records have been backed up and securely transferred to its persistent disk. Never upload the SQLite file to this public GitHub repository. Keep a separate backup of the hosted database.

## First use

Add customers and suppliers, then add parts with their HSN/SAC, cost, sale price, GST rate and opening stock. Select a customer and parts on a new invoice; the part's description, HSN, GST and sale price are filled from inventory. Invoice creation checks stock and GSTIN/place of supply, calculates CGST + SGST for Maharashtra or IGST for other states, saves the invoice and reduces stock in one database transaction.

On a new, empty inventory, the API adds clearly marked `DEMO-` sample parts for a few makes and models so the screens can be explored. These sample fitments and quantities are illustrative: edit or replace them with verified parts and stock before using the system for real sales. Existing inventory is never overwritten or seeded again.

The dashboard reports sales, cost of goods sold, gross profit/loss, outstanding invoices, inventory value, contacts, best/lowest selling parts and stock at reorder level. Its local stock-demand estimate uses each part's recorded sales over the last 90 days; it is a simple forecast, not an external AI service, and is not shown as a reliable prediction until sales history exists. The Reports screen groups sales and purchases by day, week, month or year, compares purchase bills and balances by supplier, and provides full-history, Excel (.xlsx), PDF and CSV exports. The Excel export includes a readable, correctly sized date column; the CSV export keeps dates in ISO format (YYYY-MM-DD). Gross profit excludes operating costs such as wages, rent and tax. Business and bank details printed on invoices can be changed in Settings. The default business address is Near Ambedkar Putla, Opp. Bhagat Singh Garden, Kolap Building, Ichalkaranji 416115, Maharashtra, India; phone and other profile details remain editable in Settings.

Invoices, purchase orders and quotations can be previewed and printed from their lists. To download a PDF, choose the print/download action, then select **Save as PDF** in the browser's print dialog.

The Buying workflow supports purchase orders, receiving ordered stock, supplier purchases and supplier payments. Create a supplier from the purchase-order form when needed; the supplier and order are saved together. The order displays each part's usual supplier when one is recorded. Receiving an order creates a purchase bill and updates part stock in a single transaction. Quotations save customer estimates and can be converted to invoices; conversion validates current stock, records the invoice, and deducts inventory atomically. Payments & Dues separates customer payments to collect from supplier bills to pay and links each group to the records where payments are entered.

## Data and validation

SQLite data is kept at `data/mahalaxmi-automobiles.sqlite` inside this project folder (for example, `C:\Users\archi\Downloads\autoflow-react (1)\autoflow\data\mahalaxmi-automobiles.sqlite`). The database and its journal files are created when `npm run server` starts; its exact location is also printed in the API terminal. Back up the `.sqlite` file to preserve business records. Set `DATABASE_PATH` before starting the API to choose a different local database file. Purchase workflows use `purchase_orders`, `purchase_order_items`, `purchases`, `purchase_items` and `supplier_payments`; quotations use `quotations` and `quotation_items`; customer and supplier balances are calculated from invoice and purchase payment records. The API validates required fields, dates, GSTIN shape, numeric values, stock availability, invoice totals and payment balances on the server; browser form validation is an additional convenience.

## Project structure

- `src/api/` contains the frontend API client and response handling.
- `src/features/auth/` contains owner setup, login and password recovery screens.
- `src/App.jsx` and `src/features/` contain the business workspace and feature screens.
- `server/database.js` initializes and migrates the SQLite schema and sample inventory.
- `server/auth.js` implements owner setup, sessions and password recovery.
- `server.js` registers the business API and starts the local server.
