import type { FieldSpec, ListColumn } from "@/components/RecordManager";
import {
  COMPONENT_CATEGORIES, CONCRETE_ROLES, EQUIPMENT_TYPES, FACTOR_TARGETS,
  JOB_TYPES, JOB_TYPE_LABELS, LABOR_TYPES, MATERIAL_CATEGORIES, OWNERSHIP,
  RULE_OPERATORS, RULE_TYPES, SUBCONTRACTOR_CATEGORIES, VENDOR_TYPES,
} from "@/lib/enums";
import { UNITS } from "@/lib/units";

const opts = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

export interface MasterConfig {
  title: string;
  endpoint: string;
  intro?: string;
  emptyMessage?: string;
  /** Rates and rules move every price, so they are admin-only to edit. */
  adminOnly?: boolean;
  fields: FieldSpec[];
  columns: ListColumn[];
}

export const MASTER_CONFIGS: Record<string, MasterConfig> = {
  customers: {
    title: "Customers",
    endpoint: "/api/customers",
    intro: "Schools and municipalities are often tax exempt, which changes what materials cost on their jobs.",
    fields: [
      { path: "companyName", label: "Company", type: "text", required: true },
      { path: "jobType", label: "Job type", type: "select", options: JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] })) },
      { path: "taxExempt", label: "Tax exempt", type: "checkbox", hint: "No sales tax carried on their materials." },
      { path: "billingAddress.street", label: "Street", type: "text", group: "Billing address" },
      { path: "billingAddress.city", label: "City", type: "text", group: "Billing address" },
      { path: "billingAddress.state", label: "State", type: "text", defaultValue: "AZ", group: "Billing address" },
      { path: "billingAddress.zip", label: "ZIP", type: "text", group: "Billing address" },
      {
        path: "contacts", label: "Contacts", type: "objectList", group: "Contacts", width: "full",
        subFields: [
          { path: "name", label: "Name", type: "text" },
          { path: "title", label: "Title", type: "text" },
          { path: "email", label: "Email", type: "text" },
          { path: "phone", label: "Phone", type: "text" },
        ],
      },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "companyName", header: "Company" },
      { path: "jobType", header: "Job type" },
      { path: "taxExempt", header: "Tax exempt", type: "boolean" },
      { path: "billingAddress.city", header: "City" },
    ],
  },

  manufacturers: {
    title: "Manufacturers",
    endpoint: "/api/manufacturers",
    intro: "The same part number can exist at two manufacturers, so components are always keyed to one of these.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true },
      { path: "website", label: "Website", type: "text" },
      { path: "productLines", label: "Product lines", type: "stringList", width: "full" },
      { path: "documentConventions.quoteFormat", label: "Quote format", type: "text", group: "Quote documents", hint: "How their quotes are laid out." },
      { path: "documentConventions.notes", label: "Notes", type: "textarea", group: "Quote documents" },
    ],
    columns: [
      { path: "name", header: "Name" },
      { path: "website", header: "Website" },
      { path: "productLines", header: "Product lines" },
    ],
  },

  vendors: {
    title: "Vendors",
    endpoint: "/api/vendors",
    intro: "Rental yards, suppliers and subs. Prices live on the rate records, not here, so a vendor can be re-priced without losing its history.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true },
      { path: "accountNumber", label: "Account number", type: "text" },
      { path: "types", label: "What they are", type: "stringList", hint: "rental, material, subcontractor, other — one per line." },
      { path: "address.city", label: "City", type: "text", group: "Address" },
      { path: "address.state", label: "State", type: "text", defaultValue: "AZ", group: "Address" },
      {
        path: "contacts", label: "Contacts", type: "objectList", group: "Contacts", width: "full",
        subFields: [
          { path: "name", label: "Name", type: "text" },
          { path: "email", label: "Email", type: "text" },
          { path: "phone", label: "Phone", type: "text" },
        ],
      },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "name", header: "Name" },
      { path: "types", header: "Types" },
      { path: "address.city", header: "City" },
      { path: "accountNumber", header: "Account" },
    ],
  },

  components: {
    title: "Playground components",
    endpoint: "/api/components",
    intro:
      "Leave install hours blank until you have actually timed the part — the estimator will infer them from " +
      "weight and category and flag every estimate that relies on a guess. Filling them in from a real job is " +
      "what makes this system better than a spreadsheet.",
    fields: [
      { path: "manufacturerId", label: "Manufacturer", type: "ref", refEndpoint: "/api/manufacturers", refLabelField: "name", required: true },
      { path: "partNumber", label: "Part number", type: "text", required: true },
      { path: "name", label: "Name", type: "text", required: true },
      { path: "category", label: "Category", type: "select", options: opts(COMPONENT_CATEGORIES) },
      { path: "subcategory", label: "Subcategory", type: "text" },
      { path: "weightLb", label: "Weight (lb)", type: "number" },
      { path: "description", label: "Description", type: "textarea", width: "full" },
      { path: "installation.baseLaborHours", label: "Install hours (man-hours)", type: "number", group: "Installation", hint: "Blank = infer from weight." },
      { path: "installation.verified", label: "Hours verified against a real job", type: "checkbox", group: "Installation" },
      { path: "installation.footingCount", label: "Footings", type: "number", group: "Installation" },
      { path: "installation.concreteCuFt", label: "Concrete (cu ft)", type: "number", group: "Installation" },
      { path: "installation.complexity", label: "Complexity multiplier", type: "number", defaultValue: 1, group: "Installation", hint: "1.0 normal; raise it for awkward parts." },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "partNumber", header: "Part" },
      { path: "name", header: "Name" },
      { path: "category", header: "Category" },
      { path: "weightLb", header: "Weight lb" },
      { path: "installation.baseLaborHours", header: "Hours" },
      { path: "installation.verified", header: "Verified", type: "boolean" },
    ],
  },

  assemblies: {
    title: "Preset playgrounds",
    endpoint: "/api/assemblies",
    intro:
      "A preset explodes into its components on an estimate. The manufacturer's published summary is kept as " +
      "given — it is the labor baseline the estimator multiplies, and it should not be overwritten by our own roll-up.",
    fields: [
      { path: "manufacturerId", label: "Manufacturer", type: "ref", refEndpoint: "/api/manufacturers", refLabelField: "name", required: true },
      { path: "modelNumber", label: "Model number", type: "text", required: true },
      { path: "name", label: "Name", type: "text", required: true },
      { path: "ageRange", label: "Age range", type: "text" },
      { path: "manufacturerSummary.laborHours", label: "Published labor hours", type: "number", group: "Manufacturer summary" },
      { path: "manufacturerSummary.footingCount", label: "Footings", type: "number", group: "Manufacturer summary" },
      { path: "manufacturerSummary.concreteCuFt", label: "Concrete (cu ft)", type: "number", group: "Manufacturer summary" },
      { path: "manufacturerSummary.totalWeightLb", label: "Total weight (lb)", type: "number", group: "Manufacturer summary" },
      { path: "manufacturerSummary.safetyZoneSqFt", label: "Safety zone (sq ft)", type: "number", group: "Manufacturer summary" },
      {
        path: "components", label: "Bill of materials", type: "objectList", group: "Components", width: "full",
        subFields: [
          { path: "componentId", label: "Component", type: "ref", refEndpoint: "/api/components", refLabelField: "name" },
          { path: "quantity", label: "Qty", type: "number" },
        ],
      },
    ],
    columns: [
      { path: "modelNumber", header: "Model" },
      { path: "name", header: "Name" },
      { path: "ageRange", header: "Ages" },
      { path: "components", header: "Components" },
      { path: "manufacturerSummary.laborHours", header: "Pub. hours" },
    ],
  },

  equipment: {
    title: "Equipment",
    endpoint: "/api/equipment",
    intro:
      "Owned machines need an internal rate so they are not treated as free on a job. Rental prices are not " +
      "stored here — they belong to a vendor and a date, on the rental rates screen.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true },
      { path: "type", label: "Type", type: "select", options: opts(EQUIPMENT_TYPES), required: true },
      { path: "ownership", label: "Ownership", type: "select", options: opts(OWNERSHIP), required: true },
      { path: "makeModel", label: "Make / model", type: "text" },
      { path: "year", label: "Year", type: "number" },
      { path: "internalRate.hourlyCents", label: "Internal rate / hour", type: "money", group: "Owned equipment cost" },
      { path: "internalRate.dailyCents", label: "Internal rate / day", type: "money", group: "Owned equipment cost" },
      { path: "transportWeightLb", label: "Transport weight (lb)", type: "number", group: "Owned equipment cost", hint: "Drives how many trailer trips mobilization needs." },
      { path: "fuel.gallonsPerDay", label: "Fuel (gal/day)", type: "number", group: "Owned equipment cost" },
      { path: "specifications.capacityLb", label: "Capacity (lb)", type: "number", group: "Specifications" },
      { path: "specifications.maxLiftHeightFt", label: "Max lift height (ft)", type: "number", group: "Specifications" },
      { path: "specifications.maxReachFt", label: "Max reach (ft)", type: "number", group: "Specifications" },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "name", header: "Name" },
      { path: "type", header: "Type" },
      { path: "ownership", header: "Ownership" },
      { path: "internalRate.dailyCents", header: "Internal /day", type: "money" },
      { path: "transportWeightLb", header: "Haul lb" },
    ],
  },

  "rental-rates": {
    title: "Rental rates",
    endpoint: "/api/rental-rates",
    adminOnly: true,
    intro:
      "One row per vendor, per machine, per price change. Never edit an old row when a price goes up — add a " +
      "new one, so estimates written last month can still be reproduced.",
    fields: [
      { path: "equipmentId", label: "Equipment", type: "ref", refEndpoint: "/api/equipment", refLabelField: "name", required: true },
      { path: "vendorId", label: "Vendor", type: "ref", refEndpoint: "/api/vendors", refLabelField: "name", required: true },
      { path: "rates.dailyCents", label: "Daily", type: "money", group: "Rates" },
      { path: "rates.weeklyCents", label: "Weekly", type: "money", group: "Rates" },
      { path: "rates.monthlyCents", label: "Monthly", type: "money", group: "Rates" },
      { path: "rates.hourlyCents", label: "Hourly", type: "money", group: "Rates" },
      { path: "fees.deliveryCents", label: "Delivery", type: "money", group: "Fees" },
      { path: "fees.pickupCents", label: "Pickup", type: "money", group: "Fees" },
      { path: "fees.environmentalPct", label: "Environmental %", type: "percent", group: "Fees" },
      { path: "fees.damageWaiverPct", label: "Damage waiver %", type: "percent", group: "Fees" },
      { path: "fuelIncluded", label: "Fuel included", type: "checkbox", group: "Fees" },
      { path: "minimumRental.quantity", label: "Minimum rental", type: "number", group: "Terms" },
      { path: "minimumRental.unit", label: "Minimum unit", type: "select", options: opts(["hour", "day", "week"]), group: "Terms" },
      { path: "quoteReference", label: "Quote reference", type: "text", group: "Terms" },
    ],
    columns: [
      { path: "equipmentId", header: "Equipment", type: "ref", refLabelField: "name" },
      { path: "vendorId", header: "Vendor", type: "ref", refLabelField: "name" },
      { path: "rates.dailyCents", header: "Daily", type: "money" },
      { path: "rates.weeklyCents", header: "Weekly", type: "money" },
      { path: "fees.deliveryCents", header: "Delivery", type: "money" },
    ],
  },

  "labor-rates": {
    title: "Labor rates",
    endpoint: "/api/labor-rates",
    adminOnly: true,
    intro:
      "Enter the base wage and the burden percentages; the fully burdened rate is worked out for you. Leave " +
      "the overhead allocation at zero — overhead is applied once at the estimate level, and putting it here " +
      "as well charges for the office twice.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true, hint: "e.g. 3-man install crew" },
      { path: "type", label: "Type", type: "select", options: opts(LABOR_TYPES), required: true },
      { path: "crewSize", label: "Crew size", type: "number", defaultValue: 1, hint: "Used for job duration and travel, not for the hourly cost." },
      { path: "baseWageCents", label: "Base wage / hour", type: "money", required: true },
      { path: "isDefault", label: "Use as the default rate", type: "checkbox" },
      { path: "burden.payrollTaxPct", label: "Payroll taxes %", type: "percent", group: "Burden" },
      { path: "burden.workersCompPct", label: "Workers comp %", type: "percent", group: "Burden" },
      { path: "burden.benefitsPct", label: "Benefits %", type: "percent", group: "Burden" },
      { path: "burden.otherPct", label: "Other %", type: "percent", group: "Burden" },
      { path: "burden.overheadAllocationPct", label: "Overhead allocation %", type: "percent", group: "Burden", hint: "Keep at 0." },
      { path: "composition", label: "Who is on it", type: "text", group: "Notes" },
      { path: "notes", label: "Notes", type: "textarea", group: "Notes" },
    ],
    columns: [
      { path: "name", header: "Name" },
      { path: "crewSize", header: "Crew" },
      { path: "baseWageCents", header: "Base wage", type: "money" },
      { path: "fullyBurdenedCents", header: "Burdened /hr", type: "money" },
      { path: "crewHourlyCents", header: "Crew /hr", type: "money" },
      { path: "isDefault", header: "Default", type: "boolean" },
    ],
  },

  materials: {
    title: "Materials",
    endpoint: "/api/materials",
    adminOnly: true,
    intro:
      "A material can be priced more than one way — surfacing is bought by the cubic yard, sold by the square " +
      "foot and hauled off by the ton — so give it a pricing option for each unit you actually deal in. Tag " +
      "concrete with its role so the estimator can choose between bags and a ready-mix truck.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true },
      { path: "category", label: "Category", type: "select", options: opts(MATERIAL_CATEGORIES), required: true },
      { path: "defaultUnit", label: "Default unit", type: "select", options: opts(UNITS), required: true },
      { path: "concreteRole", label: "Concrete role", type: "select", options: opts(CONCRETE_ROLES), hint: "Only for concrete." },
      { path: "bagWeightLb", label: "Bag weight (lb)", type: "number", hint: "Bagged concrete only: 60 or 80." },
      { path: "wasteFactorPct", label: "Waste factor %", type: "percent", defaultValue: 0 },
      { path: "taxable", label: "Taxable purchase", type: "checkbox", defaultValue: true },
      { path: "preferredVendorId", label: "Preferred vendor", type: "ref", refEndpoint: "/api/vendors", refLabelField: "name" },
      {
        path: "pricingOptions", label: "Pricing options", type: "objectList", group: "Pricing", width: "full",
        subFields: [
          { path: "unit", label: "Unit", type: "select", options: opts(UNITS) },
          { path: "unitCostCents", label: "Cost / unit", type: "money" },
          { path: "laborHoursPerUnit", label: "Labor hr / unit", type: "number" },
          { path: "fixedFeeCents", label: "Fixed fee", type: "money" },
          { path: "minimumQuantity", label: "Min qty", type: "number" },
          { path: "minimumChargeCents", label: "Min charge", type: "money" },
        ],
      },
      { path: "specifications.strength", label: "Strength", type: "text", group: "Specifications" },
      { path: "specifications.depthIn", label: "Depth (in)", type: "number", group: "Specifications" },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "name", header: "Name" },
      { path: "category", header: "Category" },
      { path: "defaultUnit", header: "Unit" },
      { path: "pricingOptions", header: "Prices" },
      { path: "wasteFactorPct", header: "Waste", type: "percent" },
    ],
  },

  "subcontractor-rates": {
    title: "Subcontractor rates",
    endpoint: "/api/subcontractor-rates",
    adminOnly: true,
    intro:
      "Priced by the unit so a bid that changes size does not need a fresh phone call. Leave the markup at 0 " +
      "unless you mark subs up separately — the job's gross margin is already applied on top of this cost.",
    fields: [
      { path: "vendorId", label: "Vendor", type: "ref", refEndpoint: "/api/vendors", refLabelField: "name", required: true },
      { path: "service", label: "Service", type: "text", required: true },
      { path: "category", label: "Category", type: "select", options: opts(SUBCONTRACTOR_CATEGORIES) },
      { path: "unit", label: "Unit", type: "select", options: opts(UNITS), required: true },
      { path: "unitCostCents", label: "Cost / unit", type: "money", required: true },
      { path: "minimumChargeCents", label: "Minimum charge", type: "money" },
      { path: "mobilizationCents", label: "Their mobilization", type: "money" },
      { path: "markupPct", label: "Markup %", type: "percent", defaultValue: 0 },
      { path: "scopeNotes", label: "What it covers", type: "textarea", width: "full", group: "Scope" },
    ],
    columns: [
      { path: "service", header: "Service" },
      { path: "vendorId", header: "Vendor", type: "ref", refLabelField: "name" },
      { path: "unit", header: "Unit" },
      { path: "unitCostCents", header: "Cost/unit", type: "money" },
      { path: "minimumChargeCents", header: "Minimum", type: "money" },
    ],
  },

  "site-factors": {
    title: "Site factors",
    endpoint: "/api/site-factors",
    adminOnly: true,
    intro:
      "Each condition is rated 1 to 10 on a project. Baseline (normally 5) means a normal job and costs " +
      "nothing extra; every point above it moves the targeted cost by the percentage set here. Point a factor " +
      "at the costs it really affects — a long carry hurts surfacing labor far more than it hurts bolting decks together.",
    fields: [
      { path: "key", label: "Key", type: "text", required: true, hint: "Short identifier, e.g. access_distance." },
      { path: "label", label: "Label", type: "text", required: true },
      { path: "description", label: "Description", type: "textarea", width: "full" },
      { path: "scale.min", label: "Scale min", type: "number", defaultValue: 1, group: "Scale" },
      { path: "scale.max", label: "Scale max", type: "number", defaultValue: 10, group: "Scale" },
      { path: "scale.baseline", label: "Baseline (no effect)", type: "number", defaultValue: 5, group: "Scale" },
      { path: "sortOrder", label: "Sort order", type: "number", defaultValue: 100, group: "Scale" },
      {
        path: "impacts", label: "What it affects", type: "objectList", group: "Effects", width: "full",
        subFields: [
          { path: "target", label: "Cost", type: "select", options: opts(FACTOR_TARGETS) },
          { path: "percentPerPoint", label: "% per point", type: "percent" },
        ],
      },
      {
        path: "ratingLabels", label: "What each rating means", type: "objectList", group: "Effects", width: "full",
        subFields: [
          { path: "rating", label: "Rating", type: "number" },
          { path: "label", label: "Means", type: "text" },
        ],
      },
    ],
    columns: [
      { path: "label", header: "Condition" },
      { path: "key", header: "Key" },
      { path: "scale.baseline", header: "Baseline" },
      { path: "impacts", header: "Effects" },
      { path: "sortOrder", header: "Order" },
    ],
  },

  "estimating-rules": {
    title: "Estimating rules",
    endpoint: "/api/estimating-rules",
    adminOnly: true,
    intro:
      "Conditional requirements — 'if a roof exists, a telehandler is required'. Rules decide what a job needs; " +
      "what it costs comes from the rate records. Rules can be written and reviewed now; the engine applies " +
      "requirement rules only, with the rest arriving in the automation phase.",
    fields: [
      { path: "name", label: "Name", type: "text", required: true },
      { path: "type", label: "Type", type: "select", options: opts(RULE_TYPES), required: true },
      { path: "priority", label: "Priority", type: "number", defaultValue: 100, hint: "Lower runs first." },
      { path: "description", label: "Description", type: "textarea", width: "full" },
      {
        path: "conditions", label: "Conditions (all must hold)", type: "objectList", group: "Conditions", width: "full",
        subFields: [
          { path: "field", label: "Field", type: "text" },
          { path: "operator", label: "Operator", type: "select", options: opts(RULE_OPERATORS) },
          { path: "value", label: "Value", type: "text" },
        ],
      },
      { path: "action.equipmentId", label: "Requires equipment", type: "ref", refEndpoint: "/api/equipment", refLabelField: "name", group: "Action" },
      { path: "action.materialId", label: "Requires material", type: "ref", refEndpoint: "/api/materials", refLabelField: "name", group: "Action" },
      { path: "action.quantity", label: "Quantity", type: "number", group: "Action" },
      { path: "action.durationDays", label: "Duration (days)", type: "number", group: "Action" },
      { path: "action.multiplier", label: "Multiplier", type: "number", group: "Action" },
      { path: "notes", label: "Notes", type: "textarea", width: "full", group: "Notes" },
    ],
    columns: [
      { path: "name", header: "Rule" },
      { path: "type", header: "Type" },
      { path: "priority", header: "Priority" },
      { path: "conditions", header: "Conditions" },
    ],
  },
};

export const MASTER_ORDER = [
  "customers", "manufacturers", "vendors", "components", "assemblies",
  "equipment", "rental-rates", "labor-rates", "materials",
  "subcontractor-rates", "site-factors", "estimating-rules",
] as const;

void VENDOR_TYPES;
