const state = {
  view: "overview",
  inventoryFilter: "all",
  search: "",
  transactions: [
    { id: "INV-2408", customer: "Sarah N.", initials: "SN", product: "Family Grill Pack", date: "Today, 10:42 AM", method: "Mobile Money", amount: 185000, status: "Paid" },
    { id: "INV-2407", customer: "Kato Markets", initials: "KM", product: "Beef Sausage · 10kg", date: "Today, 9:18 AM", method: "Bank transfer", amount: 420000, status: "Paid" },
    { id: "INV-2406", customer: "Daniel O.", initials: "DO", product: "Pork Classic · 2kg", date: "Today, 8:54 AM", method: "Cash", amount: 76000, status: "Pending" },
    { id: "INV-2405", customer: "Amina K.", initials: "AK", product: "Chicken Herb · 3kg", date: "Yesterday", method: "Mobile Money", amount: 114000, status: "Paid" },
    { id: "INV-2404", customer: "The Garden Cafe", initials: "GC", product: "Mixed Grill · 5kg", date: "Yesterday", method: "Bank transfer", amount: 265000, status: "Paid" }
  ],
  inventory: [
    { name: "Kampala Classic", sku: "GS-PK-500", category: "Pork", qty: 42, unit: "packs", reorder: 15, cost: 18000, price: 28000 },
    { name: "Beefy Goodness", sku: "GS-BF-500", category: "Beef", qty: 8, unit: "packs", reorder: 12, cost: 21000, price: 32000 },
    { name: "Chilli Chomp", sku: "GS-CH-500", category: "Pork", qty: 24, unit: "packs", reorder: 10, cost: 19000, price: 30000 },
    { name: "Herby Chicken", sku: "GS-CK-500", category: "Chicken", qty: 6, unit: "packs", reorder: 12, cost: 17000, price: 27000 },
    { name: "Family Grill Pack", sku: "GS-FM-1KG", category: "Mixed", qty: 31, unit: "packs", reorder: 8, cost: 49000, price: 72000 },
    { name: "Smoky Beef Bites", sku: "GS-BT-250", category: "Beef", qty: 0, unit: "packs", reorder: 10, cost: 11000, price: 18000 }
  ],
  customers: [
    { name: "Sarah Nambasa", initials: "SN", phone: "+256 772 123 456", area: "Ntinda, Kampala", orders: 14, spent: 1250000, type: "Regular" },
    { name: "Kato Markets Ltd.", initials: "KM", phone: "+256 701 456 789", area: "Nakasero, Kampala", orders: 32, spent: 6840000, type: "Wholesale" },
    { name: "Daniel Okello", initials: "DO", phone: "+256 752 987 654", area: "Bukoto, Kampala", orders: 6, spent: 426000, type: "Regular" },
    { name: "Amina K.", initials: "AK", phone: "+256 785 342 190", area: "Muyenga, Kampala", orders: 9, spent: 759000, type: "Regular" },
    { name: "The Garden Cafe", initials: "GC", phone: "+256 414 222 010", area: "Kololo, Kampala", orders: 21, spent: 4920000, type: "Wholesale" }
  ]
};

const modules = [
  { view: "pos", icon: "▦", title: "Point of sale", copy: "Process counter sales, record payments, and send receipts in just a few taps.", metric: "24 sales today", action: "Open POS" },
  { view: "sales", icon: "↗", title: "Sales management", copy: "See every order in one place. Track payments and understand what’s selling.", metric: "UGX 8.4M this month", action: "View sales" },
  { view: "inventory", icon: "▤", title: "Inventory & stock", copy: "Know what’s on the shelf, what’s running low, and when to restock.", metric: "6 products tracked", action: "View inventory" },
  { view: "finance", icon: "◉", title: "Accounting & finance", copy: "Keep an eye on business income, expenses, and your bottom line.", metric: "UGX 3.2M net income", action: "View accounts" },
  { view: "people", icon: "♙", title: "People & HR", copy: "Keep your team information, roles, and day-to-day operations organized.", metric: "8 team members", action: "View team" },
  { view: "customers", icon: "♧", title: "Customer management", copy: "Remember the people behind every order and grow your relationships.", metric: "186 customers", action: "View customers" },
  { view: "reports", icon: "▥", title: "Reports & analytics", copy: "Turn everyday business activity into clearer decisions for what's next.", metric: "4 reports ready", action: "View reports" }
];

const pages = { overview: "Overview", pos: "Point of sale", sales: "Sales", inventory: "Inventory & stock", finance: "Accounting & finance", people: "People & HR", customers: "Customers", reports: "Reports & analytics" };
const $ = (selector, root = document) => root.querySelector(selector);
const money = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;

function heading(title, description, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function button(text, action, primary = false, icon = "") {
  return `<button type="button" class="${primary ? "primary-button" : "quiet-button"}" data-action="${action}">${icon}${text}</button>`;
}

function metricCard(title, value, change, note, icon, color, changeClass = "") {
  return `<article class="metric-card"><div class="metric-top"><span>${title}</span><span class="metric-icon ${color}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span class="metric-change ${changeClass}">${change}</span>${note}</div></article>`;
}

function chartMarkup() {
  const x = [55, 107, 159, 211, 263, 315, 367, 419, 471, 523, 575, 627];
  const current = [125, 110, 117, 80, 95, 63, 72, 49, 67, 43, 53, 26];
  const previous = [144, 151, 129, 137, 112, 121, 104, 119, 89, 96, 75, 84];
  const makePath = (values) => values.map((y, index) => `${index ? "L" : "M"}${x[index]},${y}`).join(" ");
  const fillPath = `${makePath(current)} L${x[x.length - 1]},186 L${x[0]},186 Z`;
  const xLabels = ["01 Oct", "04 Oct", "07 Oct", "10 Oct", "13 Oct", "16 Oct", "19 Oct", "22 Oct", "25 Oct", "28 Oct", "31 Oct"];
  return `<svg viewBox="0 0 670 215" role="img" aria-label="Daily sales this month trending upward">
    <defs><linearGradient id="sales-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4361ee" stop-opacity=".18"/><stop offset="1" stop-color="#4361ee" stop-opacity="0"/></linearGradient></defs>
    <line class="chart-grid" x1="43" y1="35" x2="645" y2="35"/><line class="chart-grid" x1="43" y1="82" x2="645" y2="82"/><line class="chart-grid" x1="43" y1="129" x2="645" y2="129"/><line class="chart-grid" x1="43" y1="176" x2="645" y2="176"/>
    <text class="chart-label" x="0" y="38">2.4M</text><text class="chart-label" x="0" y="85">1.8M</text><text class="chart-label" x="0" y="132">1.2M</text><text class="chart-label" x="0" y="179">0.6M</text>
    <path class="chart-area" d="${fillPath}"/><path class="chart-line-prev" d="${makePath(previous)}"/><path class="chart-line" d="${makePath(current)}"/>
    <circle class="chart-point" cx="627" cy="26" r="4"/>
    ${xLabels.map((label, index) => `<text class="chart-label" x="${43 + index * 59}" y="202">${label}</text>`).join("")}
  </svg>`;
}

function panelHeader(title, subtitle, action = "") {
  return `<div class="panel-header"><div><h2 class="panel-title">${title}</h2><p class="panel-subtitle">${subtitle}</p></div>${action}</div>`;
}

function transactionTable(items = state.transactions) {
  const rows = items.map((item) => `<tr><td class="table-id">${item.id}</td><td><span class="table-strong">${item.customer}</span><span class="table-sub">${item.product}</span></td><td>${item.date}</td><td>${item.method}</td><td class="table-strong">${money(item.amount)}</td><td><span class="status-pill ${item.status.toLowerCase()}">${item.status}</span></td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>PAYMENT</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state">No matching sales yet.</div></td></tr>`}</tbody></table></div>`;
}

function activityPanel() {
  return `<section class="panel">${panelHeader("Recent activity", "A quick look at what's happening today")}<div class="activity-list">
    <div class="activity-item"><span class="activity-icon sale">↗</span><span class="activity-copy"><strong>New sale completed</strong> · Sarah N.<small>Family Grill Pack · Mobile Money · 10:42 AM</small></span><span class="activity-amount">+185K</span></div>
    <div class="activity-item"><span class="activity-icon stock">▤</span><span class="activity-copy"><strong>Stock running low</strong> · Beefy Goodness<small>8 packs remaining · Restock recommended</small></span></div>
    <div class="activity-item"><span class="activity-icon user">♧</span><span class="activity-copy"><strong>New customer added</strong> · Peter L.<small>Walk-in · Kampala · 9:32 AM</small></span></div>
    <div class="activity-item"><span class="activity-icon sale">↗</span><span class="activity-copy"><strong>Payment received</strong> · Kato Markets<small>Bank transfer · 9:18 AM</small></span><span class="activity-amount">+420K</span></div>
  </div></section>`;
}

function stockPanel() {
  const items = state.inventory.slice(0, 4);
  return `<section class="panel">${panelHeader("Stock at a glance", "Current quantity by popular product", button("View all", "navigate:inventory"))}<div class="stock-summary">${items.map((item) => {
    const percentage = Math.min(100, Math.round(item.qty / (item.reorder * 3) * 100));
    return `<div class="stock-line"><span class="stock-name"><i class="stock-swatch"></i>${item.name}</span><span class="stock-track"><span class="stock-progress" style="width:${percentage}%"></span></span><span class="stock-value">${item.qty} ${item.unit}</span></div>`;
  }).join("")}</div></section>`;
}

function moduleCards(list = modules) {
  return `<div class="module-grid">${list.map((item) => `<button type="button" class="module-card" data-action="navigate:${item.view}"><span class="module-card-icon">${item.icon}</span><h3>${item.title}</h3><p>${item.copy}</p><span class="module-card-foot"><span>${item.metric}</span><b>${item.action} ↗</b></span></button>`).join("")}</div>`;
}

function overviewView() {
  return `${heading("Good morning, James 👋", "Here's what's happening with your business today.", `${button("Download report", "download-report")}${button("New sale", "new-sale", true, "+ ")}`)}
    <div class="metric-grid">
      ${metricCard("TOTAL SALES", money(8420000), "↑ 12.8%", "vs. last month", "↗", "blue")}
      ${metricCard("ORDERS", "248", "↑ 8.2%", "vs. last month", "▦", "green")}
      ${metricCard("NET INCOME", money(3240000), "↑ 6.4%", "vs. last month", "◉", "purple")}
      ${metricCard("LOW STOCK ALERTS", "02", "Needs attention", "", "▤", "amber", "neutral")}
    </div>
    <div class="dashboard-grid">
      <div>
        <section class="panel">${panelHeader("Sales overview", "A little progress, every day.", `<div class="chart-legend"><span><i class="legend-dot"></i>This month</span><span><i class="legend-dot alt"></i>Last month</span></div>`)}<div class="chart-wrap">${chartMarkup()}</div></section>
        <section class="panel">${panelHeader("Recent sales", "Your latest customer orders", button("See all sales", "navigate:sales"))}${transactionTable(state.transactions.slice(0, 4))}</section>
      </div>
      <div>${activityPanel()}${stockPanel()}</div>
    </div>`;
}

function salesView() {
  return `${heading("Sales", "Track orders, payments, and the products your customers love.", `${button("Export CSV", "download-report")}${button("New sale", "new-sale", true, "+ ")}`)}
    <div class="metric-grid">${metricCard("SALES THIS MONTH", money(8420000), "↑ 12.8%", "vs. last month", "↗", "blue")}${metricCard("ORDERS COMPLETED", "248", "↑ 8.2%", "vs. last month", "▦", "green")}${metricCard("AVERAGE ORDER", money(33900), "↑ 4.1%", "vs. last month", "◷", "purple")}${metricCard("AWAITING PAYMENT", "03", money(476000), "across 3 invoices", "◉", "amber", "neutral")}</div>
    <section class="panel">${panelHeader("Sales trend", "Daily revenue · October 2025", `<div class="chart-legend"><span><i class="legend-dot"></i>This month</span><span><i class="legend-dot alt"></i>Last month</span></div>`)}<div class="chart-wrap">${chartMarkup()}</div></section>
    <section class="panel">${panelHeader("All sales", "Recent invoices and payments", `<span class="status-pill paid">${state.transactions.length} transactions</span>`)}${transactionTable(state.transactions)}</section>`;
}

function inventoryView() {
  const filter = state.inventoryFilter;
  const filtered = state.inventory.filter((item) => {
    const isLow = item.qty <= item.reorder && item.qty > 0;
    const isOut = item.qty === 0;
    const matchesStatus = filter === "all" || (filter === "low" && isLow) || (filter === "out" && isOut);
    const matchesSearch = `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(state.search.toLowerCase());
    return matchesStatus && matchesSearch;
  });
  const rows = filtered.map((item) => {
    const isLow = item.qty <= item.reorder && item.qty > 0;
    const isOut = item.qty === 0;
    const status = isOut ? ["out-stock", "Out of stock"] : isLow ? ["low-stock", "Low stock"] : ["in-stock", "In stock"];
    const percent = Math.min(100, Math.round(item.qty / (item.reorder * 3) * 100));
    return `<tr><td><span class="table-strong">${item.name}</span><span class="table-sub">${item.sku}</span></td><td>${item.category}</td><td>${money(item.cost)}</td><td>${money(item.price)}</td><td><span class="inventory-progress ${isLow ? "low" : ""} ${isOut ? "out" : ""}"><span style="width:${percent}%"></span></span></td><td class="table-strong">${item.qty} ${item.unit}</td><td><span class="status-pill ${status[0]}">${status[1]}</span></td><td><button class="panel-action" data-action="restock:${item.sku}">Restock ↗</button></td></tr>`;
  }).join("");
  const toolbar = `<div class="toolbar"><div class="toolbar-filters"><button type="button" class="filter-button ${filter === "all" ? "active" : ""}" data-inventory-filter="all">All products</button><button type="button" class="filter-button ${filter === "low" ? "active" : ""}" data-inventory-filter="low">Low stock</button><button type="button" class="filter-button ${filter === "out" ? "active" : ""}" data-inventory-filter="out">Out of stock</button></div><button class="quiet-button" data-action="add-product" type="button">+ Add product</button></div>`;
  return `${heading("Inventory & stock", "A real-time view of your products and stock levels.", button("Stock adjustment", "stock-adjust"))}
    <div class="metric-grid">${metricCard("PRODUCTS", state.inventory.length, "Across 4 categories", "", "▤", "blue", "neutral")}${metricCard("TOTAL UNITS", `${state.inventory.reduce((sum, item) => sum + item.qty, 0)} packs`, "Ready to sell", "", "▦", "green", "neutral")}${metricCard("LOW STOCK", state.inventory.filter((item) => item.qty <= item.reorder && item.qty > 0).length, "Restock recommended", "", "!", "amber", "neutral")}${metricCard("OUT OF STOCK", state.inventory.filter((item) => item.qty === 0).length, "Needs action", "", "×", "purple", "neutral")}</div>
    ${toolbar}<section class="panel">${panelHeader("Product catalogue", `${filtered.length} products shown`)}<div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>COST PRICE</th><th>SELLING PRICE</th><th>STOCK LEVEL</th><th>QUANTITY</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="empty-state">No products match that filter.</div></td></tr>`}</tbody></table></div></section>`;
}

function customersView() {
  const customers = state.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.area}`.toLowerCase().includes(state.search.toLowerCase()));
  const rows = customers.map((customer, i) => `<tr><td><div class="customer-cell"><span class="customer-avatar ${["", "alt", "warm", "pink"][i % 4]}">${customer.initials}</span><span><span class="table-strong">${customer.name}</span><span class="table-sub">${customer.phone}</span></span></div></td><td>${customer.area}</td><td>${customer.orders}</td><td class="table-strong">${money(customer.spent)}</td><td><span class="status-pill ${customer.type === "Wholesale" ? "pending" : "paid"}">${customer.type}</span></td><td><button class="panel-action" data-action="contact:${customer.name}">Contact ↗</button></td></tr>`).join("");
  return `${heading("Customers", "Know your people. Build relationships that keep coming back.", button("+ Add customer", "add-customer", true))}
    <div class="metric-grid">${metricCard("TOTAL CUSTOMERS", "186", "↑ 14", "new this month", "♧", "blue")}${metricCard("REPEAT CUSTOMERS", "68%", "↑ 5.2%", "vs. last month", "↻", "green")}${metricCard("WHOLESALE ACCOUNTS", "12", "Active partners", "", "▣", "purple", "neutral")}${metricCard("CUSTOMER SALES", money(5680000), "67.5%", "of total sales", "↗", "amber", "neutral")}</div>
    <section class="panel">${panelHeader("Your customers", `${customers.length} customers`)}<div class="table-wrap"><table><thead><tr><th>NAME & CONTACT</th><th>AREA</th><th>ORDERS</th><th>TOTAL SPENT</th><th>TYPE</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state">No customers found.</div></td></tr>`}</tbody></table></div></section>`;
}

function financeView() {
  const entries = [
    ["Sale · Kato Markets", "Income", "Today, 9:18 AM", 420000],
    ["Raw ingredients · Quality Meats", "Expense", "Today, 8:30 AM", -860000],
    ["Sale · Sarah N.", "Income", "Today, 10:42 AM", 185000],
    ["Packaging supplies", "Expense", "Yesterday", -245000],
    ["Sale · Garden Cafe", "Income", "Yesterday", 265000]
  ];
  return `${heading("Accounting & finance", "Keep your cash flow clear and your books in order.", button("Download statement", "download-report"))}
    <div class="metric-grid">${metricCard("TOTAL INCOME", money(12840000), "↑ 9.2%", "this month", "↗", "green")}${metricCard("TOTAL EXPENSES", money(9600000), "↑ 3.1%", "this month", "↘", "amber", "neutral")}${metricCard("NET INCOME", money(3240000), "↑ 6.4%", "this month", "◉", "blue")}${metricCard("CASH ON HAND", money(1860000), "Across accounts", "", "◷", "purple", "neutral")}</div>
    <div class="dashboard-grid"><section class="panel">${panelHeader("Recent transactions", "Income and expenses this month")}<div class="table-wrap"><table><thead><tr><th>DESCRIPTION</th><th>TYPE</th><th>DATE</th><th>AMOUNT</th></tr></thead><tbody>${entries.map(([name, type, date, amount]) => `<tr><td class="table-strong">${name}</td><td><span class="status-pill ${type === "Income" ? "paid" : "pending"}">${type}</span></td><td>${date}</td><td class="table-strong">${amount > 0 ? "+" : "−"}${money(Math.abs(amount))}</td></tr>`).join("")}</tbody></table></div></section>${activityPanel()}</div>`;
}

function peopleView() {
  const people = [["JM", "James M.", "Administrator", "Operations", "On duty"], ["AN", "Agnes N.", "Sales associate", "Retail", "On duty"], ["PK", "Paul K.", "Production lead", "Production", "On duty"], ["RM", "Rita M.", "Accounts officer", "Finance", "On leave"], ["DK", "David K.", "Delivery rider", "Logistics", "On duty"], ["SN", "Susan N.", "Customer care", "Support", "On duty"], ["EO", "Emmanuel O.", "Production assistant", "Production", "On duty"], ["JB", "John B.", "Stock manager", "Inventory", "On duty"]];
  return `${heading("People & HR", "Your team, all together. Keep the people side of business simple.", button("Add team member", "add-employee", true))}
    <div class="metric-grid">${metricCard("TEAM MEMBERS", "08", "Across 5 teams", "", "♙", "blue", "neutral")}${metricCard("ON DUTY TODAY", "07", "One team member on leave", "", "✓", "green", "neutral")}${metricCard("PAYROLL THIS MONTH", money(3240000), "Due 30 Oct", "", "◉", "purple", "neutral")}${metricCard("LEAVE REQUESTS", "01", "Awaiting review", "", "◷", "amber", "neutral")}</div>
    <section class="panel">${panelHeader("Your team", "Staff and their current status")}<div class="table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>DEPARTMENT</th><th>STATUS</th><th></th></tr></thead><tbody>${people.map(([initials, name, role, department, status], i) => `<tr><td><div class="customer-cell"><span class="customer-avatar ${["", "alt", "warm", "pink"][i % 4]}">${initials}</span><span class="table-strong">${name}</span></div></td><td>${role}</td><td>${department}</td><td><span class="status-pill ${status === "On duty" ? "paid" : "pending"}">${status}</span></td><td><button class="panel-action" data-action="profile:${name}">View profile ↗</button></td></tr>`).join("")}</tbody></table></div></section>`;
}

function reportsView() {
  const reportModules = [
    { view: "sales", icon: "↗", title: "Sales performance", copy: "Revenue, order volume, payment methods, and top products at a glance.", metric: "Updated today", action: "Open report" },
    { view: "finance", icon: "◉", title: "Income & expenses", copy: "Understand where the money is coming from and where it's going.", metric: "October 2025", action: "Open report" },
    { view: "inventory", icon: "▤", title: "Stock movement", copy: "Product quantities, low-stock alerts, and your restock needs.", metric: "6 products", action: "Open report" },
    { view: "customers", icon: "♧", title: "Customer insights", copy: "Repeat orders, popular items, and your most loyal customers.", metric: "186 customers", action: "Open report" },
    { view: "people", icon: "♙", title: "Team overview", copy: "Your people, their roles, attendance, and the work ahead.", metric: "8 team members", action: "Open report" },
    { view: "sales", icon: "◷", title: "Daily closeout", copy: "Reconcile a day's sales across cash, Mobile Money, and card.", metric: "Ready to view", action: "Open report" }
  ];
  return `${heading("Reports & analytics", "A clearer picture of your business, one report at a time.", button("Export all reports", "download-report", true))}<div class="report-highlight"><span class="report-highlight-icon">✳</span><div><strong>Your October is looking good.</strong><p>Sales are up 12.8% from September. Kampala Classic is your top-selling product.</p></div><button class="quiet-button" data-action="navigate:sales">See sales report ↗</button></div>${moduleCards(reportModules)}`;
}

function posView() {
  return `${heading("Point of sale", "A quick counter sale, with the whole business keeping up.", button("Open quick sale", "new-sale", true, "+ "))}
    <div class="pos-hero"><div><span class="pos-kicker">READY WHEN YOU ARE</span><h2>Good service.<br><em>Even quicker.</em></h2><p>Ring up a sale and inventory, income, and customer history stay in sync.</p><button class="primary-button" data-action="new-sale" type="button">Start a new sale <span>↗</span></button></div><span class="pos-hero-art">▦</span></div>
    <div class="metric-grid">${metricCard("SALES TODAY", "24", "↑ 4", "vs. yesterday", "▦", "blue")}${metricCard("TODAY'S REVENUE", money(1284000), "↑ 8.4%", "vs. yesterday", "↗", "green")}${metricCard("AVERAGE SALE", money(53500), "Across 24 sales", "", "◉", "purple", "neutral")}${metricCard("PAYMENT MIX", "Mobile Money", "62%", "of today's sales", "◷", "amber", "neutral")}</div>
    <section class="panel">${panelHeader("Latest counter sales", "See the latest transactions from your shop floor", button("View sales", "navigate:sales"))}${transactionTable(state.transactions.slice(0, 4))}</section>`;
}

function render() {
  const target = $("#page-content");
  $("#breadcrumb-current").textContent = pages[state.view] || "Overview";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view));
  const views = { overview: overviewView, pos: posView, sales: salesView, inventory: inventoryView, customers: customersView, finance: financeView, people: peopleView, reports: reportsView };
  target.innerHTML = (views[state.view] || overviewView)();
  updateInventoryBadge();
}

function updateInventoryBadge() {
  const count = state.inventory.filter((item) => item.qty <= item.reorder).length;
  $("#low-stock-count").textContent = count;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2500);
}

function openSaleDialog() {
  const select = $("#sale-product");
  select.innerHTML = state.inventory.filter((item) => item.qty > 0).map((item) => `<option value="${item.sku}">${item.name} — ${money(item.price)} (${item.qty} left)</option>`).join("");
  if (!select.options.length) {
    toast("No stock available to sell right now.");
    return;
  }
  updateSaleTotal();
  $("#pos-dialog").showModal();
}

function updateSaleTotal() {
  const product = state.inventory.find((item) => item.sku === $("#sale-product").value);
  const quantity = Math.max(1, Number($("#sale-quantity").value) || 1);
  $("#sale-total").textContent = product ? money(product.price * quantity) : money(0);
}

function recordSale(event) {
  event.preventDefault();
  const product = state.inventory.find((item) => item.sku === $("#sale-product").value);
  const quantity = Number($("#sale-quantity").value);
  if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.qty) {
    toast(product ? `Only ${product.qty} packs are currently in stock.` : "Choose a product to continue.");
    return;
  }
  const now = new Date();
  const stamp = now.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });
  const id = `INV-${String(2408 + state.transactions.length - 4).padStart(4, "0")}`;
  state.transactions.unshift({ id, customer: "Walk-in customer", initials: "WI", product: `${product.name} · ${quantity} pack${quantity === 1 ? "" : "s"}`, date: `Today, ${stamp}`, method: $("#sale-payment").value, amount: product.price * quantity, status: "Paid" });
  product.qty -= quantity;
  $("#sale-quantity").value = 1;
  $("#pos-dialog").close();
  render();
  toast(`Sale recorded — ${money(product.price * quantity)}`);
}

function downloadReport() {
  const rows = [["Order", "Customer", "Product", "Date", "Payment", "Amount (UGX)", "Status"], ...state.transactions.map((item) => [item.id, item.customer, item.product, item.date, item.method, item.amount, item.status])];
  const csv = rows.map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "host256-sales-report.csv";
  link.click();
  URL.revokeObjectURL(url);
  toast("Your sales report is ready.");
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  const action = event.target.closest("[data-action]");
  const inventoryFilter = event.target.closest("[data-inventory-filter]");
  if (nav) {
    state.view = nav.dataset.view;
    state.search = "";
    $("#global-search").value = "";
    $("#sidebar").classList.remove("open");
    $("#mobile-scrim").classList.remove("visible");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (inventoryFilter) {
    state.inventoryFilter = inventoryFilter.dataset.inventoryFilter;
    render();
  }
  if (action) {
    const name = action.dataset.action;
    if (name.startsWith("navigate:")) {
      state.view = name.split(":")[1];
      state.search = "";
      $("#global-search").value = "";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (name === "new-sale") openSaleDialog();
    else if (name === "download-report") downloadReport();
    else if (name.startsWith("restock:")) {
      const item = state.inventory.find((product) => product.sku === name.split(":")[1]);
      if (item) {
        item.qty += 20;
        render();
        toast(`${item.name} restocked by 20 packs.`);
      }
    } else if (name === "stock-adjust") toast("Select a product and use Restock to adjust its quantity.");
    else if (name === "add-product") toast("Product setup is available in the full Host256 ERP.");
    else if (name === "add-customer") toast("Customer setup is available in the full Host256 ERP.");
    else if (name === "add-employee") toast("Team setup is available in the full Host256 ERP.");
    else if (name.startsWith("contact:")) toast(`Customer contact: ${name.split(":")[1]}`);
    else if (name.startsWith("profile:")) toast(`Team profile: ${name.split(":")[1]}`);
  }
  if (event.target.id === "mobile-menu") {
    $("#sidebar").classList.toggle("open");
    $("#mobile-scrim").classList.toggle("visible");
  }
  if (event.target.id === "mobile-scrim") {
    $("#sidebar").classList.remove("open");
    $("#mobile-scrim").classList.remove("visible");
  }
  if (event.target.id === "date-select") toast("Date range: October 2025 · Sample dashboard data");
  if (event.target.id === "profile-button") toast("Signed in as James M. · Administrator");
});

$("#global-search").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  if (state.search && !["inventory", "customers"].includes(state.view)) state.view = "inventory";
  if (state.view === "inventory" || state.view === "customers") render();
});
$("#global-search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.target.value = "";
    state.search = "";
    render();
  }
});
$("#sale-product").addEventListener("change", updateSaleTotal);
$("#sale-quantity").addEventListener("input", updateSaleTotal);
$("#sale-form").addEventListener("submit", recordSale);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#global-search").focus();
  }
});

render();
