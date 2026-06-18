import { type SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Frame = ({ size = 48, children, ...props }: IconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="size-8 sm:size-10 md:size-12"
    {...props}
  >
    {children}
  </svg>
);

export const GithubFinderIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Outer orbit ring */}
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1" opacity="0.15" strokeDasharray="3 3" />
    {/* Central node glow */}
    <circle cx="24" cy="24" r="4.5" fill="currentColor" opacity="0.08" />
    <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.6" />
    {/* Orbit path */}
    <path d="M24 8C20 8 14 12 14 18C14 24 18 28 24 32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <path d="M24 40C30 40 36 34 36 26C36 20 32 16 28 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    {/* Satellite nodes */}
    <circle cx="14" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <circle cx="14" cy="18" r="1" fill="currentColor" opacity="0.3" />
    <circle cx="36" cy="26" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
    <circle cx="36" cy="26" r="1" fill="currentColor" opacity="0.15" />
    {/* Fork branch lines */}
    <path d="M14 18L8 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.25" />
    <path d="M36 26L42 22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
    <circle cx="8" cy="14" r="1.5" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    <circle cx="42" cy="22" r="1.5" stroke="currentColor" strokeWidth="1" opacity="0.2" />
  </Frame>
);

export const ExpenseTrackerIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Coin circle */}
    <circle cx="24" cy="25" r="17" stroke="currentColor" strokeWidth="1" opacity="0.12" />
    <circle cx="24" cy="25" r="14" stroke="currentColor" strokeWidth="1" opacity="0.08" />
    {/* Bar chart bars */}
    <rect x="11" y="22" width="4" height="12" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="17" y="17" width="4" height="17" rx="1" fill="currentColor" opacity="0.35" />
    <rect x="23" y="12" width="4" height="22" rx="1" fill="currentColor" opacity="0.65" />
    <rect x="29" y="20" width="4" height="14" rx="1" fill="currentColor" opacity="0.25" />
    <rect x="35" y="15" width="4" height="19" rx="1" fill="currentColor" opacity="0.4" />
    {/* Rising trend line */}
    <path d="M11 33L17 29L23 28L29 30L35 26" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    {/* Dollar sign accent */}
    <text x="38" y="14" fontSize="7" fontWeight="bold" fill="currentColor" opacity="0.3" fontFamily="monospace">$</text>
  </Frame>
);

export const NoSqlClientIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Outer curve */}
    <path d="M10 16C10 12 14 9 24 9C34 9 38 12 38 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2" />
    {/* Document body */}
    <path d="M10 16V36C10 39 14 41 24 41C34 41 38 39 38 36V16" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    {/* Nested document structure */}
    <rect x="16" y="17" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    <rect x="16" y="24" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    <rect x="16" y="30" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
    {/* Curly brace accent */}
    <path d="M34 14L36 15.5L34 17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.15" />
    {/* JSON dots */}
    <circle cx="14" cy="20" r="1" fill="currentColor" opacity="0.3" />
    <circle cx="14" cy="26" r="1" fill="currentColor" opacity="0.2" />
    <circle cx="14" cy="32" r="1" fill="currentColor" opacity="0.15" />
  </Frame>
);

export const SqlClientIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Database cylinder body */}
    <path d="M10 14C10 11 16 8 24 8C32 8 38 11 38 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.15" />
    <path d="M10 14V34C10 37 16 40 24 40C32 40 38 37 38 34V14" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    {/* Cylinder bottom curve */}
    <path d="M10 34C10 37 16 40 24 40C32 40 38 37 38 34" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2" />
    {/* Horizontal table lines */}
    <line x1="14" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    <line x1="14" y1="25" x2="34" y2="25" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    <line x1="14" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
    {/* Vertical table separator lines */}
    <line x1="20" y1="20" x2="20" y2="35" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    <line x1="28" y1="20" x2="28" y2="35" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
    {/* SELECT accent */}
    <rect x="14" y="16" width="20" height="4" rx="0.5" fill="currentColor" opacity="0.08" />
    {/* Table header highlight */}
    <line x1="14" y1="19" x2="34" y2="19" stroke="currentColor" strokeWidth="1.5" opacity="0.15" />
  </Frame>
);

export const PostmanIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Network connection arcs */}
    <path d="M8 12C8 8 14 6 24 6C34 6 40 8 40 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.12" />
    <path d="M8 12V36C8 40 14 42 24 42C34 42 40 40 40 36V12" stroke="currentColor" strokeWidth="1" opacity="0.06" />
    {/* Central node */}
    <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
    <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.08" />
    {/* HTTP method badge */}
    <rect x="18" y="20" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    <text x="24" y="26.5" fontSize="6" fontWeight="bold" fill="currentColor" opacity="0.6" textAnchor="middle" fontFamily="monospace">GET</text>
    {/* Connection lines radiating out */}
    <path d="M14 18L8 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
    <path d="M34 18L40 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.15" />
    <path d="M14 30L8 34" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.15" />
    <path d="M34 30L40 34" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
    {/* Arrow heads */}
    <path d="M8 14L12 13.5L10 17Z" fill="currentColor" opacity="0.2" />
    <path d="M40 14L36 13.5L38 17Z" fill="currentColor" opacity="0.15" />
    {/* Request/response indicator dots */}
    <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3" />
    <circle cx="36" cy="12" r="1" fill="currentColor" opacity="0.2" />
  </Frame>
);

export const WritingAgentIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Pen nib */}
    <path d="M24 8L18 28L24 40L30 28L24 8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.5" />
    {/* Nib tip detail */}
    <path d="M24 34L22 28L24 8L26 28L24 34Z" fill="currentColor" opacity="0.06" />
    <circle cx="24" cy="28" r="1.5" fill="currentColor" opacity="0.3" />
    {/* Text lines flowing from nib */}
    <path d="M30 16C34 16 38 17 38 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
    <path d="M30 21C36 21 40 22.5 40 25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.15" />
    <path d="M30 26C33 26 35 27.5 35 30" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.1" />
    {/* Sparkle accents */}
    <circle cx="37" cy="14" r="1" fill="currentColor" opacity="0.3" />
    <circle cx="42" cy="20" r="0.8" fill="currentColor" opacity="0.2" />
    <circle cx="10" cy="22" r="1.2" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
    {/* Decorative dots */}
    <circle cx="16" cy="34" r="1" fill="currentColor" opacity="0.15" />
  </Frame>
);

export const KanbanBoardIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Board outline */}
    <rect x="6" y="8" width="36" height="32" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.15" />
    {/* Column dividers */}
    <line x1="20" y1="8" x2="20" y2="40" stroke="currentColor" strokeWidth="0.8" opacity="0.12" />
    <line x1="32" y1="8" x2="32" y2="40" stroke="currentColor" strokeWidth="0.8" opacity="0.12" />
    {/* Column headers */}
    <rect x="8" y="10" width="10" height="4" rx="0.5" fill="currentColor" opacity="0.1" />
    <rect x="22" y="10" width="8" height="4" rx="0.5" fill="currentColor" opacity="0.08" />
    <rect x="34" y="10" width="6" height="4" rx="0.5" fill="currentColor" opacity="0.06" />
    {/* Cards in column 1 */}
    <rect x="8" y="17" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
    <rect x="8" y="25" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    {/* Cards in column 2 */}
    <rect x="22" y="17" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    <rect x="22" y="24" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
    <rect x="22" y="33" width="8" height="3" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.1" />
    {/* Card in column 3 */}
    <rect x="34" y="17" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    {/* Card fill accents */}
    <rect x="9" y="18" width="8" height="4" rx="0.5" fill="currentColor" opacity="0.04" />
    <rect x="23" y="18" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.04" />
  </Frame>
);

export const CronTriggerIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Clock face */}
    <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    {/* Minute ticks */}
    <line x1="24" y1="9" x2="24" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    <line x1="24" y1="36" x2="24" y2="39" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    <line x1="9" y1="24" x2="12" y2="24" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    <line x1="36" y1="24" x2="39" y2="24" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    {/* Diagonal ticks */}
    <line x1="13.4" y1="13.4" x2="15.5" y2="15.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.2" />
    <line x1="34.6" y1="13.4" x2="32.5" y2="15.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.2" />
    <line x1="13.4" y1="34.6" x2="15.5" y2="32.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.2" />
    <line x1="34.6" y1="34.6" x2="32.5" y2="32.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.2" />
    {/* Hour hand (pointing to ~2) */}
    <line x1="24" y1="24" x2="30" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    {/* Minute hand (pointing to ~10) */}
    <line x1="24" y1="24" x2="14" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    {/* Center dot */}
    <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.5" />
    {/* Schedule / calendar ring accent */}
    <path d="M24 4C30 4 36 8 38 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.12" strokeDasharray="3 3" />
  </Frame>
);

export const ModuleTenIcon = (props: IconProps) => (
  <Frame {...props}>
    {/* Hexagon shape */}
    <path d="M24 6L40 15V33L24 42L8 33V15L24 6Z" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    {/* Inner hexagon */}
    <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" stroke="currentColor" strokeWidth="0.8" opacity="0.12" />
    {/* Gear/puzzle style circle */}
    <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.35" />
    <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.06" />
    {/* Dots at vertices */}
    <circle cx="24" cy="6" r="1.5" fill="currentColor" opacity="0.2" />
    <circle cx="40" cy="15" r="1.5" fill="currentColor" opacity="0.15" />
    <circle cx="40" cy="33" r="1.5" fill="currentColor" opacity="0.1" />
    <circle cx="24" cy="42" r="1.5" fill="currentColor" opacity="0.2" />
    <circle cx="8" cy="33" r="1.5" fill="currentColor" opacity="0.15" />
    <circle cx="8" cy="15" r="1.5" fill="currentColor" opacity="0.1" />
    {/* Plus sign center */}
    <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2" />
    <line x1="20" y1="24" x2="28" y2="24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2" />
  </Frame>
);

/** Maps app IDs to their icon components */
export const appIcons: Record<string, React.ComponentType<IconProps>> = {
  "github-issue-analyser": GithubFinderIcon,
  "expense-tracker": ExpenseTrackerIcon,
  "nosql-client": NoSqlClientIcon,
  subapp4: SqlClientIcon,
  postman: PostmanIcon,
  "writing-agent": WritingAgentIcon,
  subapp8: KanbanBoardIcon,
  "cron-scheduler": CronTriggerIcon,
  subapp10: ModuleTenIcon,
};
