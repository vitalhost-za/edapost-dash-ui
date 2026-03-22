/**
 * CSS Inliner for HTML email templates.
 *
 * Extracts <style> blocks from HTML, parses rules, and applies them
 * as inline `style` attributes. This ensures maximum email client
 * compatibility (many strip <style> tags).
 */

interface CSSRule {
  selector: string;
  declarations: string;
  specificity: number;
}

function computeSpecificity(selector: string): number {
  const idCount = (selector.match(/#/g) || []).length;
  const classCount = (selector.match(/\./g) || []).length + (selector.match(/\[/g) || []).length;
  const elementCount = (selector.match(/(^|[\s>+~])[\w-]+/g) || []).length;
  return idCount * 100 + classCount * 10 + elementCount;
}

function extractStyles(html: string): { cleanHtml: string; rules: CSSRule[] } {
  const rules: CSSRule[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    const cssText = match[1];
    // Parse CSS rules (simple parser for email-friendly CSS)
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let ruleMatch;
    while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
      const selectorGroup = ruleMatch[1].trim();
      const declarations = ruleMatch[2].trim();
      // Handle comma-separated selectors
      for (const sel of selectorGroup.split(",")) {
        const selector = sel.trim();
        if (selector && !selector.startsWith("@")) {
          rules.push({
            selector,
            declarations,
            specificity: computeSpecificity(selector),
          });
        }
      }
    }
  }

  const cleanHtml = html.replace(styleRegex, "");
  return { cleanHtml, rules };
}

function matchesSimpleSelector(tagName: string, className: string, id: string, selector: string): boolean {
  const sel = selector.trim();

  // ID selector
  if (sel.startsWith("#")) {
    return id === sel.slice(1);
  }

  // Class selector
  if (sel.startsWith(".")) {
    const classes = className.split(/\s+/);
    return classes.includes(sel.slice(1));
  }

  // Tag selector
  if (/^[a-zA-Z][\w-]*$/.test(sel)) {
    return tagName.toLowerCase() === sel.toLowerCase();
  }

  // Tag + class (e.g., p.intro)
  const tagClassMatch = sel.match(/^([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)$/);
  if (tagClassMatch) {
    const classes = className.split(/\s+/);
    return tagName.toLowerCase() === tagClassMatch[1].toLowerCase() && classes.includes(tagClassMatch[2]);
  }

  // Tag + id
  const tagIdMatch = sel.match(/^([a-zA-Z][\w-]*)#([a-zA-Z][\w-]*)$/);
  if (tagIdMatch) {
    return tagName.toLowerCase() === tagIdMatch[1].toLowerCase() && id === tagIdMatch[2];
  }

  return false;
}

/**
 * Inlines CSS from <style> blocks into element style attributes.
 * Supports simple selectors: tag, .class, #id, tag.class, tag#id.
 * Preserves existing inline styles.
 */
export function inlineCSS(html: string): string {
  const { cleanHtml, rules } = extractStyles(html);

  if (rules.length === 0) return html; // Nothing to inline

  // Sort rules by specificity (lower first, so higher overrides)
  rules.sort((a, b) => a.specificity - b.specificity);

  // Process each element that might match a rule
  let result = cleanHtml;

  // Find all HTML elements with opening tags
  const tagRegex = /<([a-zA-Z][\w-]*)([^>]*)>/g;

  result = result.replace(tagRegex, (fullMatch, tagName: string, attrs: string) => {
    // Extract existing class, id, style
    const classMatch = attrs.match(/class\s*=\s*"([^"]*)"/i);
    const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);

    const className = classMatch ? classMatch[1] : "";
    const id = idMatch ? idMatch[1] : "";
    const existingStyle = styleMatch ? styleMatch[1] : "";

    // Collect matching declarations
    const matchingDeclarations: string[] = [];
    for (const rule of rules) {
      if (matchesSimpleSelector(tagName, className, id, rule.selector)) {
        matchingDeclarations.push(rule.declarations);
      }
    }

    if (matchingDeclarations.length === 0) return fullMatch;

    // Merge: CSS rules first, then existing inline style (higher priority)
    const inlined = matchingDeclarations.join("; ") + (existingStyle ? "; " + existingStyle : "");
    const cleanInlined = inlined.replace(/;\s*;/g, ";").replace(/;\s*$/, "");

    if (styleMatch) {
      const newAttrs = attrs.replace(/style\s*=\s*"[^"]*"/i, `style="${cleanInlined}"`);
      return `<${tagName}${newAttrs}>`;
    } else {
      return `<${tagName}${attrs} style="${cleanInlined}">`;
    }
  });

  return result;
}
