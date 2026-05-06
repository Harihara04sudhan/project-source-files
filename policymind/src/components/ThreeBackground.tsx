"use client";

// Subtle 3D backdrop for the cockpit.
// Aesthetic: a slowly rotating wireframe icosahedron (the "policy graph"),
// floating particles (the "audit events"), and a faint starfield. All on the
// dark cockpit palette with green / violet accents. Sits at z-index -10 with
// pointer-events disabled so it never interferes with the UI.

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Points, PointMaterial, Stars, Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Slowly rotating wireframe polyhedron — the central "policy graph" element.
function PolicyGraph() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.06;
    ref.current.rotation.y += delta * 0.04;
  });

  return (
    <Float speed={0.6} rotationIntensity={0.2} floatIntensity={0.4}>
      <group>
        <mesh ref={ref}>
          <icosahedronGeometry args={[1.6, 1]} />
          <meshBasicMaterial color="#a78bfa" wireframe transparent opacity={0.55} />
        </mesh>
        {/* Inner glow sphere */}
        <mesh>
          <icosahedronGeometry args={[0.9, 0]} />
          <meshBasicMaterial color="#00ff9c" wireframe transparent opacity={0.18} />
        </mesh>
      </group>
    </Float>
  );
}

// Drifting particles that look like flowing audit events.
function EventParticles({ count = 280 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spread within a 14-unit cube, weighted toward outer shell so the centre
      // stays uncluttered for the polyhedron.
      const r = 4 + Math.random() * 4;
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      p[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      p[i * 3 + 2] = r * Math.cos(theta);
    }
    return p;
  }, [count]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.02;
    ref.current.rotation.x += delta * 0.01;
  });

  return (
    <Points ref={ref} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#6cb1ff"
        size={0.04}
        sizeAttenuation
        depthWrite={false}
        opacity={0.7}
      />
    </Points>
  );
}

// A faint horizontal grid plane to suggest a cockpit floor / scanline horizon.
function HorizonGrid() {
  return (
    <gridHelper
      args={[60, 40, "#00ff9c", "#1a2334"]}
      position={[0, -3.5, 0]}
      // Cast as any because the helper's material types come from three core.
    />
  );
}

// Subtle "data link" lines pulsing between the centre and outer waypoints.
function DataLinks() {
  const points = useMemo(() => {
    const arr: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < 6; i++) {
      const phi = (i / 6) * Math.PI * 2;
      const r = 5;
      const tip = new THREE.Vector3(Math.cos(phi) * r, Math.sin(phi) * r * 0.5, Math.sin(phi) * r * 0.7);
      arr.push([new THREE.Vector3(0, 0, 0), tip]);
    }
    return arr;
  }, []);

  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((state) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.rotation.z = state.clock.elapsedTime * 0.05 + i;
    });
  });

  return (
    <>
      {points.map(([a, b], i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <Line
            points={[a, b]}
            color="#a78bfa"
            lineWidth={1}
            transparent
            opacity={0.18}
            dashed
            dashScale={3}
          />
        </group>
      ))}
    </>
  );
}

export function ThreeBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{
        // Mask the edges so the 3D content fades into the cockpit chrome.
        maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 60%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 70% at 50% 40%, black 60%, transparent 100%)",
        opacity: 0.55,
      }}
    >
      <Canvas
        camera={{ position: [0, 0.4, 5.5], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[6, 6, 6]} intensity={0.8} color="#00ff9c" />
        <pointLight position={[-6, -3, -4]} intensity={0.6} color="#a78bfa" />

        <Stars
          radius={60}
          depth={40}
          count={1200}
          factor={2.5}
          saturation={0}
          fade
          speed={0.4}
        />

        <EventParticles />
        <HorizonGrid />
        <DataLinks />
        <PolicyGraph />
      </Canvas>
    </div>
  );
}
