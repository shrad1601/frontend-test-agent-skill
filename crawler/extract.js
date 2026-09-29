// crawler/extract.js
import { isSkippableLink } from "./utils.js";

/**
 * Extracts all Tier 1 facts from a loaded page via DOM inspection.
 * Pure observation - no clicking, no form submission.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} raw page facts
 */
export async function extractPageData(page) {
  const data = await page.evaluate(() => {
    function getLabelForInput(input) {
      // 1. <label for="id">
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.trim();
      }
      // 2. input wrapped inside a <label>
      const parentLabel = input.closest("label");
      if (parentLabel) return parentLabel.textContent.trim();
      // 3. aria-label
      if (input.getAttribute("aria-label")) {
        return input.getAttribute("aria-label").trim();
      }
      // 4. placeholder as fallback
      if (input.placeholder) return input.placeholder.trim();
      return null;
    }

    // ---- Links ----
    const links = [...document.querySelectorAll("a[href]")].map((a) => ({
      href: a.getAttribute("href"),
      text: a.textContent.trim().slice(0, 100)
    }));

    // ---- Forms ----
    const forms = [...document.querySelectorAll("form")].map((form, idx) => {
      const fields = [...form.querySelectorAll("input, select, textarea")]
        .filter((el) => el.type !== "hidden")
        .map((el) => ({
          name: el.name || el.id || null,
          label: getLabelForInput(el),
          type: el.tagName.toLowerCase() === "select"
            ? "select"
            : el.tagName.toLowerCase() === "textarea"
            ? "textarea"
            : el.type || "text",
          // Tier 1 validation hints - only catches native HTML attributes.
          // Note: many React apps validate in JS, which won't show up here.
          required: el.hasAttribute("required"),
          pattern: el.getAttribute("pattern") || null,
          min: el.getAttribute("min") || null,
          max: el.getAttribute("max") || null,
          maxLength: el.getAttribute("maxlength") || null
        }));

      const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
      );

      return {
        formIndex: idx,
        action: form.getAttribute("action") || null,
        method: (form.getAttribute("method") || "get").toUpperCase(),
        fields,
        submitButtonText: submitButton
          ? submitButton.textContent.trim() || submitButton.value || null
          : null
      };
    });

    // ---- Buttons (not inside forms - form submit buttons captured above) ----
    const buttons = [
      ...document.querySelectorAll("button, [role='button']")
    ]
      .filter((btn) => !btn.closest("form"))
      .map((btn) => ({
        text: btn.textContent.trim().slice(0, 100) || null,
        type: btn.getAttribute("type") || null,
        disabled: btn.disabled || false
      }))
      .filter((b) => b.text); // skip icon-only buttons with no text for now

    // ---- Tables ----
    const tables = [...document.querySelectorAll("table")].map((table, idx) => {
      const headerCells = table.querySelectorAll("thead th, thead td");
      let columns = [...headerCells].map((c) => c.textContent.trim());

      // Fallback: some tables don't use <thead>, take first row
      if (columns.length === 0) {
        const firstRow = table.querySelector("tr");
        if (firstRow) {
          columns = [...firstRow.querySelectorAll("th, td")].map((c) =>
            c.textContent.trim()
          );
        }
      }

      const rowCount = table.querySelectorAll("tbody tr").length ||
        Math.max(0, table.querySelectorAll("tr").length - 1);

      // Capture cell text for the first few data rows - useful for
      // generating realistic test data later. Capped to avoid huge files.
      const MAX_SAMPLE_ROWS = 5;
      const bodyRows = table.querySelectorAll("tbody tr").length
        ? [...table.querySelectorAll("tbody tr")]
        : [...table.querySelectorAll("tr")].slice(1); // skip header row if no <tbody>

      const sampleRows = bodyRows.slice(0, MAX_SAMPLE_ROWS).map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim())
      );

      return { tableIndex: idx, columns, rowCount, sampleRows };
    });

    return {
      title: document.title || null,
      h1: document.querySelector("h1")?.textContent.trim() || null,
      links,
      forms,
      buttons,
      tables
    };
  });

  // Filter out skippable links (mailto, anchors, javascript:) - done
  // outside page.evaluate since isSkippableLink is a shared JS function
  data.links = data.links.filter((l) => !isSkippableLink(l.href));

  return data;
}