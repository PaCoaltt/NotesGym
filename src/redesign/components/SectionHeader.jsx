import React from "react";

export default function SectionHeader({ title, action }) {
  return (
    <div className="v2-section-header">
      <h2>{title}</h2>
      {action && <button type="button" onClick={action}>Tout voir <span aria-hidden="true">↗</span></button>}
    </div>
  );
}
