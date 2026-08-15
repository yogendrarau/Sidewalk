import { Radar, MessageSquare, GraduationCap, BellRing } from "lucide-react";
import { SEED_ASSETS } from "@/lib/sidewalk";
import { Image } from "@/components/ui/image";

const CONCEPT_TAG = "ROADMAP CONCEPT";

const CARDS = [
  {
    id: "letter_reader",
    title: "Universal Letter Reader",
    desc: "Photograph any official letter and get a plain-language summary with every date, amount, and instruction highlighted for comparison against the original.",
    image: SEED_ASSETS.letter_reader_image_url,
  },
  {
    id: "draft_packet",
    title: "Draft Application Packet",
    desc: "Assemble a local draft permit packet from the vendor's answers, stamped DEMO — NOT FILED for the vendor to review before choosing an official next step.",
    image: SEED_ASSETS.draft_packet_image_url,
  },
  {
    id: "scam_radar",
    title: "Scam Radar & Broker Check",
    desc: "Risk signals for brokers and businesses in fictional neighborhoods — never labels a person or business fraudulent.",
    icon: Radar,
  },
  {
    id: "messaging",
    title: "WhatsApp / SMS Access",
    desc: "Reach vendors on the channels they already use, with reminders and two-way answers in their language.",
    icon: MessageSquare,
  },
  {
    id: "courses",
    title: "Multilingual Course Prep",
    desc: "Guided preparation for food-safety and licensing courses, with reminders before exam day.",
    icon: GraduationCap,
  },
  {
    id: "outreach",
    title: "Optional Human Review Queue",
    desc: "A consent-based escalation queue for unusual or high-consequence questions. Nothing is sent or filed automatically.",
    icon: BellRing,
  },
];

export default function RoadmapPanel() {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-stone-900 tracking-tight">What comes next</h2>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Noninteractive previews</span>
      </div>
      <p className="text-sm text-stone-500 mb-5 max-w-2xl">
        Polished previews of the broader SIDEWALK vision. None of these are working integrations yet.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div
            key={c.id}
            className="group relative rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm"
          >
            <div className="absolute top-3 left-3 z-10">
              <span className="inline-flex items-center rounded-full bg-stone-900/85 text-stone-100 text-[9px] font-bold uppercase tracking-widest px-2 py-1">
                {CONCEPT_TAG}
              </span>
            </div>
            {c.image ? (
              <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
                <Image
                  src={c.image}
                  alt={c.title}
                  className="w-full h-full"
                  fittingType="fill"
                />
              </div>
            ) : (
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center">
                {c.icon && <c.icon className="h-12 w-12 text-amber-600/70" strokeWidth={1.25} />}
              </div>
            )}
            <div className="p-4">
              <h3 className="font-semibold text-stone-900 text-sm mb-1">{c.title}</h3>
              <p className="text-xs text-stone-500 leading-relaxed">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
