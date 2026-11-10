import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

export function AnimatedNumber({
  value,
  format,
  duration = 0.8,
}: {
  value: number
  format: (n: number) => string
  duration?: number
}) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(v))

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [mv, value, duration])

  return <motion.span>{text}</motion.span>
}
