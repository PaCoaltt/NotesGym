import React, { useId } from "react";

export default function Sparkline({ values = [], color = "currentColor", className = "", label = "Évolution" }) {
  const titleId = useId();
  const valid = values.map(Number).filter(Number.isFinite);
  const points = valid.length > 1 ? valid : [3.8, 4.1, 4, 4.5, 4.7, 5];
  const min = Math.min(...points);
  const range = Math.max(Math.max(...points) - min, 0.5);
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 31 - ((value - min) / range) * 24;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg className={className} viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{label}</title>
      <path className="v2-sparkline-path" pathLength="1" d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
