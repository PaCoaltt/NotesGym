import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const SYSTEM_MAX_SWISS = 6; // stored in Swiss

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  const exceptional = payload.note > SYSTEM_MAX_SWISS;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={exceptional ? 7 : 5}
      fill={exceptional ? '#FFD700' : '#e0e5eb'}
      stroke={exceptional ? '#DAA520' : '#5a6a7a'}
      strokeWidth={exceptional ? 2 : 3}
      style={exceptional ? { filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' } : {}}
    />
  );
};

export default function GradeChart({ notes }) {
  const sortedNotes = [...notes].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );

  const chartData = sortedNotes.map(note => ({
    date: note.date,
    note: note.note,
    label: format(parseISO(note.date), 'dd/MM', { locale: fr })
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div 
          className="p-3 rounded-xl"
          style={{
            backgroundColor: '#e0e5eb',
            boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
          }}
        >
          <p className="font-medium" style={{ color: '#5a6a7a' }}>
            {payload[0].payload.label}
          </p>
          <p className="text-sm" style={{ color: '#8a9aa8' }}>
            Note: {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className="p-4 rounded-xl"
      style={{
        backgroundColor: '#e0e5eb',
        boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
      }}
    >
      <h4 className="text-sm font-medium mb-4" style={{ color: '#6a7a8a' }}>
        Évolution des notes
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c8ced6" />
          <XAxis 
            dataKey="label" 
            stroke="#8a9aa8"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            domain={[0, 6]} 
            stroke="#8a9aa8"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="note" 
            stroke="#5a6a7a" 
            strokeWidth={3}
            dot={<CustomDot />}
            activeDot={{ r: 8, fill: '#FFD700', stroke: '#DAA520' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}