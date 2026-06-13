import React from "react";
import { playBeep } from "../../lib/audio";
import { cn } from "../../lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onChange,
  className,
}) => {
  if (totalPages <= 1) return null;

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    playBeep("click");
    onChange(newPage);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 border-t border-white/5 select-none w-full",
        className
      )}
    >
      <span className="font-mono text-[13px] text-zinc-500 uppercase tracking-wider">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => handlePageChange(page - 1)}
          className="border border-white/10 px-2.5 py-1 text-[13px] uppercase font-mono tracking-widest text-zinc-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-white/10 cursor-pointer disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.95]"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => handlePageChange(page + 1)}
          className="border border-white/10 px-2.5 py-1 text-[13px] uppercase font-mono tracking-widest text-zinc-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-white/10 cursor-pointer disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.95]"
        >
          Next
        </button>
      </div>
    </div>
  );
};
