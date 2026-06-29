// Single source of truth for per-page descriptions.
//
// Powers BOTH the global "i" info button (components/PageInfoButton.jsx) and the
// Read Me → Instructions tab (read-me-page.jsx), so the two never drift.
//
// Each entry is keyed by the App page key (see PAGE_KEYS in src/App.jsx) and has:
//   key        — matches the App page key
//   title      — display name
//   valueProp  — 1–2 sentences: the user benefit (why the page exists)
//   howTo      — 2–4 short interaction steps
//   sharedWith — other pages this page exchanges data with: { key, why }
//
// Derived display order for the Read Me list follows this array's order.

export const PAGE_INFO = [
  {
    key: "readme",
    title: "Read Me",
    valueProp:
      "The manual for Foreman — what every page does, the design tenets behind it, the technical architecture, and what's new. Start here to see how the whole app fits together.",
    howTo: [
      "Switch tabs to read Instructions, Design Tenets, Architecture, Roadmap, or Updates.",
      "Use the in-page table of contents to jump to a section.",
      "Check Updates for the latest changes.",
    ],
    sharedWith: [],
  },
  {
    key: "dashboard",
    title: "Dashboard",
    valueProp:
      "Your home's state at a glance — an overall health dial, system and room health, and a T−30→T+90 schedule. The place to start a daily or weekly check-in.",
    howTo: [
      "Scan the health dial and system/room health for what needs attention now.",
      "Sort any panel by clicking its column header.",
      "Click a To Do or Project to edit inline.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Overdue/upcoming tasks drive the schedule and system/room health." },
      { key: "chores", why: "Chores feed room/system health alongside maintenance." },
      { key: "board", why: "The To Dos panel mirrors the To Dos board." },
      { key: "projects", why: "The Projects panel mirrors the Projects page." },
      { key: "ledger", why: "The Finances stats summarize spending and run-rate." },
    ],
  },
  {
    key: "alerts",
    title: "Triage",
    valueProp:
      "Every signal your home generates — overdue maintenance and chores, warranties expiring, low or out-of-stock supplies, and service renewals — gathered into one prioritized, filterable list so nothing slips through the cracks.",
    howTo: [
      "Scan the Overdue section first, then Due Soon and Heads-Up.",
      "Filter by type with the tabs (Maintenance, Chores, Warranties, Supplies, Services).",
      "Click any alert to jump straight to its source page.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Overdue and due-soon tasks surface as alerts." },
      { key: "chores", why: "Overdue and due-soon chores surface as alerts." },
      { key: "inventory", why: "Item warranties nearing or past expiry surface here." },
      { key: "supplies", why: "Low and out-of-stock supplies surface here." },
      { key: "services", why: "Upcoming and overdue service renewals surface here." },
      { key: "dashboard", why: "The Dashboard Triage panel shares this alert engine." },
    ],
  },
  {
    key: "calendar",
    title: "Calendar",
    valueProp:
      "Every scheduled task, chore, service renewal, and warranty expiry laid out across time, so you can see what's coming and spot clusters of work before they pile up.",
    howTo: [
      "Switch between month, week, day, and year views.",
      "Click an entry to open its source task or record.",
      "Scan for clusters to plan the weeks ahead.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Scheduled tasks and completions appear here." },
      { key: "chores", why: "Scheduled chores appear here." },
      { key: "services", why: "Service renewal dates surface here." },
      { key: "inventory", why: "Item warranty expiries surface here." },
    ],
  },
  {
    key: "timeline",
    title: "Timeline",
    valueProp:
      "The backward-looking feed of everything that has happened to the house — completed maintenance, chores, service visits, bills, expenses, and projects — grouped by month. No new data entry; it reads logs you already create.",
    howTo: [
      "Scroll the reverse-chronological feed, grouped by month.",
      "Filter by type, area, or person.",
      "Click any entry to jump to its source.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Completed tasks appear here." },
      { key: "chores", why: "Completed chores appear here." },
      { key: "services", why: "Logged service visits appear here." },
      { key: "utilities", why: "Logged utility bills appear here." },
      { key: "workbench", why: "Completed work sessions appear here." },
    ],
  },
  {
    key: "floorplan",
    title: "Floor Plan",
    valueProp:
      "A drawn map of your home — floors, basement, attic, roof, and yard — where you place inventory items spatially and tag each zone by its real-estate room type.",
    howTo: [
      "Draw or select a zone (a room or an exterior).",
      "Place items into a zone, or create a new item that inherits the zone as its location.",
      "Tag each zone's room type (bedroom, full / ¾ / half bath, kitchen, and more).",
    ],
    sharedWith: [
      { key: "inventory", why: "Zones set each item's location; items are placed from here." },
      { key: "preferences", why: "Floors and rooms are defined in Preferences." },
    ],
  },
  {
    key: "inventory",
    title: "Inventory",
    valueProp:
      "A catalog of everything in your home — appliances, fixtures, systems, finishes — with the specs, dates, and warranties every other page draws on.",
    howTo: [
      "Switch views — List, Table, or Outline — and single-click an item to open its details panel.",
      "Fill in custom fields (install date, model, warranty, estimated lifespan, finish specs).",
      "See the Item Lifespans page to track items aging toward replacement.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Items link directly to their maintenance tasks." },
      { key: "supplies", why: "Replaceable-part specs (filters, salt, batteries) define supplies." },
      { key: "guide", why: "Each item has a Notebook article; specs stay in sync." },
      { key: "ledger", why: "Purchase prices roll up into the spending ledger." },
      { key: "floorplan", why: "Items are placed and located on the floor plan." },
      { key: "lifespans", why: "Install dates and lifespans drive the replacement forecast." },
    ],
  },
  {
    key: "lifespans",
    title: "Item Lifespans",
    valueProp:
      "Ages every item against its expected lifespan to project when it'll need replacing, with a suggested annual reserve and a heads-up on warranties expiring soon.",
    howTo: [
      "Scan items soonest-to-replace first; the Life bar shows how much life remains.",
      "Edit an item's expected lifespan inline — it overrides the type default for that item.",
      "Set Purchase Price and an Install Date in Inventory so an item can be forecast.",
    ],
    sharedWith: [
      { key: "inventory", why: "Reads each item's install date, price, and lifespan." },
      { key: "preferences", why: "Default lifespans per type seed new items." },
      { key: "forecast", why: "The suggested reserve feeds the operating budget." },
    ],
  },
  {
    key: "maintenance",
    title: "Maintenance",
    valueProp:
      "The core of Foreman — a structured list of recurring maintenance tasks across every system, tracking what's overdue, what's due soon, and what's on schedule.",
    howTo: [
      "Browse tasks by system; open a task to see its schedule and history.",
      "Set a schedule and an optional season constraint.",
      "Log a completion when you finish a task.",
    ],
    sharedWith: [
      { key: "inventory", why: "Tasks link to the items they service." },
      { key: "dashboard", why: "Overdue/upcoming tasks drive Triage and health." },
      { key: "calendar", why: "Scheduled tasks appear there." },
      { key: "workbench", why: "Due tasks feed work sessions." },
      { key: "supplies", why: "Logging a replace/refill task decrements the matching supply." },
    ],
  },
  {
    key: "services",
    title: "Services",
    valueProp:
      "A manager for recurring service contracts and subscriptions — pest control, lawn care, warranties, monitoring — with providers, costs, billing cycles, and renewal dates.",
    howTo: [
      "Add a service with its provider, cost, and billing cycle.",
      "Log individual visits with technician notes.",
      "Watch renewal dates so nothing lapses.",
    ],
    sharedWith: [
      { key: "calendar", why: "Renewal dates surface there." },
      { key: "dashboard", why: "Monthly costs roll up to the cost stat." },
      { key: "ledger", why: "Service charges post to the ledger and feed the forecast." },
      { key: "timeline", why: "Logged visits appear there." },
    ],
  },
  {
    key: "utilities",
    title: "Utilities",
    valueProp:
      "Tracks recurring utility bills — electricity, gas, water, internet — building a spend and usage history from each monthly bill you log.",
    howTo: [
      "Create an account per utility.",
      "Log each monthly bill (amount plus optional usage like kWh or gallons).",
      "Review the trailing-12-month average.",
    ],
    sharedWith: [
      { key: "dashboard", why: "An estimated monthly total surfaces there." },
      { key: "ledger", why: "Logged bills post to the ledger and feed the forecast." },
      { key: "timeline", why: "Logged bills appear there." },
    ],
  },
  {
    key: "supplies",
    title: "Supplies",
    valueProp:
      "Tracks the consumables your home burns through on a cycle — furnace and water filters, softener salt, detector batteries, bulbs — and tells you what to reorder.",
    howTo: [
      "Set an on-hand count for each supply.",
      "Anything at or below its reorder point rolls onto the Shopping List.",
      "Copy the Shopping List when you head to the store.",
    ],
    sharedWith: [
      { key: "inventory", why: "Supplies are derived from items with a replaceable part." },
      { key: "maintenance", why: "The replacement cadence comes from each item's schedule; logging a refill decrements on-hand." },
      { key: "workbench", why: "Completing a refill in a session decrements on-hand." },
    ],
  },
  {
    key: "chores",
    title: "Chores",
    valueProp:
      "Regular household upkeep on repeating schedules — assigned to rooms, with a frequency and an optional duration — distinct from system-specific maintenance.",
    howTo: [
      "Add a chore, assign it to a room, and set a frequency and optional duration.",
      "Single-click a chore to edit its details; click its name to rename in place.",
      "Sort by any column, including status (by urgency); mark done as you go.",
    ],
    sharedWith: [
      { key: "dashboard", why: "Chores feed room/system health." },
      { key: "calendar", why: "Scheduled chores appear there." },
      { key: "workbench", why: "Due chores feed work sessions; duration drives effort planning." },
      { key: "timeline", why: "Completed chores appear there." },
    ],
  },
  {
    key: "workbench",
    title: "Workbench",
    valueProp:
      "The doing half of Foreman — plan a focused work session from everything due, then run it one card at a time as a punch list.",
    howTo: [
      "Filter due/overdue work by room, system, or time window against a time budget.",
      "Run the session card by card: Done logs completion, Skip leaves it due, Can't spawns a blocker to-do.",
      "Review past sessions in History.",
    ],
    sharedWith: [
      { key: "maintenance", why: "Pulls due tasks; Done writes their completions." },
      { key: "chores", why: "Pulls due chores." },
      { key: "board", why: "A Can't spawns a linked blocker To Do." },
      { key: "supplies", why: "Done decrements the matching supplies." },
      { key: "timeline", why: "Completed sessions appear there." },
    ],
  },
  {
    key: "board",
    title: "To Dos",
    valueProp:
      "A Kanban board for one-off action items that don't belong on a recurring schedule — from calling a contractor to ordering a replacement part.",
    howTo: [
      "Add a card to the backlog.",
      "Drag cards across columns as work progresses.",
      "Give a card a due date to surface it in work sessions.",
    ],
    sharedWith: [
      { key: "dashboard", why: "The To Dos panel mirrors this board." },
      { key: "workbench", why: "Dated to-dos feed sessions; a Can't creates a blocker here." },
    ],
  },
  {
    key: "projects",
    title: "Projects",
    valueProp:
      "Track renovation and improvement initiatives from start to completion — anything with a defined scope that spans days or weeks.",
    howTo: [
      "Create a project with its scope.",
      "Log progress, attach notes, and link inventory items.",
      "Follow effort across time.",
    ],
    sharedWith: [
      { key: "dashboard", why: "The Projects panel mirrors this page." },
      { key: "inventory", why: "Link items to a project." },
      { key: "guide", why: "Classify a Notebook article by the project it's about." },
    ],
  },
  {
    key: "ledger",
    title: "Spending",
    valueProp:
      "The backward-looking record of what your home has cost — every paid transaction plus spend summaries by system, room, and category.",
    howTo: [
      "Review the running ledger of expenses, bills, service charges, and purchases.",
      "Log a one-off repair or part with + Add Expense; link it to an item to attribute the cost.",
      "Read the summaries for total invested and spend by category.",
    ],
    sharedWith: [
      { key: "inventory", why: "Purchase prices roll up here by system and room." },
      { key: "services", why: "Service charges post to the ledger." },
      { key: "utilities", why: "Utility bills post to the ledger." },
      { key: "maintenance", why: "Logged repairs feed the trailing repairs total." },
      { key: "forecast", why: "Logged spend informs the forward projection." },
    ],
  },
  {
    key: "forecast",
    title: "Forecast",
    valueProp:
      "The forward-looking projection of what the home will cost to run — services, seasonal utilities, replacement reserve, repairs baseline, planned one-offs, and mortgage.",
    howTo: [
      "Project a forward 12-month run-rate against a monthly target.",
      "Pin planned one-off costs to a month; set a mortgage payment with per-month corrections.",
      "Refine costs on the Services and Utilities tabs.",
    ],
    sharedWith: [
      { key: "services", why: "Active contracts drive projected monthly spend." },
      { key: "utilities", why: "Seasonal bill averages feed the projection." },
      { key: "ledger", why: "The repairs baseline comes from logged spend." },
      { key: "dashboard", why: "The Dashboard run-cost stat summarizes this page." },
    ],
  },
  {
    key: "mortgage",
    title: "Mortgage",
    valueProp:
      "Your home loan, two ways: a monthly payment with an escrow split and per-month corrections that feeds your cash-flow outlook, and — once you enter the loan terms — a full amortization model showing balance, payoff date, interest, and the equity you've built.",
    howTo: [
      "Set the monthly payment and its escrow portion (taxes + insurance); correct any single month from the payment ledger.",
      "Add the loan terms (original principal, rate, term, start) to see current balance, payoff date, and interest paid / remaining / this year.",
      "Enter your home value to track equity and loan-to-value — Foreman flags when you reach 80% LTV and may be able to cancel PMI.",
    ],
    sharedWith: [
      { key: "forecast", why: "The payment feeds the forward total monthly outlay." },
      { key: "ledger", why: "Past mortgage payments post to the spending ledger." },
      { key: "alerts", why: "A PMI-cancellation opportunity surfaces in Triage when loan-to-value reaches 80%." },
    ],
  },
  {
    key: "guide",
    title: "Notebook",
    valueProp:
      "The home's knowledge base — an article for every inventory item plus your own standalone articles, where you write freely and edit item specs inline.",
    howTo: [
      "Pick an article and write; double-click anywhere to enter edit mode.",
      "Group the list by system, room, or recency — or drag to arrange it yourself.",
      "Use + New Article for standalone notes; classify any article by item, location, system, project, or task.",
    ],
    sharedWith: [
      { key: "inventory", why: "One article per item; specs stay in sync." },
      { key: "maintenance", why: "Classify an article by the task it's about." },
      { key: "projects", why: "Classify an article by the project it's about." },
    ],
  },
  {
    key: "preferences",
    title: "Preferences",
    valueProp:
      "Configure the structure of your home — floors, rooms, entity types — and app settings. These definitions shape how data is organized across every other page.",
    howTo: [
      "Define floors, rooms, and entity types.",
      "Adjust application settings.",
      "Check the Default Values tab for curated lifespans (editable) and built-in Model Coverage.",
    ],
    sharedWith: [
      { key: "floorplan", why: "Floors and rooms define the floor-plan zones." },
      { key: "inventory", why: "Entity types organize how items are grouped." },
    ],
  },
];

// Fast lookup by App page key.
const BY_KEY = Object.fromEntries(PAGE_INFO.map((p) => [p.key, p]));

export function getPageInfo(key) {
  return BY_KEY[key] || null;
}

// Fast lookup by display title (the `active` label pages pass to FmHeader).
const BY_TITLE = Object.fromEntries(PAGE_INFO.map((p) => [p.title, p]));

export function getPageInfoByTitle(title) {
  return BY_TITLE[title] || null;
}

// Resolve a page key to its display title (for rendering sharedWith references).
export function pageTitle(key) {
  return BY_KEY[key]?.title || key;
}
