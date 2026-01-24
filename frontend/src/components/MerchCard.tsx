import { ShoppingCart } from 'lucide-react';
import type { MerchItem } from '@/data/mockData';
import { Button } from '@/components/ui/button';

interface MerchCardProps {
  item: MerchItem;
}

export const MerchCard = ({ item }: MerchCardProps) => {
  const categoryLabels = {
    apparel: 'Apparel',
    vinyl: 'Vinyl',
    poster: 'Poster',
    accessory: 'Accessory',
  };

  return (
    <div className="group p-4 rounded-xl bg-card hover:bg-accent transition-all duration-300 border border-border hover-lift">
      <div className="relative mb-4 overflow-hidden rounded-lg">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 px-2.5 py-1 bg-secondary/90 backdrop-blur-sm rounded-full text-xs font-medium">
          {categoryLabels[item.category]}
        </span>
      </div>
      
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{item.artist}</p>
        <h3 className="font-semibold text-sm line-clamp-2">{item.name}</h3>
        <p className="text-lg font-bold">${item.price}</p>
      </div>
      
      <Button className="w-full mt-4" variant="secondary">
        <ShoppingCart className="w-4 h-4 mr-2" />
        Add to Cart
      </Button>
    </div>
  );
};
