// ============================================================
// DATABASE SERVICE
// ============================================================
const DB = {
    async find(collection) {
        try {
            const res = await fetch(`/api/${collection}`);
            if (!res.ok) throw new Error('Fetch failed');
            return await res.json();
        } catch (err) {
            console.error(`DB.find error [${collection}]:`, err);
            return [];
        }
    },
    async saveAll(collection, docs) {
        try {
            const res = await fetch(`/api/${collection}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docs)
            });
            return res.ok;
        } catch (err) {
            console.error(`DB.saveAll error [${collection}]:`, err);
            return false;
        }
    },
    async insertOne(collection, doc) {
        try {
            const res = await fetch(`/api/${collection}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(doc)
            });
            if (!res.ok) throw new Error('Insert failed');
            return await res.json();
        } catch (err) {
            console.error(`DB.insertOne error [${collection}]:`, err);
            return null;
        }
    },
    async deleteOne(collection, id) {
        try {
            const res = await fetch(`/api/${collection}/${id}`, { method: 'DELETE' });
            return res.ok;
        } catch (err) {
            console.error(`DB.deleteOne error [${collection}]:`, err);
            return false;
        }
    }
};

// ============================================================
// APPLICATION STATE
// ============================================================
const state = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    saveTimeout: null,
    incomeData: [],
    expenseData: [],
    orderData: [],
    // NEW: Sorting State
    incomeSort: 'desc', // 'desc' = Newest first, 'asc' = Oldest first
    expenseSort: 'desc'
};

// Variable to hold the Auto-Sync Timer
let autoSyncInterval = null;

// ============================================================
// UTILITIES
// ============================================================
function formatCurrency(amount) {
    return 'NPR ' + (parseFloat(amount) || 0).toLocaleString('en-NP');
}
function getMonthLabel() {
    const m = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${m[state.currentMonth]} ${state.currentYear}`;
}
function isDateInMonth(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getFullYear() === state.currentYear && d.getMonth() === state.currentMonth;
}
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// SORTING LOGIC
// ============================================================
function toggleSort(type) {
    if (type === 'income') {
        // Toggle between asc and desc
        state.incomeSort = state.incomeSort === 'asc' ? 'desc' : 'asc';
        renderIncomeEntries();
    } else {
        state.expenseSort = state.expenseSort === 'asc' ? 'desc' : 'asc';
        renderExpenseEntries();
    }
}

// ============================================================
// SYNCING LOGIC
// ============================================================
async function autoSyncOrders() {
    console.log("Syncing orders...");
    const freshOrders = await DB.find('orders');

    const existingKeys = new Set(state.incomeData.map(e => e.uniqueKey));
    let itemsAddedCount = 0;

    if (freshOrders && Array.isArray(freshOrders)) {
        for (const order of freshOrders) {
            if (order.items && Array.isArray(order.items)) {
                const orderDate = order.timestamp ? new Date(order.timestamp).toISOString().split('T')[0] : todayStr();
                const shortOrderId = String(order._id).substring(0, 8);

                for (const item of order.items) {
                    const itemKey = `${order._id}_${item.id || item.name}`;
                    
                    if (!existingKeys.has(itemKey)) {
                        const newEntry = await DB.insertOne('income', {
                            date: orderDate,
                            product: item.name || 'Unknown Item',
                            form: item.form || '',
                            qtyUnit: `${item.qty || 1} ${item.unit || ''}`,
                            amount: (item.qty || 1) * (item.price || 0),
                            uniqueKey: itemKey,
                            orderNo: shortOrderId
                        });
                        
                        if (newEntry) {
                            state.incomeData.push(newEntry);
                            itemsAddedCount++;
                        }
                    }
                }
            }
        }
    }

    if (itemsAddedCount > 0) {
        showToast(`Synced ${itemsAddedCount} new item(s)`, 'success');
        renderIncomeEntries();
        updateSummary();
    } else {
        console.log("No new items found.");
    }
}

async function manualSync() {
    const btn = document.getElementById('syncBtn');
    const icon = btn.querySelector('i');
    icon.classList.add('fa-spin');
    btn.disabled = true;
    
    await autoSyncOrders();
    
    icon.classList.remove('fa-spin');
    btn.disabled = false;
    showToast('Sync complete', 'info');
}

// ============================================================
// AUTO SYNC TOGGLE LOGIC
// ============================================================
function toggleAutoSync(isEnabled) {
    if (isEnabled) {
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        autoSyncOrders();
        autoSyncInterval = setInterval(autoSyncOrders, 300000);
        showToast('Auto-sync enabled (Every 5 min)', 'success');
    } else {
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
        }
        showToast('Auto-sync disabled', 'info');
    }
}

// ============================================================
// RENDERING (TABLE VIEW) WITH SORTING
// ============================================================
function renderMonthLabel() { document.getElementById('monthLabel').textContent = getMonthLabel(); }

function renderIncomeEntries() {
    const container = document.getElementById('incomeEntries');
    
    // 1. Filter by month
    let entries = state.incomeData.filter(e => isDateInMonth(e.date));

    // 2. Sort by Date
    const sortDir = state.incomeSort === 'asc' ? 1 : -1;
    entries.sort((a, b) => {
        // Handle empty dates by pushing them to the end
        if (!a.date) return 1; 
        if (!b.date) return -1;
        return (new Date(a.date) - new Date(b.date)) * sortDir;
    });

    // 3. Determine Icon
    const sortIcon = state.incomeSort === 'asc' ? 'fa-sort-up' : 'fa-sort-down';

    if (entries.length === 0) {
        container.innerHTML = `<div class="empty-state py-10" style="text-align:center; color:var(--text-muted);">No income this month. Click Add Income or Sync.</div>`;
        return;
    }

    let html = `
    <div class="table-header">
        <!-- Clickable Date Header -->
        <span onclick="toggleSort('income')" style="cursor:pointer; user-select: none;">
            Date <i class="fa-solid ${sortIcon}" style="font-size: 10px; opacity: 0.7;"></i>
        </span>
        <span>Product Name</span>
        <span>Details (Form / Qty)</span>
        <span style="text-align:right;">Amount</span>
        <span></span>
    </div>
    `;

    html += `<div class="table-view-container">`;
    
    entries.forEach(entry => {
        html += `
        <div class="entry-row" data-entry-id="${entry._id}">
            <input type="date" class="bs-input-plain" data-field="date" value="${entry.date ? entry.date.split('T')[0] : ''}">
            <input type="text" class="bs-input-plain" data-field="product" value="${escapeHtml(entry.product)}" placeholder="Product Name">
            <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                ${entry.form ? `<span class="detail-tag">${escapeHtml(entry.form)}</span>` : ''}
                <span style="font-size:12px; color:var(--text-secondary);">${escapeHtml(entry.qtyUnit)}</span>
            </div>
            <input type="number" class="bs-input-plain" data-field="amount" style="text-align:right;" value="${entry.amount || ''}" placeholder="0">
            <button onclick="deleteEntry('income','${entry._id}')" style="color:var(--text-muted); background:none; border:none; cursor:pointer; opacity:0.5;" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function renderExpenseEntries() {
    const container = document.getElementById('expenseEntries');
    
    // 1. Filter by month
    let entries = state.expenseData.filter(e => isDateInMonth(e.date));

    // 2. Sort by Date
    const sortDir = state.expenseSort === 'asc' ? 1 : -1;
    entries.sort((a, b) => {
        if (!a.date) return 1; 
        if (!b.date) return -1;
        return (new Date(a.date) - new Date(b.date)) * sortDir;
    });

    // 3. Determine Icon
    const sortIcon = state.expenseSort === 'asc' ? 'fa-sort-up' : 'fa-sort-down';

    if (entries.length === 0) {
        container.innerHTML = `<div class="empty-state py-8" style="text-align:center; color:var(--text-muted)">No expenses this month</div>`;
        return;
    }
    
    let html = `
    <div class="table-header" style="grid-template-columns: 110px 1fr 120px 30px;">
        <!-- Clickable Date Header -->
        <span onclick="toggleSort('expense')" style="cursor:pointer; user-select: none;">
            Date <i class="fa-solid ${sortIcon}" style="font-size: 10px; opacity: 0.7;"></i>
        </span>
        <span>Expense Head</span>
        <span style="text-align:right;">Amount</span>
        <span></span>
    </div>
    <div class="table-view-container">`;

    html += entries.map(entry => `
        <div class="entry-row" style="grid-template-columns: 110px 1fr 120px 30px;" data-entry-id="${entry._id}">
            <input type="date" class="bs-input-plain" data-field="date" value="${entry.date ? entry.date.split('T')[0] : ''}">
            <input type="text" class="bs-input-plain" data-field="head" value="${escapeHtml(entry.head || '')}" placeholder="Head...">
            <input type="number" class="bs-input-plain" data-field="amount" style="text-align:right;" value="${entry.amount || ''}" placeholder="0">
            <button onclick="deleteEntry('expense','${entry._id}')" style="color:var(--text-muted); background:none; border:none; cursor:pointer; opacity:0.5;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
    
    html += `</div>`;
    container.innerHTML = html;
}

// ============================================================
// ACTIONS & SAVE
// ============================================================
async function addIncomeEntry() {
    const newEntry = await DB.insertOne('income', { date: todayStr(), product: '', form: '', qtyUnit: '', amount: 0 });
    if (newEntry) {
        state.incomeData.push(newEntry);
        renderIncomeEntries();
        updateSummary();
        
        setTimeout(() => {
            const inputs = document.querySelectorAll('#incomeEntries input[data-field="product"]');
            if (inputs.length > 0) inputs[inputs.length - 1].focus();
        }, 50);
    }
}

async function addExpenseEntry() {
    const newEntry = await DB.insertOne('expenses', { date: todayStr(), head: '', amount: 0 });
    if (newEntry) {
        state.expenseData.push(newEntry);
        renderExpenseEntries();
        updateSummary();
        
        setTimeout(() => {
            const inputs = document.querySelectorAll('#expenseEntries input[data-field="head"]');
            if (inputs.length > 0) inputs[inputs.length - 1].focus();
        }, 50);
    }
}

async function deleteEntry(type, id) {
    if(!confirm("Delete this entry?")) return;
    const row = document.querySelector(`.entry-row[data-entry-id="${id}"]`);
    if (row) {
        row.style.opacity = '0.5';
        const success = await DB.deleteOne(type === 'income' ? 'income' : 'expenses', id);
        if (success) {
            if (type === 'income') state.incomeData = state.incomeData.filter(e => e._id !== id);
            else state.expenseData = state.expenseData.filter(e => e._id !== id);
            
            if (type === 'income') renderIncomeEntries();
            else renderExpenseEntries();
            updateSummary();
            showToast('Entry deleted', 'success');
        }
    }
}

function debounceSave() {
    const dot = document.getElementById('saveDot');
    const label = document.getElementById('saveLabel');
    dot.className = 'save-dot saving';
    label.textContent = 'Saving...';
    label.style.color = 'var(--balance)';
    
    clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(performSave, 800);
}

async function performSave() {
    // Save Income
    const rows = document.querySelectorAll('#incomeEntries .entry-row');
    const incomes = [];
    rows.forEach(row => {
        const id = row.dataset.entryId;
        const date = row.querySelector('[data-field="date"]').value;
        const product = row.querySelector('[data-field="product"]').value;
        const amount = parseFloat(row.querySelector('[data-field="amount"]').value) || 0;
        incomes.push({ _id: id, date, product, amount });
    });

    // Save Expenses
    const expenseRows = document.querySelectorAll('#expenseEntries .entry-row');
    const expenses = [];
    expenseRows.forEach(row => {
        const id = row.dataset.entryId;
        const date = row.querySelector('[data-field="date"]').value;
        const head = row.querySelector('[data-field="head"]').value;
        const amount = parseFloat(row.querySelector('[data-field="amount"]').value) || 0;
        expenses.push({ _id: id, date, head, amount });
    });

    const incSuccess = await DB.saveAll('income', incomes);
    const expSuccess = await DB.saveAll('expenses', expenses);

    const dot = document.getElementById('saveDot');
    const label = document.getElementById('saveLabel');
    
    if (incSuccess && expSuccess) {
        dot.className = 'save-dot saved';
        label.textContent = 'All saved';
        label.style.color = 'var(--income)';
    } else {
        dot.className = 'save-dot';
        label.textContent = 'Save failed';
        label.style.color = 'var(--expense)';
    }
    
    setTimeout(() => { 
        dot.className = 'save-dot'; 
        label.style.color = 'var(--text-muted)'; 
        label.textContent = 'Auto-save active'; 
    }, 3000);
}

// ============================================================
// SUMMARY & INIT
// ============================================================
function updateSummary() {
    let totalIncome = 0, totalExpense = 0;
    
    document.querySelectorAll('#incomeEntries .entry-row').forEach(row => {
        totalIncome += parseFloat(row.querySelector('[data-field="amount"]')?.value || 0) || 0;
    });
    
    document.querySelectorAll('#expenseEntries .entry-row').forEach(row => {
        totalExpense += parseFloat(row.querySelector('[data-field="amount"]')?.value || 0) || 0;
    });

    const net = totalIncome - totalExpense;
    document.getElementById('totalIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('totalExpense').textContent = formatCurrency(totalExpense);
    document.getElementById('netBalance').textContent = formatCurrency(net);
    document.getElementById('incomeTotalInline').textContent = formatCurrency(totalIncome);
    document.getElementById('expenseTotalInline').textContent = formatCurrency(totalExpense);
}

function changeMonth(delta) {
    state.currentMonth += delta;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    else if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    renderMonthLabel(); renderIncomeEntries(); renderExpenseEntries(); updateSummary();
}

function showToast(msg, type='info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, 3000);
}

async function init() {
    renderMonthLabel();
    try {
        state.incomeData = await DB.find('income');
        state.expenseData = await DB.find('expenses');
        
        await autoSyncOrders();
        
        renderIncomeEntries();
        renderExpenseEntries();
        updateSummary();
        
        document.getElementById('incomeEntries').addEventListener('input', () => { updateSummary(); debounceSave(); });
        document.getElementById('expenseEntries').addEventListener('input', () => { updateSummary(); debounceSave(); });
        
        showToast('Loaded', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error loading data', 'error');
    }
}

init();
