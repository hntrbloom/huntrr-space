// Realistic Guest Preview Sample Data
// Uses pastel placeholder blocks for photo fields as requested

export function getPastelImage(title: string, colorHex: string, width = 600, height = 600): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${colorHex}"/>
    <rect x="8%" y="8%" width="84%" height="84%" rx="16" fill="#ffffff" fill-opacity="0.3" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2"/>
    <text x="50%" y="46%" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#2d3748" text-anchor="middle" dominant-baseline="middle">[Sample Photo]</text>
    <text x="50%" y="56%" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" fill="#4a5568" text-anchor="middle" dominant-baseline="middle">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 1. CHARACTER WIKI
export const GUEST_SAMPLE_FRANCHISES = [
  { id: 'f-1', name: 'Sanrio', createdAt: Date.now() - 100000 },
  { id: 'f-2', name: 'San-X', createdAt: Date.now() - 90000 },
  { id: 'f-3', name: 'Nintendo', createdAt: Date.now() - 80000 },
];

export const GUEST_SAMPLE_SERIES = [
  { id: 's-1', name: 'Hello Kitty & Friends', createdAt: Date.now() - 70000 },
  { id: 's-2', name: 'Rilakkuma', createdAt: Date.now() - 60000 },
  { id: 's-3', name: 'Animal Crossing', createdAt: Date.now() - 50000 },
];

export const GUEST_SAMPLE_CHARACTERS = [
  {
    id: 'guest-char-1',
    name: 'Cinnamoroll',
    jpName: 'シナモロール',
    romaji: 'Shinamorōru',
    company: 'Sanrio',
    companyId: 'f-1',
    series: 'Hello Kitty & Friends',
    seriesId: 's-1',
    species: 'White Puppy with Long Ears',
    mainColor: '#BDE0FE',
    colors: [
      { hex: '#BDE0FE', name: 'Pastel Cloud Blue' },
      { hex: '#FFB8CD', name: 'Cheek Pink' },
      { hex: '#FFFFFF', name: 'Fur White' },
      { hex: '#4A5568', name: 'Eye Blue-Gray' },
    ],
    notes: '[Sample Note] Cinnamoroll is a chubby white puppy with long ears that enable him to fly. Favorite color palette features soft pastel sky blue and light pink blush.',
    tags: ['Sanrio', 'Puppy', 'Pastel Blue', 'Kawaii'],
    isFavorite: true,
    imageUrl: getPastelImage('Cinnamoroll Illustration', '#BDE0FE'),
    myDesigns: [
      { url: getPastelImage('Cinnamoroll Keychain Design A', '#FFB8CD'), storagePath: '' },
      { url: getPastelImage('Cinnamoroll 3D Print Charm B', '#C1E1C1'), storagePath: '' }
    ]
  },
  {
    id: 'guest-char-2',
    name: 'Rilakkuma',
    jpName: 'リラックマ',
    romaji: 'Rirakkuma',
    company: 'San-X',
    companyId: 'f-2',
    series: 'Rilakkuma',
    seriesId: 's-2',
    species: 'Relaxation Bear',
    mainColor: '#E6C280',
    colors: [
      { hex: '#E6C280', name: 'Bear Honey Brown' },
      { hex: '#FDFD96', name: 'Soft Cream' },
      { hex: '#FFC6FF', name: 'Yellow Zipper Accent' }
    ],
    notes: '[Sample Note] Always relaxed and loves pancakes, dango, and listening to music. Prefers cozy warm brown and honey tones.',
    tags: ['San-X', 'Bear', 'Cozy', 'Honey'],
    isFavorite: true,
    imageUrl: getPastelImage('Rilakkuma Illustration', '#E6C280'),
    myDesigns: [
      { url: getPastelImage('Rilakkuma Miniature Chair Design', '#D8B4F8'), storagePath: '' }
    ]
  },
  {
    id: 'guest-char-3',
    name: 'Isabelle',
    jpName: 'しずえ',
    romaji: 'Shizue',
    company: 'Nintendo',
    companyId: 'f-3',
    series: 'Animal Crossing',
    seriesId: 's-3',
    species: 'Shih Tzu',
    mainColor: '#FDFD96',
    colors: [
      { hex: '#FDFD96', name: 'Pastel Yellow' },
      { hex: '#C1E1C1', name: 'Town Hall Green' },
      { hex: '#FFB8CD', name: 'Coral Ribbon' }
    ],
    notes: '[Sample Note] Helpful secretary at Town Hall. Bright and cheery pastel yellow color aesthetic.',
    tags: ['Nintendo', 'Dog', 'Town Manager'],
    isFavorite: false,
    imageUrl: getPastelImage('Isabelle Illustration', '#FDFD96'),
    myDesigns: []
  }
];

// 2. PINTEREST / INSPIRATION BOARDS
export const GUEST_SAMPLE_PINTEREST_BOARDS = [
  {
    id: 'guest-board-1',
    title: 'Kawaii Stationery Crafts',
    url: 'https://www.pinterest.com/sample/kawaii-stationery/',
    createdAt: new Date().toISOString(),
    status: 'completed' as const,
    pinCount: 4,
    pins: [
      {
        id: 'pin-1',
        title: '[Sample] Pastel Desk Organizer Layout',
        description: 'Clean desktop grid with pastel organizer bins and sticker display.',
        imageUrl: getPastelImage('Pastel Desk Organizer', '#FFD1DC', 400, 500),
        linkUrl: 'https://www.pinterest.com',
      },
      {
        id: 'pin-2',
        title: '[Sample] Handmade Acrylic Shaker Keychains',
        description: 'Layered clear acrylic with loose glitter and resin dome.',
        imageUrl: getPastelImage('Acrylic Shaker Charm', '#BDE0FE', 400, 480),
        linkUrl: 'https://www.pinterest.com',
      },
      {
        id: 'pin-3',
        title: '[Sample] Custom Bullet Journal Weekly Spreads',
        description: 'Minimalist weekly spread with pastel highlighter accents.',
        imageUrl: getPastelImage('Bujo Weekly Spread', '#C1E1C1', 400, 520),
        linkUrl: 'https://www.pinterest.com',
      },
      {
        id: 'pin-4',
        title: '[Sample] 3D Printed Miniature Shelf Display',
        description: 'Cute miniature display shelf for small trinkets and keychains.',
        imageUrl: getPastelImage('Miniature Shelf Display', '#FDFD96', 400, 450),
        linkUrl: 'https://www.pinterest.com',
      }
    ]
  },
  {
    id: 'guest-board-2',
    title: 'Resin & Polymer Clay Ideas',
    url: 'https://www.pinterest.com/sample/resin-clay/',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'completed' as const,
    pinCount: 3,
    pins: [
      {
        id: 'pin-5',
        title: '[Sample] Star & Moon Shaker Mold Design',
        description: 'Translucent pastel gradient resin shaker filled with star sequins.',
        imageUrl: getPastelImage('Star Resin Shaker Mold', '#D8B4F8', 400, 500),
        linkUrl: 'https://www.pinterest.com',
      },
      {
        id: 'pin-6',
        title: '[Sample] Miniature Coffee Cup Keychain',
        description: 'Polymer clay iced boba tea cup with silicone whipped cream top.',
        imageUrl: getPastelImage('Polymer Clay Boba Cup', '#E6C280', 400, 460),
        linkUrl: 'https://www.pinterest.com',
      },
      {
        id: 'pin-7',
        title: '[Sample] Pastel Cloud Coaster Set',
        description: 'Glossy resin coaster with cloud swirl color effect.',
        imageUrl: getPastelImage('Pastel Cloud Coasters', '#FFC6FF', 400, 510),
        linkUrl: 'https://www.pinterest.com',
      }
    ]
  }
];

// 3. KEYCHAIN IDEAS
export const GUEST_SAMPLE_KEYCHAINS = [
  {
    id: 'guest-key-1',
    title: '[Sample] Cinnamoroll Cloud Shaker',
    character: 'Cinnamoroll',
    series: 'Sanrio',
    status: 'In Progress' as const,
    notes: 'Double-sided acrylic shaker with floating star beads and pastel blue quicksand oil.',
    materials: ['Clear Acrylic Base', 'UV Resin', 'Glitter Flakes', 'Star Beads', 'Pastel Pink Strap'],
    photos: [
      getPastelImage('Keyring Front View', '#FFB8CD'),
      getPastelImage('Keyring Back Layer', '#BDE0FE')
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'guest-key-2',
    title: '[Sample] Rilakkuma Honey Jar Charm',
    character: 'Rilakkuma',
    series: 'San-X',
    status: 'Completed' as const,
    notes: '3D printed resin honey jar with yellow tinted oil and miniature bear charm attachment.',
    materials: ['3D Print PLA', 'Resin Tint Yellow', 'Gold Keyring Clasp'],
    photos: [
      getPastelImage('Honey Jar Charm Finish', '#E6C280')
    ],
    createdAt: new Date(Date.now() - 172800000).toISOString()
  }
];

// 4. MINI FURNITURE / PRINT DESIGNS
export const GUEST_SAMPLE_PRINT_DESIGNS = [
  {
    id: 'guest-print-1',
    title: '[Sample] Miniature Ribbon Chair',
    category: 'Chairs',
    setName: 'Pastel Living Room',
    setId: 'set-1',
    dimensions: '45mm x 45mm x 60mm',
    filamentType: 'PLA Pastel Pink',
    printTime: '1h 20m',
    status: 'Printed',
    notes: 'Smooth 0.12mm layer height. Printed with 15% gyroid infill.',
    photos: [
      getPastelImage('Ribbon Chair 3D Print', '#FFD1DC'),
      getPastelImage('Chair Side View', '#FFC6FF')
    ]
  },
  {
    id: 'guest-print-2',
    title: '[Sample] Heart Coffee Table',
    category: 'Tables',
    setName: 'Pastel Living Room',
    setId: 'set-1',
    dimensions: '80mm x 60mm x 35mm',
    filamentType: 'PLA Silk White',
    printTime: '2h 10m',
    status: 'Designing',
    notes: 'Heart shaped table top with scalloped edge detail.',
    photos: [
      getPastelImage('Heart Table Mockup', '#BDE0FE')
    ]
  }
];

export const GUEST_SAMPLE_PRINT_CATEGORIES = [
  { id: 'cat-1', name: 'Chairs' },
  { id: 'cat-2', name: 'Tables' },
  { id: 'cat-3', name: 'Decor' }
];

export const GUEST_SAMPLE_PRINT_SETS = [
  { id: 'set-1', name: 'Pastel Living Room' },
  { id: 'set-2', name: 'Kawaii Bedroom' }
];

// 5. JOB APPLICATIONS
export const GUEST_SAMPLE_JOB_APPLICATIONS = [
  {
    id: 'guest-job-1',
    companyName: 'Sanrio Craft Studios',
    roleTitle: 'Product Designer (Keychains & Prints)',
    status: 'Interviewing' as const,
    location: 'Remote / Los Angeles, CA',
    salary: '$75,000 - $90,000 / year',
    appliedDate: '2026-07-15',
    jobUrl: 'https://example.com/jobs/sanrio-designer',
    notes: '[Sample] Second round interview scheduled. Prepared portfolio with 3D print samples and character color palettes.',
    contactName: 'Hana Tanaka (Design Lead)',
    contactEmail: 'hana@example.com'
  },
  {
    id: 'guest-job-2',
    companyName: 'Crafty Labs Inc.',
    roleTitle: '3D Modeling & Production Specialist',
    status: 'Applied' as const,
    location: 'San Francisco, CA',
    salary: '$80,000 / year',
    appliedDate: '2026-07-22',
    jobUrl: 'https://example.com/jobs/crafty-3d',
    notes: '[Sample] Submitted resume and link to personal 3D printing catalog.',
    contactName: 'Recruiting Team',
    contactEmail: 'jobs@craftylabs.example'
  }
];

// 6. MONTHLY VIEW / CALENDAR & WORK SHIFTS
const currentYearMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-08"

export const GUEST_SAMPLE_SHIFTS = [
  {
    id: 'guest-shift-1',
    date: `${currentYearMonth}-05`,
    startTime: '09:00',
    endTime: '17:00',
    title: '[Sample] Studio Crafting Shift',
    notes: 'Prepare vinyl cuts and resin molds for upcoming craft pop-up booth.'
  },
  {
    id: 'guest-shift-2',
    date: `${currentYearMonth}-12`,
    startTime: '10:00',
    endTime: '16:00',
    title: '[Sample] 3D Print Batch Maintenance',
    notes: 'Nozzle replacement and bed leveling check for printer #2.'
  },
  {
    id: 'guest-shift-3',
    date: `${currentYearMonth}-20`,
    startTime: '11:00',
    endTime: '18:00',
    title: '[Sample] Convention Prep & Packing',
    notes: 'Pack keychain inventory, price tags, and banner displays.'
  }
];

// 7. NOTES
export const GUEST_SAMPLE_NOTES = [
  {
    id: 'guest-note-1',
    title: '[Sample] Resins & Silicone Supplies Checklist',
    content: `1. Fast-cure UV Resin (Clear Gloss) - 500g
2. Platinum Silicone Mold Rubber (1:1 Ratio)
3. Pastel Mica Powder Set (Pink, Sky Blue, Lavender, Buttercup)
4. Fine Holographic Sequins & Mini Stars
5. Stainless Steel Jump Rings (8mm)`,
    category: 'Supplies',
    color: '#FFD1DC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'guest-note-2',
    title: '[Sample] Craft Booth Setup Layout Ideas',
    content: `- Tiered pastel acrylic displays for keychains
- Framed Character Wiki color swatch reference sheets
- Signage: "Handmade Kawaii Stationery & 3D Prints"
- QR code card linking to shop catalog`,
    category: 'Events',
    color: '#BDE0FE',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  }
];

// 8. BLOG POSTS
export const GUEST_SAMPLE_BLOG_POSTS = [
  {
    id: 'guest-post-1',
    title: '[Sample] Guide to Bubble-Free Resin Shaker Keychains',
    slug: 'guide-bubble-free-resin-shakers',
    excerpt: 'Learn my step-by-step method for degassing UV resin and sealing shaker charms without leaks.',
    content: `Creating bubble-free shaker keychains requires patience and proper technique. Here are three key steps:

1. Warm Your Resin Bottle: Place your unopened resin bottle in warm water for 5 minutes to loosen viscosity.
2. Use a Slow Torch or Heat Gun: Pass heat gently over poured resin to pop surface micro-bubbles before curing under UV light.
3. UV Curing Layers: Cure in thin 2mm passes for 60 seconds each side to ensure crystal clear clarity.`,
    coverImage: getPastelImage('Resin Craft Tutorial Cover', '#D8B4F8', 800, 450),
    tags: ['Resin', 'Tutorial', 'Keychains'],
    publishedAt: new Date().toISOString(),
    isPublished: true
  },
  {
    id: 'guest-post-2',
    title: '[Sample] Setting Up a Pastel Craft Workspace',
    slug: 'pastel-craft-workspace-setup',
    excerpt: 'How I organized my desktop layout for maximum productivity, 3D printing, and resin crafting.',
    content: `A clean workspace keeps creative energy flowing! I divided my desk into three dedicated zones:

- Zone A (Digital & Planning): Monitor, daily log notepad, and tablet.
- Zone B (3D Printing Station): Enclosed printer with ventilation.
- Zone C (Assembly & Packaging): Pastel organizer bins for hardware and charms.`,
    coverImage: getPastelImage('Pastel Desk Setup Banner', '#C1E1C1', 800, 450),
    tags: ['Workspace', 'Organization', 'Pastel'],
    publishedAt: new Date(Date.now() - 172800000).toISOString(),
    isPublished: true
  }
];

// 9. STREAKS & MEDICATIONS
export const GUEST_SAMPLE_HABITS_STREAKS = [
  {
    id: 'guest-habit-1',
    name: 'Sketch Daily Design Idea',
    frequency: 'Daily',
    streak: 7,
    completedDates: [
      new Date().toISOString().split('T')[0],
      new Date(Date.now() - 86400000).toISOString().split('T')[0],
      new Date(Date.now() - 172800000).toISOString().split('T')[0],
      new Date(Date.now() - 259200000).toISOString().split('T')[0],
    ]
  },
  {
    id: 'guest-habit-2',
    name: 'Drink 2L Water',
    frequency: 'Daily',
    streak: 12,
    completedDates: [
      new Date().toISOString().split('T')[0],
      new Date(Date.now() - 86400000).toISOString().split('T')[0],
    ]
  }
];

export const GUEST_SAMPLE_MEDICATIONS = [
  {
    id: 'guest-med-1',
    name: '[Sample] Vitamin C & Multivitamin',
    dosage: '1 Tablet',
    frequency: 'Morning',
    time: '09:00',
    takenToday: true
  },
  {
    id: 'guest-med-2',
    name: '[Sample] Hydration Electrolytes',
    dosage: '1 Scoop in Water',
    frequency: 'Afternoon',
    time: '14:00',
    takenToday: false
  }
];

// 10. DAILY LOG
export const GUEST_SAMPLE_DAILY_LOG_TASKS = [
  {
    id: 'guest-dl-1',
    text: '[Sample] Sand and polish Cinnamoroll keychain edges',
    completed: false,
    category: 'Tasks',
    status: 'in-progress' as const,
    important: true,
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '15:30'
  },
  {
    id: 'guest-dl-2',
    text: '[Sample] Order pastel pink ribbon spool refills',
    completed: false,
    category: 'Errands',
    status: 'todo' as const,
    important: false
  },
  {
    id: 'guest-dl-3',
    text: '[Sample] Clean resin silicone mixing bowls',
    completed: true,
    category: 'Chores',
    status: 'done' as const,
    important: false,
    timeDoneDate: new Date().toISOString().split('T')[0],
    timeDoneTime: '11:15'
  },
  {
    id: 'guest-dl-4',
    text: '[Sample] Post craft tutorial update to blog',
    completed: false,
    category: 'Work',
    status: 'todo' as const,
    important: true
  }
];

// 11. MOOD TRACKER
export const GUEST_SAMPLE_MOODS = [
  {
    id: 'guest-mood-1',
    mood: 'Happy',
    rating: 5,
    note: '[Sample] Finished assembling the Cinnamoroll shaker keychain! Turned out super cute.',
    date: new Date().toISOString(),
    tags: ['Crafting', 'Creative', 'Productive']
  },
  {
    id: 'guest-mood-2',
    mood: 'Relaxed',
    rating: 4,
    note: '[Sample] Organized my desk drawers and sorted pastel beads by color.',
    date: new Date(Date.now() - 86400000).toISOString(),
    tags: ['Cozy', 'Organization']
  }
];

// 12. GOALS
export const GUEST_SAMPLE_GOALS = [
  {
    id: 'guest-goal-1',
    title: '[Sample] Launch Summer Pastel Keychain Collection',
    category: 'Craft Business',
    targetDate: `${currentYearMonth}-31`,
    progress: 75,
    status: 'In Progress' as const,
    description: 'Prepare 20 custom acrylic shaker keychains and 10 mini 3D printed chairs for online shop release.',
    subtasks: [
      { id: 'sub-1', text: 'Design 5 character color swatch palettes', completed: true },
      { id: 'sub-2', text: '3D print and finish miniature chair prototypes', completed: true },
      { id: 'sub-3', text: 'Assemble shaker keychains with quicksand oil', completed: true },
      { id: 'sub-4', text: 'Take product photos with pastel backgrounds', completed: false }
    ]
  },
  {
    id: 'guest-goal-2',
    title: '[Sample] Build 10 Character Wiki Entries',
    category: 'Character Wiki',
    targetDate: `${currentYearMonth}-15`,
    progress: 50,
    status: 'In Progress' as const,
    description: 'Document main colors, Romaji names, and design notes for top Sanrio and San-X characters.',
    subtasks: [
      { id: 'sub-5', text: 'Add Cinnamoroll with sampled palette', completed: true },
      { id: 'sub-6', text: 'Add Rilakkuma with honey color scheme', completed: true },
      { id: 'sub-7', text: 'Add Isabelle with Town Hall tags', completed: true }
    ]
  }
];
