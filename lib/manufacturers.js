// Top manufacturers per item type for the manufacturer dropdown.
// Keyed by item name (exact match). Items without a meaningful brand list are omitted.
export const MANUFACTURERS_BY_ITEM = {
  // HVAC
  "Furnace":                    ["Carrier", "Lennox", "Trane", "Goodman", "Rheem", "Bryant", "York", "American Standard", "Daikin", "Heil", "Comfortmaker"],
  "Furnace / Air Handler":      ["Carrier", "Lennox", "Trane", "Goodman", "Rheem", "Bryant", "York", "American Standard", "Daikin", "Heil"],
  "Central Air Conditioner":    ["Carrier", "Lennox", "Trane", "Goodman", "Rheem", "Bryant", "York", "American Standard", "Daikin", "Heil", "Ameristar"],
  "Evaporator Coils":           ["Ameristar", "Carrier", "Lennox", "Trane", "Goodman", "Rheem", "Bryant", "York", "American Standard", "Daikin"],
  "Heat Pump":                  ["Carrier", "Lennox", "Trane", "Goodman", "Rheem", "Bryant", "York", "American Standard", "Daikin", "Heil"],
  "Thermostat":                 ["Honeywell", "Ecobee", "Nest (Google)", "Emerson", "Carrier", "Lennox", "Trane", "Lux", "White-Rodgers", "Venstar"],
  "Humidifier (whole-home)":    ["Aprilaire", "Honeywell", "GeneralAire", "Lennox", "Carrier", "Bryant", "Skuttle", "Field Controls", "Air King", "Venmar"],
  "Air Exchanger / HRV":        ["Broan-NuTone", "Venmar", "Carrier", "Lifebreath", "RenewAire", "Field Controls", "Aldes", "Fantech", "Honeywell", "Daikin"],
  "Dehumidifier":               ["Aprilaire", "Honeywell", "Santa Fe", "Frigidaire", "hOmeLabs", "GE", "LG", "Whirlpool", "Danby", "Keystone"],
  "Window / Portable A/C Unit": ["LG", "Frigidaire", "GE", "Whirlpool", "Haier", "Honeywell", "Black+Decker", "Midea", "Kenmore", "Soleus Air"],

  // Plumbing
  "Water Heater (Tank)":        ["Rheem", "Bradford White", "A.O. Smith", "State", "GE", "Whirlpool", "American", "Navien", "Rinnai", "Kenmore"],
  "Water Heater (Tankless)":    ["Rinnai", "Navien", "Noritz", "EcoSmart", "Rheem", "Bradford White", "A.O. Smith", "Bosch", "Takagi", "Eccotemp"],
  "Water Softener":             ["Kinetico", "EcoWater", "Whirlpool", "GE", "Pentair", "Culligan", "Morton", "Tier1", "Waterboss", "Kenmore"],
  "Sump Pump":                  ["Zoeller", "Wayne", "Liberty", "Little Giant", "Superior Pump", "Flotec", "Ridgid", "Grundfos", "Watchdog", "PHCC Pro Series"],
  "Reverse Osmosis Filter":     ["APEC", "iSpring", "Home Master", "Aquasana", "Express Water", "Watts", "Pentair", "GE", "Whirlpool", "Culligan"],
  "Whole-Home Water Filter":    ["Aquasana", "Pelican", "Culligan", "SpringWell", "iSpring", "Watts", "3M", "GE", "Pentair", "Home Master"],
  "Garbage Disposal":           ["InSinkErator", "Waste King", "Moen", "KitchenAid", "GE", "Whirlpool", "Frigidaire", "Badger", "Evolution", "American Standard"],

  // Kitchen appliances
  "Refrigerator":               ["Samsung", "LG", "Whirlpool", "GE", "KitchenAid", "Maytag", "Frigidaire", "Bosch", "Sub-Zero", "Viking"],
  "Dishwasher":                 ["Bosch", "Whirlpool", "KitchenAid", "GE", "Maytag", "Miele", "Samsung", "LG", "Frigidaire", "Thermador"],
  "Gas Range / Cooktop":        ["GE", "Samsung", "LG", "Whirlpool", "KitchenAid", "Wolf", "Viking", "Thermador", "Miele", "Bosch"],
  "Oven":                       ["GE", "Samsung", "LG", "Whirlpool", "KitchenAid", "Wolf", "Viking", "Thermador", "Miele", "Bosch"],
  "Microwave (built-in)":       ["GE", "Whirlpool", "KitchenAid", "Panasonic", "Samsung", "LG", "Sharp", "Bosch", "Frigidaire", "Broan-NuTone"],
  "Range Hood":                 ["Broan-NuTone", "Zephyr", "ZLINE", "Cosmo", "KitchenAid", "GE", "Whirlpool", "Thor", "Proline", "Faber"],

  // Laundry
  "Washing Machine (front-load)": ["Samsung", "LG", "Whirlpool", "Maytag", "GE", "Bosch", "Miele", "Speed Queen", "Electrolux", "Kenmore"],
  "Washing Machine (top-load)":   ["Whirlpool", "Maytag", "GE", "Samsung", "LG", "Speed Queen", "Kenmore", "Roper", "Amana", "Electrolux"],
  "Dryer":                        ["Samsung", "LG", "Whirlpool", "Maytag", "GE", "Electrolux", "Speed Queen", "Kenmore", "Bosch", "Miele"],
  "Dryer Vent Duct":              ["Broan-NuTone", "Dundas Jafine", "Imperial", "deflecto", "Heartland", "Speedi-Products", "iPower", "BV", "Sealproof", "Lambro"],

  // Electrical
  "Electrical Panel":           ["Square D", "Eaton", "Siemens", "GE", "Cutler-Hammer", "Murray", "Leviton", "Connecticut Electric", "ITE", "Homeline"],
  "Backup Generator":           ["Generac", "Briggs & Stratton", "Kohler", "Honda", "Cummins", "Champion", "Westinghouse", "DuroMax", "Winco", "Firman"],
  "Security System":            ["ADT", "Ring", "SimpliSafe", "Vivint", "Brinks", "Honeywell", "Bosch", "DSC", "Alarm.com", "Frontpoint"],
  "Outdoor Cameras":            ["Ring", "Arlo", "Nest (Google)", "Wyze", "Reolink", "Hikvision", "Lorex", "Amcrest", "Blink", "Eufy"],
  "Ceiling Fans":               ["Hunter", "Hampton Bay", "Minka-Aire", "Progress Lighting", "Westinghouse", "Casablanca", "Monte Carlo", "Emerson", "Fanimation", "Crompton"],
  "Smoke Detectors":            ["Kidde", "First Alert", "Nest (Google)", "Ring", "Honeywell", "X-Sense", "System Sensor", "FireAngel", "BRK", "Ei Electronics"],
  "Carbon Monoxide Detectors":  ["Kidde", "First Alert", "Nest (Google)", "Ring", "Honeywell", "X-Sense", "System Sensor", "FireAngel", "BRK", "Ei Electronics"],
  "Surge Protectors":           ["APC", "Tripp Lite", "CyberPower", "Belkin", "Eaton", "Furman", "Panamax", "Legrand", "Monster", "Brickell"],

  // Exterior
  "Garage Door":                ["Clopay", "Amarr", "Wayne Dalton", "Raynor", "Overhead Door", "C.H.I.", "Hormann", "Martin", "Northwest Door", "Windsor"],
  "Garage Door Opener":         ["Chamberlain", "LiftMaster", "Genie", "Craftsman", "Overhead Door", "Linear", "Guardian", "Hormann", "Marantec", "Ryobi"],
  "Irrigation System":          ["Rain Bird", "Hunter Industries", "Orbit", "Toro", "Weathermatic", "K-Rain", "Irritrol", "Netafim", "NDS", "Rainbird"],

  // Interior / Fireplace
  "Gas Fireplace":              ["Montigo", "Napoleon", "Valor", "Regency", "Heatilator", "Heat & Glo", "Majestic", "SLR", "Mendota", "Kozy Heat"],

  // Pool/Spa
  "Pool / Spa":                 ["Hayward", "Pentair", "Jandy", "Zodiac", "Waterway", "Sta-Rite", "Speck", "Intelliflo", "Swimquip", "Jacuzzi"],

  // Lawn equipment
  "Lawn Mower":                 ["Honda", "Husqvarna", "John Deere", "Toro", "Craftsman", "Cub Cadet", "Ariens", "Troy-Bilt", "Greenworks", "Ego"],
  "Outdoor Gas Grill":          ["Weber", "Traeger", "Char-Broil", "Napoleon", "Broil King", "Nexgrill", "Dyna-Glo", "Cuisinart", "Blackstone", "Camp Chef"],
};

/**
 * Returns the manufacturer list for the given item name.
 * Returns an empty array if no list is defined.
 */
export function getManufacturers(item) {
  return MANUFACTURERS_BY_ITEM[item] ?? [];
}
