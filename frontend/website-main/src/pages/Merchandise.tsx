import { useState } from 'react';
import { MerchCard } from '@/components/MerchCard';
import { SectionHeader } from '@/components/SectionHeader';
import { merchItems } from '@/data/mockData';
import { Filter, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

const categories = ['All', 'Apparel', 'Vinyl', 'Poster', 'Accessory'];

const Merchandise = () => {
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredItems = activeCategory === 'All' 
    ? merchItems 
    : merchItems.filter(item => 
        item.category.toLowerCase() === activeCategory.toLowerCase()
      );

  return (
    <div className="p-4 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Merchandise</h1>
          <p className="text-muted-foreground mt-2">
            Official merch from your favorite artists
          </p>
        </div>
        
        <Button variant="secondary">
          <ShoppingBag className="w-4 h-4 mr-2" />
          Cart (0)
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === category
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Featured Banner */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-secondary to-accent p-6 md:p-10">
        <div className="relative z-10 max-w-xl">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-sm font-medium mb-4">
            Limited Edition
          </span>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Exclusive Tour Merchandise
          </h2>
          <p className="text-muted-foreground mb-4">
            Get your hands on limited edition items before they're gone.
          </p>
          <Button>
            Shop Collection
          </Button>
        </div>
        <div className="absolute right-0 top-0 w-1/3 h-full opacity-30">
          <div className="absolute right-10 top-10 w-32 h-32 rounded-full bg-primary/20 blur-3xl" />
        </div>
      </section>

      {/* Products Grid */}
      <section>
        <SectionHeader 
          title={activeCategory === 'All' ? 'All Products' : activeCategory}
          subtitle={`${filteredItems.length} items available`}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <MerchCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Artist Merch Links */}
      <section>
        <SectionHeader title="Shop by Artist" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {['Luna Nova', 'Voltage', 'Street Echo', 'Synthwave Collective', 'Aurora Borealis', 'Cyber Phoenix'].map((artist) => (
            <div 
              key={artist} 
              className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-colors cursor-pointer text-center group"
            >
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold group-hover:scale-110 transition-transform">
                {artist.charAt(0)}
              </div>
              <p className="text-sm font-medium truncate">{artist}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Merchandise;
