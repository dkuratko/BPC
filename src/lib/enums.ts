/**
 * Plain constants shared by the server and the browser.
 *
 * These live outside the model files on purpose: a model imports mongoose, and
 * anything a client component imports gets bundled for the browser. Keeping the
 * enums here means a form can offer the right options without dragging a
 * database driver into the page.
 */

export const ROLES = ["admin", "estimator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const JOB_TYPES = [
  "school_district", "municipal_parks", "hoa", "church", "childcare",
  "apartment", "commercial", "residential", "other",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  school_district: "School district",
  municipal_parks: "Municipal / parks",
  hoa: "HOA",
  church: "Church",
  childcare: "Childcare / daycare",
  apartment: "Apartment / multifamily",
  commercial: "Commercial",
  residential: "Residential",
  other: "Other",
};

export const SIZE_BANDS = ["small", "medium", "large"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const PROJECT_STATUSES = [
  "lead", "estimating", "quoted", "won", "lost", "in_progress", "completed", "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: "Lead", estimating: "Estimating", quoted: "Quoted", won: "Won", lost: "Lost",
  in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};

export const ESTIMATE_STATUSES = [
  "draft", "internal_review", "sent", "accepted", "rejected", "expired", "superseded",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

/** Once an estimate has left the building it is frozen; edits fork a new version. */
export const LOCKED_STATUSES: EstimateStatus[] = ["sent", "accepted", "rejected", "expired", "superseded"];

export const PRICE_TIERS = ["minimum", "competitive", "target", "manual"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const LINE_CATEGORIES = [
  "labor", "material", "concrete", "surfacing", "equipment", "rental",
  "subcontractor", "mobilization", "consumables", "tax", "overhead",
  "contingency", "other",
] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];

export const LINE_CATEGORY_LABELS: Record<LineCategory, string> = {
  labor: "Labor", material: "Materials", concrete: "Concrete", surfacing: "Surfacing",
  equipment: "Equipment (owned)", rental: "Rentals", subcontractor: "Subcontractors",
  mobilization: "Mobilization", consumables: "Consumables", tax: "Sales tax",
  overhead: "Overhead", contingency: "Contingency", other: "Other",
};

export const SOURCE_TYPES = [
  "component", "assembly", "equipment", "rentalRate", "laborRate",
  "material", "subcontractorRate", "rule", "setting", "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const VENDOR_TYPES = ["rental", "material", "subcontractor", "other"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const EQUIPMENT_TYPES = [
  "telehandler", "forklift", "crane", "skid_steer", "mini_excavator", "excavator",
  "auger", "auger_bit", "concrete_saw", "concrete_mixer", "concrete_pump",
  "compactor", "generator", "truck", "trailer", "hand_tool", "other",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const OWNERSHIP = ["owned", "rented", "both"] as const;
export type Ownership = (typeof OWNERSHIP)[number];

export const LABOR_TYPES = ["employee", "crew", "subcontractor"] as const;
export type LaborType = (typeof LABOR_TYPES)[number];

export const MATERIAL_CATEGORIES = [
  "concrete", "rebar", "aggregate", "surfacing_pip", "surfacing_ewf",
  "surfacing_tile", "surfacing_turf", "geotextile", "drainage", "border_curbing",
  "hardware", "lumber", "disposal", "consumables", "other",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const CONCRETE_ROLES = ["ready_mix", "bagged"] as const;
export type ConcreteRole = (typeof CONCRETE_ROLES)[number];

export const COMPONENT_CATEGORIES = [
  "deck", "post", "climber", "slide", "roof", "panel", "bridge", "swing",
  "spinner", "overhead_event", "sensory_play", "ramp_transfer", "freestanding",
  "site_furnishing", "shade", "hardware", "signage", "other",
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const LABOR_SOURCES = ["manual", "manufacturer", "inferred_weight", "actuals"] as const;
export type LaborSource = (typeof LABOR_SOURCES)[number];

export const SUBCONTRACTOR_CATEGORIES = [
  "surfacing", "concrete", "demolition", "excavation", "fencing", "shade", "electrical", "other",
] as const;

export const FACTOR_TARGETS = [
  "install_labor", "surfacing_labor", "excavation_labor", "demolition_labor",
  "concrete_labor", "equipment_cost", "rental_days", "material_quantity", "mobilization",
] as const;
export type FactorTarget = (typeof FACTOR_TARGETS)[number];

export const FACTOR_TARGET_LABELS: Record<FactorTarget, string> = {
  install_labor: "Playground install labor",
  surfacing_labor: "Surfacing labor",
  excavation_labor: "Excavation labor",
  demolition_labor: "Demolition labor",
  concrete_labor: "Concrete labor",
  equipment_cost: "Owned equipment cost",
  rental_days: "Rental duration",
  material_quantity: "Material quantity",
  mobilization: "Mobilization",
};

export const RULE_TYPES = [
  "equipmentRequirement", "laborRequirement", "materialRequirement",
  "multiplier", "threshold", "minimumCharge", "formula", "markup", "margin",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_OPERATORS = [
  "equals", "notEquals", "gt", "gte", "lt", "lte", "contains", "in", "exists",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const DOCUMENT_TYPES = [
  "manufacturer_quote", "plan", "specification", "email", "photo", "other",
] as const;
