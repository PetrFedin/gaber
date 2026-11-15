# GABER — comparative platform benchmark and engineering roadmap
Verified date: 2026-10-20
Project: PetrFedin/gaber, draft PR #2. Reference stage: concept 0.4.6, not manufacturing certified.

## Basis and evidence policy
Vendor-published functionality is evidence of a capability offered by the vendor, not proof that every license includes it or that its performance has been independently demonstrated.
GABER capabilities marked implemented refer to source code currently in its draft branch, not confirmed browser production quality.
Not finding a capability on a product page is NOT evidence that the product cannot perform it.
Do not copy proprietary source, licensed CAD asset libraries, textures, patents or machine postprocessors.

## Competitor inventory — Russian market

| Product | Officially evidenced functions | GABER action | Source |
| --- | --- | --- | --- |
| БАЗИС 2026 | Engineering 3D and CAD docs; cost; sheet nesting; packaging; CNC, stock and showroom | Unified manufacturing dossier; factory adapters; package optimization | https://www.bazissoft.ru/ ; https://bazissoft.ru/file/guide |
| К3-Мебель | Parametric product design, joint and collision checks, drawings/drilling tables, nesting and CNC export | Parametric geometry check suite; reference hardware/drill placement | https://k3-mebel.ru/ ; https://k3-mebel.ru/products/raskroy.html |
| bCAD Мебель Про | Panels, curved and profile parts, fittings, estimates, part drawings, nesting, DXF and 1C/data exchange | Custom profiles/curved geometry and report formats | https://www.bcad.ru/ ; https://www.bcad.ru/furniture/ |
| Астра Конструктор Мебели | 3D furniture/interior design, part reports, cutting layout, CNC data transfer, labels | Operator-friendly fabrication labels and cut job | https://astrapro.software/ |

## Competitor inventory — international

| Product | Officially evidenced functions | GABER action | Source |
| --- | --- | --- | --- |
| imos iX CAD / CAM / NET | Parametric components, structured multi-level BOM, connector/machining registry, ERP and CNC data, B2B web catalog | Versioned engineering graph with CAD/CAM connectors and configurable sales rules | https://www.imos3d.com/en/products/design-order/ix-cad-1/ ; https://www.imos3d.com/en/products/manufacturing-assembly/cnc-programming-ix-cam/ ; https://www.imos3d.com/en/products/sale/ix-net/b2b-online-sale-order-system-net-studio/ |
| Microvellum | CAD/CAM, woodworking BOM, estimates, material, hardware, labor and overhead calculations, CNC | Evidence-backed per-component standard rates and operation minutes | https://www.microvellum.com/platform/ |
| TopSolid Wood | Exact solid modeling, associative CAD/CAM machining, manufacturing documents and postprocessors | Approved geometry kernel and vendor-certified CAM output | https://www.topsolid.com/en/products/topsolidwood |
| Cabinet Vision | Parametric casework design, cost, BOM, drawings and CNC output | Automated part family rules and CNC-cutting documents | https://essential.cabinetvision.com/ |
| Roomle Rubens | Modular sofa configurator, live 3D and AR, BOM, live pricing, e-commerce/order API, room planner | Consumer and retailer configurator with validated pricing and AR | https://www.roomle.com/en/configurator ; https://www.roomle.com/en/pricing |
| Cylindo | Furniture-grade 360 visuals, photoreal render assets and web-native AR | PBR pipeline, responsive viewer and physically scale-calibrated AR | https://www.cylindo.com/platform/products/augmented-reality/ |
| Configura CET | Manufacturer catalogs, configurable 2D/3D commercial interiors, quotation and BOM | Verified multi-brand B2B dealer specification and versioned catalog | https://www.configura.com/products/cet/commercial-interiors |
| Lectra Valia Furniture | Upholstery marker creation, digital planning/cutting, workcenter monitoring, roll consumption and analytics | High-priority textile marker and cutting workflow | https://www.lectra.com/en/furniture/products/valia-furniture |
| Lectra Vector Furniture | Upholstery pattern/marker, fabric spreading and connected cutting machinery | Measured patterns, orientation, repeat and cutting path | https://www.lectra.com/en/furniture/products/vector-furniture |
| Odoo Manufacturing 19 | BoM, work centers, real versus estimated MO cost, inventory, WIP, job cards | Standard-vs-actual costing with transaction support and work center logs | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/mo_costs.html |
| ERPNext | Work orders, BOM, job cards, workstations, inventory, purchasing and QC | Interoperable MRP/MES core and lot traceability | https://docs.frappe.io/erpnext/v14/user/manual/en/manufacturing |

## Functional gap map and implementation status
Legend: I=implemented in draft source; D=conceptual representation, not validated physical geometry; R=only a design requirement/backlog; F=factory/browser proof missing. These are not numerical competitor scores.

| Function family | GABER current | Priority | Concrete next deliverable | Proof required |
| --- | --- | --- | --- | --- |
| Visual product option selection | I | P1 | Compatible options matrix and customer constraint explanations | desktop + mobile UX |
| 3D assembly and scene identities | D | P0 | Unique part, support, soft and joint IDs for every configuration | Three.js screenshot + dimensions |
| Single authoritative engineering model | D | P0 | Versioned geometry assembly graph with lineage | no drift between exports/3D |
| Exact solid profiles / curves | R | P2 | External precision-CAD adapter, curved parts, geometry interchange | CAD reference and tolerances |
| Structural analysis | R | P1 | Member/joint/load cases with measured data | independent structural engineer |
| Drill coordinates / rated fasteners | R | P1 | Vendor-specific hole and fitting interfaces | factory drawing and trial assembly |
| Upholstery pattern pieces | R | P1 | Panel/pillow/seat/back/arm patterns and true seams | physical prototype and fit |
| Nap/repeat/shrinkage | R | P1 | Textile direction, repeat matching, process allowance | real vendor textile certificate |
| Fabric marker optimization | R | P1 | Optimized nesting by roll width/length and batch | physical marker test |
| Foam volume / layer IDs | D | P1 | Deformable cushions with known measured curves | CLD/IFD and mass |
| Pocket Spring / straps / slats | D | P1 | Vendor family geometry, tension and support spacing | rated spring and assembly tests |
| Mechanism kinematics | R | P1 | Articulated motion, collisions, pinch zones | mechanism drawings and cycle tests |
| PBR/UV/rendering | D | P2 | SKU-backed physical textures, calibrated lights and scale | photographed sample / reference |
| 3D AR room preview | R | P2 | USDZ/GLB export, room fit and floor anchoring | iOS/Android real-scale testing |
| Digital configuration/BOM export | I/D | P0 | Deterministic versioned manifests and checksum | repeatable export and roundtrip |
| Local project backup/recovery | I | P0 | Comprehensive lossless restore acceptance tests | real-browser storage and quota test |
| Server version history/auth roles | R | P1 | Role-based database projects and immutable revisions | transaction and concurrency tests |
| Demo quote estimation | I | P0 | Traceable rate source for all lines | exact arithmetic tests |
| Cost→entity traceability | I | P0 | Canonical semantic mapping; unknowns not inferred | negative mutation tests |
| Actual material consumption/cost | R | P1 | Lot/SKU, purchasing and measured operation links | PO/GRN/invoice and approval |
| Work orders and route minutes | R | P2 | Part-level work center job cards with time | shop-floor time recording |
| ERP and 1C exchange | R | P2 | Bidirectional adapter with idempotent ledger | end-to-end reconciliation |
| Optimized multi-order nesting | R | P2 | Sheet and textile remnants and job-group scheduling | material trial |
| CNC postprocessors | R | P2 | Approval-only machine profiles and dry-run | approved machine program |
| Labels/QR genealogy | R | P2 | Piece/lot/order linking | scan and reconciliation |
| B2B/retailer configurable catalog | R | P2 | Price rules by customer/channel and validated BOM | approved commercial pilot |
| QC and serial lifecycle | R | P2 | Nonconformance / warranty / replaceable-part genealogy | lot and defect audit |
| Factory release and authority | F | P0 | Authenticated, signed release gate outside browser | external approvals and green CI |

## Engineering architecture: one digital chain
ConfigurationRevision -> ParametricAssembly -> SceneNode Registry -> Part Registry ->
Joint and Fastener Register -> Soft-Layer and Pattern Register -> Material/Hardware Catalog ->
Manufacturing Routing -> Standard-Cost Ledger -> QuotationRevision ->
Authorized Order -> Procurement -> Production Job Card -> Shop-Floor Actuals ->
Quality Control -> Delivered Serialization -> Repair and Warranty.

Version each stage with the source configuration fingerprint, CAD/model revision, rule engine version, material/price effective date, author, approver, change reason, output digest, status and dependency list.

Required database entities:
- products, product_variants, configurations, configuration_revisions, dimension_rules, constraints;
- parts, part_instances, scene_nodes, joint_instances, cutting_patterns, seams, materials, material_lots, supplies;
- BOM_headers, BOM_lines, BOM_revisions, routing_operations, workcenters, labor_rates;
- pricing_profiles, pricing_profile_revisions, cost_rows, cost_evidence, cost_approvals;
- shop_orders, purchase_orders, goods_receipts, supplier_invoices, stock_moves;
- design_approvals, release_decisions, QC_inspections, nonconformances, serial_units, warranties.

Identity constraints:
- A commercial price source is not a technical SKU, and one demo cost row can refer to many parts WITHOUT allocating its rate to those parts.
- Stock movement cannot be created without approved part/material code and source transaction.
- No engineering change can invalidate previously approved snapshots without opening a new explicit revision.
- No real price or cost can be inferred from digital envelopes, density class or default demonstration rates.
- State machine must distinguish CONCEPT, ENGINEERING_REVIEW, SUPPLIER_DATA_REQUIRED, FACTORY_TEST_REQUIRED, SIGNED_OFF, RELEASED and SUPERSEDED, with server authorization.

## Product innovation directions (proposals, not claims of unique novelty)
1. Impact Graph: when users change any configuration choice, graph exactly which part IDs, joints, patterns, BOM counts, material lots, operations, pricing, warranty or assembly instructions change; show before/after.
2. Readiness Passport per SKU: an auditable list of model/drawing/material/price/tolerance/test evidence, stamped by authority and expiration.
3. Manufacturing debt monitor: tally missing evidence, unpriced parts, unmodeled support, tolerance breaks, unsafe mechanism states by part and release effect.
4. Repairability Passport: linked spare covers/cushions/connectors, proven disassembly plan, recyclable packaging and replacement sourcing.
5. Factory feedback: compare approved planning rates with supplier invoices, actual consumption and hours and suggest norm corrections for human signoff (not auto-approval).
6. Multi-factory feasibility: match verified factory machine/material/operation capabilities to an approved design and show constraints, not guessed quotes.
These capabilities cannot be claimed absent from every competitor without independent comprehensive patent and market review.

## Release sequence and acceptance

### P0: v0.4.6 remaining
- Exact SHA GitHub Actions: npm ci, npm test, npm run build, inspectable logs; status currently NOT GREEN.
- Browser: WebGL, SVG fallback, mobile and desktop, saving/loading/export/import, no data loss on stale tab updates.
- Verify exported engineering package vs rendered 3D and canonical demo cost→part family links.
- No silent hiding of unpriced hardware, unknown materials or missing operations.
- Keep productionRelease.allowed = false.

### P1: upholstery and safety engineering
- Verify CAD/drawing revisions, joinery, hole position and spacing, tolerances with vendor/factory.
- Real cushion/foam deformation data and measured pillow filling.
- Pattern panels, real marker, fabric SKU/roll rules, shrinkage, waste and production trial.
- Engineering gate needs independent test evidence, factory approver and safety standard applicability review.
- Customer UI must show which options are technically possible, commercially available or still concept-only.

### P2: commercial-to-manufacturing integration
- Order state, supplier line pricing, buying/stock movements, work orders and QC with double-entry-like immutable audit.
- Industry CAD/CAM import/export adapters and vendor-specific dry-run tests.
- Multi-order nesting, inventory remnant handling and barcode shop-floor picking.
- Responsive branded showroom 3D/AR with real material master data.

### P3: factory platform and lifecycle
- Multi-factory planning and scheduling, measured KPI and batch-quality learning.
- After-sales serial passport, component replacement and sustainability evidence.

## Safety and commercialization
Before claiming parity or production-grade quality, require demonstration on real licensed modules and comparable end-to-end tasks. Never run proposed CNC/G-code from unapproved concept geometry. Copyright, trade secrets and vendor licensed SDKs cannot be copied; implement functional equivalents through our own code or lawful integration.

Commercial opportunity requires proof through at least one complete real sofa factory case: approved drawings -> real fabric and foam -> measured cutting plan -> frame BOM -> priced supplier SKUs -> labor route -> delivered unit -> QA -> variance against plan. No ROI, margin uplift, precision or capacity improvement can be asserted before measuring this baseline.
