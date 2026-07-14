import React, { useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Environment, Float, Sparkles, Billboard, Stars } from '@react-three/drei';
import * as THREE from 'three';

function NanoBanana() {
  const texture = useLoader(THREE.TextureLoader, '/assets/nano_banana.png');
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <Billboard position={[0, 0, 0]} args={[3, 3]}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={texture} transparent={true} />
        </mesh>
      </Billboard>
    </Float>
  );
}

function FuturisticShapes() {
  const meshRef1 = useRef();
  const meshRef2 = useRef();
  
  useFrame((state, delta) => {
    if (meshRef1.current) {
      meshRef1.current.rotation.x += delta * 0.2;
      meshRef1.current.rotation.y += delta * 0.3;
    }
    if (meshRef2.current) {
      meshRef2.current.rotation.x -= delta * 0.1;
      meshRef2.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={meshRef1} position={[-4, 1.5, -2]}>
        <torusKnotGeometry args={[1.2, 0.3, 128, 16]} />
        <meshStandardMaterial color="#8a2be2" wireframe={true} emissive="#ff00ff" emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={meshRef2} position={[4, -1.5, -3]}>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color="#00ffff" wireframe={true} emissive="#00ffff" emissiveIntensity={0.6} />
      </mesh>
    </Float>
  );
}

export default function Scene3D() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: -2,
      pointerEvents: 'none',
      backgroundImage: 'url(/assets/bg.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      opacity: 0.9,
    }}>
      {/* Fallback dark overlay to ensure readability if image fails or is too bright */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10, 10, 15, 0.6)' }} />
      
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} style={{ position: 'absolute', inset: 0 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Sparkles count={150} scale={15} size={6} speed={0.4} opacity={0.5} color="#00ffff" />
        
        <FuturisticShapes />
        <NanoBanana />
        
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
