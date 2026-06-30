import { createTask } from "../types/task";
import type { Task } from "../types/task";

/**
 * Parse a single CSV line, respecting RFC 4180 quoting.
 * Handles fields wrapped in double-quotes that may contain commas,
 * newlines, and escaped double-quotes ("").
 *
 * Note: this is exported for unit-testing simple cases. For full CSV
 * documents (where quoted fields may span multiple lines) use
 * splitCsvRecords instead.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      // Trailing comma edge case — empty final field
      if (line.endsWith(",")) fields.push("");
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      if (line[i] === ",") i++; // skip comma separator
    } else {
      // Unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }

  return fields;
}

/**
 * Full RFC 4180 CSV tokenizer.
 *
 * Scans the entire CSV string character-by-character and emits complete
 * records (rows) as string arrays.  Quoted fields may span multiple lines
 * — embedded \r\n or \n inside a quoted field are preserved as-is.
 */
function splitCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let i = 0;

  while (i < csv.length) {
    if (csv[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = "";
      while (i < csv.length) {
        if (csv[i] === '"') {
          if (csv[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += csv[i];
          i++;
        }
      }
      currentRecord.push(field);
      // After a quoted field, next char is either ',' or record separator
      if (csv[i] === ",") {
        i++; // consume comma
      } else if (csv[i] === "\r" && csv[i + 1] === "\n") {
        records.push(currentRecord);
        currentRecord = [];
        i += 2;
      } else if (csv[i] === "\n") {
        records.push(currentRecord);
        currentRecord = [];
        i++;
      }
      // else: end of string — field will be pushed below when we exit
    } else {
      // Unquoted field — scan to next comma or record separator
      let field = "";
      while (i < csv.length && csv[i] !== "," && csv[i] !== "\n") {
        if (csv[i] === "\r" && csv[i + 1] === "\n") break;
        field += csv[i];
        i++;
      }
      currentRecord.push(field);
      if (csv[i] === ",") {
        i++; // consume comma; next iteration starts next field
      } else if (csv[i] === "\r" && csv[i + 1] === "\n") {
        records.push(currentRecord);
        currentRecord = [];
        i += 2;
      } else if (csv[i] === "\n") {
        records.push(currentRecord);
        currentRecord = [];
        i++;
      }
    }
  }

  // Flush any remaining record
  if (currentRecord.length > 0) {
    records.push(currentRecord);
  }

  return records;
}


const EXPECTED_HEADERS = [
  "Title",
  "Created",
  "Due",
  "Priority",
  "PercentDone",
  "TimeEstimateMinutes",
  "FileLink",
  "Category",
  "Notes",
  "Done",
  "Archived",
  "Depth",
  "ParentTitle",
] as const;

type HeaderKey = (typeof EXPECTED_HEADERS)[number];

export interface CsvImportResult {
  tasks: Task[];
  warnings: string[];
}

/**
 * Parse a CSV string (as produced by tasksToCsv) into an array of Tasks.
 *
 * Strategy for parent-child reconstruction:
 *   - The CSV encodes hierarchy via the "Depth" column and "ParentTitle".
 *   - We walk rows in order and maintain a stack of {depth, taskId} pairs to
 *     re-assign parentId correctly, exactly mirroring how the tree was
 *     flattened during export.
 *   - "ParentTitle" is used only as a fallback / validation hint; depth-stack
 *     is the primary mechanism so imports round-trip correctly.
 */
export function parseCsvToTasks(csv: string): CsvImportResult {
  const warnings: string[] = [];

  const records = splitCsvRecords(csv);
  if (records.length === 0) {
    return { tasks: [], warnings: ["CSV is empty."] };
  }

  // Parse header record
  const headerRow = records[0];
  const colIndex: Partial<Record<HeaderKey, number>> = {};
  for (const header of EXPECTED_HEADERS) {
    const idx = headerRow.findIndex(
      (h) => h.trim().toLowerCase() === header.toLowerCase(),
    );
    if (idx !== -1) colIndex[header] = idx;
  }

  if (colIndex["Title"] === undefined) {
    return {
      tasks: [],
      warnings: ['CSV is missing required "Title" column.'],
    };
  }

  const getField = (row: string[], key: HeaderKey): string => {
    const idx = colIndex[key];
    if (idx === undefined) return "";
    return row[idx] ?? "";
  };

  const tasks: Task[] = [];
  // Stack tracking depth → taskId for parent resolution
  const depthStack: Array<{ depth: number; id: string }> = [];

  for (let recIdx = 1; recIdx < records.length; recIdx++) {
    const row = records[recIdx];
    // Skip completely empty records (e.g. trailing newline)
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const title = getField(row, "Title");
    if (!title) {
      warnings.push(`Record ${recIdx + 1}: Skipped — empty title.`);
      continue;
    }

    // Parse depth
    const rawDepth = getField(row, "Depth");
    const depth = rawDepth !== "" ? parseInt(rawDepth, 10) : 0;
    const resolvedDepth = isNaN(depth) ? 0 : Math.max(0, depth);

    // Determine parentId by popping stack entries deeper than or equal to current depth
    while (
      depthStack.length > 0 &&
      depthStack[depthStack.length - 1].depth >= resolvedDepth
    ) {
      depthStack.pop();
    }
    const parentId =
      resolvedDepth > 0 && depthStack.length > 0
        ? depthStack[depthStack.length - 1].id
        : null;

    // Parse created date
    const rawCreated = getField(row, "Created");
    let createdAt = new Date().toISOString();
    if (rawCreated) {
      const parsed = new Date(rawCreated);
      if (!isNaN(parsed.getTime())) {
        // If date-only (YYYY-MM-DD), set to midnight UTC
        createdAt = rawCreated.includes("T")
          ? parsed.toISOString()
          : `${rawCreated}T00:00:00.000Z`;
      } else {
        warnings.push(
          `Record ${recIdx + 1}: Invalid "Created" date "${rawCreated}", using current time.`,
        );
      }
    }

    // Parse due date
    const rawDue = getField(row, "Due");
    let dueDate: string | null = null;
    if (rawDue) {
      const parsed = new Date(rawDue);
      if (!isNaN(parsed.getTime())) {
        dueDate = rawDue.includes("T") ? rawDue : `${rawDue}T00:00:00.000Z`;
      } else {
        warnings.push(
          `Record ${recIdx + 1}: Invalid "Due" date "${rawDue}", skipping.`,
        );
      }
    }

    // Parse priority (clamped 1–10, default 5)
    const rawPriority = getField(row, "Priority");
    let priority = 5;
    if (rawPriority !== "") {
      const p = parseInt(rawPriority, 10);
      if (!isNaN(p)) {
        priority = Math.min(10, Math.max(1, p));
      }
    }

    // Parse percentDone (clamped 0–100, default 0)
    const rawPct = getField(row, "PercentDone");
    let percentDone = 0;
    if (rawPct !== "") {
      const p = parseInt(rawPct, 10);
      if (!isNaN(p)) {
        percentDone = Math.min(100, Math.max(0, p));
      }
    }

    // Parse time estimate
    const rawTime = getField(row, "TimeEstimateMinutes");
    let timeEstimateMinutes: number | null = null;
    if (rawTime !== "") {
      const t = parseInt(rawTime, 10);
      if (!isNaN(t) && t >= 0) {
        timeEstimateMinutes = t;
      }
    }

    // Parse done / archived booleans
    const rawDone = getField(row, "Done").toLowerCase();
    const done = rawDone === "true" || rawDone === "1" || rawDone === "yes";

    const rawArchived = getField(row, "Archived").toLowerCase();
    const archived =
      rawArchived === "true" || rawArchived === "1" || rawArchived === "yes";

    const task = createTask({
      title,
      parentId,
      createdAt,
      dueDate,
      priority,
      percentDone,
      timeEstimateMinutes,
      fileLink: getField(row, "FileLink") || null,
      category: getField(row, "Category"),
      notes: getField(row, "Notes"),
      done,
      completedAt: done ? new Date().toISOString() : null,
      archived,
      order: tasks.filter((t) => t.parentId === parentId).length,
    });

    tasks.push(task);
    depthStack.push({ depth: resolvedDepth, id: task.id });
  }

  return { tasks, warnings };
}
