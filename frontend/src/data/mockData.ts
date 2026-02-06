export interface Album {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  year: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  coverUrl: string;
}

export interface Concert {
  id: string;
  artist: string;
  venue: string;
  city: string;
  date: string;
  time: string;
  coverUrl: string;
  ticketUrl: string;
  /** Optional coordinates used to place pins on the map. */
  lat?: number;
  lng?: number;
}

export interface MerchItem {
  id: string;
  name: string;
  artist: string;
  price: number;
  imageUrl: string;
  category: 'apparel' | 'vinyl' | 'poster' | 'accessory';
}

export const albums: Album[] = [
  { id: '1', title: 'Midnight Hours', artist: 'Luna Nova', coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop', year: 2024 },
  { id: '2', title: 'Electric Dreams', artist: 'Voltage', coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop', year: 2023 },
  { id: '3', title: 'Urban Poetry', artist: 'Street Echo', coverUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400&h=400&fit=crop', year: 2024 },
  { id: '4', title: 'Neon Nights', artist: 'Synthwave Collective', coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop', year: 2023 },
  { id: '5', title: 'Silent Storm', artist: 'Aurora Borealis', coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop', year: 2024 },
  { id: '6', title: 'Digital Soul', artist: 'Cyber Phoenix', coverUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=400&fit=crop', year: 2023 },
  { id: '7', title: 'Echoes', artist: 'Phantom Wave', coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=400&fit=crop', year: 2024 },
  { id: '8', title: 'Infinite Loop', artist: 'Binary Dreams', coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&h=400&fit=crop', year: 2023 },
];

export const featuredPlaylists: Album[] = [
  { id: 'p1', title: 'Late Night Vibes', artist: 'Curated', coverUrl: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&h=400&fit=crop', year: 2024 },
  { id: 'p2', title: 'Focus Flow', artist: 'Curated', coverUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&h=400&fit=crop', year: 2024 },
  { id: 'p3', title: 'Energy Boost', artist: 'Curated', coverUrl: 'https://images.unsplash.com/photo-1574169208507-84376144848b?w=400&h=400&fit=crop', year: 2024 },
  { id: 'p4', title: 'Chill Beats', artist: 'Curated', coverUrl: 'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=400&h=400&fit=crop', year: 2024 },
];

export const currentTrack: Track = {
  id: 't1',
  title: 'Midnight Drive',
  artist: 'Luna Nova',
  album: 'Midnight Hours',
  duration: '3:45',
  coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
};

// NOTE: These are intentionally "fake" events for now (placeholders), but the
// venue coordinates are real so Mapbox pins land on actual locations.
export const concerts: Concert[] = [
  {
    id: 'c1',
    artist: 'Luna Nova',
    venue: 'Madison Square Garden',
    city: 'New York, NY',
    date: '2026-03-15',
    time: '8:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7505,
    lng: -73.9934,
  },
  {
    id: 'c2',
    artist: 'Voltage',
    venue: 'Barclays Center',
    city: 'Brooklyn, NY',
    date: '2026-03-22',
    time: '7:30 PM',
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.6826,
    lng: -73.9754,
  },
  {
    id: 'c3',
    artist: 'Street Echo',
    venue: 'Radio City Music Hall',
    city: 'New York, NY',
    date: '2026-03-28',
    time: '9:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7599,
    lng: -73.9799,
  },
  {
    id: 'c4',
    artist: 'Synthwave Collective',
    venue: 'Terminal 5',
    city: 'New York, NY',
    date: '2026-04-03',
    time: '7:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7692,
    lng: -73.9927,
  },
  {
    id: 'c5',
    artist: 'Aurora Borealis',
    venue: 'Irving Plaza',
    city: 'New York, NY',
    date: '2026-04-10',
    time: '8:30 PM',
    coverUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7349,
    lng: -73.9903,
  },
  {
    id: 'c6',
    artist: 'Cyber Phoenix',
    venue: 'Brooklyn Steel',
    city: 'Brooklyn, NY',
    date: '2026-04-18',
    time: '9:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7218,
    lng: -73.9576,
  },
  {
    id: 'c7',
    artist: 'Phantom Wave',
    venue: 'Bowery Ballroom',
    city: 'New York, NY',
    date: '2026-04-24',
    time: '8:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7204065,
    lng: -73.9933583,
  },
  {
    id: 'c8',
    artist: 'Binary Dreams',
    venue: 'Beacon Theatre',
    city: 'New York, NY',
    date: '2026-05-02',
    time: '7:30 PM',
    coverUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7803,
    lng: -73.9817,
  },

  {
    id: 'c9',
    artist: 'Indie Night',
    venue: "Baby's All Right",
    city: 'Brooklyn, NY',
    date: '2026-05-09',
    time: '8:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.70996,
    lng: -73.96342,
  },
  {
    id: 'c10',
    artist: 'Basement Sessions',
    venue: 'TV Eye',
    city: 'Ridgewood, NY',
    date: '2026-05-16',
    time: '9:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.6978544,
    lng: -73.9052185,
  },
  {
    id: 'c11',
    artist: 'Late Jazz',
    venue: 'Nublu 151',
    city: 'New York, NY',
    date: '2026-05-23',
    time: '10:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.725605,
    lng: -73.9779816,
  },
  {
    id: 'c12',
    artist: 'Downtown Pulse',
    venue: 'Night Club 101',
    city: 'New York, NY',
    date: '2026-05-30',
    time: '11:00 PM',
    coverUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.72578,
    lng: -73.983873,
  },
  {
    id: 'c13',
    artist: 'Neo Soul Collective',
    venue: 'Nublu 191',
    city: 'New York, NY',
    date: '2026-06-06',
    time: '8:30 PM',
    coverUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=400&fit=crop',
    ticketUrl: '#',
    lat: 40.7269,
    lng: -73.9772,
  },
];

export const merchItems: MerchItem[] = [
  { id: 'm1', name: 'Midnight Hours Tour Tee', artist: 'Luna Nova', price: 35, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop', category: 'apparel' },
  { id: 'm2', name: 'Electric Dreams Vinyl', artist: 'Voltage', price: 45, imageUrl: 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=400&h=400&fit=crop', category: 'vinyl' },
  { id: 'm3', name: 'Limited Edition Poster', artist: 'Street Echo', price: 25, imageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=400&h=400&fit=crop', category: 'poster' },
  { id: 'm4', name: 'Neon Hoodie', artist: 'Synthwave Collective', price: 65, imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=400&fit=crop', category: 'apparel' },
  { id: 'm5', name: 'Silent Storm Cap', artist: 'Aurora Borealis', price: 28, imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&h=400&fit=crop', category: 'accessory' },
  { id: 'm6', name: 'Digital Soul Vinyl Box Set', artist: 'Cyber Phoenix', price: 120, imageUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&h=400&fit=crop', category: 'vinyl' },
];
