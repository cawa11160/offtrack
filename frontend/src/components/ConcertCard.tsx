import { Calendar, MapPin, Clock, ExternalLink } from 'lucide-react';
import type { Concert } from '@/data/mockData';
import { Button } from '@/components/ui/button';

interface ConcertCardProps {
  concert: Concert;
}

export const ConcertCard = ({ concert }: ConcertCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="group p-4 rounded-xl bg-card hover:bg-accent transition-all duration-300 border border-border">
      <div className="flex gap-4">
        <img
          src={concert.coverUrl}
          alt={concert.artist}
          className="w-24 h-24 md:w-32 md:h-32 rounded-lg object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg truncate">{concert.artist}</h3>
          <p className="text-muted-foreground text-sm truncate">{concert.venue}</p>
          
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{concert.city}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Calendar className="w-4 h-4 flex-shrink-0" />
              <span>{formatDate(concert.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>{concert.time}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4">
        <Button className="w-full" variant="default">
          <ExternalLink className="w-4 h-4 mr-2" />
          Get Tickets
        </Button>
      </div>
    </div>
  );
};
