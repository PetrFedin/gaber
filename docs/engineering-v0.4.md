# GABER / v0.4 manufacturing engineering milestone

Date: 2026-10-17. This is a research/prototype branch, not approved CAD/CAM documentation.

## Implemented and wired to technical sheet

- `src/manufacturing.js`: unit-independent concept identities for individual frame members, joinery locations, proposed 0.5 mm cut tolerance and 2 mm nominal clearance (**design assumptions, not approved**), links to requested material SKUs, drawing revisions, factory routes and costs, all absent values expressed as null.
- `src/TechnicalPage.jsx`: part traceability, joint register, release checks, downloadable JSON and CSV.
- `assessBeam`: simply supported prismatic rectangular beam under UDL, with explicitly supplied span, section, design load, elastic modulus and allowable stress/deflection. Equations: `I=b*h^3/12`; `M=q*L^2/8`; `sigma=M/W`; `delta=5*q*L^4/(384*E*I)`, `W=b*h^2/6`. Results **cannot establish furniture safety**; no creep, connection strength, racking, overturning, fatigue or point loads.
- `foamCompression`: interpolates only between supplied monotone lab data points; no extrapolation or simulated bodily pressure map.
- `panelPattern`: rectangular bounding cut pieces for pillows with conceptual 12 mm seam allowance; no usable linear metres or claimed cutting optimization without real pattern layout, nap and repeat.
- `src/assetSafety.js`: validation contract for glTF units in metres, UV, PBR basecolor/normal/roughness, measured texture repeat and colour calibration. Does not include real approved material scans or Blender exports.
- `hingedPreview`, `axisAlignedCollision`, `transformPreview`: ideal one-hinge motion and conservative AABB intersection checks, intentionally not a certified motion or pinch hazard solver.
- `tests/manufacturing.test.js`: traceability, joints, legacy safety blocking, preliminary beam arithmetic and foam interpolation.

## Production release: fail closed

Package always returns `productionRelease.allowed=false` pending real factory-controlled authenticated workflow. Signed approval records typed into untrusted browser data are **not** sufficient; an authenticated and independently verified backend is mandatory. CAD/CAM export, real pricing, safety and manufacturing are blocked. Client-side statements of "approved" are metadata only.

## Required factory documentation to go further

1. Approved shop drawings and permitted changes for one real product family; 3D STEP/CAD and exploded parts.
2. Structural load cases and test reports for local target market, including joint strengths, hardware, stability and durability.
3. Actual measured foam compression curves, fatigue/recovery properties, steel spring mechanical properties, batting specification and pillows stuffing mass.
4. Approved upholstery SKU, roll width, nap, pattern repeat, shrinkage, cutting markers and technical sewing method.
5. PBR scan package: calibrated physical scale, basecolor, normal, roughness and permitted capture under stable lighting; glTF/GLB with semantic node mapping.
6. Mechanism vendor CAD, travel envelope, limitations, forces, safety clearances and certifications.
7. BOM source ERP data, procurement costs with validity dates, scrap, operations, labour rates, finance authority.

## Verification guidance

Run `npm ci && npm test && npm run build`, then desktop/mobile visual checks, including WebGL and SVG fallback. Existing previous v0.3 GitHub Actions run was observed failed; do not merge this branch before green checks. A passing test suite cannot certify a physically safe chair or sofa.

Useful technical references (not proof of product conformance):

- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/GLTFLoader.html
- https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- https://www.iso.org/standard/68735.html (look up current polyurethane test edition before certification)
