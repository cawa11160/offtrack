import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";

const Index = lazy(() => import("./pages/Index"));
const Concerts = lazy(() => import("./pages/Concerts"));
const Merchandise = lazy(() => import("./pages/Merchandise"));
const InteractiveWeb = lazy(() => import("./pages/InteractiveWeb"));
const Uploads = lazy(() => import("./pages/Uploads"));
const Liked = lazy(() => import("./pages/Liked"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ReleasePage = lazy(() => import("./pages/Release"));
const Login = lazy(() => import("./pages/Login"));
const SignUp = lazy(() => import("./pages/SignUp"));
const Account = lazy(() => import("./pages/Account"));
const Profile = lazy(() => import("@/pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Recommendations = lazy(() => import("./pages/Recommendations"));
const PlaylistsPage = lazy(() => import("./pages/PlaylistsPage"));
const SearchScreen = lazy(() => import("./pages/SearchScreen").then((mod) => ({ default: mod.SearchScreen })));
const Artist = lazy(() => import("./pages/Artist"));
const BrowseCategory = lazy(() => import("./pages/BrowseCategory"));
const ArtistLanding = lazy(() => import("./pages/ArtistLanding"));
const MusicianProfile = lazy(() => import("./pages/MusicianProfile"));
const ListenerAnalytics = lazy(() => import("./pages/ListenerAnalytics"));
const LyricAI = lazy(() => import("./pages/LyricAI"));
const TrackDetailPage = lazy(() => import("./pages/TrackDetail"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminRecommender = lazy(() => import("./pages/AdminRecommender"));
const ConcertFilters = lazy(() => import("./pages/ConcertFilters"));

function RouteFallback() {
  return (
    <div className="grid min-h-[calc(100vh-var(--player-height))] place-items-center bg-white px-4 text-black">
      <div className="w-full max-w-md">
        <div className="h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-black" />
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Layout>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/concerts" element={<Concerts />} />
              <Route path="/concerts/filters" element={<ConcertFilters />} />
              <Route path="/web" element={<InteractiveWeb />} />
              <Route path="/uploads" element={<Uploads />} />
              <Route path="/profile/uploads" element={<Uploads />} />
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
              <Route path="/admin/recommender" element={<AdminRecommender />} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/search/:topic" element={<BrowseCategory />} />
              <Route path="/lyric-ai" element={<LyricAI />} />
              <Route path="/artist" element={<ArtistLanding />} />
              <Route path="/artist/profile" element={<MusicianProfile />} />
              <Route path="/artist/analytics" element={<ListenerAnalytics />} />
              <Route path="/profile/dashboard" element={<ListenerAnalytics />} />
              <Route path="/artist/:name" element={<Artist />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
