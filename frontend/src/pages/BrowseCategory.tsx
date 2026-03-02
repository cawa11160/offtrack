import { ArrowLeft, ArrowLeftCircle, ArrowRightCircle, Music2 } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

type RecItem = {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
};

const recItems: RecItem[] = [
  {
    id: "ramones",
    title: "The Ramones",
    subtitle: "Ramones",
    coverUrl: "https://www.figma.com/api/mcp/asset/1e9b0d01-34db-4e0e-b5ca-1c1055e284b1",
  },
  {
    id: "wetleg",
    title: "Moisturiser",
    subtitle: "Wetleg",
    coverUrl: "https://www.figma.com/api/mcp/asset/736ac817-a790-4435-85ad-cd631cc1bf44",
  },
  {
    id: "wallows",
    title: "Models",
    subtitle: "The Wallows",
    coverUrl: "https://www.figma.com/api/mcp/asset/75f60188-49bf-4335-ab0e-0a412761d06f",
  },
];

export default function BrowseCategory() {
  const navigate = useNavigate();
  const { topic } = useParams<{ topic: string }>();

  const heading = useMemo(() => decodeURIComponent(topic ?? "Browse"), [topic]);

  const rowTitles = useMemo(() => [heading, "Unwind", "Unwind"], [heading]);

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

        <h1 className="mt-12 font-['Arimo',sans-serif] text-[60px] font-bold leading-none text-black">{heading}</h1>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {rowTitles.map((title, idx) => (
            <div
              key={`${title}-${idx}`}
              className="flex h-[180px] items-start rounded-[10px] bg-[#d9d9d9] px-4 py-4 font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black"
            >
              <span className="text-[36px]">{title}</span>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black">Recommended for you</h2>
            <div className="flex items-center gap-2 text-black/80">
              <ArrowLeftCircle className="h-6 w-6" />
              <ArrowRightCircle className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-3 rounded-[10px] bg-[#d9d9d9] px-4 py-3">
            <div className="flex flex-wrap gap-8">
              {recItems.map((item) => (
                <article key={item.id} className="w-[157px]">
                  <img src={item.coverUrl} alt={`${item.title} cover`} className="h-[157px] w-[157px] object-cover" />
                  <h3 className="mt-[14px] text-center font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
                    {item.title}
                  </h3>
                  <p className="text-center font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
                    {item.subtitle}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
