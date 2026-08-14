// Mock Audiobook Database with Custom Ambient Cover Colors
export const AUDIOBOOKS = [
  {
    id: "echoes-of-the-void",
    title: "Echoes of the Void",
    author: "Arthur C. Pendelton",
    narrator: "Ray Porter",
    rating: 4.8,
    runtime: "12h 32m",
    runtimeSeconds: 45120,
    cover: "assets/covers/echoes_of_void.png",
    ambientColors: ["rgba(139, 92, 246, 0.06)", "rgba(59, 130, 246, 0.03)"], // Subtle blue/violet
    description: "In the deep sectors of the Orion arm, a crew aboard the scouting vessel Odyssey detects a periodic signal emanating from a rogue black hole. What they find will challenge the very fabric of spacetime and human survival. An epic space opera filled with hard science elements, tense psychological thriller aspects, and high-stakes survival.",
    genres: ["Sci-Fi", "Space Opera", "Thriller"],
    releaseYear: 2025,
    publisher: "Cosmic Horizon Media",
    progressSeconds: 1540, // Mock current progress (approx 25 mins in)
    chapters: [
      { id: 1, title: "Chapter 1 — The Signal", startTime: 0, duration: 900 },
      { id: 2, title: "Chapter 2 — Event Horizon Approaching", startTime: 900, duration: 1200 },
      { id: 3, title: "Chapter 3 — The Odyssey's Descent", startTime: 2100, duration: 1500 },
      { id: 4, title: "Chapter 4 — Quantum Decoupling", startTime: 3600, duration: 1800 },
      { id: 5, title: "Chapter 5 — Echoes in the Static", startTime: 5400, duration: 1400 },
      { id: 6, title: "Chapter 6 — Relativity Bites", startTime: 6800, duration: 2000 },
      { id: 7, title: "Chapter 7 — The Heart of the singularity", startTime: 8800, duration: 2500 }
    ]
  },
  {
    id: "the-whispering-spire",
    title: "The Whispering Spire",
    author: "Sarah J. Maasfield",
    narrator: "Julia Whelan",
    rating: 4.6,
    runtime: "18h 15m",
    runtimeSeconds: 65700,
    cover: "assets/covers/whispering_spire.png",
    ambientColors: ["rgba(16, 185, 129, 0.06)", "rgba(6, 95, 70, 0.03)"], // Subtle emerald green
    description: "High in the Whispering Mountains stands a limestone spire where the wind speaks in tongues. Elianna, a runaway apprentice with the ability to hear stone, discovers a forgotten chamber that holds a secret capable of collapsing the Empire's magical monopoly. A rich fantasy world with deep political intrigue and character-focused mystery.",
    genres: ["Fantasy", "Magic", "Adventure"],
    releaseYear: 2024,
    publisher: "Gilded Quill Publishers",
    progressSeconds: 4800, // Mock progress (approx 80 mins in, Chapter 3)
    chapters: [
      { id: 1, title: "Chapter 1 — Apprentice to the Winds", startTime: 0, duration: 1500 },
      { id: 2, title: "Chapter 2 — The Mountains Sing", startTime: 1500, duration: 2100 },
      { id: 3, title: "Chapter 3 — The Chamber of Whispers", startTime: 3600, duration: 2400 },
      { id: 4, title: "Chapter 4 — Runaway Magic", startTime: 6000, duration: 1800 },
      { id: 5, title: "Chapter 5 — The Empire's Enforcer", startTime: 7800, duration: 2500 },
      { id: 6, title: "Chapter 6 — Veins of the Earth", startTime: 10300, duration: 3000 }
    ]
  },
  {
    id: "neon-horizon-2099",
    title: "Neon Horizon 2099",
    author: "William Gibson-Smith",
    narrator: "Luke Daniels",
    rating: 4.5,
    runtime: "10h 05m",
    runtimeSeconds: 36300,
    cover: "assets/covers/neon_horizon.png",
    ambientColors: ["rgba(236, 72, 153, 0.06)", "rgba(59, 130, 246, 0.03)"], // Subtle magenta/cyberpunk blue
    description: "In the rain-slicked mega-city of Neo-Vancouver, a black-market memory courier is hired for a job that should be simple: transfer 20 terabytes of encrypted consciousness files. But when the sender turns up dead and corporate kill squads close in, the courier has to plug the data directly into their own cybernetics to survive.",
    genres: ["Cyberpunk", "Dystopian", "Sci-Fi"],
    releaseYear: 2026,
    publisher: "Byte-Sized Audio",
    progressSeconds: 0, // Unplayed
    chapters: [
      { id: 1, title: "Chapter 1 — Wetware Interface", startTime: 0, duration: 1100 },
      { id: 2, title: "Chapter 2 — The Megastructure Alley", startTime: 1100, duration: 1400 },
      { id: 3, title: "Chapter 3 — Consciousness Encrypted", startTime: 2500, duration: 1300 },
      { id: 4, title: "Chapter 4 — Corporate Cleaners", startTime: 3800, duration: 1600 },
      { id: 5, title: "Chapter 5 — Cyber-Grid Breakdown", startTime: 5400, duration: 1500 }
    ]
  },
  {
    id: "shadows-of-the-estate",
    title: "Shadows of the Estate",
    author: "Agatha Christie-Jr",
    narrator: "Simon Vance",
    rating: 4.7,
    runtime: "8h 45m",
    runtimeSeconds: 31500,
    cover: "assets/covers/shadows_estate.png",
    ambientColors: ["rgba(239, 68, 68, 0.06)", "rgba(31, 41, 55, 0.03)"], // Subtle crimson/mystery red
    description: "The eccentric billionaire Lord Blackwood has invited six guests to his isolated country estate. When a severe snowstorm cuts off communication, and Lord Blackwood is found dead in his study, the guests realize the killer is among them. Masterfully narrated by Simon Vance, this mystery keeps you guessing until the final sentence.",
    genres: ["Mystery", "Thriller", "Noir"],
    releaseYear: 2023,
    publisher: "Hearthside Press",
    progressSeconds: 12000, // Completed some chunks (approx 3h 20m in)
    chapters: [
      { id: 1, title: "Chapter 1 — The Invitation", startTime: 0, duration: 1800 },
      { id: 2, title: "Chapter 2 — Snowed In", startTime: 1800, duration: 2000 },
      { id: 3, title: "Chapter 3 — Study Door Locked", startTime: 3800, duration: 2200 },
      { id: 4, title: "Chapter 4 — Interrogations Begin", startTime: 6000, duration: 2400 },
      { id: 5, title: "Chapter 5 — Alibis and Lies", startTime: 8400, duration: 2600 },
      { id: 6, title: "Chapter 6 — Poison in the Tea", startTime: 11000, duration: 2300 },
      { id: 7, title: "Chapter 7 — The Secret Compartment", startTime: 13300, duration: 2100 }
    ]
  },
  {
    id: "the-art-of-flow",
    title: "The Art of Flow",
    author: "Mihaly Csikszentmihalyi",
    narrator: "Robin Sharma",
    rating: 4.9,
    runtime: "6h 20m",
    runtimeSeconds: 22800,
    cover: "assets/covers/art_of_flow.png",
    ambientColors: ["rgba(245, 158, 11, 0.06)", "rgba(120, 53, 4, 0.03)"], // Subtle amber/gold
    description: "A groundbreaking investigation into optimal performance and mental focus. The Art of Flow provides actionable frameworks for entering deep concentration states, defeating procrastination, and finding meaning in professional work. Learn how to transform daily chores into sources of joy and master focus in a world designed for distraction.",
    genres: ["Non-Fiction", "Self-Help", "Productivity"],
    releaseYear: 2025,
    publisher: "Ascent Publishing",
    progressSeconds: 200, // Just started
    chapters: [
      { id: 1, title: "Chapter 1 — Understanding the Zone", startTime: 0, duration: 1200 },
      { id: 2, title: "Chapter 2 — The Psychology of Engagement", startTime: 1200, duration: 1500 },
      { id: 3, title: "Chapter 3 — Setting Clear Goals", startTime: 2700, duration: 1600 },
      { id: 4, title: "Chapter 4 — Minimizing Distraction", startTime: 4300, duration: 1400 },
      { id: 5, title: "Chapter 5 — The Daily Flow Practice", startTime: 5700, duration: 1800 }
    ]
  },
  {
    id: "chronicles-of-the-deep",
    title: "Chronicles of the Deep",
    author: "Patrick O'Brian-Redux",
    narrator: "John Lee",
    rating: 4.4,
    runtime: "14h 40m",
    runtimeSeconds: 52800,
    cover: "assets/covers/chronicles_deep.png",
    ambientColors: ["rgba(6, 182, 212, 0.06)", "rgba(30, 64, 175, 0.03)"], // Subtle nautical teal/indigo
    description: "Set in the early 19th century, the HMS Vanguard sails into uncharted waters in the South Pacific. Under Captain Vance's command, the crew must battle severe weather, food shortages, and mutinous rumblings while searching for a mythical island of treasures. A vivid nautical adventure filled with naval tactics and historical authenticity.",
    genres: ["Adventure", "History", "Nautical"],
    releaseYear: 2024,
    publisher: "Anchor & Sail Audio",
    progressSeconds: 0,
    chapters: [
      { id: 1, title: "Chapter 1 — Outward Bound", startTime: 0, duration: 1400 },
      { id: 2, title: "Chapter 2 — Rigging in the Storm", startTime: 1400, duration: 1800 },
      { id: 3, title: "Chapter 3 — Scurvy and Scarcity", startTime: 3200, duration: 1500 },
      { id: 4, title: "Chapter 4 — The Island Appears", startTime: 4700, duration: 2100 },
      { id: 5, title: "Chapter 5 — Tense Anchors", startTime: 6800, duration: 1900 }
    ]
  }
];
