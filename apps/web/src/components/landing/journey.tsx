"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { landingCopy } from "@/content/landing";

const ROAD =
  "M 48 168 C 200 64, 300 236, 460 150 S 720 56, 820 176 S 940 260, 960 96";

export function LandingJourney() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const distance = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const [active, setActive] = useState(0);
  const copy = landingCopy.journey;

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setActive(
      Math.min(copy.steps.length - 1, Math.floor(value * copy.steps.length)),
    );
  });

  if (reduce) {
    return (
      <section
        id="parcours"
        className="border-y border-border bg-background px-5 py-16 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-5xl">
          <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-primary">
            {copy.kicker}
          </p>
          <h2 className="brand-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {copy.title}
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {copy.steps.map((step, index) => (
              <li key={step.id} className="card">
                <p className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} id="parcours" className="relative h-[280vh] bg-sidebar">
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-5 py-8 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-brand-cyan">
            {copy.kicker}
          </p>
          <h2 className="brand-display mt-3 text-3xl font-bold tracking-tight text-sidebar-foreground sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm text-sidebar-foreground/60">{copy.hint}</p>
        </div>
        <svg
          viewBox="0 0 1000 300"
          className="mx-auto mt-6 h-44 w-full max-w-5xl sm:h-56"
          aria-hidden
        >
          <path
            d={ROAD}
            fill="none"
            stroke="hsl(188 83% 51% / 0.35)"
            strokeWidth="3"
            strokeDasharray="8 10"
            strokeLinecap="round"
          />
          <motion.g
            style={{
              offsetPath: `path("${ROAD}")`,
              offsetDistance: distance,
              offsetRotate: "auto",
            }}
          >
            <g transform="translate(-58 -20)">
              <path
                d="M10 28c0-2.6 2.1-4.7 4.7-4.7h3.4L25 13.2A5.2 5.2 0 0 1 29.3 11h23.2a5.3 5.3 0 0 1 4.8 2.6L65 25.3h4.2c2.6 0 4.7 2.1 4.7 4.7V32H10v-4Z"
                fill="#1AD0EA"
              />
              <circle cx="24" cy="32.5" r="5" fill="#1AD0EA" />
              <circle cx="68" cy="32.5" r="5" fill="#1AD0EA" />
              <circle cx="24" cy="32.5" r="2" fill="#0A0C10" />
              <circle cx="68" cy="32.5" r="2" fill="#0A0C10" />
            </g>
          </motion.g>
        </svg>
        <div className="mx-auto mt-4 grid w-full max-w-5xl gap-3 sm:grid-cols-4">
          {copy.steps.map((step, index) => (
            <article
              key={step.id}
              className={`rounded-2xl border p-4 text-sidebar-foreground transition-opacity duration-200 ${
                active === index
                  ? "border-brand-cyan/40 bg-white/10 opacity-100"
                  : "border-white/10 bg-white/5 opacity-40"
              }`}
            >
              <p className="font-mono text-[11px] text-brand-cyan">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
              <p className="mt-1 text-xs leading-5 text-sidebar-foreground/70">
                {step.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
