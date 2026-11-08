import json
import sqlite3
import math
import mimetypes
from pathlib import Path
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "elvara_logistics.db"
HOST = "127.0.0.1"
PORT = 8000

PALLET_CAPACITY = 30
MAX_TRUCK_PALLETS = 10


def connect():
    db = sqlite3.connect(DB_FILE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def initialise_database():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id TEXT NOT NULL UNIQUE,
            customer TEXT NOT NULL,
            category TEXT NOT NULL,
            product TEXT NOT NULL,
            boxes INTEGER NOT NULL CHECK(boxes > 0),
            handling TEXT NOT NULL,
            destination TEXT NOT NULL,
            dispatch_date TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'Registered',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            driver_number TEXT NOT NULL UNIQUE,
            phone TEXT NOT NULL,
            licence_number TEXT NOT NULL,
            licence_code TEXT NOT NULL,
            licence_expiry TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            registration TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            trailer_number TEXT,
            max_pallets INTEGER NOT NULL DEFAULT 10,
            odometer INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS pallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pallet_code TEXT NOT NULL UNIQUE,
            shipment_id INTEGER NOT NULL,
            boxes INTEGER NOT NULL CHECK(boxes > 0 AND boxes <= 30),
            created_at TEXT NOT NULL,
            FOREIGN KEY(shipment_id) REFERENCES shipments(id)
        );

        CREATE TABLE IF NOT EXISTS inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_type TEXT NOT NULL,
            vehicle_id INTEGER NOT NULL,
            driver_id INTEGER NOT NULL,
            inspection_date TEXT NOT NULL,
            odometer INTEGER NOT NULL,
            checks TEXT NOT NULL,
            result TEXT NOT NULL,
            comments TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
            FOREIGN KEY(driver_id) REFERENCES drivers(id)
        );

        CREATE TABLE IF NOT EXISTS dispatches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dispatch_reference TEXT NOT NULL UNIQUE,
            shipment_id INTEGER NOT NULL UNIQUE,
            driver_id INTEGER NOT NULL,
            vehicle_id INTEGER NOT NULL,
            departure_date TEXT NOT NULL,
            departure_time TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Dispatched',
            created_at TEXT NOT NULL,
            FOREIGN KEY(shipment_id) REFERENCES shipments(id),
            FOREIGN KEY(driver_id) REFERENCES drivers(id),
            FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
        );
        """)


def as_dict(row):
    return dict(row) if row else None


def get_shipment(db, shipment_id):
    return db.execute(
        "SELECT * FROM shipments WHERE id = ?", (shipment_id,)
    ).fetchone()


def shipment_details(db, shipment):
    data = as_dict(shipment)
    if not data:
        return None

    result = db.execute(
        "SELECT COUNT(*) AS count FROM pallets WHERE shipment_id = ?",
        (data["id"],)
    ).fetchone()

    data["pallet_count"] = result["count"]
    return data


def get_dispatch_rows(db):
    return db.execute("""
        SELECT
            d.*,
            s.shipment_id,
            s.customer,
            s.destination,
            s.product,
            s.category,
            s.boxes,
            s.handling,
            s.notes,
            dr.name AS driver_name,
            dr.driver_number,
            v.registration,
            v.trailer_number,
            (SELECT COUNT(*) FROM pallets p WHERE p.shipment_id = s.id)
                AS pallet_count
        FROM dispatches d
        JOIN shipments s ON s.id = d.shipment_id
        JOIN drivers dr ON dr.id = d.driver_id
        JOIN vehicles v ON v.id = d.vehicle_id
        ORDER BY d.id DESC
    """).fetchall()


def send_json(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def error(handler, message, status=400):
    send_json(handler, {"error": message}, status)


class ElvaraHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 2_000_000:
            raise ValueError("Request is too large.")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if not path.startswith("/api/"):
            return super().do_GET()

        try:
            with connect() as db:

                if path == "/api/summary":
                    shipments = db.execute(
                        "SELECT COUNT(*) AS n FROM shipments"
                    ).fetchone()["n"]

                    pallets = db.execute(
                        "SELECT COUNT(*) AS n FROM pallets"
                    ).fetchone()["n"]

                    drivers = db.execute(
                        "SELECT COUNT(*) AS n FROM drivers"
                    ).fetchone()["n"]

                    dispatched = db.execute(
                        "SELECT COUNT(*) AS n FROM dispatches"
                    ).fetchone()["n"]

                    recent_rows = db.execute("""
                        SELECT s.*,
                            (SELECT COUNT(*) FROM pallets p
                             WHERE p.shipment_id=s.id) AS pallet_count
                        FROM shipments s
                        ORDER BY s.id DESC LIMIT 8
                    """).fetchall()

                    return send_json(self, {
                        "shipments": shipments,
                        "pallets": pallets,
                        "drivers": drivers,
                        "dispatched": dispatched,
                        "recent": [as_dict(r) for r in recent_rows]
                    })

                if path == "/api/shipments":
                    rows = db.execute("""
                        SELECT s.*,
                            (SELECT COUNT(*) FROM pallets p
                             WHERE p.shipment_id=s.id) AS pallet_count
                        FROM shipments s ORDER BY s.id DESC
                    """).fetchall()
                    return send_json(self, [as_dict(r) for r in rows])

                if path.startswith("/api/shipments/"):
                    record_id = int(path.split("/")[-1])
                    row = get_shipment(db, record_id)
                    if not row:
                        return error(self, "Shipment not found.", 404)
                    return send_json(self, shipment_details(db, row))

                if path == "/api/pallets":
                    shipment_filter = query.get("shipment_id", [None])[0]

                    sql = """
                        SELECT p.*, s.shipment_id, s.category, s.handling
                        FROM pallets p
                        JOIN shipments s ON s.id=p.shipment_id
                    """
                    params = []

                    if shipment_filter:
                        sql += " WHERE p.shipment_id=?"
                        params.append(int(shipment_filter))

                    sql += " ORDER BY p.id DESC"
                    rows = db.execute(sql, params).fetchall()
                    return send_json(self, [as_dict(r) for r in rows])

                if path == "/api/drivers":
                    rows = db.execute(
                        "SELECT * FROM drivers ORDER BY name"
                    ).fetchall()
                    return send_json(self, [as_dict(r) for r in rows])

                if path == "/api/vehicles":
                    rows = db.execute(
                        "SELECT * FROM vehicles ORDER BY registration"
                    ).fetchall()
                    return send_json(self, [as_dict(r) for r in rows])

                if path == "/api/inspections":
                    rows = db.execute("""
                        SELECT i.*, v.registration, dr.name AS driver_name
                        FROM inspections i
                        JOIN vehicles v ON v.id=i.vehicle_id
                        JOIN drivers dr ON dr.id=i.driver_id
                        ORDER BY i.id DESC
                    """).fetchall()
                    return send_json(self, [as_dict(r) for r in rows])

                if path == "/api/dispatch":
                    return send_json(
                        self, [as_dict(r) for r in get_dispatch_rows(db)]
                    )

                if path.startswith("/api/dispatch/"):
                    record_id = int(path.split("/")[-1])
                    rows = get_dispatch_rows(db)
                    match = next(
                        (as_dict(r) for r in rows if r["id"] == record_id),
                        None
                    )
                    if not match:
                        return error(self, "Dispatch record not found.", 404)
                    return send_json(self, match)

                return error(self, "API route not found.", 404)

        except (ValueError, sqlite3.Error) as exc:
            return error(self, str(exc))

    def do_POST(self):
        path = urlparse(self.path).path

        try:
            data = self.read_body()

            with connect() as db:

                # REGISTER SHIPMENT
                if path == "/api/shipments":
                    required = [
                        "shipment_id", "customer", "category", "product",
                        "boxes", "handling", "destination"
                    ]

                    if any(not str(data.get(k, "")).strip() for k in required):
                        return error(self, "Please complete all required shipment fields.")

                    category = data["category"].strip()
                    if category not in ["Cosmetics", "Homeware"]:
                        return error(self, "Choose a valid product category.")

                    boxes = int(data["boxes"])
                    if boxes < 1:
                        return error(self, "Box quantity must be at least 1.")

                    db.execute("""
                        INSERT INTO shipments (
                            shipment_id, customer, category, product, boxes,
                            handling, destination, dispatch_date, notes, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        data["shipment_id"].strip(),
                        data["customer"].strip(),
                        category,
                        data["product"].strip(),
                        boxes,
                        data["handling"],
                        data["destination"].strip(),
                        data.get("dispatch_date", ""),
                        data.get("notes", ""),
                        datetime.now().isoformat(timespec="seconds")
                    ))

                    return send_json(self, {"message": "Shipment registered."}, 201)

                # REGISTER DRIVER
                if path == "/api/drivers":
                    required = [
                        "name", "driver_number", "phone",
                        "licence_number", "licence_code", "licence_expiry"
                    ]

                    if any(not str(data.get(k, "")).strip() for k in required):
                        return error(self, "Complete all driver details.")

                    db.execute("""
                        INSERT INTO drivers (
                            name, driver_number, phone, licence_number,
                            licence_code, licence_expiry
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    """, tuple(data[k].strip() for k in required))

                    return send_json(self, {"message": "Driver registered."}, 201)

                # REGISTER VEHICLE
                if path == "/api/vehicles":
                    registration = str(data.get("registration", "")).strip()
                    description = str(data.get("description", "")).strip()

                    if not registration or not description:
                        return error(self, "Truck registration and description are required.")

                    capacity = int(data.get("max_pallets", MAX_TRUCK_PALLETS))

                    if capacity < 1 or capacity > MAX_TRUCK_PALLETS:
                        return error(self, "Truck capacity cannot exceed 10 pallets.")

                    db.execute("""
                        INSERT INTO vehicles (
                            registration, description, trailer_number,
                            max_pallets, odometer
                        ) VALUES (?, ?, ?, ?, ?)
                    """, (
                        registration,
                        description,
                        data.get("trailer_number", ""),
                        capacity,
                        int(data.get("odometer") or 0)
                    ))

                    return send_json(self, {"message": "Vehicle registered."}, 201)

                # ALLOCATE PALLETS
                if path == "/api/pallets/allocate":
                    shipment_id = int(data["shipment_id"])
                    requested = int(data["pallet_count"])

                    shipment = get_shipment(db, shipment_id)
                    if not shipment:
                        return error(self, "Shipment not found.", 404)

                    if requested < 1:
                        return error(self, "Allocate at least one pallet.")

                    if shipment["status"] == "Dispatched":
                        return error(self, "This shipment has already been dispatched.")

                    existing = db.execute("""
                        SELECT COALESCE(SUM(boxes), 0) AS boxes
                        FROM pallets WHERE shipment_id=?
                    """, (shipment_id,)).fetchone()["boxes"]

                    remaining = shipment["boxes"] - existing

                    if remaining <= 0:
                        return error(self, "All shipment boxes have already been allocated.")

                    minimum = math.ceil(remaining / PALLET_CAPACITY)

                    if requested < minimum:
                        return error(
                            self,
                            f"{remaining} boxes remain. At least {minimum} more pallet(s) are required."
                        )

                    if requested > remaining:
                        return error(self, "You cannot allocate more pallets than remaining boxes.")

                    for index in range(requested):
                        boxes = min(PALLET_CAPACITY, remaining)
                        remaining -= boxes

                        code = (
                            f"ELV-{shipment['shipment_id']}-"
                            f"{existing + index + 1:03d}"
                        )

                        db.execute("""
                            INSERT INTO pallets (
                                pallet_code, shipment_id, boxes, created_at
                            ) VALUES (?, ?, ?, ?)
                        """, (
                            code,
                            shipment_id,
                            boxes,
                            datetime.now().isoformat(timespec="seconds")
                        ))

                    total = db.execute("""
                        SELECT COALESCE(SUM(boxes),0) AS total
                        FROM pallets WHERE shipment_id=?
                    """, (shipment_id,)).fetchone()["total"]

                    status = "Allocated" if total == shipment["boxes"] else "Registered"

                    db.execute(
                        "UPDATE shipments SET status=? WHERE id=?",
                        (status, shipment_id)
                    )

                    return send_json(self, {
                        "message": "Pallets allocated.",
                        "allocated_boxes": total
                    }, 201)

                # SAVE VEHICLE INSPECTION
                if path == "/api/inspections":
                    inspection_type = data.get("inspection_type")

                    if inspection_type not in ["Pre-trip", "Post-trip"]:
                        return error(self, "Invalid inspection type.")

                    checks = data.get("checks", [])
                    if not checks:
                        return error(self, "Inspection checklist is missing.")

                    passed = all(item.get("passed") for item in checks)
                    result = "Passed" if passed else "Failed"

                    db.execute("""
                        INSERT INTO inspections (
                            inspection_type, vehicle_id, driver_id,
                            inspection_date, odometer, checks, result,
                            comments, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        int(data["vehicle_id"]),
                        int(data["driver_id"]),
                        data["inspection_date"],
                        int(data["odometer"]),
                        json.dumps(checks),
                        result,
                        data.get("comments", ""),
                        datetime.now().isoformat(timespec="seconds")
                    ))

                    return send_json(self, {
                        "message": "Inspection recorded.",
                        "passed": passed,
                        "result": result
                    }, 201)

                # CREATE DISPATCH
                if path == "/api/dispatch":
                    shipment_id = int(data["shipment_id"])
                    driver_id = int(data["driver_id"])
                    vehicle_id = int(data["vehicle_id"])

                    shipment = get_shipment(db, shipment_id)
                    if not shipment:
                        return error(self, "Shipment not found.", 404)

                    if shipment["status"] == "Dispatched":
                        return error(self, "Shipment has already been dispatched.")

                    driver = db.execute(
                        "SELECT * FROM drivers WHERE id=?", (driver_id,)
                    ).fetchone()

                    vehicle = db.execute(
                        "SELECT * FROM vehicles WHERE id=?", (vehicle_id,)
                    ).fetchone()

                    if not driver or not vehicle:
                        return error(self, "Select a valid driver and vehicle.")

                    if driver["licence_expiry"] < datetime.now().strftime("%Y-%m-%d"):
                        return error(self, "Driver's licence has expired.")

                    pallet_data = db.execute("""
                        SELECT COUNT(*) AS count, COALESCE(SUM(boxes),0) AS boxes
                        FROM pallets WHERE shipment_id=?
                    """, (shipment_id,)).fetchone()

                    pallet_count = pallet_data["count"]

                    if pallet_data["boxes"] != shipment["boxes"]:
                        return error(
                            self,
                            "All shipment boxes must be allocated before dispatch."
                        )

                    if pallet_count < 1:
                        return error(self, "No pallets have been allocated.")

                    if pallet_count > vehicle["max_pallets"]:
                        return error(
                            self,
                            f"Vehicle capacity is {vehicle['max_pallets']} pallets. "
                            f"This shipment requires {pallet_count}."
                        )

                    if pallet_count > MAX_TRUCK_PALLETS:
                        return error(self, "Truck limit is 10 pallets.")

                    pretrip = db.execute("""
                        SELECT * FROM inspections
                        WHERE vehicle_id=? AND driver_id=?
                        AND inspection_type='Pre-trip'
                        ORDER BY id DESC LIMIT 1
                    """, (vehicle_id, driver_id)).fetchone()

                    if not pretrip:
                        return error(
                            self,
                            "A pre-trip inspection is required for this driver and vehicle."
                        )

                    if pretrip["result"] != "Passed":
                        return error(
                            self,
                            "The latest pre-trip inspection failed. Dispatch is blocked."
                        )

                    if pretrip["inspection_date"] != data.get("departure_date"):
                        return error(
                            self,
                            "The pre-trip inspection must be recorded on the departure date."
                        )

                    reference = str(
                        data.get("dispatch_reference", "")
                    ).strip()

                    if not reference:
                        reference = f"ELV-DSP-{datetime.now():%Y%m%d%H%M%S}"

                    db.execute("""
                        INSERT INTO dispatches (
                            dispatch_reference, shipment_id, driver_id,
                            vehicle_id, departure_date, departure_time,
                            status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 'Dispatched', ?)
                    """, (
                        reference,
                        shipment_id,
                        driver_id,
                        vehicle_id,
                        data["departure_date"],
                        data["departure_time"],
                        datetime.now().isoformat(timespec="seconds")
                    ))

                    db.execute(
                        "UPDATE shipments SET status='Dispatched' WHERE id=?",
                        (shipment_id,)
                    )

                    return send_json(self, {
                        "message": "Shipment dispatched.",
                        "dispatch_reference": reference
                    }, 201)

                return error(self, "API route not found.", 404)

        except sqlite3.IntegrityError as exc:
            message = str(exc)

            if "UNIQUE constraint failed" in message:
                return error(self, "This record already exists. Check the reference or registration.")

            return error(self, "Database validation failed: " + message)

        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            return error(self, "Invalid information supplied: " + str(exc))

        except sqlite3.Error as exc:
            return error(self, "Database error: " + str(exc), 500)


if __name__ == "__main__":
    initialise_database()

    print("=" * 55)
    print("          ELVARA LOGISTICS SYSTEM")
    print("=" * 55)
    print("Database:", DB_FILE)
    print(f"Application: http://{HOST}:{PORT}")
    print("Press CTRL + C to stop the server.")
    print("=" * 55)

    server = ThreadingHTTPServer((HOST, PORT), ElvaraHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nElvara Logistics server stopped.")
        server.server_close()