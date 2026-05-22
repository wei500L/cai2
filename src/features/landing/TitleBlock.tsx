import { motion } from 'framer-motion'

type TitleBlockProps = {
  bootComplete: boolean
}

export function TitleBlock({ bootComplete }: TitleBlockProps) {
  return (
    <motion.section
      className="grid justify-items-center text-center font-hud"
      initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
      animate={
        bootComplete
          ? { opacity: 1, y: 0, filter: 'blur(0px)' }
          : { opacity: 0.16, y: 8, filter: 'blur(4px)' }
      }
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.p
        className="text-[0.67rem] uppercase tracking-[0.44em] text-[color:rgba(154,230,255,0.7)] sm:text-xs"
        animate={{ opacity: [0.95, 1, 0.97, 1, 0.96, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
      >
        EDEN-7 COMMAND LINK
      </motion.p>

      <motion.h1
        className="mt-5 text-[clamp(3.1rem,13vw,9.5rem)] leading-none text-[color:#f4fbff]"
        style={{
          textShadow:
            '0 0 10px rgba(216, 250, 255, 0.55), 0 0 28px rgba(51, 170, 255, 0.38), 0 0 62px rgba(51, 170, 255, 0.18)',
        }}
        animate={{ opacity: [1, 0.965, 1, 0.985, 1, 0.95, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'linear' }}
      >
        外交风云
      </motion.h1>

      <motion.p
        className="mt-4 text-[clamp(0.95rem,3.5vw,1.65rem)] uppercase tracking-[0.28em] text-[color:rgba(218,247,255,0.86)]"
        animate={{ opacity: [0.96, 1, 0.98, 1, 0.955, 1] }}
        transition={{ duration: 3.1, repeat: Infinity, ease: 'linear' }}
      >
        人机混战 AI Diplomacy
      </motion.p>

      <motion.p
        className="mt-5 max-w-[92vw] text-[0.72rem] tracking-[0.24em] text-[color:rgba(172,205,218,0.78)] sm:text-sm"
        animate={{ opacity: [0.95, 1, 0.98, 1] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: 'linear' }}
      >
        公元 2147 · 伊甸-7 殖民纪元 · 八文明博弈
      </motion.p>
    </motion.section>
  )
}
