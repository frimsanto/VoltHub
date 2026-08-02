# 04 — ASSET TAXONOMY & DOMAIN MODEL

**Product:** VoltHub V2
**Version:** 2.0
**Status:** LOCKED AS DOMAIN BASELINE
**Source:** `dokumen_lengkap/ASSET TAXONOMY & DOMAIN MODEL.docx`
**Architecture Style:** Gardu-Centric Operational Architecture

---

## 1. Domain Hierarchy

```
LEVEL 1  ORGANIZATION
LEVEL 2  NETWORK
LEVEL 3  SITE
LEVEL 4  ASSET
LEVEL 5  OPERATION
```

**Visual model**

```
UID
 └─ RTUPP
     └─ UP3
         └─ Penyulang
             └─ Gardu  (SITE — core entity)
                 └─ Asset
                     └─ Inspection / HAR / Performance / Ticket
```

---

## 2. Organization Domain

- **UID** — highest entity. Example: *UID Jakarta Raya*.
- **RTUPP** — operational management group. Examples: RTUPP 2, RTUPP 3, RTUPP 4, RTUPP 5.
- **UP3** — operational unit. Examples: Bintaro, Bulungan, Marunda, Cempaka Putih.

**Relationships:** UID `1→N` RTUPP; RTUPP `1→N` UP3.

## 3. Network Domain

- **Penyulang (Feeder)** — distribution line. Data: Kode Penyulang, Nama Penyulang, Status, Kondisi.
- **Relationship:** UP3 `1→N` Penyulang.

## 4. Site Domain

- **Gardu** — Core Entity of VoltHub. All activity centres on the Gardu.
- **Main data:** Kode Gardu, Nama Gardu, RTUPP, UP3, Penyulang, Posisi, Status RC, Status VIP, Koordinat, Status Operasional.
- **Relationship:** Penyulang `1→N` Gardu.

## 5. Gardu Classification

> **Preserved business terminology** — these enumerations are canonical and must not be renamed.

| Classification | Allowed values |
|----------------|----------------|
| **Status RC** | `INSCAN`, `OOP`, `UNKNOWN` |
| **VIP Status** | `VIP`, `VVIP`, `NON_VIP` |
| **Operational Status** | `ACTIVE`, `INACTIVE`, `MAINTENANCE` |

---

## 6. Asset Domain

Asset always resides inside a Gardu. **There must be no Asset without a Gardu.**

> **Rule:** *Asset MUST BELONG TO one Gardu.* (See BR-006 in [11_BUSINESS_RULES.md](11_BUSINESS_RULES.md).)

## 7. Asset Category (Level 1)

`Power` · `Communication` · `Control` · `Infrastructure` · `Supporting`

### 8. Power Category
Battery · Power Supply · Rectifier · Charger · MCB · Panel DC · Panel AC · UPS

### 9. Communication Category
Modem · Router · Switch · Antena · SIM Card · Gateway

### 10. Control Category
RTU · RC · SCADA Device · Controller · PLC · IO Module

### 11. Infrastructure Category
Rack · Cabinet · Shelter · Grounding · Lightning Protection

### 12. Supporting Category
Sensor · CCTV · Access Door · Cooling System · Monitoring Device

---

## 13. Asset Lifecycle

```
Asset → Installed → Active → Maintenance → Repair → Retired → Disposed
```

**Asset Status values:** `Active`, `Standby`, `Maintenance`, `Damaged`, `Retired`.

> Note: The [10_DATA_DICTIONARY.md](10_DATA_DICTIONARY.md) defines `lifecycle_status` as `INSTALLED, ACTIVE, MAINTENANCE, REPAIR, RETIRED, DISPOSED` and `condition_status` as `GOOD, FAIR, DAMAGED, CRITICAL`. The taxonomy "Status Asset" list above (Active/Standby/Maintenance/Damaged/Retired) overlaps both; the Data Dictionary enumerations are treated as the authoritative column definitions. ⚠️ See conflict note in the status report.

---

## 14. Operation Domain

Operational data is **not** stored on the Asset — it is stored on the **Gardu**.

**Operational objects:** Inspection, HAR, Performance, Ticket.

### 15. Inspection Domain
Inspection is a Gardu inspection activity. Gardu `1→N` Inspection. Data: Date, Inspector, Findings, Notes, Photos.

### 16. HAR Domain
HAR is a maintenance activity. Gardu `1→N` HAR. Data: Date, Technician, Notes, Attachments.

### 17. Performance Domain
Performance is the daily performance history of a Gardu. Gardu `1→N` Performance Records. Data: Date, Status, Score.

### 18. Ticket Domain
Ticket represents an operational issue. Gardu `1→N` Tickets. Data: Category, Priority, Status, Assigned To.

---

## 19. Document Domain

Every object can hold documents. **Supported objects:** Gardu, Asset, Inspection, HAR, Ticket.
**Document types:** Photo, PDF, Excel, Word, Drawing.

## 20. Audit Domain

Every object must have an audit trail. **Tracked:** Create, Update, Delete, Status Change.

## 21. Future Extension Domain (prepared from the start)

GIS · SCADA · RC Monitoring · IoT Sensor · WhatsApp Notification · Mobile Application.

---

## 22. Final Taxonomy Decision

| Domain group | Entities |
|--------------|----------|
| **Core** | Gardu |
| **Supporting** | Penyulang, Asset |
| **Operation** | Inspection, HAR, Performance, Ticket |
| **Admin** | User, Role, Audit |

**Architecture Style:** Gardu-Centric Operational Architecture — **LOCKED AS DOMAIN BASELINE.**
