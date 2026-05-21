const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

// ============================================================
// MONGODB CONNECTIONS - TWO SEPARATE DATABASES
// ============================================================

// Database 1: Read-Only Orders Source
const ORDERS_DB_URI = process.env.MONGODB_URI_ORDERS || 'mongodb://localhost:27017/orders_db';
const ordersConn = mongoose.createConnection(ORDERS_DB_URI);

ordersConn.on('connected', () => console.log('Connected to ORDERS database (Read-Only)'));
ordersConn.on('error', (err) => console.error('Orders DB connection error:', err));

// Database 2: Read-Write Balance Sheet
const BALANCE_DB_URI = process.env.MONGODB_URI_BALANCE || 'mongodb://localhost:27017/balancesheet_db';
const balanceConn = mongoose.createConnection(BALANCE_DB_URI);

balanceConn.on('connected', () => console.log('Connected to BALANCE SHEET database (Read-Write)'));
balanceConn.on('error', (err) => console.error('Balance Sheet DB connection error:', err));

// ============================================================
// SCHEMAS & MODELS
// ============================================================

const ItemSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

// Attach models to their specific database connections
const OrderModel = ordersConn.model('Order', ItemSchema, 'orders');

const IncomeModel = balanceConn.model('Income', ItemSchema, 'income');
const ExpenseModel = balanceConn.model('Expense', ItemSchema, 'expenses');

// Map for dynamic routing on the balance sheet DB
const balanceModels = {
  income: IncomeModel,
  expenses: ExpenseModel,
};

// ============================================================
// API ROUTES
// ============================================================

// --- Orders Routes (Read-Only from Orders DB) ---
app.get('/api/orders', async (req, res) => {
  try {
    const items = await OrderModel.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed initial orders if empty
app.get('/api/seed/orders', async (req, res) => {
  try {
    const count = await OrderModel.countDocuments();
    if (count === 0) {
      const sampleOrders = [
        { orderNo: 'ORD-2024-001', date: '2024-12-02', customer: 'Acme Corporation', amount: 12500 },
        { orderNo: 'ORD-2024-002', date: '2024-12-04', customer: 'TechStart LLC', amount: 8750 },
        { orderNo: 'ORD-2024-003', date: '2024-12-07', customer: 'Global Industries', amount: 24000 },
      ];
      await OrderModel.insertMany(sampleOrders);
      res.json({ message: 'Seeded 3 orders to Orders DB' });
    } else {
      res.json({ message: 'Orders already exist in Orders DB' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Balance Sheet Routes (Read-Write on Balance Sheet DB) ---

// Get all items from a balance sheet collection
app.get('/api/:collection', async (req, res) => {
  try {
    const Model = balanceModels[req.params.collection];
    if (!Model) return res.status(400).json({ error: 'Invalid collection' });
    const items = await Model.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new item
app.post('/api/:collection', async (req, res) => {
  try {
    const Model = balanceModels[req.params.collection];
    if (!Model) return res.status(400).json({ error: 'Invalid collection' });
    const newItem = new Model(req.body);
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Sync (Used by the frontend auto-save)
app.post('/api/:collection/sync', async (req, res) => {
  try {
    const Model = balanceModels[req.params.collection];
    if (!Model) return res.status(400).json({ error: 'Invalid collection' });
    
    await Model.deleteMany({});
    if (req.body.length > 0) {
      await Model.insertMany(req.body);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an item
app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const Model = balanceModels[req.params.collection];
    if (!Model) return res.status(400).json({ error: 'Invalid collection' });
    await Model.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
