"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "sunset";

type SiteData = {
  slug: string;
  siteName: string;
  tagline: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  primaryColor: string;
  theme: Theme;
  sections: string[];
  updatedAt: string;
};

const STORAGE_KEY = "site-builder-published-sites";

const themeStyles: Record<Theme, string> = {
  light: "bg-white text-slate-900",
  dark: "bg-slate-950 text-white",
  sunset: "bg-gradient-to-b from-orange-100 via-rose-100 to-purple-100 text-slate-900",
};

const defaultSections = [
  "About",
  "Services",
  "Testimonials",
  "Contact",
];

const initialData: SiteData = {
  slug: "my-awesome-site",
  siteName: "My Awesome Site",
  tagline: "Build once. Publish instantly.",
  description:
    "This is a beginner-friendly website builder demo built with Next.js. Customize content, preview your page, and publish it with one click.",
  ctaText: "Book a Call",
  ctaLink: "https://example.com",
  primaryColor: "#4f46e5",
  theme: "light",
  sections: defaultSections,
  updatedAt: new Date().toISOString(),
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function readSites(): Record<string, SiteData> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, SiteData>;
  } catch {
    return {};
  }
}

function saveSite(site: SiteData) {
  const sites = readSites();
  sites[site.slug] = site;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
}

function PublishedSiteView({ site }: { site: SiteData }) {
  return (
    <main className={`min-h-screen ${themeStyles[site.theme]}`}>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-60">
          Published Site
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{site.siteName}</h1>
        <p className="mt-3 text-lg opacity-85">{site.tagline}</p>

        <a
          href={site.ctaLink}
          className="mt-8 inline-block rounded-xl px-6 py-3 font-semibold text-white"
          style={{ backgroundColor: site.primaryColor }}
        >
          {site.ctaText}
        </a>

        <p className="mt-10 leading-7 opacity-90">{site.description}</p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {site.sections.map((section) => (
            <section key={section} className="rounded-xl border border-black/10 bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-900/40">
              <h2 className="text-xl font-semibold">{section}</h2>
              <p className="mt-2 text-sm opacity-75">
                Add your custom content for the {section.toLowerCase()} section.
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}


function getInitialBuilderState() {
  if (typeof window === "undefined") {
    return { siteData: initialData, publishedSite: null as SiteData | null };
  }

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("site");

  if (slug) {
    const site = readSites()[slug];
    if (site) {
      return { siteData: site, publishedSite: site };
    }
  }

  const draft = localStorage.getItem("site-builder-draft");
  if (draft) {
    try {
      return { siteData: JSON.parse(draft) as SiteData, publishedSite: null as SiteData | null };
    } catch {
      return { siteData: initialData, publishedSite: null as SiteData | null };
    }
  }

  return { siteData: initialData, publishedSite: null as SiteData | null };
}

export default function Home() {
  const initialState = useMemo(() => getInitialBuilderState(), []);
  const [siteData, setSiteData] = useState<SiteData>(initialState.siteData);
  const [newSection, setNewSection] = useState("");
  const [publishMessage, setPublishMessage] = useState("");
  const [publishedSite] = useState<SiteData | null>(initialState.publishedSite);

  useEffect(() => {
    if (!publishedSite) {
      localStorage.setItem("site-builder-draft", JSON.stringify(siteData));
    }
  }, [siteData, publishedSite]);

  const previewStyle = useMemo(
    () => ({ borderColor: siteData.primaryColor }),
    [siteData.primaryColor]
  );

  if (publishedSite) {
    return <PublishedSiteView site={publishedSite} />;
  }

  const addSection = (event: FormEvent) => {
    event.preventDefault();
    const section = newSection.trim();
    if (!section) return;
    if (siteData.sections.includes(section)) return;

    setSiteData((prev) => ({ ...prev, sections: [...prev.sections, section] }));
    setNewSection("");
  };

  const removeSection = (sectionToRemove: string) => {
    setSiteData((prev) => ({
      ...prev,
      sections: prev.sections.filter((section) => section !== sectionToRemove),
    }));
  };

  const publishSite = () => {
    const slug = toSlug(siteData.slug || siteData.siteName);

    if (!slug) {
      setPublishMessage("Please enter a valid site name/slug before publishing.");
      return;
    }

    const siteToPublish: SiteData = {
      ...siteData,
      slug,
      updatedAt: new Date().toISOString(),
    };

    saveSite(siteToPublish);
    setSiteData(siteToPublish);

    const publishUrl = `${window.location.origin}?site=${slug}`;
    setPublishMessage(`Published! Open: ${publishUrl}`);
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold">Website Builder + Publish</h1>
          <p className="mt-2 text-sm text-slate-600">
            Build your website, preview it live, and publish it with a shareable link.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Site name
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.siteName}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, siteName: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm">
              Slug
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.slug}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, slug: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              Tagline
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.tagline}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, tagline: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              Description
              <textarea
                className="min-h-28 rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.description}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm">
              CTA text
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.ctaText}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, ctaText: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm">
              CTA link
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.ctaLink}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, ctaLink: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm">
              Primary color
              <input
                type="color"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-2"
                value={siteData.primaryColor}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, primaryColor: e.target.value }))
                }
              />
            </label>

            <label className="grid gap-2 text-sm">
              Theme
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={siteData.theme}
                onChange={(e) =>
                  setSiteData((prev) => ({ ...prev, theme: e.target.value as Theme }))
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="sunset">Sunset</option>
              </select>
            </label>
          </div>

          <form onSubmit={addSection} className="mt-6 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Add section (e.g. Pricing)"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Add
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {siteData.sections.map((section) => (
              <button
                key={section}
                onClick={() => removeSection(section)}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm"
                title="Remove section"
              >
                {section} ×
              </button>
            ))}
          </div>

          <button
            onClick={publishSite}
            className="mt-6 rounded-xl px-5 py-3 font-semibold text-white"
            style={{ backgroundColor: siteData.primaryColor }}
          >
            Publish website
          </button>

          {publishMessage && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              {publishMessage}
            </p>
          )}
        </section>

        <section className={`rounded-2xl border-2 p-6 shadow-sm ${themeStyles[siteData.theme]}`} style={previewStyle}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
            Live Preview
          </p>
          <h2 className="mt-2 text-3xl font-bold">{siteData.siteName}</h2>
          <p className="mt-2 opacity-90">{siteData.tagline}</p>

          <a
            href={siteData.ctaLink}
            className="mt-6 inline-block rounded-lg px-4 py-2 font-semibold text-white"
            style={{ backgroundColor: siteData.primaryColor }}
          >
            {siteData.ctaText}
          </a>

          <p className="mt-6 text-sm leading-7 opacity-85">{siteData.description}</p>

          <div className="mt-6 grid gap-3">
            {siteData.sections.map((section) => (
              <div key={section} className="rounded-lg border border-black/10 bg-white/40 p-3 dark:bg-slate-900/50">
                <h3 className="font-semibold">{section}</h3>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
