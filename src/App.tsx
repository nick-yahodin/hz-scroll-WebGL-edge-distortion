import { useEffect, useRef } from "react";
import { DistortionGallery } from "./gl/DistortionGallery";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const spacer = spacerRef.current!;

    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lerp = reduced ? 1 : 0.09;

    const gallery = new DistortionGallery(container);
    gallery.reducedMotion = reduced;

    const layout = () => {
      gallery.resize();
      // Vertical native scroll length == horizontal travel of the rail.
      spacer.style.height = gallery.maxScroll + window.innerHeight + "px";
    };
    layout();
    window.addEventListener("resize", layout);

    // Native scroll drives the rail; we lerp it for smoothness.
    let smooth = 0;
    let raf = 0;
    const frame = () => {
      const target = Math.min(Math.max(window.scrollY, 0), gallery.maxScroll);
      smooth += (target - smooth) * lerp;
      if (Math.abs(target - smooth) < 0.05) smooth = target;

      gallery.setScroll(smooth);
      gallery.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      gallery.dispose();
    };
  }, []);

  return (
    <>
      <div className="spacer" ref={spacerRef} />
      <div className="gl-container" ref={containerRef} />
    </>
  );
}
