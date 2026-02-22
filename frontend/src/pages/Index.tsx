import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import {
  ArcSidebar,
  ARC_SIDEBAR_COLLAPSED_WIDTH,
  ARC_SIDEBAR_EXPANDED_WIDTH,
} from "@/components/ArcSidebar";

const userIcon = "https://www.figma.com/api/mcp/asset/2ef6cbe1-1aa2-4142-85c0-7036b9b3bd77";
const settingsIcon = "https://www.figma.com/api/mcp/asset/c1ec182c-cc4f-4440-85ef-6123e38e2bc7";
const arrowLeftIcon = "https://www.figma.com/api/mcp/asset/b68f48ee-9b13-488c-889c-d4ac2fcce873";
const arrowRightIcon = "https://www.figma.com/api/mcp/asset/41d22576-d9d1-40fe-830f-9daa91b753d5";
const ramonesCover = "https://www.figma.com/api/mcp/asset/8aab3b85-d16d-44c1-9e5e-55a69abbf652";
const wetlegCover = "https://www.figma.com/api/mcp/asset/3e15ef94-f257-4cc9-9e58-51ed682f1809";
const wallowsCover = "https://www.figma.com/api/mcp/asset/ec3e999f-b6f4-4d2c-b05b-20589c5c6c7e";

type Recommendation = {
  id: string;
  title: string;
  artist: string;
  cover: string;
};

const recommendations: Recommendation[] = [
  { id: "ramones", title: "The Ramones", artist: "Ramones", cover: ramonesCover },
  { id: "wetleg", title: "Moisturiser", artist: "Wetleg", cover: wetlegCover },
  { id: "wallows", title: "Models", artist: "The Wallows", cover: wallowsCover },
];

const Frame12Section = ({ sectionId }: { sectionId: string }) => (
  <div>
    <div className="mb-2 flex items-center justify-between">
      <h3 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Recommended for you</h3>
      <div className="flex items-center gap-[10px]">
        <img src={arrowLeftIcon} alt="Left" className="h-6 w-6" />
        <img src={arrowRightIcon} alt="Right" className="h-6 w-6" />
      </div>
    </div>

    <div className="rounded-[10px] bg-[#d0d0d0] px-[17px] pb-[6px] pt-[13px]">
      <div className="flex flex-wrap gap-8">
        {recommendations.map((item) => (
          <article key={`${item.id}-${sectionId}`} className="w-[157px]">
            <img src={item.cover} alt={`${item.title} cover`} className="h-[157px] w-[157px] object-cover" />
            <h4 className="mt-[14px] text-center font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
              {item.title}
            </h4>
            <p className="text-center font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
              {item.artist}
            </p>
          </article>
        ))}
      </div>
    </div>
  </div>
);

const Index = () => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const sidebarWidth = sidebarCollapsed ? ARC_SIDEBAR_COLLAPSED_WIDTH : ARC_SIDEBAR_EXPANDED_WIDTH;

  return (
    <div className="relative min-h-screen w-full bg-white">
      <ArcSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <section
        className="w-full bg-white px-3 py-5 pb-44 sm:px-7 sm:py-7 sm:pb-44"
        style={{ paddingLeft: `calc(${sidebarWidth}px + 4px)` }}
      >
        <div className="mx-auto flex w-full max-w-[1303px] flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="flex h-fit items-center gap-2">
            <div className="grid h-[55px] w-[60px] place-items-center rounded-[10px] border border-black bg-white">
              <Music2 className="h-7 w-7 text-black" />
            </div>
            <h1 className="font-['Arimo',sans-serif] text-[32px] font-bold leading-none text-black">Offtrack</h1>
          </div>

          <div className="w-full max-w-[1088px] flex-1">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-[54px] flex-1 rounded-[10px] bg-[#d0d0d0] px-4 py-[13px]">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter your search..."
                  className="h-full w-full bg-transparent font-['Arimo',sans-serif] text-[22px] font-bold leading-none text-black outline-none placeholder:text-black"
                />
              </div>

              <div className="flex h-[54px] w-[110px] items-center justify-center gap-2 rounded-[10px] bg-[#d0d0d0] px-4 py-[7px]">
                <button type="button" onClick={() => navigate("/profile")} aria-label="Go to profile">
                  <img src={userIcon} alt="User" className="h-8 w-8 object-contain" />
                </button>
                <button type="button" onClick={() => navigate("/settings")} aria-label="Go to settings">
                  <img src={settingsIcon} alt="Settings" className="h-8 w-8 object-contain" />
                </button>
              </div>
            </div>

            <div className="mb-8 rounded-[10px] bg-[#d0d0d0] px-[9px] py-8">
              <div className="max-w-[615px] font-['Arimo',sans-serif] font-bold text-black">
                <h2 className="text-[36px] leading-[1.1]">Welcome back Melissa,</h2>
                <p className="mt-1 text-[24px] leading-[1.15]">
                  A streaming experience built for discovering new voices, new scenes, and new sounds. Explore new
                  artists, scenes, and sounds before they break through.
                </p>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-[15px] lg:grid-cols-[564px_484px]">
              <div className="rounded-[10px] bg-[#d0d0d0] p-[10px]">
                <div className="font-['Arimo',sans-serif] text-black">
                  <p className="pt-2 text-[20px] font-bold leading-tight">Your daily usage pattern</p>
                  <p className="mt-2 text-[18px] font-bold leading-tight">On average, you have spent 1 hr on Offtrack</p>
                  <p className="text-[18px] font-bold leading-tight">You typically use Offtrack at night</p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#d0d0d0] px-[10px] py-[17px] font-['Arimo',sans-serif] font-bold text-black">
                <p className="text-[20px] leading-tight">Most streamed genres for you are currently...</p>
                <p className="text-[18px] leading-tight">Indie rock, Pop, Punk rock</p>
                <p className="mt-3 text-[20px] leading-tight">Most streamed musicians for you are currently...</p>
                <p className="text-[18px] leading-tight">Wet Leg, Ramones, The Wallows</p>
              </div>
            </div>

            <Frame12Section sectionId="frame12-1" />
            <div className="mt-8">
              <Frame12Section sectionId="frame12-2" />
            </div>
            <div className="mt-8">
              <Frame12Section sectionId="frame12-3" />
            </div>
            <div className="mt-8">
              <Frame12Section sectionId="frame12-4" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
