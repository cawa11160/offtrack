import { Home, Map, ShoppingBag, Heart, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Map, label: 'Concerts', path: '/concerts' },
  { icon: Heart, label: 'Library', path: '/liked' },
  { icon: ShoppingBag, label: 'Merch', path: '/merch' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export const MobileNav = () => {
  return (
    <nav className="fixed bottom-player left-0 right-0 lg:hidden bg-background/95 backdrop-blur-xl border-t border-border z-40">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-xs font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
