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

export const concerts: Concert[] = [
  { id: 'c1', artist: 'Luna Nova', venue: 'Madison Square Garden', city: 'New York, NY', date: '2024-03-15', time: '8:00 PM', coverUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&h=400&fit=crop', ticketUrl: '#' },
  { id: 'c2', artist: 'Voltage', venue: 'The Forum', city: 'Los Angeles, CA', date: '2024-03-20', time: '7:30 PM', coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=400&fit=crop', ticketUrl: '#' },
  { id: 'c3', artist: 'Street Echo', venue: 'O2 Arena', city: 'London, UK', date: '2024-04-05', time: '9:00 PM', coverUrl: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&h=400&fit=crop', ticketUrl: '#' },
  { id: 'c4', artist: 'Synthwave Collective', venue: 'Red Rocks', city: 'Denver, CO', date: '2024-04-12', time: '7:00 PM', coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop', ticketUrl: '#' },
  { id: 'c5', artist: 'Aurora Borealis', venue: 'Coachella Stage', city: 'Indio, CA', date: '2024-04-20', time: '10:00 PM', coverUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop', ticketUrl: '#' },
  { id: 'c6', artist: 'Cyber Phoenix', venue: 'Berghain', city: 'Berlin, DE', date: '2024-05-01', time: '11:00 PM', coverUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=400&fit=crop', ticketUrl: '#' },
];

export const merchItems: MerchItem[] = [
  { id: 'm1', name: 'Midnight Hours Tour Tee', artist: 'Luna Nova', price: 35, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop', category: 'apparel' },
  { id: 'm2', name: 'Electric Dreams Vinyl', artist: 'Voltage', price: 45, imageUrl: 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=400&h=400&fit=crop', category: 'vinyl' },
  { id: 'm3', name: 'Limited Edition Poster', artist: 'Street Echo', price: 25, imageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=400&h=400&fit=crop', category: 'poster' },
  { id: 'm4', name: 'Neon Hoodie', artist: 'Synthwave Collective', price: 65, imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=400&fit=crop', category: 'apparel' },
  { id: 'm5', name: 'Silent Storm Cap', artist: 'Aurora Borealis', price: 28, imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&h=400&fit=crop', category: 'accessory' },
  { id: 'm6', name: 'Digital Soul Vinyl Box Set', artist: 'Cyber Phoenix', price: 120, imageUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&h=400&fit=crop', category: 'vinyl' },
];
