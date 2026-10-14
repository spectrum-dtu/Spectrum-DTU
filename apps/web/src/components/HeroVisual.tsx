// Restrained connectivity composition. The three frames are placeholders for
// real equipment photography (drone, VR headset, 5G camera) once supplied.
const nodes = [
  { x: 70, y: 80, label: 'Drone' },
  { x: 330, y: 150, label: 'VR headset' },
  { x: 150, y: 300, label: '5G camera' },
]
const hub = { x: 210, y: 190 }

export default function HeroVisual() {
  return (
    <svg viewBox="0 0 400 380" role="img" aria-label="Diagram of equipment nodes connected to a central network hub" className="h-auto w-full">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5b43d6" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#5b43d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={hub.x} cy={hub.y} r="170" fill="url(#glow)" />
      {[60, 105, 150].map((r) => (
        <circle key={r} cx={hub.x} cy={hub.y} r={r} fill="none" stroke="#0b1530" strokeOpacity="0.08" />
      ))}
      {nodes.map((n) => (
        <line key={n.label} x1={hub.x} y1={hub.y} x2={n.x} y2={n.y} stroke="#5b43d6" strokeOpacity="0.55" strokeWidth="1.2" className="flow-line" />
      ))}
      <circle cx={hub.x} cy={hub.y} r="8" fill="#0b1530" />
      <circle cx={hub.x} cy={hub.y} r="16" fill="none" stroke="#0b1530" strokeOpacity="0.35" />
      {nodes.map((n) => (
        <g key={n.label}>
          <rect x={n.x - 52} y={n.y - 30} width="104" height="60" rx="6" fill="#fff" stroke="#e6e4df" />
          <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize="11" fontWeight="500" fill="#0b1530">{n.label}</text>
          <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize="8" fill="#5d6475">photo placeholder</text>
        </g>
      ))}
    </svg>
  )
}
