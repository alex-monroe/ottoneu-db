import Link from "next/link";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { loadReleaseNotes, type Block, type Inline } from "@/lib/release-notes";

export const metadata = {
  title: "Release Notes | SOFA DB",
  description: "What's new on the site, week by week",
};

// The notes are files in the repo, so a new week ships with the deploy that adds it.
export const dynamic = "force-static";

function InlineText({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((part, i) => {
        switch (part.kind) {
          case "bold":
            return <strong key={i} className="font-semibold text-ink">{part.text}</strong>;
          case "italic":
            return <em key={i}>{part.text}</em>;
          case "code":
            return (
              <code key={i} className="rounded bg-page px-1 py-0.5 font-mono text-[0.9em]">
                {part.text}
              </code>
            );
          case "link":
            return part.href.startsWith("/") ? (
              <Link key={i} href={part.href} className="text-accent hover:underline">
                {part.text}
              </Link>
            ) : (
              <a
                key={i}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {part.text}
              </a>
            );
          default:
            return <span key={i}>{part.text}</span>;
        }
      })}
    </>
  );
}

function NotesBlock({ block }: { block: Block }) {
  if (block.kind === "heading") {
    return block.level === 2 ? (
      <h3 className="pt-2 text-lg font-semibold text-ink">{block.text}</h3>
    ) : (
      <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        {block.text}
      </h4>
    );
  }
  if (block.kind === "list") {
    return (
      <ul className="list-disc space-y-2 pl-5 text-ink-muted">
        {block.items.map((item, i) => (
          <li key={i}>
            <InlineText content={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-ink-muted">
      <InlineText content={block.content} />
    </p>
  );
}

export default function ReleaseNotesPage() {
  const weeks = loadReleaseNotes();
  return (
    <PageShell width="narrow" gap="loose">
      <PageHeader
        title="Release Notes"
        description="What's new on the site, week by week. Numbers like #758 link to the change itself."
      />
      {weeks.length === 0 ? (
        <EmptyState title="No release notes yet" />
      ) : (
        weeks.map((week) => (
          <article
            key={week.date}
            id={week.date}
            className="space-y-4 rounded-xl border border-line bg-raised p-4 sm:p-6"
          >
            <h2 className="text-2xl font-bold tracking-tight text-ink">
              <a href={`#${week.date}`} className="hover:underline">
                {week.title}
              </a>
            </h2>
            {week.blocks.map((block, i) => (
              <NotesBlock key={i} block={block} />
            ))}
          </article>
        ))
      )}
    </PageShell>
  );
}
