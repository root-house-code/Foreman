// Curated field library. Universal fields appear for every item; ITEM_FIELDS keys match item names exactly.
// TYPE_FIELDS defines fields automatically inherited when an item's item_type matches a key.
// Fields with a special `id` ("manufacturer", "model", "receipt") get custom rendering in the UI.

export const UNIVERSAL_FIELDS = [
  { id: "item_type",       name: "Item Type",       type: "text" },
  { id: "item_subtype",    name: "Subtype",         type: "subtype" },
  { id: "manufacturer",    name: "Manufacturer",    type: "text" },
  { id: "model",           name: "Model",           type: "text" },
  { id: "serial",          name: "Serial Number",   type: "text" },
  { id: "manufactured_date", name: "Manufactured Date", type: "date" },
  { id: "purchase_date",   name: "Purchase Date",   type: "date" },
  { id: "install_date",    name: "Install Date",    type: "date" },
  { id: "warranty_expiry", name: "Warranty Expiry", type: "date" },
  { id: "purchase_price",  name: "Purchase Price",  type: "number" },
  { id: "receipt",         name: "Receipt",         type: "receipt" },
];

export const TYPE_FIELDS = {
  "Appliance": UNIVERSAL_FIELDS.filter(f => f.id !== "item_type"),
  "Device":    UNIVERSAL_FIELDS.filter(f => f.id !== "item_type"),
  "Fixture":   UNIVERSAL_FIELDS.filter(f => f.id !== "item_type"),
  "Material":  UNIVERSAL_FIELDS.filter(f => f.id !== "item_type"),
};

export const ITEM_FIELDS = {
  // ── HVAC ───────────────────────────────────────────────────────────────────
  "Furnace": [
    { id: "filter_size",   name: "Filter Size",     type: "text" },
    { id: "merv_rating",   name: "MERV Rating",     type: "number" },
    { id: "filter_brand",  name: "Filter Brand",    type: "text" },
    { id: "fuel_type",     name: "Fuel Type",       type: "list", options: ["Natural Gas", "Propane", "Electric", "Oil"] },
    { id: "afue_rating",   name: "AFUE Rating (%)", type: "number" },
    { id: "btu_input",     name: "BTU Input",       type: "number" },
    { id: "btu_output",    name: "BTU Output",      type: "number" },
  ],
  "Furnace / Air Handler": [
    { id: "filter_size",   name: "Filter Size",     type: "text" },
    { id: "merv_rating",   name: "MERV Rating",     type: "number" },
    { id: "filter_brand",  name: "Filter Brand",    type: "text" },
    { id: "fuel_type",     name: "Fuel Type",       type: "list", options: ["Natural Gas", "Propane", "Electric", "Oil"] },
    { id: "afue_rating",   name: "AFUE Rating (%)", type: "number" },
    { id: "btu_input",     name: "BTU Input",       type: "number" },
    { id: "btu_output",    name: "BTU Output",      type: "number" },
  ],
  "Central Air Conditioner": [
    { id: "seer_rating",   name: "SEER Rating",        type: "number" },
    { id: "tonnage",       name: "Tonnage",             type: "number" },
    { id: "refrigerant",   name: "Refrigerant Type",   type: "list", options: ["R-410A", "R-22", "R-32", "R-454B"] },
  ],
  "Heat Pump": [
    { id: "seer_rating",   name: "SEER Rating",        type: "number" },
    { id: "hspf_rating",   name: "HSPF Rating",        type: "number" },
    { id: "tonnage",       name: "Tonnage",             type: "number" },
    { id: "refrigerant",   name: "Refrigerant Type",   type: "list", options: ["R-410A", "R-32", "R-454B"] },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Electric", "Natural Gas"] },
  ],
  "Thermostat": [
    { id: "therm_type",    name: "Type",               type: "list", options: ["Manual", "Programmable", "Smart"] },
    { id: "c_wire",        name: "C-Wire",             type: "list", options: ["Yes", "No"] },
    { id: "voltage",       name: "Voltage",            type: "list", options: ["24V Low Voltage", "Line Voltage"] },
  ],
  "Humidifier (whole-home)": [
    { id: "hum_type",      name: "Type",               type: "list", options: ["Bypass", "Fan-Powered", "Steam"] },
    { id: "capacity_gpd",  name: "Capacity (gpd)",     type: "number" },
  ],
  "Dehumidifier": [
    { id: "capacity_pt",   name: "Capacity (pints/day)", type: "number" },
    { id: "coverage_sqft", name: "Coverage (sq ft)",   type: "number" },
  ],
  "Air Exchanger / HRV": [
    { id: "cfm_rating",    name: "CFM Rating",         type: "number" },
    { id: "hrv_erv",       name: "Type",               type: "list", options: ["HRV", "ERV"] },
  ],
  // ── Plumbing ───────────────────────────────────────────────────────────────
  "Water Heater (Tank)": [
    { id: "capacity_gal",  name: "Tank Capacity (gal)", type: "number" },
    { id: "fuel_type",     name: "Fuel Type",           type: "list", options: ["Natural Gas", "Propane", "Electric", "Heat Pump"] },
    { id: "first_hour",    name: "First Hour Rating (gal)", type: "number" },
    { id: "recovery_rate", name: "Recovery Rate (gal/hr)", type: "number" },
    { id: "energy_factor", name: "Energy Factor",      type: "number" },
    { id: "setpoint_temp", name: "Setpoint Temp (°F)", type: "number" },
  ],
  "Water Heater (Tankless)": [
    { id: "gpm_rating",    name: "GPM Rating",         type: "number" },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Natural Gas", "Propane", "Electric"] },
    { id: "energy_factor", name: "Energy Factor",      type: "number" },
  ],
  "Water Softener": [
    { id: "grain_cap",     name: "Grain Capacity",     type: "number" },
    { id: "salt_type",     name: "Salt Type",          type: "list", options: ["Rock Salt", "Solar Salt", "Evaporated Salt", "Potassium"] },
    { id: "regen_type",    name: "Regeneration",       type: "list", options: ["Timed", "Demand-Initiated"] },
  ],
  "Reverse Osmosis Filter": [
    { id: "stage_count",   name: "Stage Count",        type: "number" },
    { id: "gpd_rating",    name: "GPD Rating",         type: "number" },
    { id: "filter_model",  name: "Filter Model",       type: "text" },
  ],
  "Sump Pump": [
    { id: "hp_rating",     name: "HP Rating",          type: "number" },
    { id: "pump_type",     name: "Pump Type",          type: "list", options: ["Submersible", "Pedestal"] },
    { id: "gph_rating",    name: "GPH Rating",         type: "number" },
  ],
  "Well Pump": [
    { id: "hp_rating",     name: "HP Rating",          type: "number" },
    { id: "pump_type",     name: "Type",               type: "list", options: ["Submersible", "Jet"] },
    { id: "gpm_rating",    name: "GPM Rating",         type: "number" },
  ],
  // ── Electrical ─────────────────────────────────────────────────────────────
  "Electrical Panel": [
    { id: "amperage",      name: "Amperage",           type: "number" },
    { id: "circuit_count", name: "Circuit Count",      type: "number" },
    { id: "panel_type",    name: "Panel Type",         type: "text" },
    { id: "voltage",       name: "Voltage",            type: "list", options: ["120/240V", "208/120V"] },
  ],
  "Generator": [
    { id: "watts_running", name: "Running Wattage",    type: "number" },
    { id: "watts_starting", name: "Starting Wattage", type: "number" },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gasoline", "Propane", "Natural Gas", "Diesel"] },
    { id: "gen_type",      name: "Type",               type: "list", options: ["Portable", "Standby"] },
  ],
  "Smoke Detector": [
    { id: "detect_type",   name: "Detector Type",      type: "list", options: ["Ionization", "Photoelectric", "Dual Sensor"] },
    { id: "interconnected", name: "Interconnected",    type: "list", options: ["Yes", "No"] },
    { id: "battery_type",  name: "Battery Type",       type: "text" },
    { id: "location",      name: "Location",           type: "text" },
  ],
  "Carbon Monoxide Detector": [
    { id: "technology",    name: "Technology",         type: "list", options: ["Electrochemical", "Biomimetic", "Metal Oxide"] },
    { id: "battery_type",  name: "Battery Type",       type: "text" },
    { id: "location",      name: "Location",           type: "text" },
  ],
  // ── Appliances ─────────────────────────────────────────────────────────────
  "Refrigerator": [
    { id: "capacity_cuft", name: "Capacity (cu ft)",   type: "number" },
    { id: "style",         name: "Style",              type: "list", options: ["French Door", "Side-by-Side", "Top Freezer", "Bottom Freezer", "Counter-Depth"] },
    { id: "ice_maker",     name: "Ice Maker",          type: "list", options: ["Yes", "No"] },
    { id: "water_filter",  name: "Water Filter Model", type: "text" },
  ],
  "Dishwasher": [
    { id: "place_settings", name: "Place Settings",   type: "number" },
    { id: "dba_level",     name: "Noise Level (dBA)", type: "number" },
  ],
  "Washer": [
    { id: "capacity_cuft", name: "Capacity (cu ft)",   type: "number" },
    { id: "washer_type",   name: "Type",               type: "list", options: ["Top Load", "Front Load"] },
  ],
  "Dryer": [
    { id: "capacity_cuft", name: "Capacity (cu ft)",   type: "number" },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Electric", "Natural Gas", "Propane"] },
    { id: "dryer_type",    name: "Vent Type",          type: "list", options: ["Vented", "Ventless", "Heat Pump"] },
  ],
  "Range": [
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gas", "Electric", "Dual Fuel", "Induction"] },
    { id: "burner_count",  name: "Number of Burners",  type: "number" },
    { id: "self_cleaning", name: "Self-Cleaning",      type: "list", options: ["Yes", "No"] },
  ],
  "Oven": [
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gas", "Electric"] },
    { id: "capacity_cuft", name: "Capacity (cu ft)",   type: "number" },
    { id: "convection",    name: "Convection",         type: "list", options: ["Yes", "No"] },
    { id: "self_cleaning", name: "Self-Cleaning",      type: "list", options: ["Yes", "No"] },
  ],
  "Microwave": [
    { id: "wattage",       name: "Wattage",            type: "number" },
    { id: "capacity_cuft", name: "Capacity (cu ft)",   type: "number" },
    { id: "mount_type",    name: "Mount Type",         type: "list", options: ["Over-the-Range", "Countertop", "Built-in"] },
  ],
  // ── Exterior / Structure ───────────────────────────────────────────────────
  "Garage Door Opener": [
    { id: "hp_rating",     name: "HP Rating",          type: "list", options: ["1/2 HP", "3/4 HP", "1 HP", "1.25 HP"] },
    { id: "drive_type",    name: "Drive Type",         type: "list", options: ["Chain", "Belt", "Screw", "Direct Drive"] },
    { id: "wifi",          name: "WiFi Enabled",       type: "list", options: ["Yes", "No"] },
  ],
  "Roof": [
    { id: "roofing_mat",   name: "Material",           type: "list", options: ["Asphalt Shingle", "Metal", "Tile", "Flat/TPO", "Slate", "Wood Shake"] },
    { id: "warranty_yrs",  name: "Warranty (years)",   type: "number" },
    { id: "contractor",    name: "Contractor",         type: "text" },
    { id: "square_count",  name: "Square Count",       type: "number" },
  ],
  "Window": [
    { id: "frame_mat",     name: "Frame Material",     type: "list", options: ["Vinyl", "Wood", "Aluminum", "Fiberglass", "Composite"] },
    { id: "pane_count",    name: "Panes",              type: "list", options: ["Single", "Double", "Triple"] },
    { id: "gas_fill",      name: "Gas Fill",           type: "list", options: ["Argon", "Krypton", "Air"] },
    { id: "low_e",         name: "Low-E Coating",      type: "list", options: ["Yes", "No"] },
    { id: "u_factor",      name: "U-Factor",           type: "number" },
    { id: "location",      name: "Location",           type: "text" },
  ],
  "Exterior Door": [
    { id: "door_mat",      name: "Material",           type: "list", options: ["Steel", "Fiberglass", "Wood", "Composite"] },
    { id: "core_type",     name: "Core Type",          type: "list", options: ["Solid", "Hollow", "Foam-filled"] },
    { id: "location",      name: "Location",           type: "text" },
  ],
  // ── Outdoor Equipment ─────────────────────────────────────────────────────
  "Lawnmower": [
    { id: "cut_width",     name: "Cutting Width (in)", type: "number" },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gasoline", "Electric", "Battery"] },
    { id: "mower_type",    name: "Type",               type: "list", options: ["Push", "Self-Propelled", "Riding", "Robotic"] },
    { id: "deck_mat",      name: "Deck Material",      type: "list", options: ["Steel", "Aluminum", "Composite"] },
  ],
  "Grill": [
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Natural Gas", "Propane", "Charcoal", "Electric", "Pellet"] },
    { id: "burner_count",  name: "Number of Burners",  type: "number" },
    { id: "cooking_area",  name: "Cooking Area (sq in)", type: "number" },
  ],
  "Pressure Washer": [
    { id: "psi_rating",    name: "PSI Rating",         type: "number" },
    { id: "gpm_rating",    name: "GPM Rating",         type: "number" },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gas", "Electric"] },
  ],
  "Snow Blower": [
    { id: "clearing_width", name: "Clearing Width (in)", type: "number" },
    { id: "stage_count",   name: "Stage",              type: "list", options: ["Single Stage", "Two Stage", "Three Stage"] },
    { id: "fuel_type",     name: "Fuel Type",          type: "list", options: ["Gas", "Electric", "Battery"] },
  ],
  // ── Interior / Finishes ────────────────────────────────────────────────────
  "Paint": [
    { id: "color_name",    name: "Color Name",         type: "text" },
    { id: "color_code",    name: "Color Code",         type: "text" },
    { id: "finish",        name: "Finish",             type: "list", options: ["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"] },
    { id: "paint_brand",   name: "Brand",              type: "text" },
    { id: "room",          name: "Room",               type: "text" },
  ],
  "Flooring": [
    { id: "floor_mat",     name: "Material",           type: "list", options: ["Hardwood", "LVP", "Tile", "Carpet", "Laminate", "Cork", "Concrete"] },
    { id: "floor_color",   name: "Color/Style",        type: "text" },
    { id: "floor_brand",   name: "Brand",              type: "text" },
    { id: "room",          name: "Room",               type: "text" },
  ],
};
