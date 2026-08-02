// VoltHub V2 — Motion primitives (micro-animations).
// Thin wrappers over `motion` (the framer-motion successor) implementing the
// DESIGN.md motion principles: quiet fade-up entrances and gentle list staggers.
// Nothing bouncy, nothing attention-seeking. Import React bindings from
// "motion/react" (the bare "motion" entry is the vanilla animation API).
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";

// Fade in from below — for cards, panels, headers.
export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Staggered list — wrap a list container with this.
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.05 } },
        hidden: {},
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Item to use inside a StaggerList.
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Presence wrapper — for smooth mounting/unmounting.
export { AnimatePresence };
