import { MeshGradient } from "@paper-design/shaders-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const stack = ["Vite 8", "React 19", "Tailwind v4", "shadcn/ui", "Motion", "Paper Shaders"]

export default function App() {
  return (
    <main className="relative min-h-svh overflow-hidden">
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#0b0b0f", "#1e1b4b", "#0e7490", "#312e81"]}
        speed={0.4}
      />
      <div className="relative z-10 flex min-h-svh items-center justify-center p-6">
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg rounded-3xl border border-white/15 bg-white/10 p-10 shadow-2xl shadow-black/40 backdrop-blur-2xl"
        >
          <p className="text-sm font-medium tracking-widest text-white/60 uppercase">
            web studio
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            The stack is live.
          </h1>
          <p className="mt-4 text-white/70">
            A static, zero-server foundation for advanced UI work: WebGL
            shaders, liquid glass, motion, and a full component system.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {stack.map((item) => (
              <Badge
                key={item}
                variant="outline"
                className="border-white/20 bg-white/5 text-white/80"
              >
                {item}
              </Badge>
            ))}
          </div>
          <div className="mt-8">
            <Button
              variant="secondary"
              onClick={() =>
                window.open("https://github.com/AmroJSawan/web-studio", "_blank")
              }
            >
              View source
            </Button>
          </div>
        </motion.section>
      </div>
    </main>
  )
}
