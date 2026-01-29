import React from "react";

export type CircularSidebarProps = {
  open?: boolean;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
};

export function CircularSidebar({
  open = true,
  onClose,
  className = "",
  children,
}: CircularSidebarProps) {
  // Minimal, safe placeholder implementation.
  // You can style/replace later without breaking imports.
  if (!open) return null;

  return (
    <aside
      className={`min-h-screen w-72 border-r border-gray-200 bg-white ${className}`}
      aria-label="Sidebar"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="font-semibold">Offtrack</div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="p-4">{children ?? <div className="text-sm text-gray-500">Sidebar</div>}</div>
    </aside>
  );
}
