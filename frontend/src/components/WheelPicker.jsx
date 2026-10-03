import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation, useMotionValue } from 'framer-motion';

export default function WheelPicker({ items, value, onChange, infinite = false }) {
  const [visualIndex, setVisualIndex] = useState(0);
  const containerRef = useRef(null);
  const itemHeight = 40;
  const displayItems = infinite ? [...items, ...items, ...items, ...items, ...items] : items;
  const controls = useAnimation();
  const y = useMotionValue(0);
  // Initialize visualIndex
  useEffect(() => {
    let targetIdx = items.indexOf(value);
    if (infinite) targetIdx += items.length * 2;
    setVisualIndex(targetIdx);
    y.set(-targetIdx * itemHeight);
  }, []);

  const snapTo = (index) => {
    if (index < 0) index = 0;
    if (index >= displayItems.length) index = displayItems.length - 1;
    
    setVisualIndex(index);
    const targetY = -index * itemHeight;
    
    controls.start({
      y: targetY,
      transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 }
    });

    const realValue = displayItems[index];
    if (realValue !== value) {
      onChange(realValue);
    }
  };

  const handleDragEnd = (e, info) => {
    // Calculate projected destination based on velocity
    const velocityY = info.velocity.y;
    const currentY = y.get();
    
    // Predict where it will land (standard friction formula)
    const projectedY = currentY + (velocityY * 0.1);
    
    let index = Math.round(-projectedY / itemHeight);
    
    // Bounds safety
    if (index < 0) index = 0;
    if (index >= displayItems.length) index = displayItems.length - 1;
    
    snapTo(index);

    // Infinite loop reset logic
    if (infinite) {
      setTimeout(() => {
        if (index < items.length || index >= items.length * 4) {
          const realValue = displayItems[index];
          const middleIndex = items.length * 2 + items.indexOf(realValue);
          setVisualIndex(middleIndex);
          y.set(-middleIndex * itemHeight);
        }
      }, 300); // wait for spring animation to settle
    }
  };

  // Wheel event for desktop mouse scroll
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    let newIndex = visualIndex + delta;
    snapTo(newIndex);
    
    if (infinite) {
      setTimeout(() => {
        if (newIndex < items.length || newIndex >= items.length * 4) {
          const realValue = displayItems[newIndex];
          const middleIndex = items.length * 2 + items.indexOf(realValue);
          setVisualIndex(middleIndex);
          y.set(-middleIndex * itemHeight);
        }
      }, 300);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-16 h-[120px] overflow-hidden rounded-xl bg-zinc-900 border border-zinc-700 select-none cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
    >
      {/* Selection Highlight Box in the middle */}
      <div className="absolute top-[40px] left-0 w-full h-[40px] bg-cyan-500/20 border-y border-cyan-500/50 pointer-events-none z-10" />
      
      <motion.div 
        drag="y"
        dragConstraints={containerRef}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ y, paddingTop: '40px', paddingBottom: '40px' }}
        className="w-full flex flex-col items-center z-0"
      >
        {displayItems.map((item, i) => {
          // Calculate distance from center for 3D effect / opacity
          const dist = Math.abs(visualIndex - i);
          const isCenter = dist === 0;
          const opacity = isCenter ? 1 : Math.max(0.2, 1 - dist * 0.4);
          const scale = isCenter ? 1.1 : 0.9;
          const rotateX = (visualIndex - i) * 30; // 30 deg per step

          return (
            <motion.div 
              key={i}
              className={`flex items-center justify-center h-[40px] w-full text-xl font-mono transition-colors duration-200 ${isCenter ? 'text-cyan-400 font-bold' : 'text-zinc-500'}`}
              animate={{ 
                opacity, 
                scale,
                rotateX: Math.max(-60, Math.min(60, rotateX)) // cap rotation
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ transformPerspective: 500 }}
            >
              {typeof item === 'number' ? item.toString().padStart(2, '0') : item}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
