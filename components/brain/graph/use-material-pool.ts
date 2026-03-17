import { useCallback, useRef } from "react";
import * as THREE from "three";

export function useMaterialPool() {
  const materialPoolRef = useRef(new Map<string, THREE.MeshLambertMaterial>());

  const getMaterial = useCallback((color: string, opacity: number, emissiveColor: string, emissiveIntensity: number, transparent = true): THREE.MeshLambertMaterial => {
    const qOpacity = Math.round(opacity * 20) / 20;
    const qEmissive = Math.round(emissiveIntensity * 20) / 20;
    const key = `${color}|${qOpacity}|${emissiveColor}|${qEmissive}`;
    let mat = materialPoolRef.current.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({
        color, transparent, opacity: qOpacity,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity: qEmissive,
      });
      mat.userData = { shared: true };
      materialPoolRef.current.set(key, mat);
    }
    return mat;
  }, []);

  const getHaloMaterial = useCallback((color: string, opacity: number): THREE.MeshBasicMaterial => {
    const key = `halo|${color}|${Math.round(opacity * 20)}`;
    let mat = (materialPoolRef.current as Map<string, any>).get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.round(opacity * 20) / 20 });
      mat.userData = { shared: true };
      (materialPoolRef.current as Map<string, any>).set(key, mat);
    }
    return mat;
  }, []);

  const disposeMaterials = useCallback(() => {
    for (const mat of materialPoolRef.current.values()) {
      (mat as THREE.Material).dispose();
    }
    materialPoolRef.current.clear();
  }, []);

  return { materialPoolRef, getMaterial, getHaloMaterial, disposeMaterials };
}
