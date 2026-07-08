import React from "react";

export default function NeuInput({ label, type = "text", value, onChange, required = false, options = null, min, max, step, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: '#6a7a8a' }}>
        {label} {required && <span style={{ color: '#e07a7a' }}>*</span>}
      </label>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full px-4 py-2.5 rounded-xl focus:outline-none transition-all"
          style={{
            backgroundColor: '#e0e5eb',
            color: '#5a6a7a',
            boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
          }}
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 rounded-xl focus:outline-none transition-all"
          style={{
            backgroundColor: '#e0e5eb',
            color: '#5a6a7a',
            boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
          }}
        />
      )}
    </div>
  );
}