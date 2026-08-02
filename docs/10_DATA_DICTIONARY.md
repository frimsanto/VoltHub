# 10 — DATA DICTIONARY

**Product:** VoltHub V2
**Version:** 1.0
**Status:** Approved Draft
**Source:** `dokumen_lengkap/DATA DICTIONARY.docx` (extended with ERD column names)

---

## Purpose

The official reference for the definition of all data used in VoltHub. It aligns the understanding of **Business Users, Developers, and QA**, and serves as the reference for integration.

> **Preserved business terminology** (do not rename): `INSCAN`, `OOP`, `UNKNOWN`, `VIP`, `VVIP`, `NON_VIP`.

---

## SITE (GARDU)

| Field | Type | Description | Allowed values / Example | Rule |
|-------|------|-------------|--------------------------|------|
| `site_id` | UUID | Primary key of Gardu | — | PK |
| `site_code` | string | Unique Gardu code | `BT104`, `BT105`, `CD55` | **Globally unique** (BR-004) |
| `site_name` | string | Gardu name | — | — |
| `position_order` | int | Gardu position on the Penyulang | — | — |
| `rc_status` | enum | RC communication status | `INSCAN`, `OOP`, `UNKNOWN` | — |
| `vip_status` | enum | VIP customer status | `VVIP`, `VIP`, `NON_VIP` | — |
| `operational_status` | enum | Gardu operational status | `ACTIVE`, `INACTIVE`, `MAINTENANCE` | — |
| `feeder_id` | UUID | Parent Penyulang | — | FK, required (BR-001) |
| `up3_id` | UUID | Parent UP3 | — | FK, required (BR-002) |
| `rtupp_id` | UUID | Parent RTUPP | — | FK, required (BR-003) |
| `latitude` | decimal | Coordinate | — | — |
| `longitude` | decimal | Coordinate | — | — |
| `address` | text | Address | — | — |
| `remarks` | text | Notes | — | — |
| `deleted_at` | datetime | Soft-delete marker | — | Soft delete |

## FEEDER (PENYULANG)

| Field | Type | Description |
|-------|------|-------------|
| `feeder_id` | UUID | Primary key of Penyulang |
| `feeder_code` | string | Penyulang code |
| `feeder_name` | string | Penyulang name |
| `condition_status` | enum | Penyulang condition |
| `is_active` | bool | Active status |

> ⚠️ `condition_status` allowed values for Penyulang are **not enumerated** in the source. Confirm (e.g. Sehat/Bermasalah).

## ASSET

| Field | Type | Description | Allowed values | Rule |
|-------|------|-------------|----------------|------|
| `asset_id` | UUID | Primary key of Asset | — | PK |
| `asset_number` | string | Asset number | — | **Unique** (BR-007) |
| `serial_number` | string | Vendor serial number | — | Unique where present |
| `brand` | string | Merk | — | — |
| `model` | string | Model | — | — |
| `manufacture_year` | int | Procurement/manufacture year | — | — |
| `condition_status` | enum | Condition | `GOOD`, `FAIR`, `DAMAGED`, `CRITICAL` | — |
| `lifecycle_status` | enum | Lifecycle | `INSTALLED`, `ACTIVE`, `MAINTENANCE`, `REPAIR`, `RETIRED`, `DISPOSED` | RETIRED not reusable (BR-009) |
| `site_id` | UUID | Parent Gardu | — | FK, required (BR-006) |
| `asset_type_id` | UUID | Asset type | — | FK |

## PERFORMANCE

| Field | Type | Description | Allowed values |
|-------|------|-------------|----------------|
| `performance_date` | date | Performance record date | — |
| `performance_status` | int | Daily monitoring result | `1` = Berhasil, `0` = Gagal |
| `score` | number | Performance value | Range `0 – 100` |
| `site_id` | UUID | Parent Gardu | FK, required |

> One record per Gardu per date (BR-012). Manual entry forbidden (BR-010/011).

## INSPECTION

| Field | Type | Description | Allowed values |
|-------|------|-------------|----------------|
| `inspection_id` | UUID | PK | — |
| `inspection_number` | string | Inspection number | — |
| `inspection_date` | date | Inspection date (required, BR-013) | — |
| `inspector_id` | UUID | Petugas (required, BR-014) | FK |
| `status` | enum | Workflow status | `Draft`, `Submitted`, `Approved` |
| `notes` | text | Catatan | — |

### INSPECTION_FINDINGS
`finding_id` (UUID, PK), `inspection_id` (FK), `category`, `severity`, `finding`, `recommendation`.

## HAR

| Field | Type | Description | Allowed values |
|-------|------|-------------|----------------|
| `har_id` | UUID | PK | — |
| `har_number` | string | HAR number | — |
| `har_date` | date | HAR date (required, BR-017) | — |
| `technician_id` | UUID | Petugas | FK |
| `status` | enum | Workflow status | `Draft`, `Submitted`, `Closed` |
| `notes` | text | Catatan | — |

## TICKET

| Field | Type | Description | Allowed values |
|-------|------|-------------|----------------|
| `ticket_id` | UUID | PK | — |
| `ticket_number` | string | Ticket number | — |
| `category` | enum | Category | ⚠️ not enumerated in source |
| `priority` | enum | Priority | `Low`, `Medium`, `High`, `Critical` |
| `status` | enum | Status | `Open`, `Assigned`, `In Progress`, `Resolved`, `Closed` |
| `assigned_to` | UUID | Assignee | FK |
| `site_id` | UUID | Parent Gardu | FK, required |

## ATTACHMENT

`attachment_id`, `entity_type` (`site`/`asset`/`inspection`/`har`/`ticket`), `entity_id`, `file_name`, `file_url`, `mime_type`, `file_size`, `uploaded_by`.

## USER / ROLE

**users:** `user_id`, `role_id`, `rtupp_id`, `full_name`, `username`, `email`, `password_hash`, `is_active`, `last_login`.
**roles:** `role_id`, `name`, `description`.

## AUDIT_LOG

`audit_id`, `entity_type`, `entity_id`, `action` (`CREATE`/`UPDATE`/`DELETE`/`STATUS_CHANGE`), `old_value`, `new_value`, `performed_by`, `performed_at`. **Retention ≥ 5 years.** Immutable (BR-018).

---

*END OF DATA DICTIONARY*
