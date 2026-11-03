import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export type Suggestion = {
  id: string;
  title: string;
  detail?: ReactNode;
  /** Optional group heading shown before the first item of each group. */
  group?: string;
  disabled?: boolean;
};

/**
 * Search field (ARIA combobox) that lists every match while typing.
 * Arrow keys move, Enter picks, Escape closes; a click also picks.
 */
export function SearchSuggest({
  label,
  value,
  onChange,
  suggestions,
  onPick,
  placeholder,
  hint,
  emptyText = 'Sin coincidencias.',
  clearOnPick = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly Suggestion[];
  onPick: (suggestion: Suggestion) => void;
  placeholder?: string;
  hint?: string;
  emptyText?: string;
  clearOnPick?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const showing = open && value.trim().length > 0;
  const current = Math.min(active, Math.max(0, suggestions.length - 1));

  // Keyboard moves keep the active option visible inside the list (not the page).
  function moveTo(index: number) {
    setActive(index);
    requestAnimationFrame(() => {
      const list = document.getElementById(listId);
      const option = document.getElementById(`${listId}-${index}`);
      if (!list || !option) return;
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
    });
  }

  function pick(suggestion: Suggestion | undefined) {
    if (!suggestion || suggestion.disabled) return;
    onPick(suggestion);
    setOpen(false);
    if (clearOnPick) onChange('');
  }

  return (
    <div className="field search-suggest">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && suggestions.length ? `${listId}-${current}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
          // The first match becomes active again, so show the top of the list.
          const list = document.getElementById(listId);
          if (list) list.scrollTop = 0;
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on an option registers before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            moveTo(Math.max(0, Math.min(current + 1, suggestions.length - 1)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveTo(Math.max(current - 1, 0));
          } else if (event.key === 'Enter' && showing && suggestions.length) {
            event.preventDefault();
            pick(suggestions[current]);
          } else if (event.key === 'Escape' && showing) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={`Sugerencias: ${label}`}
        className="search-suggest__list"
        hidden={!showing}
      >
        {suggestions.length ? (
          suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.group ?? ''}:${suggestion.id}`}
              role="presentation"
              className="search-suggest__item"
            >
              {suggestion.group && suggestion.group !== suggestions[index - 1]?.group ? (
                <span className="search-suggest__group" aria-hidden="true">
                  {suggestion.group}
                </span>
              ) : null}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === current}
                aria-disabled={suggestion.disabled || undefined}
                className="search-suggest__option"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(suggestion)}
              >
                <strong>{suggestion.title}</strong>
                {suggestion.detail ? <span className="dim">{suggestion.detail}</span> : null}
              </div>
            </li>
          ))
        ) : (
          <li role="presentation" className="search-suggest__empty dim">
            {emptyText}
          </li>
        )}
      </ul>
    </div>
  );
}
