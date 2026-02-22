import { ArrowLeft, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type BrowseTile = {
  title: string;
};

const browseRows: BrowseTile[][] = [
  [
    { title: "New Music" },
    { title: "Hits" },
    { title: "For you" },
    { title: "Underground" },
    { title: "Local" },
  ],
  [
    { title: "Charts" },
    { title: "‘70s rock" },
    { title: "‘80s Pop" },
    { title: "Acoustic" },
    { title: "Unwind" },
  ],
  [
    { title: "Focus" },
    { title: "Romance" },
    { title: "Dance" },
    { title: "Party" },
    { title: "Winter" },
  ],
];

export function SearchScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-28">
      <section className="mx-auto w-full max-w-[1420px] px-6 pt-10 sm:px-10 lg:px-16 lg:pt-16">
        <div className="flex items-center gap-[5px]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-[10px] text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-7 w-7" />
          </button>
          <div className="grid h-[55px] w-[60px] place-items-center rounded-[10px] border border-black bg-white">
            <Music2 className="h-7 w-7 text-black" />
          </div>
        </div>

        <h1 className="mt-12 font-['Arimo',sans-serif] text-[60px] font-bold leading-none text-black">Browse</h1>

        <div className="mt-8 space-y-8">
          {browseRows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-[31px]">
              {row.map((tile) => (
                <button
                  key={tile.title}
                  type="button"
                  className="h-[163px] rounded-[10px] bg-[#d9d9d9] px-6 font-['Arimo',sans-serif] text-[24px] font-bold leading-none text-black"
                >
                  {tile.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
