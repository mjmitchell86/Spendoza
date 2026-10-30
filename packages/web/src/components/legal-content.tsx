import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LegalBlock, LegalPage } from "@spendoza/shared";

const LINK_CLASS = "font-medium text-primary underline underline-offset-4";

// Inline markup is `[text](href)` and `**bold**` only.
const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const [, label, href, bold] = m;
    if (bold !== undefined) {
      nodes.push(<strong key={m.index}>{bold}</strong>);
    } else if (href.startsWith("/")) {
      nodes.push(
        <Link key={m.index} to={href} className={LINK_CLASS}>
          {label}
        </Link>,
      );
    } else {
      nodes.push(
        <a key={m.index} href={href} className={LINK_CLASS}>
          {label}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function Block({ block }: { block: LegalBlock }) {
  if ("p" in block) {
    return (
      <p>
        <Inline text={block.p} />
      </p>
    );
  }
  const items = "ol" in block ? block.ol : block.ul;
  const List = "ol" in block ? "ol" : "ul";
  return (
    <List>
      {items.map((item) => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </List>
  );
}

export function LegalContent({ page }: { page: LegalPage }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
        {page.intro.map((paragraph) => (
          <p key={paragraph} className="text-muted-foreground">
            <Inline text={paragraph} />
          </p>
        ))}
        {page.effective && (
          <p className="text-sm text-muted-foreground">Effective {page.effective}</p>
        )}
      </div>

      {page.sections.map((section) => (
        <section
          key={section.heading}
          className="flex flex-col gap-3 leading-7 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
        >
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </section>
      ))}

      <p className="border-t pt-6 text-sm text-muted-foreground">
        <Inline text={page.footer} />
      </p>
    </div>
  );
}
