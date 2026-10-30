import support from "./content/support.json";
import privacy from "./content/privacy.json";

/**
 * Support and Privacy pages as data, shared by the web app and the iPhone app.
 * Inline markup is limited to Markdown `[text](href)` links and `**bold**`.
 */
export type LegalBlock = { p: string } | { ol: string[] } | { ul: string[] };

export interface LegalPage {
  title: string;
  intro: string[];
  effective?: string;
  sections: { heading: string; blocks: LegalBlock[] }[];
  footer: string;
}

export const SUPPORT_PAGE: LegalPage = support;
export const PRIVACY_PAGE: LegalPage = privacy;
