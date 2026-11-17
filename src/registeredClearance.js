import {buildInspectionAssembly} from './EngineeringAssembly.js';
import {createManufacturingPackage} from './manufacturing.js';
import {inspectPoseClearance} from './kinematicClearance.js';

export function registeredClearanceRefs(manufacturing) {
  const refs = [
    ...(manufacturing?.parts ?? []).map(part => part.sceneNodeRef),
    ...(manufacturing?.suspension?.pieces ?? []).map(part => part.sceneNodeRef),
    ...(manufacturing?.layers ?? []).flatMap(layer => layer.sceneNodeRefs ?? [])
  ];
  if (refs.some(ref => typeof ref !== 'string' || !ref.trim())) {
    throw TypeError('CLEARANCE_INVALID_PRODUCTION_REFERENCE');
  }
  return [...new Set(refs)].sort();
}

// Uses exactly the assembly and node identifiers displayed by the technical
// passport, not independent proxy dimensions or a second furniture catalogue.
export function inspectRegisteredClearance(config, movingRef, stationaryRef, marginMm = 0) {
  const manufacturing = createManufacturingPackage(config);
  const knownRefs = new Set(registeredClearanceRefs(manufacturing));
  if (!knownRefs.has(movingRef) || !knownRefs.has(stationaryRef)) {
    throw RangeError('CLEARANCE_UNKNOWN_PRODUCTION_REFERENCE');
  }
  if (movingRef === stationaryRef) throw RangeError('CLEARANCE_SAME_PRODUCTION_REFERENCE');
  const assembly = buildInspectionAssembly(config);
  try {
    const meshes = new Map();
    assembly.traverse(node => {
      if (!node.isMesh || !node.name) return;
      if (meshes.has(node.name)) throw TypeError('CLEARANCE_DUPLICATE_SCENE_REFERENCE');
      meshes.set(node.name, node);
    });
    if (!meshes.has(movingRef) || !meshes.has(stationaryRef)) {
      throw TypeError('CLEARANCE_PRODUCTION_SCENE_DRIFT');
    }
    const result = inspectPoseClearance({
      moving: meshes.get(movingRef), stationary: [meshes.get(stationaryRef)], marginMm
    });
    return {...result, movingRef, stationaryRef, sceneVersion: assembly.userData.engineeringVersion,
      manufacturingVersion: manufacturing.schemaVersion,
      productionRelease: 'blocked-no-approved-kinematics-or-clearance-validation'};
  } finally {
    const geometries = new Set(), materials = new Set(assembly.userData.materials ?? []);
    assembly.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const mat of (Array.isArray(node.material) ? node.material : [node.material])) materials.add(mat);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
