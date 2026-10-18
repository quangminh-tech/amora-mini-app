import React, { useEffect, useRef, useState } from "react";
export function SelectAll({
  checked,
  mixed,
  disabled,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Chọn tất cả dòng trong trang"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
export function useSelection(limit = 50) {
  const [ids, setIds] = useState<string[]>([]);
  function toggle(id: string) {
    setIds((old) =>
      old.includes(id)
        ? old.filter((x) => x !== id)
        : old.length < limit
          ? [...old, id]
          : old,
    );
  }
  function page(current: string[]) {
    setIds((old) =>
      current.every((x) => old.includes(x))
        ? old.filter((x) => !current.includes(x))
        : Array.from(new Set([...old, ...current])).slice(0, limit),
    );
  }
  return { ids, toggle, page, clear: () => setIds([]) };
}
