const HamarisaLogo = ({ className = '', compact = false }) => (
  <div className={`hamarisa-logo ${compact ? 'hamarisa-logo-compact' : ''} ${className}`} aria-label="Hamarisa Trading Sdn Bhd">
    <svg viewBox="0 0 240 240" role="img" aria-hidden="true">
      <circle cx="120" cy="120" r="112" fill="#050505" stroke="#f2aa45" strokeWidth="9" />
      <circle cx="120" cy="120" r="96" fill="none" stroke="#7d5524" strokeWidth="1" opacity="0.8" />
      <rect x="77" y="46" width="86" height="86" rx="2" fill="none" stroke="#f2aa45" strokeWidth="4" transform="rotate(45 120 89)" />
      <path d="M76 83c20-18 77-28 92-8-12 8-9 19 5 29-22 11-63 15-98 4 12-7 11-16 1-25Z" fill="#d88a2f" opacity="0.92" />
      <text x="120" y="114" fill="#fff9ec" textAnchor="middle" fontFamily="Georgia, serif" fontSize="48">HT</text>
      {!compact && (
        <>
          <text x="120" y="174" fill="#fff9ec" textAnchor="middle" fontFamily="Georgia, serif" fontSize="19" letterSpacing="4">HAMARISA</text>
          <text x="120" y="192" fill="#d8c5a5" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="7" letterSpacing="4">TRADING SDN BHD</text>
        </>
      )}
    </svg>
  </div>
);

export default HamarisaLogo;
