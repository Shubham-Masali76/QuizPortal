export default function NeonBackground() {
  return (
    <div className="neon-bg-container" aria-hidden="true">
      {/* 1. Subtle Fading Cyber Tech Grid */}
      <div className="neon-bg-grid" />

      {/* 2. Ambient Blurred Radiant Light Orbs */}
      <div className="neon-bg-orb neon-orb-1" />
      <div className="neon-bg-orb neon-orb-2" />
      <div className="neon-bg-orb neon-orb-3" />

      {/* 3. Delicate Vector Geometric Light Structures */}
      <svg
        className="neon-bg-svg-structures"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Subtle Linear Gradients for Circuit & Light Lines */}
          <linearGradient id="purpleGlowLine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#9333ea" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b0764" stopOpacity="0.05" />
          </linearGradient>

          <linearGradient id="purpleGlowReverse" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b0764" stopOpacity="0.05" />
          </linearGradient>

          <linearGradient id="cyanPurpleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
          </linearGradient>

          {/* Glowing Filter for Node Junctions */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ========================================================
            VIEWPORT CORNER TECH BRACKETS (Light Architectural Framing)
            ======================================================== */}
        <g stroke="#a855f7" strokeWidth="1.5" fill="none" opacity="0.45">
          {/* Top-Left Corner Bracket */}
          <path d="M 40 70 L 40 40 L 70 40" />
          <circle cx="40" cy="40" r="2.5" fill="#c084fc" />

          {/* Top-Right Corner Bracket */}
          <path d="M 1400 70 L 1400 40 L 1370 40" />
          <circle cx="1400" cy="40" r="2.5" fill="#c084fc" />

          {/* Bottom-Left Corner Bracket */}
          <path d="M 40 830 L 40 860 L 70 860" />
          <circle cx="40" cy="860" r="2.5" fill="#c084fc" />

          {/* Bottom-Right Corner Bracket */}
          <path d="M 1400 830 L 1400 860 L 1370 860" />
          <circle cx="1400" cy="860" r="2.5" fill="#c084fc" />
        </g>

        {/* Subtle Tech Coordinates Text */}
        <g fill="#c084fc" opacity="0.3" fontSize="9" fontFamily="monospace" letterSpacing="2">
          <text x="40" y="88">SYS.NET // ACTIVE</text>
          <text x="1310" y="88">QUIZ // PORTAL</text>
          <text x="40" y="818">SEC-01 // READY</text>
          <text x="1335" y="818">AWS // NKOCET</text>
        </g>

        {/* ========================================================
            TOP LEFT STRUCTURES
            ======================================================== */}
        <g opacity="0.85">
          {/* Stepped Circuit Path */}
          <path
            d="M -20 180 L 150 180 L 250 280 L 330 280 L 360 310"
            stroke="url(#purpleGlowLine)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="360" cy="310" r="3.5" fill="#c084fc" filter="url(#nodeGlow)" />
          <circle cx="150" cy="180" r="2.5" fill="#a855f7" />

          {/* Dashed Tech Vector Ray */}
          <path
            d="M 60 70 L 160 170 L 160 250"
            stroke="rgba(168, 85, 247, 0.25)"
            strokeWidth="1"
            strokeDasharray="4 4"
            fill="none"
          />

          {/* Isometric Diamond Wireframe */}
          <polygon
            points="140,330 190,300 240,330 190,360"
            stroke="rgba(168, 85, 247, 0.3)"
            strokeWidth="1"
            fill="rgba(168, 85, 247, 0.03)"
          />
          <line x1="140" y1="330" x2="240" y2="330" stroke="rgba(168, 85, 247, 0.15)" strokeWidth="0.8" />

          {/* Tech Plus Crosshair */}
          <g transform="translate(190, 130)" stroke="#a855f7" strokeWidth="1.5" opacity="0.45">
            <line x1="-7" y1="0" x2="7" y2="0" />
            <line x1="0" y1="-7" x2="0" y2="7" />
          </g>

          {/* Secondary Micro Plus */}
          <g transform="translate(290, 210)" stroke="#c084fc" strokeWidth="1" opacity="0.35">
            <line x1="-4" y1="0" x2="4" y2="0" />
            <line x1="0" y1="-4" x2="0" y2="4" />
          </g>
        </g>

        {/* ========================================================
            TOP RIGHT STRUCTURES
            ======================================================== */}
        <g opacity="0.85">
          {/* Stepped Circuit Path */}
          <path
            d="M 1460 190 L 1290 190 L 1190 290 L 1100 290 L 1070 320"
            stroke="url(#purpleGlowReverse)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="1070" cy="320" r="3.5" fill="#c084fc" filter="url(#nodeGlow)" />
          <circle cx="1290" cy="190" r="2.5" fill="#a855f7" />

          {/* Circular Radar Arcs with Tick Accents */}
          <circle
            cx="1310"
            cy="160"
            r="105"
            stroke="rgba(192, 132, 252, 0.18)"
            strokeWidth="1.2"
            strokeDasharray="8 6"
            fill="none"
          />
          <circle
            cx="1310"
            cy="160"
            r="65"
            stroke="rgba(168, 85, 247, 0.25)"
            strokeWidth="1"
            fill="none"
          />
          <circle cx="1310" cy="160" r="3" fill="#a855f7" opacity="0.5" />

          {/* Tech Plus Crosshairs */}
          <g transform="translate(1250, 270)" stroke="#c084fc" strokeWidth="1.5" opacity="0.45">
            <line x1="-7" y1="0" x2="7" y2="0" />
            <line x1="0" y1="-7" x2="0" y2="7" />
          </g>

          <g transform="translate(1150, 150)" stroke="#a855f7" strokeWidth="1" opacity="0.35">
            <line x1="-4" y1="0" x2="4" y2="0" />
            <line x1="0" y1="-4" x2="0" y2="4" />
          </g>
        </g>

        {/* ========================================================
            BOTTOM LEFT STRUCTURES
            ======================================================== */}
        <g opacity="0.85">
          {/* Diagonal Circuit Line */}
          <path
            d="M 40 800 L 170 670 L 280 670 L 320 630"
            stroke="url(#cyanPurpleGlow)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="320" cy="630" r="3.5" fill="#38bdf8" filter="url(#nodeGlow)" opacity="0.75" />
          <circle cx="170" cy="670" r="2.5" fill="#a855f7" />

          {/* Hexagon Outline */}
          <polygon
            points="150,560 185,540 220,560 220,600 185,620 150,600"
            stroke="rgba(168, 85, 247, 0.28)"
            strokeWidth="1"
            fill="rgba(168, 85, 247, 0.02)"
          />

          {/* Tech Plus Crosshair */}
          <g transform="translate(240, 730)" stroke="#a855f7" strokeWidth="1.5" opacity="0.4">
            <line x1="-7" y1="0" x2="7" y2="0" />
            <line x1="0" y1="-7" x2="0" y2="7" />
          </g>

          {/* Small Tick Markers */}
          <line x1="80" y1="750" x2="80" y2="760" stroke="#a855f7" strokeWidth="1" opacity="0.3" />
          <line x1="90" y1="750" x2="90" y2="756" stroke="#a855f7" strokeWidth="1" opacity="0.3" />
          <line x1="100" y1="750" x2="100" y2="760" stroke="#a855f7" strokeWidth="1" opacity="0.3" />
          <line x1="110" y1="750" x2="110" y2="756" stroke="#a855f7" strokeWidth="1" opacity="0.3" />
        </g>

        {/* ========================================================
            BOTTOM RIGHT STRUCTURES
            ======================================================== */}
        <g opacity="0.85">
          {/* Stepped Circuit Path */}
          <path
            d="M 1460 740 L 1310 740 L 1220 650 L 1120 650 L 1080 610"
            stroke="url(#purpleGlowReverse)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="1080" cy="610" r="3.5" fill="#c084fc" filter="url(#nodeGlow)" />
          <circle cx="1310" cy="740" r="2.5" fill="#a855f7" />

          {/* Isometric Diamond Wireframe */}
          <polygon
            points="1250,580 1300,550 1350,580 1300,610"
            stroke="rgba(168, 85, 247, 0.28)"
            strokeWidth="1"
            fill="rgba(168, 85, 247, 0.02)"
          />

          {/* Tech Plus Crosshair */}
          <g transform="translate(1190, 710)" stroke="#c084fc" strokeWidth="1.5" opacity="0.45">
            <line x1="-7" y1="0" x2="7" y2="0" />
            <line x1="0" y1="-7" x2="0" y2="7" />
          </g>

          {/* Concentric Telemetry Arc */}
          <path
            d="M 1360 790 A 60 60 0 0 1 1300 850"
            stroke="rgba(168, 85, 247, 0.25)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
}
