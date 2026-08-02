// VoltHub — Document categories.
//
// The requirement defines 8 business categories (Foto Gardu, Inspection, HAR,
// Work Order, BAST, SOP, Drawing, Lainnya). The backend `documentType` enum is
// fixed at 6 values and CANNOT change ("no backend changes"), so the 8 UI
// categories are mapped onto the 6 persisted enum values below. Two enum slots
// carry a pair (MANUAL_BOOK ← SOP/HAR, BERITA_ACARA ← BAST/Work Order); the list
// shows a combined label for those. Upload offers all 8 categories; the filter
// uses the 6 persisted types so a chosen filter maps 1:1 to a query.
import {
  FileText,
  Camera,
  ClipboardCheck,
  ShieldCheck,
  Ticket,
  FileSignature,
  BookOpen,
  PenTool,
  type LucideIcon,
} from "lucide-react";
import type { DocumentType } from "@/lib/v2/enums";

export const DOCUMENT_CATEGORIES = [
  "FOTO_GARDU",
  "INSPECTION",
  "HAR",
  "WORK_ORDER",
  "BAST",
  "SOP",
  "DRAWING",
  "LAINNYA",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  FOTO_GARDU: "Foto Gardu",
  INSPECTION: "Inspection",
  HAR: "HAR",
  WORK_ORDER: "Work Order",
  BAST: "BAST",
  SOP: "SOP",
  DRAWING: "Drawing",
  LAINNYA: "Lainnya",
};

export const DOCUMENT_CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
  FOTO_GARDU: Camera,
  INSPECTION: ClipboardCheck,
  HAR: ShieldCheck,
  WORK_ORDER: Ticket,
  BAST: FileSignature,
  SOP: BookOpen,
  DRAWING: PenTool,
  LAINNYA: FileText,
};

/** UI category → persisted backend enum (for upload + filtering). */
export const CATEGORY_TO_TYPE: Record<DocumentCategory, DocumentType> = {
  FOTO_GARDU: "PHOTO",
  INSPECTION: "INSPECTION_DOC",
  HAR: "MANUAL_BOOK",
  WORK_ORDER: "BERITA_ACARA",
  BAST: "BERITA_ACARA",
  SOP: "MANUAL_BOOK",
  DRAWING: "SERTIFIKAT",
  LAINNYA: "OTHER",
};

/** Persisted backend enum → canonical category label for list/detail display. */
export const TYPE_TO_CATEGORY_LABEL: Record<DocumentType, string> = {
  PHOTO: "Foto Gardu",
  INSPECTION_DOC: "Inspection",
  MANUAL_BOOK: "SOP / HAR",
  BERITA_ACARA: "BAST / Work Order",
  SERTIFIKAT: "Drawing",
  OTHER: "Lainnya",
};

export const DOCUMENT_CATEGORY_ICON_BY_TYPE: Record<DocumentType, LucideIcon> = {
  PHOTO: Camera,
  INSPECTION_DOC: ClipboardCheck,
  MANUAL_BOOK: BookOpen,
  BERITA_ACARA: FileSignature,
  SERTIFIKAT: PenTool,
  OTHER: FileText,
};

/** Label for a stored document, derived from its persisted type. */
export function categoryLabel(type: DocumentType): string {
  return TYPE_TO_CATEGORY_LABEL[type] ?? type;
}

/** Options for the upload category select (8 business categories). */
export const documentCategoryOptions = DOCUMENT_CATEGORIES.map((c) => ({
  value: c,
  label: DOCUMENT_CATEGORY_LABELS[c],
}));
