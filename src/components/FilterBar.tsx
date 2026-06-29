import type { FilterState } from "../types/task";

interface FilterBarProps {
  filter: FilterState;
  onChange: (partial: Partial<FilterState>) => void;
  onClear: () => void;
}

export function FilterBar({ filter, onChange, onClear }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <label>
        Priority ≥
        <select
          value={filter.priorityMin ?? ""}
          onChange={(e) =>
            onChange({
              priorityMin: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
        >
          <option value="">Any</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label>
        Priority ≤
        <select
          value={filter.priorityMax ?? ""}
          onChange={(e) =>
            onChange({
              priorityMax: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
        >
          <option value="">Any</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label>
        Category
        <input
          type="text"
          value={filter.category}
          placeholder="contains…"
          onChange={(e) => onChange({ category: e.target.value })}
        />
      </label>

      <label>
        Done
        <select
          value={filter.done}
          onChange={(e) =>
            onChange({ done: e.target.value as FilterState["done"] })
          }
        >
          <option value="all">All</option>
          <option value="not_done">Not done</option>
          <option value="done">Done</option>
        </select>
      </label>

      <label>
        Title
        <input
          type="text"
          value={filter.titleContains}
          placeholder="contains…"
          onChange={(e) => onChange({ titleContains: e.target.value })}
        />
      </label>

      <label>
        Due after
        <input
          type="date"
          value={filter.dueAfter ?? ""}
          onChange={(e) =>
            onChange({ dueAfter: e.target.value || null })
          }
        />
      </label>

      <label>
        Due before
        <input
          type="date"
          value={filter.dueBefore ?? ""}
          onChange={(e) =>
            onChange({ dueBefore: e.target.value || null })
          }
        />
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={filter.showArchived}
          onChange={(e) => onChange({ showArchived: e.target.checked })}
        />
        Show archived
      </label>

      <button type="button" className="btn-secondary" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
