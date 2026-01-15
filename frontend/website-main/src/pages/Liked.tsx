import { Heart, Play, Clock, MoreHorizontal } from 'lucide-react';
import { SectionHeader } from '@/components/SectionHeader';
import { albums } from '@/data/mockData';
import { Button } from '@/components/ui/button';

const likedSongs = [
  { id: '1', title: 'Midnight Drive', artist: 'Luna Nova', album: 'Midnight Hours', duration: '3:45', coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop' },
  { id: '2', title: 'Electric Heart', artist: 'Voltage', album: 'Electric Dreams', duration: '4:12', coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&h=100&fit=crop' },
  { id: '3', title: 'City Lights', artist: 'Street Echo', album: 'Urban Poetry', duration: '3:28', coverUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=100&h=100&fit=crop' },
  { id: '4', title: 'Neon Dreams', artist: 'Synthwave Collective', album: 'Neon Nights', duration: '5:02', coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop' },
  { id: '5', title: 'Aurora', artist: 'Aurora Borealis', album: 'Silent Storm', duration: '4:38', coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop' },
];

const Liked = () => {
  return (
    <div className="p-4 lg:p-8 space-y-8 animate-fade-in">
      {/* Header with gradient */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-accent p-6 md:p-10">
        <div className="flex items-end gap-6">
          <div className="w-40 h-40 md:w-56 md:h-56 rounded-xl bg-gradient-to-br from-primary/30 to-accent flex items-center justify-center shadow-2xl flex-shrink-0">
            <Heart className="w-20 h-20 md:w-28 md:h-28 text-primary fill-primary" />
          </div>
          <div className="pb-2">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Playlist</span>
            <h1 className="text-3xl md:text-5xl font-bold mt-2">Liked Songs</h1>
            <p className="text-muted-foreground mt-2">{likedSongs.length} songs</p>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button size="lg" className="rounded-full px-8">
          <Play className="w-5 h-5 mr-2" />
          Play All
        </Button>
        <button className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Songs List */}
      <section>
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[16px_4fr_3fr_1fr] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="text-right">
            <Clock className="w-4 h-4 inline" />
          </span>
        </div>

        {/* Songs */}
        <div className="divide-y divide-border">
          {likedSongs.map((song, index) => (
            <div 
              key={song.id}
              className="group grid grid-cols-[auto_1fr] md:grid-cols-[16px_4fr_3fr_1fr] gap-4 px-4 py-3 hover:bg-accent/50 rounded-lg transition-colors items-center"
            >
              <span className="hidden md:block text-sm text-muted-foreground group-hover:hidden">
                {index + 1}
              </span>
              <Play className="hidden md:block w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center gap-3">
                <img
                  src={song.coverUrl}
                  alt={song.title}
                  className="w-12 h-12 rounded object-cover"
                />
                <div className="min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                </div>
              </div>
              
              <span className="hidden md:block text-sm text-muted-foreground truncate">
                {song.album}
              </span>
              
              <span className="hidden md:block text-sm text-muted-foreground text-right">
                {song.duration}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Suggested Albums */}
      <section className="pt-8">
        <SectionHeader 
          title="You Might Also Like" 
          subtitle="Based on your liked songs"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.slice(0, 6).map((album) => (
            <div key={album.id} className="album-card">
              <img
                src={album.coverUrl}
                alt={album.title}
                className="w-full aspect-square object-cover rounded-lg mb-3"
              />
              <h3 className="font-semibold text-sm truncate">{album.title}</h3>
              <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Liked;
