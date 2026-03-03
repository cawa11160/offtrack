import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";

import Index from "./pages/Index";
import Concerts from "./pages/Concerts";
import Merchandise from "./pages/Merchandise";
import InteractiveWeb from "./pages/InteractiveWeb";
import Uploads from "./pages/Uploads";
import Liked from "./pages/Liked";
import NotFound from "./pages/NotFound";
import ReleasePage from "./pages/Release";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Account from "./pages/Account";
import Profile from "@/pages/Profile";
import Settings from "./pages/Settings";
import Recommendations from "./pages/Recommendations";
import PlaylistsPage from "./pages/PlaylistsPage";
import { SearchScreen } from "./pages/SearchScreen";
import Artist from "./pages/Artist";
import BrowseCategory from "./pages/BrowseCategory";
import ArtistLanding from "./pages/ArtistLanding";
import MusicianProfile from "./pages/MusicianProfile";
import ListenerAnalytics from "./pages/ListenerAnalytics";
import LyricAI from "./pages/LyricAI";
import TrackDetailPage from "./pages/TrackDetail";
import AdminSecurity from "./pages/AdminSecurity";

/* ✅ NEW FILTER PAGE IMPORT */
import ConcertFilters from "./pages/ConcertFilters";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Index />} />

            {/* CONCERTS */}
            <Route path="/concerts" element={<Concerts />} />

            {/* INTERACTIVE WEB */}
            <Route path="/web" element={<InteractiveWeb />} />

            {/* UPLOADS (full-song streaming MVP) */}
            <Route path="/uploads" element={<Uploads />} />

            {/* ✅ NEW: Filters page */}
            <Route path="/concerts/filters" element={<ConcertFilters />} />

            <Route path="/merch" element={<Merchandise />} />
            <Route path="/liked" element={<Liked />} />
            <Route path="/recent" element={<Index />} />

            <Route path="/release/:id" element={<ReleasePage />} />
            <Route path="/track/:id" element={<TrackDetailPage />} />

            <Route path="/login" element={<Login />} />
            <Route path="/signin" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/register" element={<SignUp />} />
            <Route path="/account" element={<Account />} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/security" element={<AdminSecurity />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/search/:topic" element={<BrowseCategory />} />
            <Route path="/lyric-ai" element={<LyricAI />} />
            <Route path="/artist" element={<ArtistLanding />} />
            <Route path="/artist/profile" element={<MusicianProfile />} />
            <Route path="/artist/analytics" element={<ListenerAnalytics />} />
            <Route path="/artist/:name" element={<Artist />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
