const API = "";
const content = document.getElementById("appContent");
const modalBackdrop = document.getElementById("modalBackdrop");

let currentPage = "dashboard";
let cached = {
    shipments: [],
    pallets: [],
    drivers: [],
    vehicles: [],
    inspections: []
};

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric"
    });

async function api(path, options = {}) {
    const response = await fetch(API + path, {
        headers: { "Content-Type": "application/json" },
        ...options
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Something went wrong.");
    }

    return result;
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

function openModal(title, html) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = html;
    modalBackdrop.classList.remove("hidden");
}

function closeModal() {
    modalBackdrop.classList.add("hidden");
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;"
    }[char]));
}

function badge(status) {
    const value = String(status || "Pending").toLowerCase();
    let cls = "neutral";

    if (["dispatched", "completed", "passed", "ready", "allocated"].includes(value)) {
        cls = "badge";
    } else if (["pending", "registered", "in progress"].includes(value)) {
        cls = "warning";
    } else if (["failed", "rejected", "blocked"].includes(value)) {
        cls = "danger";
    }

    return `<span class="badge ${cls}">${esc(status || "Pending")}</span>`;
}

function heading(title, description, action = "") {
    return `
        <div class="page-heading">
            <div>
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
            ${action}
        </div>`;
}

function table(headers, rows) {
    if (!rows.length) {
        return `<div class="empty-state">No records available yet.</div>`;
    }

    return `
        <div class="table-wrap">
            <table>
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
                <tbody>${rows.join("")}</tbody>
            </table>
        </div>`;
}

function field(label, name, type = "text", required = true, extra = "") {
    return `
        <div class="form-field">
            <label>${label}</label>
            <input name="${name}" type="${type}" ${required ? "required" : ""} ${extra}>
        </div>`;
}

function selectField(label, name, options, required = true) {
    return `
        <div class="form-field">
            <label>${label}</label>
            <select name="${name}" ${required ? "required" : ""}>
                ${options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}
            </select>
        </div>`;
}

function formActions() {
    return `
        <div class="form-actions">
            <button type="button" class="button secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="button">Save record</button>
        </div>`;
}

async function submitForm(event, endpoint, after = refresh) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
        await api(endpoint, {
            method: "POST",
            body: JSON.stringify(data)
        });

        closeModal();
        toast("Record saved successfully.");
        await after();
    } catch (error) {
        toast(error.message);
    }
}

async function refresh() {
    try {
        await renderPage(currentPage);
    } catch (error) {
        content.innerHTML = `
            <div class="panel">
                <h3>Unable to connect to Elvara Logistics</h3>
                <p>${esc(error.message)}</p>
                <p>Make sure you started the Python server using <strong>python server.py</strong>.</p>
            </div>`;
    }
}

document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        currentPage = button.dataset.page;
        renderPage(currentPage);
    });
});

async function renderPage(page) {
    currentPage = page;

    const titles = {
        dashboard: "Dashboard",
        shipments: "Shipment registration",
        pallets: "Pallet allocation",
        drivers: "Driver management",
        vehicles: "Vehicle management",
        dispatch: "Dispatch management",
        inspections: "Vehicle inspections",
        documents: "Dispatch documentation"
    };

    document.getElementById("pageTitle").textContent = titles[page] || "Dashboard";

    const pages = {
        dashboard: renderDashboard,
        shipments: renderShipments,
        pallets: renderPallets,
        drivers: renderDrivers,
        vehicles: renderVehicles,
        dispatch: renderDispatch,
        inspections: renderInspections,
        documents: renderDocuments
    };

    await pages[page]();
}

// DASHBOARD
async function renderDashboard() {
    const data = await api("/api/summary");

    content.innerHTML = `
        ${heading("Operational overview", "A live overview of warehouse and dispatch activities.",
            `<button class="button" onclick="showShipmentForm()">+ Register shipment</button>`)}

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total shipments</div>
                <div class="stat-value">${data.shipments}</div>
                <div class="stat-note">All registered shipments</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Allocated pallets</div>
                <div class="stat-value">${data.pallets}</div>
                <div class="stat-note">Pallets created in the system</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active drivers</div>
                <div class="stat-value">${data.drivers}</div>
                <div class="stat-note">Registered drivers</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Dispatched shipments</div>
                <div class="stat-value">${data.dispatched}</div>
                <div class="stat-note">Shipments dispatched</div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-heading">
                <h3>Recent shipments</h3>
                <span>Latest operational activity</span>
            </div>
            ${table(
                ["Shipment ID", "Customer", "Category", "Pallets", "Status"],
                data.recent.map(s => `
                    <tr>
                        <td><strong>${esc(s.shipment_id)}</strong></td>
                        <td>${esc(s.customer)}</td>
                        <td>${esc(s.category)}</td>
                        <td>${s.pallet_count}</td>
                        <td>${badge(s.status)}</td>
                    </tr>`)
            )}
        </div>

        <div class="summary-note">
            <strong>Warehouse operating rules:</strong>
            30 boxes per pallet · 10 boxes per layer · Maximum 10 pallets per truck.
            Cosmetics and homeware may share a truck but not a pallet.
        </div>`;
}

// SHIPMENTS
async function showShipmentForm() {
    openModal("Register new shipment", `
        <form onsubmit="submitForm(event, '/api/shipments')">
            <div class="form-grid">
                ${field("Shipment ID", "shipment_id")}
                ${field("Customer / destination", "customer")}
                ${selectField("Product category", "category", ["Cosmetics", "Homeware"])}
                ${field("Product description", "product")}
                ${field("Number of boxes", "boxes", "number", true, 'min="1" step="1"')}
                ${selectField("Handling requirement", "handling", ["Standard", "Fragile - Glass", "Fragile - Ceramic", "Handle with care"])}
                ${field("Destination address", "destination")}
                ${field("Required dispatch date", "dispatch_date", "date")}
                <div class="form-field full">
                    <label>Additional instructions</label>
                    <textarea name="notes" placeholder="Special handling or delivery instructions..."></textarea>
                </div>
            </div>
            ${formActions()}
        </form>`);
}

async function renderShipments() {
    const data = await api("/api/shipments");
    cached.shipments = data;

    content.innerHTML = `
        ${heading("Shipment register", "Register and monitor incoming and outgoing customer shipments.",
            `<button class="button" onclick="showShipmentForm()">+ New shipment</button>`)}
        <div class="panel">
            <div class="panel-heading"><h3>All shipments</h3><span>${data.length} records</span></div>
            ${table(["Shipment ID", "Customer", "Product", "Category", "Boxes", "Pallets", "Status", "Action"],
                data.map(s => `
                    <tr>
                        <td><strong>${esc(s.shipment_id)}</strong></td>
                        <td>${esc(s.customer)}</td>
                        <td>${esc(s.product)}</td>
                        <td>${esc(s.category)}</td>
                        <td>${s.boxes}</td>
                        <td>${s.pallet_count}</td>
                        <td>${badge(s.status)}</td>
                        <td><button class="button small secondary" onclick="viewShipment(${s.id})">View</button></td>
                    </tr>`))}
        </div>`;
}

async function viewShipment(id) {
    const s = await api(`/api/shipments/${id}`);

    openModal("Shipment details", `
        <div class="summary-note">
            <strong>${esc(s.shipment_id)}</strong> — ${badge(s.status)}
        </div>
        <div class="document-meta">
            <div><strong>Customer</strong><br>${esc(s.customer)}</div>
            <div><strong>Category</strong><br>${esc(s.category)}</div>
            <div><strong>Product</strong><br>${esc(s.product)}</div>
            <div><strong>Boxes</strong><br>${s.boxes}</div>
            <div><strong>Pallets</strong><br>${s.pallet_count}</div>
            <div><strong>Handling</strong><br>${esc(s.handling)}</div>
            <div><strong>Destination</strong><br>${esc(s.destination)}</div>
            <div><strong>Dispatch date</strong><br>${esc(s.dispatch_date)}</div>
        </div>
        <p><strong>Instructions:</strong> ${esc(s.notes || "None")}</p>
        <div class="form-actions">
            <button class="button secondary" onclick="closeModal()">Close</button>
            <button class="button" onclick="allocateShipment(${s.id})">Allocate pallets</button>
        </div>`);
}

// PALLET ALLOCATION
async function allocateShipment(id) {
    const s = await api(`/api/shipments/${id}`);
    const existing = await api(`/api/pallets?shipment_id=${id}`);

    const palletsNeeded = Math.ceil(s.boxes / 30);
    const remaining = s.boxes;

    openModal("Allocate shipment pallets", `
        <div class="summary-note">
            Shipment: <strong>${esc(s.shipment_id)}</strong><br>
            Boxes: ${s.boxes}<br>
            Estimated pallets required: ${palletsNeeded}<br>
            Each pallet: 30 boxes maximum, 10 boxes per layer.
        </div>

        <form onsubmit="savePallets(event, ${id})">
            <div class="form-grid">
                ${field("Number of pallets to create", "pallet_count", "number", true, `min="1" max="10" value="${Math.max(1,palletsNeeded)}"`)}
            </div>
            <p style="font-size:11px;color:#7b857e">
                Existing allocations for this shipment: ${existing.length}.
                Allocations are created in sequence. The final pallet may contain fewer boxes.
            </p>
            ${formActions()}
        </form>`);
}

async function savePallets(event, shipmentId) {
    event.preventDefault();
    const count = Number(new FormData(event.target).get("pallet_count"));

    try {
        await api("/api/pallets/allocate", {
            method: "POST",
            body: JSON.stringify({ shipment_id: shipmentId, pallet_count: count })
        });

        closeModal();
        toast("Pallets allocated successfully.");
        await renderPage("shipments");
    } catch (error) {
        toast(error.message);
    }
}

async function renderPallets() {
    const data = await api("/api/pallets");
    cached.pallets = data;

    content.innerHTML = `
        ${heading("Pallet allocation", "Control pallet capacity, product categories and handling requirements.")}
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-label">Pallet capacity</div><div class="stat-value">30</div><div class="stat-note">Boxes per pallet</div></div>
            <div class="stat-card"><div class="stat-label">Layer arrangement</div><div class="stat-value">10</div><div class="stat-note">Boxes per layer</div></div>
            <div class="stat-card"><div class="stat-label">Truck capacity</div><div class="stat-value">10</div><div class="stat-note">Pallets maximum</div></div>
            <div class="stat-card"><div class="stat-label">Pallet records</div><div class="stat-value">${data.length}</div><div class="stat-note">Recorded allocations</div></div>
        </div>
        <div class="panel">
            <div class="panel-heading"><h3>Allocated pallets</h3><span>Product category separation enforced</span></div>
            ${table(["Pallet ID", "Shipment", "Category", "Boxes", "Layers", "Handling"],
                data.map(p => `
                    <tr>
                        <td><strong>${esc(p.pallet_code)}</strong></td>
                        <td>${esc(p.shipment_id)}</td>
                        <td>${esc(p.category)}</td>
                        <td>${p.boxes}/30</td>
                        <td>${Math.ceil(p.boxes/10)}</td>
                        <td>${esc(p.handling)}</td>
                    </tr>`))}
        </div>`;
}

// DRIVERS
function showDriverForm() {
    openModal("Register driver", `
        <form onsubmit="submitForm(event, '/api/drivers')">
            <div class="form-grid">
                ${field("Driver full name", "name")}
                ${field("Employee / driver number", "driver_number")}
                ${field("Contact number", "phone", "tel")}
                ${field("Licence number", "licence_number")}
                ${selectField("Licence code", "licence_code", ["Code 10", "Code 14", "Code B", "Other"])}
                ${field("Licence expiry date", "licence_expiry", "date")}
            </div>
            ${formActions()}
        </form>`);
}

async function renderDrivers() {
    const data = await api("/api/drivers");
    cached.drivers = data;

    content.innerHTML = `
        ${heading("Driver management", "Maintain driver details and licence records.",
            `<button class="button" onclick="showDriverForm()">+ Add driver</button>`)}
        <div class="panel">
            <div class="panel-heading"><h3>Registered drivers</h3><span>${data.length} drivers</span></div>
            ${table(["Driver", "Employee number", "Contact", "Licence", "Code", "Expiry"],
                data.map(d => `
                    <tr>
                        <td><strong>${esc(d.name)}</strong></td>
                        <td>${esc(d.driver_number)}</td>
                        <td>${esc(d.phone)}</td>
                        <td>${esc(d.licence_number)}</td>
                        <td>${esc(d.licence_code)}</td>
                        <td>${esc(d.licence_expiry)}</td>
                    </tr>`))}
        </div>`;
}

// VEHICLES
function showVehicleForm() {
    openModal("Register vehicle", `
        <form onsubmit="submitForm(event, '/api/vehicles')">
            <div class="form-grid">
                ${field("Truck registration", "registration")}
                ${field("Vehicle description", "description")}
                ${field("Trailer registration", "trailer_number", "text", false)}
                ${field("Maximum pallet capacity", "max_pallets", "number", true, 'min="1" max="10" value="10"')}
                ${field("Vehicle kilometre reading", "odometer", "number", false, 'min="0"')}
            </div>
            ${formActions()}
        </form>`);
}

async function renderVehicles() {
    const data = await api("/api/vehicles");
    cached.vehicles = data;

    content.innerHTML = `
        ${heading("Vehicle management", "Manage truck registrations, trailers and carrying capacity.",
            `<button class="button" onclick="showVehicleForm()">+ Add vehicle</button>`)}
        <div class="panel">
            <div class="panel-heading"><h3>Fleet register</h3><span>${data.length} vehicles</span></div>
            ${table(["Truck", "Description", "Trailer", "Capacity", "Odometer"],
                data.map(v => `
                    <tr>
                        <td><strong>${esc(v.registration)}</strong></td>
                        <td>${esc(v.description)}</td>
                        <td>${esc(v.trailer_number || "Not assigned")}</td>
                        <td>${v.max_pallets} pallets</td>
                        <td>${esc(v.odometer || "—")}</td>
                    </tr>`))}
        </div>`;
}

// DISPATCH
function showDispatchForm() {
    openModal("Prepare dispatch", `
        <form onsubmit="submitForm(event, '/api/dispatch', () => renderPage('dispatch'))">
            <div class="form-grid">
                <div class="form-field full">
                    <label>Shipment</label>
                    <select name="shipment_id" id="dispatchShipment" required></select>
                </div>
                <div class="form-field">
                    <label>Driver</label>
                    <select name="driver_id" id="dispatchDriver" required></select>
                </div>
                <div class="form-field">
                    <label>Truck</label>
                    <select name="vehicle_id" id="dispatchVehicle" required></select>
                </div>
                ${field("Dispatch reference", "dispatch_reference")}
                ${field("Departure date", "departure_date", "date")}
                ${field("Departure time", "departure_time", "time")}
            </div>
            ${formActions()}
        </form>`);

    Promise.all([
        api("/api/shipments"),
        api("/api/drivers"),
        api("/api/vehicles")
    ]).then(([shipments, drivers, vehicles]) => {
        document.getElementById("dispatchShipment").innerHTML =
            shipments.filter(s => s.status !== "Dispatched").map(s =>
                `<option value="${s.id}">${esc(s.shipment_id)} — ${esc(s.customer)}</option>`
            ).join("");

        document.getElementById("dispatchDriver").innerHTML =
            drivers.map(d => `<option value="${d.id}">${esc(d.name)} — ${esc(d.driver_number)}</option>`).join("");

        document.getElementById("dispatchVehicle").innerHTML =
            vehicles.map(v => `<option value="${v.id}">${esc(v.registration)} — ${esc(v.trailer_number || "No trailer")}</option>`).join("");
    }).catch(error => toast(error.message));
}

async function renderDispatch() {
    const data = await api("/api/dispatch");

    content.innerHTML = `
        ${heading("Dispatch management", "Prepare, verify and record outbound shipments.",
            `<button class="button" onclick="showDispatchForm()">+ Prepare dispatch</button>`)}
        <div class="panel">
            <div class="panel-heading"><h3>Dispatch register</h3><span>Outbound movements</span></div>
            ${table(["Reference", "Shipment", "Driver", "Truck", "Trailer", "Departure", "Status", "Action"],
                data.map(d => `
                    <tr>
                        <td><strong>${esc(d.dispatch_reference)}</strong></td>
                        <td>${esc(d.shipment_id)}</td>
                        <td>${esc(d.driver_name)}</td>
                        <td>${esc(d.registration)}</td>
                        <td>${esc(d.trailer_number || "—")}</td>
                        <td>${esc(d.departure_date)} ${esc(d.departure_time)}</td>
                        <td>${badge(d.status)}</td>
                        <td><button class="button small secondary" onclick="viewDispatch(${d.id})">View</button></td>
                    </tr>`))}
        </div>`;
}

async function viewDispatch(id) {
    const d = await api(`/api/dispatch/${id}`);

    openModal("Dispatch record", `
        <div class="summary-note">
            Dispatch reference: <strong>${esc(d.dispatch_reference)}</strong>
            ${badge(d.status)}
        </div>
        <div class="document-meta">
            <div><strong>Shipment</strong><br>${esc(d.shipment_id)}</div>
            <div><strong>Customer</strong><br>${esc(d.customer)}</div>
            <div><strong>Driver</strong><br>${esc(d.driver_name)}</div>
            <div><strong>Truck</strong><br>${esc(d.registration)}</div>
            <div><strong>Trailer</strong><br>${esc(d.trailer_number || "Not assigned")}</div>
            <div><strong>Departure</strong><br>${esc(d.departure_date)} ${esc(d.departure_time)}</div>
        </div>
        <div class="form-actions">
            <button class="button secondary" onclick="closeModal()">Close</button>
            <button class="button" onclick="printDispatch(${d.id})">Print dispatch note</button>
        </div>`);
}

async function printDispatch(id) {
    const d = await api(`/api/dispatch/${id}`);
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        toast("Allow pop-ups to print dispatch documents.");
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Elvara Dispatch Note</title>
        <style>
        body{font-family:Arial,sans-serif;padding:35px;color:#202923}
        h1{color:#173b30;font-size:30px}
        h2{font-size:18px;border-bottom:1px solid #ddd;padding-bottom:10px}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        td{padding:12px;border:1px solid #ddd;font-size:13px}
        .label{color:#777;width:35%}
        .signature{margin-top:65px;display:flex;justify-content:space-between}
        </style></head><body>
        <h1>elvara</h1><p>LOGISTICS | DISPATCH DOCUMENT</p>
        <h2>Dispatch note</h2>
        <table>
        <tr><td class="label">Dispatch reference</td><td>${esc(d.dispatch_reference)}</td></tr>
        <tr><td class="label">Shipment ID</td><td>${esc(d.shipment_id)}</td></tr>
        <tr><td class="label">Customer</td><td>${esc(d.customer)}</td></tr>
        <tr><td class="label">Destination</td><td>${esc(d.destination)}</td></tr>
        <tr><td class="label">Product</td><td>${esc(d.product)}</td></tr>
        <tr><td class="label">Boxes</td><td>${d.boxes}</td></tr>
        <tr><td class="label">Pallets</td><td>${d.pallet_count}</td></tr>
        <tr><td class="label">Driver</td><td>${esc(d.driver_name)}</td></tr>
        <tr><td class="label">Driver number</td><td>${esc(d.driver_number)}</td></tr>
        <tr><td class="label">Truck registration</td><td>${esc(d.registration)}</td></tr>
        <tr><td class="label">Trailer registration</td><td>${esc(d.trailer_number || "Not assigned")}</td></tr>
        <tr><td class="label">Departure</td><td>${esc(d.departure_date)} ${esc(d.departure_time)}</td></tr>
        </table>
        <p><strong>Handling instructions:</strong> ${esc(d.handling)}</p>
        <p>${esc(d.notes || "")}</p>
        <div class="signature">
            <span>________________________<br>Warehouse signature</span>
            <span>________________________<br>Driver signature</span>
        </div>
        <script>window.onload=()=>window.print();<\/script>
        </body></html>`);

    printWindow.document.close();
}

// INSPECTIONS
const inspectionItems = [
    "Tyres and wheel condition",
    "Brakes and steering",
    "Headlights and indicators",
    "Mirrors and windscreen",
    "Wipers and washers",
    "Horn and warning devices",
    "Vehicle body and doors",
    "Load securing equipment",
    "Fire extinguisher",
    "First aid kit",
    "Leaks and fluid levels",
    "Registration and required documents"
];

function showInspectionForm() {
    openModal("Vehicle inspection", `
        <form onsubmit="saveInspection(event)">
            <div class="form-grid">
                ${selectField("Inspection type", "inspection_type", ["Pre-trip", "Post-trip"])}
                <div class="form-field">
                    <label>Vehicle</label>
                    <select name="vehicle_id" id="inspectionVehicle" required></select>
                </div>
                <div class="form-field">
                    <label>Driver</label>
                    <select name="driver_id" id="inspectionDriver" required></select>
                </div>
                ${field("Inspection date", "inspection_date", "date", true, `value="${today()}"`)}
                ${field("Odometer reading", "odometer", "number", true, 'min="0"')}
            </div>

            <h4>Inspection checklist</h4>
            <p style="font-size:11px;color:#7b857e">Mark each item as passed or failed. Any failed item must be explained.</p>

            <div class="check-list">
                ${inspectionItems.map((item, i) => `
                    <div class="check-item">
                        <input type="checkbox" name="check_${i}" checked>
                        <span>${item}</span>
                    </div>`).join("")}
            </div>

            <div class="form-field" style="margin-top:15px">
                <label>Defects / comments</label>
                <textarea name="comments" placeholder="Describe defects, damage or incidents..."></textarea>
            </div>

            ${formActions()}
        </form>`);

    Promise.all([api("/api/vehicles"), api("/api/drivers")]).then(([vehicles, drivers]) => {
        document.getElementById("inspectionVehicle").innerHTML =
            vehicles.map(v => `<option value="${v.id}">${esc(v.registration)}</option>`).join("");

        document.getElementById("inspectionDriver").innerHTML =
            drivers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    }).catch(error => toast(error.message));
}

async function saveInspection(event) {
    event.preventDefault();

    const form = event.target;
    const fd = new FormData(form);
    const checks = inspectionItems.map((item, i) => ({
        item,
        passed: fd.get(`check_${i}`) === "on"
    }));

    const data = {
        inspection_type: fd.get("inspection_type"),
        vehicle_id: fd.get("vehicle_id"),
        driver_id: fd.get("driver_id"),
        inspection_date: fd.get("inspection_date"),
        odometer: fd.get("odometer"),
        checks,
        comments: fd.get("comments")
    };

    try {
        const result = await api("/api/inspections", {
            method: "POST",
            body: JSON.stringify(data)
        });

        closeModal();
        toast(result.passed ? "Inspection passed." : "Inspection failed. Review the defects.");
        await renderPage("inspections");
    } catch (error) {
        toast(error.message);
    }
}

async function renderInspections() {
    const data = await api("/api/inspections");
    cached.inspections = data;

    content.innerHTML = `
        ${heading("Vehicle inspections", "Record pre-trip and post-trip safety checks.",
            `<button class="button" onclick="showInspectionForm()">+ New inspection</button>`)}
        <div class="summary-note">
            A pre-trip inspection must pass before dispatch. Failed checks should be recorded
            and the vehicle must not be used until it has been assessed and cleared.
        </div>
        <div class="panel">
            <div class="panel-heading"><h3>Inspection history</h3><span>${data.length} records</span></div>
            ${table(["Inspection", "Date", "Vehicle", "Driver", "Odometer", "Result", "Comments"],
                data.map(i => `
                    <tr>
                        <td>${esc(i.inspection_type)}</td>
                        <td>${esc(i.inspection_date)}</td>
                        <td>${esc(i.registration)}</td>
                        <td>${esc(i.driver_name)}</td>
                        <td>${esc(i.odometer)}</td>
                        <td>${badge(i.result)}</td>
                        <td>${esc(i.comments || "—")}</td>
                    </tr>`))}
        </div>`;
}

// DOCUMENTS
async function renderDocuments() {
    const data = await api("/api/dispatch");

    content.innerHTML = `
        ${heading("Dispatch documentation", "Generate and print operational dispatch documents.")}
        <div class="panel">
            <div class="panel-heading"><h3>Available dispatch documents</h3><span>Print-ready records</span></div>
            ${table(["Dispatch reference", "Shipment", "Customer", "Truck", "Departure", "Document"],
                data.map(d => `
                    <tr>
                        <td><strong>${esc(d.dispatch_reference)}</strong></td>
                        <td>${esc(d.shipment_id)}</td>
                        <td>${esc(d.customer)}</td>
                        <td>${esc(d.registration)}</td>
                        <td>${esc(d.departure_date)}</td>
                        <td><button class="button small" onclick="printDispatch(${d.id})">Print document</button></td>
                    </tr>`))}
        </div>
        <div class="summary-note">
            Dispatch notes include shipment details, customer destination, pallet and box quantities,
            driver information, truck and trailer registrations, departure details and signature spaces.
        </div>`;
}

// INITIALISE
renderPage("dashboard").catch(error => {
    content.innerHTML = `<div class="panel">${esc(error.message)}</div>`;
});