const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/balancesheet';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Flexible Schema for our collections
const ItemSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const models = {
  orders: mongoose.model('Order', ItemSchema, 'orders'),
  income: mongoose.model('Income', ItemSchema, 'income'),
  expenses: mongoose.model('Expense', ItemSchema, 'expenses'),
};

// --- API ROUTES ---

// Get all items from a collection
app.get('/api/:collection', async (req, res) => {
  try {
    const Model = models[req.params.collection];
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
    const Model = models[req.params.collection];
    if (!Model) return
