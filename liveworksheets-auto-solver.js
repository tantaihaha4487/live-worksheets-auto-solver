(() => {
  const LOG_PREFIX = "[LiveWorksheets Solver]";
  const ROW_TOLERANCE = 10;

  function log(message, payload) {
    if (typeof payload === "undefined") {
      console.log(LOG_PREFIX, message);
      return;
    }

    console.log(LOG_PREFIX, message, payload);
  }

  function warn(message, payload) {
    if (typeof payload === "undefined") {
      console.warn(LOG_PREFIX, message);
      return;
    }

    console.warn(LOG_PREFIX, message, payload);
  }

  function fail(message) {
    throw new Error(message);
  }

  function getWorksheetPreview() {
    const preview = window.Worksheet?.elements?.find((element) => element?.parent?.data?.tempJSON)?.parent;

    if (!preview?.data?.tempJSON) {
      fail("Worksheet runtime not found. Open a LiveWorksheets page first.");
    }

    return preview;
  }

  function getPreviewRoot() {
    const root = document.querySelector("#worksheet-preview");

    if (!root) {
      fail("#worksheet-preview was not found.");
    }

    return root;
  }

  function toNumber(value) {
    const parsed = parseFloat(String(value ?? "0").replace("px", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).replace(/\s+/g, "").toLowerCase();
  }

  function normalizeOption(value) {
    return normalizeText(value).toLowerCase();
  }

  function sortByPosition(items) {
    return [...items].sort((leftItem, rightItem) => {
      if (Math.abs(leftItem.top - rightItem.top) > ROW_TOLERANCE) {
        return leftItem.top - rightItem.top;
      }

      return leftItem.left - rightItem.left;
    });
  }

  function getStyleRect(element) {
    return {
      top: toNumber(element.style.top || element.getAttribute("data-top")),
      left: toNumber(element.style.left || element.getAttribute("data-left")),
      width: toNumber(element.style.width),
      height: toNumber(element.style.height),
    };
  }

  function getEntryRect(entry) {
    return {
      top: toNumber(entry[1]),
      left: toNumber(entry[2]),
      height: toNumber(entry[3]),
      width: toNumber(entry[4]),
    };
  }

  function parseEntries(tempJSON) {
    return tempJSON.map((entry, index) => {
      const rawText = normalizeText(entry?.[0]);
      const compact = normalizeKey(rawText);
      const rect = getEntryRect(entry);
      const separatorIndex = compact.indexOf(":");
      const prefix = separatorIndex === -1 ? compact : compact.slice(0, separatorIndex);
      const suffix = separatorIndex === -1 ? "" : compact.slice(separatorIndex + 1);

      let type = prefix || "unknown";
      let answerKey = suffix;
      let dropdownAnswer = "";
      let dropdownIndex = 0;

      if (rawText.startsWith("choose:")) {
        type = "choose";
        const options = rawText.slice(7).split("/");
        const correctOptionIndex = options.findIndex((option) => normalizeText(option).startsWith("*"));
        const correctOption = correctOptionIndex === -1 ? "" : options[correctOptionIndex];
        dropdownAnswer = correctOption ? normalizeText(correctOption.replace(/^\*/, "")) : "";
        dropdownIndex = correctOptionIndex + 1;
        answerKey = normalizeOption(dropdownAnswer);
      }

      return {
        index,
        entry,
        rawText,
        compact,
        type,
        answerKey,
        dropdownAnswer,
        dropdownIndex,
        value: normalizeText(entry?.[5]),
        ...rect,
      };
    });
  }

  function inspectDom(root) {
    const collect = (selector) =>
      sortByPosition(
        Array.from(root.querySelectorAll(selector)).map((element) => ({
          element,
          ...getStyleRect(element),
        }))
      );

    const dropdowns = sortByPosition(
      Array.from(root.querySelectorAll("select")).map((element) => {
        const rect = element.getBoundingClientRect();

        return {
          element,
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
        };
      })
    );

    return {
      dropdowns,
      drags: collect(".worksheet-draggable-div"),
      drops: collect(".worksheet-drop-div"),
      joins: collect(".worksheet-join-div"),
      selects: collect(".worksheet-select-div"),
    };
  }

  function groupBy(items, getKey) {
    const grouped = new Map();

    for (const item of items) {
      const key = getKey(item);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(item);
    }

    return grouped;
  }

  function setEntryValue(preview, index, value) {
    preview.data.tempJSON[index][5] = value;
  }

  function persistWorksheet(preview) {
    localStorage.setItem("worksheetContent", JSON.stringify(preview.data.tempJSON));
  }

  function rerenderWorksheet(preview) {
    if (typeof preview.renderWorksheet === "function") {
      preview.renderWorksheet();
    }
  }

  function solveDropdowns(preview, entries, dom, summary) {
    const dropdownEntries = sortByPosition(entries.filter((entry) => entry.type === "choose" && entry.dropdownIndex > 0));

    if (!dropdownEntries.length) {
      return;
    }

    summary.detected.choose = dropdownEntries.length;

    if (!dom.dropdowns.length) {
      summary.warnings.push("Found choose fields in JSON but no <select> elements in the DOM.");
      summary.unsupported.push(...dropdownEntries.map((entry) => ({ type: "choose", index: entry.index, reason: "missing-dom" })));
      return;
    }

    const maxCount = Math.min(dropdownEntries.length, dom.dropdowns.length);

    for (let index = 0; index < maxCount; index += 1) {
      const entry = dropdownEntries[index];
      const select = dom.dropdowns[index].element;
      const targetOption = select.options[entry.dropdownIndex];

      if (!targetOption) {
        summary.failed.push({
          type: "choose",
          index: entry.index,
          reason: `option-index-missing:${entry.dropdownIndex}`,
        });
        continue;
      }

      select.selectedIndex = entry.dropdownIndex;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("input", { bubbles: true }));
      setEntryValue(preview, entry.index, entry.dropdownIndex);
      summary.solved.choose += 1;
    }

    if (dropdownEntries.length !== dom.dropdowns.length) {
      summary.warnings.push(`Choose mapping used ${maxCount}/${dropdownEntries.length} worksheet entries and ${dom.dropdowns.length} DOM selects.`);
    }
  }

  function solveDragDrop(preview, entries, summary) {
    const dragEntries = sortByPosition(entries.filter((entry) => entry.type === "drag" && entry.answerKey));
    const dropEntries = sortByPosition(entries.filter((entry) => entry.type === "drop" && entry.answerKey));

    if (!dragEntries.length && !dropEntries.length) {
      return;
    }

    summary.detected.drag = dragEntries.length;
    summary.detected.drop = dropEntries.length;

    const dropGroups = groupBy(dropEntries, (entry) => entry.answerKey);

    for (const dragEntry of dragEntries) {
      const matchingDrops = dropGroups.get(dragEntry.answerKey) || [];

      if (!matchingDrops.length) {
        summary.failed.push({ type: "drag", index: dragEntry.index, reason: `missing-drop:${dragEntry.answerKey}` });
        continue;
      }

      const dropEntry = matchingDrops.shift();
      setEntryValue(preview, dragEntry.index, `${dropEntry.top}@${dropEntry.left}`);
      summary.solved.drag += 1;
    }
  }

  function buildJoinLine(startEntry, endEntry) {
    const x1 = Math.round(startEntry.left + startEntry.width / 2);
    const y1 = Math.round(startEntry.top + startEntry.height / 2);
    const x2 = Math.round(endEntry.left + endEntry.width / 2);
    const y2 = Math.round(endEntry.top + endEntry.height / 2);

    return `<line x1="#X1#" y1="#Y1#" x2="#X2#" y2="#Y2#" stroke="darkblue" stroke-width="5"></line>`
      .replace("#X1#", String(x1))
      .replace("#Y1#", String(y1))
      .replace("#X2#", String(x2))
      .replace("#Y2#", String(y2))
      .replace(/"/g, "#");
  }

  function solveJoin(preview, entries, summary) {
    const joinEntries = sortByPosition(entries.filter((entry) => entry.type === "join" && entry.answerKey));

    if (!joinEntries.length) {
      return;
    }

    summary.detected.join = joinEntries.length;

    const joinGroups = groupBy(joinEntries, (entry) => entry.answerKey);

    for (const [answerKey, pairEntries] of joinGroups.entries()) {
      if (pairEntries.length !== 2) {
        summary.unsupported.push({ type: "join", answerKey, reason: `expected-2-found-${pairEntries.length}` });
        continue;
      }

      const [firstEntry, secondEntry] = sortByPosition(pairEntries);
      const line = buildJoinLine(firstEntry, secondEntry);

      setEntryValue(preview, firstEntry.index, line);
      setEntryValue(preview, secondEntry.index, line);
      preview.data.text[firstEntry.index] = String(secondEntry.index);
      preview.data.text[secondEntry.index] = String(firstEntry.index);
      summary.solved.join += 2;
    }
  }

  function solveSelect(preview, entries, summary) {
    const selectEntries = sortByPosition(entries.filter((entry) => entry.type === "select" && entry.answerKey));

    if (!selectEntries.length) {
      return;
    }

    summary.detected.select = selectEntries.length;

    for (const entry of selectEntries) {
      const value = entry.answerKey === "yes" ? "yes" : "no";
      setEntryValue(preview, entry.index, value);
      preview.data.clickedAnswer[entry.index] = value;
      summary.solved.select += 1;
    }
  }

  function collectUnsupported(entries, summary) {
    const supportedTypes = new Set(["choose", "drag", "drop", "join", "select", "https", "http", "unknown"]);
    const counts = new Map();

    for (const entry of entries) {
      if (supportedTypes.has(entry.type)) {
        continue;
      }

      counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
    }

    for (const [type, count] of counts.entries()) {
      summary.unsupported.push({ type, count, reason: "no-solver" });
    }
  }

  function resetKnownState(preview, entries) {
    for (const entry of entries) {
      if (entry.type === "drag" || entry.type === "join" || entry.type === "select") {
        setEntryValue(preview, entry.index, "");
      }
    }

    preview.data.text = Array(preview.data.tempJSON.length).fill("");
    preview.data.clickedAnswer = Array(preview.data.tempJSON.length).fill("");
  }

  function buildSummary() {
    return {
      detected: {
        choose: 0,
        drag: 0,
        drop: 0,
        join: 0,
        select: 0,
      },
      solved: {
        choose: 0,
        drag: 0,
        join: 0,
        select: 0,
      },
      failed: [],
      unsupported: [],
      warnings: [],
    };
  }

  function reportSummary(summary) {
    const solvedTotal = Object.values(summary.solved).reduce((sum, count) => sum + count, 0);

    log("Detected", summary.detected);
    log("Solved", summary.solved);

    if (summary.warnings.length) {
      warn("Warnings", summary.warnings);
    }

    if (summary.failed.length) {
      warn("Failed items", summary.failed);
    }

    if (summary.unsupported.length) {
      warn("Unsupported items", summary.unsupported);
    }

    if (solvedTotal === 0) {
      alert("Solver ran, but nothing was solved. Check the console report.");
      return;
    }

    alert(`Solved ${solvedTotal} items. Review the worksheet, then click Finish or Check my answers.`);
  }

  try {
    console.clear();
    log("Starting solver...");

    const preview = getWorksheetPreview();
    const root = getPreviewRoot();
    const entries = parseEntries(preview.data.tempJSON);
    const dom = inspectDom(root);
    const summary = buildSummary();

    resetKnownState(preview, entries);
    solveDropdowns(preview, entries, dom, summary);
    solveDragDrop(preview, entries, summary);
    solveJoin(preview, entries, summary);
    solveSelect(preview, entries, summary);
    collectUnsupported(entries, summary);
    persistWorksheet(preview);
    rerenderWorksheet(preview);
    persistWorksheet(preview);
    reportSummary(summary);
  } catch (error) {
    console.error(LOG_PREFIX, error);
    alert(error.message || String(error));
  }
})();
