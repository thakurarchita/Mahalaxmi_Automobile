import { Boxes, ClipboardList, CircleDollarSign, FileBarChart, LayoutDashboard, Receipt, Settings, ShoppingCart, Truck, Users, WalletCards } from 'lucide-react'

export const nav = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { group: 'Buying' },
  { label: 'Suppliers', icon: Truck },
  { label: 'Purchase Orders', icon: ClipboardList },
  { label: 'Purchases', icon: ShoppingCart },
  { group: 'Workshop' },
  { label: 'Inventory', icon: Boxes },
  { label: 'Customers', icon: Users },
  { group: 'Selling' },
  { label: 'Quotations', icon: WalletCards },
  { label: 'Sales', icon: Receipt },
  { label: 'Invoices', icon: Receipt },
  { group: 'Money' },
  { label: 'Payments & Dues', icon: CircleDollarSign },
  { label: 'Reports', icon: FileBarChart },
  { label: 'Settings', icon: Settings },
]
