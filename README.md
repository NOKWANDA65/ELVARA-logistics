# ELVARA LOGISTICS
### Warehouse & Dispatch Management System

**A warehouse, inventory allocation and dispatch management application built with HTML, CSS, JavaScript, Python and SQLite.**

---

## 1. About the Project

Elvara Logistics is a warehouse and dispatch management system designed to simplify shipment registration, pallet allocation, fleet management and dispatch operations.

The system provides a centralised platform for managing warehouse activities, monitoring shipment progress and maintaining dispatch records.

It is designed around practical warehouse workflows, with a focus on accuracy, operational efficiency, stock control and transportation safety.

## 2. Key Features

### Dashboard
- View warehouse activity at a glance.
- Monitor shipment and dispatch statistics.
- Track operational records.

### Shipment Management
- Register incoming shipments.
- Capture shipment references and product categories.
- Record box quantities and shipment details.
- Monitor shipment status.

### Pallet Allocation
- Allocate shipment boxes to pallets.
- Maximum capacity of 30 boxes per pallet.
- Automatically calculate pallet requirements.
- Keep Cosmetics and Homeware on separate pallets.
- Track pallet allocation progress.

### Driver Management
- Register and manage drivers.
- Capture driver information.
- Record driving licence details.
- Validate licence expiry during dispatch.

### Vehicle Management
- Register trucks and delivery vehicles.
- Capture vehicle details and registration information.
- Monitor vehicle availability and dispatch assignments.

### Dispatch Management
- Create dispatch records.
- Assign drivers and vehicles.
- Validate shipment pallet allocation.
- Enforce a maximum truck capacity of 10 pallets.
- Generate dispatch references and documentation.

### Vehicle Inspections
- Complete pre-trip inspections.
- Complete post-trip inspections.
- Record inspection results and comments.
- Check vehicle and operational safety before dispatch.

### Documentation
- View dispatch records.
- Generate printable dispatch documentation.
- Maintain a record of dispatch activity.

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Interface design and styling |
| JavaScript | Frontend functionality |
| Python | Backend processing and API |
| SQLite | Database management |

The application uses Python's built-in libraries and SQLite. No Node.js or npm installation is required.

## 4. Business Rules

The system incorporates the following warehouse operating rules:

- A standard pallet accommodates a maximum of 30 boxes.
- Cosmetics and Homeware must not be mixed on the same pallet.
- Cosmetics and Homeware may be transported on the same truck, provided they remain on separate pallets.
- A truck may carry a maximum of 10 pallets.
- Shipments must be fully allocated before dispatch.
- A valid driver and vehicle must be assigned before dispatch.
- The driver's licence must be valid on the dispatch date.
- A successful pre-trip inspection is required before dispatch.

## 5. Project Structure

```text
ELVARA-LOGISTICS/
│
├── index.html          # Application interface
├── styles.css         # Application styling
├── app.js             # Frontend functionality
├── server.py          # Python backend and API
├── README.md          # Project documentation
│
└── elvara_logistics.db # SQLite database (created automatically)
```

## 6. Installation and Setup

### Requirements

- Windows, macOS or Linux.
- Python 3 installed.
- Visual Studio Code (recommended).

### Step 1: Download the Project

Clone the repository:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
```

Alternatively, download the repository as a ZIP file from GitHub and extract it.

### Step 2: Open in Visual Studio Code

Open the extracted `ELVARA-LOGISTICS` folder in Visual Studio Code.

### Step 3: Start the Application

Open the VS Code terminal and run:

```bash
python server.py
```

If your Windows system uses the Python launcher, run:

```bash
py server.py
```

### Step 4: Open the Application

Open your browser and navigate to:

```text
http://127.0.0.1:8000
```

The application will initialise its SQLite database automatically when the server starts.

**Important:** Keep the Python terminal running while using the application.

## 7. Database

Elvara Logistics uses SQLite to store operational information, including:

- Shipments
- Drivers
- Vehicles
- Pallet allocations
- Dispatch records
- Vehicle inspections

The database file is created automatically by the backend.

## 8. Project Purpose

This project demonstrates the application of software development principles to real-world warehouse and logistics operations.

It combines inventory management, data storage, operational controls and dispatch workflows into one integrated application.

It can also serve as a foundation for future
